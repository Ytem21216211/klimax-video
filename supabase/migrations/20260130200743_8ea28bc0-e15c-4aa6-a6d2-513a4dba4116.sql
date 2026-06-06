-- Create admin check function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = _user_id
      AND email = 'roliumgens@gmail.com'
  )
$$;

-- Add policy for admin to view all projects
CREATE POLICY "Admin can view all projects"
ON public.projects
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Add policy for admin to update any project
CREATE POLICY "Admin can update all projects"
ON public.projects
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Add policy for admin to delete any project
CREATE POLICY "Admin can delete all projects"
ON public.projects
FOR DELETE
USING (public.is_admin(auth.uid()));