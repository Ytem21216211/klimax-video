-- Migration: Add Effects Category and Global Comment Library
-- Date: 2026-04-19

-- 1. Create Comment Library table
CREATE TABLE IF NOT EXISTS public.comment_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.comment_library ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comment_library' AND policyname = 'Users can manage their own comments') THEN
        CREATE POLICY "Users can manage their own comments" 
        ON public.comment_library 
        FOR ALL 
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Add Project Settings
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS effects_settings JSONB DEFAULT '{"flash_enabled": false, "flash_color": "#ffffff", "flash_rainbow": false}',
ADD COLUMN IF NOT EXISTS comment_generator_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS selected_comment_id UUID REFERENCES public.comment_library(id) ON DELETE SET NULL;

-- 3. Add bucket for comment avatars if it doesn't exist
-- Note: Assuming the application handles bucket creation or uses existing asset buckets.
