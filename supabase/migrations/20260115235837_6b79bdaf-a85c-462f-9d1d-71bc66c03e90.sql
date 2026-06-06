-- Add end_screen_settings column to projects table for storing end screen configuration
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS end_screen_settings jsonb NULL DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN public.projects.end_screen_settings IS 'JSON config for end screen: { enabled: boolean, blur_enabled: boolean, ip_text: string, ip_settings: { color, fontFamily, fontSize, strokeEnabled, strokeColor, strokeWidth, shadowEnabled, shadowOpacity, shadowBlur, shadowDistance }, logo_url: string }';