import React, { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
    Brain, Cpu, ScrollText, Save, Plus, 
    Trash2, Sparkles, Binary, LayoutDashboard,
    ArrowLeft, History, Zap, Shield
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const AgenticSuit = () => {
    const [gamemodes, setGamemodes] = useState<any[]>([]);
    const [knowledge, setKnowledge] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState('universal');
    const [selectedGamemode, setSelectedGamemode] = useState<string>('');
    const [content, setContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        fetchGamemodes();
        fetchKnowledge();
    }, []);

    const fetchGamemodes = async () => {
        const { data } = await supabase.from('gamemodes').select('*').order('name');
        if (data) setGamemodes(data);
    };

    const fetchKnowledge = async () => {
        const { data } = await supabase.from('agentik_knowledge').select('*');
        if (data) setKnowledge(data);
    };

    const handleSave = async (type: 'core' | 'brain' | 'script') => {
        setIsSaving(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return;

            const entryData = {
                user_id: userData.user.id,
                type,
                gamemode_id: (type === 'brain' || type === 'script') ? selectedGamemode : null,
                content: content,
                updated_at: new Date().toISOString()
            };

            // Upsert logic for unique constraints defined in migration
            const { error } = await supabase
                .from('agentik_knowledge')
                .upsert(entryData, { 
                    onConflict: 'user_id,type,gamemode_id' 
                });

            if (error) throw error;

            toast({ title: "Neural Link Synchronized", description: `${type.toUpperCase()} knowledge has been saved.` });
            fetchKnowledge();
        } catch (error: any) {
            toast({ title: "Save Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const deleteKnowledge = async (id: string) => {
        const { error } = await supabase.from('agentik_knowledge').delete().eq('id', id);
        if (error) {
            toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Knowledge Purged", description: "Entry removed from neural database." });
            fetchKnowledge();
        }
    };

    const getUniversalBrain = () => knowledge.find(k => k.type === 'core');
    const getGMBrain = (gmId: string) => knowledge.find(k => k.type === 'brain' && k.gamemode_id === gmId);
    const getGMScript = (gmId: string) => knowledge.find(k => k.type === 'script' && k.gamemode_id === gmId);

    const loadContent = (type: 'core' | 'brain' | 'script', gmId?: string) => {
        let entry;
        if (type === 'core') entry = getUniversalBrain();
        else if (type === 'brain') entry = getGMBrain(gmId || selectedGamemode);
        else if (type === 'script') entry = getGMScript(gmId || selectedGamemode);
        
        setContent(entry ? entry.content : '');
        if (gmId) setSelectedGamemode(gmId);
    };

    return (
        <div className="min-h-screen bg-[#0c0916] text-white font-sans selection:bg-[#b638fc]/30 overflow-x-hidden">
            {/* Background FX */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />
                <div className="absolute top-[0%] left-[20%] w-[1000px] h-[1000px] bg-[#3b38fc]/5 rounded-full blur-[200px]" />
                <div className="absolute bottom-[0%] right-[10%] w-[800px] h-[800px] bg-[#e324ff]/5 rounded-full blur-[150px]" />
            </div>

            <div className="relative z-10 p-8 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-6 bg-[#161224]/80 backdrop-blur-3xl p-6 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate("/dashboard")}
                            className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4d4dff] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.4)]">
                                <Shield className="w-7 h-7 text-white drop-shadow-md" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] uppercase italic leading-none mb-1">Agentic Suit</h1>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Intelligence Management Hub</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Button
                            onClick={() => navigate("/agentik-flow")}
                            className="h-12 px-8 bg-white/5 backdrop-blur-2xl border border-white/10 text-white font-black rounded-full shadow-lg hover:bg-white/10 transition-all hover:scale-105 uppercase text-[11px] tracking-widest"
                        >
                            <LayoutDashboard className="w-4 h-4 mr-2" />
                            Open Whiteboard
                        </Button>
                    </div>
                </div>

                {/* Main Workspace */}
                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setContent(''); setSelectedGamemode(''); }} className="space-y-8">
                    <div className="bg-[#161224]/60 backdrop-blur-3xl p-2 rounded-2xl border border-white/5 w-fit">
                        <TabsList className="bg-transparent h-12 gap-2">
                            <TabsTrigger value="universal" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-xl px-6 font-bold tracking-tight text-xs uppercase">
                                <Brain className="w-4 h-4 mr-2" /> Universal Core
                            </TabsTrigger>
                            <TabsTrigger value="gamemode" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-xl px-6 font-bold tracking-tight text-xs uppercase">
                                <Binary className="w-4 h-4 mr-2" /> GM Intelligence
                            </TabsTrigger>
                            <TabsTrigger value="scripts" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-xl px-6 font-bold tracking-tight text-xs uppercase">
                                <ScrollText className="w-4 h-4 mr-2" /> Script Repository
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Universal Core Tab */}
                    <TabsContent value="universal" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="bg-[#161224]/80 backdrop-blur-3xl border-white/10 overflow-hidden rounded-[2.5rem] shadow-2xl">
                            <CardHeader className="p-10 pb-0">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-2xl font-black text-white italic tracking-tight uppercase flex items-center gap-3">
                                            <Sparkles className="w-6 h-6 text-indigo-400" />
                                            Universal Brain Core
                                        </CardTitle>
                                        <CardDescription className="text-slate-500 font-medium mt-2">
                                            Define the foundational personality and logic shared by ALL agents in the network.
                                        </CardDescription>
                                    </div>
                                    <Button onClick={() => loadContent('core')} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 gap-2">
                                        <History className="w-4 h-4" /> Reload Existing
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-10 flex flex-col lg:flex-row gap-8">
                                <div className="flex-1 space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-[#b638fc]">brain.md source</label>
                                    </div>
                                    <Textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="# Core Directives..."
                                        className="min-h-[500px] bg-black/40 border-white/5 rounded-3xl p-6 text-slate-300 font-mono text-sm focus-visible:ring-[#b638fc] focus-visible:border-transparent transition-all"
                                    />
                                    <Button 
                                        onClick={() => handleSave('core')} 
                                        disabled={isSaving}
                                        className="w-full h-14 bg-gradient-to-r from-[#3b38fc] to-[#b638fc] text-white font-black rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest"
                                    >
                                        <Save className="w-5 h-5 mr-3" /> {isSaving ? 'Synchronizing...' : 'Save Universal Core'}
                                    </Button>
                                </div>
                                <div className="flex-1 flex flex-col">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-1">Live Neural Preview</label>
                                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-8 prose prose-invert max-w-none prose-p:text-slate-400 prose-headings:text-white prose-headings:font-black prose-p:text-sm prose-li:text-sm">
                                        <ReactMarkdown>{content || '*No content available for preview.*'}</ReactMarkdown>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* GM Intelligence Tab */}
                    <TabsContent value="gamemode" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="bg-[#161224]/80 backdrop-blur-3xl border-white/10 overflow-hidden rounded-[2.5rem] shadow-2xl">
                            <CardHeader className="p-10 pb-0">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                    <div>
                                        <CardTitle className="text-2xl font-black text-white italic tracking-tight uppercase flex items-center gap-3">
                                            <Binary className="w-6 h-6 text-emerald-400" />
                                            Gamemode Intelligence Pathing
                                        </CardTitle>
                                        <CardDescription className="text-slate-500 font-medium mt-2">
                                            Specialized knowledge clusters for specific Minecraft gamemodes.
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <Select value={selectedGamemode} onValueChange={(val) => loadContent('brain', val)}>
                                            <SelectTrigger className="w-full md:w-[240px] h-12 bg-white/5 border-white/10 rounded-xl font-bold uppercase text-[10px] tracking-widest">
                                                <SelectValue placeholder="Select Gamemode" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#161224] border-white/10">
                                                {gamemodes.map(gm => (
                                                    <SelectItem key={gm.id} value={gm.id} className="text-white focus:bg-[#b638fc] focus:text-white">{gm.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button className="h-12 w-12 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10">
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-10 flex flex-col lg:flex-row gap-8">
                                {selectedGamemode ? (
                                    <>
                                        <div className="flex-1 space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                                    {gamemodes.find(g => g.id === selectedGamemode)?.name.toLowerCase()}brain.md
                                                </label>
                                            </div>
                                            <Textarea
                                                value={content}
                                                onChange={(e) => setContent(e.target.value)}
                                                placeholder={`# Specialized directives for ${gamemodes.find(g => g.id === selectedGamemode)?.name}...`}
                                                className="min-h-[500px] bg-black/40 border-white/5 rounded-3xl p-6 text-slate-300 font-mono text-sm"
                                            />
                                            <Button 
                                                onClick={() => handleSave('brain')} 
                                                disabled={isSaving}
                                                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black rounded-2xl shadow-xl hover:scale-[1.02] transition-all text-sm uppercase tracking-widest"
                                            >
                                                <Save className="w-5 h-5 mr-3" /> {isSaving ? 'Syncing...' : 'Save GM Brain'}
                                            </Button>
                                        </div>
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex justify-between items-center mb-4 px-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Intelligence Preview</label>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-600 hover:text-red-400" onClick={() => deleteKnowledge(getGMBrain(selectedGamemode)?.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                            <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-8 prose prose-invert max-w-none prose-p:text-slate-400">
                                                <ReactMarkdown>{content || '*Select a gamemode or type content...*'}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                                        <Zap className="w-16 h-16 mb-4" />
                                        <h3 className="text-xl font-black uppercase tracking-tighter italic">Select a Neural Node</h3>
                                        <p className="text-sm font-medium">Choose a gamemode to start building specialized intelligence.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Script Repository Tab */}
                    <TabsContent value="scripts" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="bg-[#161224]/80 backdrop-blur-3xl border-white/10 overflow-hidden rounded-[2.5rem] shadow-2xl">
                            <CardHeader className="p-10 pb-0">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                    <div>
                                        <CardTitle className="text-2xl font-black text-white italic tracking-tight uppercase flex items-center gap-3">
                                            <ScrollText className="w-6 h-6 text-amber-400" />
                                            Script Intelligence Repository
                                        </CardTitle>
                                        <CardDescription className="text-slate-500 font-medium mt-2">
                                            Reference scripts for the AI to emulate during content generation tasks.
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <Select value={selectedGamemode} onValueChange={(val) => loadContent('script', val)}>
                                            <SelectTrigger className="w-full md:w-[240px] h-12 bg-white/5 border-white/10 rounded-xl font-bold uppercase text-[10px] tracking-widest">
                                                <SelectValue placeholder="Select Gamemode" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#161224] border-white/10">
                                                {gamemodes.map(gm => (
                                                    <SelectItem key={gm.id} value={gm.id} className="text-white focus:bg-amber-500 focus:text-white">{gm.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-10 flex flex-col lg:flex-row gap-8">
                                {selectedGamemode ? (
                                    <>
                                        <div className="flex-1 space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                                    scriptreferrence.md ({gamemodes.find(g => g.id === selectedGamemode)?.name.toLowerCase()})
                                                </label>
                                            </div>
                                            <Textarea
                                                value={content}
                                                onChange={(e) => setContent(e.target.value)}
                                                placeholder="# Reference Scripts..."
                                                className="min-h-[500px] bg-black/40 border-white/5 rounded-3xl p-6 text-slate-300 font-mono text-sm"
                                            />
                                            <Button 
                                                onClick={() => handleSave('script')} 
                                                disabled={isSaving}
                                                className="w-full h-14 bg-gradient-to-r from-amber-600 to-orange-500 text-white font-black rounded-2xl shadow-xl hover:scale-[1.02] transition-all text-sm uppercase tracking-widest"
                                            >
                                                <Save className="w-5 h-5 mr-3" /> {isSaving ? 'Syncing...' : 'Save Script Repository'}
                                            </Button>
                                        </div>
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex justify-between items-center mb-4 px-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Neural Preview</label>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-600 hover:text-red-400" onClick={() => deleteKnowledge(getGMScript(selectedGamemode)?.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                            <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-8 prose prose-invert max-w-none prose-p:text-slate-400">
                                                <ReactMarkdown>{content || '*Type example scripts here for the AI to learn...*'}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                                        <ScrollText className="w-16 h-16 mb-4" />
                                        <h3 className="text-xl font-black uppercase tracking-tighter italic">No Node Targeted</h3>
                                        <p className="text-sm font-medium">Select a gamemode to start feeding the AI reference material.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .prose pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 1rem; }
                .prose code { color: #fca5fc; background: rgba(182,56,252,0.1); padding: 0.2rem 0.4rem; border-radius: 0.4rem; }
            `}} />
        </div>
    );
};

export default AgenticSuit;
