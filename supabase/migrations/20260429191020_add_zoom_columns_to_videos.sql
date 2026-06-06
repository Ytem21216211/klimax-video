
-- Add zoom columns to public.videos
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS ai_zoom_type TEXT CHECK (ai_zoom_type IN ('in', 'out', 'none')),
  ADD COLUMN IF NOT EXISTS ai_zoom_scale FLOAT,
  ADD COLUMN IF NOT EXISTS ai_zoom_duration FLOAT;
