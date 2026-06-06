import { useState, useMemo } from "react";
import { DatalligenceHeader } from "@/components/datalligence/DatalligenceHeader";
import { MetricSidebar } from "@/components/datalligence/MetricSidebar";
import { WidgetCard } from "@/components/datalligence/WidgetCard";
import { KPICard } from "@/components/datalligence/KPICard";
import {
    useVideoPerformance,
    useVideoSnapshots,
    useChannelSnapshots,
    useGamemodes,
    useProjects,
    useCognitiveFeatures,
    METRIC_CATEGORIES,
    type ViewMode,
    type DateRange,
    type MetricKey,
    type VideoMetrics,
    formatMetricValue,
} from "@/hooks/useAnalyticsData";
import { ChartType } from "@/components/datalligence/ChartTypePicker";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Brain, Cpu, Database } from "lucide-react";

interface Widget {
    id: string;
    title: string;
    metrics: MetricKey[];
    chartType: ChartType;
}

const DEFAULT_WIDGETS: Widget[] = [
    { id: "w1", title: "Views Trend", metrics: ["youtube_views"], chartType: "line" },
    { id: "w2", title: "Metrics Overview", metrics: ["youtube_views", "youtube_likes", "youtube_comments"], chartType: "bar" },
    { id: "w4", title: "Top Videos", metrics: ["youtube_views"], chartType: "bar_horizontal" },
];

