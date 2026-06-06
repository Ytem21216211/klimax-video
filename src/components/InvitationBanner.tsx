import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, X, ArrowRight } from "lucide-react";

export function InvitationBanner() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchInvitationCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { count: invitationCount, error } = await supabase
        .from("project_invitations")
        .select("*", { count: "exact", head: true })
        .eq("email", user.email.toLowerCase())
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if (!error && invitationCount) {
        setCount(invitationCount);
      }
    };

    fetchInvitationCount();

    // Subscribe to realtime updates
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const channel = supabase
        .channel("invitation-banner")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_invitations",
          },
          () => {
            // Refetch count on any change
            fetchInvitationCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    setupRealtime();
  }, []);

  if (count === 0 || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20 border-b border-primary/30">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-medium">
              You have{" "}
              <span className="text-primary font-bold">{count}</span>{" "}
              pending project invitation{count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate("/invitations")}
              className="bg-primary/90 hover:bg-primary"
            >
              View Invitations
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setDismissed(true)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
