import React, { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Upload, Trash2, Eye, ImageIcon, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface EndScreenIPSettings {
  color: string;
  fontFamily: string;
  fontSize: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  shadowDistance: number;
  rainbowEnabled?: boolean; // Creative Mode rainbow glow for IP text
}

export interface EndScreenSettings {
  enabled: boolean;
  blur_enabled: boolean;
  ip_text: string;
  ip_settings: EndScreenIPSettings;
  logo_url: string | null;
  layout: 'horizontal' | 'vertical';
}

export const defaultEndScreenIPSettings: EndScreenIPSettings = {
  color: "#ffffff",
  fontFamily: "Bungee",
  fontSize: 5,
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowEnabled: true,
  shadowOpacity: 0.8,
  shadowBlur: 6,
  shadowDistance: 4,
  rainbowEnabled: false,
};

export const defaultEndScreenSettings: EndScreenSettings = {
  enabled: true,
  blur_enabled: true,
  ip_text: "play.yourserver.net",
  ip_settings: defaultEndScreenIPSettings,
  logo_url: null,
  layout: 'horizontal',
};

interface EndScreenConfiguratorProps {
  settings: EndScreenSettings;
  onSettingsChange: (settings: EndScreenSettings) => void;
  projectId: string;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

const COLOR_PALETTE = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
  "#ff00ff", "#00ffff", "#ff6b00", "#00ff88", "#ffd700", "#ff1493",
  "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16",
];

const FONT_OPTIONS = [
  { id: "Bungee", name: "Japan" },
  { id: "Titan One", name: "TitanOne-Regular" },
  { id: "Press Start 2P", name: "Minecraft Ten" },
];

export const EndScreenConfigurator: React.FC<EndScreenConfiguratorProps> = ({
  settings,
  onSettingsChange,
  projectId,
  onSave,
  isSaving = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTextOpen, setIsTextOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateSetting = useCallback(<K extends keyof EndScreenSettings>(
    key: K,
    value: EndScreenSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  }, [settings, onSettingsChange]);

  const updateIPSetting = useCallback(<K extends keyof EndScreenIPSettings>(
    key: K,
    value: EndScreenIPSettings[K]
  ) => {
    onSettingsChange({
      ...settings,
      ip_settings: { ...settings.ip_settings, [key]: value }
    });
  }, [settings, onSettingsChange]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("Uploading file:", file.name, file.type, file.size);

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${user.id}/${projectId}_endscreen_logo.${ext}`;

      console.log("Uploading to:", fileName);

      const { error: uploadError } = await supabase.storage
        .from("exports")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("exports")
        .getPublicUrl(fileName);

      // Add cache buster to force refresh
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
      console.log("Logo URL:", urlWithCacheBuster);

      updateSetting("logo_url", urlWithCacheBuster);
      toast.success("Logo uploaded successfully!");
    } catch (error: any) {
      console.error("Logo upload error:", error);
      toast.error(error.message || "Failed to upload logo");
    } finally {
      setUploading(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeLogo = () => {
    updateSetting("logo_url", null);
  };

  const getTextStyle = (): React.CSSProperties => {
    const s = settings.ip_settings;
    const shadows: string[] = [];
    if (s.rainbowEnabled) {
      // High-fidelity spectral glow matching subtitles
      shadows.push(
        '0 0 12px rgba(255,0,0,0.6)',
        '0 0 24px rgba(0,255,255,0.4)',
        '0 0 35px rgba(255,0,255,0.2)'
      );
    } else if (s.shadowEnabled) {
      // Normal drop shadow
      shadows.push(`${s.shadowDistance}px ${s.shadowDistance}px ${s.shadowBlur}px rgba(0,0,0,${s.shadowOpacity})`);
    }
    
    const style: React.CSSProperties = {
      color: s.rainbowEnabled ? undefined : s.color, // Clear color for gradient
      fontFamily: s.fontFamily,
      fontSize: `${s.fontSize * 4}px`,
      fontWeight: 900, // Extra fat for spectral effect
      textAlign: "center",
      textTransform: "uppercase" as const,
      textShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
      lineHeight: 1.2,
    };

    // Apply animated rainbow gradient for Visual Mode
    if (s.rainbowEnabled) {
      Object.assign(style, {
        background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0088ff, #ff00ff, #ff0000)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'rainbow-scroll 3s linear infinite',
      });
    }

    return style;
  };

  // Add keyframes for the rainbow scroll if not already present
  const styleTag = (
    <style>
      {`
        @keyframes rainbow-scroll {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}
    </style>
  );

  return (
    <>
    {styleTag}
    <Card className="rgb-border-card overflow-hidden group hover:shadow-lg hover:shadow-accent/10 transition-all duration-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className="relative p-2 rounded-lg bg-accent/10">
              <Eye className="w-5 h-5 text-accent relative z-10" />
              <div className="absolute inset-0 bg-accent/30 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span>End Screen</span>
          </CardTitle>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-muted-foreground">
              {settings.enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => {
                console.log("End screen toggled:", checked);
                updateSetting("enabled", checked);
              }}
            />
          </div>
        </div>
      </CardHeader>

      {settings.enabled && (
        <CardContent className="space-y-6">
          {/* Preview */}
          <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50">
            <div 
              className={cn(
                "aspect-video flex flex-col items-center justify-center relative p-8",
                settings.blur_enabled && "backdrop-blur-sm"
              )}
              style={{
                background: settings.blur_enabled 
                  ? "linear-gradient(135deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 100%)"
                  : "transparent"
              }}
            >
              {/* IP Text assembly */}
              <div 
                className={cn(
                  "relative flex items-center justify-center gap-2",
                  settings.layout === 'vertical' ? 'flex-col' : 'flex-row'
                )}
              >
                {/* Logo - now OUTSIDE the dark box */}
                {settings.logo_url ? (
                  <img 
                    src={settings.logo_url} 
                    alt="End screen logo"
                    className={cn(
                      "object-contain drop-shadow-2xl z-20",
                      settings.layout === 'vertical' ? 'max-h-20 max-w-[60%]' : 'max-h-14 max-w-[120px]'
                    )}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-muted/10 border border-dashed border-border/30 flex items-center justify-center z-20">
                    <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}

                {/* Dark box ONLY around text */}
                <div className="px-6 py-3 rounded-2xl bg-black/45 border border-white/5 backdrop-blur-md shadow-xl flex flex-col items-center justify-center">
                  {settings.ip_text ? (
                    <div 
                      style={{...getTextStyle(), textAlign: "center", fontSize: `${settings.ip_settings.fontSize * 3}px`}} 
                      className="shrink leading-tight"
                    >
                      {settings.ip_text}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm text-center shrink">
                      Your IP text here
                    </div>
                  )}
                  {/* Simulated Port/Friend lines */}
                  <div className="mt-1 space-y-0.5 opacity-40">
                     <div className="text-[6px] font-bold text-white/30 uppercase tracking-widest text-center">Server Online</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white/70">
              Last 2 seconds
            </div>
          </div>

          {/* Blur Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30">
            <Label className="flex flex-col gap-1">
              <span className="font-medium">Background Blur</span>
              <span className="text-xs text-muted-foreground">Subtle background blur for focus</span>
            </Label>
            <Switch
              checked={settings.blur_enabled}
              onCheckedChange={(checked) => updateSetting("blur_enabled", checked)}
            />
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-red-500/10 via-yellow-500/10 to-blue-500/10 border border-border/30">
            <Label className="flex flex-col gap-1">
              <span className="font-medium flex items-center gap-2">
                Visual Mode (Rainbow)
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">NEW</span>
              </span>
              <span className="text-xs text-muted-foreground">Premium rainbow spectral text with inner glow</span>
            </Label>
            <Switch
              checked={settings.ip_settings.rainbowEnabled ?? false}
              onCheckedChange={(checked) => updateIPSetting("rainbowEnabled", checked)}
            />
          </div>

          {/* Layout Selection */}
          <div className="space-y-3">
            <Label className="font-medium">Layout Format</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={settings.layout === 'horizontal' ? 'default' : 'outline'}
                onClick={() => updateSetting('layout', 'horizontal')}
                className="h-9 px-3 text-xs"
              >
                Horizontal
              </Button>
              <Button
                variant={settings.layout === 'vertical' ? 'default' : 'outline'}
                onClick={() => updateSetting('layout', 'vertical')}
                className="h-9 px-3 text-xs"
              >
                Vertical
              </Button>
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-3">
            <Label className="font-medium">Logo</Label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Uploading..." : "Upload Logo"}
              </Button>
              {settings.logo_url && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={removeLogo}
                  className="border-destructive/50 hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>

          {/* IP Text */}
          <div className="space-y-3">
            <Label className="font-medium">IP Text</Label>
            <Input
              value={settings.ip_text}
              onChange={(e) => updateSetting("ip_text", e.target.value)}
              placeholder="@username or your brand"
              className="bg-muted/30"
            />
          </div>

          {/* Text Styling Collapsible */}
          <Collapsible open={isTextOpen} onOpenChange={setIsTextOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-4 py-3 h-auto bg-muted/30 hover:bg-muted/50"
              >
                <span className="font-medium">Text Styling</span>
                <ChevronDown className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  isTextOpen && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-6">
              {/* Text Color */}
              <div className="space-y-3">
                <Label className="text-sm">Text Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateIPSetting("color", color)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-all duration-200 hover:scale-110",
                        settings.ip_settings.color === color
                          ? "border-primary ring-2 ring-primary/30 scale-110"
                          : "border-border/50"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="space-y-3">
                <Label className="text-sm">Font</Label>
                <Select
                  value={settings.ip_settings.fontFamily}
                  onValueChange={(v) => updateIPSetting("fontFamily", v)}
                >
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font.id} value={font.id}>
                        <span style={{ fontFamily: font.id }}>{font.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label className="text-sm">Font Size</Label>
                  <span className="text-sm text-muted-foreground">{settings.ip_settings.fontSize}vmin</span>
                </div>
                <Slider
                  value={[settings.ip_settings.fontSize]}
                  onValueChange={([v]) => updateIPSetting("fontSize", v)}
                  min={2}
                  max={12}
                  step={0.5}
                  className="w-full"
                />
              </div>

              {/* Stroke */}
              <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Text Stroke</Label>
                  <Switch
                    checked={settings.ip_settings.strokeEnabled}
                    onCheckedChange={(v) => updateIPSetting("strokeEnabled", v)}
                  />
                </div>
                {settings.ip_settings.strokeEnabled && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTE.slice(0, 8).map((color) => (
                        <button
                          key={color}
                          onClick={() => updateIPSetting("strokeColor", color)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all duration-200",
                            settings.ip_settings.strokeColor === color
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border/50"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <Slider
                      value={[settings.ip_settings.strokeWidth]}
                      onValueChange={([v]) => updateIPSetting("strokeWidth", v)}
                      min={0.5}
                      max={6}
                      step={0.5}
                      className="w-full"
                    />
                  </>
                )}
              </div>

              {/* Shadow */}
              <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Text Shadow</Label>
                  <Switch
                    checked={settings.ip_settings.shadowEnabled}
                    onCheckedChange={(v) => updateIPSetting("shadowEnabled", v)}
                  />
                </div>
                {settings.ip_settings.shadowEnabled && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs text-muted-foreground">Opacity</Label>
                        <span className="text-xs text-muted-foreground">{Math.round(settings.ip_settings.shadowOpacity * 100)}%</span>
                      </div>
                      <Slider
                        value={[settings.ip_settings.shadowOpacity]}
                        onValueChange={([v]) => updateIPSetting("shadowOpacity", v)}
                        min={0.1}
                        max={1}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs text-muted-foreground">Blur</Label>
                        <span className="text-xs text-muted-foreground">{settings.ip_settings.shadowBlur}px</span>
                      </div>
                      <Slider
                        value={[settings.ip_settings.shadowBlur]}
                        onValueChange={([v]) => updateIPSetting("shadowBlur", v)}
                        min={0}
                        max={20}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs text-muted-foreground">Distance</Label>
                        <span className="text-xs text-muted-foreground">{settings.ip_settings.shadowDistance}px</span>
                      </div>
                      <Slider
                        value={[settings.ip_settings.shadowDistance]}
                        onValueChange={([v]) => updateIPSetting("shadowDistance", v)}
                        min={0}
                        max={15}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Save Button */}
          {onSave && (
            <Button
              onClick={onSave}
              disabled={isSaving}
              className="w-full mt-4"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save End Screen Settings
                </>
              )}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
    </>
  );
};
