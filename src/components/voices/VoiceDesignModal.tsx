import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, Play, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceDesignModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function VoiceDesignModal({ open, onOpenChange, onSuccess }: VoiceDesignModalProps) {
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Design params
    const [gender, setGender] = useState("male");
    const [age, setAge] = useState("middle_aged");
    const [accent, setAccent] = useState("american");
    const [accentStrength, setAccentStrength] = useState(50);
    const [previewText, setPreviewText] = useState("This is a preview of your custom voice design. Listen carefully to the tone, accent, and overall character of this voice to ensure it matches your creative vision.");

    // Save params
    const [voiceName, setVoiceName] = useState("");
    const [description, setDescription] = useState("");
    const [generatedVoiceId, setGeneratedVoiceId] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { toast } = useToast();

    const handleGeneratePreview = async () => {
        setLoading(true);
        setGeneratedVoiceId(null); // Reset prev ID
        try {
            // Ensure we have an active session before invoking
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error("You must be logged in to generate a preview.");
            }

            const { data, error } = await supabase.functions.invoke('generate-voice-sample', {
                body: {
                    gender,
                    age,
                    accent,
                    accent_strength: accentStrength / 50,
                    text: previewText,
                    description: description,
                }
            });

            if (error) {
                console.error("Preview generation error:", error);
                throw new Error(error.message || "Failed to generate preview");
            }

            if (!data.voiceId || !data.audioBase64) {
                throw new Error("Invalid response from server");
            }

            // Capture the generated voice ID
            setGeneratedVoiceId(data.voiceId);

            // Decode base64 audio
            const binaryString = atob(data.audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(audioBlob);
            setPreviewUrl(url);


            toast({
                title: "Preview Ready",
                description: "Click the play or download button to listen to your voice preview.",
            });

        } catch (error: any) {
            // ... error handling ...
            toast({ variant: "destructive", title: "Preview Failed", description: error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveVoice = async () => {
        if (!voiceName) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please enter a voice name" });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.functions.invoke('save-voice-design', {
                body: {
                    name: voiceName,
                    description,
                    gender,
                    age,
                    accent,
                    accent_strength: accentStrength / 50,
                    preview_text: previewText,
                    generated_voice_id: generatedVoiceId, // Pass the ID from preview
                }
            });

            if (error) throw error;

            toast({
                title: "Voice Saved",
                description: "Your custom voice has been created successfully.",
            });

            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Save Failed",
                description: error.message,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Design a Unique Voice</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Gender</Label>
                            <Select value={gender} onValueChange={setGender}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Age</Label>
                            <Select value={age} onValueChange={setAge}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="young">Young</SelectItem>
                                    <SelectItem value="middle_aged">Middle Aged</SelectItem>
                                    <SelectItem value="old">Old</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Accent</Label>
                        <Select value={accent} onValueChange={setAccent}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="american">American</SelectItem>
                                <SelectItem value="british">British</SelectItem>
                                <SelectItem value="australian">Australian</SelectItem>
                                <SelectItem value="indian">Indian</SelectItem>
                                <SelectItem value="african">African</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label>Accent Strength ({accentStrength}%)</Label>
                        </div>
                        <Slider
                            value={[accentStrength]}
                            onValueChange={(vals) => setAccentStrength(vals[0])}
                            max={100}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Voice Description (Prompt)</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the voice you want to create, e.g., 'A deep, authoritative voice with a slight rasp, perfect for narrating documentaries'"
                            className="h-24"
                        />
                        <p className="text-xs text-muted-foreground">
                            Describe the characteristics, tone, and style of the voice you want to generate.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Preview Text</Label>
                        <Textarea
                            value={previewText}
                            onChange={(e) => setPreviewText(e.target.value)}
                            className="h-20"
                        />
                    </div>

                    {/* Audio Player and Generate Button */}
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleGeneratePreview}
                            disabled={loading}
                            className="w-full"
                            variant="secondary"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Generate Preview
                        </Button>

                        {previewUrl && (
                            <>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => {
                                        if (audioRef.current) {
                                            audioRef.current.currentTime = 0;
                                            audioRef.current.play();
                                            setPlaying(true);
                                        }
                                    }}
                                    title="Play preview"
                                >
                                    <Play className={`h-4 w-4 ${playing ? "text-primary" : ""}`} />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = previewUrl;
                                        a.download = 'voice-preview.mp3';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        toast({
                                            title: "Downloaded",
                                            description: "Check your downloads folder for voice-preview.mp3",
                                        });
                                    }}
                                    title="Download preview"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                </Button>
                            </>
                        )}
                        <audio
                            ref={audioRef}
                            onEnded={() => setPlaying(false)}
                            className="hidden"
                        />
                    </div>

                    {previewUrl && (
                        <div className="pt-4 border-t space-y-4">
                            <div className="space-y-2">
                                <Label>Voice Name</Label>
                                <Input
                                    placeholder="e.g. British Narrator"
                                    value={voiceName}
                                    onChange={(e) => setVoiceName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input
                                    placeholder="Short description..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSaveVoice} disabled={loading || !previewUrl || !voiceName}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Voice
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
