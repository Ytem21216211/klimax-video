import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Save, Upload, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { SubtitleSettings } from "../subtitle/SubtitleStyleCustomizer";

interface ServerLogoConfiguratorProps {
    settings: SubtitleSettings;
    onSettingsChange: (settings: SubtitleSettings) => void;
    projectId: string;
    onSave?: () => Promise<void>;
    isSaving?: boolean;
}

export const ServerLogoConfigurator = ({
    settings,
    onSettingsChange,
    projectId,
    onSave,
    isSaving = false,
}: ServerLogoConfiguratorProps) => {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            toast.error("Please upload an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File too large. Maximum size is 5MB");
            return;
        }

        setUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const fileName = `${user.id}/${projectId}_server_logo_${new Date().getTime()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("exports")
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from("exports")
                .getPublicUrl(fileName);

            const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
            onSettingsChange({ ...settings, server_logo_url: urlWithCacheBuster });
            toast.success("Server logo uploaded successfully!");
        } catch (error: any) {
            console.error("Logo upload error:", error);
            toast.error(error.message || "Failed to upload logo");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-primary/20">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    Server Logo Popup
                </CardTitle>
                <CardDescription>
                    Upload your server logo here. The AI will detect when the server name is spoken, hide the subtitles, and animate the logo onto the screen!
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Logo Image</Label>
                    <div className="flex gap-2">
                        <Input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleLogoUpload}
                        />
                        <Button
                            variant="outline"
                            className="w-full h-24 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    <span className="text-muted-foreground text-sm">Uploading...</span>
                                </div>
                            ) : settings.server_logo_url ? (
                                <div className="flex items-center gap-4 w-full px-4 relative group">
                                    <div className="h-16 w-16 rounded-md border bg-black/50 overflow-hidden flex items-center justify-center relative shadow-sm">
                                        <img
                                            src={settings.server_logo_url}
                                            alt="Server Logo"
                                            className="w-full h-full object-contain p-1"
                                        />
                                    </div>
                                    <div className="flex flex-col items-start flex-1 truncate">
                                        <span className="font-medium text-sm">Logo Uploaded</span>
                                        <span className="text-xs text-muted-foreground">Click to replace</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSettingsChange({ ...settings, server_logo_url: null });
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                                    <span className="text-muted-foreground text-sm">Click to upload logo for the popup effect</span>
                                </div>
                            )}
                        </Button>
                    </div>
                </div>

                {onSave && (
                    <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className="w-full"
                        variant="default"
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Server Logo Settings
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};
