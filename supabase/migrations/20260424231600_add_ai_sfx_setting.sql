-- Migration: Add AI SFX Setting to Effects Settings
-- Date: 2026-04-24

-- Add ai_sfx_enabled to the default effects_settings if not already there
-- Since it's JSONB, we can just update the existing rows or let the frontend handle it, 
-- but setting a proper default is good practice.

-- Update current projects to include the new field if missing
UPDATE public.projects 
SET effects_settings = effects_settings || '{"ai_sfx_enabled": false}'::jsonb
WHERE effects_settings IS NOT NULL AND NOT (effects_settings ? 'ai_sfx_enabled');

-- Update the column default for future projects
ALTER TABLE public.projects 
ALTER COLUMN effects_settings SET DEFAULT '{"flash_enabled": false, "flash_color": "#ffffff", "flash_rainbow": false, "ai_sfx_enabled": false}'::jsonb;
