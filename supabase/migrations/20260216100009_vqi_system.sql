-- ============================================================================
-- VQI (Video Quality Index) System
-- Per-view engagement depth adjusted for signal strength
-- ============================================================================

-- 1. Add VQI columns to video_performance (YouTube analytics)
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS youtube_shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_saves INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_rewatches INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vqi_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_score NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_adjusted_views NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_computed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.video_performance.vqi_score IS 'Video Quality Index: depth_score / niche_median. >1.0 = above market, <1.0 = below market.';
COMMENT ON COLUMN public.video_performance.vqi_depth_score IS 'Raw weighted engagement depth per view before normalization.';
COMMENT ON COLUMN public.video_performance.vqi_depth_adjusted_views IS 'views × VQI = depth-adjusted views (separates shallow from strong reach).';

-- 2. Add VQI columns to tracked_videos (TikTok analytics)
ALTER TABLE public.tracked_videos
  ADD COLUMN IF NOT EXISTS vqi_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_score NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_adjusted_views NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_computed_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Niche-level median tracking (updated weekly)
CREATE TABLE IF NOT EXISTS public.vqi_niche_medians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'all')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Median rates for the niche during this period
  median_like_rate NUMERIC(10,8) DEFAULT 0,
  median_comment_rate NUMERIC(10,8) DEFAULT 0,
  median_share_rate NUMERIC(10,8) DEFAULT 0,
  median_save_rate NUMERIC(10,8) DEFAULT 0,
  median_rewatch_rate NUMERIC(10,8) DEFAULT 0,
  
  -- Aggregated median depth score
  median_depth_score NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  
  -- Stats
  videos_sampled INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(niche, platform, period_start)
);

-- 4. Calibration history (self-learning weights via regression)
CREATE TABLE IF NOT EXISTS public.vqi_calibration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'all')),
  
  -- Previous weights (before calibration)
  previous_weights JSONB NOT NULL,
  
  -- New calibrated weights (from regression)
  calibrated_weights JSONB NOT NULL,
  
  -- Regression metadata
  r_squared NUMERIC(6,4) DEFAULT NULL,
  samples_used INTEGER DEFAULT 0,
  regression_method TEXT DEFAULT 'ols_linear',
  
  -- Whether these weights are currently active
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE public.vqi_niche_medians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vqi_calibration_history ENABLE ROW LEVEL SECURITY;

-- VQI niche medians: readable by everyone, writable by service role only
DROP POLICY IF EXISTS "VQI niche medians readable by all" ON public.vqi_niche_medians;
CREATE POLICY "VQI niche medians readable by all" 
  ON public.vqi_niche_medians FOR SELECT USING (true);

DROP POLICY IF EXISTS "VQI niche medians writable by service" ON public.vqi_niche_medians;
CREATE POLICY "VQI niche medians writable by service" 
  ON public.vqi_niche_medians FOR ALL 
  USING (auth.role() = 'service_role');

-- VQI calibration history: readable by all, writable by service role
DROP POLICY IF EXISTS "VQI calibration readable by all" ON public.vqi_calibration_history;
CREATE POLICY "VQI calibration readable by all"
  ON public.vqi_calibration_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "VQI calibration writable by service" ON public.vqi_calibration_history;
CREATE POLICY "VQI calibration writable by service"
  ON public.vqi_calibration_history FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_vqi_niche_medians_lookup 
  ON public.vqi_niche_medians(niche, platform, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_vqi_calibration_active 
  ON public.vqi_calibration_history(niche, platform, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_video_performance_vqi 
  ON public.video_performance(vqi_score) 
  WHERE vqi_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_videos_vqi 
  ON public.tracked_videos(vqi_score) 
  WHERE vqi_score IS NOT NULL;

-- 7. Triggers
DROP TRIGGER IF EXISTS update_vqi_niche_medians_updated_at ON public.vqi_niche_medians;
CREATE TRIGGER update_vqi_niche_medians_updated_at
  BEFORE UPDATE ON public.vqi_niche_medians
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Insert default weights into scoring_weights for 'minecraft' niche
-- (VQI-specific defaults if not already present)
INSERT INTO public.scoring_weights (niche, weights, thresholds)
VALUES (
  'minecraft',
  '{
    "like": 1.0,
    "comment": 2.0,
    "share": 3.0,
    "save": 4.0,
    "rewatch": 5.0
  }'::jsonb,
  '{
    "stage_0": 500,
    "stage_1": 2000,
    "stage_2": 10000,
    "stage_3": 50000,
    "stage_4": 250000
  }'::jsonb
)
ON CONFLICT (niche) DO NOTHING;

-- 9. Postgres function: Compute VQI for a single video (callable from Edge Functions)
CREATE OR REPLACE FUNCTION public.compute_vqi(
  p_views BIGINT,
  p_likes INTEGER,
  p_comments INTEGER,
  p_shares INTEGER,
  p_saves INTEGER,
  p_rewatches INTEGER,
  p_median_depth NUMERIC DEFAULT 1.0,
  p_weight_like NUMERIC DEFAULT 1.0,
  p_weight_comment NUMERIC DEFAULT 2.0,
  p_weight_share NUMERIC DEFAULT 3.0,
  p_weight_save NUMERIC DEFAULT 4.0,
  p_weight_rewatch NUMERIC DEFAULT 5.0
)
RETURNS TABLE(
  depth_score NUMERIC,
  vqi NUMERIC,
  depth_adjusted_views NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  safe_views BIGINT;
  like_rate NUMERIC;
  comment_rate NUMERIC;
  share_rate NUMERIC;
  save_rate NUMERIC;
  rewatch_rate NUMERIC;
  raw_depth NUMERIC;
  vqi_val NUMERIC;
  dav NUMERIC;
BEGIN
  -- Avoid division by zero
  safe_views := GREATEST(p_views, 1);
  
  -- Step 1: Convert to rates (view-scale invariant)
  like_rate    := p_likes::NUMERIC    / safe_views;
  comment_rate := p_comments::NUMERIC / safe_views;
  share_rate   := p_shares::NUMERIC   / safe_views;
  save_rate    := p_saves::NUMERIC    / safe_views;
  rewatch_rate := p_rewatches::NUMERIC / safe_views;
  
  -- Step 2: Compute raw depth score (weighted sum of rates)
  raw_depth := (p_weight_like    * like_rate) +
               (p_weight_comment * comment_rate) +
               (p_weight_share   * share_rate) +
               (p_weight_save    * save_rate) +
               (p_weight_rewatch * rewatch_rate);
  
  -- Step 3: Normalize against niche median
  IF p_median_depth > 0 THEN
    vqi_val := raw_depth / p_median_depth;
  ELSE
    vqi_val := raw_depth; -- No median available, use raw
  END IF;
  
  -- Step 4: Depth-adjusted views
  dav := p_views * vqi_val;
  
  RETURN QUERY SELECT 
    ROUND(raw_depth, 6)::NUMERIC AS depth_score,
    ROUND(vqi_val, 4)::NUMERIC AS vqi,
    ROUND(dav, 2)::NUMERIC AS depth_adjusted_views;
END;
$$;

COMMENT ON FUNCTION public.compute_vqi IS 'Computes Video Quality Index: per-view engagement depth normalized against niche median. VQI > 1.0 = above market.';
