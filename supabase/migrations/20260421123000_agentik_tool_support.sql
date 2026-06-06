-- Update agentik_chat_messages to support tool calling
-- 1. Add metadata column
ALTER TABLE public.agentik_chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Update role constraint to include 'tool'
ALTER TABLE public.agentik_chat_messages DROP CONSTRAINT IF EXISTS agentik_chat_messages_role_check;
ALTER TABLE public.agentik_chat_messages ADD CONSTRAINT agentik_chat_messages_role_check CHECK (role IN ('user', 'assistant', 'tool'));
