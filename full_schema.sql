-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT,
  subtitle_style TEXT DEFAULT 'static',
  aspect_ratio TEXT DEFAULT '9:16',
  status TEXT DEFAULT 'draft',
  output_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Create videos table
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  file_name TEXT,
  duration NUMERIC,
  transcript TEXT,
  tags TEXT[],
  scenes JSONB,
  processed_video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view videos for their projects"
  ON public.videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = videos.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create videos for their projects"
  ON public.videos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = videos.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete videos for their projects"
  ON public.videos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = videos.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Create voiceovers table
CREATE TABLE public.voiceovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  transcript TEXT,
  duration NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.voiceovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view voiceovers for their projects"
  ON public.voiceovers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = voiceovers.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create voiceovers for their projects"
  ON public.voiceovers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = voiceovers.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Create imports table for YouTube/TikTok analysis
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  analysis_data JSONB,
  transcript TEXT,
  tags TEXT[],
  average_clip_length NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own imports"
  ON public.imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own imports"
  ON public.imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imports"
  ON public.imports FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
-- Create storage buckets for video clips and audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('video-clips', 'video-clips', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('voiceovers', 'voiceovers', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('exports', 'exports', true);

-- Storage policies for video-clips bucket
CREATE POLICY "Users can upload their own video clips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own video clips"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own video clips"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for voiceovers bucket
CREATE POLICY "Users can upload their own voiceovers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own voiceovers"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own voiceovers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for exports bucket (public)
CREATE POLICY "Anyone can view exported videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'exports');

CREATE POLICY "Users can upload their own exports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
-- Update storage buckets to allow much larger file sizes
UPDATE storage.buckets 
SET file_size_limit = 5368709120 -- 5GB limit for video clips
WHERE id = 'video-clips';

UPDATE storage.buckets 
SET file_size_limit = 104857600 -- 100MB limit for voiceovers
WHERE id = 'voiceovers';

UPDATE storage.buckets 
SET file_size_limit = 5368709120 -- 5GB limit for exports
WHERE id = 'exports';
-- Attempt to update storage configuration for larger file uploads
-- Note: This may not work if the setting is controlled at the infrastructure level

-- Check current storage configuration
DO $$
BEGIN
  -- Try to set a higher upload limit via storage config
  -- This attempts to configure the storage service
  RAISE NOTICE 'Attempting to configure storage upload limits...';
  
  -- Update bucket file size limits (we already did this, but ensuring it's set)
  UPDATE storage.buckets 
  SET file_size_limit = 52428800  -- 50MB
  WHERE id IN ('video-clips', 'exports');
  
  UPDATE storage.buckets 
  SET file_size_limit = 52428800  -- 50MB
  WHERE id = 'voiceovers';
  
  RAISE NOTICE 'Bucket limits updated successfully';
END $$;
-- Enable realtime for projects table for faster status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
-- Add a progress field to track real rendering progress
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS render_progress integer DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.projects.last_error IS 'Most recent video generation error message (if any).';
-- Enable RLS is already on; add missing policies for better UX

-- Allow users to delete voiceovers for their own projects (needed for "Reset Files")
CREATE POLICY "Users can delete voiceovers for their projects"
ON public.voiceovers
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = voiceovers.project_id
      AND projects.user_id = auth.uid()
  )
);
-- Fix linter WARN 1: ensure function search_path is set (prevents hijacking via malicious schemas)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
-- Add subtitle_settings column to projects table for storing custom subtitle configuration
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS subtitle_settings JSONB DEFAULT '{
  "style": "static",
  "bounceRate": 1.0,
  "fontSize": 6,
  "textColor": "#ffffff",
  "strokeEnabled": true,
  "strokeColor": "#000000",
  "strokeWidth": 2,
  "shadowEnabled": true,
  "shadowOpacity": 0.8,
  "shadowBlur": 6,
  "shadowDistance": 4
}'::jsonb;
-- Create subtitle_presets table for user presets
CREATE TABLE public.subtitle_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{
    "style": "static",
    "bounceRate": 1.0,
    "fontSize": 6,
    "textColor": "#ffffff",
    "strokeEnabled": true,
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "shadowEnabled": true,
    "shadowOpacity": 0.8,
    "shadowBlur": 6,
    "shadowDistance": 4
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subtitle_presets ENABLE ROW LEVEL SECURITY;

-- Users can only see their own presets
CREATE POLICY "Users can view their own presets"
ON public.subtitle_presets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own presets
CREATE POLICY "Users can create their own presets"
ON public.subtitle_presets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own presets
CREATE POLICY "Users can update their own presets"
ON public.subtitle_presets
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own presets
CREATE POLICY "Users can delete their own presets"
ON public.subtitle_presets
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_subtitle_presets_updated_at
BEFORE UPDATE ON public.subtitle_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create SFX library table for admin-managed sound effects
CREATE TABLE public.sfx_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  duration NUMERIC,
  category TEXT DEFAULT 'transition',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sfx_library ENABLE ROW LEVEL SECURITY;

-- Everyone can read SFX library (needed for video processing)
CREATE POLICY "SFX library is readable by everyone" 
ON public.sfx_library 
FOR SELECT 
USING (true);

-- Only authenticated users can insert (admin check will be in app logic)
CREATE POLICY "Authenticated users can insert SFX" 
ON public.sfx_library 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update SFX" 
ON public.sfx_library 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete SFX" 
ON public.sfx_library 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_sfx_library_updated_at
BEFORE UPDATE ON public.sfx_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add end_screen_settings column to projects table for storing end screen configuration
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS end_screen_settings jsonb NULL DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN public.projects.end_screen_settings IS 'JSON config for end screen: { enabled: boolean, blur_enabled: boolean, ip_text: string, ip_settings: { color, fontFamily, fontSize, strokeEnabled, strokeColor, strokeWidth, shadowEnabled, shadowOpacity, shadowBlur, shadowDistance }, logo_url: string }';
-- Add storage policy for SFX uploads (sfx/ folder in voiceovers bucket)
-- This allows authenticated users to upload and read from the sfx folder

-- Allow authenticated users to upload SFX
CREATE POLICY "Users can upload sfx"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Allow all authenticated users to view SFX (shared library)
CREATE POLICY "Users can view sfx"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Allow authenticated users to delete SFX
CREATE POLICY "Users can delete sfx"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Also add RLS policy for sfx_library table to allow all authenticated users
CREATE POLICY "Users can view all sfx"
ON public.sfx_library
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert sfx"
ON public.sfx_library
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can delete sfx"
ON public.sfx_library
FOR DELETE
TO authenticated
USING (true);
-- Drop duplicate RLS policies on sfx_library (we already have proper ones)
DROP POLICY IF EXISTS "Users can view all sfx" ON public.sfx_library;
DROP POLICY IF EXISTS "Users can insert sfx" ON public.sfx_library;
DROP POLICY IF EXISTS "Users can delete sfx" ON public.sfx_library;
-- Add Discord webhook URL column to projects table for channel notifications
ALTER TABLE public.projects 
ADD COLUMN discord_webhook_url TEXT DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.projects.discord_webhook_url IS 'Discord webhook URL for sending completed video notifications';
-- Create gamemodes table for training the AI on different game types
CREATE TABLE public.gamemodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gamemodes ENABLE ROW LEVEL SECURITY;

-- RLS policies for gamemodes
CREATE POLICY "Users can view their own gamemodes" 
ON public.gamemodes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own gamemodes" 
ON public.gamemodes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gamemodes" 
ON public.gamemodes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gamemodes" 
ON public.gamemodes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create training_scripts table for storing transcribed scripts from TikTok
CREATE TABLE public.training_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  transcript TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_scripts ENABLE ROW LEVEL SECURITY;

-- RLS policies for training_scripts
CREATE POLICY "Users can view their own training scripts" 
ON public.training_scripts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own training scripts" 
ON public.training_scripts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training scripts" 
ON public.training_scripts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add description and gamemode_id to projects table
ALTER TABLE public.projects 
ADD COLUMN description TEXT,
ADD COLUMN gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE SET NULL;

-- Add trigger for updating gamemodes updated_at
CREATE TRIGGER update_gamemodes_updated_at
BEFORE UPDATE ON public.gamemodes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add storage policies for exports bucket to allow authenticated users to upload
CREATE POLICY "Authenticated users can upload to exports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exports');

CREATE POLICY "Authenticated users can update their exports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'exports');

CREATE POLICY "Anyone can view exports"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'exports');
-- Create music library table (shared across all projects like SFX)
CREATE TABLE public.music_library (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  file_url text NOT NULL,
  duration numeric NULL,
  bpm integer NULL,
  genre text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.music_library ENABLE ROW LEVEL SECURITY;

-- Shared library - readable by all authenticated users
CREATE POLICY "Music library is readable by authenticated users"
ON public.music_library FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can manage music
CREATE POLICY "Authenticated users can insert music"
ON public.music_library FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update music"
ON public.music_library FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete music"
ON public.music_library FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Add music settings to projects
ALTER TABLE public.projects
ADD COLUMN music_settings jsonb NULL DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.projects.music_settings IS 'JSON: {selected_music_id, volume (0-100), start_time (seconds), enabled (boolean)}';
-- Create storage policies for music uploads in the voiceovers bucket
-- Allow authenticated users to upload music files

CREATE POLICY "Authenticated users can upload music"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);

