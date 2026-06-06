import { useState, useEffect } from "react";
import { AnalyticsLayout } from "@/components/analytics/AnalyticsLayout";
import { ScoreFilter, ScoreRange } from "@/components/analytics/ScoreFilter";
import { VideoScoreCard } from "@/components/analytics/VideoScoreCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, BarChart3, Clock, Zap, Target, Activity, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VideoData {
    id: string;
    tiktok_id: string;
    description: string;
    current_score: number;
    upload_time: string;
    gamemode: string;
    cover_url: string;
    velocity: number;
    views: number;
    status: "rising" | "falling" | "stable";
}

export default function AnalyticsDashboard() {
    const [videos, setVideos] = useState<VideoData[]>([]);
    const [loading, setLoading] = useState(true);
    const [cycleTime, setCycleTime] = useState<number>(0);

    const [selectedRanges, setSelectedRanges] = useState<ScoreRange[]>([]);
    const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        const channel = supabase
            .channel('analytics-updates')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'tracked_videos'
            }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchData = async () => {
        const startTime = performance.now();
        try {
            const { data, error } = await supabase
                .from('tracked_videos')
                .select(`
            *,
            analytics_snapshots (
                views, timestamp
            )
        `)
                .eq('status', 'active')
                .order('current_score', { ascending: false });

            if (error) throw error;

            const transformed: VideoData[] = (data || []).map((vid: any) => {
                const snapshots = vid.analytics_snapshots || [];
                snapshots.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                const currentViews = snapshots[0]?.views || 0;

                // Calculate REAL velocity (views per hour based on latest snapshots)
                let calculatedVelocity = 0;
                if (snapshots.length >= 2) {
                    const current = snapshots[0];
                    const previous = snapshots[1];
                    const hoursDiff = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60);
                    if (hoursDiff > 0) {
                        calculatedVelocity = (current.views - previous.views) / hoursDiff;
                    }
                } else if (snapshots.length === 1 && (vid.upload_time || vid.created_at)) {
                    const uploadDate = vid.upload_time || vid.created_at;
                    const hoursDiff = (new Date(snapshots[0].timestamp).getTime() - new Date(uploadDate).getTime()) / (1000 * 60 * 60);
                    if (hoursDiff > 0) {
                        calculatedVelocity = snapshots[0].views / hoursDiff;
                    }
                }

                // If velocity is negative due to glitch, floor to 0
                calculatedVelocity = Math.max(0, calculatedVelocity);

                return {
                    id: vid.id,
                    tiktok_id: vid.tiktok_id,
                    title: vid.description || `Video ${vid.tiktok_id}`,
                    thumbnail: vid.cover_url,
                    score: vid.current_score || 0,
                    views: currentViews,
                    velocity: calculatedVelocity,
                    uploadTime: vid.upload_time || vid.created_at,
                    gamemode: vid.gamemode || "Uncategorized",
                    description: vid.description,
                    cover_url: vid.cover_url,
                    current_score: vid.current_score,
                    upload_time: vid.upload_time,
                    // If gaining > 50 views an hour it's rising. If < 5 views an hour it's falling.
                    status: calculatedVelocity > 50 ? "rising" : calculatedVelocity < 5 ? "falling" : "stable"
                };
            });

            setVideos(transformed);
        } catch (err) {
            console.error("Error fetching analytics:", err);
        } finally {
            const endTime = performance.now();
            setCycleTime(endTime - startTime);
            setLoading(false);
        }
    };

    const toggleRange = (range: ScoreRange) => {
        setSelectedRanges(prev =>
            prev.includes(range)
                ? prev.filter(r => r !== range)
                : [...prev, range]
        );
    };

    const filteredVideos = videos.filter(video => {
        if (selectedGamemode && video.gamemode.toLowerCase() !== selectedGamemode.toLowerCase()) return false;
        if (selectedRanges.length > 0) {
            const score = video.score;
            const matchesRange = selectedRanges.some(range => {
                if (range === "0-20") return score < 20;
                if (range === "20-50") return score >= 20 && score < 50;
                if (range === "50-70") return score >= 50 && score < 70;
                if (range === "70-90") return score >= 70 && score < 90;
                if (range === "90-100") return score >= 90 && score < 100;
                if (range === "100+") return score >= 100;
                return false;
            });
            if (!matchesRange) return false;
        }
        return true;
    });

    return (
        <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

            {/* 🌑 Background FX */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
                <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
                <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
            </div>

            <AnalyticsLayout>
                <div className="container max-w-7xl mx-auto py-12 px-6 relative z-10 space-y-12">

                    {/* Header Section */}
                    <header className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-[24px] bg-gradient-to-br from-[#3b38fc] via-[#b638fc] to-[#fca5fc] flex items-center justify-center shadow-[0_0_30px_rgba(182,56,252,0.4)] relative overflow-hidden group">
                                <TrendingUp className="w-8 h-8 text-white relative z-10" />
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>
                            <div>
                                <h1 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] uppercase italic leading-none mb-3">Live Analysis</h1>
                                <p className="text-[#e0aaff]/40 text-[10px] font-black uppercase tracking-[0.5em] italic">Neural Performance Matrix v1.0.4</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 pr-4">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Matrix Pulse</span>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                                    <span className="text-xl font-black tracking-tight text-white italic">{new Date().toLocaleTimeString()}</span>
                                </div>
                            </div>
                            <div className="w-px h-12 bg-white/10 hidden md:block" />
                            <div className="flex items-center gap-4">
                                <div className="relative group w-48 md:w-64">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-white transition-colors" />
                                    <Input
                                        placeholder="Track Unit..."
                                        className="pl-12 h-12 bg-white/[0.03] border-white/10 rounded-2xl focus:ring-2 focus:ring-[#b638fc]/50 text-sm font-bold transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="p-8 rounded-[36px] bg-[#161224]/60 backdrop-blur-3xl border border-white/10 shadow-2xl group transition-all duration-700 hover:scale-[1.02] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#3b38fc]/5 rounded-full blur-3xl" />
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Activity className="w-5 h-5 text-[#b638fc]" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#e0aaff]/40">Active Nodes</span>
                            </div>
                            <p className="text-4xl font-black tracking-tighter text-white italic">{videos.length}</p>
                        </div>

                        <div className="p-8 rounded-[36px] bg-[#161224]/60 backdrop-blur-3xl border border-white/10 shadow-2xl group transition-all duration-700 hover:scale-[1.02] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e324ff]/5 rounded-full blur-3xl" />
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-emerald-400" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Synthesis Velocity</span>
                            </div>
                            <p className="text-4xl font-black tracking-tighter text-emerald-400 italic">
                                {videos.length > 0 ? ((videos.filter(v => v.status === 'rising').length / videos.length) * 100).toFixed(1) : "0.0"}
                                <span className="text-sm ml-1 opacity-40">%</span>
                            </p>
                        </div>

                        <div className="p-8 rounded-[36px] bg-[#161224]/60 backdrop-blur-3xl border border-white/10 shadow-2xl group transition-all duration-700 hover:scale-[1.02] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Target className="w-5 h-5 text-blue-400" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Target Accuracy</span>
                            </div>
                            <p className="text-4xl font-black tracking-tighter text-blue-400 italic">
                                {videos.length > 0 ? (videos.reduce((acc, v) => acc + v.score, 0) / videos.length).toFixed(1) : "0.0"}
                                <span className="text-sm ml-1 opacity-40">%</span>
                            </p>
                        </div>

                        <div className="p-8 rounded-[36px] bg-[#161224]/60 backdrop-blur-3xl border border-white/10 shadow-2xl group transition-all duration-700 hover:scale-[1.02] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-400/5 rounded-full blur-3xl" />
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-[#e0aaff]" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Cycle Time</span>
                            </div>
                            <p className="text-4xl font-black tracking-tighter text-[#e0aaff] italic">{cycleTime > 0 ? cycleTime.toFixed(1) : "0.0"}<span className="text-sm ml-1 opacity-40">ms</span></p>
                        </div>
                    </div>

                    {/* Filter Panel - Glass Section */}
                    <div className="p-8 rounded-[40px] bg-[#161224]/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-1.5 h-6 bg-gradient-to-b from-[#b638fc] to-transparent rounded-full" />
                            <h2 className="text-xl font-black uppercase tracking-widest italic opacity-40">Filter Spectrum</h2>
                        </div>
                        <ScoreFilter
                            selectedRanges={selectedRanges}
                            onRangeToggle={toggleRange}
                            selectedGamemode={selectedGamemode}
                            onGamemodeChange={setSelectedGamemode}
                        />
                    </div>

                    {/* Results Area */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 space-y-6">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full border border-white/5 animate-ping" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="h-10 w-10 animate-spin text-[#b638fc]" />
                                </div>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Decoding Performance Buffers...</p>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {filteredVideos.length === 0 ? (
                                <div className="py-40 text-center bg-[#161224]/20 rounded-[48px] border border-dashed border-white/5">
                                    <BarChart3 className="w-16 h-16 text-white/5 mx-auto mb-8" />
                                    <h3 className="text-2xl font-black text-white/20 uppercase tracking-widest italic">Zero Inbound Correlating Data</h3>
                                    <p className="text-slate-600 font-bold text-[11px] mt-4 uppercase tracking-[0.2em]">Adjust Filter Matrix to Resume Feed</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                                    {filteredVideos.map((video) => (
                                        <div key={video.id} className="animate-in fade-in zoom-in-95 duration-700">
                                            <VideoScoreCard
                                                video={video}
                                                onClick={() => console.log("Open deep dive for", video.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </AnalyticsLayout>

            <style dangerouslySetInnerHTML={{
                __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
}
