-- Add Discord webhook URL column to projects table for channel notifications
ALTER TABLE public.projects 
ADD COLUMN discord_webhook_url TEXT DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.projects.discord_webhook_url IS 'Discord webhook URL for sending completed video notifications';