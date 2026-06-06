import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Mic, Wand2, Play, Trash2, Volume2, ArrowLeft, Zap, Sparkles, Pause } from "lucide-react";
import { VoiceDesignModal } from "@/components/voices/VoiceDesignModal";
import { VoiceCloningModal } from "@/components/voices/VoiceCloningModal";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Voice {
    id: string;
    name: string;
    category: 'generated' | 'cloned' | 'premade';
    description: string;
    preview_url: string | null;
    elevenlabs_voice_id: string;
}

const VoiceLibrary = () => {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loading, setLoading] = useState(true);
    const [designOpen, setDesignOpen] = useState(false);
    const [cloneOpen, setCloneOpen] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { toast } = useToast();
    const navigate = useNavigate();

    const fetchVoices = async () => {
        setLoading(true);
        const { data, error } = await (supabase.from('voices') as any)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to load voices" });
        } else {
            setVoices(data as any as Voice[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchVoices();
    }, []);

    const handleDelete = async (id: string, elevenlabsId: string) => {
        const confirm = window.confirm("Are you sure you want to delete this voice?");
        if (!confirm) return;

        const { error } = await (supabase.from('voices') as any)
            .delete()
            .eq('id', id);

        if (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to delete voice" });
        } else {
            toast({ title: "Success", description: "Voice deleted" });
            setVoices(voices.filter(v => v.id !== id));
        }
    };

    const playPreview = (voice: Voice) => {
        if (!audioRef.current) return;

        if (playingId === voice.id) {
            audioRef.current.pause();
            setPlayingId(null);
            return;
        }

        if (voice.preview_url) {
            audioRef.current.src = voice.preview_url;
            audioRef.current.play();
            setPlayingId(voice.id);
        } else {
            toast({ description: "No preview available for this voice" });
        }
    };

    return (
        <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-x-hidden relative font-sans">

            {/* 🌑 Deep Neural Background with Smooth Degrade */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[#08060d]" />
                {/* Subtle Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
                {/* Animated Glows */}
                <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#3b38fc]/10 rounded-full blur-[150px] animate-pulse-glow" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#e324ff]/10 rounded-full blur-[150px] animate-pulse-glow" style={{ animationDuration: '12s' }} />

                {/* Liquid Surface Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(182,56,252,0.05),transparent_50%)]" />
            </div>

            <div className="container max-w-7xl mx-auto py-12 px-6 relative z-10">

                {/* HEADER SECTION */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-20 animate-in fade-in slide-in-from-top-8 duration-1000 px-4">
                    <div className="flex items-center gap-6">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate("/dashboard")}
                            className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center shrink-0"
                        >
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white leading-none mb-2">
                                Voice Matrix
                            </h1>
                            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em] opacity-60">
                                Neural Synthesis Repository v4.0
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Design Button (Primary Landing Style) */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-40 group-hover:opacity-100 transition duration-500 scale-90 group-hover:scale-100" />
                            <Button
                                onClick={() => setDesignOpen(true)}
                                className="relative h-11 px-6 bg-primary text-white font-bold rounded-xl shadow-lg border-none transition-all hover:opacity-90 active:scale-95 text-sm"
                            >
                                <Wand2 className="w-4 h-4 mr-2" />
                                Design Voice
                            </Button>
                        </div>

                        {/* Clone Button (Secondary Landing Style) */}
                        <Button
                            onClick={() => setCloneOpen(true)}
                            variant="outline"
                            className="h-12 px-8 bg-[#161224]/50 backdrop-blur-xl border border-white/30 text-white hover:bg-white/10 font-bold rounded-full shadow-lg transition-all hover:scale-105 text-[13px] tracking-wide uppercase"
                        >
                            <Mic className="w-4 h-4 mr-2" />
                            Clone Voice
                        </Button>
                    </div>
                </header>

                <div className="px-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-30">
                            <Loader2 className="w-12 h-12 animate-spin" />
                            <p className="text-sm font-medium text-slate-500">Synchronizing database...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {voices.length === 0 ? (
                                <div className="col-span-full py-24 bg-[#161224]/40 backdrop-blur-3xl rounded-[40px] border border-dashed border-white/5 flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-20 rounded-[32px] bg-white/[0.03] border border-white/10 flex items-center justify-center mb-8">
                                        <Volume2 className="w-10 h-10 text-white/20" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white tracking-tight mb-2">No Voice Profiles Found</h3>
                                    <p className="text-slate-500 max-w-xs mx-auto mb-10 text-sm font-medium">Initialize your laboratory by designing a new voice or cloning an existing frequency.</p>
                                    <div className="flex justify-center gap-4">
                                        <Button onClick={() => setDesignOpen(true)} variant="outline" className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10">Design Identity</Button>
                                        <Button onClick={() => setCloneOpen(true)} variant="outline" className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10">Clone Frequency</Button>
                                    </div>
                                </div>
                            ) : (
                                voices.map(voice => (
                                    <div key={voice.id} className="group relative p-1 rounded-[40px] bg-gradient-to-br from-white/10 to-transparent hover:from-white/20 transition-all duration-700">
                                        <Card className="bg-[#1a1628]/60 backdrop-blur-3xl border border-white/10 rounded-[39px] overflow-hidden shadow-2xl h-full flex flex-col transition-transform duration-500 group-hover:-translate-y-2 relative">
                                            {/* Liquid Glass Highlight */}
                                            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent pointer-events-none" />

                                            <CardHeader className="p-8 pb-4 relative z-10">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-4">
                                                        {/* Landing Style Icon Vessel */}
                                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] flex items-center justify-center shadow-[0_8px_20px_rgba(182,56,252,0.3)]">
                                                            <Mic className="w-6 h-6 text-white" />
                                                        </div>
                                                        <CardTitle className="text-xl font-black text-white tracking-tighter">{voice.name}</CardTitle>
                                                    </div>
                                                    <Badge className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                                                        voice.category === 'cloned' ? "bg-cyan-500/20 text-cyan-400" : "bg-emerald-500/20 text-emerald-400"
                                                    )}>
                                                        {voice.category}
                                                    </Badge>
                                                </div>
                                                <CardDescription className="text-white/40 text-sm font-medium leading-relaxed line-clamp-2 h-10">
                                                    {voice.description || "Experimental neural synthesis unit optimized for narrative delivery."}
                                                </CardDescription>
                                            </CardHeader>

                                            <div className="mt-auto p-8 pt-4 flex items-center justify-between border-t border-white/5 bg-white/[0.01] relative z-10">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => playPreview(voice)}
                                                    disabled={!voice.preview_url}
                                                    className={cn(
                                                        "rounded-2xl px-6 h-12 bg-white/5 border border-white/10 hover:bg-white text-white hover:text-black transition-all font-black text-[10px] uppercase tracking-widest",
                                                        playingId === voice.id && "bg-white text-black scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)] border-transparent"
                                                    )}
                                                >
                                                    {playingId === voice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Play className="w-3.5 h-3.5 mr-2 fill-current" />}
                                                    Preview Unit
                                                </Button>

                                                <button
                                                    onClick={() => handleDelete(voice.id, voice.elevenlabs_voice_id)}
                                                    className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </Card>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                <audio
                    ref={audioRef}
                    onEnded={() => setPlayingId(null)}
                    className="hidden"
                />

                <VoiceDesignModal
                    open={designOpen}
                    onOpenChange={setDesignOpen}
                    onSuccess={fetchVoices}
                />

                <VoiceCloningModal
                    open={cloneOpen}
                    onOpenChange={setCloneOpen}
                    onSuccess={fetchVoices}
                />
            </div>
        </div>
    );
};

export default VoiceLibrary;
