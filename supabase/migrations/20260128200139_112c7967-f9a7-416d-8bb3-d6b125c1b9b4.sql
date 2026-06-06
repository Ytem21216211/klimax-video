-- Fix 1: Allow invited users to see project details (for displaying project name)
CREATE POLICY "Invited users can view project details"
ON public.projects
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE project_invitations.project_id = projects.id
      AND lower(project_invitations.email) = lower(auth.email())
      AND project_invitations.status = 'pending'
      AND project_invitations.expires_at > now()
  )
);

-- Fix 2: Allow users to add themselves when accepting a valid invitation
CREATE POLICY "Users can join via invitation"
ON public.project_members
FOR INSERT
WITH CHECK (
  -- User is adding themselves
  user_id = auth.uid()
  AND
  -- They have a valid pending invitation for this project
  EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE project_invitations.project_id = project_members.project_id
      AND lower(project_invitations.email) = lower(auth.email())
      AND project_invitations.status = 'pending'
      AND project_invitations.expires_at > now()
  )
);