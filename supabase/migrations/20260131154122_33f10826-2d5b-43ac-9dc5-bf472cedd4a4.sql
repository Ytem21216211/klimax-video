-- Add lab_enabled column to youtube_accounts
ALTER TABLE public.youtube_accounts
ADD COLUMN lab_enabled boolean DEFAULT false;

-- Add lab columns to projects
ALTER TABLE public.projects
ADD COLUMN lab_enabled boolean DEFAULT false,
ADD COLUMN lab_settings jsonb DEFAULT '{
  "experiment_count": 3,
  "variables": ["font", "animation", "hook_style", "text_color"],
  "last_experiment_at": null
}'::jsonb;

-- Create lab_experiments table
CREATE TABLE public.lab_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Experiment definition
  hypothesis text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}',
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  videos_generated integer DEFAULT 0,
  videos_posted integer DEFAULT 0,
  
  -- Performance tracking (after posting)
  avg_retention numeric,
  avg_ctr numeric,
  winner_video_id uuid,
  
  -- Insights extracted
  learnings jsonb DEFAULT '{}',
  
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  
  CONSTRAINT lab_experiments_status_check CHECK (status IN ('pending', 'generating', 'running', 'analyzing', 'completed', 'failed'))
);

ALTER TABLE public.lab_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their lab experiments"
  ON public.lab_experiments FOR ALL USING (auth.uid() = user_id);

-- Create lab_videos table
CREATE TABLE public.lab_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.lab_experiments(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  youtube_account_id uuid REFERENCES public.youtube_accounts(id) ON DELETE SET NULL,
  
  -- What makes this video unique
  variables jsonb NOT NULL DEFAULT '{}',
  
  -- Video details
  script text,
  video_url text,
  youtube_video_id text,
  
  -- Performance
  youtube_views integer DEFAULT 0,
  youtube_retention numeric,
  youtube_ctr numeric,
  
  -- Status
  status text DEFAULT 'pending',
  posted_at timestamp with time zone,
  
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.lab_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their lab videos"
  ON public.lab_videos FOR ALL USING (
    EXISTS (SELECT 1 FROM lab_experiments WHERE id = lab_videos.experiment_id AND user_id = auth.uid())
  );

-- Index for performance
CREATE INDEX lab_experiments_project_id_idx ON public.lab_experiments(project_id);
CREATE INDEX lab_experiments_status_idx ON public.lab_experiments(status);
CREATE INDEX lab_videos_experiment_id_idx ON public.lab_videos(experiment_id);
CREATE INDEX lab_videos_youtube_video_id_idx ON public.lab_videos(youtube_video_id);