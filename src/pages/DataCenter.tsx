import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Sparkles, Gamepad2, RefreshCw, Loader2, Bot, Settings, Zap, Cpu, Database, TrendingUp, Globe, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GamemodePerformanceCard } from "@/components/datacenter/GamemodePerformanceCard";
import { AnalyticsDashboard } from "@/components/datacenter/AnalyticsDashboard";
import { ProjectChannelManager } from "@/components/datacenter/ProjectChannelManager";
import { EmptyState } from "@/components/datacenter/EmptyState";
import { ABTestsSection } from "@/components/datacenter/ABTestsSection";
import { WeeklyReportBanner } from "@/components/datacenter/WeeklyReportBanner";
import { CompetitorReportSection } from "@/components/datacenter/CompetitorReportSection";
import { DecisionFeed } from "@/components/datacenter/DecisionFeed";
import { AutomationSettingsPanel } from "@/components/datacenter/AutomationSettingsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Gamemode {
  id: string;
  name: string;
  description: string;
}

interface Project {
  id: string;
  title: string;
  gamemode_id: string | null;
}

interface GamemodeInsight {
  id: string;
  gamemode_id: string | null;
  best_hook_text: string | null;
  best_hook_score: number | null;
  best_cta_text: string | null;
  best_cta_score: number | null;
  best_editing_style: string | null;
  best_editing_style_score: number | null;
  patterns: unknown;
  recommendations: unknown;
  total_videos_analyzed: number;
  avg_hook_score: number | null;
  avg_cta_score: number | null;
  avg_editing_style_score: number | null;
}

interface VideoPerformance {
  id: string;
  gamemode_id: string | null;
  hook_text: string;
  cta_text: string;
  editing_style_name: string;
  hook_score: number | null;
  cta_score: number | null;
  editing_style_score: number | null;
  youtube_views: number;
  youtube_likes: number;
  video_title: string | null;
  published_at: string | null;
}

interface WeeklyReport {
  id: string;
  gamemode_id: string | null;
  report_week: string;
  status: string;
  videos_analyzed: number;
  avg_retention_pct: number | null;
  recommendations: any;
  gamemodes?: { name: string } | null;
}

interface CompetitorReport {
  id: string;
  gamemode_id: string | null;
  report_week: string;
  status: string;
  competitors_analyzed: number;
  videos_analyzed: number;
  trending_topics: any;
  content_gaps: any;
  recommended_scripts: any;
  gamemodes?: { name: string } | null;
}

