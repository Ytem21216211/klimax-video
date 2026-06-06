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