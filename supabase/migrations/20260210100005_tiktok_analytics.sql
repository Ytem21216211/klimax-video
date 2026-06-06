-- Create competitors table
CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL,
  niche TEXT,
  avatar_url TEXT,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(handle)
);

-- Create tracked_videos table
CREATE TABLE IF NOT EXISTS public.tracked_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Null if competitor video
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE SET NULL, -- Null if our video
  is_competitor BOOLEAN GENERATED ALWAYS AS (competitor_id IS NOT NULL) STORED,
  
  -- Metadata
  upload_time TIMESTAMPTZ,
  duration INTEGER, -- in seconds
  description TEXT,
  cover_url TEXT,
  
  -- Strategy Tags
  script_archetype TEXT,
  visual_style TEXT,
  gamemode TEXT, -- e.g. "Parkour", "Story", "Educational"
  
  -- Scoring (Computed)
  current_score FLOAT DEFAULT 0, -- Absolute Performance Score (APS)
  relative_score FLOAT DEFAULT 0, -- Relative Competitive Score (RCS)
  
  status TEXT CHECK (status IN ('active', 'monitoring', 'archived')) DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb, -- hashtags, mentions, etc.
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tiktok_id)
);

-- Create analytics_snapshots table for time-series data
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.tracked_videos(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Core Metrics
  views BIGINT DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  
  -- Advanced Metrics (if available)
  completion_rate FLOAT,
  avg_watch_time FLOAT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create scoring_weights table for dynamic configuration
CREATE TABLE IF NOT EXISTS public.scoring_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL UNIQUE,
  
  -- Dynamic Weights Configuration
  weights JSONB NOT NULL DEFAULT '{
    "like": 1.0,
    "comment": 2.2,
    "share": 3.5,
    "save": 3.8,
    "full_watch": 4.5,
    "rewatch": 5.5,
    "profile_click": 2.0,
    "follow": 4.0
  }'::jsonb,
  
  -- Thresholds for Stages
  thresholds JSONB NOT NULL DEFAULT '{
    "stage_0": 500,
    "stage_1": 2000,
    "stage_2": 10000,
    "stage_3": 50000,
    "stage_4": 250000
  }'::jsonb,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracked_videos_user_id ON public.tracked_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_videos_competitor_id ON public.tracked_videos(competitor_id);
CREATE INDEX IF NOT EXISTS idx_tracked_videos_status ON public.tracked_videos(status);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_video_id ON public.analytics_snapshots(video_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_timestamp ON public.analytics_snapshots(timestamp DESC);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_weights ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Competitors: Viewable by everyone, Insert/Update by authenticated users
CREATE POLICY "Competitors are viewable by everyone" ON public.competitors FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert competitors" ON public.competitors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update competitors" ON public.competitors FOR UPDATE USING (auth.role() = 'authenticated');

-- Tracked Videos: 
-- Own videos viewable by owner
-- Competitor videos viewable by everyone
CREATE POLICY "Status viewable by everyone" ON public.tracked_videos FOR SELECT USING (true);
CREATE POLICY "Users can insert their own videos" ON public.tracked_videos FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can update their own videos" ON public.tracked_videos FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

-- Analytics Snapshots: Viewable by everyone (for aggregated stats)
CREATE POLICY "Snapshots are viewable by everyone" ON public.analytics_snapshots FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert snapshots" ON public.analytics_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Scoring Weights: Viewable by everyone, Update by admins only (or auth users for now)
CREATE POLICY "Weights are viewable by everyone" ON public.scoring_weights FOR SELECT USING (true);
CREATE POLICY "Authenticated users can update weights" ON public.scoring_weights FOR UPDATE USING (auth.role() = 'authenticated'); -- Ideally restricted to admins

-- Triggers for updated_at
CREATE TRIGGER update_competitors_updated_at BEFORE UPDATE ON public.competitors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tracked_videos_updated_at BEFORE UPDATE ON public.tracked_videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scoring_weights_updated_at BEFORE UPDATE ON public.scoring_weights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
