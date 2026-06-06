-- Allow project members (not only owners / pending invitees) to view projects
-- This fixes "Failed to load project" after accepting an invitation.

CREATE POLICY "Project members can view projects"
ON public.projects
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
  )
);
