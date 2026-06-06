-- Create table for multiple YouTube accounts per project
CREATE TABLE public.youtube_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  privacy TEXT NOT NULL DEFAULT 'private',
  category_id TEXT NOT NULL DEFAULT '20',
  tags TEXT[] DEFAULT '{}',
  made_for_kids BOOLEAN NOT NULL DEFAULT false,
  custom_title TEXT,
  custom_description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, channel_id)
);

-- Create table for YouTube post queue (for scheduled/delayed posts)
CREATE TABLE public.youtube_post_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.youtube_accounts(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  posted_at TIMESTAMP WITH TIME ZONE,
  youtube_video_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add global post delay setting to projects (in minutes)
ALTER TABLE public.projects ADD COLUMN youtube_post_delay_minutes INTEGER DEFAULT 30;

-- Enable RLS
ALTER TABLE public.youtube_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_post_queue ENABLE ROW LEVEL SECURITY;

-- RLS for youtube_accounts: project admins can manage
CREATE POLICY "Project admins can view youtube accounts"
  ON public.youtube_accounts FOR SELECT
  USING (is_project_admin(auth.uid(), project_id));

CREATE POLICY "Project admins can create youtube accounts"
  ON public.youtube_accounts FOR INSERT
  WITH CHECK (is_project_admin(auth.uid(), project_id));

CREATE POLICY "Project admins can update youtube accounts"
  ON public.youtube_accounts FOR UPDATE
  USING (is_project_admin(auth.uid(), project_id));

CREATE POLICY "Project admins can delete youtube accounts"
  ON public.youtube_accounts FOR DELETE
  USING (is_project_admin(auth.uid(), project_id));

-- RLS for youtube_post_queue: project members can view, admins can manage
CREATE POLICY "Project members can view post queue"
  ON public.youtube_post_queue FOR SELECT
  USING (is_project_member(auth.uid(), project_id));

CREATE POLICY "Project admins can manage post queue"
  ON public.youtube_post_queue FOR ALL
  USING (is_project_admin(auth.uid(), project_id));

-- Trigger for updated_at on youtube_accounts
CREATE TRIGGER update_youtube_accounts_updated_at
  BEFORE UPDATE ON public.youtube_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();