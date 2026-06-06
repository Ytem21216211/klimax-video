-- Add storage policy for SFX uploads (sfx/ folder in voiceovers bucket)
-- This allows authenticated users to upload and read from the sfx folder

-- Allow authenticated users to upload SFX
CREATE POLICY "Users can upload sfx"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Allow all authenticated users to view SFX (shared library)
CREATE POLICY "Users can view sfx"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Allow authenticated users to delete SFX
CREATE POLICY "Users can delete sfx"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'voiceovers' AND 
  (storage.foldername(name))[1] = 'sfx'
);

-- Also add RLS policy for sfx_library table to allow all authenticated users
CREATE POLICY "Users can view all sfx"
ON public.sfx_library
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert sfx"
ON public.sfx_library
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can delete sfx"
ON public.sfx_library
FOR DELETE
TO authenticated
USING (true);