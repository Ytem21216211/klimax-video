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