CREATE POLICY "Authenticated users can read music"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);

CREATE POLICY "Authenticated users can delete music"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);
-- Add YouTube settings column to projects table for per-project YouTube configuration
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS youtube_settings jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.youtube_settings IS 'YouTube auto-posting configuration: { enabled: boolean, channel_id: string, channel_name: string, access_token: string, refresh_token: string, token_expires_at: timestamp, privacy: string, category_id: string, tags: string[], made_for_kids: boolean }';

-- Add colorimetry settings column
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS colorimetry_settings jsonb DEFAULT '{"brightness": 0, "contrast": 1, "saturation": 1, "preset": "none"}'::jsonb;

COMMENT ON COLUMN public.projects.colorimetry_settings IS 'Video colorimetry adjustments: { brightness (float -1 to 1), contrast (float -7 to 10), saturation (float 0 to 3), preset (string) }';
-- Create enum for project member roles
CREATE TYPE public.project_role AS ENUM ('member', 'admin');

-- Create project_members table to store confirmed memberships
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role project_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Create project_invitations table for pending invitations
CREATE TABLE public.project_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(project_id, email)
);

-- Enable RLS on both tables
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is project owner
CREATE OR REPLACE FUNCTION public.is_project_owner(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id
      AND user_id = _user_id
  )
