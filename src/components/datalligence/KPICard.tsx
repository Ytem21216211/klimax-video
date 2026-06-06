import { formatMetricValue, computeDelta } from "@/hooks/useAnalyticsData";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
    LineChart,
    Line,
    ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface KPICardProps {
    title: string;
    value: number | null;
    previousValue?: number | null;
    format: string;
    sparklineData?: { value: number }[];
    color?: string;
    icon?: React.ReactNode;
}

export function KPICard({
    title,
    value,
    previousValue,
    format,
    sparklineData,
    color = "#b638fc",
    icon,
}: KPICardProps) {
    const delta =
        value != null && previousValue != null
            ? computeDelta(value, previousValue)
            : null;
    const isPositive = delta != null && delta > 0;
    const isNegative = delta != null && delta < 0;

    return (
        <div className="relative group overflow-hidden rounded-[24px] bg-[#161224]/80 backdrop-blur-2xl border border-white/20 p-6 shadow-[0_0_40px_rgba(182,56,252,0.1),inset_0_1px_4px_rgba(255,255,255,0.1)] hover:scale-[1.02] transition-all duration-500">
            {/* Massive Backglow */}
            <div
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-[100px] opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity duration-700"
                style={{ backgroundColor: color }}
            />

            <div className="flex items-start justify-between mb-4">
                <div className="space-y-1">
                    <span className="text-[10px] font-black text-[#e0aaff] uppercase tracking-[0.2em] opacity-80">
                        {title}
                    </span>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            {/* Landing Style Icon Vessel */}
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(182,56,252,0.4)] relative overflow-hidden group-hover:scale-110 transition-transform">
                                <div className="text-white drop-shadow-md relative z-10 scale-75">
                                    {icon || <TrendingUp className="w-5 h-5" />}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative z-10 flex flex-col items-start gap-1">
                <span className="text-4xl font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    {formatMetricValue(value, format)}
                </span>

                <div className="flex items-center gap-2">
                    {delta != null && (
                        <div
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider",
                                isPositive ? "bg-emerald-500/20 text-emerald-400" :
                                    isNegative ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/40"
                            )}
                        >
                            {isPositive ? "+" : ""}{delta.toFixed(1)}%
                        </div>
                    )}

                    {previousValue != null && (
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.05em]">
                            Since last cycle
                        </span>
                    )}
                </div>
            </div>

            {/* Sparkline Overlay */}
            {sparklineData && sparklineData.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#ffffff"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={true}
                                animationDuration={2000}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
