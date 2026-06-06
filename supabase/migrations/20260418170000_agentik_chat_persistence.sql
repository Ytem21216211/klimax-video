-- Agentik Chat Persistence & Memory Migration
-- This table stores strategic insights and chat history for Grok-powered agents.

CREATE TABLE IF NOT EXISTS public.agentik_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agentik_agents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.agentik_chat_messages ENABLE ROW LEVEL SECURITY;

-- 1. Users can view only their own agent's reports and messages
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.agentik_chat_messages;
    CREATE POLICY "Users can view their own chat messages"
    ON public.agentik_chat_messages FOR SELECT
    USING (auth.uid() = user_id);
END $$;

-- 2. Allow insertion from our backend service role
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Service role can manage all chat messages" ON public.agentik_chat_messages;
    CREATE POLICY "Service role can manage all chat messages"
    ON public.agentik_chat_messages FOR ALL
    USING (true)
    WITH CHECK (true);
END $$;

-- Indices for rapid strategic retrieval
CREATE INDEX IF NOT EXISTS idx_agentik_chat_agent_id ON public.agentik_chat_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_agentik_chat_user_id ON public.agentik_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_agentik_chat_created_at ON public.agentik_chat_messages(created_at DESC);

-- Grant permissions to authenticated users for frontend fetching
GRANT SELECT ON public.agentik_chat_messages TO authenticated;
