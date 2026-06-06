-- Table to store video performance data for analytics
CREATE TABLE public.video_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Content elements
  hook_text TEXT NOT NULL,
  cta_text TEXT NOT NULL,
  editing_style_name TEXT NOT NULL,
  
  -- Performance scores (1-100 scale, will be calculated from YouTube analytics)
  hook_score INTEGER CHECK (hook_score >= 0 AND hook_score <= 100),
  cta_score INTEGER CHECK (cta_score >= 0 AND cta_score <= 100),
  editing_style_score INTEGER CHECK (editing_style_score >= 0 AND editing_style_score <= 100),
  
  -- YouTube analytics data (for future integration)
  youtube_video_id TEXT,
  youtube_views INTEGER DEFAULT 0,
  youtube_likes INTEGER DEFAULT 0,
  youtube_comments INTEGER DEFAULT 0,
  youtube_watch_time_seconds INTEGER DEFAULT 0,
  youtube_avg_view_duration_seconds INTEGER DEFAULT 0,
  youtube_click_through_rate NUMERIC(5,2),
  youtube_avg_view_percentage NUMERIC(5,2),
  
  -- Metadata
  video_title TEXT,
  video_description TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own video performance"
  ON public.video_performance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own video performance"
  ON public.video_performance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video performance"
  ON public.video_performance FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video performance"
  ON public.video_performance FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_video_performance_user_id ON public.video_performance(user_id);
CREATE INDEX idx_video_performance_gamemode_id ON public.video_performance(gamemode_id);
CREATE INDEX idx_video_performance_scores ON public.video_performance(hook_score, cta_score, editing_style_score);

-- Trigger for updated_at
CREATE TRIGGER update_video_performance_updated_at
  BEFORE UPDATE ON public.video_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Table to store aggregated recommendations per gamemode
CREATE TABLE public.gamemode_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  
  -- Best performers
  best_hook_text TEXT,
  best_hook_score INTEGER,
  best_cta_text TEXT,
  best_cta_score INTEGER,
  best_editing_style TEXT,
  best_editing_style_score INTEGER,
  
  -- Patterns detected (JSON for flexibility)
  patterns JSONB DEFAULT '[]'::jsonb,
  
  -- AI-generated recommendations
  recommendations JSONB DEFAULT '[]'::jsonb,
  
  -- Stats
  total_videos_analyzed INTEGER DEFAULT 0,
  avg_hook_score NUMERIC(5,2),
  avg_cta_score NUMERIC(5,2),
  avg_editing_style_score NUMERIC(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, gamemode_id)
);

-- Enable RLS
ALTER TABLE public.gamemode_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own insights"
  ON public.gamemode_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own insights"
  ON public.gamemode_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON public.gamemode_insights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights"
  ON public.gamemode_insights FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_gamemode_insights_updated_at
  BEFORE UPDATE ON public.gamemode_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();