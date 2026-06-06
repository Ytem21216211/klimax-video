-- Agentik Infrastructure Repair & RLS Strengthening
-- 2026-04-18 Repair Script

-- 1. Ensure Agentik Agents table exists with correct schema
CREATE TABLE IF NOT EXISTS public.agentik_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'strategist',
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'analyzing', 'acting')),
    skills JSONB DEFAULT '[]'::jsonb,
    permission_level TEXT DEFAULT 'contributor' CHECK (permission_level IN ('read-only', 'contributor', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure Agentik Connections table exists (links agents to REAL projects)
CREATE TABLE IF NOT EXISTS public.agentik_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agentik_agents(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, project_id)
);

-- 3. Enable RLS on all Agentik tables
ALTER TABLE public.agentik_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentik_connections ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for agentik_agents
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can manage their own agents" ON public.agentik_agents;
    CREATE POLICY "Users can manage their own agents"
    ON public.agentik_agents FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

-- 5. RLS Policies for agentik_connections
-- A user can see connections if they own the project linked to it.
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can manage connections for their projects" ON public.agentik_connections;
    CREATE POLICY "Users can manage connections for their projects"
    ON public.agentik_connections FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = agentik_connections.project_id
            AND projects.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = agentik_connections.project_id
            AND projects.user_id = auth.uid()
        )
    );
END $$;

-- 6. Ensure the Metrics View has proper permissions
GRANT SELECT ON public.agentik_project_metrics TO authenticated;

-- 7. Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_agentik_agents_user_id ON public.agentik_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agentik_connections_project_id ON public.agentik_connections(project_id);
