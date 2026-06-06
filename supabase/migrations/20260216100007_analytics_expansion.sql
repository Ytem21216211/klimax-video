-- ============================================================================
-- Analytics Expansion: Comprehensive metric tracking
-- New raw metrics, time-series snapshots, ratios, stages
-- ============================================================================

-- 1. Add new raw metric columns to video_performance
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS youtube_dislikes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_favorites INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_subscribers_gained INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_subscribers_lost INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_impressions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_impressions_ctr NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS youtube_unique_viewers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_engaged_views INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_completed_views INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_peak_hour INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS youtube_traffic_sources JSONB DEFAULT NULL;

-- 2. Computed ratios (stored for fast dashboard queries)
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS ratio_like_to_view NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_comment_to_view NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_favorite_to_view NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_comment_to_like NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_favorite_to_like NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_like_to_favorite NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_engaged_to_view NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_like_to_engaged NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_comment_to_engaged NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_favorite_to_engaged NUMERIC(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ratio_views_in_peak_hour NUMERIC(6,4) DEFAULT NULL;

-- 3. Performance stage (time-based)
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS performance_stage TEXT DEFAULT NULL;

COMMENT ON COLUMN public.video_performance.performance_stage IS 'Time-based stage: 10m, 30m, 2h, 5h, 10h, 15h, 1d, 2d, 3d, 4d, 5d, 6d, 7d, 7d+';
COMMENT ON COLUMN public.video_performance.youtube_engaged_views IS 'Estimated views where avg_view_pct >= 50% (deep engagement)';
COMMENT ON COLUMN public.video_performance.youtube_completed_views IS 'Estimated views that watched 90%+ of the video';
COMMENT ON COLUMN public.video_performance.youtube_peak_hour IS 'Hour (0-23 UTC) with most views';
COMMENT ON COLUMN public.video_performance.youtube_traffic_sources IS 'Traffic source breakdown: {"SEARCH":40,"SUGGESTED":35,"BROWSE":15,...}';

-- 4. Video analytics snapshots (time-series for growth tracking)
CREATE TABLE IF NOT EXISTS public.video_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_performance_id UUID NOT NULL REFERENCES public.video_performance(id) ON DELETE CASCADE,

  -- Timestamp
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hours_since_publish NUMERIC(8,2) DEFAULT NULL,
  performance_stage TEXT DEFAULT NULL,

  -- Raw metrics at this point in time
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  watch_time_seconds INTEGER DEFAULT 0,
  avg_view_duration_seconds INTEGER DEFAULT 0,
  avg_view_percentage NUMERIC(5,2) DEFAULT NULL,
  impressions_ctr NUMERIC(6,4) DEFAULT NULL,
  engaged_views INTEGER DEFAULT 0,
  completed_views INTEGER DEFAULT 0,

  -- Ratios at this snapshot
  ratio_like_to_view NUMERIC(10,8) DEFAULT NULL,
  ratio_comment_to_view NUMERIC(10,8) DEFAULT NULL,
  ratio_favorite_to_view NUMERIC(10,8) DEFAULT NULL,
  ratio_comment_to_like NUMERIC(10,8) DEFAULT NULL,
  ratio_favorite_to_like NUMERIC(10,8) DEFAULT NULL,
  ratio_engaged_to_view NUMERIC(10,8) DEFAULT NULL,

  -- Deltas since last snapshot
  delta_views INTEGER DEFAULT 0,
  delta_likes INTEGER DEFAULT 0,
  delta_comments INTEGER DEFAULT 0,
  delta_subscribers_gained INTEGER DEFAULT 0,
  delta_engaged_views INTEGER DEFAULT 0,
  delta_watch_time_seconds INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Channel analytics snapshots (channel-level growth over time)
CREATE TABLE IF NOT EXISTS public.channel_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_account_id UUID NOT NULL REFERENCES public.youtube_accounts(id) ON DELETE CASCADE,

  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Channel stats
  total_views BIGINT DEFAULT 0,
  total_subscribers INTEGER DEFAULT 0,
  total_watch_time_seconds BIGINT DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,

  -- Growth deltas (since last snapshot)
  delta_views BIGINT DEFAULT 0,
  delta_subscribers INTEGER DEFAULT 0,
  delta_watch_time_seconds BIGINT DEFAULT 0,
  delta_videos INTEGER DEFAULT 0,

  -- Growth rates (percentage change)
  growth_rate_views NUMERIC(8,4) DEFAULT NULL,
  growth_rate_subscribers NUMERIC(8,4) DEFAULT NULL,
  growth_rate_watch_time NUMERIC(8,4) DEFAULT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE public.video_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Video snapshots: users can see their own (via video_performance join)
DROP POLICY IF EXISTS "Users can view their own video snapshots" ON public.video_analytics_snapshots;
CREATE POLICY "Users can view their own video snapshots"
  ON public.video_analytics_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.video_performance vp
      WHERE vp.id = video_analytics_snapshots.video_performance_id
      AND vp.user_id = auth.uid()
    )
  );

-- Channel snapshots: users can see their own accounts
DROP POLICY IF EXISTS "Users can view their own channel snapshots" ON public.channel_analytics_snapshots;
CREATE POLICY "Users can view their own channel snapshots"
  ON public.channel_analytics_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.youtube_accounts ya
      WHERE ya.id = channel_analytics_snapshots.youtube_account_id
      AND ya.project_id IN (
        SELECT id FROM public.projects WHERE user_id = auth.uid()
        UNION
        SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
      )
    )
  );

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_vas_video_perf_id
  ON public.video_analytics_snapshots(video_performance_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_vas_stage
  ON public.video_analytics_snapshots(performance_stage, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_cas_account_id
  ON public.channel_analytics_snapshots(youtube_account_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_vp_performance_stage
  ON public.video_performance(performance_stage)
  WHERE performance_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vp_published_at
  ON public.video_performance(published_at DESC)
  WHERE published_at IS NOT NULL;
