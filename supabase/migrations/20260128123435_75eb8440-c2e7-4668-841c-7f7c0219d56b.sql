-- Fix RLS policies for project_invitations to use auth.email() instead of querying auth.users

-- Drop the broken policies
DROP POLICY IF EXISTS "Users can view their own invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Users can respond to their invitations" ON public.project_invitations;

-- Recreate with auth.email() which is available from the JWT
CREATE POLICY "Users can view their own invitations" 
ON public.project_invitations 
FOR SELECT 
USING (lower(email) = lower(auth.email()));

CREATE POLICY "Users can respond to their invitations" 
ON public.project_invitations 
FOR UPDATE 
USING (lower(email) = lower(auth.email()));