import { useEffect, useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Mic, Play, Pause, Volume2, Sparkles, User, Database, Zap, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Voice {
    id: string;
    name: string;
    category: string;
    preview_url: string | null;
    elevenlabs_voice_id?: string | null;
}

const OPENAI_VOICES: Voice[] = [
    { id: 'alloy', name: 'Alloy', category: 'Neutral', preview_url: 'https://cdn.openai.com/API/docs/audio/alloy.wav' },
    { id: 'echo', name: 'Echo', category: 'Neutral', preview_url: 'https://cdn.openai.com/API/docs/audio/echo.wav' },
    { id: 'fable', name: 'Fable', category: 'Narrative', preview_url: 'https://cdn.openai.com/API/docs/audio/fable.wav' },
    { id: 'onyx', name: 'Onyx', category: 'Deep', preview_url: 'https://cdn.openai.com/API/docs/audio/onyx.wav' },
    { id: 'nova', name: 'Nova', category: 'Bright', preview_url: 'https://cdn.openai.com/API/docs/audio/nova.wav' },
    { id: 'shimmer', name: 'Shimmer', category: 'Deep', preview_url: 'https://cdn.openai.com/API/docs/audio/shimmer.wav' },
    { id: 'ash', name: 'Ash (HD)', category: 'Premium', preview_url: 'https://cdn.openai.com/API/docs/audio/ash.wav' },
    { id: 'ballad', name: 'Ballad (HD)', category: 'Premium', preview_url: 'https://cdn.openai.com/API/docs/audio/ballad.wav' },
    { id: 'coral', name: 'Coral (HD)', category: 'Premium', preview_url: 'https://cdn.openai.com/API/docs/audio/coral.wav' },
    { id: 'sage', name: 'Sage (HD)', category: 'Premium', preview_url: 'https://cdn.openai.com/API/docs/audio/sage.wav' },
    { id: 'verse', name: 'Verse (HD)', category: 'Premium', preview_url: 'https://cdn.openai.com/API/docs/audio/verse.wav' },
];

interface VoiceConfiguratorProps {
    selectedVoiceId: string | null;
    onVoiceChange: (voiceId: string | null) => void;
    onSave?: () => Promise<void>;
    isSaving?: boolean;
}

export function VoiceConfigurator({ selectedVoiceId, onVoiceChange, onSave, isSaving }: VoiceConfiguratorProps) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchVoices = async () => {
            try {
                const { data, error } = await supabase
                    .from('voices' as any)
                    .select('id, name, category, preview_url')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setVoices((data as any) || []);
            } catch (error) {
                console.error("Error fetching voices:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchVoices();
    }, []);

    const handlePlayPreview = (voice: Voice) => {
        if (!audioRef.current) return;

        if (playingId === voice.id) {
            audioRef.current.pause();
            setPlayingId(null);
        } else {
            if (voice.preview_url) {
                audioRef.current.src = voice.preview_url;
                audioRef.current.play();
                setPlayingId(voice.id);
            } else {
                toast({ description: "No preview available for this voice" });
            }
        }
    };

    const selectedVoice = OPENAI_VOICES.find(v => v.id === selectedVoiceId) || voices.find(v => v.id === selectedVoiceId);

    return (
        <div className="p-[1px] rounded-[32px] bg-gradient-to-br from-white/10 to-transparent group hover:from-[#b638fc]/40 transition-all duration-500">
            <div className="bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Mic className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Vocal Architecture</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">AI Voiceover Selection</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onSave && (
                            <Button 
                                size="sm" 
                                onClick={onSave}
                                disabled={isSaving || !selectedVoiceId}
                                className="h-8 bg-[#b638fc] hover:bg-[#b638fc]/80 text-white text-[10px] uppercase font-black tracking-widest px-4 rounded-lg shadow-[0_0_15px_rgba(182,56,252,0.3)] transition-all"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-3 h-3 mr-2" />
                                        Save Selection
                                    </>
                                )}
                            </Button>
                        )}
                        {selectedVoiceId && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => onVoiceChange(null)} 
                                className="h-8 text-[10px] uppercase font-black tracking-widest text-slate-500 hover:text-white"
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </div>

                <Tabs defaultValue="premium" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-white/[0.02] border border-white/5 h-12 p-1 rounded-xl mb-6">
                        <TabsTrigger value="premium" className="rounded-lg data-[state=active]:bg-[#b638fc] data-[state=active]:text-white font-bold text-[10px] uppercase tracking-widest gap-2">
                            <Sparkles className="w-3 h-3" />
                            Premium GPT
                        </TabsTrigger>
                        <TabsTrigger value="library" className="rounded-lg data-[state=active]:bg-[#b638fc] data-[state=active]:text-white font-bold text-[10px] uppercase tracking-widest gap-2">
                            <Database className="w-3 h-3" />
                            Library
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="premium" className="mt-0 outline-none">
                        <ScrollArea className="h-[280px] pr-4">
                            <div className="grid grid-cols-1 gap-2">
                                {OPENAI_VOICES.map((voice) => (
                                    <button
                                        key={voice.id}
                                        onClick={() => onVoiceChange(voice.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-xl border transition-all text-left group/btn",
                                            selectedVoiceId === voice.id
                                                ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(182,56,252,0.1)]"
                                                : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                                                selectedVoiceId === voice.id ? "bg-primary text-white" : "bg-white/5 text-slate-500 group-hover/btn:bg-white/10"
                                            )}>
                                                <Zap className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-white">{voice.name}</div>
                                                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">{voice.category}</div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePlayPreview(voice);
                                            }}
                                            className={cn(
                                                "w-8 h-8 rounded-lg",
                                                playingId === voice.id ? "text-primary bg-primary/10" : "text-slate-500 hover:text-white hover:bg-white/10"
                                            )}
                                        >
                                            {playingId === voice.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </Button>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="library" className="mt-0 outline-none">
                        <ScrollArea className="h-[280px] pr-4">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Scanning Repository...</span>
                                </div>
                            ) : voices.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500 italic text-xs">
                                    No artifacts found in library
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2">
                                    {voices.map((voice) => (
                                        <button
                                            key={voice.id}
                                            onClick={() => onVoiceChange(voice.id)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all text-left group/btn",
                                                selectedVoiceId === voice.id
                                                    ? "bg-primary/10 border-primary"
                                                    : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                                    selectedVoiceId === voice.id ? "bg-primary text-white" : "bg-white/5 text-slate-500"
                                                )}>
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white">{voice.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">{voice.category}</div>
                                                </div>
                                            </div>
                                            {voice.preview_url && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePlayPreview(voice);
                                                    }}
                                                    className={cn(
                                                        "w-8 h-8 rounded-lg",
                                                        playingId === voice.id ? "text-primary bg-primary/10" : "text-slate-500 hover:text-white hover:bg-white/10"
                                                    )}
                                                >
                                                    {playingId === voice.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                </Button>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>

                {selectedVoice && (
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Selected: {selectedVoice.name}</span>
                        </div>
                        <Volume2 className="w-4 h-4 text-slate-500" />
                    </div>
                )}
            </div>

            <audio
                ref={audioRef}
                onEnded={() => setPlayingId(null)}
                className="hidden"
            />
        </div>
    );
}
