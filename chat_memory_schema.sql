-- Persistent Chat Memory for Agentik agents
CREATE TABLE IF NOT EXISTS public.agentik_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agentik_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup of conversation history
CREATE INDEX IF NOT EXISTS idx_agentik_chat_agent_user ON public.agentik_chat_messages(agent_id, user_id, created_at);
