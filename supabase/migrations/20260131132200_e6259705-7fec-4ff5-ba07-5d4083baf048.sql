-- Create clip_pool table for shared clips per gamemode
CREATE TABLE public.clip_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text,
  duration numeric,
  category text DEFAULT 'gameplay',
  intensity text DEFAULT 'medium',
  tags text[],
  used_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clip_pool ENABLE ROW LEVEL SECURITY;

-- RLS policies for clip_pool
CREATE POLICY "Users can view their own clips" 
ON public.clip_pool 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clips" 
ON public.clip_pool 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clips" 
ON public.clip_pool 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clips" 
ON public.clip_pool 
FOR DELETE 
USING (auth.uid() = user_id);