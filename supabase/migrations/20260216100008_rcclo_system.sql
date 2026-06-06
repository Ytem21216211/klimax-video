-- ============================================================================
-- RCCLO: Retention Calibrated Cognitive Load Optimization Engine
-- Database schema for feature storage, model state, and scoring
-- ============================================================================

-- 1. Per-video cognitive feature storage
CREATE TABLE IF NOT EXISTS public.video_cognitive_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_performance_id UUID REFERENCES public.video_performance(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Visual Features (extracted from RenderSpec)
  clip_count INTEGER DEFAULT 0,
  avg_clip_duration NUMERIC(8,3) DEFAULT 0,
  total_duration NUMERIC(8,3) DEFAULT 0,
  cut_frequency NUMERIC(8,4) DEFAULT 0,         -- clips / total_duration
  zoom_frequency NUMERIC(8,4) DEFAULT 0,         -- zoom transitions / total_duration
  transition_diversity NUMERIC(4,3) DEFAULT 0,   -- unique types / total transitions
  sfx_density NUMERIC(8,4) DEFAULT 0,            -- sfx count / total_duration
  subtitle_style_intensity INTEGER DEFAULT 1,    -- 1-5 mapped from style enum
  has_beginning_effect BOOLEAN DEFAULT false,
  has_end_screen BOOLEAN DEFAULT false,
  has_ip_popup BOOLEAN DEFAULT false,
  
  -- Linguistic Features (extracted from subtitle chunks)
  subtitle_words_per_second NUMERIC(6,3) DEFAULT 0,
  subtitle_avg_chunk_length NUMERIC(6,2) DEFAULT 0,  -- avg words per chunk
  word_complexity_score NUMERIC(6,3) DEFAULT 0,       -- avg syllables per word
  syllables_per_second NUMERIC(6,3) DEFAULT 0,
  total_word_count INTEGER DEFAULT 0,
  total_syllable_count INTEGER DEFAULT 0,
  
  -- Retention Metrics (populated by sync-youtube-analytics)
  retention_25_pct NUMERIC(5,4) DEFAULT NULL,
  retention_50_pct NUMERIC(5,4) DEFAULT NULL,
  retention_75_pct NUMERIC(5,4) DEFAULT NULL,
  completion_rate NUMERIC(5,4) DEFAULT NULL,
  rewatch_rate NUMERIC(5,4) DEFAULT NULL,
  avg_watch_time NUMERIC(8,2) DEFAULT NULL,
  
  -- Computed Scores
  retention_score NUMERIC(6,4) DEFAULT NULL,
  retention_tier TEXT CHECK (retention_tier IN ('high', 'medium', 'low')),
  cognitive_score NUMERIC(5,2) DEFAULT NULL,          -- 0-100
  predicted_retention_score NUMERIC(6,4) DEFAULT NULL,
  predicted_high_tier_prob NUMERIC(5,4) DEFAULT NULL,  -- 0-1
  
  -- Raw RenderSpec snapshot (for backfill/recomputation)
  render_spec_snapshot JSONB DEFAULT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(video_performance_id)
);

-- 2. Weekly model state snapshots
CREATE TABLE IF NOT EXISTS public.cognitive_model_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_week DATE NOT NULL,
  
  -- Feature normalization parameters (z-score)
  feature_means JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_stddevs JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Regression results
  regression_coefficients JSONB DEFAULT NULL,
  regression_intercept NUMERIC DEFAULT NULL,
  regression_r_squared NUMERIC(6,4) DEFAULT NULL,
  regression_p_values JSONB DEFAULT NULL,
  
  -- Interaction term coefficients
  interaction_coefficients JSONB DEFAULT NULL,
  
  -- Optimal zones per feature (from decile analysis)
  optimal_zones JSONB DEFAULT '{}'::jsonb,
  -- Format: { "feature_name": { "min": x, "max": y, "peak_center": z, "peak_score": w } }
  
  -- Logistic regression for tier prediction
  logistic_weights JSONB DEFAULT NULL,
  logistic_intercept NUMERIC DEFAULT NULL,
  logistic_accuracy NUMERIC(5,4) DEFAULT NULL,
  
  -- Retention tier thresholds (percentile-based)
  high_tier_threshold NUMERIC(6,4) DEFAULT NULL,
  low_tier_threshold NUMERIC(6,4) DEFAULT NULL,
  
  -- Stability metadata
  samples_used INTEGER DEFAULT 0,
  rolling_window_days INTEGER DEFAULT 60,
  smoothing_factor NUMERIC(3,2) DEFAULT 0.70,
  is_active BOOLEAN DEFAULT true,
  activation_ready BOOLEAN DEFAULT false,  -- true when samples >= 200
  
  -- Cognitive score domain weights (learned)
  domain_weights JSONB DEFAULT '{
    "visual_complexity": 0.35,
    "motion_intensity": 0.30,
    "linguistic_density": 0.35
  }'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(model_week)
);

-- 3. Add cognitive columns to video_performance
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS retention_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retention_tier TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cognitive_score NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS predicted_retention_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS predicted_high_tier_prob NUMERIC(5,4) DEFAULT NULL;

-- 4. Enable RLS
ALTER TABLE public.video_cognitive_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cognitive_model_state ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view/manage their own features
DROP POLICY IF EXISTS "Users can view their own cognitive features" ON public.video_cognitive_features;
CREATE POLICY "Users can view their own cognitive features"
  ON public.video_cognitive_features FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own cognitive features" ON public.video_cognitive_features;
CREATE POLICY "Users can insert their own cognitive features"
  ON public.video_cognitive_features FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own cognitive features" ON public.video_cognitive_features;
CREATE POLICY "Users can update their own cognitive features"
  ON public.video_cognitive_features FOR UPDATE
  USING (auth.uid() = user_id);

-- Model state: readable by all, writable by service role
DROP POLICY IF EXISTS "Model state readable by all" ON public.cognitive_model_state;
CREATE POLICY "Model state readable by all"
  ON public.cognitive_model_state FOR SELECT USING (true);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_vcf_user_id ON public.video_cognitive_features(user_id);
CREATE INDEX IF NOT EXISTS idx_vcf_project_id ON public.video_cognitive_features(project_id);
CREATE INDEX IF NOT EXISTS idx_vcf_video_perf_id ON public.video_cognitive_features(video_performance_id);
CREATE INDEX IF NOT EXISTS idx_vcf_retention_tier ON public.video_cognitive_features(retention_tier) WHERE retention_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vcf_cognitive_score ON public.video_cognitive_features(cognitive_score) WHERE cognitive_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_active ON public.cognitive_model_state(is_active, model_week DESC) WHERE is_active = true;

-- 6. Triggers
DROP TRIGGER IF EXISTS update_video_cognitive_features_updated_at ON public.video_cognitive_features;
CREATE TRIGGER update_video_cognitive_features_updated_at
  BEFORE UPDATE ON public.video_cognitive_features
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cognitive_model_state_updated_at ON public.cognitive_model_state;
CREATE TRIGGER update_cognitive_model_state_updated_at
  BEFORE UPDATE ON public.cognitive_model_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
