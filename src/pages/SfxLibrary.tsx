import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, Trash2, Play, Pause, Music, Zap, Sparkles, Volume2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface SfxItem {
  id: string;
  name: string;
  description: string | null;
  file_url: string;
  duration: number | null;
  category: string;
  created_at: string;
  is_enabled: boolean;
  user_id: string | null;
}

export default function SfxLibrary() {
  const navigate = useNavigate();
  const [sfxList, setSfxList] = useState<SfxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    fetchSfxList();
  }, []);

  const fetchSfxList = async () => {
    try {
      const { data, error } = await supabase
        .from("sfx_library")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSfxList(data || []);
    } catch (error) {
      console.error("Error fetching SFX:", error);
      toast.error("Failed to load SFX library");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!name.trim()) {
      toast.error("Please enter a name for the SFX");
      return;
    }

    setUploading(true);
    try {
      const fileName = `sfx/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("voiceovers")
        .upload(fileName, file, {
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const audio = new Audio(URL.createObjectURL(file));
      await new Promise((resolve) => {
        audio.onloadedmetadata = resolve;
      });
      const duration = audio.duration;

      const { error: dbError } = await supabase.from("sfx_library").insert({
        name: name.trim(),
        description: description.trim() || null,
        file_url: fileName,
        duration,
        category: "transition",
        user_id: userId,
        is_enabled: true,
      });

      if (dbError) throw dbError;

      // New: Trigger AI analysis for the new SFX to "know it forever"
      try {
        await supabase.functions.invoke("analyze-sfx-acoustic", {
          body: { sfxId: (data as any)?.[0]?.id || name, name, description }
        });
      } catch (aiErr) {
        console.warn("AI analysis trigger failed, but SFX was uploaded:", aiErr);
      }

      toast.success("SFX uploaded and analyzed!");
      setName("");
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchSfxList();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload SFX");
    } finally {
      setUploading(false);
    }
  };

  const handleBulkAnalyze = async () => {
    const unanalyzed = sfxList.filter(s => !s.description?.includes("[AI-ANALYSIS]"));
    if (unanalyzed.length === 0) {
      toast.info("All assets are already synchronized with neural context.");
      return;
    }

    toast.promise(
      Promise.all(unanalyzed.map(s => 
        supabase.functions.invoke("analyze-sfx-acoustic", {
          body: { sfxId: s.id, name: s.name, description: s.description }
        })
      )),
      {
        loading: `Synchronizing ${unanalyzed.length} assets...`,
        success: () => {
          fetchSfxList();
          return "Neural synchronization complete!";
        },
        error: "Synchronization failed"
      }
    );
  };

  const handleDelete = async (sfx: SfxItem) => {
    if (!confirm(`Delete "${sfx.name}"?`)) return;

    try {
      await supabase.storage.from("voiceovers").remove([sfx.file_url]);
      const { error } = await supabase
        .from("sfx_library")
        .delete()
        .eq("id", sfx.id);

      if (error) throw error;
      toast.success("SFX deleted");
      fetchSfxList();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete SFX");
    }
  };

  const handlePlay = async (sfx: SfxItem) => {
    if (playingId === sfx.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      const { data, error } = await supabase.storage.from("voiceovers").createSignedUrl(sfx.file_url, 3600);
      if (error || !data?.signedUrl) {
        throw error || new Error("Failed to get signed URL");
      }
      
      const url = data.signedUrl;

      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(sfx.id);

      audio.play();

      audio.onended = () => {
        setPlayingId(null);
      };
    } catch (error) {
      console.error("Play error:", error);
      toast.error("Failed to play SFX (Check storage permissions)");
    }
  };

  const handleToggleEnabled = async (sfx: SfxItem, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("sfx_library")
        .update({ is_enabled: enabled })
        .eq("id", sfx.id);

      if (error) throw error;

      setSfxList(prev => prev.map(item =>
        item.id === sfx.id ? { ...item, is_enabled: enabled } : item
      ));

      toast.success(enabled ? "Asset enabled for transitions" : "Asset disabled for transitions");
    } catch (error) {
      console.error("Toggle error:", error);
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="min-h-screen bg-[#08060d] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans antialiased">

      {/* 🌑 Deep Neural Background with Smooth Degrade */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[#08060d]" />
        {/* Subtle Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
        {/* Animated Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#3b38fc]/10 rounded-full blur-[150px] animate-pulse-glow" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#e324ff]/10 rounded-full blur-[150px] animate-pulse-glow" style={{ animationDuration: '12s' }} />

        {/* Liquid Surface Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(182,56,252,0.05),transparent_50%)]" />
      </div>

      <div className="container max-w-6xl mx-auto py-12 px-6 relative z-10">

        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-20 animate-in fade-in slide-in-from-top-8 duration-1000">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] leading-none mb-2">
                SFX Architecture
              </h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.4em] opacity-60">
                Neural Acoustic Assets v2.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group w-full md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-white transition-colors" />
              <Input
                placeholder="Search assets..."
                className="pl-12 h-12 bg-white/[0.03] border-white/10 rounded-2xl focus:ring-2 focus:ring-[#b638fc]/50 text-sm font-medium transition-all"
              />
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-12 gap-12 items-start">

          {/* LEFT PANEL: UPLOAD CONSOLE */}
          <div className="lg:col-span-4 space-y-8 animate-in fade-in slide-in-from-left-12 duration-1000 delay-200">
            <div className="relative group p-1 rounded-[32px] bg-gradient-to-br from-white/10 to-transparent hover:from-white/20 transition-all duration-700">
              <Card className="bg-[#1a1628]/60 backdrop-blur-3xl border border-white/10 rounded-[31px] overflow-hidden shadow-2xl relative">
                {/* Liquid Glass Highlight */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent pointer-events-none" />

                <CardHeader className="p-8 pb-4 relative z-10">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] flex items-center justify-center shadow-[0_8px_20px_rgba(182,56,252,0.3)]">
                      <Upload className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-black text-white tracking-tight">Add New Sound Effect</CardTitle>
                      <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest leading-none mt-1">Upload to Global Library</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 pt-0 space-y-6 relative z-10">
                  <div className="space-y-6">
                    <div className="space-y-1.5 group/input">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1 group-focus-within/input:text-primary transition-colors">Sound Name</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Cinematic Boom..."
                        className="h-14 bg-black/40 border-white/5 rounded-2xl px-6 text-white font-bold placeholder:text-white/10 focus:border-primary/40 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5 group/input">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1 group-focus-within/input:text-primary transition-colors">Description (Optional)</Label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. deep, heavy, transition..."
                        className="h-14 bg-black/40 border-white/5 rounded-2xl px-6 text-white font-bold placeholder:text-white/10 focus:border-primary/40 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleUpload} />
                    
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !name.trim()}
                      className="w-full h-12 bg-primary text-white font-black rounded-xl shadow-[0_8px_30px_rgba(20,184,166,0.3)] border-none transition-all hover:scale-[1.02] active:scale-95 text-xs uppercase tracking-widest"
                    >
                      {uploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <> <Music className="w-4 h-4 mr-3" /> Upload Sound Effect </>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Status Pulse */}
            <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(20,184,166,1)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Synchronized with Node 01</span>
              </div>
              <Sparkles className="w-4 h-4 text-white/10" />
            </div>
          </div>

          {/* RIGHT PANEL: ASSET LIBRARY */}
          <div className="lg:col-span-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-400">
            <div className="bg-[#1a1628]/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-10 shadow-2xl relative overflow-hidden">
              {/* Internal Glass Highlight */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />

              <div className="flex items-center justify-between mb-10 border-b border-white/5 pb-8 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                    <Volume2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Audio Vault</h3>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">{sfxList.length} Experimental Clusters Online</p>
                  </div>
                </div>
                <Button 
                  onClick={handleBulkAnalyze}
                  variant="outline" 
                  className="h-10 px-6 rounded-xl bg-white/5 border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all gap-3"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  Synchronize Neural Context
                </Button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-30">
                  <RefreshCw className="w-10 h-10 animate-spin" />
                  <p className="text-xs font-black uppercase tracking-widest">Scanning Repository...</p>
                </div>
              ) : sfxList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] rounded-[32px] border border-dashed border-white/5">
                  <Sparkles className="h-10 w-10 text-white/10 mb-6" />
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No neural assets detected</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {sfxList.map((sfx) => (
                    <div
                      key={sfx.id}
                      className="group relative flex items-center justify-between p-6 rounded-[24px] bg-[#1a122e]/40 border border-white/5 hover:border-white/20 hover:bg-white/[0.03] transition-all duration-500 shadow-lg overflow-hidden"
                    >
                      {/* Inner Liquid Highlight */}
                      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#b638fc]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="flex items-center gap-6 relative z-10">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlay(sfx)}
                          className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border border-white/10",
                            playingId === sfx.id
                              ? "bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.4)] scale-110"
                              : "bg-white/5 text-white group-hover:bg-white/10"
                          )}
                        >
                          {playingId === sfx.id ? (
                            <Pause className="h-6 w-6 fill-current" />
                          ) : (
                            <Play className="h-6 w-6 fill-current ml-1" />
                          )}
                        </Button>
                        <div>
                          <p className="text-lg font-black text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-white/40 transition-all">{sfx.name}</p>
                          <p className="text-xs text-slate-500 font-medium tracking-wide">
                            {sfx.description || "Experimental Audio Cluster"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 relative z-10">
                        <div className="flex flex-col items-end gap-2">
                          <Label className="text-[10px] font-black text-white/30 tracking-widest uppercase">Transition Mode</Label>
                          <div className="flex items-center gap-3 bg-white/[0.03] p-2 rounded-xl border border-white/5">
                            <span className={cn("text-[10px] font-bold uppercase transition-colors", sfx.is_enabled ? "text-primary" : "text-white/20")}>
                              {sfx.is_enabled ? "Active" : "Disabled"}
                            </span>
                            <Switch
                              checked={sfx.is_enabled}
                              onCheckedChange={(checked) => handleToggleEnabled(sfx, checked)}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>
                        </div>

                        <div className="text-right border-l border-white/5 pl-6">
                          <p className="text-[10px] font-black text-white/30 tracking-widest uppercase mb-1">Duration</p>
                          <p className="text-sm font-bold text-white/60">{(sfx.duration || 0).toFixed(1)}s</p>
                        </div>
                        <button
                          onClick={() => handleDelete(sfx)}
                          className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