$$;

-- Security definer function to check if user is project admin (owner or admin member)
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role = 'admin'
  )
$$;

-- Security definer function to check if user is project member (owner, admin, or member)
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
  )
$$;

-- RLS Policies for project_members

-- Project owners and admins can view all members
CREATE POLICY "Project admins can view members"
ON public.project_members FOR SELECT
USING (public.is_project_member(auth.uid(), project_id));

-- Only project admins can add members
CREATE POLICY "Project admins can add members"
ON public.project_members FOR INSERT
WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- Only project admins can update member roles
CREATE POLICY "Project admins can update members"
ON public.project_members FOR UPDATE
USING (public.is_project_admin(auth.uid(), project_id));

-- Only project owners can remove members (or members can leave themselves)
CREATE POLICY "Admins can remove members or members can leave"
ON public.project_members FOR DELETE
USING (
  public.is_project_admin(auth.uid(), project_id)
  OR user_id = auth.uid()
);

-- RLS Policies for project_invitations

-- Project admins can view invitations
CREATE POLICY "Project admins can view invitations"
ON public.project_invitations FOR SELECT
USING (public.is_project_admin(auth.uid(), project_id));

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their own invitations"
ON public.project_invitations FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Project admins can create invitations
CREATE POLICY "Project admins can create invitations"
ON public.project_invitations FOR INSERT
WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- Project admins can update invitations (revoke)
CREATE POLICY "Project admins can update invitations"
ON public.project_invitations FOR UPDATE
USING (public.is_project_admin(auth.uid(), project_id));

