-- ============================================================================
-- Unified Channel Analytics Snapshots (YouTube + TikTok)
-- Adds support for TikTok and multi-channel tracking logic
-- ============================================================================

-- 1. Modify channel_analytics_snapshots to support TikTok
ALTER TABLE public.channel_analytics_snapshots
  ALTER COLUMN youtube_account_id DROP NOT NULL;

ALTER TABLE public.channel_analytics_snapshots
  ADD COLUMN IF NOT EXISTS tiktok_account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel_type TEXT CHECK (channel_type IN ('youtube', 'tiktok')),
  ADD COLUMN IF NOT EXISTS total_likes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_likes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS growth_rate_likes NUMERIC(8,4) DEFAULT NULL;

-- 2. Backfill existing data
UPDATE public.channel_analytics_snapshots
SET channel_type = 'youtube'
WHERE youtube_account_id IS NOT NULL AND channel_type IS NULL;

-- 3. Update RLS policies to include TikTok snapshots
DROP POLICY IF EXISTS "Users can view their own channel snapshots" ON public.channel_analytics_snapshots;
CREATE POLICY "Users can view their own channel snapshots"
  ON public.channel_analytics_snapshots FOR SELECT
  USING (
    (
      youtube_account_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.youtube_accounts ya
        WHERE ya.id = youtube_account_id
        AND ya.project_id IN (
          SELECT id FROM public.projects WHERE user_id = auth.uid()
          UNION
          SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
        )
      )
    )
    OR
    (
      tiktok_account_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.tiktok_accounts ta
        WHERE ta.id = tiktok_account_id
        AND ta.project_id IN (
          SELECT id FROM public.projects WHERE user_id = auth.uid()
          UNION
          SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- 4. Create common analytics view for easier querying
CREATE OR REPLACE VIEW public.unified_channel_analytics AS
SELECT
  'youtube' AS platform,
  ya.id AS account_id,
  ya.project_id,
  ya.channel_name,
  cas.snapshot_at,
  cas.total_views,
  cas.total_subscribers AS total_followers,
  cas.total_likes,
  cas.delta_views,
  cas.delta_subscribers AS delta_followers,
  cas.delta_likes
FROM public.youtube_accounts ya
JOIN public.channel_analytics_snapshots cas ON ya.id = cas.youtube_account_id
UNION ALL
SELECT
  'tiktok' AS platform,
  ta.id AS account_id,
  ta.project_id,
  ta.display_name AS channel_name,
  cas.snapshot_at,
  cas.total_views,
  cas.total_subscribers AS total_followers,
  cas.total_likes,
  cas.delta_views,
  cas.delta_subscribers AS delta_followers,
  cas.delta_likes
FROM public.tiktok_accounts ta
JOIN public.channel_analytics_snapshots cas ON ta.id = cas.tiktok_account_id;
