-- Neural Brain: Example Scripts and Hooks
CREATE TABLE IF NOT EXISTS public.training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gamemode_id UUID NOT NULL REFERENCES public.gamemodes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('script', 'hook')),
    content TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- AfterAI: Motion Design Assets and Projects
CREATE TABLE IF NOT EXISTS public.motion_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prompt TEXT,
    config JSONB DEFAULT '{}'::jsonb, -- Store Remotion config/layers
    preview_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motion_designs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own training examples"
ON public.training_examples FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own motion designs"
ON public.motion_designs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_training_examples_updated_at') THEN
        CREATE TRIGGER update_training_examples_updated_at
        BEFORE UPDATE ON public.training_examples
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_motion_designs_updated_at') THEN
        CREATE TRIGGER update_motion_designs_updated_at
        BEFORE UPDATE ON public.motion_designs
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- SFX Variety: Add frequency setting to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sfx_density FLOAT DEFAULT 0.5; -- 0 to 1
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sfx_variety_enabled BOOLEAN DEFAULT true;
