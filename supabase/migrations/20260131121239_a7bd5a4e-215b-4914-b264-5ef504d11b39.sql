-- Create batch_jobs table for queue-based processing
CREATE TABLE public.batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('video_generation', 'ab_test')),
  total_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  config JSONB NOT NULL DEFAULT '{}',
  used_account_ids TEXT[] DEFAULT '{}',
  last_processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own batch jobs"
ON public.batch_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batch jobs"
ON public.batch_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batch jobs"
ON public.batch_jobs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batch jobs"
ON public.batch_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_batch_jobs_updated_at
BEFORE UPDATE ON public.batch_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_batch_jobs_status ON public.batch_jobs(status);
CREATE INDEX idx_batch_jobs_user_id ON public.batch_jobs(user_id);
CREATE INDEX idx_batch_jobs_project_id ON public.batch_jobs(project_id);