-- Create a function for atomic job claiming
-- This prevents race conditions when multiple workers try to claim the same job

CREATE OR REPLACE FUNCTION public.claim_render_job(p_worker_id TEXT)
RETURNS SETOF public.render_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_job public.render_queue;
BEGIN
  -- Atomically claim the highest priority pending job
  UPDATE public.render_queue
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = now(),
    attempts = attempts + 1,
    updated_at = now()
  WHERE id = (
    SELECT id 
    FROM public.render_queue 
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO claimed_job;
  
  IF claimed_job.id IS NOT NULL THEN
    RETURN NEXT claimed_job;
  END IF;
  
  RETURN;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.claim_render_job(TEXT) TO service_role;