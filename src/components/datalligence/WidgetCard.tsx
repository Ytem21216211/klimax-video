import { useState } from "react";
import { ChartTypePicker, type ChartType } from "./ChartTypePicker";
import { ChartRenderer } from "./ChartRenderer";
import { Maximize2, MoreVertical, X, GripHorizontal, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface WidgetCardProps {
    id: string;
    title: string;
    data: any[];
    metrics: string[]; // keys
    chartType: ChartType;
    onRemove: () => void;
    onTypeChange: (type: ChartType) => void;
    onMetricDrop: (metricKey: string) => void; // Handle drop for merging
    className?: string;
}

export function WidgetCard({
    id,
    title,
    data,
    metrics,
    chartType,
    onRemove,
    onTypeChange,
    onMetricDrop,
    className,
}: WidgetCardProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const metricKey = e.dataTransfer.getData("metricKey");
        if (metricKey && !metrics.includes(metricKey)) {
            onMetricDrop(metricKey);
        }
    };

    return (
        <div
            className={cn(
                "group relative flex flex-col rounded-xl border border-white/10 bg-[#0d1117]/90 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:shadow-2xl overflow-hidden min-h-[300px]",
                isDragOver && "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/50",
                className
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Overlay for Drop Target (Merge) */}
            {isDragOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-sm pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-emerald-400 animate-pulse">
                        <CopyPlus className="w-8 h-8" />
                        <span className="text-sm font-semibold">Drop to compare</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 shrink-0">
                        <GripHorizontal className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-semibold text-gray-200 uppercase tracking-wide truncate" title={title}>
                        {title}
                    </h3>
                    {metrics.length > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shrink-0">
                            Comparison
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <ChartTypePicker value={chartType} onChange={onTypeChange} />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[#1a1f2c] border-white/10 text-white">
                            <DropdownMenuItem className="text-xs gap-2 cursor-pointer hover:bg-white/5">
                                <Maximize2 className="w-3.5 h-3.5" /> Full Screen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-xs gap-2 text-red-400 focus:text-red-400 focus:bg-red-950/20 cursor-pointer"
                                onClick={onRemove}
                            >
                                <X className="w-3.5 h-3.5" /> Remove Widget
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 p-4 w-full h-full min-h-0">
                <ChartRenderer
                    type={chartType}
                    data={data}
                    dataKeys={metrics}
                    height={250}
                />
            </div>
        </div>
    );
}
