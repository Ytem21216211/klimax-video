import { ViewModeSelector } from "./ViewModeSelector";
import { DateRangePicker } from "./DateRangePicker";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Download, Plus, Zap, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { ViewMode, Gamemode, Project, DateRange } from "@/hooks/useAnalyticsData";
import { cn } from "@/lib/utils";

interface DatalligenceHeaderProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    dateRange: DateRange | undefined;
    onDateRangeChange: (range: DateRange | undefined) => void;
    gamemodes: Gamemode[];
    projects: Project[];
    onRefresh: () => void;
    isRefreshing: boolean;
    onAddWidget: () => void;
}

export function DatalligenceHeader({
    viewMode,
    onViewModeChange,
    dateRange,
    onDateRangeChange,
    gamemodes,
    projects,
    onRefresh,
    isRefreshing,
    onAddWidget,
}: DatalligenceHeaderProps) {
    return (
        <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#0c0916]/80 backdrop-blur-2xl">
            <div className="flex h-20 items-center justify-between px-8">
                <div className="flex items-center gap-6">
                    <Link
                        to="/dashboard"
                        className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/10 shadow-inner"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-4">
                        {/* Landing Style Icon Vessel */}
                        <div className="w-12 h-12 rounded-2xl bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_20px_rgba(182,56,252,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex items-center justify-center relative overflow-hidden group">
                            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50 transition-opacity" />
                            <Zap className="w-6 h-6 text-[#b638fc] drop-shadow-[0_0_10px_#e324ff] fill-current" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white leading-none mb-1">
                                Analytics
                            </h1>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <p className="text-xs font-medium text-slate-500">
                                    Dashboard
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10 mx-2" />
                    <ViewModeSelector
                        viewMode={viewMode}
                        onChange={onViewModeChange}
                        gamemodes={gamemodes}
                        projects={projects}
                    />
                </div>

                <div className="flex items-center gap-4">
                    <DateRangePicker value={dateRange} onChange={onDateRangeChange} />

                    <div className="h-8 w-px bg-white/10 mx-2" />

                    {/* Premium Primary Button (Landing Style) */}
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                        <Button
                            size="sm"
                            className="relative h-11 px-6 bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-bold rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(0,0,0,0.3)] border-none transition-all group-hover:scale-[1.02] active:scale-95 text-[13px] tracking-wide uppercase"
                            onClick={onAddWidget}
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Add Widget
                        </Button>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 text-gray-400 hover:text-white rounded-xl bg-white/[0.03] border border-white/5 transition-colors"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </Button>

                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 text-gray-400 hover:text-white rounded-xl bg-white/[0.03] border border-white/5 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
