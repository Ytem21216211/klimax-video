-- ============================================================================
-- Clip Descriptions + Intelligent Clip Selection
-- Adds AI-generated (and user-editable) descriptions to project clips,
-- plus a dedicated job queue so the description workload never starves
-- the main render_queue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend public.videos with description columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS description_status TEXT
      NOT NULL DEFAULT 'pending'
      CHECK (description_status IN ('pending', 'processing', 'ready', 'failed', 'edited')),
  ADD COLUMN IF NOT EXISTS description_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description_model TEXT,
  ADD COLUMN IF NOT EXISTS description_error TEXT,
  ADD COLUMN IF NOT EXISTS description_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_videos_description_status
  ON public.videos (description_status);

CREATE INDEX IF NOT EXISTS idx_videos_project_id_description_status
  ON public.videos (project_id, description_status);

-- ---------------------------------------------------------------------------
-- 2. Allow project owners to UPDATE their own clips' description fields.
--    Existing SELECT policy is kept. We add a targeted UPDATE policy.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'videos'
      AND policyname = 'Users can update description on their own project videos'
  ) THEN
    CREATE POLICY "Users can update description on their own project videos"
      ON public.videos
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.projects
          WHERE projects.id = videos.project_id
            AND projects.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects
          WHERE projects.id = videos.project_id
            AND projects.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Dedicated job queue for clip description work
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clip_description_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  force BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- At most one active (pending/processing) job per video
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clip_description_jobs_active_video
  ON public.clip_description_jobs (video_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_clip_description_jobs_status_created
  ON public.clip_description_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_clip_description_jobs_project
  ON public.clip_description_jobs (project_id);

CREATE INDEX IF NOT EXISTS idx_clip_description_jobs_user
  ON public.clip_description_jobs (user_id);

ALTER TABLE public.clip_description_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'clip_description_jobs'
      AND policyname = 'Users can view their own description jobs'
  ) THEN
    CREATE POLICY "Users can view their own description jobs"
      ON public.clip_description_jobs
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- INSERT/UPDATE/DELETE is done via service role from edge functions only.

-- ---------------------------------------------------------------------------
-- 4. Lightweight AI usage log (observability for cost tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL,
  provider TEXT NOT NULL,          -- 'gemini' | 'openai' | 'grok' | 'lovable-gateway'
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_created
  ON public.ai_usage_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_function_created
  ON public.ai_usage_log (function_name, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ai_usage_log'
      AND policyname = 'Users can view their own AI usage'
  ) THEN
    CREATE POLICY "Users can view their own AI usage"
      ON public.ai_usage_log
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Backfill: any existing videos without a description get status 'pending'.
--    The description_status column was created with DEFAULT 'pending' so new
--    rows are fine; existing rows already have that default applied. This is
--    a no-op guard in case a prior migration left nulls anywhere.
-- ---------------------------------------------------------------------------
UPDATE public.videos
SET description_status = 'pending'
WHERE description_status IS NULL;
