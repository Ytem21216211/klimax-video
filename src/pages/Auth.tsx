import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Zap, ShieldCheck, Lock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

// Single-user local studio: login is JUST a password. The account is fixed and
// auto-provisioned on first sign-in; only this password unlocks it.
const APP_EMAIL = "studio@klimax.local";
const APP_PASSWORD = "Mdpdu95Aa.";

const Auth = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/projets");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate("/projets");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password !== APP_PASSWORD) {
      toast({ variant: "destructive", title: "Mot de passe incorrect", description: "Réessaie." });
      return;
    }
    setLoading(true);
    try {
      // Sign in with the fixed account; create it on the very first launch.
      let { error } = await supabase.auth.signInWithPassword({ email: APP_EMAIL, password: APP_PASSWORD });
      if (error) {
        await supabase.auth.signUp({ email: APP_EMAIL, password: APP_PASSWORD });
        ({ error } = await supabase.auth.signInWithPassword({ email: APP_EMAIL, password: APP_PASSWORD }));
        if (error) throw error;
      }
      toast({ title: "Bienvenue !", description: "Accès au studio accordé." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Connexion impossible", description: error?.message || "Réessaie." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8 relative overflow-hidden font-sans selection:bg-white/10 slate-grid">
      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[20%] w-[1000px] h-[1000px] bg-white/[0.02] rounded-full blur-[250px]" />
      </div>

      <div className="w-full max-w-lg relative z-10 animate-in fade-in zoom-in-95 duration-1000">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-16 space-y-4">
          <Link to="/" className="group flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-[30px] bg-white/5 flex items-center justify-center border border-white/10 relative group-hover:scale-110 transition-all duration-700">
              <Zap className="w-10 h-10 text-white fill-current drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]" />
            </div>
            <div>
              <h1 className="text-5xl font-black tracking-[-0.06em] italic uppercase text-white leading-none">Klimax video</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-[0.6em] font-black text-center mt-3">AI video studio</p>
            </div>
          </Link>
        </div>

        <div className="p-[1px] rounded-[48px] bg-white/10 shadow-2xl">
          <Card className="liquid-glass border-none rounded-[47px] overflow-hidden">
            <CardHeader className="p-10 pb-6">
              <CardTitle className="text-3xl font-black tracking-tight text-white uppercase italic text-center">Creator access</CardTitle>
              <CardDescription className="text-center text-white/20 font-bold uppercase tracking-widest text-[9px] mt-2">
                Entre le mot de passe pour ouvrir le studio
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 pt-0">
              <form onSubmit={handleSignIn} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Mot de passe</Label>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#b638fc] transition-colors" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      className="h-14 bg-white/[0.03] border-white/10 rounded-2xl pl-14 focus:ring-1 focus:ring-white/40 transition-all font-bold"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full h-16 bg-gradient-to-r from-[#3b38fc] via-[#b638fc] to-[#fca5fc] hover:from-[#4542fc] hover:to-[#bf42fc] text-white font-black rounded-2xl shadow-[0_0_30px_rgba(182,56,252,0.3)] transition-all hover:scale-[1.02] active:scale-95 text-[11px] tracking-[0.2em] uppercase mt-4">
                  {loading ? "Authenticating..." : (
                    <div className="flex items-center gap-3">
                      <span>Open studio</span>
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
            <ShieldCheck className="w-4 h-4" />
            <span>Secure creator workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