-- Users can update invitations sent to them (accept/decline)
CREATE POLICY "Users can respond to their invitations"
ON public.project_invitations FOR UPDATE
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Project admins can delete invitations
CREATE POLICY "Project admins can delete invitations"
ON public.project_invitations FOR DELETE
USING (public.is_project_admin(auth.uid(), project_id));

-- Create indexes for performance
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX idx_project_invitations_project_id ON public.project_invitations(project_id);
CREATE INDEX idx_project_invitations_email ON public.project_invitations(email);
CREATE INDEX idx_project_invitations_status ON public.project_invitations(status);
-- Fix RLS policies for project_invitations to use auth.email() instead of querying auth.users

-- Drop the broken policies
DROP POLICY IF EXISTS "Users can view their own invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Users can respond to their invitations" ON public.project_invitations;

-- Recreate with auth.email() which is available from the JWT
CREATE POLICY "Users can view their own invitations" 
ON public.project_invitations 
FOR SELECT 
USING (lower(email) = lower(auth.email()));

CREATE POLICY "Users can respond to their invitations" 
ON public.project_invitations 
FOR UPDATE 
USING (lower(email) = lower(auth.email()));
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
-- Fix 1: Allow invited users to see project details (for displaying project name)
CREATE POLICY "Invited users can view project details"
ON public.projects
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE project_invitations.project_id = projects.id
      AND lower(project_invitations.email) = lower(auth.email())
      AND project_invitations.status = 'pending'
      AND project_invitations.expires_at > now()
  )
);

-- Fix 2: Allow users to add themselves when accepting a valid invitation
CREATE POLICY "Users can join via invitation"
ON public.project_members
FOR INSERT
WITH CHECK (
  -- User is adding themselves
  user_id = auth.uid()
  AND
  -- They have a valid pending invitation for this project
  EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE project_invitations.project_id = project_members.project_id
      AND lower(project_invitations.email) = lower(auth.email())
      AND project_invitations.status = 'pending'
      AND project_invitations.expires_at > now()
  )
);
-- Allow project members (not only owners / pending invitees) to view projects
-- This fixes "Failed to load project" after accepting an invitation.

CREATE POLICY "Project members can view projects"
ON public.projects
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
  )
);
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
-- Create admin check function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = _user_id
      AND email = 'roliumgens@gmail.com'
  )
$$;

-- Add policy for admin to view all projects
CREATE POLICY "Admin can view all projects"
ON public.projects
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Add policy for admin to update any project
CREATE POLICY "Admin can update all projects"
ON public.projects
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Add policy for admin to delete any project
CREATE POLICY "Admin can delete all projects"
ON public.projects
FOR DELETE
USING (public.is_admin(auth.uid()));
-- Create hook_ab_tests table
CREATE TABLE public.hook_ab_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  base_script TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
  winner_variation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create hook_variations table
