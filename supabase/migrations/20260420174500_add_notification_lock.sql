-- Add discord_notified column to render_queue to prevent multiple notifications
ALTER TABLE public.render_queue 
ADD COLUMN discord_notified BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.render_queue.discord_notified IS 'Ensures that a Discord notification is only sent once for this job';
