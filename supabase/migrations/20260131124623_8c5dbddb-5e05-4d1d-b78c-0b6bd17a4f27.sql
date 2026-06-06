-- Weekly Reports table
CREATE TABLE public.weekly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  report_week DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  analysis_data JSONB DEFAULT '{}'::jsonb,
  recommendations JSONB DEFAULT '{}'::jsonb,
  videos_analyzed INTEGER DEFAULT 0,
  avg_retention_pct NUMERIC,
  best_performing_video_id UUID REFERENCES public.video_performance(id) ON DELETE SET NULL,
  applied_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, gamemode_id, report_week)
);

-- Active Report Settings table
CREATE TABLE public.active_report_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Competitor Channels table
CREATE TABLE public.competitor_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
  channel_url TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id, platform)
);

-- Competitor Videos table
CREATE TABLE public.competitor_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.competitor_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  platform_video_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  transcript TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  tags TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  analyzed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(competitor_id, platform_video_id)
);

-- Competitor Reports table
CREATE TABLE public.competitor_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  report_week DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  competitors_analyzed INTEGER DEFAULT 0,
  videos_analyzed INTEGER DEFAULT 0,
  trending_topics JSONB DEFAULT '{"topics": []}'::jsonb,
  content_gaps JSONB DEFAULT '{"gaps": []}'::jsonb,
  recommended_scripts JSONB DEFAULT '{"scripts": []}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, gamemode_id, report_week)
);

-- Enable RLS on all tables
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_reports ENABLE ROW LEVEL SECURITY;

-- Weekly Reports RLS Policies
CREATE POLICY "Users can view their own weekly reports" 
ON public.weekly_reports FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own weekly reports" 
ON public.weekly_reports FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly reports" 
ON public.weekly_reports FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weekly reports" 
ON public.weekly_reports FOR DELETE 
USING (auth.uid() = user_id);

-- Active Report Settings RLS Policies
CREATE POLICY "Users can view their own active report settings" 
ON public.active_report_settings FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own active report settings" 
ON public.active_report_settings FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own active report settings" 
ON public.active_report_settings FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own active report settings" 
ON public.active_report_settings FOR DELETE 
USING (auth.uid() = user_id);

-- Competitor Channels RLS Policies
CREATE POLICY "Users can view their own competitor channels" 
ON public.competitor_channels FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitor channels" 
ON public.competitor_channels FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor channels" 
ON public.competitor_channels FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own competitor channels" 
ON public.competitor_channels FOR DELETE 
USING (auth.uid() = user_id);

-- Competitor Videos RLS Policies
CREATE POLICY "Users can view their own competitor videos" 
ON public.competitor_videos FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitor videos" 
ON public.competitor_videos FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor videos" 
ON public.competitor_videos FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own competitor videos" 
ON public.competitor_videos FOR DELETE 
USING (auth.uid() = user_id);

-- Competitor Reports RLS Policies
CREATE POLICY "Users can view their own competitor reports" 
ON public.competitor_reports FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own competitor reports" 
ON public.competitor_reports FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own competitor reports" 
ON public.competitor_reports FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own competitor reports" 
ON public.competitor_reports FOR DELETE 
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_weekly_reports_updated_at
BEFORE UPDATE ON public.weekly_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_reports_updated_at
BEFORE UPDATE ON public.competitor_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();