import React, { useState, useCallback, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Connection,
    Edge,
    Node,
    addEdge,
    useNodesState,
    useEdgesState,
    Panel,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { supabase } from "@/integrations/supabase/client";
import { CampaignNode } from '@/components/agentik-flow/CampaignNode';
import { AgentNode } from '@/components/agentik-flow/AgentNode';
import { ChatDrawer } from '@/components/agentik-flow/ChatDrawer';
import { SkillEditorModal } from '@/components/agentik-flow/SkillEditorModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Brain, Plus, Zap, Sidebar as SidebarIcon, LayoutGrid, Sparkles, Sun, Moon, ArrowLeft, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project, Agent } from '@/types/agentik';
import { DeleteEdge } from '@/components/agentik-flow/DeleteEdge';
import { useNavigate } from 'react-router-dom';

const nodeTypes = {
    campaign: CampaignNode,
    agent: AgentNode,
};

const edgeTypes = {
    delete: DeleteEdge,
};

const AgentikFlow = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isSkillEditorOpen, setIsSkillEditorOpen] = useState(false);
    const [isLightMode, setIsLightMode] = useState(false);
    const [fetchStatus, setFetchStatus] = useState({
        projects: 'idle',
        agents: 'idle',
        connections: 'idle',
        lastError: null as string | null
    });
    const { toast } = useToast();
    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.log('No active session, skipping neural fetch.');
                setFetchStatus(prev => ({ ...prev, lastError: 'No active session detected.' }));
                return;
            }

            console.log('--- Agentik Neural Uplink: Fetching Data ---');
            setFetchStatus(prev => ({ ...prev, lastError: null }));
            
            // 1. Fetch Projects (Campaigns)
            setFetchStatus(prev => ({ ...prev, projects: 'loading' }));
            let { data: projectsData, error: projectsError } = await (supabase as any)
                .from('agentik_project_metrics')
                .select('*');

            if (projectsError) {
                console.warn('Metrics view fetch failed, falling back to raw projects:', projectsError);
                const { data: rawProjects, error: rawError } = await (supabase as any)
                    .from('projects')
                    .select('*');
                
                if (rawError) {
                    console.error('All project fetch attempts failed:', rawError);
                    setFetchStatus(prev => ({ ...prev, projects: 'error', lastError: rawError.message }));
                } else {
                    projectsData = rawProjects;
                    setFetchStatus(prev => ({ ...prev, projects: 'fallback' }));
                }
            } else {
                setFetchStatus(prev => ({ ...prev, projects: 'success' }));
            }

            // 2. Filter Noise Projects (User requirement: hide "Project XX")
            const projectNoiseRegex = /^(project\s*[-_]?\s*\d+)$/i;
            let filteredProjects = (projectsData || []).filter((p: any) => {
                const title = (p.title || p.name || "").trim();
                const isNoise = projectNoiseRegex.test(title);
                return !isNoise && title.length > 0 && title.toLowerCase() !== "untitled project";
            });

            // Neural Fallback: If all projects are currently placeholder names, show them anyway
            // to ensure the whiteboard remains an active workspace.
            if (filteredProjects.length === 0 && projectsData && projectsData.length > 0) {
                console.log('Neural Override: Signal low. Restoring placeholder projects to whiteboard.');
                filteredProjects = projectsData;
            }


            // 3. Fetch Agents
            setFetchStatus(prev => ({ ...prev, agents: 'loading' }));
            const { data: agentsData, error: agentsError } = await (supabase as any)
                .from('agentik_agents')
                .select('*');
            
            if (agentsError) {
                console.error('Agents fetch failed:', agentsError);
                setFetchStatus(prev => ({ ...prev, agents: 'error', lastError: agentsError.message }));
            } else {
                setFetchStatus(prev => ({ ...prev, agents: 'success' }));
            }

            // 4. Fetch Connections
            setFetchStatus(prev => ({ ...prev, connections: 'loading' }));
            const { data: connectionsData, error: connError } = await (supabase as any)
                .from('agentik_connections')
                .select('*');
            
            if (connError) {
                console.error('Connections fetch failed:', connError);
                setFetchStatus(prev => ({ ...prev, connections: 'error' }));
            } else {
                setFetchStatus(prev => ({ ...prev, connections: 'success' }));
            }

            const handleDeleteAgent = async (agentId: string) => {
                const { error } = await (supabase as any).from('agentik_agents').delete().eq('id', agentId);
                if (error) {
                    toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
                } else {
                    toast({ title: "Agent Dismissed", description: "The agent has been removed from the flow." });
                    fetchData();
                }
            };

            const handleDeleteProject = async (projectId: string) => {
                const { error } = await (supabase as any).from('projects').delete().eq('id', projectId);
                if (error) {
                    toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
                } else {
                    toast({ title: "Project Deleted", description: "The project has been removed from the pipeline." });
                    fetchData();
                }
            };

            setNodes((currentNodes) => {
                const newNodes: Node[] = [];
                
                // Process Filtered Projects
                filteredProjects.forEach((p: any, i: number) => {
                    const id = `project-${p.id}`;
                    if (!p.id) return; 
                    
                    const existing = currentNodes.find(n => n.id === id);
                    newNodes.push({
                        id,
                        type: 'campaign',
                        position: existing ? existing.position : { x: 450, y: 150 + i * 280 },
                        data: {
                            ...p,
                            name: p.title || p.name || 'Active Campaign',
                            metrics: {
                                total_views: p.total_views || 0,
                                daily_views: p.daily_views || 0,
                                vqi: p.vqi || 0,
                                momentum: p.momentum || 0,
                                health_score: p.health_score || 0
                            },
                            onDelete: handleDeleteProject
                        } as any,
                    });
                });

                (agentsData || []).forEach((a: any, i: number) => {
                    const id = `agent-${a.id}`;
                    const existing = currentNodes.find(n => n.id === id);
                    newNodes.push({
                        id,
                        type: 'agent',
                        position: existing ? existing.position : { x: 50, y: 150 + i * 220 },
                        data: { ...a, onDelete: handleDeleteAgent } as any,
                    });
                });

                // Merge logic: Ensure we don't lose nodes that were just added locally 
                // but might be missing from the next fetch due to RLS latency or sync delay.
                const mergedNodes = [...newNodes];
                currentNodes.forEach(oldNode => {
                    const existsInNew = newNodes.some(n => n.id === oldNode.id);
                    if (!existsInNew && oldNode.type === 'agent') {
                        mergedNodes.push(oldNode);
                    }
                });

                return mergedNodes;
            });



            const initialEdges: Edge[] = (connectionsData || []).map((conn: any) => ({
                id: conn.id,
                source: `agent-${conn.agent_id}`,
                target: `project-${conn.project_id}`,
                type: 'delete',
                animated: false,
                style: { stroke: 'url(#rgbGradient)', strokeWidth: 2 },
            }));

            setEdges(initialEdges);
        } catch (error: any) {
            console.error('Fatal error in AgentikFlow fetch:', error);
            setFetchStatus(prev => ({ ...prev, lastError: error.message }));
        }
    }, [setNodes, setEdges, toast]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const onConnect = useCallback(async (params: Connection) => {
        if (!params.source || !params.target) return;

        const sourceParts = params.source?.split('-');
        const targetParts = params.target?.split('-');
        const sourceType = sourceParts?.[0];
        const targetType = targetParts?.[0];

        let agentId, projectId;

        if (sourceType === 'agent') {
            agentId = sourceParts?.slice(1).join('-');
            projectId = targetParts?.slice(1).join('-');
        } else {
            agentId = targetParts?.slice(1).join('-');
            projectId = sourceParts?.slice(1).join('-');
        }

        if (!agentId || !projectId) return;

        const { error } = await (supabase as any).from('agentik_connections').insert({
            agent_id: agentId,
            project_id: projectId,
        });

        if (error) {
            toast({
                title: "Connection Failed",
                description: error.message,
                variant: "destructive",
            });
            return;
        }

        fetchData();
        toast({ title: "Context Linked", description: "Agent is now attached to this project." });
    }, [fetchData, toast]);

    const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
        for (const edge of deletedEdges) {
            const { error } = await (supabase as any).from('agentik_connections').delete().eq('id', edge.id);
            if (error) {
                toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
            }
        }
    }, [toast]);

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'agent') {
            setSelectedAgent(node.data as unknown as Agent);
            setIsChatOpen(true);
        }
    }, []);

    const createAgent = async () => {
        try {
            const { data: userData, error: authError } = await supabase.auth.getUser();
            if (authError || !userData.user) {
                toast({
                    title: "Authentication Required",
                    description: "You must be signed in to spawn agents.",
                    variant: "destructive",
                });
                return;
            }

            const { data, error } = await (supabase as any).from('agentik_agents').insert({
                name: `Agent-${Math.floor(Math.random() * 1000)}`,
                role: 'strategist',
                user_id: userData.user.id,
            }).select().single();

            if (error) {
                console.error('Spawn Agent Error:', error);
                toast({
                    title: "Neural Synthesis Failed",
                    description: error.message,
                    variant: "destructive",
                });
            } else if (data) {
                setNodes((nds) => [...nds, {
                    id: `agent-${data.id}`,
                    type: 'agent',
                    position: { x: 80, y: 150 },
                    data: data as any,
                }]);
                toast({
                    title: "Agent Spawned",
                    description: `${data.name} is now online.`,
                });
            }
        } catch (err: any) {
            toast({
                title: "System Error",
                description: err.message,
                variant: "destructive",
            });
        }
    };

    const getConnectedProjects = () => {
        if (!selectedAgent) return [];
        const projectIds = edges
            .filter(e => e.source === `agent-${selectedAgent.id}`)
            .map(e => e.target.replace('project-', ''));

        return nodes
            .filter(n => n.type === 'campaign' && projectIds.includes((n.data as any).id as string))
            .map(n => n.data as unknown as Project);
    };

    return (
        <div className={cn(
            "h-screen w-screen transition-colors duration-500 overflow-hidden relative font-sans flex flex-col",
            isLightMode ? "bg-[#f8fafc] text-slate-900" : "bg-[#0c0916] text-white",
            "selection:bg-[#b638fc]/30"
        )}>
            {/* 🌑 Background FX */}
            {!isLightMode && (
                <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
                    <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
                    <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
                </div>
            )}

            <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
                <defs>
                    <linearGradient id="rgbGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b38fc">
                            <animate attributeName="stop-color" values="#3b38fc; #b638fc; #fca5fc; #3b38fc" dur="4s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#fca5fc">
                            <animate attributeName="stop-color" values="#fca5fc; #3b38fc; #b638fc; #fca5fc" dur="4s" repeatCount="indefinite" />
                        </stop>
                    </linearGradient>
                </defs>
            </svg>

            <div className="flex-1 w-full h-full relative z-10">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgesDelete={onEdgesDelete}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{
                        animated: false,
                        style: {
                            stroke: isLightMode ? '#6366f1' : '#ffffff',
                            strokeWidth: 3,
                            filter: isLightMode ? 'none' : 'drop-shadow(0 0 12px rgba(182,56,252,0.8))'
                        }
                    }}
                    fitView
                >
                    <Background color={isLightMode ? "#6366f1" : "#ffffff"} gap={40} size={1} opacity={isLightMode ? 0.3 : 0.08} />
                    <Controls className="bg-[#161224]/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl" />

                <Panel position="top-left" className="flex flex-col gap-6 mt-8 ml-8">
                    <div className="flex items-center gap-6 bg-[#161224]/80 backdrop-blur-3xl p-6 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] group">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate("/dashboard")}
                            className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-4">
                            {/* Landing Style Icon Vessel */}
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.4)] group-hover:scale-110 transition-transform duration-500">
                                <Brain className="w-7 h-7 text-white drop-shadow-md" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] uppercase italic leading-none mb-1">Agentik Flow</h1>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Neural Command Center v4.6</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        {/* Premium Primary Button */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                            <Button
                                onClick={createAgent}
                                className="relative h-12 px-8 bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-black rounded-full shadow-2xl border-none transition-all group-hover:scale-[1.02] active:scale-95 text-[11px] tracking-widest uppercase"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Spawn Agent
                            </Button>
                        </div>

                        <Button
                            onClick={() => setIsSkillEditorOpen(true)}
                            className="h-12 px-8 bg-[#161224]/80 backdrop-blur-2xl border border-white/10 text-white font-black rounded-full shadow-lg hover:bg-white/10 transition-all hover:scale-105 uppercase text-[11px] tracking-widest"
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Skill Architect
                        </Button>
                    </div>
                </Panel>

                <Panel position="top-right" className="mt-8 mr-8 flex items-center gap-4">
                    <div className={cn(
                        "flex items-center gap-3 backdrop-blur-3xl px-6 py-3 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl",
                        isLightMode ? "bg-white/80 border-slate-200 text-indigo-600" : "bg-[#161224]/80 border-white/10 text-emerald-400"
                    )}>
                        <div className="w-2 h-2 rounded-full bg-current animate-pulse shadow-[0_0_8px_currentColor]" />
                        Neural Uplink Live
                    </div>
                    <Button
                        onClick={() => setIsLightMode(!isLightMode)}
                        variant="outline"
                        size="icon"
                        className={cn(
                            "w-12 h-12 rounded-2xl backdrop-blur-3xl transition-all shadow-2xl",
                            isLightMode ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-[#161224]/80 border-white/10 text-white hover:bg-white/10"
                        )}
                    >
                        {isLightMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </Button>
                </Panel>

                <Panel position="bottom-center" className="mb-12">
                    <div className="flex items-center gap-10 bg-[#161224]/80 backdrop-blur-3xl px-12 py-4 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                        <div className="group flex flex-col items-center gap-2 cursor-pointer">
                            <SidebarIcon className="w-6 h-6 text-white/40 group-hover:text-[#b638fc] group-hover:drop-shadow-[0_0_10px_#b638fc] transition-all" />
                            <span className="text-[9px] uppercase font-black text-white/20 group-hover:text-white transition-colors tracking-widest">Inventory</span>
                        </div>
                        <div className="w-px h-10 bg-white/5" />
                        <div className="group flex flex-col items-center gap-2 cursor-pointer">
                            <LayoutGrid className="w-6 h-6 text-white/40 group-hover:text-[#b638fc] group-hover:drop-shadow-[0_0_10px_#b638fc] transition-all" />
                            <span className="text-[9px] uppercase font-black text-white/20 group-hover:text-white transition-colors tracking-widest">Presets</span>
                        </div>
                        <div className="w-px h-10 bg-white/5" />
                        <div className="group flex flex-col items-center gap-2 cursor-pointer">
                            <MousePointer2 className="w-6 h-6 text-white/40 group-hover:text-[#b638fc] group-hover:drop-shadow-[0_0_10px_#b638fc] transition-all" />
                            <span className="text-[9px] uppercase font-black text-white/20 group-hover:text-white transition-colors tracking-widest">Select</span>
                        </div>
                    </div>
                </Panel>
            </ReactFlow>

            {/* ⚠️ Empty State Warning (Diagnostic) */}
            {nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                    <div className="bg-[#161224]/90 backdrop-blur-3xl border border-white/10 p-10 rounded-[40px] shadow-[0_0_100px_rgba(182,56,252,0.2)] text-center animate-in fade-in zoom-in duration-700">
                        <div className="w-20 h-20 bg-gradient-to-br from-[#3b38fc] to-[#b638fc] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse">
                            <Sparkles className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 italic">Neural Network Empty</h2>
                        <p className="text-white/40 text-sm max-w-[300px] font-medium leading-relaxed mb-6">No agents or projects discovered in this section. Spawn an agent to initialize your neural network.</p>
                        <div className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400/60">
                            <span>Status: {fetchStatus.projects === 'success' || fetchStatus.agents === 'success' ? 'Active Uplink' : 'Syncing...'}</span>
                            <div className="flex flex-col gap-1 mt-2 text-left opacity-40">
                                <p>Projects: {fetchStatus.projects} {fetchStatus.projects === 'success' && nodes.filter(n => n.type === 'campaign').length === 0 && '(0 matches)'}</p>
                                <p>Agents: {fetchStatus.agents} {fetchStatus.agents === 'success' && nodes.filter(n => n.type === 'agent').length === 0 && '(0 matches)'}</p>
                                {fetchStatus.lastError && <p className="text-red-400 mt-2 lowercase normal-case font-medium">Error: {fetchStatus.lastError}</p>}
                                {((fetchStatus.projects === 'success' && nodes.filter(n => n.type === 'campaign').length === 0) || (fetchStatus.agents === 'success' && nodes.filter(n => n.type === 'agent').length === 0)) && (
                                    <p className="text-amber-400/60 mt-2 lowercase normal-case font-medium leading-tight">Note: Database responded successfully but returned no data. Ensure your user has projects created and RLS policies are applied.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>

            <ChatDrawer
                agent={selectedAgent}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                connectedProjects={getConnectedProjects()}
            />

            <SkillEditorModal
                isOpen={isSkillEditorOpen}
                onClose={() => setIsSkillEditorOpen(false)}
                onSkillCreated={fetchData}
            />
        </div>
    );
};

export default AgentikFlow;
