-- =============================================================================
-- Setup script for the clip description queue worker.
-- Run this ONCE in the Supabase SQL editor after:
--   1. Deploying the process-description-queue edge function.
--   2. Setting the CRON_SECRET edge function secret (Supabase dashboard ->
--      Edge Functions -> Secrets). Generate it with: openssl rand -hex 32
--   3. Storing the same secret and your project URL in pg vault below.
--
-- This is NOT a regular migration because the project URL and secret are
-- environment-specific and must not be committed to source control.
-- =============================================================================

-- 1) Store the cron secret and project URL in Vault (one-time)
--    Replace the placeholder values before running.
-- -----------------------------------------------------------------------------

SELECT vault.create_secret(
  'REPLACE_WITH_YOUR_CRON_SECRET',
  'cron_secret',
  'Shared secret for process-description-queue cron trigger'
);

SELECT vault.create_secret(
  'https://jvlhockppezyupkwpqac.supabase.co',
  'project_url',
  'Base URL of the Supabase project'
);

-- 2) Schedule the worker to run every minute
-- -----------------------------------------------------------------------------

SELECT cron.schedule(
  'process-description-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url' LIMIT 1
    ) || '/functions/v1/process-description-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_secret' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) To unschedule later, run:
--    SELECT cron.unschedule('process-description-queue-every-minute');
-- =============================================================================
