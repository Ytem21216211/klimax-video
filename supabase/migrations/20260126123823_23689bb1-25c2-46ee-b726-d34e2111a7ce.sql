-- Add storage policies for exports bucket to allow authenticated users to upload
CREATE POLICY "Authenticated users can upload to exports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exports');

CREATE POLICY "Authenticated users can update their exports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'exports');

CREATE POLICY "Anyone can view exports"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'exports');