-- 1. Ensure Columns exist in projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "beginning_effect_settings" jsonb DEFAULT '{"enabled": false}'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "transition_effect_settings" jsonb DEFAULT '{"enabled": false}'::jsonb;

-- 2. Create user_fonts table for custom font tracking
CREATE TABLE IF NOT EXISTS public.user_fonts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    font_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_fonts
ALTER TABLE public.user_fonts ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for user_fonts
DROP POLICY IF EXISTS "Users can view their own fonts" ON public.user_fonts;
CREATE POLICY "Users can view their own fonts"
    ON public.user_fonts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upload their own fonts" ON public.user_fonts;
CREATE POLICY "Users can upload their own fonts"
    ON public.user_fonts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own fonts" ON public.user_fonts;
CREATE POLICY "Users can delete their own fonts"
    ON public.user_fonts FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Create Storage Bucket for Custom Fonts
INSERT INTO storage.buckets (id, name, public)
VALUES ('custom_fonts', 'custom_fonts', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policies for custom_fonts bucket
DROP POLICY IF EXISTS "Users can upload custom fonts" ON storage.objects;
CREATE POLICY "Users can upload custom fonts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'custom_fonts' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can view custom fonts" ON storage.objects;
CREATE POLICY "Users can view custom fonts"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'custom_fonts' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete custom fonts" ON storage.objects;
CREATE POLICY "Users can delete custom fonts"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'custom_fonts' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);
