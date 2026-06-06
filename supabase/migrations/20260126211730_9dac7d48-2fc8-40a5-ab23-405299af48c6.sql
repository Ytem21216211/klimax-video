-- Add YouTube settings column to projects table for per-project YouTube configuration
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS youtube_settings jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.youtube_settings IS 'YouTube auto-posting configuration: { enabled: boolean, channel_id: string, channel_name: string, access_token: string, refresh_token: string, token_expires_at: timestamp, privacy: string, category_id: string, tags: string[], made_for_kids: boolean }';