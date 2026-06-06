import React, { useEffect, useRef } from 'react';
import { Terminal, BrainCircuit, Tool, CheckCircle2, AlertCircle, Loader2, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    role: string;
    content: string;
    toolInvocations?: any[];
}

interface AgentTerminalProps {
    messages: Message[];
    isLoading: boolean;
    className?: string;
}

export function AgentTerminal({ messages, isLoading, className }: AgentTerminalProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom as the agent thinks
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [messages, isLoading]);

    return (
        <div className={cn(
            "flex flex-col h-[400px] w-full bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden font-mono text-sm",
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-400" />
                    <span className="text-white/80 font-semibold tracking-tight">GENERAL_BRAIN_V1.0</span>
                </div>
                <div className="flex items-center gap-2">
                    {isLoading ? (
                        <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Processing</span>
                            <Loader2 className="h-3 w-3 text-emerald-500 animate-spin" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-slate-500" />
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Standby</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Logs Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                    {messages.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center h-full pt-10 text-slate-500 opacity-50 space-y-2">
                            <BrainCircuit className="h-10 w-10" />
                            <p>Awaiting deployment sequence...</p>
                        </div>
                    )}

                    {messages.map((m) => (
                        <div key={m.id} className="space-y-3">
                            {/* Agent's Thoughts */}
                            {m.role === 'assistant' && m.content && (
                                <div className="flex gap-3">
                                    <div className="mt-1 h-5 w-5 rounded bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <BrainCircuit className="h-3 w-3 text-emerald-500" />
                                    </div>
                                    <div className="text-emerald-50/80 leading-relaxed max-w-[90%]">
                                        {m.content}
                                    </div>
                                </div>
                            )}

                            {/* Tool Invocations */}
                            {m.toolInvocations?.map((tool: any) => (
                                <div key={tool.toolCallId} className="ml-8 p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-blue-400" />
                                            <span className="text-blue-400 font-bold uppercase text-[10px] tracking-widest">
                                                Executing: {tool.toolName}
                                            </span>
                                        </div>
                                        <Badge variant="outline" className="border-blue-400/30 text-blue-400 text-[10px] py-0 h-4 uppercase">
                                            Active_Action
                                        </Badge>
                                    </div>

                                    {/* Tool Parameters (Visualized for the log) */}
                                    <div className="bg-black/40 p-2 rounded text-[11px] text-slate-400">
                                        <span className="text-slate-500">params:</span> {JSON.stringify(tool.args)}
                                    </div>

                                    {/* Tool Result Status */}
                                    {tool.state === 'result' ? (
                                        <div className="flex items-center gap-2 pt-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                            <span className="text-[11px] text-emerald-400 italic">
                                                Result: {typeof tool.result === 'string' ? tool.result : "Operation successful."}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 pt-1 opacity-50 italic">
                                            <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
                                            <span className="text-[11px] text-blue-400">Waiting for system confirmation...</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex items-center gap-2 pl-4 opacity-50">
                            <span className="text-emerald-500 animate-pulse">_</span>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer Stats (Fake or calculated) */}
            <div className="px-4 py-2 bg-emerald-500/5 border-t border-white/10 flex items-center justify-between text-[10px] text-emerald-500/60 font-bold tracking-widest">
                <span>SYSTEM_OVERRIDE: ENABLED</span>
                <span className="flex items-center gap-1">
                    <FlaskConical className="h-3 w-3" />
                    AUTONOMOUS_OPTIMIZER_ACTIVE
                </span>
            </div>
        </div>
    );
}
