import React, { memo, useMemo } from 'react';
import { Handle, Position, useEdges, useNodes } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Shield, Trash2, PlayCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Agent } from '@/types/agentik';
import { useAgentOptimizer } from '@/hooks/useAgentOptimizer';
import { AgentTerminal } from '@/components/agent/AgentTerminal';

export const AgentNode = memo(({ data, id }: { data: Agent; id: string }) => {
    const edges = useEdges();
    const nodes = useNodes();
    const { deployAgent, messages, isLoading } = useAgentOptimizer();

    // Detect if this Agent node is connected to a Campaign (Project) node
    const connectedProjectId = useMemo(() => {
        // Find edges where this node is either source or target
        const connection = edges.find(edge =>
            (edge.source === id && edge.target.startsWith('project-')) ||
            (edge.target === id && edge.source.startsWith('project-'))
        );

        if (!connection) return null;

        const targetId = connection.source === id ? connection.target : connection.source;
        return targetId.replace('project-', '');
    }, [edges, id]);

    const handleDeploy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (connectedProjectId) {
            deployAgent(connectedProjectId, id);
        }
    };

    return (
        <Card className="min-w-[300px] border-2 border-indigo-500/30 bg-[#0d0d14]/90 backdrop-blur-xl shadow-2xl transition-all border-dashed relative group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-indigo-500" />

            <CardContent className="p-5 flex flex-col space-y-4">
                {/* Header Section */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            <Bot className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="font-black text-sm tracking-tight text-white uppercase italic">{data.name}</h3>
                            <p className="text-[10px] font-black text-indigo-400/80 tracking-widest uppercase">{data.role}</p>
                        </div>
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (data.onDelete) data.onDelete(data.id);
                        }}
                        className="w-8 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center border border-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                        isLoading ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse" : "bg-white/5 text-slate-400 border-white/10"
                    )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", isLoading ? "bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-slate-500")} />
                        {isLoading ? "Optimizing" : "System Standby"}
                    </div>
                    <Shield className="w-3.5 h-3.5 text-slate-600" />
                </div>

                {/* Connection Alert */}
                {!connectedProjectId && (
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-center">
                        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-tight">Connect to a Campaign Node to start optimization</p>
                    </div>
                )}

                {/* Actions */}
                <Button
                    disabled={!connectedProjectId || isLoading}
                    onClick={handleDeploy}
                    className={cn(
                        "w-full h-10 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all",
                        connectedProjectId
                            ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                            : "bg-white/5 text-slate-600 border border-white/5"
                    )}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing Strategy...
                        </>
                    ) : (
                        <>
                            <PlayCircle className="w-4 h-4 mr-2" />
                            Deploy Optimizer
                        </>
                    )}
                </Button>

                {/* Agent Terminal (Monologue) */}
                {(messages.length > 0 || isLoading) && (
                    <div className="pt-2">
                        <AgentTerminal
                            messages={messages}
                            isLoading={isLoading}
                            className="h-[250px] border-indigo-500/20 bg-black/60"
                        />
                    </div>
                )}
            </CardContent>

            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-indigo-500" />
        </Card>
    );
});

AgentNode.displayName = 'AgentNode';
