-- Create tiktok_accounts table
CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    open_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refresh_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    privacy TEXT DEFAULT 'public',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, open_id)
);

-- Enable RLS for tiktok_accounts
ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for tiktok_accounts
CREATE POLICY "Users can view tiktok accounts for their projects" ON public.tiktok_accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_accounts.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert tiktok accounts for their projects" ON public.tiktok_accounts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_accounts.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update tiktok accounts for their projects" ON public.tiktok_accounts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_accounts.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete tiktok accounts for their projects" ON public.tiktok_accounts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_accounts.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Create tiktok_post_queue table
CREATE TABLE IF NOT EXISTS public.tiktok_post_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.tiktok_accounts(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    caption TEXT,
    privacy TEXT DEFAULT 'public', -- 'public', 'friends', 'private'
    status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'published', 'failed'
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    posted_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for tiktok_post_queue
ALTER TABLE public.tiktok_post_queue ENABLE ROW LEVEL SECURITY;

-- Create policies for tiktok_post_queue
CREATE POLICY "Users can view tiktok post queue for their projects" ON public.tiktok_post_queue
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_post_queue.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert tiktok post queue for their projects" ON public.tiktok_post_queue
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_post_queue.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update tiktok post queue for their projects" ON public.tiktok_post_queue
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_post_queue.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete tiktok post queue for their projects" ON public.tiktok_post_queue
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = tiktok_post_queue.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Add updated_at trigger for both tables
DROP TRIGGER IF EXISTS update_tiktok_accounts_updated_at ON public.tiktok_accounts;
CREATE TRIGGER update_tiktok_accounts_updated_at
    BEFORE UPDATE ON public.tiktok_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tiktok_post_queue_updated_at ON public.tiktok_post_queue;
CREATE TRIGGER update_tiktok_post_queue_updated_at
    BEFORE UPDATE ON public.tiktok_post_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
