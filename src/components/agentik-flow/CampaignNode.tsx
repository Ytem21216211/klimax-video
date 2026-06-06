import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Box, Layers, PlayCircle, CheckCircle, Clock, TrendingUp, Zap, Target, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project } from '@/types/agentik';

export const CampaignNode = memo(({ data }: { data: Project }) => {
    const metrics = data.metrics || { total_views: 0, daily_views: 0, health_score: 0, vqi: 0, momentum: 0 };

    return (
        <Card className="min-w-[260px] border-2 border-indigo-500/20 bg-[#0d0d14]/95 backdrop-blur shadow-2xl transition-all hover:border-indigo-500/50">
            <Handle type="source" position={Position.Top} className="w-3 h-3 bg-indigo-500" />
            <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                            <Box className="w-4 h-4 text-indigo-400" />
                        </div>
                        <CardTitle className="text-sm font-bold truncate text-white">{data.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter",
                            metrics.health_score > 70 ? "bg-green-500/20 text-green-400" :
                                metrics.health_score > 40 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                        )}>
                            <Zap className="w-3 h-3" />
                            {Math.round(metrics.health_score)}%
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 text-red-500/50 hover:text-red-500 hover:bg-red-500/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onDelete?.(data.id);
                            }}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-0.5">Daily Views</div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-white">{metrics.daily_views.toLocaleString()}</span>
                            {metrics.momentum > 0 && <TrendingUp className="w-3 h-3 text-green-500" />}
                        </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-0.5">VQI Quality</div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-indigo-400">{(metrics.vqi * 10).toFixed(1)}</span>
                            <Target className="w-3 h-3 text-indigo-500" />
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        <span>Neural Health Score</span>
                        <span className={cn(
                            "font-black",
                            metrics.health_score > 70 ? "text-green-400" : "text-indigo-400"
                        )}>{Math.round(metrics.health_score)}/100</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all duration-1000",
                                metrics.health_score > 70 ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" :
                                    metrics.health_score > 40 ? "bg-yellow-500" : "bg-red-500"
                            )}
                            style={{ width: `${metrics.health_score}%` }}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Total Reach</div>
                    <div className="text-[11px] text-slate-300 font-medium">
                        {metrics.total_views.toLocaleString()} views
                    </div>
                </div>
            </CardContent>
            <Handle type="target" position={Position.Bottom} className="w-3 h-3 bg-indigo-500" />
        </Card>
    );
});

CampaignNode.displayName = 'CampaignNode';