CREATE TABLE public.hook_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.hook_ab_tests(id) ON DELETE CASCADE,
  hook_style TEXT NOT NULL CHECK (hook_style IN ('question', 'bold_claim', 'mystery', 'challenge', 'action')),
  hook_text TEXT NOT NULL,
  full_script TEXT NOT NULL,
  video_performance_id UUID REFERENCES public.video_performance(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  youtube_views INTEGER DEFAULT 0,
  youtube_avg_view_percentage NUMERIC,
  is_winner BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key for winner_variation_id after hook_variations is created
ALTER TABLE public.hook_ab_tests 
ADD CONSTRAINT hook_ab_tests_winner_variation_id_fkey 
FOREIGN KEY (winner_variation_id) REFERENCES public.hook_variations(id) ON DELETE SET NULL;

-- Enable RLS on hook_ab_tests
ALTER TABLE public.hook_ab_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for hook_ab_tests
CREATE POLICY "Users can view their own A/B tests"
ON public.hook_ab_tests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own A/B tests"
ON public.hook_ab_tests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own A/B tests"
ON public.hook_ab_tests
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own A/B tests"
ON public.hook_ab_tests
FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on hook_variations
ALTER TABLE public.hook_variations ENABLE ROW LEVEL SECURITY;

-- RLS policies for hook_variations (based on test ownership)
CREATE POLICY "Users can view variations of their tests"
ON public.hook_variations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can create variations for their tests"
ON public.hook_variations
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can update variations of their tests"
ON public.hook_variations
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can delete variations of their tests"
ON public.hook_variations
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

-- Create trigger for updating updated_at on hook_variations
CREATE TRIGGER update_hook_variations_updated_at
BEFORE UPDATE ON public.hook_variations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_hook_ab_tests_user_id ON public.hook_ab_tests(user_id);
CREATE INDEX idx_hook_ab_tests_project_id ON public.hook_ab_tests(project_id);
CREATE INDEX idx_hook_ab_tests_status ON public.hook_ab_tests(status);
CREATE INDEX idx_hook_variations_test_id ON public.hook_variations(test_id);
CREATE INDEX idx_hook_variations_video_performance_id ON public.hook_variations(video_performance_id);
-- Create batch_jobs table for queue-based processing
CREATE TABLE public.batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('video_generation', 'ab_test')),
  total_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  config JSONB NOT NULL DEFAULT '{}',
  used_account_ids TEXT[] DEFAULT '{}',
  last_processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own batch jobs"
ON public.batch_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batch jobs"
ON public.batch_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batch jobs"
ON public.batch_jobs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batch jobs"
ON public.batch_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_batch_jobs_updated_at
BEFORE UPDATE ON public.batch_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_batch_jobs_status ON public.batch_jobs(status);
CREATE INDEX idx_batch_jobs_user_id ON public.batch_jobs(user_id);
CREATE INDEX idx_batch_jobs_project_id ON public.batch_jobs(project_id);
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
-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Create clip_pool table for shared clips per gamemode
CREATE TABLE public.clip_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text,
  duration numeric,
  category text DEFAULT 'gameplay',
  intensity text DEFAULT 'medium',
  tags text[],
  used_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clip_pool ENABLE ROW LEVEL SECURITY;

-- RLS policies for clip_pool
CREATE POLICY "Users can view their own clips" 
ON public.clip_pool 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clips" 
ON public.clip_pool 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clips" 
ON public.clip_pool 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clips" 
ON public.clip_pool 
FOR DELETE 
USING (auth.uid() = user_id);
-- Add title rotation columns to youtube_accounts table
ALTER TABLE public.youtube_accounts
ADD COLUMN IF NOT EXISTS title_pool text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS title_rotation_mode text DEFAULT 'sequential',
ADD COLUMN IF NOT EXISTS title_rotation_index integer DEFAULT 0;
-- Create automation_settings table
CREATE TABLE public.automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  
  -- Autonomy level (1=advisor, 2=copilot, 3=autopilot)
  autonomy_level integer DEFAULT 1 CHECK (autonomy_level BETWEEN 1 AND 3),
  
  -- Auto-execute thresholds
  scale_threshold_ctr numeric DEFAULT 5.0,
  scale_threshold_retention numeric DEFAULT 50.0,
  kill_threshold_retention numeric DEFAULT 25.0,
  kill_threshold_views_pct numeric DEFAULT 30.0,
  min_confidence_pct integer DEFAULT 75,
  
  -- Boundaries
  protected_settings text[] DEFAULT '{}',
  max_changes_per_day integer DEFAULT 5,
  
  -- Co-pilot delay
  copilot_delay_hours integer DEFAULT 6,
  
  -- Master switch
  enabled boolean DEFAULT true,
  paused_until timestamp with time zone,
  pause_reason text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their automation settings"
  ON public.automation_settings FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX automation_settings_unique ON public.automation_settings(user_id, gamemode_id);

