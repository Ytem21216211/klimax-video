-- Create enum for project member roles
CREATE TYPE public.project_role AS ENUM ('member', 'admin');

-- Create project_members table to store confirmed memberships
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role project_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Create project_invitations table for pending invitations
CREATE TABLE public.project_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(project_id, email)
);

-- Enable RLS on both tables
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is project owner
CREATE OR REPLACE FUNCTION public.is_project_owner(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id
      AND user_id = _user_id
  )
$$;

-- Security definer function to check if user is project admin (owner or admin member)
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role = 'admin'
  )
$$;

-- Security definer function to check if user is project member (owner, admin, or member)
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
  )
$$;

-- RLS Policies for project_members

-- Project owners and admins can view all members
CREATE POLICY "Project admins can view members"
ON public.project_members FOR SELECT
USING (public.is_project_member(auth.uid(), project_id));

-- Only project admins can add members
CREATE POLICY "Project admins can add members"
ON public.project_members FOR INSERT
WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- Only project admins can update member roles
CREATE POLICY "Project admins can update members"
ON public.project_members FOR UPDATE
USING (public.is_project_admin(auth.uid(), project_id));

-- Only project owners can remove members (or members can leave themselves)
CREATE POLICY "Admins can remove members or members can leave"
ON public.project_members FOR DELETE
USING (
  public.is_project_admin(auth.uid(), project_id)
  OR user_id = auth.uid()
);

-- RLS Policies for project_invitations

-- Project admins can view invitations
CREATE POLICY "Project admins can view invitations"
ON public.project_invitations FOR SELECT
USING (public.is_project_admin(auth.uid(), project_id));

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their own invitations"
ON public.project_invitations FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Project admins can create invitations
CREATE POLICY "Project admins can create invitations"
ON public.project_invitations FOR INSERT
WITH CHECK (public.is_project_admin(auth.uid(), project_id));

-- Project admins can update invitations (revoke)
CREATE POLICY "Project admins can update invitations"
ON public.project_invitations FOR UPDATE
USING (public.is_project_admin(auth.uid(), project_id));

-- Users can update invitations sent to them (accept/decline)
CREATE POLICY "Users can respond to their invitations"
ON public.project_invitations FOR UPDATE
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Project admins can delete invitations
CREATE POLICY "Project admins can delete invitations"
ON public.project_invitations FOR DELETE
USING (public.is_project_admin(auth.uid(), project_id));

-- Create indexes for performance
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX idx_project_invitations_project_id ON public.project_invitations(project_id);
CREATE INDEX idx_project_invitations_email ON public.project_invitations(email);
CREATE INDEX idx_project_invitations_status ON public.project_invitations(status);