export default function Datalligence() {
    const [viewMode, setViewMode] = useState<ViewMode>({ type: "global" });
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date(),
    });
    const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { toast } = useToast();

    const { data: videoPerf = [] } = useVideoPerformance(viewMode);
    const { data: snapshots = [] } = useVideoSnapshots(viewMode, dateRange);
    const { data: channelSnaps = [] } = useChannelSnapshots(dateRange);
    const { data: gamemodes = [] } = useGamemodes();
    const { data: projects = [] } = useProjects();

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await supabase.functions.invoke("sync-youtube-analytics");
            await supabase.functions.invoke("sync-channel-analytics");
            toast({ title: "Sync Complete", description: "Analytics data updated." });
        } catch {
            toast({ variant: "destructive", title: "Sync Failed" });
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAddWidget = () => {
        const newWidget: Widget = {
            id: `w-${Date.now()}`,
            title: "New Chart",
            metrics: ["youtube_views"],
            chartType: "line",
        };
        setWidgets([...widgets, newWidget]);
    };

    const handleRemoveWidget = (id: string) => {
        setWidgets(widgets.filter((w) => w.id !== id));
    };

    const handleUpdateWidget = (id: string, updates: Partial<Widget>) => {
        setWidgets(widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)));
    };

    const handleMergeMetric = (widgetId: string, metricKey: string) => {
        const widget = widgets.find((w) => w.id === widgetId);
        if (widget && !widget.metrics.includes(metricKey)) {
            handleUpdateWidget(widgetId, { metrics: [...widget.metrics, metricKey] });
        }
    };

    // Helper to map UI metric keys to Snapshot keys
    const mapMetricToSnapshotKey = (key: string) => {
        const map: Record<string, string> = {
            youtube_views: "views",
            youtube_likes: "likes",
            youtube_comments: "comments",
            youtube_shares: "shares",
            youtube_dislikes: "dislikes",
            youtube_subscribers_gained: "subscribers_gained",
            youtube_watch_time_seconds: "watch_time_seconds",
            youtube_avg_view_percentage: "avg_view_percentage",
            youtube_engaged_views: "engaged_views",
            youtube_completed_views: "completed_views",
        };
        return map[key] || key;
    };

    // Data Transformation Logic
    const getWidgetData = (widget: Widget): any[] => {
        const isTimeSeries = ["line", "area"].includes(widget.chartType);
        const isComparison = ["bar", "bar_horizontal", "stacked_bar", "grouped_bar", "scatter", "treemap"].includes(widget.chartType);

        if (isTimeSeries) {
            if (channelSnaps.length > 0 && widget.metrics.some(m => m.startsWith("total_"))) {
                return channelSnaps.map(s => ({
                    name: new Date(s.snapshot_at).toLocaleDateString(),
                    ...s
                }));
            }

            const dailyData: Record<string, any> = {};
            snapshots.forEach(s => {
                const date = new Date(s.snapshot_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                if (!dailyData[date]) dailyData[date] = { name: date };

                widget.metrics.forEach(m => {
                    const snapKey = mapMetricToSnapshotKey(m);
                    const val = (s as any)[snapKey] || 0;
                    dailyData[date][m] = (dailyData[date][m] || 0) + val;
                });
            });

            return Object.values(dailyData).sort((a, b) =>
                new Date(a.name).getTime() - new Date(b.name).getTime()
            );
        }

        if (isComparison || widget.chartType === 'pie' || widget.chartType === 'donut') {
            return videoPerf.slice(0, 15).map(v => ({
                name: v.video_title || v.id.slice(0, 8),
                ...v
            }));
        }

        return [];
    };

    const totalViews = useMemo(() => videoPerf.reduce((a, b) => a + (b.youtube_views || 0), 0), [videoPerf]);
    const avgRetention = useMemo(() => {
        const valid = videoPerf.filter(v => v.youtube_avg_view_percentage != null);
        return valid.length ? valid.reduce((a, b) => a + b.youtube_avg_view_percentage!, 0) / valid.length : 0;
    }, [videoPerf]);
    const totalSubs = useMemo(() => videoPerf.reduce((a, b) => a + (b.youtube_subscribers_gained || 0), 0), [videoPerf]);

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const metricKey = e.dataTransfer.getData("metricKey");
        const metricLabel = e.dataTransfer.getData("metricLabel");
        if (metricKey) {
            const newWidget: Widget = {
                id: `w-${Date.now()}`,
                title: `${metricLabel} Trend`,
                metrics: [metricKey],
                chartType: "line",
            };
            setWidgets([...widgets, newWidget]);
        }
    };

    return (
        <div className="flex h-screen flex-col bg-[#0c0916] text-white overflow-hidden relative selection:bg-[#b638fc]/30">
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

            <DatalligenceHeader
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                gamemodes={gamemodes}
                projects={projects}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                onAddWidget={handleAddWidget}
            />

            <div className="flex flex-1 overflow-hidden relative z-10">
                {/* Metric Sidebar Wrapped in Glass */}
                <aside className="w-[300px] h-full bg-[#1a1628]/40 backdrop-blur-3xl border-r border-white/5 flex flex-col shadow-2xl relative translate-z-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent pointer-events-none" />
                    <MetricSidebar />
                </aside>

                <main
                    className="flex-1 overflow-y-auto relative no-scrollbar"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                >
                    <div className="max-w-[1600px] mx-auto space-y-12 p-8 pb-32">

                        {/* KPI SECTION: PREMIUM CARS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-8 duration-1000">
                            <KPICard
                                title="Total Views"
                                value={totalViews}
                                format="number"
                                color="#10b981"
                                icon={<Plus className="w-5 h-5" />}
                            />
                            <KPICard
                                title="Retention Flux"
                                value={avgRetention}
                                format="percent"
                                color="#3b38fc"
                                icon={<Brain className="w-5 h-5" />}
                            />
                            <KPICard
                                title="Sub Growth"
                                value={totalSubs}
                                format="number"
                                color="#e324ff"
                                icon={<Database className="w-5 h-5" />}
                            />
                            <KPICard
                                title="Active Units"
                                value={videoPerf.length}
                                format="number"
                                color="#fca5fc"
                                icon={<Cpu className="w-5 h-5" />}
                            />
                        </div>

                        {/* DATA VISUALIZATION CANVAS */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                            {widgets.map((widget) => (
                                <WidgetCard
                                    key={widget.id}
                                    {...widget}
                                    data={getWidgetData(widget)}
                                    className="min-h-[420px] bg-[#1a1628]/40 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden hover:border-white/20 transition-all duration-500 relative group/widget"
                                    onRemove={() => handleRemoveWidget(widget.id)}
                                    onTypeChange={(type) => handleUpdateWidget(widget.id, { chartType: type })}
                                    onMetricDrop={(metric) => handleMergeMetric(widget.id, metric)}
                                />
                            ))}

                            {/* EMPTY COMMAND CANVAS */}
                            {widgets.length === 0 && (
                                <div className="col-span-full h-[400px] border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center justify-center text-slate-500 bg-white/[0.02] shadow-inner animate-pulse">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                                        <Plus className="w-8 h-8 opacity-40" />
                                    </div>
                                    <p className="text-lg font-black uppercase tracking-[0.2em] opacity-30">Command Canvas Empty</p>
                                    <p className="text-sm font-medium opacity-20 mt-2">Relocate metrics here from the side panel</p>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
}
