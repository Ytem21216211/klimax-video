-- Add a progress field to track real rendering progress
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS render_progress integer DEFAULT 0;