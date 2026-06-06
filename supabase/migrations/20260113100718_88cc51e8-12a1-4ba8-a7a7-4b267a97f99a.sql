-- Enable realtime for projects table for faster status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;