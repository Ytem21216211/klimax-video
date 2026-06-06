-- Enable RLS is already on; add missing policies for better UX

-- Allow users to delete voiceovers for their own projects (needed for "Reset Files")
CREATE POLICY "Users can delete voiceovers for their projects"
ON public.voiceovers
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = voiceovers.project_id
      AND projects.user_id = auth.uid()
  )
);
