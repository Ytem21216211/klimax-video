-- Attempt to update storage configuration for larger file uploads
-- Note: This may not work if the setting is controlled at the infrastructure level

-- Check current storage configuration
DO $$
BEGIN
  -- Try to set a higher upload limit via storage config
  -- This attempts to configure the storage service
  RAISE NOTICE 'Attempting to configure storage upload limits...';
  
  -- Update bucket file size limits (we already did this, but ensuring it's set)
  UPDATE storage.buckets 
  SET file_size_limit = 5368709120  -- 5GB
  WHERE id IN ('video-clips', 'exports');
  
  UPDATE storage.buckets 
  SET file_size_limit = 104857600  -- 100MB
  WHERE id = 'voiceovers';
  
  RAISE NOTICE 'Bucket limits updated successfully';
END $$;