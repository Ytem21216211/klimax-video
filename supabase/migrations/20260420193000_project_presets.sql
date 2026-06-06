-- Project Presets System
-- Allows saving and applying visual/audio configurations across projects

CREATE TABLE IF NOT EXISTS public.project_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    settings JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Ensure preset names are unique per user
    CONSTRAINT unique_preset_name_per_user UNIQUE (user_id, name)
);

-- Enable RLS
ALTER TABLE public.project_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own presets"
ON public.project_presets FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_project_presets_updated_at
BEFORE UPDATE ON public.project_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_project_presets_user ON public.project_presets(user_id);
