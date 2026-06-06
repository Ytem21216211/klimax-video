import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
    Bot, Send, Brain, Target, ShieldCheck,
    Settings2, MessageSquare, History, Zap,
    BarChart2, FileText, AlertCircle, Search, Rocket,
    Sparkles, Maximize2, Minimize2, Image as ImageIcon, Presentation,
    RotateCcw, FolderPlus, Lightbulb, Crown, ChevronDown,
    Upload, Code, Paperclip, Mic, ArrowUp, Plus, LayoutGrid, SplitSquareHorizontal, Layers
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Agent, Project } from '@/types/agentik';
import { cn } from '@/lib/utils';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { callGrok } from '@/lib/ai-brain';
import { useAgentActions } from '@/hooks/useAgentActions';

interface Message {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

interface ChatDrawerProps {
    agent: Agent | null;
    isOpen: boolean;
    onClose: () => void;
    connectedProjects: Project[];
}

export const ChatDrawer = ({ agent, isOpen, onClose, connectedProjects }: ChatDrawerProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [skills, setSkills] = useState<string[]>([]);
    const [customSkills, setCustomSkills] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [memory, setMemory] = useState<any[]>([]);
    const { toast } = useToast();
    const { updateProjectConfig, triggerBatchRender } = useAgentActions();
    const chatEndRef = React.useRef<HTMLDivElement>(null);
    const fetchDeepProjectData = async () => {
        if (!connectedProjects.length) return [];

        setIsSyncing(true);
        try {
            const projectIds = connectedProjects.map(p => p.id);

            const { data: fullProjects } = await (supabase as any)
                .from('projects')
                .select('*, gamemode:gamemodes(name)')
                .in('id', projectIds);

            const { data: videos } = await (supabase as any)
                .from('videos')
                .select('*')
                .in('project_id', projectIds);

            const { data: voiceovers } = await (supabase as any)
                .from('voiceovers')
                .select('*')
                .in('project_id', projectIds);

            const { data: datalligence } = await (supabase as any)
                .from('video_performance')
                .select('*')
                .in('project_id', projectIds);

            return connectedProjects.map(cp => {
                const fullP = (fullProjects || []).find((p: any) => p.id === cp.id);
                return {
                    ...cp,
                    ...fullP,
                    videos: (videos || []).filter((v: any) => v.project_id === cp.id),
                    voiceovers: (voiceovers || []).filter((v: any) => v.project_id === cp.id),
                    datalligence: (datalligence || []).filter((d: any) => d.project_id === cp.id)
                };
            });
        } catch (error) {
            console.error('Error fetching deep context:', error);
            return connectedProjects;
        } finally {
            setIsSyncing(false);
        }
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchCustomSkills = async () => {
        const { data } = await (supabase as any).from('agentik_skills').select('*');
        if (data) setCustomSkills(data);
    };

    const fetchMessages = async () => {
        if (!agent) return;
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { data, error } = await (supabase as any)
            .from('agentik_chat_messages')
            .select('role, content, metadata')
            .eq('agent_id', agent.id)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return;
        }

        if (data && data.length > 0) {
            setMessages(data.map((m: any) => ({
                role: m.role,
                content: m.content,
                tool_calls: m.metadata?.tool_calls,
                tool_call_id: m.metadata?.tool_call_id,
                name: m.metadata?.name
            })));
        } else {
            setMessages([
                {
                    role: 'assistant',
                    content: `Hello! I am ${agent.name}, your ${agent.role}. I am currently analyzing ${connectedProjects.length} connected projects. How can I help you today?`
                }
            ]);
        }
    };

    const fetchMemory = async () => {
        if (!agent) return;
        setIsSyncing(true);
        try {
            const { data: messages } = await (supabase as any)
                .from('agentik_chat_messages')
                .select('*')
                .eq('agent_id', agent.id)
                .eq('role', 'assistant')
                .order('created_at', { ascending: false })
                .limit(5);

            setMemory(messages || []);
        } catch (error) {
            console.error('Error fetching memory:', error);
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        fetchCustomSkills();
        if (agent) {
            setSkills(agent.skills || []);
        }

        if (agent && isOpen) {
            fetchMessages();
            fetchMemory();
        }
    }, [agent, isOpen, connectedProjects.length]);

    const toggleSkill = async (skillId: string) => {
        if (!agent) return;

        const newSkills = skills.includes(skillId)
            ? skills.filter(s => s !== skillId)
            : [...skills, skillId];

        setSkills(newSkills);

        await (supabase as any).from('agentik_agents').update({
            skills: newSkills
        }).eq('id', agent.id);
    };

    const handleSendMessage = async () => {
        if (!input.trim() || !agent) return;

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const userMessage: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsTyping(true);

        try {
            await (supabase as any).from('agentik_chat_messages').insert({
                agent_id: agent.id,
                user_id: userData.user.id,
                role: 'user',
                content: userMessage.content
            });

            const deepProjects = await fetchDeepProjectData();

            // Fetch Agentic Knowledge
            const { data: knowledge } = await (supabase as any)
                .from('agentik_knowledge')
                .select('*, gamemode:gamemodes(name)');

            const coreBrain = knowledge?.find((k: any) => k.type === 'core')?.content || '';
            
            const gmKnowledgeMap = deepProjects.reduce((acc: any, p: any) => {
                if (!p.gamemode_id) return acc;
                const brains = knowledge?.filter((k: any) => k.type === 'brain' && k.gamemode_id === p.gamemode_id) || [];
                const scripts = knowledge?.filter((k: any) => k.type === 'script' && k.gamemode_id === p.gamemode_id) || [];
                
                if (brains.length || scripts.length) {
                    acc[p.gamemode?.name || 'Standard'] = {
                        brains: brains.map(b => b.content).join('\n---\n'),
                        scripts: scripts.map(s => s.content).join('\n---\n')
                    };
                }
                return acc;
            }, {});

            const gmKnowledgeInfo = Object.entries(gmKnowledgeMap).map(([name, data]: [string, any]) => {
                return `GAMEMODE: ${name}\nBRAIN CONTEXT:\n${data.brains}\n\nSCRIPT REFERENCES:\n${data.scripts}`;
            }).join('\n\n');

            const projectsInfo = deepProjects.map(p => {
                const videoCount = p.videos?.length || 0;

                // Deep Data Matrix Extraction
                let cumulativeViews = 0;
                let cumulativeLikes = 0;
                let dailyGrowthSlope = 0;
                let predicted24h = 0;
                let predicted7d = 0;
                let topPerformingHooks = '';

                const datalligence = p.datalligence || [];

                if (datalligence.length > 0) {
                    const sortedPerf = [...datalligence].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                    // Aggregate totals
                    datalligence.forEach((d: any) => {
                        cumulativeViews += d.youtube_views || 0;
                        cumulativeLikes += d.youtube_likes || 0;
                    });

                    // Tablor Predictive Math (Linear Trajectory)
                    if (sortedPerf.length >= 2) {
                        const recent = sortedPerf.slice(-3);
                        const first = recent[0].youtube_views || 0;
                        const last = recent[recent.length - 1].youtube_views || 0;
                        const days = Math.max(1, recent.length - 1);
                        dailyGrowthSlope = Math.max((last - first) / days, 50); // Floor growth to 50
                    } else if (sortedPerf.length === 1) {
                        dailyGrowthSlope = Math.max(sortedPerf[0].youtube_views || 0, 50);
                    }

                    predicted24h = cumulativeViews + dailyGrowthSlope;
                    predicted7d = cumulativeViews + (dailyGrowthSlope * 7);

                    // Top 2 hooks
                    const topVids = [...datalligence].sort((a: any, b: any) => (b.youtube_views || 0) - (a.youtube_views || 0)).slice(0, 2);
                    topPerformingHooks = topVids.map((v: any) => `Hook: "${v.hook_text}" (${v.youtube_views} views)`).join(' | ');
                }

                const { datalligence: _, videos: __, voiceovers: ___, ...configData } = p;

                return `PROJECT: ${p.title} (ID: ${p.id})
STATUS: ${p.status}
GENERATED VIDEOS: ${videoCount}
--- DATALLIGENCE SUMMARY ---
TOTAL VIEWS: ${cumulativeViews} | LIKES: ${cumulativeLikes}
PREDICTED 24H: ${Math.floor(predicted24h)} | 7D: ${Math.floor(predicted7d)}
VELOCITY: ${Math.floor(dailyGrowthSlope)}/day
TOP HOOKS: ${topPerformingHooks || 'None yet'}
--- FULL CONFIGURATION MATRIX ---
${JSON.stringify(configData, null, 2)}`;
            }).join('\n\n');

            const activeSkillsInfo = customSkills
                .filter(s => skills.includes(s.id))
                .map(s => `Skill [${s.name}]: ${s.description}`)
                .join('\n');

            // Fetch Collective Learning Knowledge
            const { data: collectiveKnowledge } = await (supabase as any)
                .from('agentik_knowledge')
                .select('content')
                .eq('type', 'collective_learning');

            const collectiveWisdomInfo = collectiveKnowledge?.length 
                ? collectiveKnowledge.map((k: any) => `* ${k.content}`).join('\n')
                : "No collective wisdom gathered yet. Start experimenting to build the brain.";

            const systemPrompt = `You are ${agent.name}, the ${agent.role} of the Agentik Command Center. You have direct read-access to live database metrics for your connected projects. 

## CORE INTELLIGENCE (UNIVERSIAL BRAIN)
${coreBrain || 'No core brain defined.'}

## DOMAIN KNOWLEDGE (GAMEMODE SPECIFIC)
${gmKnowledgeInfo || 'No specialized gamemode knowledge found.'}

Connected Projects Deep Matrix:
${projectsInfo}

Active Protocol Skills:
${activeSkillsInfo}

When asked for analysis or predictions, use the exact data numbers provided above. Calculate suggestions based on velocity and hook performance. Be highly strategic and concise.

## AGENT AUTONOMY & TOOLS
You are capable of performing actual work within the project. If a user asks to change a style, generate videos, or update project info, use the available tools to execute the request immediately. 
- Use 'update_project_config' for ANY changes to style, subtitles, visual mode, music, metadata, effects, etc.
- Use 'render_videos' for generating batches of videos.
- Use 'synthesize_visual_knowledge' to analyze past performance and save a 'Collective Learning' conclusion (the ".md file" equivalent) which will benefit all agents.
Always explain what you did after using a tool.

## COLLECTIVE VISUAL WISDOM (EXPERIENCE FROM ALL PROJECTS)
${collectiveWisdomInfo}`;

            const tools = [
                {
                    type: "function",
                    function: {
                        name: "update_project_config",
                        description: "Powerful global configuration tool. Update ANY project property or deep-merge into setting groups (subtitle_settings, music_settings, ip_popup_settings, end_screen_settings, colorimetry_settings, effects_settings, etc.).",
                        parameters: {
                            type: "object",
                            properties: {
                                project_id: { type: "string", description: "The UUID of the project to update." },
                                updates: { 
                                    type: "object", 
                                    description: "A partial Project object. For JSONB columns like subtitle_settings, only provide the fields you want to change." 
                                }
                            },
                            required: ["project_id", "updates"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "synthesize_visual_knowledge",
                        description: "Analyzes the link between recent actions and performance. Use this to save a 'Collective Learning' conclusion that makes all agents smarter. This is your 'Self-Improving' mechanism.",
                        parameters: {
                            type: "object",
                            properties: {
                                project_id: { type: "string", description: "The UUID of the project to analyze." },
                                conclusion_md: { type: "string", description: "A detailed Markdown conclusion linking actions to stats. Example: 'Red bold fonts increased velocity by 5% on gaming projects.'" }
                            },
                            required: ["project_id", "conclusion_md"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "render_videos",
                        description: "Trigger a batch of video renders for a project.",
                        parameters: {
                            type: "object",
                            properties: {
                                project_id: { type: "string", description: "The UUID of the project." },
                                batch_count: { type: "number", minimum: 1, maximum: 5, description: "Number of videos to generate in this batch." },
                                prompt_override: { type: "string", description: "Optional new prompt for the videos." },
                                target_duration: { type: "number", description: "Target length in seconds." }
                            },
                            required: ["project_id", "batch_count"]
                        }
                    }
                },
            ];

            const apiMessages = [...messages, userMessage];
            let response = await callGrok(apiMessages, systemPrompt, undefined, tools);

            // Handle Tool Calling Loop
            if (response && typeof response === 'object' && response.tool_calls) {
                const toolCalls = response.tool_calls;
                const assistantMessageWithTools: Message = { 
                    role: 'assistant', 
                    content: response.content || '', 
                    tool_calls: toolCalls 
                };
                
                setMessages(prev => [...prev, assistantMessageWithTools]);
                
                const toolResults: Message[] = [];
                
                for (const toolCall of toolCalls) {
                    const { name, arguments: argsString } = toolCall.function;
                    const args = JSON.parse(argsString);
                    let result: any;

                    console.log(`[Agent Action] Executing ${name} with args:`, args);

                    if (name === "update_project_config") {
                        result = await updateProjectConfig(args.project_id, args.updates, agent.id);
                    } else if (name === "render_videos") {
                        result = await triggerBatchRender(args.project_id, args.batch_count, {
                            prompt: args.prompt_override,
                            duration: args.target_duration
                        }, agent.id);
                    } else if (name === "synthesize_visual_knowledge") {
                        const { error } = await (supabase as any).from('agentik_knowledge').insert({
                            user_id: user?.id,
                            type: 'collective_learning',
                            content: args.conclusion_md
                        });
                        result = error ? { success: false, error: error.message } : { success: true };
                    }

                    toolResults.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: name,
                        content: JSON.stringify(result)
                    });
                }

                // Get final response from AI after tools
                const finalResponse = await callGrok([...apiMessages, assistantMessageWithTools, ...toolResults], systemPrompt, undefined, tools);
                const dataText = typeof finalResponse === 'string' ? finalResponse : finalResponse.content;

                const assistantMessage: Message = { role: 'assistant', content: dataText };
                setMessages(prev => [...prev, assistantMessage]);

                await (supabase as any).from('agentik_chat_messages').insert([
                    {
                        agent_id: agent.id,
                        user_id: userData.user.id,
                        role: 'assistant',
                        content: assistantMessageWithTools.content,
                        metadata: { tool_calls: toolCalls }
                    },
                    ...toolResults.map(tr => ({
                        agent_id: agent.id,
                        user_id: userData.user.id,
                        role: 'tool',
                        content: tr.content,
                        metadata: { tool_call_id: tr.tool_call_id, name: tr.name }
                    })),
                    {
                        agent_id: agent.id,
                        user_id: userData.user.id,
                        role: 'assistant',
                        content: dataText
                    }
                ]);
            } else {
                const dataText = typeof response === 'string' ? response : response.content;
                const assistantMessage: Message = { role: 'assistant', content: dataText };
                setMessages(prev => [...prev, assistantMessage]);

                await (supabase as any).from('agentik_chat_messages').insert({
                    agent_id: agent.id,
                    user_id: userData.user.id,
                    role: 'assistant',
                    content: dataText
                });
            }
        } catch (err: any) {
            toast({ title: "Neural Link Error", description: err.message, variant: "destructive" });
        } finally {
            setIsTyping(false);
        }
    };

    if (!agent) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent
                className={cn(
                    "flex flex-col p-0 text-white transition-all duration-500 ease-in-out outline-none overflow-hidden",
                    isExpanded
                        ? "!max-w-none !w-screen !h-screen rounded-none border-none bg-black/60 backdrop-blur-3xl !left-0 !top-0 !right-0 !bottom-0 !m-0"
                        : "w-[400px] sm:w-[540px] h-full border-l border-indigo-500/20 bg-[#0a0f1a]/95 backdrop-blur-3xl shadow-[-20px_0_100px_rgba(99,102,241,0.2)]"
                )}
            >
                {isExpanded ? (
                    <div className="flex-1 flex w-full h-full bg-transparent p-0 sm:p-8 md:p-12 items-center justify-center">
                        <div className="w-full h-full max-w-[1400px] flex rounded-[2rem] overflow-hidden shadow-2xl relative border border-white/5 bg-[#141217]/90 backdrop-blur-3xl">

                            {/* Left Sidebar */}
                            <div className="w-[280px] bg-[#0c0a0e]/60 flex flex-col border-r border-white/5 p-5 shrink-0 transition-opacity duration-300 relative z-10 backdrop-blur-xl">
                                <div className="flex items-center justify-between mb-8 px-1 pt-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                                            <Bot className="w-4 h-4 text-slate-200" />
                                        </div>
                                        <span className="font-medium text-base tracking-tight text-white">{agent.name}</span>
                                    </div>
                                    <button className="text-slate-500 hover:text-white transition-colors">
                                        <SplitSquareHorizontal className="w-4 h-4" />
                                    </button>
                                </div>

                                <Button className="w-full justify-start gap-3 bg-white/5 hover:bg-white/10 text-slate-200 font-medium h-10 mb-8 rounded-xl border border-white/5 transition-colors shadow-none text-sm px-4">
                                    <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center">
                                        <Plus className="w-2.5 h-2.5" />
                                    </div>
                                    New Chat
                                </Button>

                                <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pb-4">
                                    <div>
                                        <p className="text-[11px] text-slate-500 font-medium mb-3 px-3 uppercase tracking-wider">Features</p>
                                        <div className="space-y-1">
                                            <Button variant="ghost" className="w-full justify-start gap-3 h-10 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl px-3 font-normal text-sm group" onClick={() => setActiveTab('chat')}>
                                                <MessageSquare className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> Chat
                                            </Button>
                                            <Button variant="ghost" className="w-full justify-start gap-3 h-10 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl px-3 font-normal text-sm group" onClick={() => setActiveTab('memory')}>
                                                <History className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> Memory
                                            </Button>
                                            <Button variant="ghost" className="w-full justify-start gap-3 h-10 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl px-3 font-normal text-sm group" onClick={() => setActiveTab('skills')}>
                                                <Layers className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> Skills
                                            </Button>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] text-slate-500 font-medium mb-3 px-3 uppercase tracking-wider">Connected Projects</p>
                                        <div className="space-y-1">
                                            {connectedProjects.length > 0 ? connectedProjects.map(p => (
                                                <Button key={p.id} variant="ghost" className="w-full justify-start gap-3 h-10 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl px-3 font-normal text-sm group">
                                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", p.status === 'completed' ? "bg-green-500" : "bg-amber-500")} />
                                                    <span className="truncate">{p.title}</span>
                                                </Button>
                                            )) : (
                                                <div className="py-4 text-center">
                                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">No Projects</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto shrink-0 pt-4 px-1">
                                    <div className="p-4 rounded-[1.25rem] bg-[#1a1720]/80 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                            <Crown className="w-4 h-4 text-slate-300" />
                                        </div>
                                        <p className="font-semibold text-sm mb-1 text-slate-200">Upgrade to premium</p>
                                        <p className="text-[11px] text-slate-500 leading-relaxed mb-4">Boost productivity with seamless automation and responsive AI, built to adapt to your needs.</p>
                                        <Button className="w-full bg-white/5 hover:bg-white/10 text-white rounded-xl h-9 text-xs transition-colors border border-white/5 font-medium">
                                            Upgrade
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Main Area */}
                            <div className="flex-1 flex flex-col relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3a2051] via-[#1a1420] to-[#120e14] p-6 overflow-hidden transition-all duration-300">

                                {/* Top Nav Buttons */}
                                <div className="absolute top-6 left-6 flex items-center gap-3 z-20">
                                    <Button className="bg-black/30 hover:bg-black/50 backdrop-blur-md text-slate-200 text-xs h-9 rounded-full px-4 border border-white/5 gap-2 transition-colors font-medium">
                                        Agentik Core <ChevronDown className="w-3 h-3 text-slate-400" />
                                    </Button>
                                </div>
                                <div className="absolute top-6 right-6 flex items-center gap-3 z-20">
                                    <Button className="bg-black/30 hover:bg-black/50 backdrop-blur-md text-slate-200 text-xs h-9 rounded-full px-4 border border-white/5 gap-2 transition-colors font-medium">
                                        Configuration <Settings2 className="w-3 h-3 text-slate-400" />
                                    </Button>
                                    <Button className="bg-black/30 hover:bg-black/50 backdrop-blur-md text-slate-200 text-xs h-9 rounded-full px-4 border border-white/5 gap-2 transition-colors font-medium">
                                        Export <Upload className="w-3 h-3 text-slate-400" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} className="text-slate-400 hover:text-white bg-transparent hover:bg-white/10 rounded-full h-9 w-9 border-none">
                                        <Minimize2 className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Content area centered vertically/horizontally */}
                                <div className={cn(
                                    "flex-1 flex flex-col w-full max-w-4xl mx-auto relative z-10 h-full overflow-hidden min-h-0",
                                    messages.length <= 1 ? "items-center justify-center pt-12" : "pt-4 pb-2"
                                )}>

                                    {messages.length <= 1 ? (
                                        <div className="text-center animate-in slide-in-from-bottom-8 duration-700 w-full flex flex-col items-center">
                                            {/* Glowing orb */}
                                            <div className="relative w-16 h-16 mx-auto mb-8 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-indigo-600 shadow-[0_0_80px_rgba(139,92,246,0.6)] animate-pulse shadow-purple-500/50">
                                                <div className="absolute inset-0.5 rounded-full bg-gradient-to-tr from-purple-900/40 to-transparent backdrop-blur-sm"></div>
                                                <div className="absolute top-2 right-3 w-4 h-4 bg-white/40 rounded-full blur-[2px]"></div>
                                            </div>

                                            <h2 className="text-3xl font-medium tracking-tight text-white mb-10">Ready to Create Something New?</h2>

                                            <div className="flex items-center justify-center gap-4 mb-4 w-full flex-wrap">
                                                <Button className="bg-transparent hover:bg-white/5 border border-white/10 text-slate-300 hover:text-white rounded-full h-10 px-5 gap-3 text-xs transition-colors font-medium shadow-none">
                                                    Analyze Metrics <BarChart2 className="w-4 h-4 text-slate-400" />
                                                </Button>
                                                <Button className="bg-transparent hover:bg-white/5 border border-white/10 text-slate-300 hover:text-white rounded-full h-10 px-5 gap-3 text-xs transition-colors font-medium shadow-none">
                                                    Generate Hooks <Zap className="w-4 h-4 text-slate-400" />
                                                </Button>
                                                <Button className="bg-transparent hover:bg-white/5 border border-white/10 text-slate-300 hover:text-white rounded-full h-10 px-5 gap-3 text-xs transition-colors font-medium shadow-none">
                                                    Pivot Strategy <Target className="w-4 h-4 text-slate-400" />
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <ScrollArea className="flex-1 w-full min-h-0 px-2 mb-4">
                                            <div className="space-y-6 pb-20 pt-10">
                                                {messages.map((msg, i) => (
                                                    <div key={i} className={cn(
                                                        "flex flex-col max-w-[85%]",
                                                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                                                    )}>
                                                        <div className={cn(
                                                            "px-6 py-4 rounded-3xl text-[15px] leading-relaxed font-normal whitespace-pre-wrap",
                                                            msg.role === 'user'
                                                                ? "bg-[#25202e] text-slate-200 rounded-tr-sm border border-white/5"
                                                                : "bg-transparent text-slate-300 border-none px-0"
                                                        )}>
                                                            {msg.role === 'assistant' && (
                                                                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center mb-3">
                                                                    <Bot className="w-3.5 h-3.5 text-slate-300" />
                                                                </div>
                                                            )}
                                                            <div className={cn(
                                                                "prose prose-invert max-w-none",
                                                                "prose-p:leading-relaxed prose-p:mb-4 last:prose-p:mb-0",
                                                                "prose-headings:text-white prose-headings:font-semibold prose-headings:mb-4 prose-headings:mt-6 first:prose-headings:mt-0",
                                                                "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
                                                                "prose-strong:text-white prose-strong:font-semibold",
                                                                "prose-ul:my-4 prose-ol:my-4 prose-li:my-1",
                                                                "prose-a:text-indigo-400 hover:prose-a:text-indigo-300",
                                                                "prose-code:text-indigo-300 prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none",
                                                                "prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl",
                                                                "prose-blockquote:border-l-2 prose-blockquote:border-indigo-500/50 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-400"
                                                            )}>
                                                                <ReactMarkdown>
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                                {msg.tool_calls && (
                                                                    <div className="mt-2 space-y-2">
                                                                        {msg.tool_calls.map((tc: any, idx: number) => (
                                                                            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-300 w-fit">
                                                                                <Zap className="w-3 h-3 animate-pulse" />
                                                                                Executing: {tc.function.name}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {isTyping && (
                                                    <div className="flex gap-1.5 p-3 px-5 bg-black/20 border border-white/5 rounded-2xl w-fit animate-pulse rounded-tl-sm">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                                    </div>
                                                )}
                                                <div ref={chatEndRef} className="h-px" />
                                            </div>
                                        </ScrollArea>
                                    )}

                                    {/* Input Area */}
                                    <div className="w-full max-w-4xl shrink-0 space-y-4">
                                        <div className="w-full bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-4 shadow-2xl relative transition-all focus-within:bg-white/[0.05] focus-within:border-white/[0.15]">
                                            <div className="flex items-start gap-4 px-2 pt-2 pb-8">
                                                <Sparkles className="w-6 h-6 text-[#c084fc] mt-1 shrink-0" />
                                                <Textarea
                                                    value={input}
                                                    onChange={(e) => setInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                                                    placeholder="Ask Anything..."
                                                    className="min-h-[90px] border-none bg-transparent focus-visible:ring-0 text-slate-200 resize-none text-lg placeholder:text-slate-400/70 font-normal p-1 shadow-none"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between px-2 pb-1">
                                                <div className="flex items-center">
                                                    <button className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors font-medium h-8 px-2 rounded-lg hover:bg-white/5">
                                                        <Paperclip className="w-4 h-4 text-slate-400" /> Attach
                                                    </button>
                                                    <div className="w-[1px] h-4 bg-white/10 mx-2"></div>
                                                    <button className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors font-medium h-8 px-2 rounded-lg hover:bg-white/5">
                                                        <Settings2 className="w-4 h-4 text-slate-400" /> Settings
                                                    </button>
                                                    <div className="w-[1px] h-4 bg-white/10 mx-2"></div>
                                                    <button className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors font-medium h-8 px-2 rounded-lg hover:bg-white/5">
                                                        <LayoutGrid className="w-4 h-4 text-slate-400" /> Options
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Button size="icon" className="rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white w-10 h-10 transition-colors shadow-none border border-white/5">
                                                        <Mic className="w-4 h-4" />
                                                    </Button>
                                                    <Button onClick={handleSendMessage} size="icon" className="rounded-full bg-[#9333ea] hover:bg-[#7e22ce] text-white w-10 h-10 shadow-[0_0_15px_rgba(147,51,234,0.4)] transition-all">
                                                        <ArrowUp className="w-5 h-5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <SheetHeader className="p-6 border-b border-white/5 bg-transparent shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                        <Bot className="w-6 h-6 text-indigo-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <SheetTitle className="text-xl font-black tracking-tight text-white mb-1">{agent.name}</SheetTitle>
                                        <SheetDescription className="flex items-center gap-2">
                                            <span className="text-indigo-400 font-bold uppercase text-[10px] tracking-[0.2em] leading-none">{agent.role}</span>
                                            <span className="w-1 h-1 rounded-full bg-white/20" />
                                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{agent.permission_level}</span>
                                        </SheetDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsExpanded(true)}
                                    className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl h-10 w-10 transition-all mr-8"
                                    title="Expand to Full Screen"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </SheetHeader>

                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 flex flex-col min-h-0 bg-transparent">
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                    <div className="px-6 border-b border-white/5 bg-black/20 shrink-0">
                                        <TabsList className="bg-transparent h-14 w-full justify-start gap-6 rounded-none p-0">
                                            <TabsTrigger value="chat" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 border-indigo-500 rounded-none h-full px-0 flex gap-2">
                                                <MessageSquare className="w-4 h-4" /> Chat
                                            </TabsTrigger>
                                            <TabsTrigger value="skills" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 border-indigo-500 rounded-none h-full px-0 flex gap-2">
                                                <Settings2 className="w-4 h-4" /> Skills
                                            </TabsTrigger>
                                            <TabsTrigger value="memory" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 border-indigo-500 rounded-none h-full px-0 flex gap-2">
                                                <History className="w-4 h-4" /> Memory
                                            </TabsTrigger>
                                            <TabsTrigger value="strategy" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 border-indigo-500 rounded-none h-full px-0 flex gap-2">
                                                <Presentation className="w-4 h-4" /> Strategy
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>

                                    <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden m-0 flex flex-col">
                                        <div className="p-4 border-b border-white/5 bg-white/5 flex gap-4 overflow-x-auto no-scrollbar shrink-0">
                                            {connectedProjects.map(p => (
                                                <div key={p.id} className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", p.status === 'completed' ? "bg-green-500" : "bg-amber-500")} />
                                                    {p.title}
                                                </div>
                                            ))}
                                            {connectedProjects.length === 0 && (
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic flex items-center gap-2">
                                                    <AlertCircle className="w-3 h-3" />
                                                    No Projects Connected
                                                </div>
                                            )}
                                        </div>

                                        <ScrollArea className="flex-1 px-6">
                                            <div className="py-6 space-y-6 pb-20 pt-8">
                                                {messages.map((msg, i) => (
                                                    <div key={i} className={cn(
                                                        "flex flex-col max-w-[85%]",
                                                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                                                    )}>
                                                        <div className={cn(
                                                            "px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium whitespace-pre-wrap shadow-sm",
                                                            msg.role === 'user'
                                                                ? "bg-indigo-600/90 text-white rounded-tr-sm shadow-indigo-500/20 backdrop-blur-md"
                                                                : "bg-black/40 text-slate-200 rounded-tl-sm border border-white/10 backdrop-blur-md"
                                                        )}>
                                                            <div className={cn(
                                                                "prose prose-invert max-w-none text-sm",
                                                                "prose-p:leading-normal prose-p:mb-2 last:prose-p:mb-0",
                                                                "prose-strong:text-white"
                                                            )}>
                                                                <ReactMarkdown>
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                                {msg.tool_calls && (
                                                                    <div className="mt-2 space-y-2">
                                                                        {msg.tool_calls.map((tc: any, idx: number) => (
                                                                            <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold uppercase tracking-wider text-indigo-300 w-fit">
                                                                                <Zap className="w-2.5 h-2.5 animate-pulse" />
                                                                                Executing: {tc.function.name}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {isTyping && (
                                                    <div className="flex gap-1.5 p-3 px-5 bg-black/40 border border-white/10 rounded-2xl w-fit animate-pulse rounded-tl-sm backdrop-blur-md">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50" />
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-300/20" />
                                                    </div>
                                                )}
                                                <div ref={chatEndRef} className="h-px" />
                                            </div>
                                        </ScrollArea>

                                        <div className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-xl shrink-0">
                                            <div className="relative group">
                                                <Input
                                                    placeholder="Instruct the neural agent..."
                                                    value={input}
                                                    onChange={(e) => setInput(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                                    className="bg-white/5 border-white/10 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-12 pr-12 text-white placeholder:text-muted-foreground/50 rounded-xl transition-all"
                                                />
                                                <Button onClick={handleSendMessage} size="icon" className="absolute right-1.5 top-1.5 h-9 w-9 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg shadow-lg shadow-indigo-500/20 transition-all">
                                                    <Send className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="skills" className="flex-1 overflow-auto m-0 p-6 space-y-4">
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-4">Neural Skill Registry</h4>
                                            <div className="grid gap-4">
                                                {customSkills.map(skill => (
                                                    <div key={skill.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-4 transition-all hover:border-indigo-500/30">
                                                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                                            <Zap className="w-5 h-5 text-indigo-400" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h5 className="text-sm font-bold text-white">{skill.name}</h5>
                                                            <p className="text-[10px] text-muted-foreground truncate">{skill.description}</p>
                                                        </div>
                                                        <Switch
                                                            checked={skills.includes(skill.id)}
                                                            onCheckedChange={() => toggleSkill(skill.id)}
                                                        />
                                                    </div>
                                                ))}
                                                {customSkills.length === 0 && (
                                                    <div className="text-center py-8 border-2 border-dashed border-white/5 rounded-2xl">
                                                        <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No custom skills found</p>
                                                        <p className="text-[10px] text-muted-foreground/50 mt-1">Use the Skill Architect to create one.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 flex gap-3">
                                            <ShieldCheck className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Gated Skills</p>
                                                <p className="text-[10px] text-muted-foreground italic">Autonomous execution requires Admin permission level.</p>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="memory" className="flex-1 overflow-auto m-0 p-6 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Knowledge Blobs</h4>
                                                <div className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-[8px] font-black uppercase tracking-widest text-indigo-200">
                                                    Vector-Active
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                {memory.length > 0 ? memory.map((m) => (
                                                    <div key={m.id} className="p-3 rounded-lg bg-white/5 border-l-2 border-indigo-500 flex flex-col gap-1 shadow-sm transition-all hover:bg-white/10 group">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-tighter">Strategic Insight</span>
                                                            <span className="text-[8px] text-muted-foreground uppercase">
                                                                {new Date(m.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-300 italic font-medium leading-relaxed line-clamp-3">
                                                            "{m.content.length > 150 ? m.content.substring(0, 150) + '...' : m.content}"
                                                        </p>
                                                    </div>
                                                )) : (
                                                    <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                                        <Brain className="w-8 h-8 text-white/10 mx-auto mb-3" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Neural Store Empty</p>
                                                        <p className="text-[10px] text-muted-foreground/50 mt-1">Start a conversation to build memory.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-4 rounded-xl border border-white/5 bg-black/40 flex items-center justify-center gap-3">
                                            <Brain className={cn("w-5 h-5 text-indigo-500/50", isSyncing && "animate-spin text-indigo-400")} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                {isSyncing ? "Hydrating Neural Context..." : "Knowledge Store Synchronized"}
                                            </span>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="strategy" className="flex-1 overflow-auto m-0 p-6 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Neural Strategy Reports</h4>
                                                <div className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[8px] font-black uppercase tracking-widest text-amber-200">
                                                    Grok-Powered
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                {memory.filter(m => m.content.includes("STRATEGY SUMMARY") || m.content.includes("NEURAL EXECUTION REPORT")).length > 0 ? (
                                                    memory.filter(m => m.content.includes("STRATEGY SUMMARY") || m.content.includes("NEURAL EXECUTION REPORT")).map((m) => (
                                                        <div key={m.id} className="p-5 rounded-2xl bg-black/40 border border-indigo-500/20 shadow-xl space-y-3">
                                                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Deployment Report</span>
                                                                </div>
                                                                <span className="text-[8px] text-muted-foreground">
                                                                    {new Date(m.created_at).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="prose prose-invert prose-xs max-w-none prose-p:text-[11px] prose-p:leading-relaxed prose-strong:text-indigo-300 prose-table:text-[10px]">
                                                                <ReactMarkdown>
                                                                    {m.content}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="py-20 text-center space-y-4 bg-white/5 rounded-3xl border-2 border-dashed border-white/5">
                                                        <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto border border-indigo-500/20">
                                                            <Presentation className="w-6 h-6 text-indigo-500/40" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-white uppercase tracking-widest">No Active Strategies</p>
                                                            <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] mx-auto">Click **Deploy Optimizer** on an Agent node to generate your first strategic report.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
