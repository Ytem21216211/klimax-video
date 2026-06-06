ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.projects.last_error IS 'Most recent video generation error message (if any).';