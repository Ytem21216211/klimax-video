
-- Add warmup fields to youtube_accounts
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_status TEXT DEFAULT 'new';
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS warmup_settings JSONB DEFAULT '{"niche": "Minecraft", "search_terms": ["Minecraft gameplay", "Minecraft tutorials"], "daily_duration_minutes": 30}';

-- Create youtube_warmup_logs table
CREATE TABLE IF NOT EXISTS youtube_warmup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES youtube_accounts(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    video_id TEXT,
    video_title TEXT,
    video_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for logs
ALTER TABLE youtube_warmup_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for logs (allow users to see logs of their accounts)
CREATE POLICY "Users can view logs of their own YouTube accounts"
ON youtube_warmup_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM youtube_accounts
        WHERE youtube_accounts.id = youtube_warmup_logs.account_id
        AND youtube_accounts.project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
            UNION
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    )
);
