import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Sparkles, Send, Save, Plus, Key, FileText, Bot, X } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { callGrok } from '@/lib/ai-brain';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface SkillEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSkillCreated: () => void;
}

export const SkillEditorModal = ({ isOpen, onClose, onSkillCreated }: SkillEditorProps) => {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hello! I am your Skill Architect powered by Grok. Tell me about the skill you want to build, and I'll help you draft the perfect prompt and structure for it." }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const { toast } = useToast();

    // Form State
    const [skillName, setSkillName] = useState('');
    const [skillDescription, setSkillDescription] = useState('');
    const [skillPrompt, setSkillPrompt] = useState('');
    const [skillContext, setSkillContext] = useState('');
    const [skillApiKey, setSkillApiKey] = useState('');

    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleChat = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const apiMessages = [...messages, userMsg];
            const dataText = await callGrok(
                apiMessages,
                "You are the Agentik Skill Architect. Your job is to help the user design a high-performance system skill. A skill consists of a name, a description, and a CORE PROMPT that the agent will use. When the user says they want a skill, you must ask what it should do, and then draft an optimized and robust prompt for it. If you generate a prompt, wrap it in a markdown block.",
                skillApiKey
            );

            setMessages(prev => [...prev, { role: 'assistant', content: dataText }]);
        } catch (err: any) {
            toast({ title: "Grok Error", description: err.message, variant: "destructive" });
        } finally {
            setIsTyping(false);
        }
    };

    const handleSaveSkill = async () => {
        if (!skillName || !skillPrompt) {
            toast({ title: "Validation Error", description: "Name and Prompt are required.", variant: "destructive" });
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await (supabase as any).from('agentik_skills').insert({
            name: skillName,
            description: skillDescription,
            prompt: skillPrompt,
            context: skillContext ? { info: skillContext } : null,
            api_key: skillApiKey,
            user_id: user.id
        });

        if (error) {
            toast({ title: "Save Failed", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Skill Created", description: `"${skillName}" is now available to your agents.` });
            setSkillName('');
            setSkillDescription('');
            setSkillPrompt('');
            setSkillContext('');
            setSkillApiKey('');
            onSkillCreated();
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] p-0 flex flex-col bg-[#0a0f1a]/95 backdrop-blur-2xl border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] rounded-3xl text-white overflow-hidden">
                <DialogHeader className="p-8 border-b border-white/5 bg-transparent shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                <Brain className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div className="text-left">
                                <DialogTitle className="text-2xl font-black tracking-tight text-white mb-1">Neural Skill Architect</DialogTitle>
                                <DialogDescription className="text-indigo-400/80 font-bold uppercase text-[10px] tracking-[0.2em] flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" />
                                    Powered by Grok 4.1 Reasoning
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Chat Side */}
                    <div className="w-1/2 border-r border-white/5 flex flex-col bg-transparent relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
                        <div className="p-5 border-b border-white/5 bg-white/[0.02]">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400/80">Architect Chat</span>
                        </div>
                        <ScrollArea className="flex-1 px-8 relative z-10">
                            <div className="py-8 space-y-6 pb-20">
                                {messages.map((msg, i) => (
                                    <div key={i} className={cn(
                                        "flex flex-col max-w-[85%]",
                                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                                    )}>
                                        <div className={cn(
                                            "px-5 py-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap",
                                            msg.role === 'user'
                                                ? "bg-indigo-600/90 text-white rounded-tr-sm shadow-indigo-500/20 backdrop-blur-md"
                                                : "bg-[#13131a]/80 text-slate-200 rounded-tl-sm border border-white/5 backdrop-blur-md"
                                        )}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="flex gap-1.5 p-3 px-5 bg-[#13131a]/80 border border-white/5 rounded-2xl w-fit animate-pulse rounded-tl-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-300/20" />
                                    </div>
                                )}
                                <div ref={chatEndRef} className="h-px" />
                            </div>
                        </ScrollArea>
                        <div className="p-6 border-t border-white/5 bg-[#0a0f1a]/80 backdrop-blur-xl relative z-20 shrink-0">
                            <div className="relative group">
                                <Input
                                    placeholder="Ask for advice or describe a skill..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                                    className="bg-white/5 border-white/10 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-14 pr-14 pl-5 text-white placeholder:text-muted-foreground/50 rounded-2xl transition-all hover:bg-white/10"
                                />
                                <Button onClick={handleChat} size="icon" className="absolute right-2 top-2 h-10 w-10 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20 transition-all">
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Form Side */}
                    <div className="w-1/2 flex flex-col p-8 overflow-y-auto space-y-8 bg-black/20">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400/80 mb-6">Skill Configuration</h4>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Skill Name</label>
                                    <div className="relative group/input">
                                        <Input
                                            placeholder="e.g. Advanced Hook Generator"
                                            value={skillName}
                                            onChange={(e) => setSkillName(e.target.value)}
                                            className="bg-white/5 border-white/5 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-12 pl-12 rounded-xl transition-all hover:bg-white/10"
                                        />
                                        <div className="absolute left-3 top-3 w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-focus-within/input:text-indigo-300 group-focus-within/input:bg-indigo-500/20 transition-all">
                                            <Sparkles className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Short Description</label>
                                    <div className="relative group/input">
                                        <Input
                                            placeholder="Briefly describe what this skill enables..."
                                            value={skillDescription}
                                            onChange={(e) => setSkillDescription(e.target.value)}
                                            className="bg-white/5 border-white/5 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-12 pl-12 rounded-xl transition-all hover:bg-white/10"
                                        />
                                        <div className="absolute left-3 top-3 w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-focus-within/input:text-indigo-300 group-focus-within/input:bg-indigo-500/20 transition-all">
                                            <FileText className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">System Prompt</label>
                                    <Textarea
                                        placeholder="Paste the CORE prompt generated by the architect here..."
                                        value={skillPrompt}
                                        onChange={(e) => setSkillPrompt(e.target.value)}
                                        className="bg-white/5 border-white/5 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 min-h-[160px] font-mono text-[13px] leading-relaxed rounded-xl transition-all hover:bg-white/10 resize-none p-5"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Extra Context</label>
                                        <div className="relative group/input">
                                            <Input
                                                placeholder="Optional static data..."
                                                value={skillContext}
                                                onChange={(e) => setSkillContext(e.target.value)}
                                                className="bg-white/5 border-white/5 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-12 pl-12 rounded-xl transition-all hover:bg-white/10"
                                            />
                                            <div className="absolute left-3 top-3 w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-focus-within/input:text-indigo-300 group-focus-within/input:bg-indigo-500/20 transition-all">
                                                <Plus className="w-3.5 h-3.5" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Custom API Key</label>
                                        <div className="relative group/input">
                                            <Input
                                                placeholder="Overrides global key if set..."
                                                type="password"
                                                value={skillApiKey}
                                                onChange={(e) => setSkillApiKey(e.target.value)}
                                                className="bg-white/5 border-white/5 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 h-12 pl-12 rounded-xl transition-all hover:bg-white/10"
                                            />
                                            <div className="absolute left-3 top-3 w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-focus-within/input:text-indigo-300 group-focus-within/input:bg-indigo-500/20 transition-all">
                                                <Key className="w-3.5 h-3.5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1" />

                        <Button onClick={handleSaveSkill} className="w-full h-14 bg-indigo-500 hover:bg-indigo-400 hover:scale-[1.02] transform transition-all font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] rounded-2xl shrink-0 mt-8">
                            <Save className="w-5 h-5 mr-3" />
                            Crystalize New Skill
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