-- Create automation_decisions table
CREATE TABLE public.automation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Decision details
  decision_type text NOT NULL,
  action_summary text NOT NULL,
  action_details jsonb NOT NULL DEFAULT '{}',
  
  -- Confidence and reasoning
  confidence_pct integer NOT NULL,
  reasoning text NOT NULL,
  data_points jsonb NOT NULL DEFAULT '{}',
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  scheduled_at timestamp with time zone,
  executed_at timestamp with time zone,
  rolled_back_at timestamp with time zone,
  
  -- What was changed
  affected_entities jsonb DEFAULT '[]',
  previous_values jsonb DEFAULT '{}',
  new_values jsonb DEFAULT '{}',
  
  -- User interaction
  user_response text,
  user_response_at timestamp with time zone,
  user_notes text,
  
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.automation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their decisions"
  ON public.automation_decisions FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Users can insert their decisions"
  ON public.automation_decisions FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "Users can update their decisions"
  ON public.automation_decisions FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX automation_decisions_pending ON public.automation_decisions(user_id, status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX automation_decisions_gamemode ON public.automation_decisions(gamemode_id, created_at DESC);

-- Enable realtime for decisions
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_decisions;

-- Create format_performance table
CREATE TABLE public.format_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Format identification
  format_type text NOT NULL,
  format_value text NOT NULL,
  
  -- Aggregated metrics
  total_videos integer DEFAULT 0,
  total_views bigint DEFAULT 0,
  avg_retention_pct numeric,
  avg_ctr numeric,
  performance_trend text,
  
  -- Status
  status text DEFAULT 'active',
  killed_at timestamp with time zone,
  kill_reason text,
  
  last_analyzed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(user_id, gamemode_id, format_type, format_value)
);

ALTER TABLE public.format_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their format performance"
  ON public.format_performance FOR ALL USING (auth.uid() = user_id);
-- Add brain column to gamemodes table for persistent AI memory
ALTER TABLE public.gamemodes
ADD COLUMN brain jsonb DEFAULT '{
  "version": 1,
  "what_works": [],
  "what_failed": [],
  "experiments": [],
  "avoid": [],
  "current_hypothesis": null,
  "audience_profile": {},
  "title_patterns": {"works": [], "fails": []},
  "summary": null
}'::jsonb;

-- Add GIN index for efficient JSONB queries
CREATE INDEX gamemodes_brain_gin ON public.gamemodes USING gin (brain);
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
-- Create render_queue table for self-hosted FFmpeg rendering system
CREATE TABLE public.render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  spec JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  worker_id TEXT,
  output_url TEXT,
  thumbnail_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add constraint for valid status values
ALTER TABLE public.render_queue 
ADD CONSTRAINT render_queue_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Index for efficient polling by workers (pending jobs ordered by priority and creation time)
CREATE INDEX idx_render_queue_pending ON public.render_queue(status, priority DESC, created_at ASC) 
  WHERE status = 'pending';

-- Index for user's render history
CREATE INDEX idx_render_queue_user ON public.render_queue(user_id, created_at DESC);

