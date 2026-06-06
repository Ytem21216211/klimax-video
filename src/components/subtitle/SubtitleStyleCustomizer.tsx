import React, { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { parsePrfpset } from "@/lib/utils/prfpset-parser";
import { parsePrtextstyle } from "@/lib/utils/prtextstyle-parser";
import { Plus, Save, Trash2, ChevronDown, Sparkles, Pencil, Shuffle, Volume2, Play, Pause, Rainbow, Loader2, FileType, FileUp, Settings } from "lucide-react";
import { toast } from "sonner";
import { FontManager } from "./FontManager";

export interface SubtitleSettings {
  style: string;
  bounceRate: number;
  fontSize: number;
  fontFamily: string;
  customFontUrl?: string;
  textColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  shadowDistance: number;
  // Glow effect settings
  glowEnabled: boolean;
  glowColor: string;
  glowIntensity: number; // 0-100
  glowSize: number; // blur radius in px
  // Inner Glow effect settings (bright center highlight inside text)
  innerGlowEnabled: boolean;
  innerGlowColor: string;
  innerGlowIntensity: number; // 0-100
  innerGlowSize: number; // 0-100 (blur)
  transition: string;
  transitionSuit?: string[]; // NEW: List of transitions to rotate through
  flashColor?: string;
  sfxVolume: number; // 0-200, percentage for SFX volume at clip transitions (>100 = boost)
  selectedSfxId: string | null; // ID of selected SFX from library, null = random
  // Visual Mode - AI-powered rainbow keywords
  visualModeEnabled: boolean;
  // Creative Mode - advanced AI editing features
  creativeModeEnabled: boolean;
  // Words per line (0 = auto)
  wordsPerLine: number;
  // Vertical position (higher = 35% from top, middle = 50% from top)
  verticalPosition?: "higher" | "middle";
  // Font weight (e.g., 700, 800, 900)
  fontWeight?: number;
  // Server Logo URL for popups
  server_logo_url?: string | null;
  // LOGO RECOGNITION: Replace specific words with the animated logo
  logoRecognitionEnabled?: boolean;
  recognitionServerName?: string;
  customAnimation?: any[];
}

interface SubtitlePreset {
  id: string;
  name: string;
  settings: SubtitleSettings;
}

export interface SubtitleStyleCustomizerProps {
  settings: SubtitleSettings;
  onSettingsChange: (settings: SubtitleSettings) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

const ANIMATION_OPTIONS = [
  { id: "static", name: "Static", description: "Clean minimal text" },
  { id: "pop", name: "Pop In", description: "Professional overshoot pop" },
  { id: "bounce", name: "Bounce", description: "Bouncy word pop" },
  { id: "elastic", name: "Elastic", description: "Elastic spring effect" },
  { id: "slide-up", name: "Slide Up", description: "Smooth slide from below" },
  { id: "slide-down", name: "Slide Down", description: "Smooth slide from above" },
  { id: "fly-in", name: "Fly In", description: "Flying word animation" },
  { id: "reveal", name: "Reveal", description: "Smooth text reveal" },
  { id: "highlight", name: "Highlight", description: "Word-by-word glow" },
  { id: "karaoke", name: "Karaoke", description: "Color fill animation" },
  { id: "typewriter", name: "Typewriter", description: "Letter by letter reveal" },
  { id: "wave", name: "Wave", description: "Wavy text motion" },
  { id: "zoom", name: "Zoom", description: "Scale in/out effect" },
  { id: "glow", name: "Glow", description: "Pulsing glow effect" },
  // Impact animations
  { id: "slam", name: "Slam", description: "Impact slam effect" },
  { id: "glitch", name: "Glitch", description: "Digital glitch distortion" },
  { id: "wobble", name: "Wobble", description: "Wobbly jello effect" },
  { id: "flip", name: "Flip", description: "3D flip entrance" },
  { id: "blur-in", name: "Blur In", description: "Focus blur reveal" },
  { id: "drop", name: "Drop", description: "Drop with bounce" },
  { id: "spin-in", name: "Spin In", description: "Rotating entrance" },
  { id: "scale-rotate", name: "Scale Rotate", description: "Scale + rotation combo" },
  { id: "stomp", name: "Stomp", description: "Heavy stomp impact" },
  { id: "jitter", name: "Jitter", description: "Nervous jitter shake" },
  { id: "swing", name: "Swing", description: "Pendulum swing" },
  { id: "flash", name: "Flash", description: "Flash reveal" },
  { id: "rubberband", name: "Rubberband", description: "Stretch & snap" },
  { id: "heartbeat", name: "Heartbeat", description: "Pulsing heartbeat" },
  { id: "explode", name: "Explode", description: "Explosive entrance" },
  // NEW: Additional impact animations
  { id: "punch", name: "Punch", description: "Quick punch-in effect" },
  { id: "smash", name: "Smash", description: "Smashing entrance" },
  { id: "crash", name: "Crash", description: "Crash landing impact" },
  // NEW: Smooth animations
  { id: "float", name: "Float", description: "Gentle floating entrance" },
  { id: "drift", name: "Drift", description: "Smooth drift in" },
  { id: "morph", name: "Morph", description: "Morphing appearance" },
  // NEW: Energetic animations
  { id: "spark", name: "Spark", description: "Sparking energy entrance" },
  { id: "pulse-grow", name: "Pulse Grow", description: "Growing pulse effect" },
  { id: "ripple", name: "Ripple", description: "Rippling wave effect" },
  // NEW: Dramatic animations
  { id: "soft-pop", name: "Soft Pop", description: "Ultra fast smooth zoom" },
  { id: "cinematic", name: "Cinematic", description: "Epic cinematic reveal" },
  { id: "spotlight", name: "Spotlight", description: "Spotlight focus" },
  { id: "custom", name: "Custom Preset", description: "Imported Premiere Pro animation" },
];

const TRANSITION_OPTIONS = [
  { id: "none", name: "None", description: "No transition (Hard cut)", icon: "ban" },
  { id: "whip-pan", name: "Whip Pan", description: "Fast Blurred Slide", icon: "move-right" },
  { id: "zoom-punch", name: "Zoom Punch", description: "Punchy Scale-In", icon: "zoom-in" },
  { id: "glitch-grid", name: "Glitch Grid", description: "Digital Artifacts", icon: "zap" },
  { id: "luma-wipe", name: "Luma Wipe", description: "Luminosity Sweep", icon: "sun" },
  { id: "radial-blur", name: "Radial Blur", description: "Centric Zoom Blur", icon: "circle-dot" },
  { id: "wipe-left", name: "Wipe Left", description: "Smooth Wipe Left", icon: "arrow-left" },
  { id: "wipe-right", name: "Wipe Right", description: "Smooth Wipe Right", icon: "arrow-right" },
  { id: "camera-lens", name: "Camera Lens", description: "Premium Bloom & Blur", icon: "camera" },
  { id: "swipe-up", name: "Swipe Up", description: "Vertical Upward Wipe", icon: "arrow-up" },
  { id: "swipe-down", name: "Swipe Down", description: "Vertical Downward Wipe", icon: "arrow-down" },
  { id: "flash", name: "Flash", description: "Bright Scene Cut", icon: "zap" },
  { id: "suit", name: "Suit", description: "🔄 Rotate through multiple", icon: "shuffle" },
];

const COLOR_PALETTE = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
  "#ff00ff", "#00ffff", "#ff6b00", "#00ff88", "#ffd700", "#ff1493",
  "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16",
];

const FLASH_COLORS = [
  { name: "Light Red", hex: "#FF3B3E" },
  { name: "Bright Yellow", hex: "#FBE73D" },
  { name: "Sky Blue", hex: "#6DD7FF" },
  { name: "Light Brown / Caramel", hex: "#DB9E61" },
  { name: "Neon Green", hex: "#42FF30" },
  { name: "Light Purple", hex: "#DE77FD" },
  { name: "Peach / Light Orange", hex: "#F0AE69" },
  { name: "Dark Pinkish Red", hex: "#F7203F" },
  { name: "Royal Blue", hex: "#307EEE" },
  { name: "Pinkish Red", hex: "#F71A4F" },
  { name: "Steel Blue / Blue Gray", hex: "#70A8CB" },
  { name: "Warm Red", hex: "#F25055" },
];

const FONT_OPTIONS = [
  { id: "Montserrat", name: "Montserrat (Viral)", style: "font-sans font-black" },
  { id: "Archivo Black", name: "Archivo Black", style: "font-sans" },
  { id: "Bungee", name: "Japan (Bungee)", style: "font-sans font-bold uppercase" },
  { id: "Titan One", name: "Titan One", style: "font-sans font-bold" },
  { id: "Press Start 2P", name: "Minecraft Ten", style: "font-sans" },
  { id: "Anton", name: "Anton", style: "font-sans" },
  { id: "Bebas Neue", name: "Bebas Neue", style: "font-sans" },
  { id: "Inter", name: "Inter (Bold)", style: "font-sans font-black" },
];

// Animated preview for dropdown
const AnimationPreview = ({ styleId, isActive }: { styleId: string; isActive: boolean }) => {
  const getAnimationClass = () => {
    if (!isActive) return "";
    switch (styleId) {
      case "static": return "";
      case "pop": return "animate-pop";
      case "bounce": return "animate-bounce-text";
      case "elastic": return "animate-elastic";
      case "slide-up": return "animate-slide-up";
      case "slide-down": return "animate-slide-down";
      case "fly-in": return "animate-fly-in";
      case "reveal": return "animate-reveal";
      case "highlight": return "animate-pulse";
      case "karaoke": return "animate-karaoke";
      case "typewriter": return "animate-typewriter";
      case "wave": return "animate-wave";
      case "zoom": return "animate-zoom";
      case "glow": return "animate-glow";
      // New animations
      case "slam": return "animate-slam";
      case "glitch": return "animate-glitch-text";
      case "wobble": return "animate-wobble";
      case "flip": return "animate-flip";
      case "blur-in": return "animate-blur-in";
      case "drop": return "animate-drop";
      case "spin-in": return "animate-spin-in";
      case "scale-rotate": return "animate-scale-rotate";
      case "stomp": return "animate-stomp";
      case "jitter": return "animate-jitter";
      case "swing": return "animate-swing";
      case "flash": return "animate-flash";
      case "rubberband": return "animate-rubberband";
      case "heartbeat": return "animate-heartbeat";
      case "explode": return "animate-explode";
      // NEW animations
      case "punch": return "animate-punch";
      case "smash": return "animate-smash";
      case "crash": return "animate-crash";
      case "float": return "animate-float";
      case "drift": return "animate-drift";
      case "morph": return "animate-morph";
      case "spark": return "animate-spark";
      case "pulse-grow": return "animate-pulse-grow";
      case "ripple": return "animate-ripple";
      case "cinematic": return "animate-cinematic";
      case "spotlight": return "animate-spotlight";
      case "soft-pop": return "animate-soft-pop";
      case "custom": return "animate-pulse";
      default: return "";
    }
  };

  return (
    <span className={cn("font-bold transition-all", getAnimationClass())}>
      Abc
    </span>
  );
};

// Transition preview animation
const TransitionPreview = ({ transitionId, isActive, color }: { transitionId: string; isActive: boolean; color?: string }) => {
  const [animate, setAnimate] = useState(false);
  const [displayColor, setDisplayColor] = useState(color || "#ffffff");

  useEffect(() => {
    if (isActive) {
      if (color === "random") {
        // Randomly cycle through colors for the preview
        const randomIndex = Math.floor(Math.random() * FLASH_COLORS.length);
        setDisplayColor(FLASH_COLORS[randomIndex].hex);
      } else {
        setDisplayColor(color || "#ffffff");
      }
      
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 700);
      return () => clearTimeout(timer);
    }
  }, [isActive, color]);

  const getPreviewStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: 36,
      height: 22,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, hsl(var(--primary)/0.4), hsl(var(--accent)/0.6))',
    };
    return base;
  };

  const getAnimationStyle = (): React.CSSProperties => {
    if (!animate) return { opacity: 1 };

    switch (transitionId) {
      case "whip-pan":
        return { animation: 'transitionWhipPan 0.5s ease-in-out' };
      case "zoom-punch":
        return { animation: 'transitionZoomPunch 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' };
      case "glitch-grid":
        return { animation: 'transitionGlitchGrid 0.4s steps(5)' };
      case "luma-wipe":
        return { animation: 'transitionLumaWipe 0.6s ease-out' };
      case "radial-blur":
        return { animation: 'transitionRadialBlur 0.5s ease-out' };
      case "wipe-left":
        return { animation: 'transitionWipeLeft 0.5s ease-in-out' };
      case "wipe-right":
        return { animation: 'transitionWipeRight 0.5s ease-in-out' };
      case "camera-lens":
        return { animation: 'transitionCameraLens 0.8s ease-in-out infinite' };
      case "swipe-up":
        return { animation: 'transitionSwipeUp 0.7s ease-in-out' };
      case "swipe-down":
        return { animation: 'transitionSwipeDown 0.7s ease-in-out' };
      case "flash":
        return { 
          animation: 'transitionFlash 0.5s ease-out',
          backgroundColor: displayColor,
          filter: displayColor === '#000000' ? 'brightness(10)' : 'brightness(1)' 
        };
      default:
        return {};
    }
  };

  return (
    <div style={getPreviewStyle()}>
      <div
        className={cn(
          "absolute inset-0",
          transitionId === "flash" ? "" : "bg-gradient-to-br from-primary/50 to-accent/70"
        )}
        style={getAnimationStyle()}
      />
      <Shuffle className="w-3 h-3 text-primary-foreground relative z-10" />
    </div>
  );
};

