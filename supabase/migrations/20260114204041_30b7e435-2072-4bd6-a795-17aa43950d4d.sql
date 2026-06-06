-- Create subtitle_presets table for user presets
CREATE TABLE public.subtitle_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{
    "style": "static",
    "bounceRate": 1.0,
    "fontSize": 6,
    "textColor": "#ffffff",
    "strokeEnabled": true,
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "shadowEnabled": true,
    "shadowOpacity": 0.8,
    "shadowBlur": 6,
    "shadowDistance": 4
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subtitle_presets ENABLE ROW LEVEL SECURITY;

-- Users can only see their own presets
CREATE POLICY "Users can view their own presets"
ON public.subtitle_presets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own presets
CREATE POLICY "Users can create their own presets"
ON public.subtitle_presets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own presets
CREATE POLICY "Users can update their own presets"
ON public.subtitle_presets
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own presets
CREATE POLICY "Users can delete their own presets"
ON public.subtitle_presets
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_subtitle_presets_updated_at
BEFORE UPDATE ON public.subtitle_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();