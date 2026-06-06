-- Add title rotation columns to youtube_accounts table
ALTER TABLE public.youtube_accounts
ADD COLUMN IF NOT EXISTS title_pool text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS title_rotation_mode text DEFAULT 'sequential',
ADD COLUMN IF NOT EXISTS title_rotation_index integer DEFAULT 0;