// Color picker with palette
const ColorPicker = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) => (
  <div className="space-y-2">
    <Label className="text-xs">{label}</Label>
    <div className="flex flex-wrap gap-1.5">
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "w-5 h-5 rounded border-2 transition-all",
            value === color ? "border-primary scale-110" : "border-transparent hover:scale-105"
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="w-5 h-5 rounded border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
        <span className="text-[8px] text-muted-foreground">+</span>
      </label>
    </div>
  </div>
);

// Live preview text - High quality preview with glow support
const LivePreview = ({ settings }: { settings: SubtitleSettings }) => {
  // Build text shadow combining shadow and glow effects
  const buildTextShadow = () => {
    const shadows: string[] = [];

    // Regular shadow
    if (settings.shadowEnabled) {
      shadows.push(
        `${settings.shadowDistance}px ${settings.shadowDistance}px ${settings.shadowBlur}px rgba(0,0,0,${settings.shadowOpacity})`
      );
    }

    // INNER GLOW effect - tighter, more concentrated layers for cleaner look
    if (settings.glowEnabled) {
      const intensity = settings.glowIntensity / 100;
      const size = settings.glowSize;
      // Inner glow simulation - tighter layers with higher opacity near edges
      shadows.push(
        // Core inner glow (tight, high opacity)
        `0 0 ${size * 0.3}px ${settings.glowColor}`,
        `0 0 ${size * 0.5}px rgba(${hexToRgb(settings.glowColor)}, ${Math.min(intensity * 1.2, 1)})`,
        // Soft outer spread (reduced from before)
        `0 0 ${size * 0.8}px rgba(${hexToRgb(settings.glowColor)}, ${intensity * 0.5})`
      );
    }

    return shadows.length > 0 ? shadows.join(', ') : undefined;
  };

  const textStyle: React.CSSProperties = {
    fontSize: `${Math.max(settings.fontSize * 4, 24)}px`, // Larger preview
    color: settings.textColor,
    WebkitTextStroke: settings.strokeEnabled
      ? `${settings.strokeWidth}px ${settings.strokeColor}`
      : undefined,
    textShadow: buildTextShadow(),
    fontWeight: 900,
    fontFamily: settings.customFontUrl ? `'CustomUserFont', sans-serif` : `"${settings.fontFamily}", sans-serif`,
    transition: "all 0.2s ease",
    letterSpacing: "0.02em",
  };

  const getAnimationClass = () => {
    switch (settings.style) {
      case "bounce": return "animate-bounce-preview";
      case "highlight": return "animate-pulse";
      case "karaoke": return "animate-karaoke";
      case "typewriter": return "animate-typewriter";
      case "wave": return "animate-wave";
      case "shake": return "animate-shake";
      case "zoom": return "animate-zoom";
      case "slide": return "animate-slide-in";
      case "glow": return "animate-glow";
      case "pop": return "animate-pop";
      case "elastic": return "animate-elastic";
      case "slam": return "animate-slam";
      case "glitch": return "animate-glitch-text";
      case "wobble": return "animate-wobble";
      case "flip": return "animate-flip";
      case "blur-in": return "animate-blur-in";
      case "drop": return "animate-drop";
      case "spin-in": return "animate-spin-in";
      case "scale-rotate": return "animate-scale-rotate";
      case "stomp": return "animate-stomp";
      case "jitter": return "animate-jitter";
      case "swing": return "animate-swing";
      case "flash": return "animate-flash";
      case "rubberband": return "animate-rubberband";
      case "heartbeat": return "animate-heartbeat";
      case "explode": return "animate-explode";
      // NEW animations
      case "punch": return "animate-punch";
      case "smash": return "animate-smash";
      case "crash": return "animate-crash";
      case "float": return "animate-float";
      case "drift": return "animate-drift";
      case "morph": return "animate-morph";
      case "spark": return "animate-spark";
      case "pulse-grow": return "animate-pulse-grow";
      case "ripple": return "animate-ripple";
      case "cinematic": return "animate-cinematic";
      case "spotlight": return "animate-spotlight";
      case "soft-pop": return "animate-soft-pop";
      default: return "";
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 flex items-center justify-center min-h-[120px] overflow-hidden border border-border/30 relative">
      {/* Background pattern for better visibility */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_hsl(var(--primary)/0.1),_transparent_50%)]" />
      </div>
      <span className={cn("relative z-10", getAnimationClass())} style={textStyle}>
        {/* Inner glow overlay layer — sits on top of the base text */}
        {/* Inner glow overlay layers — multiple layers for "powerful" volumetric look */}
        {settings.innerGlowEnabled ? (
          <>
            {/* Layer 0: Base Foundation (Bottom) - Sharp Stroke/Shadow */}
            <span style={textStyle}>Sample Text</span>

            {/* Layer 1: Volumetric Glow (Middle) - Blurred and slightly larger */}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                ...textStyle,
                color: settings.innerGlowColor,
                WebkitTextStroke: `4px ${settings.innerGlowColor}`,
                textShadow: 'none',
                opacity: (settings.innerGlowIntensity / 100) * 0.9,
                filter: `blur(${Math.max(2, (settings.innerGlowSize || 10) * 0.6)}px)`,
              }}
            >
              Sample Text
            </span>

            {/* Layer 2: Punchy Body (Top) - Opaque sharp text with NO stroke/shadow */}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                ...textStyle,
                WebkitTextStroke: 'none',
                textShadow: 'none',
              }}
            >
              Sample Text
            </span>
          </>
        ) : (
          "Sample Text"
        )}
      </span>
    </div>
  );
};

