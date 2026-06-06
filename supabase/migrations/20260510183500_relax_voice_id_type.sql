-- Migration to allow OpenAI string IDs in voice_id column
-- 1. Drop the foreign key constraint
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_voice_id_fkey;

-- 2. Change the column type from UUID to TEXT
ALTER TABLE public.projects
ALTER COLUMN voice_id TYPE TEXT USING voice_id::TEXT;
