import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Sparkles, Gamepad2, FileText, Plus, Users, Eye, Zap, Brain, Cpu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GamemodeList } from "@/components/scriptforge/GamemodeList";
import { GamemodeEditor } from "@/components/scriptforge/GamemodeEditor";
import { TrainingScriptList } from "@/components/scriptforge/TrainingScriptList";
import { AddScriptDialog } from "@/components/scriptforge/AddScriptDialog";
import { ImportAccountDialog } from "@/components/scriptforge/ImportAccountDialog";
import { CompetitorsList } from "@/components/scriptforge/CompetitorsList";
import { TrainingExampleManager } from "@/components/scriptforge/TrainingExampleManager";
import { cn } from "@/lib/utils";

interface Gamemode {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const ScriptForge = () => {
  const [user, setUser] = useState<any>(null);
  const [gamemodes, setGamemodes] = useState<Gamemode[]>([]);
  const [selectedGamemode, setSelectedGamemode] = useState<Gamemode | null>(null);
  const [isCreatingGamemode, setIsCreatingGamemode] = useState(false);
  const [isAddingScript, setIsAddingScript] = useState(false);
  const [isImportingAccount, setIsImportingAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      await fetchGamemodes();
    };

    checkAuth();
  }, [navigate]);

  const fetchGamemodes = async () => {
    try {
      const { data, error } = await supabase
        .from("gamemodes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setGamemodes(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load gamemodes",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGamemode = async (name: string, description: string) => {
    try {
      const { data, error } = await supabase
        .from("gamemodes")
        .insert([{ user_id: user.id, name, description }])
        .select()
        .single();

      if (error) throw error;

      setGamemodes([data, ...gamemodes]);
      setIsCreatingGamemode(false);
      toast({ title: "Success!", description: "Gamemode created" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleUpdateGamemode = async (id: string, name: string, description: string) => {
    try {
      const { error } = await supabase
        .from("gamemodes")
        .update({ name, description })
        .eq("id", id);

      if (error) throw error;

      setGamemodes(gamemodes.map((g) => (g.id === id ? { ...g, name, description } : g)));
      setSelectedGamemode(null);
      toast({ title: "Success!", description: "Gamemode updated" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleDeleteGamemode = async (id: string) => {
    try {
      const { error } = await supabase.from("gamemodes").delete().eq("id", id);

      if (error) throw error;

      setGamemodes(gamemodes.filter((g) => g.id !== id));
      toast({ title: "Deleted", description: "Gamemode removed" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0916] flex items-center justify-center">
        <div className="text-center space-y-4">
          {/* Landing Style Loading Vessel */}
          <div className="w-20 h-20 rounded-[30px] bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(182,56,252,0.5)] animate-pulse">
            <Zap className="w-10 h-10 text-white fill-current" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em]">Initializing ScriptForge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
        <div className="absolute top-[0%] left-[10%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-[0%] right-[20%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0c0916]/80 backdrop-blur-2xl border-b border-white/5 h-20 flex items-center">
        <div className="container mx-auto px-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all font-black"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-4">
              {/* Icon Vessel */}
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.3)]">
                <Sparkles className="w-6 h-6 text-white drop-shadow-md" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white leading-none mb-1">
                  Script Forge
                </h1>
                <p className="text-xs font-medium text-slate-500">AI Narrative Generation</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-8 py-12 relative z-10">
        <Tabs defaultValue="gamemodes" className="space-y-12">

          <div className="bg-[#161224]/80 backdrop-blur-3xl border border-white/10 rounded-full p-1.5 inline-flex shadow-2xl">
            <TabsList className="bg-transparent h-12 gap-1">
              <TabsTrigger value="gamemodes" className="rounded-full px-8 h-full data-[state=active]:bg-white data-[state=active]:text-black font-semibold text-xs transition-all">
                <Gamepad2 className="w-3.5 h-3.5 mr-2" />
                Gamemodes
              </TabsTrigger>
              <TabsTrigger value="scripts" className="rounded-full px-8 h-full data-[state=active]:bg-white data-[state=active]:text-black font-semibold text-xs transition-all">
                <FileText className="w-3.5 h-3.5 mr-2" />
                Training Scripts
              </TabsTrigger>
              <TabsTrigger value="neural-brain" className="rounded-full px-8 h-full data-[state=active]:bg-white data-[state=active]:text-black font-semibold text-xs transition-all">
                <Brain className="w-3.5 h-3.5 mr-2" />
                Neural Brain
              </TabsTrigger>
              <TabsTrigger value="competitors" className="rounded-full px-8 h-full data-[state=active]:bg-white data-[state=active]:text-black font-semibold text-xs transition-all">
                <Eye className="w-3.5 h-3.5 mr-2" />
                Competitors
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="gamemodes" className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between px-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter mb-2">Neural Gamemodes</h2>
                <p className="text-slate-400 font-medium opacity-60">Define logic structures for AI content synthesis.</p>
              </div>

              {/* Premium Button Style */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                <Button
                  onClick={() => setIsCreatingGamemode(true)}
                  className="relative h-14 px-10 bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-black rounded-full shadow-2xl border-none transition-all group-hover:scale-[1.02] active:scale-95 text-[12px] tracking-widest uppercase"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Initialize Gamemode
                </Button>
              </div>
            </div>

            {isCreatingGamemode && (
              <div className="bg-[#161224]/80 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8 border-dashed border-white/20">
                <GamemodeEditor
                  onSave={handleCreateGamemode}
                  onCancel={() => setIsCreatingGamemode(false)}
                />
              </div>
            )}

            {selectedGamemode && (
              <div className="bg-[#161224]/80 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8">
                <GamemodeEditor
                  gamemode={selectedGamemode}
                  onSave={(name, desc) => handleUpdateGamemode(selectedGamemode.id, name, desc)}
                  onCancel={() => setSelectedGamemode(null)}
                />
              </div>
            )}

            <div className="grid gap-6">
              <GamemodeList
                gamemodes={gamemodes}
                onEdit={setSelectedGamemode}
                onDelete={handleDeleteGamemode}
              />
            </div>
          </TabsContent>

          <TabsContent value="scripts" className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between px-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter mb-2">Lexicon Training</h2>
                <p className="text-slate-400 font-medium opacity-60">Inject reference modules to clone content patterns.</p>
              </div>
              <div className="flex gap-4">
                <Button
                  onClick={() => setIsImportingAccount(true)}
                  variant="outline"
                  disabled={gamemodes.length === 0}
                  className="h-12 px-8 rounded-full bg-[#161224]/50 border-white/20 text-white font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Uplink Account
                </Button>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                  <Button
                    onClick={() => setIsAddingScript(true)}
                    className="relative h-12 px-8 bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-black rounded-full shadow-2xl border-none transition-all group-hover:scale-[1.02] active:scale-95 text-[10px] tracking-widest uppercase"
                    disabled={gamemodes.length === 0}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Inject Script
                  </Button>
                </div>
              </div>
            </div>

            {gamemodes.length === 0 && (
              <Card className="bg-[#161224]/40 backdrop-blur-3xl border border-dashed border-white/10 rounded-[40px] py-16 text-center">
                <CardContent>
                  <div className="w-16 h-16 rounded-[24px] bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-6">
                    <Gamepad2 className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Initialize a Gamemode to enable Training</p>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6">
              <TrainingScriptList gamemodes={gamemodes} />
            </div>

            <AddScriptDialog
              open={isAddingScript}
              onOpenChange={setIsAddingScript}
              gamemodes={gamemodes}
            />

            <ImportAccountDialog
              open={isImportingAccount}
              onOpenChange={setIsImportingAccount}
              gamemodes={gamemodes}
            />
          </TabsContent>

          <TabsContent value="neural-brain" className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between px-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter mb-2">Neural Brain</h2>
                <p className="text-slate-400 font-medium opacity-60">Inject hand-picked example scripts and hooks to force AI inspiration.</p>
              </div>
            </div>

            <div className="bg-[#161224]/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 shadow-2xl">
              <TrainingExampleManager gamemodes={gamemodes} />
            </div>
          </TabsContent>

          <TabsContent value="competitors" className="animate-in fade-in slide-in-from-bottom-8 duration-700 px-4">
            <div className="bg-[#161224]/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-10 shadow-2xl overflow-hidden">
              <CompetitorsList gamemodes={gamemodes} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
    </div>
  );
};

export default ScriptForge;
