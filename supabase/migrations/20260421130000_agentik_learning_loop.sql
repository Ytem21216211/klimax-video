-- Agentik Learning Loop: Action Tracking and Collective Wisdom
-- 2026-04-21

-- 1. Create Action Logs Table
CREATE TABLE IF NOT EXISTS public.agentik_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agentik_agents(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- 'style_change', 'render', 'metadata', etc.
    summary_md TEXT NOT NULL, -- Markdown description of the action
    changes JSONB NOT NULL, -- The delta of changes made
    pre_action_metrics JSONB, -- Snapshot of views/momentum at time of action
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agentik_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view action logs for their projects"
ON public.agentik_action_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert action logs for their projects"
ON public.agentik_action_logs FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
);

-- 2. Expand Knowledge Types
-- We need to drop the old check constraint and add a new one including 'collective_learning'
ALTER TABLE public.agentik_knowledge 
DROP CONSTRAINT IF EXISTS agentik_knowledge_type_check;

ALTER TABLE public.agentik_knowledge
ADD CONSTRAINT agentik_knowledge_type_check 
CHECK (type IN ('core', 'brain', 'script', 'collective_learning'));

-- 3. Indexes
CREATE INDEX idx_agentik_action_logs_project ON public.agentik_action_logs(project_id);
CREATE INDEX idx_agentik_action_logs_agent ON public.agentik_action_logs(agent_id);
CREATE INDEX idx_agentik_action_logs_created ON public.agentik_action_logs(created_at);
