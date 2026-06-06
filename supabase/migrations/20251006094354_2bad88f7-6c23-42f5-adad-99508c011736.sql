-- Create storage buckets for video clips and audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('video-clips', 'video-clips', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('voiceovers', 'voiceovers', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('exports', 'exports', true);

-- Storage policies for video-clips bucket
CREATE POLICY "Users can upload their own video clips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own video clips"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own video clips"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'video-clips' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for voiceovers bucket
CREATE POLICY "Users can upload their own voiceovers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own voiceovers"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own voiceovers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'voiceovers' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for exports bucket (public)
CREATE POLICY "Anyone can view exported videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'exports');

CREATE POLICY "Users can upload their own exports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);