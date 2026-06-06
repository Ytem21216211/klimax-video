-- Agentik Knowledge System: Universal Core, GM Brains, and Script References
-- 2026-04-20

CREATE TABLE IF NOT EXISTS public.agentik_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('core', 'brain', 'script')),
    gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- This single constraint handles:
    -- 1. One 'core' per user (gamemode_id will be NULL)
    -- 2. One 'brain' per GM per user
    -- 3. One 'script' per GM per user
    CONSTRAINT unique_knowledge_identity UNIQUE NULLS NOT DISTINCT (user_id, type, gamemode_id)
);

-- Enable RLS
ALTER TABLE public.agentik_knowledge ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own knowledge entries"
ON public.agentik_knowledge FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_agentik_knowledge_updated_at
BEFORE UPDATE ON public.agentik_knowledge
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_agentik_knowledge_user_type ON public.agentik_knowledge(user_id, type);
CREATE INDEX idx_agentik_knowledge_gamemode ON public.agentik_knowledge(gamemode_id);
