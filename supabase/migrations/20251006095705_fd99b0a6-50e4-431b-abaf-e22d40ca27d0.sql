-- Increase storage bucket limits to support large video files
UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB limit for video clips
WHERE id = 'video-clips';

UPDATE storage.buckets 
SET file_size_limit = 104857600  -- 100MB limit for voiceovers
WHERE id = 'voiceovers';

UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB limit for exports
WHERE id = 'exports';