-- Index for project's render history
CREATE INDEX idx_render_queue_project ON public.render_queue(project_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.render_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own render jobs
CREATE POLICY "Users can view their own render jobs"
  ON public.render_queue
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create render jobs for their own projects
CREATE POLICY "Users can create their own render jobs"
  ON public.render_queue
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own render jobs (for cancellation)
CREATE POLICY "Users can update their own render jobs"
  ON public.render_queue
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own render jobs
CREATE POLICY "Users can delete their own render jobs"
  ON public.render_queue
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_render_queue_updated_at
  BEFORE UPDATE ON public.render_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Create a function for atomic job claiming
-- This prevents race conditions when multiple workers try to claim the same job

CREATE OR REPLACE FUNCTION public.claim_render_job(p_worker_id TEXT)
RETURNS SETOF public.render_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_job public.render_queue;
BEGIN
  -- Atomically claim the highest priority pending job
  UPDATE public.render_queue
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = now(),
    attempts = attempts + 1,
    updated_at = now()
  WHERE id = (
    SELECT id 
    FROM public.render_queue 
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO claimed_job;
  
  IF claimed_job.id IS NOT NULL THEN
    RETURN NEXT claimed_job;
  END IF;
  
  RETURN;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.claim_render_job(TEXT) TO service_role;

-- Add warmup fields to youtube_accounts
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_status TEXT DEFAULT 'new';
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_settings JSONB DEFAULT '{"niche": "Minecraft", "search_terms": ["Minecraft gameplay", "Minecraft tutorials"], "daily_duration_minutes": 30}';

-- Create youtube_warmup_logs table
CREATE TABLE IF NOT EXISTS youtube_warmup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES youtube_accounts(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    video_id TEXT,
    video_title TEXT,
    video_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for logs
ALTER TABLE youtube_warmup_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for logs (allow users to see logs of their accounts)
CREATE POLICY "Users can view logs of their own YouTube accounts"
ON youtube_warmup_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM youtube_accounts
        WHERE youtube_accounts.id = youtube_warmup_logs.account_id
        AND youtube_accounts.project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
            UNION
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    )
);
-- Enable INSERT implementation for logs by authenticated users
CREATE POLICY "Users can insert logs for their own YouTube accounts"
ON youtube_warmup_logs
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM youtube_accounts
        WHERE youtube_accounts.id = youtube_warmup_logs.account_id
        AND youtube_accounts.project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
            UNION
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    )
);
-- ============================================================================
-- VQI (Video Quality Index) System
-- Per-view engagement depth adjusted for signal strength
-- ============================================================================

-- Add VQI columns to video_performance
ALTER TABLE public.video_performance
  ADD COLUMN IF NOT EXISTS youtube_shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_saves INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_rewatches INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vqi_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_score NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_adjusted_views NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_computed_at TIMESTAMPTZ DEFAULT NULL;

-- Add VQI columns to tracked_videos
ALTER TABLE public.tracked_videos
  ADD COLUMN IF NOT EXISTS vqi_score NUMERIC(6,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_score NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_depth_adjusted_views NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vqi_computed_at TIMESTAMPTZ DEFAULT NULL;

-- Niche median tracking
CREATE TABLE IF NOT EXISTS public.vqi_niche_medians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'all')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  median_like_rate NUMERIC(10,8) DEFAULT 0,
  median_comment_rate NUMERIC(10,8) DEFAULT 0,
  median_share_rate NUMERIC(10,8) DEFAULT 0,
  median_save_rate NUMERIC(10,8) DEFAULT 0,
  median_rewatch_rate NUMERIC(10,8) DEFAULT 0,
  median_depth_score NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  videos_sampled INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(niche, platform, period_start)
);

-- Calibration history (self-learning weights)
CREATE TABLE IF NOT EXISTS public.vqi_calibration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'all')),
  previous_weights JSONB NOT NULL,
  calibrated_weights JSONB NOT NULL,
  r_squared NUMERIC(6,4) DEFAULT NULL,
  samples_used INTEGER DEFAULT 0,
  regression_method TEXT DEFAULT 'ols_linear',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vqi_niche_medians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vqi_calibration_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "VQI niche medians readable by all" ON public.vqi_niche_medians FOR SELECT USING (true);
CREATE POLICY "VQI calibration readable by all" ON public.vqi_calibration_history FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_vqi_niche_medians_lookup ON public.vqi_niche_medians(niche, platform, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_vqi_calibration_active ON public.vqi_calibration_history(niche, platform, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_video_performance_vqi ON public.video_performance(vqi_score) WHERE vqi_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracked_videos_vqi ON public.tracked_videos(vqi_score) WHERE vqi_score IS NOT NULL;
