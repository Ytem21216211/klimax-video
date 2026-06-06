-- Create voices table for custom and cloned ElevenLabs voices
CREATE TABLE IF NOT EXISTS public.voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  elevenlabs_voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('generated', 'cloned', 'premade')),
  description TEXT,
  preview_url TEXT, -- URL to a sample audio file
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, elevenlabs_voice_id)
);

-- Enable RLS
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;

-- Policies for voices
CREATE POLICY "Users can view their own voices"
  ON public.voices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voices"
  ON public.voices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voices"
  ON public.voices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voices"
  ON public.voices FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_voices_updated_at
  BEFORE UPDATE ON public.voices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add voice_id to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'voice_id'
  ) THEN
    ALTER TABLE public.projects 
    ADD COLUMN voice_id UUID REFERENCES public.voices(id) ON DELETE SET NULL;
  END IF;
END $$;
