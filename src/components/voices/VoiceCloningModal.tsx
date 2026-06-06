import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Play, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceCloningModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function VoiceCloningModal({ open, onOpenChange, onSuccess }: VoiceCloningModalProps) {
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [voiceName, setVoiceName] = useState("");
    const [description, setDescription] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            // Basic validation
            if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
                toast({ variant: "destructive", title: "File too large", description: "Please upload a file smaller than 10MB" });
                return;
            }

            const objectUrl = URL.createObjectURL(selectedFile);
            setPreviewUrl(objectUrl);
            setFile(selectedFile);
        }
    };

    const handleCloneVoice = async () => {
        if (!file || !voiceName) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please provide a name and audio file" });
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // 1. Upload file to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/clones/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('voiceovers')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // 2. Get Public/Signed URL
            // Since 'voiceovers' bucket is private, we need a signed URL for ElevenLabs to download it
            // The Edge Function will download it using this URL
            const { data: signedData, error: signError } = await supabase.storage
                .from('voiceovers')
                .createSignedUrl(fileName, 300); // 5 minutes valid

            if (signError || !signedData) throw signError || new Error("Failed to sign URL");

            const fileUrl = signedData.signedUrl;

            // 3. Call Clone Function
            const { error: cloneError } = await supabase.functions.invoke('clone-voice', {
                body: {
                    name: voiceName,
                    description: description || "Instant Voice Clone",
                    file_url: fileUrl,
                }
            });

            if (cloneError) throw cloneError;

            toast({
                title: "Voice Cloned",
                description: "Your voice clone is ready to use.",
            });

            onSuccess();
            onOpenChange(false);

        } catch (error: any) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "Cloning Failed",
                description: error.message || "Could not clone voice",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Clone a Voice</DialogTitle>
                    <DialogDescription>
                        Upload a clear audio sample (1-5 minutes recommended) of the voice you want to clone. Background noise should be minimal.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Voice Name</Label>
                        <Input
                            placeholder="e.g. My Narrator"
                            value={voiceName}
                            onChange={(e) => setVoiceName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Input
                            placeholder="Short description..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Audio Sample</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="file"
                                accept="audio/*"
                                onChange={handleFileChange}
                                className="cursor-pointer"
                            />
                        </div>
                        {previewUrl && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-secondary/20 rounded-md">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                        if (audioRef.current) {
                                            if (playing) {
                                                audioRef.current.pause();
                                                setPlaying(false);
                                            } else {
                                                audioRef.current.play();
                                                setPlaying(true);
                                            }
                                        }
                                    }}
                                >
                                    <Play className={`h-4 w-4 ${playing ? "text-primary" : ""}`} />
                                </Button>
                                <span className="text-sm truncate max-w-[200px]">{file?.name}</span>
                                <audio
                                    ref={audioRef}
                                    src={previewUrl}
                                    onEnded={() => setPlaying(false)}
                                    className="hidden"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleCloneVoice} disabled={loading || !file || !voiceName}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Clone Voice
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
