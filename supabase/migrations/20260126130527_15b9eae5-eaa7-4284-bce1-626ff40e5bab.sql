-- Create storage policies for music uploads in the voiceovers bucket
-- Allow authenticated users to upload music files

CREATE POLICY "Authenticated users can upload music"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);

CREATE POLICY "Authenticated users can read music"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);

CREATE POLICY "Authenticated users can delete music"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voiceovers' 
  AND (storage.foldername(name))[1] = 'music'
);