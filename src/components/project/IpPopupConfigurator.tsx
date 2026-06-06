import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, Save, Loader2, Play, Pause, Monitor, Smartphone, Volume2, Move, Layers, Type, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// --- Types ---

export interface IpPopupTextSettings {
    content: string;
    x: number; // Percent 0-100
    y: number; // Percent 0-100
    font_family: string;
    font_size: number; // vmin equivalent
    color: string;
    stroke_enabled: boolean;
    stroke_color: string;
    stroke_width: number;
    shadow_enabled: boolean;
    shadow_opacity: number;
    shadow_blur: number;
    glow_enabled: boolean;
    glow_color: string;
    glow_size: number;
    glow_intensity: number;
}

export interface IpPopupImageSettings {
    enabled: boolean;
    url: string | null;
    x: number; // Percent
    y: number; // Percent
    scale: number; // 0.1 to 2.0
    opacity: number; // 0.0 to 1.0
    z_index: number; // 1 or 2
}

export interface IpPopupSettings {
    enabled: boolean;
    start_time: number;
    duration: number;
    sfx_id: string | null;
    text: IpPopupTextSettings;
    image1: IpPopupImageSettings;
    image2: IpPopupImageSettings;
}

export const defaultIpPopupSettings: IpPopupSettings = {
    enabled: false,
    start_time: 5,
    duration: 5,
    sfx_id: null,
    text: {
        content: "play.myserver.net",
        x: 50,
        y: 50,
        font_family: "Bungee",
        font_size: 6,
        color: "#ffffff",
        stroke_enabled: true,
        stroke_color: "#000000",
        stroke_width: 2,
        shadow_enabled: true,
        shadow_opacity: 0.8,
        shadow_blur: 10,
        glow_enabled: false,
        glow_color: "#ff0000",
        glow_size: 10,
        glow_intensity: 50
    },
    image1: {
        enabled: false,
        url: null,
        x: 50,
        y: 30,
        scale: 1.0,
        opacity: 1.0,
        z_index: 1
    },
    image2: {
        enabled: false,
        url: null,
        x: 50,
        y: 70,
        scale: 1.0,
        opacity: 1.0,
        z_index: 2
    }
};

interface SfxItem {
    id: string;
    name: string;
    file_url: string;
}

// --- Component ---

interface IpPopupConfiguratorProps {
    settings: IpPopupSettings;
    onSettingsChange: (settings: IpPopupSettings) => void;
    projectId: string;
    onSave?: () => Promise<void>;
    isSaving?: boolean;
    videos?: any[];
}