// Helper to convert hex to rgb
const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return "255, 255, 255";
};

const PresetEditorForm = ({
  presetSettings,
  setPresetSettings,
}: {
  presetSettings: SubtitleSettings;
  setPresetSettings: React.Dispatch<React.SetStateAction<SubtitleSettings>>;
}) => {
  const [customFonts, setCustomFonts] = useState<any[]>([]);

  const fetchCustomFonts = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).from("user_fonts").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error('[CustomFont] Failed to fetch custom fonts:', error);
        return;
      }
      if (data && data.length > 0) {
        // Pre-generate signed URLs for each font so the dropdown and @font-face can use them reliably
        const fontsWithSignedUrls = await Promise.all(
          data.map(async (f: any) => {
            try {
              const { data: signedData, error: signError } = await supabase.storage
                .from('custom_fonts')
                .createSignedUrl(f.storage_path, 3600);
              if (signError) {
                console.warn(`[CustomFont] Failed to create signed URL for font ${f.id}:`, signError);
                return { ...f, signedUrl: null };
              }
              return { ...f, signedUrl: signedData?.signedUrl || null };
            } catch (err) {
              console.warn(`[CustomFont] Exception creating signed URL for font ${f.id}:`, err);
              return { ...f, signedUrl: null };
            }
          })
        );
        console.log(`[CustomFont] Loaded ${fontsWithSignedUrls.length} custom fonts`);
        setCustomFonts(fontsWithSignedUrls);
      } else {
        console.log('[CustomFont] No custom fonts found');
        setCustomFonts([]);
      }
    } catch (e) {
      console.error('[CustomFont] Exception fetching custom fonts:', e);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomFonts();
  }, [fetchCustomFonts]);

  // Helper to get effective font URL from font_id or signed URL
  // FIX: Handle race condition where customFonts hasn't loaded yet but customFontUrl is set
  const getEffectiveFontUrl = useCallback((customFontUrl: string | undefined): string | undefined => {
    if (!customFontUrl) return undefined;
    if (customFontUrl.startsWith('http')) return customFontUrl;
    if (customFontUrl.startsWith('font:')) {
      const fontId = customFontUrl.slice(5);
      // If customFonts hasn't loaded yet, return undefined (will be resolved when fonts load)
      if (customFonts.length === 0) {
        console.log(`[CustomFont] getEffectiveFontUrl: customFonts not loaded yet, font ID: ${fontId}`);
        return undefined;
      }
      const font = customFonts.find(f => f.id === fontId);
      if (font?.signedUrl) return font.signedUrl;
      console.warn(`[CustomFont] getEffectiveFontUrl: Font ${fontId} found but no signedUrl:`, font);
    }
    return undefined;
  }, [customFonts]);

  const updatePreset = <K extends keyof SubtitleSettings>(key: K, value: SubtitleSettings[K]) => {
    setPresetSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePrfpsetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const tracks = parsePrfpset(text);
      if (tracks) {
        setPresetSettings(prev => ({
          ...prev,
          style: 'custom',
          customAnimation: tracks
        }));
        toast.success(`Imported animation from "${file.name}"`);
      } else {
        toast.error("Failed to parse preset. Ensure it is a valid Premiere Pro .prfpset file.");
      }
    } catch (err) {
      console.error("[PrfpsetImport] Error reading file:", err);
      toast.error("Error reading file.");
    } finally {
      // Clear input
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Animation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Animation</Label>
          <div>
            <input
              type="file"
              id="prfpset-upload"
              className="hidden"
              accept=".prfpset,.xml"
              onChange={handlePrfpsetImport}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-primary px-2"
              onClick={() => document.getElementById('prfpset-upload')?.click()}
            >
              <FileUp className="w-3 h-3 mr-1" /> Import .prfpset
            </Button>
          </div>
        </div>
        <Select value={presetSettings.style} onValueChange={(v) => {
          updatePreset("style", v);
        }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIMATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <div className="flex items-center gap-2">
                  <AnimationPreview styleId={opt.id} isActive />
                  <span>{opt.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Transition */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Clip Transition</Label>
          {presetSettings.transition === "suit" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2">
                  <Plus className="w-3 h-3 mr-1" /> Configure Suit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Transition Suit</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Select the transitions you want in your suit. The AI will alternate between them.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {TRANSITION_OPTIONS.filter(opt => opt.id !== 'suit' && opt.id !== 'none').map(opt => {
                      const isSelected = presetSettings.transitionSuit?.includes(opt.id) || false;
                      return (
                        <Button
                          key={opt.id}
                          variant={isSelected ? "default" : "outline"}
                          className="h-auto py-2 flex flex-col items-center gap-1"
                          onClick={() => {
                            const current = presetSettings.transitionSuit || [];
                            const next = isSelected 
                              ? current.filter(id => id !== opt.id)
                              : [...current, opt.id];
                            updatePreset("transitionSuit", next);
                          }}
                        >
                          <TransitionPreview transitionId={opt.id} isActive />
                          <span className="text-[10px]">{opt.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {}}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <Select value={presetSettings.transition} onValueChange={(v) => updatePreset("transition", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSITION_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <div className="flex items-center gap-2">
                  <TransitionPreview transitionId={opt.id} isActive />
                  <span>{opt.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">- {opt.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Font Family */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Font</Label>
          <Dialog onOpenChange={(open) => { if (!open) fetchCustomFonts(); }}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2">
                <Plus className="w-3 h-3 mr-1" /> Manage Custom
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Manage Custom Fonts</DialogTitle>
              </DialogHeader>
              <FontManager />
            </DialogContent>
          </Dialog>
        </div>
        <Select
          value={presetSettings.customFontUrl ? `custom:${presetSettings.customFontUrl}` : presetSettings.fontFamily}
          onValueChange={(v) => {
            if (v.startsWith('custom:')) {
              const fontRef = v.slice(7);
              let selectedFont;
              if (fontRef.startsWith('font:')) {
                const fontId = fontRef.slice(5);
                selectedFont = customFonts.find(f => f.id === fontId);
              } else {
                selectedFont = customFonts.find(f => f.signedUrl === fontRef || f.storage_path === fontRef);
              }
              const newFontRef = selectedFont ? `font:${selectedFont.id}` : fontRef;
              setPresetSettings(prev => ({ ...prev, customFontUrl: newFontRef, fontFamily: selectedFont?.font_name || "Custom Font" }));
            } else {
              setPresetSettings(prev => ({ ...prev, fontFamily: v, customFontUrl: undefined }));
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            {presetSettings.customFontUrl && customFonts.length === 0 && (
              <SelectItem value={`custom:${presetSettings.customFontUrl}`}>
                <span className="font-medium text-primary">{presetSettings.fontFamily || "Custom Font"}</span>
              </SelectItem>
            )}
            {customFonts.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <FileType className="w-3 h-3" /> Your Fonts
                </div>
                {customFonts.map(f => (
                  <SelectItem key={f.id} value={`custom:font:${f.id}`}>
                    <span className="font-medium text-primary">{f.font_name}</span>
                  </SelectItem>
                ))}
                <div className="h-px bg-border my-1" />
              </>
            )}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">System Fonts</div>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                <span style={{ fontFamily: `"${font.id}", sans-serif` }}>{font.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Text Size */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label>Text Size</Label>
          <span className="text-xs text-muted-foreground">{presetSettings.fontSize} vmin</span>
        </div>
        <Slider
          value={[presetSettings.fontSize]}
          onValueChange={([v]) => updatePreset("fontSize", v)}
          min={3}
          max={25}
          step={0.5}
        />
      </div>

      {/* Text Color */}
      <ColorPicker label="Text Color" value={presetSettings.textColor} onChange={(c) => updatePreset("textColor", c)} />

      {/* Stroke */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label>Stroke</Label>
          <Switch checked={presetSettings.strokeEnabled} onCheckedChange={(v) => updatePreset("strokeEnabled", v)} />
        </div>
        {presetSettings.strokeEnabled && (
          <>
            <ColorPicker label="Stroke Color" value={presetSettings.strokeColor} onChange={(c) => updatePreset("strokeColor", c)} />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Thickness</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.strokeWidth}px</span>
              </div>
              <Slider
                value={[presetSettings.strokeWidth]}
                onValueChange={([v]) => updatePreset("strokeWidth", v)}
                min={0.5}
                max={5}
                step={0.5}
              />
            </div>
          </>
        )}
      </div>

      {/* Shadow */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label>Shadow</Label>
          <Switch checked={presetSettings.shadowEnabled} onCheckedChange={(v) => updatePreset("shadowEnabled", v)} />
        </div>
        {presetSettings.shadowEnabled && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Opacity</Label>
                <span className="text-xs text-muted-foreground">{Math.round(presetSettings.shadowOpacity * 100)}%</span>
              </div>
              <Slider
                value={[presetSettings.shadowOpacity]}
                onValueChange={([v]) => updatePreset("shadowOpacity", v)}
                min={0}
                max={1}
                step={0.05}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Blur</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.shadowBlur}px</span>
              </div>
              <Slider
                value={[presetSettings.shadowBlur]}
                onValueChange={([v]) => updatePreset("shadowBlur", v)}
                min={0}
                max={20}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Distance</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.shadowDistance}px</span>
              </div>
              <Slider
                value={[presetSettings.shadowDistance]}
                onValueChange={([v]) => updatePreset("shadowDistance", v)}
                min={0}
                max={15}
                step={1}
              />
            </div>
          </>
        )}
      </div>

      {/* Glow Effect */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Glow Effect
          </Label>
          <Switch checked={presetSettings.glowEnabled} onCheckedChange={(v) => updatePreset("glowEnabled", v)} />
        </div>
        {presetSettings.glowEnabled && (
          <>
            <ColorPicker label="Glow Color" value={presetSettings.glowColor} onChange={(c) => updatePreset("glowColor", c)} />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Intensity</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.glowIntensity}%</span>
              </div>
              <Slider
                value={[presetSettings.glowIntensity]}
                onValueChange={([v]) => updatePreset("glowIntensity", v)}
                min={10}
                max={100}
                step={5}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Size</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.glowSize}px</span>
              </div>
              <Slider
                value={[presetSettings.glowSize]}
                onValueChange={([v]) => updatePreset("glowSize", v)}
                min={5}
                max={50}
                step={5}
              />
            </div>
          </>
        )}
      </div>

      {/* Inner Glow Effect */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Inner Glow
          </Label>
          <Switch checked={presetSettings.innerGlowEnabled} onCheckedChange={(v) => updatePreset("innerGlowEnabled", v)} />
        </div>
        {presetSettings.innerGlowEnabled && (
          <>
            <ColorPicker label="Inner Glow Color" value={presetSettings.innerGlowColor} onChange={(c) => updatePreset("innerGlowColor", c)} />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Intensity</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.innerGlowIntensity}%</span>
              </div>
              <Slider
                value={[presetSettings.innerGlowIntensity]}
                onValueChange={([v]) => updatePreset("innerGlowIntensity", v)}
                min={10}
                max={100}
                step={5}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Size / Blur</Label>
                <span className="text-xs text-muted-foreground">{presetSettings.innerGlowSize || 10}px</span>
              </div>
              <Slider
                value={[presetSettings.innerGlowSize || 10]}
                onValueChange={([v]) => updatePreset("innerGlowSize", v)}
                min={1}
                max={50}
                step={1}
              />
            </div>
          </>
        )}
      </div>

      {/* Words Per Line */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex justify-between">
          <Label>Words Per Line</Label>
          <span className="text-xs text-muted-foreground">
            {presetSettings.wordsPerLine === 0 ? "Auto" : `${presetSettings.wordsPerLine} words`}
          </span>
        </div>
        <Slider
          value={[presetSettings.wordsPerLine]}
          onValueChange={([v]) => updatePreset("wordsPerLine", v)}
          min={0}
          max={10}
          step={1}
        />
        <p className="text-[10px] text-muted-foreground">
          0 = Automatic (based on timing). Set to 3 for "3 words by 3 words" style.
        </p>
      </div>

      {/* Vertical Position */}
      <div className="space-y-2 border-t pt-3">
        <Label className="text-xs text-muted-foreground">Vertical Position</Label>
        <Select
          value={presetSettings.verticalPosition || "higher"}
          onValueChange={(v) => updatePreset("verticalPosition", v as "higher" | "middle")}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="higher">Higher (Top 35%)</SelectItem>
            <SelectItem value="middle">Middle (Center 50%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="border-t pt-3">
        <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
        <LivePreview settings={presetSettings} />
      </div>
    </div>
  );
};

// Create Preset Dialog
const CreatePresetDialog = ({
  currentSettings,
  onSave,
}: {
  currentSettings: SubtitleSettings;
  onSave: (name: string, settings: SubtitleSettings) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [presetSettings, setPresetSettings] = useState<SubtitleSettings>(currentSettings);

  const handleOpen = () => {
    setPresetSettings(currentSettings);
    setName("");
    setOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a preset name");
      return;
    }
    onSave(name.trim(), presetSettings);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1" onClick={handleOpen}>
          <Plus className="h-4 w-4 mr-2" />
          Create Preset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Subtitle Preset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Preset Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Style"
            />
          </div>

          <PresetEditorForm presetSettings={presetSettings} setPresetSettings={setPresetSettings} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Edit Preset Dialog
const EditPresetDialog = ({
  preset,
  onSave,
  onDelete,
}: {
  preset: SubtitlePreset;
  onSave: (id: string, name: string, settings: SubtitleSettings) => void;
  onDelete: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(preset.name);
  const [presetSettings, setPresetSettings] = useState<SubtitleSettings>(preset.settings);

  const handleOpen = () => {
    setPresetSettings(preset.settings);
    setName(preset.name);
    setOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a preset name");
      return;
    }
    onSave(preset.id, name.trim(), presetSettings);
    setOpen(false);
  };

  const handleDelete = () => {
    onDelete(preset.id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleOpen}>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Preset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Preset Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Style"
            />
          </div>

          <PresetEditorForm presetSettings={presetSettings} setPresetSettings={setPresetSettings} />
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="destructive" onClick={handleDelete} className="mr-auto">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// SFX Library item type
interface SfxItem {
  id: string;
  name: string;
  file_url: string;
}

export const defaultSubtitleSettings: SubtitleSettings = {
  style: "static",
  bounceRate: 1.0,
  fontSize: 6,
  fontFamily: "Bungee",
  textColor: "#ffffff",
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowEnabled: true,
  shadowOpacity: 0.8,
  shadowBlur: 6,
  shadowDistance: 4,
  glowEnabled: false,
  glowColor: "#00ff88",
  glowIntensity: 80,
  glowSize: 20,
  innerGlowEnabled: false,
  innerGlowColor: "#ffffff",
  innerGlowIntensity: 60,
  transition: "whip-pan",
  sfxVolume: 60, // Default 60% volume for SFX
  selectedSfxId: null, // null = random SFX from library
  visualModeEnabled: false, // AI rainbow keywords mode
  creativeModeEnabled: false, // Advanced AI editing features
  wordsPerLine: 0, // 0 = auto
  verticalPosition: "higher", // Default position
  server_logo_url: null,
  logoRecognitionEnabled: false,
  recognitionServerName: "",
  flashColor: "random",
};



export const SubtitleStyleCustomizer = ({
  settings,
  onSettingsChange,
  onSave,
  isSaving = false,
}: SubtitleStyleCustomizerProps) => {
  const [presets, setPresets] = useState<SubtitlePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [strokeOpen, setStrokeOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [glowOpen, setGlowOpen] = useState(false);
  const [innerGlowOpen, setInnerGlowOpen] = useState(false);
  const [animationOpen, setAnimationOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);

  // SFX Library state
  const [sfxList, setSfxList] = useState<SfxItem[]>([]);
  const [sfxLoading, setSfxLoading] = useState(false);
  const [playingSfxId, setPlayingSfxId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Custom fonts state
  const [customFonts, setCustomFonts] = useState<any[]>([]);

  const fetchCustomFonts = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).from("user_fonts").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error('[CustomFont] Failed to fetch custom fonts:', error);
        return;
      }
      if (data && data.length > 0) {
        // Pre-generate signed URLs for each font so the dropdown and @font-face can use them reliably
        const fontsWithSignedUrls = await Promise.all(
          data.map(async (f: any) => {
            try {
              const { data: signedData, error: signError } = await supabase.storage
                .from('custom_fonts')
                .createSignedUrl(f.storage_path, 3600);
              if (signError) {
                console.warn(`[CustomFont] Failed to create signed URL for font ${f.id}:`, signError);
                return { ...f, signedUrl: null };
              }
              return { ...f, signedUrl: signedData?.signedUrl || null };
            } catch (err) {
              console.warn(`[CustomFont] Exception creating signed URL for font ${f.id}:`, err);
              return { ...f, signedUrl: null };
            }
          })
        );
        console.log(`[CustomFont] Loaded ${fontsWithSignedUrls.length} custom fonts`);
        setCustomFonts(fontsWithSignedUrls);
      } else {
        console.log('[CustomFont] No custom fonts found');
        setCustomFonts([]);
      }
    } catch (e) {
      console.error('[CustomFont] Exception fetching custom fonts:', e);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomFonts();
  }, [fetchCustomFonts]);

  // Helper to get effective font URL from font_id or signed URL
  // FIX: Handle race condition where customFonts hasn't loaded yet but customFontUrl is set
  const getEffectiveFontUrl = useCallback((customFontUrl: string | undefined): string | undefined => {
    if (!customFontUrl) return undefined;
    if (customFontUrl.startsWith('http')) return customFontUrl;
    if (customFontUrl.startsWith('font:')) {
      const fontId = customFontUrl.slice(5);
      // If customFonts hasn't loaded yet, return undefined (will be resolved when fonts load)
      if (customFonts.length === 0) {
        console.log(`[CustomFont] getEffectiveFontUrl: customFonts not loaded yet, font ID: ${fontId}`);
        return undefined;
      }
      const font = customFonts.find(f => f.id === fontId);
      if (font?.signedUrl) return font.signedUrl;
      console.warn(`[CustomFont] getEffectiveFontUrl: Font ${fontId} found but no signedUrl:`, font);
    }
    return undefined;
  }, [customFonts]);

  // Dynamically load custom font via @font-face so the browser can render it
  useEffect(() => {
    if (!settings.customFontUrl) {
      console.log('[CustomFont] No customFontUrl set, skipping font load');
      return;
    }

    console.log('[CustomFont] Font load effect triggered:', { 
      customFontUrl: settings.customFontUrl, 
      customFontsCount: customFonts.length 
    });

    const styleId = 'custom-font-face-style';
    let existingStyle = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!existingStyle) {
      existingStyle = document.createElement('style');
      existingStyle.id = styleId;
      document.head.appendChild(existingStyle);
    }

    // Try to load with current URL first
    const loadFont = (url: string) => {
      console.log('[CustomFont] Loading font with URL:', url.substring(0, 80) + '...');
      existingStyle!.textContent = `@font-face { font-family: 'CustomUserFont'; src: url('${url}'); font-display: swap; }`;
    };

    const effectiveUrl = getEffectiveFontUrl(settings.customFontUrl);
    if (!effectiveUrl) {
      console.log('[CustomFont] Could not resolve effective URL for:', settings.customFontUrl);
      return;
    }
    console.log('[CustomFont] Resolved effective URL:', effectiveUrl.substring(0, 80) + '...');
    loadFont(effectiveUrl);

    // If the URL is a Supabase storage URL (contains /storage/v1/object/), try to use a signed URL instead
    // to ensure the font loads correctly even if the bucket is not public
    const loadSignedFont = async () => {
      const fontUrl = effectiveUrl;
      if (!fontUrl) return;

      try {
        let signedUrl = fontUrl;

        // If it's a public Supabase URL, convert to signed
        if (fontUrl.includes('/storage/v1/object/public/')) {
          const parts = fontUrl.split('/storage/v1/object/public/');
          if (parts.length > 1) {
            const subParts = parts[1].split('/');
            const bucketName = subParts[0];
            const filePath = decodeURIComponent(parts[1].substring(bucketName.length + 1));
            const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(filePath, 3600);
            if (error) {
              console.warn('[CustomFont] Error creating signed URL:', error);
            }
            if (data?.signedUrl) {
              signedUrl = data.signedUrl;
            }
          }
        } else if (!fontUrl.startsWith('http')) {
          // It's a storage path, sign it directly
          const { data, error } = await supabase.storage.from('custom_fonts').createSignedUrl(fontUrl, 3600);
          if (error) {
            console.warn('[CustomFont] Error creating signed URL from path:', error);
          }
          if (data?.signedUrl) {
            signedUrl = data.signedUrl;
          }
        }

        // Only reload if we got a different (signed) URL
        if (signedUrl !== fontUrl) {
          console.log('[CustomFont] Loading font with signed URL:', signedUrl.substring(0, 80) + '...');
          loadFont(signedUrl);
        }
      } catch (err) {
        console.warn('[CustomFont] Could not generate signed URL, using original:', err);
      }
    };

    // Attempt to use signed URL for better reliability
    loadSignedFont();
  }, [settings.customFontUrl, supabase, customFonts, getEffectiveFontUrl]);

  // Fetch presets
  useEffect(() => {
    const fetchPresets = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('subtitle_presets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPresets(data.map(p => ({
          id: p.id,
          name: p.name,
          settings: {
            ...defaultSubtitleSettings,
            ...(p.settings as unknown as SubtitleSettings),
          },
        })));
      }
    };
    fetchPresets();
  }, []);

  // Fetch SFX library
  useEffect(() => {
    const fetchSfx = async () => {
      setSfxLoading(true);
      const { data, error } = await supabase
        .from('sfx_library')
        .select('id, name, file_url')
        .order('name', { ascending: true });

      if (!error && data) {
        setSfxList(data);
      }
      setSfxLoading(false);
    };
    fetchSfx();
  }, []);

  const updateSetting = useCallback(
    <K extends keyof SubtitleSettings>(key: K, value: SubtitleSettings[K]) => {
      setSelectedPresetId(null); // Deselect preset on manual change
      const newSettings = { ...settings, [key]: value };
      onSettingsChange(newSettings);
    },
    [settings, onSettingsChange]
  );

  const handlePrfpsetMainImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const tracks = parsePrfpset(text);
      if (tracks) {
        setSelectedPresetId(null);
        const newSettings = {
          ...settings,
          style: 'custom',
          customAnimation: tracks
        };
        onSettingsChange(newSettings);
        toast.success(`Imported animation from "${file.name}"`);
      } else {
        toast.error("Failed to parse preset. Ensure it is a valid Premiere Pro .prfpset file.");
      }
    } catch (err) {
      console.error("[PrfpsetImport] Error reading file:", err);
      toast.error("Error reading file.");
    } finally {
      e.target.value = '';
    }
  };

  // Play/stop SFX preview
  const handlePlaySfx = async (sfx: SfxItem) => {
    if (playingSfxId === sfx.id) {
      audioRef.current?.pause();
      setPlayingSfxId(null);
      return;
    }

    try {
      const { data } = await supabase.storage
        .from("voiceovers")
        .createSignedUrl(sfx.file_url, 60);

      if (data?.signedUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(data.signedUrl);
        audioRef.current.volume = Math.min(settings.sfxVolume / 100, 1);
        audioRef.current.onended = () => setPlayingSfxId(null);
        audioRef.current.play();
        setPlayingSfxId(sfx.id);
      }
    } catch (error) {
      console.error("Play SFX error:", error);
    }
  };

  // Get selected SFX name
  const selectedSfxName = settings.selectedSfxId
    ? sfxList.find(s => s.id === settings.selectedSfxId)?.name || "Unknown"
    : "Random";

  const handlePresetSelect = (presetId: string) => {
    if (presetId === "custom") {
      setSelectedPresetId(null);
      return;
    }
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSelectedPresetId(presetId);
      onSettingsChange(preset.settings);
    }
  };

  const handleCreatePreset = async (name: string, presetSettings: SubtitleSettings) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please log in to save presets");
      return;
    }

    const { data, error } = await supabase
      .from('subtitle_presets')
      .insert([{
        user_id: user.id,
        name,
        settings: JSON.parse(JSON.stringify(presetSettings)),
      }])
      .select()
      .single();

    if (error) {
      toast.error("Failed to save preset");
      return;
    }

    const newPreset: SubtitlePreset = {
      id: data.id,
      name: data.name,
      settings: { ...defaultSubtitleSettings, ...(data.settings as unknown as SubtitleSettings) },
    };
    setPresets(prev => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
    onSettingsChange(newPreset.settings);
    toast.success("Preset saved!");
  };

  const handleEditPreset = async (id: string, name: string, presetSettings: SubtitleSettings) => {
    const { error } = await supabase
      .from('subtitle_presets')
      .update({
        name,
        settings: JSON.parse(JSON.stringify(presetSettings)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      toast.error("Failed to update preset");
      return;
    }

    setPresets(prev => prev.map(p => p.id === id ? { ...p, name, settings: presetSettings } : p));
    if (selectedPresetId === id) {
      onSettingsChange(presetSettings);
    }
    toast.success("Preset updated!");
  };

  const handleDeletePreset = async (presetId: string) => {
    const { error } = await supabase
      .from('subtitle_presets')
      .delete()
      .eq('id', presetId);

    if (error) {
      toast.error("Failed to delete preset");
      return;
    }

    setPresets(prev => prev.filter(p => p.id !== presetId));
    if (selectedPresetId === presetId) {
      setSelectedPresetId(null);
    }
    toast.success("Preset deleted");
  };

  const currentStyleLabel = ANIMATION_OPTIONS.find(a => a.id === settings.style)?.name || "Static";
  const currentTransitionLabel = TRANSITION_OPTIONS.find(t => t.id === settings.transition)?.name || "Fade";
  const selectedPreset = presets.find(p => p.id === selectedPresetId);

  return (
    <Card className="glass-effect">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Subtitle Styling</CardTitle>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={isSaving}
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-white/5 hover:bg-white/10"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset Selection */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Preset</Label>
          <div className="flex gap-2">
            <Select value={selectedPresetId || "custom"} onValueChange={handlePresetSelect}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Custom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                {presets.map(preset => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset && (
              <EditPresetDialog
                preset={selectedPreset}
                onSave={handleEditPreset}
                onDelete={handleDeletePreset}
              />
            )}
          </div>
          <div className="flex gap-2">
            <CreatePresetDialog currentSettings={settings} onSave={handleCreatePreset} />
            <input
              type="file"
              id="prtextstyle-upload"
              className="hidden"
              accept=".prtextstyle,.xml,.*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  toast.error("No file selected.");
                  return;
                }
                console.log("Attempting to import file:", file.name, file.type);
                try {
                  const text = await file.text();
                  if (!text.includes("<PremiereData")) {
                    toast.error("This doesn't look like a Premiere Pro file.");
                    return;
                  }
                  const result = parsePrtextstyle(text);
                  if (result && result.settings) {
                    const fullSettings = {
                      ...settings,
                      ...result.settings
                    };
                    onSettingsChange(fullSettings);
                    
                    // Automatically save to the preset list so it appears in the dropdown
                    await handleCreatePreset(result.name || file.name.split('.')[0], fullSettings);
                    
                    toast.success(`Style "${result.name}" imported and added to your presets!`);
                  } else {
                    toast.error("Failed to parse the text style. Please ensure it is a valid .prtextstyle file.");
                  }
                } catch (err) {
                  console.error("Import error details:", err);
                  toast.error("Error reading style file: " + (err instanceof Error ? err.message : "Unknown error"));
                } finally {
                  e.target.value = '';
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="flex-1 bg-white/5 hover:bg-white/10"
              onClick={() => document.getElementById('prtextstyle-upload')?.click()}
            >
              <FileUp className="h-4 w-4 mr-2" />
              Import Preset
            </Button>
          </div>
        </div>

        {/* Recommended Styles */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-[#b638fc]">Neural Styles</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-14 flex flex-col items-center justify-center gap-1 border-2 border-primary/20 hover:border-primary bg-primary/5 group transition-all"
              onClick={() => {
                onSettingsChange({
                  ...settings,
                  fontFamily: "Montserrat",
                  textColor: "#FFFFFF",
                  strokeEnabled: true,
                  strokeColor: "#000000",
                  strokeWidth: 5,
                  shadowEnabled: true,
                  shadowOpacity: 1.0,
                  shadowBlur: 0,
                  shadowDistance: 4,
                  style: "zoom",
                  glowEnabled: false,
                  innerGlowEnabled: false,
                  fontSize: 11,
                  wordsPerLine: 1,
                  visualModeEnabled: false,
                  fontWeight: 900,
                });
                toast.success("Viral Minimalist style applied!");
              }}
            >
              <div 
                className="text-[12px] font-black text-white" 
                style={{ 
                  fontFamily: 'Montserrat', 
                  fontWeight: 900,
                  WebkitTextStroke: '2.5px black',
                  textShadow: '3px 3px 0 black, 3px 3px 0 black'
                }}
              >
                anyone
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground group-hover:text-primary transition-colors">Viral Minimalist</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="h-14 flex flex-col items-center justify-center gap-1 border-border hover:border-[#ffd700] bg-muted/20 group transition-all"
              onClick={() => {
                onSettingsChange({
                  ...settings,
                  fontFamily: "Bungee",
                  textColor: "#ffd700",
                  strokeEnabled: true,
                  strokeColor: "#000000",
                  strokeWidth: 2.5,
                  shadowEnabled: true,
                  shadowOpacity: 0.8,
                  shadowBlur: 10,
                  shadowDistance: 5,
                  style: "bounce",
                  glowEnabled: true,
                  glowColor: "#ffd700",
                  glowIntensity: 40,
                  glowSize: 12,
                });
                toast.success("Legendary Gaming style applied!");
              }}
            >
              <div 
                className="text-[10px] font-black text-[#ffd700]" 
                style={{ 
                  fontFamily: 'Bungee', 
                  WebkitTextStroke: '0.5px black',
                  textShadow: '2px 2px 0 black'
                }}
              >
                VICTORY
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground group-hover:text-[#ffd700] transition-colors">Legendary</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-14 flex flex-col items-center justify-center gap-1 border-border hover:border-white/50 bg-muted/20 group transition-all"
              onClick={() => {
                onSettingsChange({
                  ...settings,
                  fontFamily: "Montserrat",
                  textColor: "#FFFFFF",
                  strokeEnabled: true,
                  strokeColor: "#000000",
                  strokeWidth: 1.5,
                  shadowEnabled: true,
                  shadowOpacity: 0.8,
                  shadowBlur: 4,
                  shadowDistance: 2.5,
                  style: "zoom",
                  glowEnabled: false,
                  innerGlowEnabled: false,
                  fontSize: 7,
                  wordsPerLine: 1,
                  visualModeEnabled: false,
                  fontWeight: 900,
                });
                toast.success("'tok' style applied!");
              }}
            >
              <div 
                className="text-[12px] font-black text-white" 
                style={{ 
                  fontFamily: 'Montserrat', 
                  fontWeight: 900,
                  WebkitTextStroke: '0.8px black',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                }}
              >
                tok
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground group-hover:text-white transition-colors">Clean Cinematic</span>
            </Button>
          </div>
        </div>

        {/* Recommended Presets */}


        {/* Transition Dropdown */}
        <Collapsible open={transitionOpen} onOpenChange={setTransitionOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="flex-1 justify-between">
                <span className="flex items-center gap-2">
                  <Shuffle className="h-4 w-4" />
                  Transition: {currentTransitionLabel}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", transitionOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            
            {settings.transition === "suit" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 px-3 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Transition Suit</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                      Select the transitions you want in your suit. The AI will alternate between them.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {TRANSITION_OPTIONS.filter(opt => opt.id !== 'suit' && opt.id !== 'none').map(opt => {
                        const isSelected = settings.transitionSuit?.includes(opt.id) || false;
                        return (
                          <Button
                            key={opt.id}
                            variant={isSelected ? "default" : "outline"}
                            className="h-auto py-2 flex flex-col items-center gap-1"
                            onClick={() => {
                              const current = settings.transitionSuit || [];
                              const next = isSelected 
                                ? current.filter(id => id !== opt.id)
                                : [...current, opt.id];
                              updateSetting("transitionSuit", next);
                            }}
                          >
                            <TransitionPreview transitionId={opt.id} isActive={isSelected} />
                            <span className="text-[10px]">{opt.name}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {}}>Close</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <CollapsibleContent className="pt-3 space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {TRANSITION_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, transition: option.id })}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                    settings.transition === option.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  <TransitionPreview transitionId={option.id} isActive={settings.transition === option.id} color={settings.flashColor} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2">
                      {option.name}
                      {settings.transition === option.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate italic">
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {settings.transition === 'flash' && (
              <div className="mt-4 p-4 rounded-2xl bg-muted/40 border border-border space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-primary" />
                    Flash Transition Color
                  </Label>
                  {settings.flashColor === 'random' && (
                    <div className="px-2 py-0.5 rounded-full bg-primary/20 text-[9px] font-black text-primary animate-pulse">
                      RANDOM ACTIVE
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-6 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettingsChange({ ...settings, flashColor: 'random' })}
                    className={cn(
                      "aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all",
                      settings.flashColor === 'random'
                        ? "border-primary bg-primary/10"
                        : "border-dashed border-muted-foreground/30 hover:border-primary/50"
                    )}
                  >
                    <Shuffle className={cn("w-4 h-4", settings.flashColor === 'random' ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[8px] font-bold">RANDOM</span>
                  </button>

                  {FLASH_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => onSettingsChange({ ...settings, flashColor: color.hex })}
                      className={cn(
                        "aspect-square rounded-lg border-2 transition-all relative group",
                        settings.flashColor === color.hex
                          ? "border-primary scale-110 shadow-lg shadow-primary/20"
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    >
                      {settings.flashColor === color.hex && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* SFX Settings - Always visible */}
        <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              Transition SFX
            </Label>
            <span className={cn(
              "text-sm font-medium px-2 py-0.5 rounded",
              settings.sfxVolume > 100
                ? "text-orange-400 bg-orange-400/10"
                : settings.sfxVolume === 0
                  ? "text-muted-foreground bg-muted"
                  : "text-foreground"
            )}>
              {settings.sfxVolume}%{settings.sfxVolume > 100 && " ⚡"}
            </span>
          </div>

          {/* SFX Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-muted-foreground">Sound Effect</Label>
              <Button 
                variant="link" 
                size="sm" 
                onClick={() => window.open('/sfx-library', '_blank')}
                className="h-auto p-0 text-[10px] text-primary hover:text-primary/80 font-black uppercase tracking-widest"
              >
                Manage Library
              </Button>
            </div>
            <Select
              value={settings.selectedSfxId || "random"}
              onValueChange={(v) => updateSetting("selectedSfxId", v === "random" ? null : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Random" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">
                  <span className="flex items-center gap-2">
                    <Shuffle className="h-3.5 w-3.5" />
                    Random (rotate through all)
                  </span>
                </SelectItem>
                {sfxLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : sfxList.length === 0 ? (
                  <SelectItem value="empty" disabled>No SFX in library</SelectItem>
                ) : (
                  sfxList.map((sfx) => (
                    <SelectItem key={sfx.id} value={sfx.id}>
                      {sfx.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Play preview button for selected SFX */}
          {settings.selectedSfxId && sfxList.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => {
                const sfx = sfxList.find(s => s.id === settings.selectedSfxId);
                if (sfx) handlePlaySfx(sfx);
              }}
            >
              {playingSfxId === settings.selectedSfxId ? (
                <>
                  <Pause className="h-3 w-3 mr-1.5" />
                  Stop Preview
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1.5" />
                  Preview "{selectedSfxName}"
                </>
              )}
            </Button>
          )}

          {/* Volume Slider */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-muted-foreground">Volume</Label>
            <Slider
              value={[settings.sfxVolume]}
              onValueChange={([v]) => updateSetting("sfxVolume", v)}
              min={0}
              max={200}
              step={5}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground">
              0 = off, 100 = normal, 200 = max boost
            </p>
          </div>
        </div>

        {/* Animation Dropdown */}
        <Collapsible open={animationOpen} onOpenChange={setAnimationOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="flex-1 justify-between mr-2">
                <span className="flex items-center gap-2 text-xs">
                  <Sparkles className="h-4 w-4" />
                  Animation: {currentStyleLabel}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", animationOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <div>
              <input
                type="file"
                id="prfpset-main-upload"
                className="hidden"
                accept=".prfpset,.xml"
                onChange={handlePrfpsetMainImport}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-primary border border-primary/20 hover:bg-primary/10"
                onClick={() => document.getElementById('prfpset-main-upload')?.click()}
                title="Import Premiere Pro (.prfpset)"
              >
                <FileUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-2">
              {ANIMATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "flex flex-col items-center p-2 rounded-lg border-2 transition-all text-xs",
                    settings.style === opt.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => updateSetting("style", opt.id)}
                  onMouseEnter={(e) => e.currentTarget.querySelector('.anim-preview')?.classList.add('active')}
                  onMouseLeave={(e) => e.currentTarget.querySelector('.anim-preview')?.classList.remove('active')}
                >
                  <div className="h-6 flex items-center">
                    <AnimationPreview styleId={opt.id} isActive={settings.style === opt.id} />
                  </div>
                  <span className="font-medium">{opt.name}</span>
                </button>
              ))}
            </div>

            {settings.style === "bounce" && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">Bounce Intensity</Label>
                  <span className="text-xs text-muted-foreground">{settings.bounceRate.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[settings.bounceRate]}
                  onValueChange={([v]) => updateSetting("bounceRate", v)}
                  min={0.5}
                  max={2}
                  step={0.1}
                />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Text Settings */}
        <div className="space-y-3">
          {/* Font Family */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font</Label>
              <Dialog onOpenChange={(open) => { if (!open) fetchCustomFonts(); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2">
                    <Plus className="w-3 h-3 mr-1" /> Manage Custom
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Manage Custom Fonts</DialogTitle>
                  </DialogHeader>
                  <FontManager />
                </DialogContent>
              </Dialog>
            </div>
            <Select
              value={settings.customFontUrl ? `custom:${settings.customFontUrl}` : settings.fontFamily}
              onValueChange={(v) => {
                setSelectedPresetId(null);
                if (v.startsWith('custom:')) {
                  const fontRef = v.slice(7);
                  // fontRef can be either 'font:{id}' (new format) or a legacy signed URL
                  let selectedFont;
                  if (fontRef.startsWith('font:')) {
                    const fontId = fontRef.slice(5);
                    selectedFont = customFonts.find(f => f.id === fontId);
                  } else {
                    // Legacy: match by signed URL or storage path
                    selectedFont = customFonts.find(f => f.signedUrl === fontRef || f.storage_path === fontRef);
                  }
                  const newFontRef = selectedFont ? `font:${selectedFont.id}` : fontRef;
                  onSettingsChange({ ...settings, customFontUrl: newFontRef, fontFamily: selectedFont?.font_name || "Custom Font" });
                } else {
                  onSettingsChange({ ...settings, fontFamily: v, customFontUrl: undefined });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent>
                {/* Show currently selected custom font even if customFonts hasn't loaded yet */}
                {settings.customFontUrl && customFonts.length === 0 && (
                  <SelectItem value={`custom:${settings.customFontUrl}`}>
                    <span className="font-medium text-primary flex items-center gap-1">
                      <FileType className="w-3 h-3" /> {settings.fontFamily || "Custom Font"}
                    </span>
                  </SelectItem>
                )}
                {customFonts.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <FileType className="w-3 h-3" /> Your Fonts
                    </div>
                    {customFonts.map(f => (
                      <SelectItem key={f.id} value={`custom:font:${f.id}`}>
                        <span className="font-medium text-primary">{f.font_name}</span>
                      </SelectItem>
                    ))}
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">System Fonts</div>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font.id} value={font.id}>
                    <span style={{ fontFamily: `"${font.id}", sans-serif` }}>{font.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Text Size</Label>
              <span className="text-xs text-muted-foreground">{settings.fontSize} vmin</span>
            </div>
            <Slider
              value={[settings.fontSize]}
              onValueChange={([v]) => updateSetting("fontSize", v)}
              min={3}
              max={25}
              step={0.5}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Vertical Position</Label>
            <Select
              value={settings.verticalPosition || "higher"}
              onValueChange={(v) => updateSetting("verticalPosition", v as "higher" | "middle")}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="higher">Higher (Top 35%)</SelectItem>
                <SelectItem value="middle">Middle (Center 50%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ColorPicker
            label="Text Color"
            value={settings.textColor}
            onChange={(c) => updateSetting("textColor", c)}
          />
        </div>

        {/* Stroke Dropdown */}
        <Collapsible open={strokeOpen} onOpenChange={setStrokeOpen}>
          <div
            className="flex items-center justify-between w-full px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => setStrokeOpen(!strokeOpen)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              Stroke
              {settings.strokeEnabled && (
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.strokeColor }} />
              )}
            </span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.strokeEnabled}
                onCheckedChange={(v) => updateSetting("strokeEnabled", v)}
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown className={cn("h-4 w-4 transition-transform", strokeOpen && "rotate-180")} />
            </div>
          </div>
          <CollapsibleContent className="pt-3 space-y-3">
            {settings.strokeEnabled && (
              <>
                <ColorPicker
                  label="Stroke Color"
                  value={settings.strokeColor}
                  onChange={(c) => updateSetting("strokeColor", c)}
                />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Thickness</Label>
                    <span className="text-xs text-muted-foreground">{settings.strokeWidth}px</span>
                  </div>
                  <Slider
                    value={[settings.strokeWidth]}
                    onValueChange={([v]) => updateSetting("strokeWidth", v)}
                    min={0.5}
                    max={5}
                    step={0.5}
                  />
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Shadow Dropdown */}
        <Collapsible open={shadowOpen} onOpenChange={setShadowOpen}>
          <div
            className="flex items-center justify-between w-full px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => setShadowOpen(!shadowOpen)}
          >
            <span className="text-sm font-medium">Shadow</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.shadowEnabled}
                onCheckedChange={(v) => updateSetting("shadowEnabled", v)}
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown className={cn("h-4 w-4 transition-transform", shadowOpen && "rotate-180")} />
            </div>
          </div>
          <CollapsibleContent className="pt-3 space-y-3">
            {settings.shadowEnabled && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Opacity</Label>
                    <span className="text-xs text-muted-foreground">{Math.round(settings.shadowOpacity * 100)}%</span>
                  </div>
                  <Slider
                    value={[settings.shadowOpacity]}
                    onValueChange={([v]) => updateSetting("shadowOpacity", v)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Blur</Label>
                    <span className="text-xs text-muted-foreground">{settings.shadowBlur}px</span>
                  </div>
                  <Slider
                    value={[settings.shadowBlur]}
                    onValueChange={([v]) => updateSetting("shadowBlur", v)}
                    min={0}
                    max={20}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Distance</Label>
                    <span className="text-xs text-muted-foreground">{settings.shadowDistance}px</span>
                  </div>
                  <Slider
                    value={[settings.shadowDistance]}
                    onValueChange={([v]) => updateSetting("shadowDistance", v)}
                    min={0}
                    max={15}
                    step={1}
                  />
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Glow Effect Dropdown */}
        <Collapsible open={glowOpen} onOpenChange={setGlowOpen}>
          <div
            className="flex items-center justify-between w-full px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => setGlowOpen(!glowOpen)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              Glow Effect
              {settings.glowEnabled && (
                <span className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: settings.glowColor, boxShadow: `0 0 8px ${settings.glowColor}` }} />
              )}
            </span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.glowEnabled}
                onCheckedChange={(v) => updateSetting("glowEnabled", v)}
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown className={cn("h-4 w-4 transition-transform", glowOpen && "rotate-180")} />
            </div>
          </div>
          <CollapsibleContent className="pt-3 space-y-3">
            {settings.glowEnabled && (
              <>
                <ColorPicker
                  label="Glow Color"
                  value={settings.glowColor}
                  onChange={(c) => updateSetting("glowColor", c)}
                />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Intensity</Label>
                    <span className="text-xs text-muted-foreground">{settings.glowIntensity}%</span>
                  </div>
                  <Slider
                    value={[settings.glowIntensity]}
                    onValueChange={([v]) => updateSetting("glowIntensity", v)}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Size</Label>
                    <span className="text-xs text-muted-foreground">{settings.glowSize}px</span>
                  </div>
                  <Slider
                    value={[settings.glowSize]}
                    onValueChange={([v]) => updateSetting("glowSize", v)}
                    min={5}
                    max={50}
                    step={5}
                  />
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Inner Glow Effect Dropdown */}
        <Collapsible open={innerGlowOpen} onOpenChange={setInnerGlowOpen}>
          <div
            className="flex items-center justify-between w-full px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => setInnerGlowOpen(!innerGlowOpen)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Inner Glow
              {settings.innerGlowEnabled && (
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.innerGlowColor, boxShadow: `inset 0 0 4px rgba(255,255,255,0.8)` }} />
              )}
            </span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.innerGlowEnabled}
                onCheckedChange={(v) => updateSetting("innerGlowEnabled", v)}
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown className={cn("h-4 w-4 transition-transform", innerGlowOpen && "rotate-180")} />
            </div>
          </div>
          <CollapsibleContent className="pt-3 space-y-3">
            {settings.innerGlowEnabled && (
              <>
                <ColorPicker
                  label="Inner Glow Color"
                  value={settings.innerGlowColor}
                  onChange={(c) => updateSetting("innerGlowColor", c)}
                />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Intensity</Label>
                    <span className="text-xs text-muted-foreground">{settings.innerGlowIntensity}%</span>
                  </div>
                  <Slider
                    value={[settings.innerGlowIntensity]}
                    onValueChange={([v]) => updateSetting("innerGlowIntensity", v)}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground px-1">
                  Adds a bright highlight inside the text for a premium embossed look.
                </p>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Visual Mode - AI Rainbow Keywords */}
        <div
          className="flex items-center justify-between w-full px-4 py-3 rounded-md border border-input bg-gradient-to-r from-background to-primary/5 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => updateSetting("visualModeEnabled", !settings.visualModeEnabled)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <span
              className="text-lg"
              style={{
                background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0088ff, #ff00ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              ✦
            </span>
            Visual Mode
            {settings.visualModeEnabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 text-white font-bold">
                AI
              </span>
            )}
          </span>
          <Switch
            checked={settings.visualModeEnabled}
            onCheckedChange={(v) => updateSetting("visualModeEnabled", v)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {settings.visualModeEnabled && (
          <p className="text-[10px] text-muted-foreground px-2 -mt-2">
            AI detects important keywords and makes them rainbow + glowing
          </p>
        )}

        {/* Logo Recognition */}
        <div
          className="flex items-center justify-between w-full px-4 py-3 rounded-md border border-input bg-gradient-to-r from-background to-accent/5 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => updateSetting("logoRecognitionEnabled", !settings.logoRecognitionEnabled)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="text-lg text-primary">✨</span>
            Logo Recognition
          </span>
          <Switch
            checked={settings.logoRecognitionEnabled}
            onCheckedChange={(v) => updateSetting("logoRecognitionEnabled", v)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {settings.logoRecognitionEnabled && (
          <div className="space-y-1 px-1">
            <p className="text-[10px] text-[#b638fc] font-bold uppercase tracking-tighter">
              Auto-Detection Active
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Automatically replaces mentions of your <span className="text-white font-medium">Project Title</span> with your shining logo.
            </p>
          </div>
        )}

        {/* Live Preview */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <Label className="text-xs text-muted-foreground">Live Preview</Label>
          <LivePreview settings={settings} />
        </div>
      </CardContent>
    </Card>
  );
};



