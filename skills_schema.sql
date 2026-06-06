-- 1. SKILLS TABLE (Custom Skills)
CREATE TABLE IF NOT EXISTS public.agentik_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  context JSONB, -- Optional additional context/structured data
  api_key TEXT, -- Individual API key for this skill if needed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. LINK SKILLS TO AGENTS (Association table for custom skills)
CREATE TABLE IF NOT EXISTS public.agentik_agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agentik_agents(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.agentik_skills(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, skill_id)
);
