import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Trash2, Save, Loader2, Sparkles, ImageIcon, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface BeginningEffectSettings {
    enabled: boolean;
    image_url: string | null;
    sfx_id: string | null;
    opacity?: number;
}

export const defaultBeginningEffectSettings: BeginningEffectSettings = {
    enabled: false,
    image_url: null,
    sfx_id: null,
    opacity: 0.6,
};

interface SfxItem {
    id: string;
    name: string;
    file_url: string;
}

interface BeginningEffectConfiguratorProps {
    settings: BeginningEffectSettings;
    onSettingsChange: (settings: BeginningEffectSettings) => void;
    projectId: string;
    onSave?: () => Promise<void>;
    isSaving?: boolean;
}

export const BeginningEffectConfigurator: React.FC<BeginningEffectConfiguratorProps> = ({
    settings,
    onSettingsChange,
    projectId,
    onSave,
    isSaving = false,
}) => {
    const [uploading, setUploading] = useState(false);
    const [sfxList, setSfxList] = useState<SfxItem[]>([]);
    const [playingSfxId, setPlayingSfxId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchSfx = async () => {
            const { data, error } = await supabase
                .from("sfx_library")
                .select("id, name, file_url")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching SFX:", error);
                return;
            }
            setSfxList(data || []);
        };

        fetchSfx();
    }, []);

    const updateSetting = useCallback(<K extends keyof BeginningEffectSettings>(
        key: K,
        value: BeginningEffectSettings[K]
    ) => {
        onSettingsChange({ ...settings, [key]: value });
    }, [settings, onSettingsChange]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            toast.error("Please upload an image file");
            return;
        }

        setUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const fileName = `${user.id}/${projectId}_beginning_effect.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("exports")
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("exports")
                .getPublicUrl(fileName);

            const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
            updateSetting("image_url", urlWithCacheBuster);
            toast.success("Image uploaded!");
        } catch (error: any) {
            console.error("Upload error:", error);
            toast.error(error.message || "Failed to upload image");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handlePlaySfx = async (sfx: SfxItem) => {
        if (playingSfxId === sfx.id) {
            audioRef.current?.pause();
            setPlayingSfxId(null);
            return;
        }

        try {
            // Get signed URL
            const { data, error } = await supabase.storage
                .from("voiceovers")
                .createSignedUrl(sfx.file_url, 60);

            if (error) throw error;

            if (data?.signedUrl) {
                if (audioRef.current) {
                    audioRef.current.pause();
                }
                audioRef.current = new Audio(data.signedUrl);
                audioRef.current.onended = () => setPlayingSfxId(null);
                audioRef.current.play().catch(err => console.warn("[Preview] Audio play failed:", err));
                setPlayingSfxId(sfx.id);
            }
        } catch (error) {
            console.error("Play error:", error);
            toast.error("Failed to play SFX: File missing or access denied.");
        }
    };

    return (
        <Card className="rgb-border-card overflow-hidden group hover:shadow-lg hover:shadow-accent/10 transition-all duration-500">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <div className="relative p-2 rounded-lg bg-accent/10">
                            <Sparkles className="w-5 h-5 text-accent relative z-10" />
                            <div className="absolute inset-0 bg-accent/30 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                        <span>Beginning Effect</span>
                    </CardTitle>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground">
                            {settings.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <Switch
                            checked={settings.enabled}
                            onCheckedChange={(checked) => updateSetting("enabled", checked)}
                        />
                    </div>
                </div>
            </CardHeader>

            {settings.enabled && (
                <CardContent className="space-y-6">
                    {/* Image Upload */}
                    <div className="space-y-3">
                        <Label className="font-medium">Overlay Image</Label>
                        <div className="flex gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                            <Button
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="flex-1"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploading ? "Uploading..." : "Import PNG Image"}
                            </Button>
                            {settings.image_url && (
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => updateSetting("image_url", null)}
                                    className="border-destructive/50 hover:bg-destructive/10"
                                >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                            )}
                        </div>
                        {settings.image_url && (
                            <>
                                <div className="relative rounded-lg overflow-hidden border border-border mt-2 aspect-video bg-muted/30 flex items-center justify-center">
                                    <img
                                        src={settings.image_url}
                                        alt="Overlay Preview"
                                        className="max-h-full max-w-full object-contain"
                                    />
                                </div>
                                <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Peak Opacity</Label>
                                        <span className="text-[10px] font-black text-accent">{Math.round((settings.opacity || 0.6) * 100)}%</span>
                                    </div>
                                    <Slider 
                                        value={[(settings.opacity || 0.6) * 100]} 
                                        max={100} 
                                        step={1} 
                                        onValueChange={([v]) => updateSetting("opacity", v / 100)}
                                    />
                                    <p className="text-[9px] text-white/20 italic">Controls the maximum transparency during the 1-second opening flash.</p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* SFX Selection */}
                    <div className="space-y-3">
                        <Label className="font-medium">Sound Effect (Optional)</Label>
                        <Select
                            value={settings.sfx_id || "none"}
                            onValueChange={(val) => updateSetting("sfx_id", val === "none" ? null : val)}
                        >
                            <SelectTrigger className="bg-muted/30">
                                <SelectValue placeholder="Select SFX..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {sfxList.map((sfx) => (
                                    <SelectItem key={sfx.id} value={sfx.id}>
                                        {sfx.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {settings.sfx_id && (
                            <div className="flex items-center gap-2 mt-2">
                                {sfxList.find(s => s.id === settings.sfx_id) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const sfx = sfxList.find(s => s.id === settings.sfx_id);
                                            if (sfx) handlePlaySfx(sfx);
                                        }}
                                    >
                                        {playingSfxId === settings.sfx_id ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                        Preview Sound
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Save Button */}
                    {onSave && (
                        <Button
                            onClick={onSave}
                            disabled={isSaving}
                            className="w-full mt-4"
                            variant="secondary"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Settings
                                </>
                            )}
                        </Button>
                    )}
                </CardContent>
            )}
        </Card>
    );
};
