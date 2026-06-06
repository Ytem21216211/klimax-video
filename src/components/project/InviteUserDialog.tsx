import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2, Mail, Shield, Users, Crown, Trash2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { z } from "zod";

interface InviteUserDialogProps {
  projectId: string;
  projectTitle: string;
}

interface ProjectMember {
  id: string;
  user_id: string;
  role: "member" | "admin";
  joined_at: string;
  profile: {
    username: string | null;
    avatar_url: string | null;
  } | null;
}

interface ProjectInvitation {
  id: string;
  email: string;
  role: "member" | "admin";
  status: string;
  created_at: string;
  expires_at: string;
}

const emailSchema = z.string().email("Please enter a valid email address");

export function InviteUserDialog({ projectId, projectTitle }: InviteUserDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  
  // Team management state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [projectOwner, setProjectOwner] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchTeamData = async () => {
    setLoadingTeam(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Get project owner
      const { data: projectData } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .single();
      
      setProjectOwner(projectData?.user_id || null);

      // Fetch members with profiles
      const { data: membersData, error: membersError } = await supabase
        .from("project_members")
        .select(`
          id,
          user_id,
          role,
          joined_at,
          profile:profiles!project_members_user_id_fkey(username, avatar_url)
        `)
        .eq("project_id", projectId);

      if (membersError) {
        console.error("Error fetching members:", membersError);
      } else {
        // Transform data to handle the profile relationship
        const transformedMembers = (membersData || []).map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          profile: m.profile || null,
        }));
        setMembers(transformedMembers);
      }

      // Fetch pending invitations
      const { data: invitationsData, error: invitationsError } = await supabase
        .from("project_invitations")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "pending");

      if (invitationsError) {
        console.error("Error fetching invitations:", invitationsError);
      } else {
        setInvitations(invitationsData || []);
      }
    } catch (error) {
      console.error("Error fetching team data:", error);
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      fetchTeamData();
    } else {
      // Reset form on close
      setEmail("");
      setRole("member");
      setEmailError(null);
    }
  };

  const validateEmail = (value: string) => {
    try {
      emailSchema.parse(value);
      setEmailError(null);
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setEmailError(e.errors[0].message);
      }
      return false;
    }
  };

  const handleInvite = async () => {
    if (!validateEmail(email)) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      // Check if invitation already exists
      const { data: existingInvite } = await supabase
        .from("project_invitations")
        .select("id, status")
        .eq("project_id", projectId)
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existingInvite) {
        if (existingInvite.status === "pending") {
          toast({
            variant: "destructive",
            title: "Already Invited",
            description: "An invitation has already been sent to this email.",
          });
          setSending(false);
          return;
        }
        // Update existing invitation if it was declined/expired
        const { error: updateError } = await supabase
          .from("project_invitations")
          .update({
            role,
            status: "pending",
            invited_by: user.id,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", existingInvite.id);

        if (updateError) throw updateError;
      } else {
        // Create new invitation
        const { error: insertError } = await supabase
          .from("project_invitations")
          .insert({
            project_id: projectId,
            email: email.toLowerCase(),
            role,
            invited_by: user.id,
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Invitation Sent!",
        description: `${email} has been invited as ${role}.`,
      });

      setEmail("");
      setRole("member");
      fetchTeamData();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send Invitation",
        description: error.message || "Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("project_invitations")
        .delete()
        .eq("id", invitationId);

      if (error) throw error;

      toast({
        title: "Invitation Revoked",
        description: "The invitation has been cancelled.",
      });

      fetchTeamData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Revoke",
        description: error.message,
      });
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === projectOwner) {
      toast({
        variant: "destructive",
        title: "Cannot Remove Owner",
        description: "The project owner cannot be removed.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Member Removed",
        description: "The team member has been removed from the project.",
      });

      fetchTeamData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Remove",
        description: error.message,
      });
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: "member" | "admin") => {
    try {
      const { error } = await supabase
        .from("project_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Role Updated",
        description: `Member role changed to ${newRole}.`,
      });

      fetchTeamData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Update",
        description: error.message,
      });
    }
  };

  const isOwner = currentUserId === projectOwner;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-border/50 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] glass-effect-strong border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Access
          </DialogTitle>
          <DialogDescription>
            Manage who can access "{projectTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Invite Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={() => email && validateEmail(email)}
                className={`bg-muted/30 border-border/50 ${emailError ? "border-destructive" : ""}`}
              />
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                Permission Level
              </Label>
              <Select value={role} onValueChange={(v: "member" | "admin") => setRole(v)}>
                <SelectTrigger id="role" className="bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <div>
                        <span className="font-medium">Member</span>
                        <p className="text-xs text-muted-foreground">Can view and edit videos</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <div>
                        <span className="font-medium">Admin</span>
                        <p className="text-xs text-muted-foreground">Full access including team management</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleInvite}
              disabled={!email || sending}
              className="w-full bg-gradient-to-r from-primary to-primary/80"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* Current Team */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Users className="w-4 h-4" />
              Current Team
            </Label>

            {loadingTeam ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {/* Owner (always shown) */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Crown className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">You (Owner)</p>
                        <p className="text-xs text-muted-foreground">Full control</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-primary/50 text-primary">
                      Owner
                    </Badge>
                  </div>

                  {/* Team Members */}
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                          <Users className="w-4 h-4 text-secondary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {member.profile?.username || "User"}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {member.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          <>
                            <Select
                              value={member.role}
                              onValueChange={(v: "member" | "admin") =>
                                handleUpdateRole(member.id, v)
                              }
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveMember(member.id, member.user_id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {members.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No team members yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Pending Invitations
                </Label>
                <ScrollArea className="max-h-[120px]">
                  <div className="space-y-2">
                    {invitations.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-accent/10 border border-accent/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-accent" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{invite.email}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {invite.role} • Pending
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevokeInvitation(invite.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <p className="text-xs text-muted-foreground">
            Invitations expire after 7 days
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
