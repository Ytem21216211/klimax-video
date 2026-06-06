-- Create render_queue table for self-hosted FFmpeg rendering system
CREATE TABLE public.render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  spec JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  worker_id TEXT,
  output_url TEXT,
  thumbnail_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add constraint for valid status values
ALTER TABLE public.render_queue 
ADD CONSTRAINT render_queue_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Index for efficient polling by workers (pending jobs ordered by priority and creation time)
CREATE INDEX idx_render_queue_pending ON public.render_queue(status, priority DESC, created_at ASC) 
  WHERE status = 'pending';

-- Index for user's render history
CREATE INDEX idx_render_queue_user ON public.render_queue(user_id, created_at DESC);

-- Index for project's render history
CREATE INDEX idx_render_queue_project ON public.render_queue(project_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.render_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own render jobs
CREATE POLICY "Users can view their own render jobs"
  ON public.render_queue
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create render jobs for their own projects
CREATE POLICY "Users can create their own render jobs"
  ON public.render_queue
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own render jobs (for cancellation)
CREATE POLICY "Users can update their own render jobs"
  ON public.render_queue
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own render jobs
CREATE POLICY "Users can delete their own render jobs"
  ON public.render_queue
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_render_queue_updated_at
  BEFORE UPDATE ON public.render_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();