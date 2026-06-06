-- Create gamemodes table for training the AI on different game types
CREATE TABLE public.gamemodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gamemodes ENABLE ROW LEVEL SECURITY;

-- RLS policies for gamemodes
CREATE POLICY "Users can view their own gamemodes" 
ON public.gamemodes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own gamemodes" 
ON public.gamemodes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gamemodes" 
ON public.gamemodes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gamemodes" 
ON public.gamemodes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create training_scripts table for storing transcribed scripts from TikTok
CREATE TABLE public.training_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  transcript TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_scripts ENABLE ROW LEVEL SECURITY;

-- RLS policies for training_scripts
CREATE POLICY "Users can view their own training scripts" 
ON public.training_scripts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own training scripts" 
ON public.training_scripts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training scripts" 
ON public.training_scripts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add description and gamemode_id to projects table
ALTER TABLE public.projects 
ADD COLUMN description TEXT,
ADD COLUMN gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE SET NULL;

-- Add trigger for updating gamemodes updated_at
CREATE TRIGGER update_gamemodes_updated_at
BEFORE UPDATE ON public.gamemodes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();