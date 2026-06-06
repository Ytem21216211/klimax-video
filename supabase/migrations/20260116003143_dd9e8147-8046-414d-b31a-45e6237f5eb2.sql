-- Drop duplicate RLS policies on sfx_library (we already have proper ones)
DROP POLICY IF EXISTS "Users can view all sfx" ON public.sfx_library;
DROP POLICY IF EXISTS "Users can insert sfx" ON public.sfx_library;
DROP POLICY IF EXISTS "Users can delete sfx" ON public.sfx_library;