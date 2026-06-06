-- VisionClips: Tables for AI-powered automated clipping

CREATE TABLE IF NOT EXISTS public.vision_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    name TEXT NOT NULL,
    description TEXT,
    guide TEXT NOT NULL, -- The "Full Guide" the AI uses to adapt
    server_ip TEXT,
    clipping_sensitivity FLOAT DEFAULT 0.5,
    user_id UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.vision_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    project_id UUID REFERENCES public.vision_projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'kill', 'loot', 'funny', 'render'
    description TEXT,
    confidence FLOAT,
    timestamp_ms BIGINT, -- Offset in the game session
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}', -- Store marker data for Flashback
    is_processed BOOLEAN DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE public.vision_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_events ENABLE ROW LEVEL SECURITY;

-- Simple permissive policies for the marketing agency context
CREATE POLICY "Public full access projects" ON public.vision_projects FOR ALL USING (true);
CREATE POLICY "Public full access events" ON public.vision_events FOR ALL USING (true);
