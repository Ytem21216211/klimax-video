-- Enable INSERT implementation for logs by authenticated users
CREATE POLICY "Users can insert logs for their own YouTube accounts"
ON youtube_warmup_logs
FOR INSERT
WITH CHECK (
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
