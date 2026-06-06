-- Command Center Optimization: Indices for high-frequency polling
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);
