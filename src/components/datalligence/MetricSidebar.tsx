import { METRIC_CATEGORIES, type MetricKey } from "@/hooks/useAnalyticsData";
import { Copy, Info } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function MetricSidebar() {
    const onDragStart = (e: React.DragEvent, metricKey: MetricKey, label: string) => {
        e.dataTransfer.setData("metricKey", metricKey);
        e.dataTransfer.setData("metricLabel", label);
        e.dataTransfer.effectAllowed = "copy";
    };

    return (
        <div className="w-64 border-r border-white/10 bg-[#0d1117] flex flex-col h-full">
            <div className="p-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white mb-1">Data Explorer</h3>
                <p className="text-xs text-gray-500">Drag metrics to the canvas</p>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {Object.entries(METRIC_CATEGORIES).map(([category, metrics]) => (
                        <div key={category}>
                            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                                {category}
                            </h4>
                            <div className="space-y-2">
                                {metrics.map((metric) => (
                                    <div
                                        key={metric.key}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, metric.key, metric.label)}
                                        className="group flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-grab active:cursor-grabbing transition-all"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 group-hover:bg-emerald-400" />
                                            <span className="text-xs text-gray-300 group-hover:text-white font-medium">
                                                {metric.label}
                                            </span>
                                        </div>
                                        {/* Info tooltip or badge */}
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Info className="w-3 h-3 text-gray-600 group-hover:text-emerald-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </TooltipTrigger>
                                                <TooltipContent side="right" className="bg-[#1a1f2c] border-white/10">
                                                    <p className="text-xs">{metric.key}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
