import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ExternalLink, Sparkles, Clock, Zap, Layers, Search, BarChart3, Globe, Database, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const Imports = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchImports();
  }, []);

  const fetchImports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setImports(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load analyzed videos",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPlatform = (platform: string) => {
    return platform === "youtube" ? "YouTube" : "TikTok";
  };

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
        <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
      </div>

      {/* Header Section */}
      <header className="sticky top-0 z-50 bg-[#0c0916]/80 backdrop-blur-3xl border-b border-white/5 h-24 flex items-center">
        <div className="container mx-auto px-8 flex items-center justify-between gap-10">
          <div className="flex items-center gap-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_30px_rgba(182,56,252,0.4)] border border-white/20 group cursor-pointer hover:scale-110 transition-all duration-500">
                <Layers className="w-7 h-7 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-[-0.04em] italic uppercase text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] leading-none mb-1">
                  Import Hub
                </h1>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em]">Reference Library v4.2</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group w-48 md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-white transition-colors" />
              <Input
                placeholder="Fetch Reference Data..."
                className="pl-12 h-12 bg-white/[0.03] border-white/10 rounded-2xl focus:ring-2 focus:ring-[#b638fc]/50 text-sm font-bold transition-all"
              />
            </div>
            <Button variant="outline" className="h-12 px-8 bg-white/[0.03] border border-white/10 text-white font-bold rounded-full shadow-lg transition-all hover:bg-white/5 uppercase text-[10px] tracking-widest hidden lg:flex">
              Initialize Sync
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-8 py-16 relative z-10 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border border-white/5 animate-ping" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#b638fc]" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Accessing Reference Archive...</p>
          </div>
        ) : imports.length === 0 ? (
          <div className="max-w-4xl mx-auto p-1 rounded-[48px] bg-gradient-to-br from-white/10 to-transparent">
            <div className="bg-[#161224]/90 backdrop-blur-3xl border border-white/5 rounded-[47px] text-center py-32 px-10 group transition-all duration-700 hover:bg-[#161224]/40">
              <div className="w-24 h-24 rounded-[32px] bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-10 group-hover:scale-110 group-hover:bg-[#b638fc]/10 transition-all duration-500 shadow-2xl">
                <Database className="w-10 h-10 text-white/20 group-hover:text-[#b638fc]" />
              </div>
              <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">Archive Empty</h3>
              <p className="text-[#e0aaff]/40 font-bold text-sm mb-10 max-w-md mx-auto uppercase tracking-wide">Synthesize YouTube or TikTok references to populate your neural library.</p>
              <Button onClick={() => navigate("/dashboard")} className="h-14 px-12 bg-gradient-to-r from-[#3b38fc] to-[#b638fc] hover:from-[#4542fc] hover:to-[#bf42fc] text-white font-black rounded-full shadow-[0_0_30px_rgba(182,56,252,0.3)] transition-all uppercase text-[11px] tracking-[0.2em]">
                Invoke Command Center
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {imports.map((item) => (
              <div key={item.id} className="group relative p-1 rounded-[40px] bg-gradient-to-br from-white/10 to-transparent hover:from-white/20 transition-all duration-700 h-full">
                <Card className="h-full bg-[#161224]/90 backdrop-blur-3xl border-none rounded-[39px] overflow-hidden shadow-2xl transition-all duration-500 flex flex-col group-hover:-translate-y-2">
                  <CardHeader className="p-10 pb-6 relative">
                    <div className="flex items-center justify-between mb-6">
                      <Badge variant="outline" className="h-8 px-4 rounded-full border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-[#b638fc]">
                        {formatPlatform(item.source_platform)}
                      </Badge>
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 hover:text-[#b638fc] hover:bg-white/10 transition-all shadow-xl"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tighter text-white uppercase italic leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-[#e0aaff] transition-all duration-500">
                      {item.title || "Subject-Alpha Unit"}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/20 mt-4">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-10 pt-0 space-y-8 flex-1">
                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-6 border-t border-white/5">
                        {item.tags.slice(0, 3).map((tag: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="px-3 py-1 bg-[#b638fc]/5 text-[#b638fc]/80 border-none text-[8px] font-black uppercase tracking-[0.2em]">
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 3 && (
                          <Badge variant="secondary" className="px-3 py-1 bg-white/5 text-white/40 border-none text-[8px] font-black uppercase tracking-[0.2em]">
                            +{item.tags.length - 3} Units
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Analysis Data */}
                    {item.analysis_data && (
                      <div className="space-y-4 pt-8 border-t border-white/5">
                        {item.average_clip_length && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
                              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Buffer Mean</span>
                            </div>
                            <span className="text-sm font-black italic">{item.average_clip_length}s</span>
                          </div>
                        )}
                        {item.analysis_data.pacing && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-[#b638fc] shadow-[0_0_8px_#b638fc] animate-pulse" />
                              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Rhythmic Cadence</span>
                            </div>
                            <span className="text-sm font-black italic uppercase">{item.analysis_data.pacing}</span>
                          </div>
                        )}
                        {item.analysis_data.subtitleStyle && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-white/10" />
                              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Visual Semantics</span>
                            </div>
                            <span className="text-sm font-black italic uppercase truncate max-w-[120px]">{item.analysis_data.subtitleStyle}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-6">
                      <Button variant="ghost" className="w-full h-12 rounded-2xl bg-white/[0.03] border border-white/5 text-[9px] font-black uppercase tracking-[0.4em] hover:bg-white/10 hover:text-white transition-all italic">
                        Extract Schema
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
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

export default Imports;