export const IpPopupConfigurator: React.FC<IpPopupConfiguratorProps> = ({
    settings,
    onSettingsChange,
    projectId,
    onSave,
    isSaving = false,
    videos = [],
}) => {
    const [activeTab, setActiveTab] = useState("text");
    const [sfxList, setSfxList] = useState<SfxItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const [dragTarget, setDragTarget] = useState<'text' | 'image1' | 'image2' | null>(null);

    // Fetch SFX
    useEffect(() => {
        const fetchSfx = async () => {
            const { data } = await supabase.from("sfx_library").select("*").order("name");
            if (data) setSfxList(data);
        };
        fetchSfx();
    }, []);

    // Helper to update specific sub-settings
    const updateText = (updates: Partial<IpPopupTextSettings>) => {
        onSettingsChange({ ...settings, text: { ...settings.text, ...updates } });
    };

    const updateImage = (key: 'image1' | 'image2', updates: Partial<IpPopupImageSettings>) => {
        onSettingsChange({ ...settings, [key]: { ...settings[key], ...updates } });
    };

    const handleUpload = async (key: 'image1' | 'image2', file: File) => {
        setUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const fileName = `${user.id}/${projectId}_popup_${key}.${ext}`;
            const { error } = await supabase.storage.from("exports").upload(fileName, file, { upsert: true });
            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from("exports").getPublicUrl(fileName);
            updateImage(key, { url: `${publicUrl}?t=${Date.now()}`, enabled: true });
            toast.success("Image uploaded!");
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setUploading(false);
        }
    };

    // Play Preview Animation
    const playPreview = async () => {
        setIsPlaying(true);
        // Play SFX if selected
        if (settings.sfx_id) {
            const sfx = sfxList.find(s => s.id === settings.sfx_id);
            if (sfx) {
                // Determine URL (signed or public?) - Voiceovers bucket is private usually?
                try {
                    const { data, error } = await supabase.storage.from("voiceovers").createSignedUrl(sfx.file_url, 60);
                    if (error) throw error;
                    if (data?.signedUrl) {
                        const a = new Audio(data.signedUrl);
                        a.play().catch(err => console.warn("[Preview] Audio play failed:", err));
                    }
                } catch (err) {
                    console.error("[Preview] SFX Signing failed:", err);
                    toast.error("Could not play SFX: File missing or access denied.");
                }
            }
        }

        // Stop after duration
        setTimeout(() => setIsPlaying(false), settings.duration * 1000);
    };

    // Drag Logic
    const handleDragStart = (target: 'text' | 'image1' | 'image2', e: React.MouseEvent) => {
        e.preventDefault();
        setDragTarget(target);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragTarget || !previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

        if (dragTarget === 'text') updateText({ x, y });
        else updateImage(dragTarget, { x, y });
    }, [dragTarget, settings]);

    const handleMouseUp = useCallback(() => {
        setDragTarget(null);
    }, []);

    useEffect(() => {
        if (dragTarget) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragTarget, handleMouseMove, handleMouseUp]);

    const renderDraggableImage = (key: 'image1' | 'image2', img: IpPopupImageSettings) => (
        <div
            className={cn(
                "absolute cursor-move group hover:outline hover:outline-dashed hover:outline-accent transition-transform duration-75",
                dragTarget === key && "outline outline-accent"
            )}
            style={{
                left: `${img.x}%`,
                top: `${img.y}%`,
                transform: `translate(-50%, -50%) scale(${img.scale})`,
                zIndex: img.z_index,
                opacity: img.opacity ?? 1,
            }}
            onMouseDown={(e) => handleDragStart(key, e)}
        >
            {img.url ? (
                <img
                    src={img.url}
                    alt={key}
                    draggable={false}
                    className="w-32 h-auto object-contain pointer-events-none select-none"
                />
            ) : (
                <div className="w-32 h-32 bg-muted/20 border-2 border-dashed border-muted-foreground/20 rounded flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                </div>
            )}
        </div>
    );


    return (
        <Card className="border-accent/20 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-accent" />
                        IP Pop-up Configurator
                    </CardTitle>
                    <CardDescription>Display server IP with images and animations</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="enable-popup" className="cursor-pointer">Enabled</Label>
                    <Switch
                        id="enable-popup"
                        checked={settings.enabled}
                        onCheckedChange={(v) => onSettingsChange({ ...settings, enabled: v })}
                    />
                </div>
            </CardHeader>

            {settings.enabled && (
                <CardContent className="flex flex-col gap-8">
                    {/* Left: Settings Panel */}
                    <div className="space-y-4">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="w-full grid grid-cols-4">
                                <TabsTrigger value="text"><Type className="w-4 h-4 mr-2" />Text</TabsTrigger>
                                <TabsTrigger value="images"><ImageIcon className="w-4 h-4 mr-2" />Images</TabsTrigger>
                                <TabsTrigger value="style"><Layers className="w-4 h-4 mr-2" />Style</TabsTrigger>
                                <TabsTrigger value="timing"><Volume2 className="w-4 h-4 mr-2" />Timing</TabsTrigger>
                            </TabsList>

                            {/* TEXT SETTINGS */}
                            <TabsContent value="text" className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label>Pop-up Content (Server IP)</Label>
                                    <Input
                                        value={settings.text.content}
                                        onChange={(e) => updateText({ content: e.target.value })}
                                        className="bg-background/50"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Font Family</Label>
                                        <Select
                                            value={settings.text.font_family}
                                            onValueChange={(v) => updateText({ font_family: v })}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Bungee">Japan</SelectItem>
                                                <SelectItem value="Titan One">TitanOne-Regular</SelectItem>
                                                <SelectItem value="Press Start 2P">Minecraft Ten</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Font Size</Label>
                                        <Slider
                                            value={[settings.text.font_size]}
                                            min={1} max={20} step={0.5}
                                            onValueChange={(v) => updateText({ font_size: v[0] })}
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* IMAGES SETTINGS */}
                            <TabsContent value="images" className="space-y-6 mt-4">
                                {[1, 2].map((num) => {
                                    const key = `image${num}` as 'image1' | 'image2';
                                    const img = settings[key];
                                    return (
                                        <div key={key} className="space-y-3 p-3 bg-muted/20 rounded-lg border border-border/50">
                                            <div className="flex items-center justify-between">
                                                <Label className="font-semibold">Image Slot {num}</Label>
                                                <Switch
                                                    checked={img.enabled}
                                                    onCheckedChange={(v) => updateImage(key, { enabled: v })}
                                                />
                                            </div>
                                            {img.enabled && (
                                                <>
                                                    <div className="flex gap-2">
                                                        {img.url ? (
                                                            <div className="relative w-16 h-16 bg-muted rounded overflow-hidden">
                                                                <img src={img.url} className="w-full h-full object-contain" />
                                                                <button onClick={() => updateImage(key, { url: null })} className="absolute top-0 right-0 p-1 bg-black/50 hover:bg-red-500/80 text-white rounded-bl">
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                                                                <ImageIcon className="w-6 h-6 text-muted-foreground" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 space-y-2">
                                                            <Input
                                                                type="file"
                                                                className="cursor-pointer text-xs"
                                                                accept="image/*"
                                                                onChange={(e) => {
                                                                    if (e.target.files?.[0]) handleUpload(key, e.target.files[0]);
                                                                }}
                                                            />
                                                            <div className="flex items-center gap-2">
                                                                <Label className="text-xs">Scale</Label>
                                                                <Slider
                                                                    value={[img.scale]}
                                                                    min={0.1} max={3.0} step={0.1}
                                                                    onValueChange={(v) => updateImage(key, { scale: v[0] })}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Label className="text-xs">Opacity</Label>
                                                                <Slider
                                                                    value={[img.opacity ?? 1]}
                                                                    min={0} max={1} step={0.1}
                                                                    onValueChange={(v) => updateImage(key, { opacity: v[0] })}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Label className="text-xs">Layer</Label>
                                                                <Select
                                                                    value={String(img.z_index)}
                                                                    onValueChange={(v) => updateImage(key, { z_index: Number(v) })}
                                                                >
                                                                    <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="1">Back</SelectItem>
                                                                        <SelectItem value="2">Front</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </TabsContent>

                            {/* STYLE SETTINGS */}
                            <TabsContent value="style" className="space-y-4 mt-4">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between"><Label>Text Color</Label></div>
                                        <div className="flex gap-2">
                                            <Input type="color" value={settings.text.color} onChange={(e) => updateText({ color: e.target.value })} className="w-10 h-8 p-0 border-0" />
                                            <Input value={settings.text.color} onChange={(e) => updateText({ color: e.target.value })} className="flex-1 h-8" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <Label>Stroke</Label>
                                            <Switch checked={settings.text.stroke_enabled} onCheckedChange={(v) => updateText({ stroke_enabled: v })} />
                                        </div>
                                        {settings.text.stroke_enabled && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <Input type="color" value={settings.text.stroke_color} onChange={(e) => updateText({ stroke_color: e.target.value })} className="w-full h-8" />
                                                <Slider value={[settings.text.stroke_width]} min={0} max={10} onValueChange={(v) => updateText({ stroke_width: v[0] })} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <Label>Glow</Label>
                                            <Switch checked={settings.text.glow_enabled} onCheckedChange={(v) => updateText({ glow_enabled: v })} />
                                        </div>
                                        {settings.text.glow_enabled && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <Input type="color" value={settings.text.glow_color} onChange={(e) => updateText({ glow_color: e.target.value })} className="w-full h-8" />
                                                <Slider value={[settings.text.glow_intensity]} min={0} max={100} onValueChange={(v) => updateText({ glow_intensity: v[0] })} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            {/* TIMING SETTINGS */}
                            <TabsContent value="timing" className="space-y-4 mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Start Time (sec)</Label>
                                        <Input
                                            type="number"
                                            value={settings.start_time}
                                            onChange={(e) => onSettingsChange({ ...settings, start_time: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Duration (sec)</Label>
                                        <Input
                                            type="number"
                                            value={settings.duration}
                                            onChange={(e) => onSettingsChange({ ...settings, duration: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Sound Effect</Label>
                                    <Select
                                        value={settings.sfx_id || "none"}
                                        onValueChange={(v) => onSettingsChange({ ...settings, sfx_id: v === "none" ? null : v })}
                                    >
                                        <SelectTrigger><SelectValue placeholder="No Sound" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {sfxList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </TabsContent>
                        </Tabs>


                    </div>

                    {/* Right: Phone Preview */}
                    <div className="flex flex-col items-center space-y-4">
                        <Label className="flex items-center gap-2">
                            <Monitor className="w-4 h-4" /> Interactive Preview
                        </Label>

                        {/* Phone Container - 9:16 Aspect Ratio */}
                        <div
                            className="relative w-[300px] h-[533px] bg-black/90 rounded-3xl border-4 border-gray-800 shadow-2xl overflow-hidden select-none"
                            ref={previewRef}
                            style={{ boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
                        >
                            {/* Inner Screen */}
                            <div className="absolute inset-0 bg-white overflow-hidden">
                                {videos && videos.length > 0 && videos[0].file_url ? (
                                    <video
                                        src={videos[0].file_url}
                                        className="absolute inset-0 w-full h-full object-cover opacity-50"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-white" />
                                )}

                                {(!videos || videos.length === 0 || !videos[0].file_url) && (
                                    <div className="absolute inset-0 opacity-5 pointer-events-none"
                                        style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                    />
                                )}

                                {/* Elements Container - Animated */}
                                <div className={cn(
                                    "absolute inset-0 transition-all duration-300 transform",
                                    isPlaying ? "scale-100 opacity-100" : "scale-100 opacity-100" // Always visible in editing, animate "pop" on play
                                )}>
                                    <style>{`
                                        @keyframes popIn {
                                            0% { transform: scale(0); opacity: 0; }
                                            70% { transform: scale(1.1); opacity: 1; }
                                            100% { transform: scale(1); opacity: 1; }
                                        }
                                        .animate-pop { animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                                    `}</style>

                                    <div className={cn("w-full h-full", isPlaying && "animate-pop")}>

                                        {/* Image layer 1 (if z_index 1) */}
                                        {settings.image1.enabled && settings.image1.z_index === 1 && renderDraggableImage('image1', settings.image1)}
                                        {settings.image2.enabled && settings.image2.z_index === 1 && renderDraggableImage('image2', settings.image2)}

                                        {/* TEXT */}
                                        <div
                                            className={cn(
                                                "absolute cursor-move group hover:outline hover:outline-dashed hover:outline-accent",
                                                dragTarget === 'text' && "outline outline-accent"
                                            )}
                                            style={{
                                                left: `${settings.text.x}%`,
                                                top: `${settings.text.y}%`,
                                                transform: 'translate(-50%, -50%)',
                                                fontFamily: settings.text.font_family,
                                                fontSize: `${settings.text.font_size * 2}px`, // Scale for preview approx
                                                color: settings.text.color,
                                                textShadow: settings.text.shadow_enabled ? `2px 2px ${settings.text.shadow_blur}px rgba(0,0,0,${settings.text.shadow_opacity})` : 'none',
                                                WebkitTextStroke: settings.text.stroke_enabled ? `${settings.text.stroke_width}px ${settings.text.stroke_color}` : '0px',
                                                filter: settings.text.glow_enabled ? `drop-shadow(0 0 ${settings.text.glow_size}px ${settings.text.glow_color})` : 'none',
                                                zIndex: 3 // Text usually on top
                                            }}
                                            onMouseDown={(e) => handleDragStart('text', e)}
                                        >
                                            {settings.text.content}
                                        </div>

                                        {/* Image layer 2 (if z_index 2) */}
                                        {settings.image1.enabled && settings.image1.z_index === 2 && renderDraggableImage('image1', settings.image1)}
                                        {settings.image2.enabled && settings.image2.z_index === 2 && renderDraggableImage('image2', settings.image2)}

                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Play Preview Control */}
                        <div className="flex gap-4">
                            <Button onClick={playPreview} disabled={isPlaying} size="lg" className="w-[300px] bg-accent hover:bg-accent/90">
                                {isPlaying ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}
                                Test Animation
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center max-w-[300px]">
                            Drag elements on the screen to position them.
                        </p>
                    </div>

                    {/* Save Button - at the bottom */}
                    {onSave && (
                        <div className="flex justify-center w-full pt-4 border-t border-border/50">
                            <Button onClick={onSave} disabled={isSaving} className="w-full max-w-sm" variant="secondary">
                                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Configuration
                            </Button>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );


};
