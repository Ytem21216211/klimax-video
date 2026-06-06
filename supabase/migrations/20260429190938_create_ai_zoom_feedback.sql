
-- Create AI Zoom Feedback table
CREATE TABLE IF NOT EXISTS public.ai_zoom_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    video_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- Keeping reference to project if video record not exist
    clip_index INTEGER NOT NULL,
    zoom_type TEXT NOT NULL CHECK (zoom_type IN ('in', 'out', 'none')),
    scale FLOAT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('like', 'dislike')),
    script_context TEXT, -- Optional: store the script snippet for context
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS
ALTER TABLE public.ai_zoom_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see/insert feedback for their own projects
CREATE POLICY "Users can manage their own zoom feedback"
    ON public.ai_zoom_feedback
    FOR ALL
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );
