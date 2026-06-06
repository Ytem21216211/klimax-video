import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Upload,
  Trash2,
  Play,
  Pause,
  Film,
  Zap,
  Timer,
  Tag,
  FolderOpen,
  Sparkles,
  BarChart3,
  Search,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClipPoolItem {
  id: string;
  user_id: string;
  gamemode_id: string | null;
  file_url: string;
  file_name: string | null;
  duration: number | null;
  category: string;
  intensity: string;
  tags: string[] | null;
  used_count: number;
  created_at: string;
}

interface Gamemode {
  id: string;
  name: string;
}

const CATEGORIES = [
  { id: "gameplay", name: "Gameplay", icon: Film },
  { id: "transition", name: "Transition", icon: Zap },
  { id: "b-roll", name: "B-Roll", icon: FolderOpen },
];

const INTENSITIES = [
  { id: "low", name: "Low", description: "Intro/Outro" },
  { id: "medium", name: "Medium", description: "Standard" },
  { id: "high", name: "High", description: "Action" },
];

export default function ClipsFactory() {
  const navigate = useNavigate();
  const [clips, setClips] = useState<ClipPoolItem[]>([]);
  const [gamemodes, setGamemodes] = useState<Gamemode[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedGamemode, setSelectedGamemode] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("gameplay");
  const [selectedIntensity, setSelectedIntensity] = useState<string>("medium");

  const [filterGamemode, setFilterGamemode] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterIntensity, setFilterIntensity] = useState<string>("all");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [clipsRes, gamemodesRes] = await Promise.all([
        supabase.from("clip_pool").select("*").order("created_at", { ascending: false }),
        supabase.from("gamemodes").select("id, name").order("name"),
      ]);

      if (clipsRes.error) throw clipsRes.error;
      if (gamemodesRes.error) throw gamemodesRes.error;

      setClips(clipsRes.data || []);
      setGamemodes(gamemodesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load clips");
    } finally {
      setLoading(false);
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error("Failed to load video"));
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let uploaded = 0;

    try {
      for (const file of Array.from(files)) {
        // PRE-UPLOAD SIZE CHECK (5GB Limit)
        const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB in bytes
        if (file.size > MAX_SIZE) {
          toast.error(`"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed is 5GB.`);
          continue;
        }

        let duration: number | null = null;
        try {
          duration = await getVideoDuration(file);
        } catch (err) {
          console.warn("Could not get duration for", file.name);
        }

        const fileName = `clip-pool/${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("video-clips")
          .upload(fileName, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("clip_pool").insert({
          user_id: user.id,
          gamemode_id: selectedGamemode === "all" ? null : selectedGamemode,
          file_url: fileName,
          file_name: file.name,
          duration,
          category: selectedCategory,
          intensity: selectedIntensity,
          tags: [],
          used_count: 0,
        });

        if (dbError) throw dbError;

        uploaded++;
        setUploadProgress(Math.round((uploaded / totalFiles) * 100));
      }

      toast.success(`Uploaded ${uploaded} clip${uploaded > 1 ? "s" : ""}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchData();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload clips");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (clip: ClipPoolItem) => {
    if (!confirm(`Delete "${clip.file_name}"?`)) return;

    try {
      await supabase.storage.from("video-clips").remove([clip.file_url]);
      const { error } = await supabase
        .from("clip_pool")
        .delete()
        .eq("id", clip.id);

      if (error) throw error;
      toast.success("Clip deleted");
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete clip");
    }
  };

  const handlePlay = async (clip: ClipPoolItem) => {
    if (playingId === clip.id) {
      videoRef.current?.pause();
      setPlayingId(null);
      return;
    }

    try {
      const { data } = await supabase.storage
        .from("video-clips")
        .createSignedUrl(clip.file_url, 60);

      if (data?.signedUrl) {
        if (videoRef.current) {
          videoRef.current.pause();
        }
        videoRef.current = document.createElement("video");
        videoRef.current.src = data.signedUrl;
        videoRef.current.onended = () => setPlayingId(null);
        videoRef.current.play();
        setPlayingId(clip.id);
      }
    } catch (error) {
      console.error("Play error:", error);
      toast.error("Failed to play clip");
    }
  };

  const updateClipProperty = async (
    clipId: string,
    property: "category" | "intensity" | "gamemode_id",
    value: string | null
  ) => {
    try {
      const { error } = await supabase
        .from("clip_pool")
        .update({ [property]: value })
        .eq("id", clipId);

      if (error) throw error;

      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, [property]: value } : c))
      );
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update clip");
    }
  };

  const filteredClips = clips.filter((clip) => {
    if (filterGamemode !== "all" && clip.gamemode_id !== filterGamemode) return false;
    if (filterCategory !== "all" && clip.category !== filterCategory) return false;
    if (filterIntensity !== "all" && clip.intensity !== filterIntensity) return false;
    return true;
  });

  const getGamemodeName = useCallback(
    (id: string | null) => gamemodes.find((g) => g.id === id)?.name || "Global",
    [gamemodes]
  );

  const stats = {
    total: clips.length,
    byIntensity: {
      low: clips.filter((c) => c.intensity === "low").length,
      medium: clips.filter((c) => c.intensity === "medium").length,
      high: clips.filter((c) => c.intensity === "high").length,
    },
    totalDuration: clips.reduce((sum, c) => sum + (c.duration || 0), 0),
  };

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
        <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
      </div>

      <div className="container max-w-7xl mx-auto py-12 px-6 relative z-10">

        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-20 animate-in fade-in slide-in-from-top-8 duration-1000 px-4">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] uppercase italic leading-none mb-2">
                Clips Factory
              </h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-60">
                Visual Component Warehouse v1.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group w-full md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-white transition-colors" />
              <Input
                placeholder="Search pool..."
                className="pl-12 h-12 bg-white/[0.03] border-white/10 rounded-2xl focus:ring-2 focus:ring-[#b638fc]/50 text-sm font-medium transition-all"
              />
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16 px-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          <div className="p-6 rounded-[32px] bg-[#161224]/80 backdrop-blur-3xl border border-white/10 shadow-2xl group hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b38fc] to-[#b638fc] flex items-center justify-center shadow-lg">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Pool</span>
            </div>
            <p className="text-4xl font-black tracking-tighter text-white">{stats.total}</p>
          </div>

          <div className="p-6 rounded-[32px] bg-[#161224]/80 backdrop-blur-3xl border border-white/10 shadow-2xl group hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#10b981]/20 flex items-center justify-center border border-[#10b981]/30">
                <Timer className="w-5 h-5 text-[#10b981]" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Runtime</span>
            </div>
            <p className="text-4xl font-black tracking-tighter text-white">{Math.round(stats.totalDuration)}<span className="text-sm ml-1 opacity-20">sec</span></p>
          </div>

          <div className="p-6 rounded-[32px] bg-[#161224]/80 backdrop-blur-3xl border border-white/10 shadow-2xl group hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#e324ff]/20 flex items-center justify-center border border-[#e324ff]/30">
                <Zap className="w-5 h-5 text-[#e324ff]" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">High Intensity</span>
            </div>
            <p className="text-4xl font-black tracking-tighter text-white">{stats.byIntensity.high}</p>
          </div>

          <div className="p-6 rounded-[32px] bg-[#161224]/80 backdrop-blur-3xl border border-white/10 shadow-2xl group hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#3b38fc]/20 flex items-center justify-center border border-[#3b38fc]/30">
                <Tag className="w-5 h-5 text-[#3b38fc]" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Low Intensity</span>
            </div>
            <p className="text-4xl font-black tracking-tighter text-white">{stats.byIntensity.low}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 px-4">
          {/* UPLOAD PANEL */}
          <div className="lg:col-span-4 space-y-8 animate-in fade-in slide-in-from-left-12 duration-1000 delay-400">
            <div className="sticky top-32 p-1 rounded-[40px] bg-gradient-to-br from-white/10 to-transparent">
              <Card className="bg-[#161224]/90 backdrop-blur-3xl border border-white/5 rounded-[39px] overflow-hidden shadow-2xl">
                <CardHeader className="p-10 pb-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#3b38fc] via-[#b638fc] to-[#fca5fc] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.4)]">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tighter text-white uppercase italic">Inbound Hub</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-10 pt-0 space-y-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-1">Frequency Source (GM)</Label>
                      <Select value={selectedGamemode} onValueChange={setSelectedGamemode}>
                        <SelectTrigger className="h-14 bg-white/[0.03] border-white/10 rounded-2xl focus:ring-2 focus:ring-[#b638fc]/50 transition-all font-bold">
                          <SelectValue placeholder="Select Source" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#161224] border-white/10 rounded-2xl shadow-2xl text-white">
                          <SelectItem value="all" className="hover:bg-white/10 cursor-pointer">Global Array</SelectItem>
                          {gamemodes.map((gm) => (
                            <SelectItem key={gm.id} value={gm.id} className="hover:bg-white/10 cursor-pointer">{gm.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Domain</Label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="h-12 bg-white/[0.03] border-white/10 rounded-xl font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#161224] border-white/10 text-white">
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id} className="cursor-pointer">{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Energy</Label>
                        <Select value={selectedIntensity} onValueChange={setSelectedIntensity}>
                          <SelectTrigger className="h-12 bg-white/[0.03] border-white/10 rounded-xl font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#161224] border-white/10 text-white">
                            {INTENSITIES.map((int) => (
                              <SelectItem key={int.id} value={int.id} className="cursor-pointer">{int.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={handleUpload}
                      disabled={uploading}
                      className="hidden"
                    />

                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-[24px] blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="relative w-full h-16 bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-black rounded-[24px] shadow-2xl border-none transition-all group-hover:scale-[1.03] flex flex-col items-center justify-center"
                      >
                        {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                          <>
                            <div className="flex items-center gap-3">
                              <Film className="w-5 h-5" />
                              <span className="uppercase tracking-[0.2em] text-[12px]">Inject Component</span>
                            </div>
                            <span className="text-[9px] opacity-40 font-bold uppercase tracking-widest mt-1">Bulk Upload Compatible</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {uploading && (
                    <div className="space-y-3 animate-pulse">
                      <Progress value={uploadProgress} className="h-2 bg-white/5" />
                      <p className="text-[10px] font-black text-white/40 text-center uppercase tracking-widest">Integrating Module... {uploadProgress}%</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* LIST PANEL */}
          <div className="lg:col-span-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-600 pb-32">
            <div className="bg-[#161224]/40 backdrop-blur-3xl border border-white/5 rounded-[48px] p-10 shadow-2xl overflow-hidden relative">

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 border-b border-white/5 pb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                    <BarChart3 className="w-6 h-6 text-white/40" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tighter italic">Component Reservoir</h3>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.5em]">{filteredClips.length} Units Manifested</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Select value={filterGamemode} onValueChange={setFilterGamemode}>
                    <SelectTrigger className="w-32 h-10 rounded-full bg-white/5 border-white/10 text-[10px] font-black uppercase tracking-widest">
                      <SelectValue placeholder="Domain" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#161224] border-white/10 text-white">
                      <SelectItem value="all">Any Domain</SelectItem>
                      {gamemodes.map((gm) => (
                        <SelectItem key={gm.id} value={gm.id}>{gm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterIntensity} onValueChange={setFilterIntensity}>
                    <SelectTrigger className="w-32 h-10 rounded-full bg-white/5 border-white/10 text-[10px] font-black uppercase tracking-widest">
                      <SelectValue placeholder="Energy" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#161224] border-white/10 text-white">
                      <SelectItem value="all">Any Energy</SelectItem>
                      {INTENSITIES.map((int) => (
                        <SelectItem key={int.id} value={int.id}>{int.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-20">
                  <Loader2 className="w-12 h-12 animate-spin" />
                  <p className="text-[10px] font-black tracking-[0.5em] uppercase">Visual Sync In Progress...</p>
                </div>
              ) : (
                <div className="grid gap-6">
                  {filteredClips.map((clip) => (
                    <div key={clip.id} className="group relative p-6 rounded-[32px] bg-[#1a122e]/40 border border-white/5 hover:border-white/20 hover:bg-[#1f1636]/60 transition-all duration-700 shadow-xl overflow-hidden">
                      {/* Liquidity Edge */}
                      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#b638fc]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-center gap-6">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePlay(clip)}
                            className={cn(
                              "w-16 h-16 rounded-[24px] transition-all duration-700 border border-white/10 flex items-center justify-center",
                              playingId === clip.id
                                ? "bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.4)] scale-110"
                                : "bg-white/5 text-white hover:bg-white/10"
                            )}
                          >
                            {playingId === clip.id ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 ml-1 fill-current" />}
                          </Button>

                          <div className="min-w-0">
                            <p className="text-lg font-black tracking-tight text-white mb-2 truncate max-w-xs">{clip.file_name}</p>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-[#b638fc]">{getGamemodeName(clip.gamemode_id)}</span>
                              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-[#ffffff]/40">{clip.category}</span>
                              <span className={cn(
                                "px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest",
                                clip.intensity === 'high' ? "bg-red-500/20 border-red-500/30 text-red-400" :
                                  clip.intensity === 'medium' ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" :
                                    "bg-blue-500/20 border-blue-500/30 text-blue-400"
                              )}>{clip.intensity} energy</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-8 pl-20 md:pl-0">
                          <div className="text-right flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1 italic">Manifest Period</span>
                            <span className="text-xl font-black text-white/80 tracking-tighter">{(clip.duration || 0).toFixed(1)}s</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(clip)}
                              className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center transform group-hover:translate-y-0 translate-y-2"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredClips.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Sparkles className="w-12 h-12 text-white/10 mb-6" />
                  <p className="text-slate-500 font-bold uppercase tracking-[0.5em] text-xs">No component modules detected in filter range</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
    </div>
  );
}