const DataCenter = () => {
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [gamemodes, setGamemodes] = useState<Gamemode[]>([]);
  const [insights, setInsights] = useState<GamemodeInsight[]>([]);
  const [performances, setPerformances] = useState<VideoPerformance[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [competitorReports, setCompetitorReports] = useState<CompetitorReport[]>([]);
  const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [automationGamemode, setAutomationGamemode] = useState<Gamemode | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const openAutomationSettings = (gamemode: Gamemode) => {
    setAutomationGamemode(gamemode);
    setAutomationDialogOpen(true);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      await fetchData();
    };

    checkAuth();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const [{ data: projectsData }, { data: gamemodesData }] = await Promise.all([
        supabase.from("projects").select("id, title, gamemode_id").order("title"),
        supabase.from("gamemodes").select("*").order("name")
      ]);

      setProjects(projectsData || []);
      setGamemodes(gamemodesData || []);

      const { data: insightsData, error: insightsError } = await supabase
        .from("gamemode_insights")
        .select("*");

      if (insightsError) throw insightsError;
      setInsights(insightsData || []);

      const { data: performancesData, error: performancesError } = await supabase
        .from("video_performance")
        .select("*")
        .order("created_at", { ascending: false });

      if (performancesError) throw performancesError;
      setPerformances(performancesData || []);

      const { data: reportsData, error: reportsError } = await supabase
        .from("weekly_reports")
        .select("*, gamemodes(name)")
        .order("created_at", { ascending: false });

      if (!reportsError) setWeeklyReports(reportsData || []);

      const { data: compReportsData, error: compReportsError } = await supabase
        .from("competitor_reports")
        .select("*, gamemodes(name)")
        .order("created_at", { ascending: false });

      if (!compReportsError) setCompetitorReports(compReportsData || []);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load data center",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInsightForGamemode = (gamemodeId: string) => {
    return insights.find(i => i.gamemode_id === gamemodeId);
  };

  const getPerformancesForGamemode = (gamemodeId: string | null) => {
    if (gamemodeId === null) return performances;
    return performances.filter(p => p.gamemode_id === gamemodeId);
  };

  const handleSyncAnalytics = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('sync-channel-analytics');
      if (error) throw error;
      toast({ title: "Matrix Synchronized", description: "All project channels have been updated." });
      await fetchData();
    } catch (errorValue: any) {
      toast({ variant: "destructive", title: "Sync Failed", description: errorValue.message });
      toast({ variant: "destructive", title: "Sync Failed", description: errorValue.message });
    } finally {
      setSyncing(false);
    }
  };

  const totalVideos = performances.length;
  const avgOverallScore = performances.length > 0
    ? Math.round(
      performances.reduce((acc, p) => {
        const scores = [p.hook_score, p.cta_score, p.editing_style_score].filter(s => s !== null) as number[];
        return acc + (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0);
      }, 0) / performances.length
    )
    : 0;

  const totalViews = performances.reduce((acc, p) => acc + (p.youtube_views || 0), 0);
  const totalLikes = performances.reduce((acc, p) => acc + (p.youtube_likes || 0), 0);
  const totalWatchTimeHours = performances.reduce((acc, p) => acc + ((p as any).youtube_watch_time_seconds || 0), 0) / 3600;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0916] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-[30px] bg-gradient-to-br from-[#06b6d4] via-[#3b82f6] to-[#0c0916] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(59,130,246,0.5)] animate-pulse">
            <BarChart3 className="w-10 h-10 text-white" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em]">Synchronizing Data Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#3b82f6]/30 overflow-x-hidden relative font-sans">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
        <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#06b6d4]/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#3b82f6]/5 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0c0916]/80 backdrop-blur-3xl border-b border-white/5 h-20 flex items-center">
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
              <div className="w-12 h-12 rounded-2xl bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_20px_rgba(59,130,246,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex items-center justify-center relative">
                <BarChart3 className="w-6 h-6 text-[#3b82f6] drop-shadow-[0_0_10px_#3b82f6]" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#93c5fd_60%,#3b82f6_90%)] leading-none mb-1">
                  Data Center
                </h1>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em]">Performance Matrix v2.0</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <ProjectChannelManager />
            
            <Button
              variant="outline"
              onClick={() => navigate("/scriptforge")}
              className="h-12 px-8 bg-white/[0.03] border border-white/10 text-white font-bold rounded-full shadow-lg transition-all hover:bg-white/5 uppercase text-[11px] tracking-widest"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Gamemode Forge
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-8 py-12 space-y-12 relative z-10 pb-32">

        {/* Weekly Reports Row */}
        <section className="animate-in fade-in slide-in-from-top-8 duration-700">
          <WeeklyReportBanner reports={weeklyReports} onReportActioned={fetchData} />
        </section>

        {/* Competitor Intelligence */}
        <section className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          <CompetitorReportSection reports={competitorReports} onReportActioned={fetchData} />
        </section>

        {/* Hierarchical Analytics Selection */}
        <div className="flex items-center gap-4 bg-white/5 p-2 rounded-full border border-white/10 max-w-fit mx-auto">
          <Button 
            variant={!selectedGamemode && !selectedProject ? "secondary" : "ghost"} 
            className="rounded-full text-xs font-bold uppercase tracking-widest"
            onClick={() => { setSelectedGamemode(null); setSelectedProject(null); }}
          >
            <Globe className="w-3 h-3 mr-2" /> Global Matrix
          </Button>
          
          <Select value={selectedGamemode || ""} onValueChange={(val) => { setSelectedGamemode(val); setSelectedProject(null); }}>
            <SelectTrigger className="w-[200px] bg-transparent border-none focus:ring-0 text-xs font-bold uppercase tracking-widest">
              <Gamepad2 className="w-3 h-3 mr-2" />
              <SelectValue placeholder="Gamemode Filter" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              {gamemodes.map(g => <SelectItem key={g.id} value={g.id} className="text-xs uppercase">{g.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedProject || ""} onValueChange={(val) => { setSelectedProject(val); setSelectedGamemode(null); }}>
            <SelectTrigger className="w-[200px] bg-transparent border-none focus:ring-0 text-xs font-bold uppercase tracking-widest">
              <Layers className="w-3 h-3 mr-2" />
              <SelectValue placeholder="Project Filter" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs uppercase">{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Analytics Dashboard Wrapper */}
        <div className="animate-in fade-in zoom-in duration-700">
          <AnalyticsDashboard
            selectedGamemodeId={selectedGamemode || undefined}
            selectedProjectId={selectedProject || undefined}
          />
        </div>

        {/* Grid: Gamemodes + Decision Feed */}
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8 animate-in fade-in slide-in-from-left-12 duration-1200 delay-300">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-[#3b82f6]" />
                </div>
                <div>
                  <h2 className="text-3xl font-black tracking-tighter">Domain Performance</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Gamemode Analytics Array</p>
                </div>
              </div>
            </div>

            {gamemodes.length === 0 ? (
              <div className="bg-[#161224]/40 backdrop-blur-3xl border border-dashed border-white/10 rounded-[40px] py-32 text-center group transition-all hover:bg-white/[0.02]">
                <div className="w-16 h-16 rounded-[24px] bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <Database className="w-8 h-8 text-white/10" />
                </div>
                <h3 className="text-xl font-black text-white/30 uppercase tracking-widest">No Intelligence Data</h3>
                <p className="text-slate-500 font-medium text-sm mt-3 max-w-sm mx-auto">Initialize gamemodes in ScriptForge to track synthesis performance by category.</p>
                <Button onClick={() => navigate("/scriptforge")} className="mt-8 rounded-full px-8 bg-blue-600 hover:bg-blue-500 font-black uppercase text-[10px] tracking-widest">Invoke ScriptForge</Button>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {gamemodes.map((gamemode) => (
                  <div key={gamemode.id} className="relative group p-1 rounded-[32px] bg-gradient-to-br from-white/10 to-transparent hover:from-white/20 transition-all duration-700">
                    <div className="h-full bg-[#161224]/90 backdrop-blur-3xl border border-white/5 rounded-[31px] overflow-hidden shadow-2xl transition-transform duration-500 group-hover:-translate-y-2">
                      <GamemodePerformanceCard
                        gamemode={gamemode}
                        insight={getInsightForGamemode(gamemode.id)}
                        performances={getPerformancesForGamemode(gamemode.id)}
                        onSelect={() => setSelectedGamemode(
                          selectedGamemode === gamemode.id ? null : gamemode.id
                        )}
                        isSelected={selectedGamemode === gamemode.id}
                      />
                      <button
                        className="absolute top-6 right-6 w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white hover:border-blue-600 shadow-xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAutomationSettings(gamemode);
                        }}
                      >
                        <Cpu className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-1 animate-in fade-in slide-in-from-right-12 duration-1200 delay-500">
            <div className="bg-[#161224]/60 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8 shadow-2xl h-full sticky top-32">
              <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-600/30">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-white tracking-tighter italic">Process Feed</h3>
              </div>
              <DecisionFeed />
            </div>
          </div>
        </div>

        {/* A/B Tests Wrapper */}
        <section className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-600">
          <div className="bg-[#161224]/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-10 shadow-2xl">
            <ABTestsSection />
          </div>
        </section>

      </main>

      <Dialog open={automationDialogOpen} onOpenChange={setAutomationDialogOpen}>
        <DialogContent className="max-w-lg bg-[#161224]/95 backdrop-blur-3xl border border-white/10 text-white rounded-[32px] overflow-hidden shadow-[0_0_100px_rgba(59,130,246,0.3)] p-0">
          <DialogHeader className="p-8 pb-0">
            <DialogTitle className="flex items-center gap-4 text-2xl font-black tracking-tighter uppercase italic">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              Neural Strategy: {automationGamemode?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8">
            {automationGamemode && (
              <AutomationSettingsPanel
                gamemodeId={automationGamemode.id}
                gamemodeName={automationGamemode.name}
                onClose={() => setAutomationDialogOpen(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <style dangerouslySetInnerHTML={{
        __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
    </div>
  );
};

export default DataCenter;
