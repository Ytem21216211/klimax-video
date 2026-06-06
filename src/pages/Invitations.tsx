import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Check,
  X,
  Loader2,
  Users,
  Sparkles,
  LogOut,
  Calendar,
  Shield,
  Clock,
  Zap,
  UserPlus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PendingInvitation {
  id: string;
  project_id: string;
  email: string;
  role: "member" | "admin";
  status: string;
  created_at: string;
  expires_at: string;
  project: {
    title: string;
    user_id: string;
  } | null;
  inviter: {
    username: string | null;
  } | null;
}

const Invitations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      await fetchInvitations(session.user.email || "");
    };
    checkAuthAndFetch();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchInvitations = async (email: string) => {
    try {
      const { data, error } = await supabase
        .from("project_invitations")
        .select(`
          id, project_id, email, role, status, created_at, expires_at,
          project:projects!project_invitations_project_id_fkey(title, user_id),
          inviter:profiles!project_invitations_invited_by_fkey(username)
        `)
        .eq("email", email.toLowerCase())
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      const transformedData = (data || []).map((inv: any) => ({
        id: inv.id, project_id: inv.project_id, email: inv.email, role: inv.role, status: inv.status, created_at: inv.created_at, expires_at: inv.expires_at, project: inv.project || null, inviter: inv.inviter || null,
      }));
      setInvitations(transformedData);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load invitations" });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitation: PendingInvitation) => {
    setProcessingId(invitation.id);
    try {
      const { error: memberError } = await supabase.from("project_members").insert({ project_id: invitation.project_id, user_id: user.id, role: invitation.role, invited_by: invitation.project?.user_id });
      const isDuplicateError = memberError?.code === "23505" || memberError?.message?.includes("duplicate key") || memberError?.message?.includes("unique constraint");
      if (memberError && !isDuplicateError) throw memberError;
      const { error: updateError } = await supabase.from("project_invitations").update({ status: "accepted" }).eq("id", invitation.id);
      if (updateError) throw updateError;
      toast({ title: "Invitation Accepted! 🎉", description: `You now have access to "${invitation.project?.title}"` });
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
      setTimeout(() => { navigate(`/project/${invitation.project_id}`); }, 1000);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to Accept", description: error.message || "Please try again" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invitation: PendingInvitation) => {
    setProcessingId(invitation.id);
    try {
      const { error } = await supabase.from("project_invitations").update({ status: "declined" }).eq("id", invitation.id);
      if (error) throw error;
      toast({ title: "Invitation Declined", description: "You've declined the invitation." });
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getDaysRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0916] flex items-center justify-center">
        <div className="text-center space-y-4 animate-pulse">
          <div className="w-20 h-20 rounded-[30px] bg-gradient-to-br from-[#3b38fc] via-primary to-[#2a0845] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(182,56,252,0.5)]">
            <UserPlus className="w-10 h-10 text-white" />
          </div>
          <p className="text-[10px] font-black text-[#e0aaff]/60 uppercase tracking-[0.5em]">Fetching Pending Invites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
        <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
      </div>

      <header className="sticky top-0 z-50 bg-[#0c0916]/80 backdrop-blur-3xl border-b border-white/5 h-24 flex items-center">
        <div className="container mx-auto px-8 flex items-center justify-between gap-10">
          <div className="flex items-center gap-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all font-black"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3b38fc] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_30px_rgba(182,56,252,0.4)] border border-white/20">
                <Mail className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-[-0.04em] italic uppercase text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] mb-1">Invitations</h1>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em]">
                  {invitations.length} Neural Link Request{invitations.length !== 1 ? "s" : ""} Active
                </p>
              </div>
            </div>
          </div>
          <Button onClick={handleSignOut} variant="ghost" className="h-12 px-8 bg-white/[0.03] border border-white/10 text-white font-bold rounded-full shadow-lg transition-all hover:bg-red-500/10 hover:border-red-500/20 uppercase text-[10px] tracking-widest gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-8 py-16 max-w-4xl relative z-10 pb-32">
        {invitations.length === 0 ? (
          <div className="p-1 rounded-[48px] bg-gradient-to-br from-white/10 to-transparent">
            <Card className="bg-[#161224]/90 backdrop-blur-3xl border border-white/5 rounded-[47px] text-center py-32 px-10">
              <CardContent>
                <div className="w-24 h-24 rounded-[32px] bg-white/[0.03] shadow-2xl border border-white/10 flex items-center justify-center mx-auto mb-10">
                  <Mail className="w-10 h-10 text-white/10" />
                </div>
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">No Pending Signals</h3>
                <p className="text-[#e0aaff]/40 font-bold text-sm mb-12 max-w-sm mx-auto uppercase tracking-wide">
                  New collaborative protocols will manifest here once initialized by external peers.
                </p>
                <Button onClick={() => navigate("/dashboard")} className="h-14 px-12 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black rounded-full transition-all uppercase text-[11px] tracking-[0.2em] italic">
                  <ArrowLeft className="w-4 h-4 mr-3" />
                  Return to Terminal
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            {invitations.map((invitation) => {
              const daysRemaining = getDaysRemaining(invitation.expires_at);
              const isProcessing = processingId === invitation.id;

              return (
                <div key={invitation.id} className="p-1 rounded-[40px] bg-gradient-to-br from-white/10 to-transparent hover:from-white/20 transition-all duration-700">
                  <Card className="bg-[#161224]/95 backdrop-blur-3xl border-none rounded-[39px] overflow-hidden shadow-2xl">
                    <CardHeader className="p-10 pb-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-2xl bg-[#b638fc]/10 border border-[#b638fc]/20 flex items-center justify-center text-[#b638fc] shadow-[0_0_20px_rgba(182,56,252,0.2)]">
                            <Users className="w-8 h-8" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-black italic uppercase tracking-tight text-white mb-2 leading-none">
                              {invitation.project?.title || "Classified Array"}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
                              <span>Origin: {invitation.inviter?.username || "Neural Unknown"}</span>
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "h-10 px-6 rounded-full font-black uppercase tracking-[0.2em] text-[9px] border-none shadow-xl",
                          invitation.role === "admin" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          <Shield className="w-3.5 h-3.5 mr-2" />
                          {invitation.role} Level
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-10 pt-4 space-y-10">
                      <div className="flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-[#e0aaff]/40 px-2">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4" />
                          <span>Sent {formatDate(invitation.created_at)}</span>
                        </div>
                        <div className="w-px h-4 bg-white/5" />
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4" />
                          <span className={cn(daysRemaining <= 2 ? "text-red-500" : "text-white/40")}>
                            {daysRemaining} Spectral Day{daysRemaining !== 1 ? "s" : ""} Remaining
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <Button
                          onClick={() => handleAccept(invitation)}
                          disabled={isProcessing}
                          className="flex-1 h-16 bg-gradient-to-r from-[#3b38fc] via-[#b638fc] to-[#fca5fc] hover:from-[#4542fc] hover:to-[#bf42fc] text-white font-black rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-95 text-[11px] tracking-[0.2em] uppercase"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                          ) : (
                            <Check className="w-5 h-5 mr-3" />
                          )}
                          Invoke Acceptance
                        </Button>
                        <Button
                          onClick={() => handleDecline(invitation)}
                          disabled={isProcessing}
                          variant="outline"
                          className="flex-1 h-16 border-white/5 bg-white/5 text-white/40 font-black rounded-2xl hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all uppercase text-[11px] tracking-[0.2em]"
                        >
                          <X className="w-5 h-5 mr-3" />
                          Reject Protocol
                        </Button>
                      </div>

                      <div className="pt-6 border-t border-white/5 flex items-center justify-center gap-3 opacity-20 group-hover:opacity-40 transition-opacity">
                        <Zap className="w-3.5 h-3.5" />
                        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-center">
                          {invitation.role === "admin"
                            ? "Full Administrative Synthesis Authority"
                            : "Limited Content Manipulation Access"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
    </div>
  );
};

export default Invitations;
