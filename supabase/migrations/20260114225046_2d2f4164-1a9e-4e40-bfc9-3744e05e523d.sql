-- Create SFX library table for admin-managed sound effects
CREATE TABLE public.sfx_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  duration NUMERIC,
  category TEXT DEFAULT 'transition',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sfx_library ENABLE ROW LEVEL SECURITY;

-- Everyone can read SFX library (needed for video processing)
CREATE POLICY "SFX library is readable by everyone" 
ON public.sfx_library 
FOR SELECT 
USING (true);

-- Only authenticated users can insert (admin check will be in app logic)
CREATE POLICY "Authenticated users can insert SFX" 
ON public.sfx_library 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update SFX" 
ON public.sfx_library 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete SFX" 
ON public.sfx_library 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_sfx_library_updated_at
BEFORE UPDATE ON public.sfx_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();