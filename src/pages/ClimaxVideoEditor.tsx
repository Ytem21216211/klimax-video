import * as React from "react";
const { useCallback, useMemo, useState } = React;
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Captions,
  ChevronRight,
  CirclePlay,
  Download,
  ExternalLink,
  Film,
  Image,
  Library,
  Music,
  Play,
  Plus,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Loader2,
  Wand2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LOCAL_KLIMAX_API,
  localKlimaxApi,
  type LocalHookStyleSettings,
  type LocalKlimaxProject,
  type LocalSubtitleStyleSettings,
} from "@/lib/localKlimaxApi";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PresetsPanel from "@/components/editor/PresetsPanel";
import {
  createKlimaxProjectClip,
  loadKlimaxBankAssets,
  loadKlimaxProjectClips,
  loadKlimaxProjectSource,
  saveKlimaxProjectClips,
  type KlimaxAssetCategory,
  type KlimaxBankAsset,
  type KlimaxClipStage,
  type KlimaxProjectClip,
  type KlimaxProjectSource,
} from "@/lib/klimaxStorage";

const BASE_CANVAS_WIDTH = 1080;
const BASE_CANVAS_HEIGHT = 1920;
const TRANSCRIPTION_PIPELINE_VERSION = "caption-elision-logo-brand-v5";

const antiShadowbanSteps = [
  "Variation captions et hooks par export",
  "SFX courts synchronises aux mots forts",
  "Musique interchangeable par mood",
  "Cadres et zooms différents à chaque vidéo",
  "Insertion image ou b-roll selon le sens",
];

const VIDEO_FILTER_PRESETS = [
  { key: "none", label: "Aucun", note: "Image source", css: "none" },
  { key: "clean_boost", label: "Clean Boost", note: "Contraste léger", css: "contrast(1.06) saturate(1.07) brightness(1.006)" },
  { key: "warm_viral", label: "Warm Viral", note: "Chaud + vivant", css: "contrast(1.05) saturate(1.1) sepia(0.08) brightness(1.008)" },
  { key: "cold_crisp", label: "Cold Crisp", note: "Froid + net", css: "contrast(1.07) saturate(1.04) hue-rotate(7deg)" },
  { key: "contrast_punch", label: "Punch", note: "Plus impactant", css: "contrast(1.16) saturate(1.13) brightness(0.996)" },
  { key: "soft_glow", label: "Soft Glow", note: "Plus lumineux", css: "contrast(1.03) saturate(1.06) brightness(1.014)" },
  { key: "grain_light", label: "Grain Light", note: "Texture fine", css: "contrast(1.05) saturate(1.04)" },
  { key: "green_tint", label: "Green Tint", note: "Tint vert subtil", css: "contrast(1.05) saturate(1.06) hue-rotate(15deg)" },
  { key: "pink_pop", label: "Pink Pop", note: "Rouge pop", css: "contrast(1.06) saturate(1.16) hue-rotate(-8deg)" },
  { key: "vhs_lite", label: "VHS Lite", note: "Texture repost", css: "contrast(1.08) saturate(0.95)" },
  { key: "teal_orange", label: "Teal & Orange", note: "Ciné", css: "contrast(1.08) saturate(1.08) hue-rotate(-4deg)" },
  { key: "vibrant_pop", label: "Vibrant Pop", note: "Couleurs punchy", css: "contrast(1.10) saturate(1.28) brightness(1.005)" },
  { key: "moody_film", label: "Moody Film", note: "Désat. ciné", css: "contrast(1.12) saturate(0.92) brightness(0.988)" },
  { key: "sunny_warm", label: "Sunny Warm", note: "Doré chaud", css: "contrast(1.05) saturate(1.12) brightness(1.012) sepia(0.08)" },
  { key: "retro_fade", label: "Retro Fade", note: "Délavé vintage", css: "contrast(0.97) saturate(0.95) brightness(1.02) sepia(0.12)" },
  { key: "neon_night", label: "Neon Night", note: "Bleu néon", css: "contrast(1.10) saturate(1.16) hue-rotate(8deg)" },
] as const;

// Transparent PNG (rgba) cropped from klimax-pop-up.mov — the export's .mov is
// ProRes 4444 with alpha, but the preview's WebM was transcoded as yuv420p (no
// alpha) and rendered as a black box, so the preview uses this PNG instead.
const KLIMAX_LOGO_PREVIEW_URL = `${LOCAL_KLIMAX_API}/files/system/klimax-logo-preview.png`;
const KLIMAX_LOGO_PLACEMENT_TIME_SECONDS = 2;
// The export overlays the FULL logo frame scaled to `logoSize` px wide and
// centred on logoPosition. The cropped preview PNG spans 734/1080 of that frame
// (and the card is perfectly centred), so scaling the preview by this ratio
// makes the on-screen logo match the exported size 1:1.
const LOGO_PREVIEW_FRAME_RATIO = 734 / 1080;

// Hook bubble look — fixed to match the reference image (clean sans, white rounded
// rectangle, soft shadow), shared 1:1 with the export (render_hook_bubble.py).
// Only the hook TEXT options (color, size, position) stay editable.
const HOOK_FONT_CSS = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
const HOOK_BUBBLE_RADIUS = 39; // canvas px ≈ 0.19 × a 2-line bubble height — matches the
                               // TikTok-native corner the export uses (radiusRatio 0.19);
                               // the old 64 made short bubbles look like a full "pill".
const HOOK_BUBBLE_PAD_X = 56;  // canvas px
const HOOK_BUBBLE_PAD_Y = 30;  // canvas px

const SUBTITLE_PRESETS: Record<string, LocalSubtitleStyleSettings> = {
  impact: {
    stylePreset: "impact",
    fontFamily: "Arial Bold",
    fontSize: 40,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 6,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.9,
    shadowDistance: 6,
    shadowBlur: 18,
    animationPreset: "pop",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  clean: {
    stylePreset: "clean",
    fontFamily: "Helvetica",
    fontSize: 40,
    textColor: "#ffffff",
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowDistance: 3,
    shadowBlur: 10,
    animationPreset: "rise",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 103,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  highlight: {
    stylePreset: "highlight",
    fontFamily: "Impact",
    fontSize: 36,
    textColor: "#fff16b",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 5,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.9,
    shadowDistance: 5,
    shadowBlur: 14,
    animationPreset: "bounce",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  capcut: {
    stylePreset: "capcut",
    fontFamily: "Arial Black",
    fontSize: 40,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 6,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.95,
    shadowDistance: 5,
    shadowBlur: 18,
    animationPreset: "pop",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 105,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  punch: {
    stylePreset: "punch",
    fontFamily: "Anton",
    fontSize: 44,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#111111",
    strokeWidth: 5,
    shadowEnabled: true,
    shadowColor: "#ff2d55",
    shadowOpacity: 0.55,
    shadowDistance: 6,
    shadowBlur: 20,
    animationPreset: "bounce",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 106,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  neon: {
    stylePreset: "neon",
    fontFamily: "Montserrat",
    fontSize: 38,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#111111",
    strokeWidth: 4,
    shadowEnabled: true,
    shadowColor: "#00e5ff",
    shadowOpacity: 0.7,
    shadowDistance: 4,
    shadowBlur: 22,
    animationPreset: "rise",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: true,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  quickFade: {
    stylePreset: "quickFade",
    fontFamily: "Arial Black",
    fontSize: 38,
    textColor: "#ffe45c",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 6,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.9,
    shadowDistance: 5,
    shadowBlur: 16,
    animationPreset: "fade",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: false,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  orangeThe: {
    stylePreset: "orangeThe",
    fontFamily: "Anton",
    fontSize: 58,
    textColor: "#ff7a00",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 7,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.92,
    shadowDistance: 5,
    shadowBlur: 18,
    animationPreset: "rise",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 106,
    keywordHighlightEnabled: false,
    keywordColor: "#ff7a00",
    keywordSecondaryColor: "#ffe14a",
    keywordTerms: "",
  },
  proQuick: {
    stylePreset: "proQuick",
    fontFamily: "Arial Black",
    fontSize: 50,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.95,
    shadowDistance: 6,
    shadowBlur: 20,
    animationPreset: "fade",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: false,
    keywordColor: "#ffe14a",
    keywordSecondaryColor: "#45f08a",
    keywordTerms: "",
  },
  yellowPop: {
    stylePreset: "yellowPop",
    fontFamily: "Arial Black",
    fontSize: 48,
    textColor: "#ffe14a",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.95,
    shadowDistance: 7,
    shadowBlur: 18,
    animationPreset: "elastic",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 106,
    keywordHighlightEnabled: true,
    keywordColor: "#ffffff",
    keywordSecondaryColor: "#ff7a00",
    keywordTerms: "",
  },
  pinkPunch: {
    stylePreset: "pinkPunch",
    fontFamily: "Anton",
    fontSize: 52,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 7,
    shadowEnabled: true,
    shadowColor: "#ff2d8f",
    shadowOpacity: 0.82,
    shadowDistance: 7,
    shadowBlur: 24,
    animationPreset: "shake",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 106,
    keywordHighlightEnabled: true,
    keywordColor: "#ff4fd8",
    keywordSecondaryColor: "#ffe14a",
    keywordTerms: "",
  },
  cyanGlow: {
    stylePreset: "cyanGlow",
    fontFamily: "Montserrat",
    fontSize: 44,
    textColor: "#dffcff",
    strokeEnabled: true,
    strokeColor: "#001014",
    strokeWidth: 5,
    shadowEnabled: true,
    shadowColor: "#18e8ff",
    shadowOpacity: 0.9,
    shadowDistance: 4,
    shadowBlur: 28,
    animationPreset: "flicker",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 104,
    keywordHighlightEnabled: true,
    keywordColor: "#18e8ff",
    keywordSecondaryColor: "#ffffff",
    keywordTerms: "",
  },
  whiteBox: {
    stylePreset: "whiteBox",
    fontFamily: "Impact",
    fontSize: 42,
    textColor: "#000000",
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowEnabled: true,
    shadowColor: "#ffffff",
    shadowOpacity: 0.65,
    shadowDistance: 3,
    shadowBlur: 14,
    animationPreset: "slide",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 102,
    keywordHighlightEnabled: true,
    keywordColor: "#ff7a00",
    keywordSecondaryColor: "#ffe14a",
    keywordTerms: "",
  },
  creatorClean: {
    stylePreset: "creatorClean",
    fontFamily: "Avenir Next Heavy",
    fontSize: 40,
    textColor: "#ffffff",
    strokeEnabled: true,
    strokeColor: "#000000",
    strokeWidth: 4,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.72,
    shadowDistance: 5,
    shadowBlur: 18,
    animationPreset: "typewriter",
    wordsPerLine: 2,
    introVerticalPosition: "lower",
    replyVerticalPosition: "middle",
    fontWeight: 900,
    fontScaleX: 102,
    keywordHighlightEnabled: true,
    keywordColor: "#45f08a",
    keywordSecondaryColor: "#ffe14a",
    keywordTerms: "",
  },
  // The entries below are mirrored VERBATIM (one preset per line) from
  // local-backend/autoVariants.mjs SUBTITLE_PRESETS — keep the two maps 1:1.
  hormozi: { stylePreset: "hormozi", fontFamily: "Archivo Black", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.95, shadowDistance: 6, shadowBlur: 16, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#3df25e", keywordSecondaryColor: "#ff4040", keywordTerms: "", uppercase: true, activeWordColor: "#ffe14a" },
  bebasGold: { stylePreset: "bebasGold", fontFamily: "Bebas Neue", fontSize: 56, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 5, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#ffcf33", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#ffcf33" },
  iceBlue: { stylePreset: "iceBlue", fontFamily: "Montserrat", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#0a2540", strokeWidth: 4, shadowEnabled: true, shadowColor: "#0a2540", shadowOpacity: 0.7, shadowDistance: 4, shadowBlur: 20, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#37c6ff", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#37c6ff" },
  redAlert: { stylePreset: "redAlert", fontFamily: "Anton", fontSize: 50, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#b00000", shadowOpacity: 0.8, shadowDistance: 6, shadowBlur: 18, animationPreset: "shake", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#ff3b3b", keywordSecondaryColor: "#ffe14a", keywordTerms: "", uppercase: true, activeWordColor: "#ff3b3b" },
  mintBounce: { stylePreset: "mintBounce", fontFamily: "Arial Black", fontSize: 44, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#06281f", strokeWidth: 5, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.85, shadowDistance: 5, shadowBlur: 14, animationPreset: "bounce", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 103, keywordHighlightEnabled: true, keywordColor: "#36f1a6", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#36f1a6" },
  cleanMinimal: { stylePreset: "cleanMinimal", fontFamily: "Helvetica", fontSize: 40, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.55, shadowDistance: 3, shadowBlur: 12, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffffff", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#ffe14a" },
  invertBox: { stylePreset: "invertBox", fontFamily: "Impact", fontSize: 44, textColor: "#111111", strokeEnabled: false, strokeColor: "#111111", strokeWidth: 0, shadowEnabled: true, shadowColor: "#ffffff", shadowOpacity: 0.6, shadowDistance: 3, shadowBlur: 10, animationPreset: "slide", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#ff2d8f", keywordSecondaryColor: "#0a84ff", keywordTerms: "", uppercase: true, activeWordColor: "#ff2d8f" },
  purpleNeon: { stylePreset: "purpleNeon", fontFamily: "Montserrat", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#1a0033", strokeWidth: 4, shadowEnabled: true, shadowColor: "#a855f7", shadowOpacity: 0.85, shadowDistance: 4, shadowBlur: 26, animationPreset: "elastic", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#c084fc", keywordSecondaryColor: "#22d3ee", keywordTerms: "", activeWordColor: "#c084fc" },
  // --- TikTok/CapCut pack (boxEnabled = background box, ASS BorderStyle=4) ---
  tiktokWhite: { stylePreset: "tiktokWhite", fontFamily: "Helvetica", fontSize: 44, textColor: "#000000", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "none", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#fe2c55", keywordSecondaryColor: "#25f4ee", keywordTerms: "", activeWordColor: "#fe2c55", boxEnabled: true, boxColor: "#ffffff", boxOpacity: 1, boxPadding: 18 },
  tiktokBlack: { stylePreset: "tiktokBlack", fontFamily: "Helvetica", fontSize: 44, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#25f4ee", keywordSecondaryColor: "#fe2c55", keywordTerms: "", activeWordColor: "#25f4ee", boxEnabled: true, boxColor: "#000000", boxOpacity: 0.78, boxPadding: 18 },
  tiktokRed: { stylePreset: "tiktokRed", fontFamily: "Arial Black", fontSize: 42, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffe14a", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#ffe14a", boxEnabled: true, boxColor: "#fe2c55", boxOpacity: 1, boxPadding: 16 },
  capcutYellow: { stylePreset: "capcutYellow", fontFamily: "Arial Black", fontSize: 42, textColor: "#111111", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffffff", keywordSecondaryColor: "#111111", keywordTerms: "", uppercase: true, activeWordColor: "#ffffff", boxEnabled: true, boxColor: "#ffe14a", boxOpacity: 1, boxPadding: 16 },
  capcutKaraoke: { stylePreset: "capcutKaraoke", fontFamily: "Arial Black", fontSize: 46, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 8, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: false, keywordColor: "#ffd400", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#ffd400" },
  karaokeGreen: { stylePreset: "karaokeGreen", fontFamily: "Archivo Black", fontSize: 44, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "none", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#39e55f", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#39e55f" },
  tiktokOutline: { stylePreset: "tiktokOutline", fontFamily: "Montserrat", fontSize: 46, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 10, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#fe2c55", keywordSecondaryColor: "#25f4ee", keywordTerms: "", activeWordColor: "#ffe14a" },
  bebasCaps: { stylePreset: "bebasCaps", fontFamily: "Bebas Neue", fontSize: 54, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.85, shadowDistance: 4, shadowBlur: 12, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#fe2c55", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#fe2c55" },
};

const DEFAULT_SUBTITLE_STYLE = SUBTITLE_PRESETS.impact;
const VISUAL_SUBTITLE_PRESETS = [
  { key: "quickFade", label: "Quick opacite", sample: "THE QUICK BROWN FOX", badge: null },
  { key: "orangeThe", label: "THE orange", sample: "THE", badge: null },
  { key: "proQuick", label: "Quick", sample: "quick", badge: null },
  { key: "yellowPop", label: "Yellow pop", sample: "WAIT", badge: null },
  { key: "pinkPunch", label: "Pink punch", sample: "NO WAY", badge: null },
  { key: "cyanGlow", label: "Cyan glow", sample: "viral", badge: null },
  { key: "whiteBox", label: "White box", sample: "FACT", badge: null },
  { key: "creatorClean", label: "Creator clean", sample: "clean", badge: null },
  { key: "tiktokWhite", label: "TikTok box", sample: "comme ça", badge: "TIKTOK" },
  { key: "tiktokBlack", label: "TikTok dark", sample: "la vérité", badge: "TIKTOK" },
  { key: "tiktokRed", label: "TikTok rouge", sample: "STOP", badge: "TIKTOK" },
  { key: "capcutYellow", label: "CapCut jaune", sample: "ATTENDS", badge: null },
  { key: "capcutKaraoke", label: "Karaoké", sample: "MOT À MOT", badge: null },
  { key: "karaokeGreen", label: "Karaoké vert", sample: "ÉCOUTE", badge: null },
  { key: "tiktokOutline", label: "Contour épais", sample: "direct", badge: null },
  { key: "bebasCaps", label: "Bebas caps", sample: "GRAND", badge: null },
  { key: "hormozi", label: "Hormozi", sample: "MONEY", badge: null },
  { key: "redAlert", label: "Red alert", sample: "ALERTE", badge: null },
] as const;
const SUBTITLE_ANIMATION_PRESETS: { key: NonNullable<LocalSubtitleStyleSettings["animationPreset"]>; label: string; sample: string }[] = [
  { key: "pop", label: "Pop-up", sample: "POP" },
  { key: "bounce", label: "Bounce", sample: "BOUNCE" },
  { key: "rise", label: "Montee", sample: "THE" },
  { key: "zoom", label: "Zoom cut", sample: "ZOOM" },
  { key: "slide", label: "Slide", sample: "SLIDE" },
  { key: "shake", label: "Shake", sample: "SHAKE" },
  { key: "typewriter", label: "Type", sample: "TYPE" },
  { key: "flicker", label: "Flash", sample: "FLASH" },
  { key: "elastic", label: "Elastic", sample: "ELASTIC" },
  { key: "fade", label: "Opacite", sample: "quick" },
  { key: "none", label: "Fixe", sample: "FIXE" },
];

const subtitleAnimationCss = (animation?: LocalSubtitleStyleSettings["animationPreset"], loop = false) => {
  const repeat = loop ? " infinite" : "";
  if (animation === "pop") return `klimaxSubtitlePop 360ms cubic-bezier(.2,1.35,.3,1)${repeat}`;
  if (animation === "bounce") return `klimaxSubtitleBounce 520ms cubic-bezier(.2,1.25,.2,1)${repeat}`;
  if (animation === "rise") return `klimaxSubtitleRise 360ms ease-out${repeat}`;
  if (animation === "fade") return `klimaxSubtitleFade 760ms ease-out${repeat}`;
  if (animation === "zoom") return `klimaxSubtitleZoom 340ms cubic-bezier(.15,.95,.2,1)${repeat}`;
  if (animation === "slide") return `klimaxSubtitleSlide 420ms cubic-bezier(.2,1,.2,1)${repeat}`;
  if (animation === "shake") return `klimaxSubtitleShake 520ms ease-out${repeat}`;
  if (animation === "typewriter") return `klimaxSubtitleType 820ms steps(7,end)${repeat}`;
  if (animation === "flicker") return `klimaxSubtitleFlicker 620ms linear${repeat}`;
  if (animation === "elastic") return `klimaxSubtitleElastic 620ms cubic-bezier(.2,1.35,.2,1)${repeat}`;
  return undefined;
};

const buildOuterSubtitleShadow = (
  strokeWidth: number,
  strokeColor: string,
  shadowDistance: number,
  shadowBlur: number,
  shadowColor: string,
  shadowOpacity: number
) => {
  const shadows: string[] = [];
  if (strokeWidth > 0) {
    const stroke = canvasUnit(strokeWidth);
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.72, 0.72],
      [-0.72, 0.72],
      [0.72, -0.72],
      [-0.72, -0.72],
    ].forEach(([x, y]) => {
      shadows.push(`${canvasUnit(strokeWidth * x)} ${canvasUnit(strokeWidth * y)} 0 ${strokeColor}`);
    });
    shadows.push(`0 0 ${stroke} ${strokeColor}`);
  }
  if (shadowDistance > 0 || shadowBlur > 0) {
    shadows.push(`0 ${canvasUnit(shadowDistance)} 0 ${hexToRgba(shadowColor, shadowOpacity)}`);
    shadows.push(`0 ${canvasUnit(shadowDistance)} ${canvasUnit(shadowBlur)} ${hexToRgba(shadowColor, Math.min(0.62, shadowOpacity * 0.62))}`);
  }
  return shadows.join(", ");
};
const DEFAULT_HOOK_STYLE: LocalHookStyleSettings = {
  bubbleColor: "#ffffff",
  textColor: "#000000",
  fontFamily: "Arial Black",
  fontSize: 53,
};

// Shared default text size (px, in the 1080-wide canvas) for hook + subtitles.
const DEFAULT_TEXT_SIZE = 53;

const FONT_OPTIONS = [
  { value: "Arial Bold", label: "Arial Bold" },
  { value: "Arial Black", label: "Arial Black" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Impact", label: "Impact" },
  { value: "Courier New", label: "Courier New" },
  { value: "Arial Rounded MT Bold", label: "Arial Rounded MT Bold" },
  { value: "SF Pro Display", label: "SF Pro Display" },
  { value: "System Rounded", label: "System Rounded" },
  { value: "Archivo Black", label: "Archivo Black" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Bebas Neue", label: "Bebas Neue" },
  { value: "Anton", label: "Anton" },
  { value: "DIN Condensed", label: "DIN Condensed" },
  { value: "Futura", label: "Futura" },
  { value: "Avenir Next Heavy", label: "Avenir Next Heavy" },
  { value: "Gill Sans", label: "Gill Sans" },
  { value: "Trebuchet MS", label: "Trebuchet MS" },
  { value: "Marker Felt", label: "Marker Felt" },
  { value: "Noteworthy", label: "Noteworthy" },
];

const hexToRgba = (hex = "#000000", alpha = 1) => {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatSubtitleSingleLine = (text: string) =>
  text
    .replace(/[?,!]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snapToValue = (value: number, target: number, threshold = 18) =>
  Math.abs(value - target) <= threshold ? target : value;
const canvasFontSize = (size: number) => `${(size / BASE_CANVAS_WIDTH) * 100}cqw`;
const canvasUnit = (value: number) => `${(value / BASE_CANVAS_WIDTH) * 100}cqw`;
// The export does NOT render subtitles at the raw px the user picks: the backend
// (resolveSubtitleRenderStyle in local-backend/server.mjs) writes the ASS Fontsize
// as `round(fontSize * 1.08)` clamped to [38, 96] on the 1080-wide canvas. This
// returns that exported Fontsize; the preview then scales it by PREVIEW_LIBASS_RATIO
// (below) to match libass's actual on-screen pixel size.
const EXPORT_SUBTITLE_FONT_SCALE = 1.08;
const exportSubtitleFontSize = (size: number) =>
  clampValue(Math.round((size || DEFAULT_TEXT_SIZE) * EXPORT_SUBTITLE_FONT_SCALE), 38, 96);

// A band's lateral/vertical pan, expressed as a FRACTION of the available
// overscan in [0,1]. The ±480 px crop range maps to 0…1 (0.5 = centered). The
// export uses the exact same fraction (see renderProject), so preview == export.
const bandPanFraction = (crop: number) => clampValue(0.5 + crop / 960, 0, 1);

// Framing for one split-screen band — matches the export 1:1 and needs NO source
// dimensions (so it can't break while the video metadata is still loading):
//  - object-fit:cover scales the source to cover the band, exactly like ffmpeg's
//    force_original_aspect_ratio=increase;
//  - object-position places the pan as a fraction of the overscan — the browser
//    auto-clamps it to [0%,100%], so a black bar can never appear;
//  - transform:scale(zoom) with the SAME transform-origin grows the zoom from the
//    pan point, keeping it centered (band center when crop = 0).
const exportBandFrameStyle = (
  zoom: number,
  cropX: number,
  cropY: number
): React.CSSProperties => {
  const fx = bandPanFraction(cropX) * 100;
  const fy = bandPanFraction(cropY) * 100;
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: `${fx}% ${fy}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${fx}% ${fy}%`,
  };
};
// libass (the export renderer) draws a given Fontsize ~11% SMALLER than a browser
// draws the same px. The shared 1.08 factor cancels out and never fixed this, so
// the preview was ~12% too big at every size. Scale the preview down by this
// measured ratio so it matches the exported video 1:1 (see .context/subtitle-test).
const PREVIEW_LIBASS_RATIO = 0.885;

// The export renders subtitles with a real font file resolved by the backend
// (fontDescriptor in local-backend/server.mjs). The preview MUST use the exact
// same font face + weight, otherwise an invalid CSS family (e.g. "Arial Bold")
// silently falls back to another font and the on-screen text no longer matches
// the export at any size. This mirrors that mapping to a valid CSS stack + weight.
const resolvePreviewFont = (fontFamily?: string): { family: string; weight: number } => {
  const f = String(fontFamily || "");
  const t = (re: RegExp) => re.test(f);
  if (t(/arial black/i)) return { family: '"Arial Black", Arial, sans-serif', weight: 900 };
  if (t(/impact/i)) return { family: 'Impact, "Arial Narrow", sans-serif', weight: 400 };
  if (t(/courier/i)) return { family: '"Courier New", monospace', weight: 700 };
  if (t(/helvetica/i)) return { family: 'Helvetica, Arial, sans-serif', weight: 700 };
  if (t(/arial/i)) return { family: 'Arial, Helvetica, sans-serif', weight: 700 }; // "Arial Bold" -> Arial 700
  if (t(/sf pro|system/i)) return { family: '-apple-system, "SF Pro Display", sans-serif', weight: 700 };
  if (t(/archivo/i)) return { family: '"Archivo Black", Arial, sans-serif', weight: 400 };
  if (t(/montserrat/i)) return { family: 'Montserrat, Arial, sans-serif', weight: 800 };
  if (t(/bebas/i)) return { family: '"Bebas Neue", Arial, sans-serif', weight: 400 };
  if (t(/anton/i)) return { family: 'Anton, Arial, sans-serif', weight: 400 };
  if (t(/din condensed/i)) return { family: '"DIN Condensed", Arial, sans-serif', weight: 700 };
  if (t(/din/i)) return { family: '"DIN Alternate", Arial, sans-serif', weight: 700 };
  if (t(/futura/i)) return { family: 'Futura, Arial, sans-serif', weight: 700 };
  if (t(/avenir/i)) return { family: '"Avenir Next", Arial, sans-serif', weight: 800 };
  if (t(/gill/i)) return { family: '"Gill Sans", Arial, sans-serif', weight: 700 };
  if (t(/trebuchet/i)) return { family: '"Trebuchet MS", Arial, sans-serif', weight: 700 };
  if (t(/marker/i)) return { family: '"Marker Felt", Arial, sans-serif', weight: 700 };
  if (t(/noteworthy/i)) return { family: 'Noteworthy, Arial, sans-serif', weight: 700 };
  return { family: 'Helvetica, Arial, sans-serif', weight: 700 }; // backend default = Helvetica
};
const buildSubtitleTextPreviewStyle = (
  style: LocalSubtitleStyleSettings,
  fontSize: string,
  options: {
    animationPreset?: LocalSubtitleStyleSettings["animationPreset"];
    loopAnimation?: boolean;
    centerY?: boolean;
  } = {}
): React.CSSProperties => {
  const previewStrokeWidth =
    style.strokeEnabled === false ? 0 : clampValue(Math.max(style.strokeWidth || 5, 5), 0, 14);
  const previewShadowDistance =
    style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowDistance || 5, 5), 0, 22);
  const previewShadowBlur =
    style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowBlur ?? 16, 16), 0, 36);
  const previewShadowOpacity =
    style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowOpacity ?? 0.9, 0.2), 0, 1);
  const transformPrefix = options.centerY ? "translateY(-50%) " : "";

  const previewFont = resolvePreviewFont(style.fontFamily);
  // TikTok-style background box: solid box behind the line, no stroke/shadow halo
  // (mirrors the ASS BorderStyle=4 render — see buildAssSubtitleFile in server.mjs).
  const boxOn = style.boxEnabled === true;
  const boxAlpha = Math.round(clampValue(style.boxOpacity ?? 1, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return {
    fontSize,
    color: style.textColor || "#ffffff",
    fontFamily: previewFont.family,
    fontWeight: previewFont.weight,
    WebkitTextStroke: "0 transparent",
    textShadow: boxOn
      ? "none"
      : buildOuterSubtitleShadow(
          previewStrokeWidth,
          style.strokeColor || "#000000",
          previewShadowDistance,
          previewShadowBlur,
          style.shadowColor || "#000000",
          previewShadowOpacity
        ),
    ...(boxOn
      ? {
          backgroundColor: `${style.boxColor || "#ffffff"}${boxAlpha}`,
          padding: "0.12em 0.4em",
          borderRadius: "0.16em",
        }
      : {}),
    textTransform: style.uppercase === true ? ("uppercase" as const) : undefined,
    transform: `${transformPrefix}scaleX(${(style.fontScaleX || 104) / 100})`,
    animation: subtitleAnimationCss(options.animationPreset ?? style.animationPreset, options.loopAnimation),
  };
};

const KlimaxLogoPlacementPreview = () => (
  // Fills its wrapper (which controls size/position via logoSize/logoPosition),
  // keeps the transparent background, and stays click-through so the wrapper
  // handles dragging.
  <img
    src={`${KLIMAX_LOGO_PREVIEW_URL}?t=${KLIMAX_LOGO_PLACEMENT_TIME_SECONDS}`}
    alt="Logo KLIMAX"
    draggable={false}
    className="pointer-events-none block w-full select-none object-contain"
    style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.5))" }}
  />
);
const previewKeywordStopWords = new Set(["mais", "avec", "pour", "dans", "plus", "tout", "tous", "elle", "cette", "vraiment"]);
const normalizePreviewKeyword = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9%]+/g, "")
    .toLowerCase();
const isPreviewKeyword = (value: string) => {
  const token = normalizePreviewKeyword(value);
  return Boolean(token && !previewKeywordStopWords.has(token) && (token === "klimax" || /^[0-9]+%?$/.test(token) || token.length >= 5));
};
const formatDuration = (seconds = 0) => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
};
const formatBytes = (bytes = 0) => {
  if (!bytes) return "taille inconnue";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};

const VolumeDial = ({
  label,
  value,
  min,
  max,
  baseValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  baseValue: number;
  onChange: (value: number) => void;
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  const angle = -130 + percentage * 2.6;
  const markerX = 50 + Math.cos((angle * Math.PI) / 180) * 34;
  const markerY = 50 + Math.sin((angle * Math.PI) / 180) * 34;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">{label}</p>
          <p className="mt-1 text-2xl font-black">{value > 0 ? `+${value}` : value} dB</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(baseValue)}
          className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/55 hover:bg-white/10"
        >
          Base
        </button>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full border border-white/10 bg-black shadow-inner"
          style={{
            background: `conic-gradient(from 220deg, #ffffff ${Math.max(0, percentage)}%, rgba(255,255,255,0.08) 0 100%)`,
          }}
        >
          <div className="absolute inset-2 rounded-full bg-black" />
          <div
            className="absolute h-3 w-3 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.85)]"
            style={{ left: `${markerX}%`, top: `${markerY}%`, transform: "translate(-50%, -50%)" }}
          />
          <span className="relative text-[10px] font-black uppercase tracking-[0.18em] text-white/45">dB</span>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Slider value={[value]} min={min} max={max} step={1} onValueChange={([next]) => onChange(next)} />
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
            <span>{min} dB</span>
            <span>{max > 0 ? `+${max}` : max} dB</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClimaxVideoEditor = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { toast } = useToast();
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [clips, setClips] = useState<KlimaxProjectClip[]>(() => loadKlimaxProjectClips(projectId));
  const [selectedClipId, setSelectedClipId] = useState<string | null>(() => loadKlimaxProjectClips(projectId)[0]?.id || null);
  const [projectSource, setProjectSource] = useState<KlimaxProjectSource | null>(() => loadKlimaxProjectSource(projectId));
  const [localProject, setLocalProject] = useState<LocalKlimaxProject | null>(null);
  const [hookText, setHookText] = useState("Tu connais cette sensation ?");
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [autoSfxEnabled, setAutoSfxEnabled] = useState(true);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const [autoZoomMode, setAutoZoomMode] = useState<"cut" | "smooth">("cut");
  const [autoZoomBoostPercent, setAutoZoomBoostPercent] = useState(20);
  const [autoZoomDurationSeconds, setAutoZoomDurationSeconds] = useState(2);
  const [introZoomOutEnabled, setIntroZoomOutEnabled] = useState(false);
  const [replyZoomOutEnabled, setReplyZoomOutEnabled] = useState(false);
  const [zoomOutStartPercent, setZoomOutStartPercent] = useState(180);
  const [zoomOutDurationSeconds, setZoomOutDurationSeconds] = useState(1.2);
  const [klimaxLogoEnabled, setKlimaxLogoEnabled] = useState(true);
  // Cross-clip transitions (off by default): when on, each cut uses the type below.
  const [clipTransitionsEnabled, setClipTransitionsEnabled] = useState(false);
  // Which transition: "random" (50/50), "opacity" (fade), or "camera_flash".
  const [clipTransitionType, setClipTransitionType] = useState<"random" | "opacity" | "camera_flash">("random");
  // B-roll shutter mode: no animation, a shutter click between each b-roll.
  const [brollShutterMode, setBrollShutterMode] = useState(false);
  // Mirror effect: flips the source footage of every clip horizontally (overlays stay readable).
  const [mirrorEnabled, setMirrorEnabled] = useState(false);
  const [hookBrollSplitEnabled, setHookBrollSplitEnabled] = useState(false);
  const [shakeEnabled, setShakeEnabled] = useState(false);
  // B-roll style: "square", "fullscreen" (9:16), or "alternate" (both).
  const [brollStyle, setBrollStyle] = useState<"square" | "fullscreen" | "alternate">("alternate");
  // B-roll zoom motion (Ken Burns): none, in, or out.
  const [brollZoom, setBrollZoom] = useState<"none" | "in" | "out">("in");
  const [brollEnabled, setBrollEnabled] = useState(true);
  const [isAutoPickingBrolls, setIsAutoPickingBrolls] = useState(false);
  const [autoBrollMessage, setAutoBrollMessage] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [presetsRefresh, setPresetsRefresh] = useState(0);
  const [musicVolumeDb, setMusicVolumeDb] = useState(-17);
  const [videoVolumeDb, setVideoVolumeDb] = useState(2);
  const [videoFilterKey, setVideoFilterKey] = useState("none");
  const [subtitleSize, setSubtitleSize] = useState(DEFAULT_TEXT_SIZE);
  const [subtitleStyle, setSubtitleStyle] = useState<LocalSubtitleStyleSettings>({ ...DEFAULT_SUBTITLE_STYLE, fontSize: DEFAULT_TEXT_SIZE });
  const [hookStyle, setHookStyle] = useState<LocalHookStyleSettings>({ ...DEFAULT_HOOK_STYLE });

  const autoPickBrolls = useCallback(async () => {
    if (!projectId) return;
    setIsAutoPickingBrolls(true);
    setAutoBrollMessage(null);
    try {
      const result = await localKlimaxApi.autoPickBrolls(projectId);
      const matched = result.picks.filter((p) => p.brollId).length;
      const total = result.picks.length;
      setAutoBrollMessage(
        matched === 0
          ? "L'IA n'a trouvé aucune correspondance. Ajoute plus de labels descriptifs à tes b-rolls dans la Banque."
          : `${matched} b-roll${matched > 1 ? "s" : ""} placé${matched > 1 ? "s" : ""} sur ${total} clip${total > 1 ? "s" : ""}. Lance le rendu pour les incruster.`
      );
    } catch (err) {
      setAutoBrollMessage((err as Error).message);
    } finally {
      setIsAutoPickingBrolls(false);
    }
  }, [projectId]);

  // Expose a snapshot of the current settings for the Presets panel.
  // The panel calls `window.__klimaxCurrentSnapshot()` to grab them at save time.
  React.useEffect(() => {
    (window as any).__klimaxCurrentSnapshot = () => ({
      hookText,
      subtitleSize,
      subtitleStyle,
      hookStyle,
      musicId: selectedMusicId,
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      videoFilterKey,
      brollEnabled,
      autoSfxEnabled,
      autoZoomEnabled,
      autoZoomMode,
      autoZoomBoostPercent,
      autoZoomDurationSeconds,
      introZoomOutEnabled,
      replyZoomOutEnabled,
      zoomOutStartPercent,
      zoomOutDurationSeconds,
      klimaxLogoEnabled,
      clipTransitionsEnabled,
      clipTransitionType,
      brollShutterMode,
      mirrorEnabled,
      hookBrollSplitEnabled,
      shakeEnabled,
      brollStyle,
      brollZoom,
      logoTriggerWord: "klimax",
    });
    return () => { delete (window as any).__klimaxCurrentSnapshot; };
  }, [hookText, subtitleSize, subtitleStyle, hookStyle, selectedMusicId, musicEnabled, musicVolumeDb, videoVolumeDb, videoFilterKey, brollEnabled, autoSfxEnabled, autoZoomEnabled, autoZoomMode, autoZoomBoostPercent, autoZoomDurationSeconds, introZoomOutEnabled, replyZoomOutEnabled, zoomOutStartPercent, zoomOutDurationSeconds, klimaxLogoEnabled, clipTransitionsEnabled, clipTransitionType, brollShutterMode, mirrorEnabled, hookBrollSplitEnabled, shakeEnabled, brollStyle, brollZoom]);

  // Apply a preset from the Presets panel: update local state, then save the project.
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (typeof detail.hookText === "string") setHookText(detail.hookText);
      if (typeof detail.subtitleSize === "number") {
        setSubtitleSize(detail.subtitleSize);
        setSubtitleStyle((current) => ({ ...current, fontSize: detail.subtitleSize }));
      }
      if (detail.subtitleStyle && typeof detail.subtitleStyle === "object") {
        setSubtitleStyle((current) => ({ ...current, ...detail.subtitleStyle }));
        if (typeof detail.subtitleStyle.fontSize === "number") setSubtitleSize(detail.subtitleStyle.fontSize);
      }
      if (detail.hookStyle && typeof detail.hookStyle === "object") {
        setHookStyle((current) => ({ ...current, ...detail.hookStyle }));
      }
      if (typeof detail.musicId === "string" || detail.musicId === null) setSelectedMusicId(detail.musicId);
      if (typeof detail.musicEnabled === "boolean") setMusicEnabled(detail.musicEnabled);
      if (typeof detail.musicVolumeDb === "number") setMusicVolumeDb(detail.musicVolumeDb);
      if (typeof detail.videoVolumeDb === "number") setVideoVolumeDb(detail.videoVolumeDb);
      if (typeof detail.videoFilterKey === "string") setVideoFilterKey(detail.videoFilterKey);
      if (typeof detail.brollEnabled === "boolean") setBrollEnabled(detail.brollEnabled);
      if (typeof detail.autoSfxEnabled === "boolean") setAutoSfxEnabled(detail.autoSfxEnabled);
      if (typeof detail.autoZoomEnabled === "boolean") setAutoZoomEnabled(detail.autoZoomEnabled);
      if (detail.autoZoomMode === "cut" || detail.autoZoomMode === "smooth") setAutoZoomMode(detail.autoZoomMode);
      if (typeof detail.autoZoomBoostPercent === "number") setAutoZoomBoostPercent(detail.autoZoomBoostPercent);
      if (typeof detail.autoZoomDurationSeconds === "number") setAutoZoomDurationSeconds(detail.autoZoomDurationSeconds);
      if (typeof detail.introZoomOutEnabled === "boolean") setIntroZoomOutEnabled(detail.introZoomOutEnabled);
      if (typeof detail.replyZoomOutEnabled === "boolean") setReplyZoomOutEnabled(detail.replyZoomOutEnabled);
      if (typeof detail.zoomOutStartPercent === "number") setZoomOutStartPercent(detail.zoomOutStartPercent);
      if (typeof detail.zoomOutDurationSeconds === "number") setZoomOutDurationSeconds(detail.zoomOutDurationSeconds);
      if (typeof detail.klimaxLogoEnabled === "boolean") setKlimaxLogoEnabled(detail.klimaxLogoEnabled);
      if (typeof detail.clipTransitionsEnabled === "boolean") setClipTransitionsEnabled(detail.clipTransitionsEnabled);
      if (detail.clipTransitionType === "opacity" || detail.clipTransitionType === "camera_flash" || detail.clipTransitionType === "random") setClipTransitionType(detail.clipTransitionType);
      if (typeof detail.brollShutterMode === "boolean") setBrollShutterMode(detail.brollShutterMode);
      if (typeof detail.mirrorEnabled === "boolean") setMirrorEnabled(detail.mirrorEnabled);
      if (typeof detail.hookBrollSplitEnabled === "boolean") setHookBrollSplitEnabled(detail.hookBrollSplitEnabled);
      if (typeof detail.shakeEnabled === "boolean") setShakeEnabled(detail.shakeEnabled);
      if (detail.brollStyle === "square" || detail.brollStyle === "fullscreen" || detail.brollStyle === "alternate") setBrollStyle(detail.brollStyle);
      if (detail.brollZoom === "none" || detail.brollZoom === "in" || detail.brollZoom === "out") setBrollZoom(detail.brollZoom);
      toast({ title: "Preset appliqué", description: "Les réglages sont en place. Sauvegarde le projet pour les conserver." });
    };
    window.addEventListener("klimax:apply-preset", handler as EventListener);
    return () => window.removeEventListener("klimax:apply-preset", handler as EventListener);
  }, [toast]);
  const [bankAssets, setBankAssets] = useState<KlimaxBankAsset[]>(() => loadKlimaxBankAssets());
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCenteringFaces, setIsCenteringFaces] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [activeDragKind, setActiveDragKind] = useState<"video" | "hook" | "subtitle" | "logo" | "image" | null>(null);
  const [sourceVideoSizes, setSourceVideoSizes] = React.useState<Record<string, { width: number; height: number }>>({});
  const previewCanvasRef = React.useRef<HTMLDivElement | null>(null);
  const autoTranscriptionRef = React.useRef<string | null>(null);
  const dragStateRef = React.useRef<{
    kind: "video" | "hook" | "subtitle" | "logo" | "image";
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const getClipPositions = React.useCallback(
    (clip: KlimaxProjectClip | null | undefined) => ({
      videoTransform: clip?.videoTransform || {
        scale: 100,
        x: 0,
        y: 0,
      },
      hookPosition: clip?.hookPosition || {
        x: 540,
        y: 1325,
      },
      hookSize: clip?.hookSize || {
        width: 980,
        height: 120,
      },
      subtitlePosition: clip?.subtitlePosition || {
        x: 540,
        y: clip?.stage === "intro" ? 1500 : 1265,
      },
      logoPosition: clip?.logoPosition || {
        x: 540,
        y: 1385,
      },
      logoSize: clip?.logoSize || 520,
      imageTransform: clip?.imageTransform || {
        scale: 100,
        x: 0,
        y: 0,
      },
    }),
    []
  );

  const applyProjectState = React.useCallback((project: LocalKlimaxProject) => {
    setLocalProject(project);
    setClips(project.clips || []);
    setSelectedClipId((current) => (project.clips?.some((clip) => clip.id === current) ? current : project.clips?.[0]?.id || null));
    const nextSubtitleStyle = {
      ...DEFAULT_SUBTITLE_STYLE,
      ...(project.settings?.subtitleStyle || {}),
      fontSize: Number(project.settings?.subtitleStyle?.fontSize || project.settings?.subtitleSize || DEFAULT_TEXT_SIZE),
    };
    setSubtitleStyle(nextSubtitleStyle);
    setSubtitleSize(Number(nextSubtitleStyle.fontSize || DEFAULT_TEXT_SIZE));
    setHookStyle({ ...DEFAULT_HOOK_STYLE, ...(project.settings?.hookStyle || {}) });
    setHookText(project.settings?.hookText || project.clips?.[0]?.hookText || "Tu connais cette sensation ?");
    setSelectedMusicId(
      typeof project.settings?.musicId === "string"
        ? project.settings.musicId
        : project.clips?.find((clip) => clip.musicId)?.musicId || null
    );
    setMusicEnabled(project.settings?.musicEnabled !== false);
    setMusicVolumeDb(Number(project.settings?.musicVolumeDb ?? -17));
    setVideoVolumeDb(Number(project.settings?.videoVolumeDb ?? 2));
    setVideoFilterKey(String(project.settings?.videoFilterKey || "none"));
    setAutoSfxEnabled(project.settings?.autoSfxEnabled !== false);
    setAutoZoomEnabled(project.settings?.autoZoomEnabled !== false);
    setAutoZoomMode(project.settings?.autoZoomMode === "smooth" ? "smooth" : "cut");
    setAutoZoomBoostPercent(Number(project.settings?.autoZoomBoostPercent ?? 20));
    setAutoZoomDurationSeconds(Number(project.settings?.autoZoomDurationSeconds ?? 2));
    setIntroZoomOutEnabled(project.settings?.introZoomOutEnabled === true);
    setReplyZoomOutEnabled(project.settings?.replyZoomOutEnabled === true);
    setZoomOutStartPercent(Number(project.settings?.zoomOutStartPercent ?? 180));
    setZoomOutDurationSeconds(Number(project.settings?.zoomOutDurationSeconds ?? 1.2));
    setKlimaxLogoEnabled(project.settings?.klimaxLogoEnabled !== false);
    setClipTransitionsEnabled(project.settings?.clipTransitionsEnabled === true);
    setClipTransitionType(
      ["opacity", "camera_flash", "random"].includes(project.settings?.clipTransitionType as string)
        ? (project.settings!.clipTransitionType as "random" | "opacity" | "camera_flash")
        : "random"
    );
    setBrollEnabled(project.settings?.brollEnabled !== false);
    setBrollShutterMode(project.settings?.brollShutterMode === true);
    setMirrorEnabled(project.settings?.mirrorEnabled === true);
    setHookBrollSplitEnabled(project.settings?.hookBrollSplitEnabled === true);
    setShakeEnabled(project.settings?.shakeEnabled === true);
    setBrollStyle(
      ["square", "fullscreen", "alternate"].includes(project.settings?.brollStyle as string)
        ? (project.settings!.brollStyle as "square" | "fullscreen" | "alternate")
        : "alternate"
    );
    setBrollZoom(
      ["none", "in", "out"].includes(project.settings?.brollZoom as string)
        ? (project.settings!.brollZoom as "none" | "in" | "out")
        : "in"
    );
    setProjectSource(
      project.sourceGroup?.person1 && project.sourceGroup?.person2
        ? {
            videoId: project.sourceGroup.person1.id,
            videoIds: [project.sourceGroup.person1.id, project.sourceGroup.person2.id],
            groupId: project.sourceGroup.id,
            title: project.sourceGroup.title,
            note: project.sourceGroup.note,
          }
        : null
    );
  }, []);

  React.useEffect(() => {
    let active = true;

    const loadProject = async () => {
      try {
        const [{ project }, { assets }] = await Promise.all([
          localKlimaxApi.getProject(projectId || ""),
          localKlimaxApi.listAssets(),
        ]);
        if (!active) return;
        setBankAssets(assets);
        applyProjectState(project);
      } catch {
        const nextClips = loadKlimaxProjectClips(projectId);
        if (!active) return;
        setClips(nextClips);
        setSelectedClipId(nextClips[0]?.id || null);
        setProjectSource(loadKlimaxProjectSource(projectId));
      }
    };

    loadProject();
    return () => {
      active = false;
    };
  }, [applyProjectState, projectId]);

  React.useEffect(() => {
    // Debounced: during a drag this effect fires on EVERY pointermove — a 300 ms
    // trailing write keeps localStorage in sync without serializing the whole
    // clips array dozens of times per second.
    const t = setTimeout(() => saveKlimaxProjectClips(projectId, clips), 300);
    return () => clearTimeout(t);
  }, [clips, projectId]);

  const selectedClip = useMemo(() => clips.find((clip) => clip.id === selectedClipId) || clips[0] || null, [clips, selectedClipId]);
  const transcriptionByClipId = useMemo(
    () => new Map((localProject?.transcription?.clips || []).map((clip) => [clip.clipId, clip])),
    [localProject?.transcription?.clips]
  );
  const selectedTranscription = useMemo(
    () => (selectedClip ? transcriptionByClipId.get(selectedClip.id) || null : null),
    [selectedClip, transcriptionByClipId]
  );
  const selectedClipCanUseBroll = selectedClip?.stage === "reply";
  const selectedSourceAsset = useMemo(() => {
    if (!selectedClip || !localProject?.sourceGroup) return null;
    const { person1, person2 } = localProject.sourceGroup;
    if (selectedClip.sourceVideoId === person2?.id) return person2;
    return person1 || person2 || null;
  }, [localProject?.sourceGroup, selectedClip]);
  const selectedImageAsset = useMemo(
    () => (selectedClipCanUseBroll && selectedClip?.imageId ? bankAssets.find((asset) => asset.id === selectedClip.imageId) || null : null),
    [bankAssets, selectedClip?.imageId, selectedClipCanUseBroll]
  );
  const dualSpeakerVideoAssets = useMemo(
    // Only the dedicated second-speaker clips (Shelly / Julien). The podcast
    // source clips (category "video") never show up here.
    () => bankAssets.filter((asset) => asset.category === "speaker"),
    [bankAssets]
  );
  const dualSpeakerAddedAsset = useMemo(
    () =>
      selectedClip?.dualSpeakerSource
        ? bankAssets.find((asset) => asset.id === selectedClip.dualSpeakerSource) || null
        : null,
    [bankAssets, selectedClip?.dualSpeakerSource]
  );
  const selectedVideoFilter = useMemo(
    () => VIDEO_FILTER_PRESETS.find((filter) => filter.key === videoFilterKey) || VIDEO_FILTER_PRESETS[0],
    [videoFilterKey]
  );
  const selectedClipPositions = useMemo(() => getClipPositions(selectedClip), [getClipPositions, selectedClip]);
  const selectedSourceVideoSize = selectedSourceAsset?.id ? sourceVideoSizes[selectedSourceAsset.id] : null;
  const previewVideoFrameStyle = useMemo(() => {
    const sourceWidth = selectedSourceVideoSize?.width || 1920;
    const sourceHeight = selectedSourceVideoSize?.height || 1080;
    const sourceAspect = sourceWidth / sourceHeight || 16 / 9;
    const targetAspect = BASE_CANVAS_WIDTH / BASE_CANVAS_HEIGHT;
    const zoom = selectedClipPositions.videoTransform.scale / 100;
    let scaledWidth = BASE_CANVAS_WIDTH * zoom;
    let scaledHeight = scaledWidth / sourceAspect;

    if (sourceAspect > targetAspect) {
      scaledHeight = BASE_CANVAS_HEIGHT * zoom;
      scaledWidth = scaledHeight * sourceAspect;
    }

    return {
      width: `${(scaledWidth / BASE_CANVAS_WIDTH) * 100}%`,
      height: `${(scaledHeight / BASE_CANVAS_HEIGHT) * 100}%`,
      left: `${50 - (selectedClipPositions.videoTransform.x / BASE_CANVAS_WIDTH) * 100}%`,
      top: `${50 - (selectedClipPositions.videoTransform.y / BASE_CANVAS_HEIGHT) * 100}%`,
      transform: "translate(-50%, -50%)",
    };
  }, [selectedClipPositions.videoTransform, selectedSourceVideoSize]);
  const mergedSubtitleStyle = useMemo(
    () => ({ ...DEFAULT_SUBTITLE_STYLE, ...subtitleStyle, fontSize: subtitleStyle.fontSize || subtitleSize }),
    [subtitleStyle, subtitleSize]
  );
  const mergedHookStyle = useMemo(() => ({ ...DEFAULT_HOOK_STYLE, ...hookStyle }), [hookStyle]);
  const subtitlePreviewStyle = useMemo(
    () => {
      // Match the export 1:1: take the exported ASS Fontsize (round(size*1.08),
      // clamped) and scale it by PREVIEW_LIBASS_RATIO so the browser draws the
      // subtitle at the same pixel size libass produces in the final video.
      const previewFontSize = exportSubtitleFontSize(mergedSubtitleStyle.fontSize || subtitleSize) * PREVIEW_LIBASS_RATIO;
      return buildSubtitleTextPreviewStyle(mergedSubtitleStyle, canvasFontSize(previewFontSize));
    },
    [mergedSubtitleStyle, subtitleSize]
  );
  // The hook always belongs to the INTRO clip — don't re-sync the textarea on
  // clip switches (it was clobbering in-progress edits when toggling P1/P2).
  const introClip = useMemo(() => clips.find((c) => c.stage === "intro") || clips[0] || null, [clips]);
  React.useEffect(() => {
    setHookText(introClip?.hookText || "Tu connais cette sensation ?");
  }, [introClip?.id]);
  const selectedAutoSubtitle =
    formatSubtitleSingleLine(selectedTranscription?.cues?.[0]?.text || selectedClip?.subtitle || (isTranscribing ? "Transcription en cours" : "Transcription en attente"));
  const subtitlePreviewText = useMemo(() => {
    if (mergedSubtitleStyle.keywordHighlightEnabled === false) return selectedAutoSubtitle;
    // Alternate colors per KEYWORD (not per raw token index, which counts spaces).
    let keywordCount = 0;
    return selectedAutoSubtitle.split(/(\s+)/).map((part, index) => {
      if (!part.trim() || !isPreviewKeyword(part)) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      const color = keywordCount++ % 2 === 0
        ? mergedSubtitleStyle.keywordColor || DEFAULT_SUBTITLE_STYLE.keywordColor
        : mergedSubtitleStyle.keywordSecondaryColor || DEFAULT_SUBTITLE_STYLE.keywordSecondaryColor;
      return (
        <span key={`${part}-${index}`} style={{ color }}>
          {part}
        </span>
      );
    });
  }, [mergedSubtitleStyle, selectedAutoSubtitle]);
  const timeline = useMemo(
    () => clips.length > 0
      ? clips.map((clip, index) => ({
          id: clip.id,
          label: clip.title,
          detail: clip.stage === "intro" ? "Personne 1 + hook + sous-titres" : "Personne 2 + reponse + sous-titres",
          duration: `Segment ${index + 1}`,
        }))
      : [
          { id: "empty", label: "Aucun segment", detail: "Ajoute personne 1 ou personne 2 depuis la vidéo source", duration: "0" },
        ],
    [clips]
  );
  const bankByCategory = useMemo(
    () => ({
      music: bankAssets.filter((asset) => asset.category === "music"),
      broll: bankAssets.filter((asset) => asset.category === "broll"),
      image: bankAssets.filter((asset) => asset.category === "image"),
    }),
    [bankAssets]
  );
  const exportHistory = useMemo(
    () => (localProject?.exports?.length ? localProject.exports : localProject?.export ? [localProject.export] : []),
    [localProject?.export, localProject?.exports]
  );
  const projectDiagnostics = useMemo(() => {
    const hasSourcePair = Boolean(localProject?.sourceGroup?.person1 && localProject?.sourceGroup?.person2);
    const hasIntro = clips.some((clip) => clip.stage === "intro");
    const hasReply = clips.some((clip) => clip.stage === "reply");
    const transcriptionStatus = localProject?.transcription?.status || "idle";
    const transcriptionClips = localProject?.transcription?.clips?.length || 0;
    const replyLogoMoments = (localProject?.transcription?.clips || [])
      .filter((clip) => clip.stage === "reply")
      .reduce((total, clip) => total + (clip.logoMoments?.length || 0), 0);

    return [
      {
        label: "Source vidéo",
        detail: hasSourcePair ? "Personne 1 et personne 2 liées" : "Choisis une vidéo dans Nouveau projet",
        ok: hasSourcePair,
        required: true,
      },
      {
        label: "Segments",
        detail: hasIntro && hasReply ? `${clips.length} segment(s) prêts` : "Ajoute personne 1 et personne 2",
        ok: hasIntro && hasReply,
        required: true,
      },
      {
        label: "Transcription",
        detail:
          transcriptionStatus === "completed"
            ? `${transcriptionClips} segment(s) transcrits`
            : transcriptionStatus === "running"
              ? "Transcription en cours"
              : "Sera générée avant l'export",
        ok: transcriptionStatus === "completed",
        required: false,
      },
      {
        label: "Sous-titres",
        detail: `${mergedSubtitleStyle.fontFamily || "Police"} · ${mergedSubtitleStyle.animationPreset || "pop"} · 2 mots max`,
        ok: true,
        required: false,
      },
      {
        label: "Logo Klimax",
        detail: klimaxLogoEnabled
          ? replyLogoMoments
            ? `${replyLogoMoments} moment(s) détecté(s)`
            : "Actif, affiché quand Klimax est détecté"
          : "Désactivé",
        ok: klimaxLogoEnabled,
        required: false,
      },
      {
        label: "Assets",
        detail: `${bankByCategory.broll.length} B-roll · ${bankByCategory.image.length} image · ${bankByCategory.music.length} musique`,
        ok: bankAssets.length > 0,
        required: false,
      },
    ];
  }, [
    bankAssets.length,
    bankByCategory.broll.length,
    bankByCategory.image.length,
    bankByCategory.music.length,
    clips,
    klimaxLogoEnabled,
    clipTransitionsEnabled,
    clipTransitionType,
    brollShutterMode,
    brollStyle,
    brollZoom,
    localProject?.sourceGroup?.person1,
    localProject?.sourceGroup?.person2,
    localProject?.transcription?.clips,
    localProject?.transcription?.status,
    mergedSubtitleStyle.animationPreset,
    mergedSubtitleStyle.fontFamily,
  ]);
  const canStartRender = projectDiagnostics.filter((item) => item.required).every((item) => item.ok);

  const selectBankAsset = (category: Exclude<KlimaxAssetCategory, "video">, assetId: string) => {
    if (category === "music") {
      setSelectedMusicId(assetId);
      setClips((current) => current.map((clip) => ({ ...clip, musicId: assetId })));
      return;
    }
    if (!selectedClip) return;
    if ((category === "broll" || category === "image") && !selectedClipCanUseBroll) {
      toast({
        title: "B-roll réservé à Personne 2",
        description: "Les images et B-rolls se placent uniquement sur le deuxième clip.",
      });
      return;
    }
    if (category === "broll") updateSelectedClip({ brollId: assetId });
    if (category === "image") updateSelectedClip({ imageId: assetId, imageTransform: selectedClip.imageTransform || { scale: 100, x: 0, y: 0 } });
  };

  const applySubtitleTextPreset = (preset: LocalSubtitleStyleSettings) => {
    // A STYLE preset changes the look (colors, font, stroke, shadow) but must NOT
    // reset the SIZE the user picked. Size stays the single value `subtitleSize`.
    setSubtitleStyle((current) => ({
      ...preset,
      fontSize: current.fontSize ?? subtitleSize,
      animationPreset: current.animationPreset || preset.animationPreset,
    }));
    // subtitleSize is intentionally left unchanged.
  };

  const addClip = (stage: KlimaxClipStage) => {
    const sourceVideoId =
      stage === "reply"
        ? projectSource?.videoIds?.[1] || projectSource?.videoId || null
        : projectSource?.videoIds?.[0] || projectSource?.videoId || null;
    const nextClip = createKlimaxProjectClip(stage, clips.length, sourceVideoId);
    const nextClips = [...clips, nextClip];
    setClips(nextClips);
    setSelectedClipId(nextClip.id);
  };

  // Stable identity (id read from a ref): the global pointer-drag effect depends on
  // this function — a fresh arrow each render tore down and re-added the window
  // listeners on EVERY pointermove during a drag.
  const selectedClipIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    selectedClipIdRef.current = selectedClip?.id || null;
  }, [selectedClip?.id]);
  const updateSelectedClip = React.useCallback((patch: Partial<KlimaxProjectClip>) => {
    const id = selectedClipIdRef.current;
    if (!id) return;
    setClips((current) =>
      current.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip))
    );
  }, []);

  // Auto-frame the split-screen bands on each speaker's face. Pushes the current
  // clips (so the server centres against the live split ratio / zoom / sources), runs
  // detection, then folds the returned crop values back into local state — the preview
  // recentres immediately because exportBandFrameStyle already reads these fields.
  const handleCenterFaces = React.useCallback(async () => {
    const clip = clips.find((c) => c.id === selectedClipIdRef.current);
    if (!projectId || isCenteringFaces || !clip?.dualSpeakerEnabled) return;
    setIsCenteringFaces(true);
    try {
      await localKlimaxApi.saveProject(projectId, { clips });
      const { project, centered, noFace } = await localKlimaxApi.centerFaces(projectId, clip.id);
      const updated = project.clips || [];
      setClips((current) =>
        current.map((c) => {
          const u = updated.find((x) => x.id === c.id);
          return u
            ? {
                ...c,
                dualSpeakerMainCropX: u.dualSpeakerMainCropX ?? c.dualSpeakerMainCropX,
                dualSpeakerMainCropY: u.dualSpeakerMainCropY ?? c.dualSpeakerMainCropY,
                dualSpeakerAddedCropX: u.dualSpeakerAddedCropX ?? c.dualSpeakerAddedCropX,
                dualSpeakerAddedCropY: u.dualSpeakerAddedCropY ?? c.dualSpeakerAddedCropY,
              }
            : c;
        })
      );
      if (centered > 0) {
        toast({ title: "Visages centrés", description: "Les bandes sont recadrées sur chaque visage." });
      } else {
        toast({
          title: "Aucun visage détecté",
          description: noFace > 0 ? "Recadrage laissé centré — ajuste à la main si besoin." : "Rien à recadrer.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Échec du centrage",
        description: error instanceof Error ? error.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setIsCenteringFaces(false);
    }
  }, [projectId, isCenteringFaces, clips]);

  const startClipDrag = (
    kind: "video" | "hook" | "subtitle" | "logo" | "image",
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (!selectedClip) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const positions = getClipPositions(selectedClip);
    const origin =
      kind === "video"
        ? positions.videoTransform
        : kind === "hook"
        ? positions.hookPosition
        : kind === "subtitle"
          ? positions.subtitlePosition
          : kind === "logo"
            ? positions.logoPosition
            : positions.imageTransform;

    dragStateRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    };
    setActiveDragKind(kind);
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      const canvas = previewCanvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / BASE_CANVAS_WIDTH || 1;
      const scaleY = rect.height / BASE_CANVAS_HEIGHT || 1;
      const deltaX = (event.clientX - drag.startX) / scaleX;
      const deltaY = (event.clientY - drag.startY) / scaleY;
      const nextX = Math.round(drag.originX + deltaX);
      const nextY = Math.round(drag.originY + deltaY);
      const overlayX = clampValue(snapToValue(nextX, 540), 40, 1040);
      const overlayY = clampValue(snapToValue(nextY, 960), 50, 1840);

      if (drag.kind === "hook") {
        updateSelectedClip({
          hookPosition: {
            x: overlayX,
            y: overlayY,
          },
        });
      } else if (drag.kind === "subtitle") {
        updateSelectedClip({
          subtitlePosition: {
            x: overlayX,
            y: overlayY,
          },
        });
      } else if (drag.kind === "logo") {
        updateSelectedClip({
          logoPosition: {
            x: overlayX,
            y: overlayY,
          },
        });
      } else if (drag.kind === "image") {
        updateSelectedClip({
          imageTransform: {
            scale: selectedClip?.imageTransform?.scale ?? 100,
            x: clampValue(nextX, -540, 540),
            y: clampValue(nextY, -840, 840),
          },
        });
      } else if (drag.kind === "video") {
        // The video is positioned with `left: 50% - x`, so a raw delta would move
        // it opposite to the cursor. Invert the delta so it follows the mouse 1:1.
        updateSelectedClip({
          videoTransform: {
            scale: selectedClip?.videoTransform?.scale ?? 100,
            x: clampValue(Math.round(drag.originX - deltaX), -540, 540),
            y: clampValue(Math.round(drag.originY - deltaY), -840, 840),
          },
        });
      }
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
      setActiveDragKind(null);
      previewCanvasRef.current?.releasePointerCapture(event.pointerId);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [selectedClip, updateSelectedClip]);

  const refreshTranscription = React.useCallback(async () => {
    if (!projectId || isTranscribing) return;
    setIsTranscribing(true);
    setTranscriptionError(null);

    const settings = {
      hookText,
      subtitleSize,
      musicId: selectedMusicId,
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      videoFilterKey,
      autoSfxEnabled,
      autoZoomEnabled,
      autoZoomMode,
      autoZoomBoostPercent,
      autoZoomDurationSeconds,
      introZoomOutEnabled,
      replyZoomOutEnabled,
      zoomOutStartPercent,
      zoomOutDurationSeconds,
      klimaxLogoEnabled,
      clipTransitionsEnabled,
      clipTransitionType,
      brollShutterMode,
      mirrorEnabled,
      hookBrollSplitEnabled,
      shakeEnabled,
      brollStyle,
      brollZoom,
      brollEnabled,
      logoTriggerWord: "klimax",
      subtitleStyle: { ...mergedSubtitleStyle, fontSize: subtitleSize },
      hookStyle: mergedHookStyle,
    };

    try {
      await localKlimaxApi.saveProject(projectId, { settings, clips });
      const { project } = await localKlimaxApi.transcribeProject(projectId, settings);
      // Only take the SERVER-derived fields. A full applyProjectState() here would
      // reset every toggle/position to the snapshot taken before the (minutes-long)
      // transcription, silently reverting anything the user edited meanwhile.
      setLocalProject(project);
    } catch (error: any) {
      setTranscriptionError(error.message || "Transcription impossible");
    } finally {
      setIsTranscribing(false);
    }
  }, [
    autoSfxEnabled,
    autoZoomEnabled,
    autoZoomMode,
    autoZoomBoostPercent,
    autoZoomDurationSeconds,
    brollEnabled,
    brollShutterMode,
    brollStyle,
    brollZoom,
    clips,
    clipTransitionsEnabled,
    clipTransitionType,
    hookText,
    introZoomOutEnabled,
    isTranscribing,
    klimaxLogoEnabled,
    mergedHookStyle,
    mergedSubtitleStyle,
    mirrorEnabled,
    hookBrollSplitEnabled,
    shakeEnabled,
    replyZoomOutEnabled,
    selectedMusicId,
    musicEnabled,
    musicVolumeDb,
    videoVolumeDb,
    videoFilterKey,
    zoomOutStartPercent,
    zoomOutDurationSeconds,
    projectId,
    subtitleSize,
  ]);

  React.useEffect(() => {
    if (!localProject?.id || !localProject?.sourceGroup?.id) return;
    const hasCurrentTranscription =
      localProject.transcription?.status === "completed" &&
      (localProject.transcription?.clips?.length || 0) > 0 &&
      String(localProject.transcription?.sourceFingerprint || "").includes(TRANSCRIPTION_PIPELINE_VERSION);
    if (hasCurrentTranscription) return;
    if (autoTranscriptionRef.current === localProject.id) return;
    autoTranscriptionRef.current = localProject.id;
    refreshTranscription();
  }, [
    localProject?.id,
    localProject?.sourceGroup?.id,
    localProject?.transcription?.clips?.length,
    localProject?.transcription?.sourceFingerprint,
    localProject?.transcription?.status,
    refreshTranscription,
  ]);

  const renderCurrentProject = async () => {
    if (!projectId || isRendering) return;
    if (!canStartRender) {
      setRenderError("Ajoute d'abord une source vidéo avec personne 1 et personne 2, puis les deux segments du projet.");
      return;
    }
    setIsRendering(true);
    setRenderError(null);

    const settings = {
      hookText,
      subtitleSize,
      musicId: selectedMusicId,
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      videoFilterKey,
      autoSfxEnabled,
      autoZoomEnabled,
      autoZoomMode,
      autoZoomBoostPercent,
      autoZoomDurationSeconds,
      introZoomOutEnabled,
      replyZoomOutEnabled,
      zoomOutStartPercent,
      zoomOutDurationSeconds,
      klimaxLogoEnabled,
      clipTransitionsEnabled,
      clipTransitionType,
      brollShutterMode,
      mirrorEnabled,
      hookBrollSplitEnabled,
      shakeEnabled,
      brollStyle,
      brollZoom,
      brollEnabled,
      logoTriggerWord: "klimax",
      subtitleStyle: { ...mergedSubtitleStyle, fontSize: subtitleSize },
      hookStyle: mergedHookStyle,
    };

    try {
      await localKlimaxApi.saveProject(projectId, { settings, clips });
      const { project } = await localKlimaxApi.renderProject(projectId, settings);
      // Server-derived fields only (exports, status) — keep local edits made
      // during the multi-minute render instead of resetting the whole editor.
      setLocalProject(project);
    } catch (error: any) {
      setRenderError(error.message || "Export impossible");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black overflow-hidden">
      <style>
        {`
          @keyframes klimaxSubtitlePop {
            0% { transform: scale(.72); opacity: .15; }
            68% { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes klimaxSubtitleBounce {
            0% { transform: translateY(18%) scale(.8); opacity: .2; }
            55% { transform: translateY(-7%) scale(1.08); opacity: 1; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes klimaxSubtitleRise {
            0% { transform: translateY(18%); opacity: .1; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes klimaxSubtitleFade {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes klimaxSubtitleZoom {
            0% { transform: scale(1.32); opacity: 0; filter: blur(2px); }
            100% { transform: scale(1); opacity: 1; filter: blur(0); }
          }
          @keyframes klimaxSubtitleSlide {
            0% { transform: translateX(-24%) scale(.94); opacity: 0; }
            72% { transform: translateX(3%) scale(1.02); opacity: 1; }
            100% { transform: translateX(0) scale(1); opacity: 1; }
          }
          @keyframes klimaxSubtitleShake {
            0% { transform: translateX(0) scale(1); opacity: .2; }
            18% { transform: translateX(-7%) scale(1.05); opacity: 1; }
            36% { transform: translateX(6%) scale(1.05); }
            54% { transform: translateX(-4%) scale(1.02); }
            72% { transform: translateX(3%) scale(1.01); }
            100% { transform: translateX(0) scale(1); opacity: 1; }
          }
          @keyframes klimaxSubtitleType {
            0% { clip-path: inset(0 100% 0 0); opacity: 1; }
            100% { clip-path: inset(0 0 0 0); opacity: 1; }
          }
          @keyframes klimaxSubtitleFlicker {
            0% { opacity: 0; }
            12% { opacity: 1; }
            22% { opacity: .18; }
            34% { opacity: 1; }
            48% { opacity: .55; }
            62% { opacity: 1; }
            100% { opacity: 1; }
          }
          @keyframes klimaxSubtitleElastic {
            0% { transform: scale(.55,1.28); opacity: .08; }
            42% { transform: scale(1.18,.88); opacity: 1; }
            66% { transform: scale(.94,1.06); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes klimaxLogoGrow {
            0% { transform: scale(0); opacity: 0; }
            55% { transform: scale(1.12); opacity: 1; }
            70% { transform: scale(0.96); }
            82% { transform: scale(1.03); }
            100% { transform: scale(1); opacity: 1; }
            /* hold at full size, then the loop restarts to replay the pop-in */
          }
        `}
      </style>

      <header className="relative z-20 h-20 border-b border-white/10 bg-black/80 backdrop-blur-xl flex items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="rounded-full border border-white/10 bg-white/[0.03] text-white hover:bg-white hover:text-black"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-9 w-9 rounded-full overflow-hidden bg-white grid place-items-center">
            <img src="/klimax-logo.jpeg" alt="Klimax logo" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black uppercase tracking-tight truncate">
              {projectSource?.title || "Nouveau projet"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={renderCurrentProject} disabled={isRendering || !canStartRender} className="rounded-full bg-white text-black hover:bg-white/90 font-black disabled:opacity-40">
            <Play className="mr-2 h-4 w-4 fill-current" />
            {isRendering ? "Export..." : "Créer la vidéo"}
          </Button>
        </div>
      </header>

      <main className="relative z-10 grid h-[calc(100vh-80px)] grid-cols-1 xl:grid-cols-[minmax(440px,600px)_minmax(0,1fr)] overflow-hidden">

        {/* ============ COLONNE GAUCHE (fixe) : aperçu épinglé + exports ============ */}
        <aside className="order-first xl:order-none xl:col-start-1 xl:row-start-1 overflow-y-auto border-b xl:border-b-0 xl:border-r border-white/10 bg-black/50 p-4 lg:p-6">
            <div className="sticky top-0 z-20 space-y-4 pb-4">
              <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
                <div
                  ref={previewCanvasRef}
                  className="mx-auto aspect-[9/16] w-full max-w-[calc((100vh_-_170px)*9/16)] rounded-[28px] bg-neutral-950 overflow-hidden relative border border-white/10 touch-none"
                  style={{ containerType: "size" }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,#ffffff26,transparent_28%),linear-gradient(160deg,#1f1f1f,#050505_52%,#202020)]" />
                  {selectedClip?.dualSpeakerEnabled ? (
                    (() => {
                      // Match the export: ratio clamped to [0.2, 0.8], TOP =
                      // round(1920*ratio), BOTTOM = the remainder.
                      const splitRatio = clampValue(selectedClip?.dualSpeakerSplitRatio ?? 0.5, 0.2, 0.8);
                      const addedAtTop = (selectedClip?.dualSpeakerPosition ?? "top") === "top";
                      const mainCropY = selectedClip?.dualSpeakerMainCropY ?? 0;
                      const addedCropY = selectedClip?.dualSpeakerAddedCropY ?? 0;
                      const mainCropX = selectedClip?.dualSpeakerMainCropX ?? 0;
                      const addedCropX = selectedClip?.dualSpeakerAddedCropX ?? 0;
                      const mainZoom = selectedClip?.dualSpeakerMainZoom ?? 100;
                      const addedZoom = selectedClip?.dualSpeakerAddedZoom ?? 100;
                      const TOP_BAND = Math.round(BASE_CANVAS_HEIGHT * splitRatio);
                      const BOTTOM_BAND = BASE_CANVAS_HEIGHT - TOP_BAND;
                      const topPct = (TOP_BAND / BASE_CANVAS_HEIGHT) * 100;
                      const bottomPct = (BOTTOM_BAND / BASE_CANVAS_HEIGHT) * 100;
                      const mainUrl = selectedSourceAsset?.fileUrl;
                      const addedUrl = dualSpeakerAddedAsset?.fileUrl;
                      const topUrl = addedAtTop ? addedUrl : mainUrl;
                      const topCropY = addedAtTop ? addedCropY : mainCropY;
                      const topCropX = addedAtTop ? addedCropX : mainCropX;
                      const topZoom = addedAtTop ? addedZoom : mainZoom;
                      const bottomUrl = addedAtTop ? mainUrl : addedUrl;
                      const bottomCropY = addedAtTop ? mainCropY : addedCropY;
                      const bottomCropX = addedAtTop ? mainCropX : addedCropX;
                      const bottomZoom = addedAtTop ? mainZoom : addedZoom;
                      const renderBand = (
                        url: string | undefined,
                        cropY: number,
                        cropX: number,
                        zoom: number,
                        bandKey: string
                      ) =>
                        url ? (
                          // exportBandFrameStyle frames this band exactly like the
                          // export (cover + fraction pan + centered zoom) without
                          // needing the source dimensions. The band's overflow-hidden
                          // clips the overscan; the pan can never reveal a black bar.
                          (() => {
                            const bandStyle = exportBandFrameStyle(
                              clampValue(zoom, 100, 220) / 100,
                              clampValue(cropX, -480, 480),
                              clampValue(cropY, -480, 480)
                            );
                            return (
                              <video
                                key={`${bandKey}-${url}`}
                                src={url}
                                muted
                                playsInline
                                style={{
                                  ...bandStyle,
                                  // Mirror preview matches the export's hflip (content only).
                                  ...(mirrorEnabled ? { transform: `${bandStyle.transform ?? ""} scaleX(-1)`.trim() } : {}),
                                  filter: selectedVideoFilter.css,
                                }}
                              />
                            );
                          })()
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                            Source manquante
                          </div>
                        );
                      return (
                        <>
                          <div
                            className="absolute left-0 top-0 w-full overflow-hidden"
                            style={{ height: `${topPct}%` }}
                          >
                            {renderBand(topUrl, topCropY, topCropX, topZoom, "dual-top")}
                          </div>
                          <div
                            className="absolute left-0 w-full overflow-hidden"
                            style={{ top: `${topPct}%`, height: `${bottomPct}%` }}
                          >
                            {renderBand(bottomUrl, bottomCropY, bottomCropX, bottomZoom, "dual-bottom")}
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    selectedSourceAsset?.fileUrl && (
                      <video
                        key={selectedSourceAsset.id}
                        src={selectedSourceAsset.fileUrl}
                        className="absolute object-fill opacity-80 cursor-move"
                        onLoadedMetadata={(event) => {
                          const { videoWidth, videoHeight } = event.currentTarget;
                          if (!videoWidth || !videoHeight) return;
                          setSourceVideoSizes((current) => ({
                            ...current,
                            [selectedSourceAsset.id]: { width: videoWidth, height: videoHeight },
                          }));
                        }}
                        onPointerDown={(event) => startClipDrag("video", event)}
                        muted
                        playsInline
                        style={{
                          ...previewVideoFrameStyle,
                          // Mirror preview matches the export's hflip (content only).
                          ...(mirrorEnabled
                            ? { transform: `${(previewVideoFrameStyle as React.CSSProperties).transform ?? ""} scaleX(-1)`.trim() }
                            : {}),
                          maxWidth: "none",
                          maxHeight: "none",
                          filter: selectedVideoFilter.css,
                          touchAction: "none",
                        }}
                      />
                    )
                  )}
                  <div className="absolute inset-0 opacity-40 bg-[linear-gradient(120deg,transparent_0%,#fff_48%,transparent_54%)] translate-x-[-35%]" />
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
                    <span>{selectedClip?.stage === "reply" ? "Personne 2" : "Personne 1"}</span>
                    <span>9:16</span>
                  </div>
                  {activeDragKind && (
                    <>
                      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/45 shadow-[0_0_16px_rgba(255,255,255,0.65)]" />
                      <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/35 shadow-[0_0_16px_rgba(255,255,255,0.55)]" />
                      <div className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-black/30" />
                      <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/75">
                        {activeDragKind === "video" ? "Recadrage video" : "Snap centre actif"}
                      </div>
                    </>
                  )}

                  {/* B-roll: only on Personne 2, below the centered text. The Klimax
                      logo is a separate overlay below, placed by logoPosition/logoSize. */}
                  {selectedClipCanUseBroll && brollEnabled && (
                    <div className="absolute inset-x-5 top-[54%] h-[38%] rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-[2px] overflow-hidden">
                      <div className="absolute inset-0 grid place-items-center">
                        <CirclePlay className="h-16 w-16 text-white/70" />
                      </div>
                      {selectedImageAsset?.fileUrl && (
                        <img
                          src={selectedImageAsset.fileUrl}
                          alt={selectedImageAsset.title}
                          className="absolute left-1/2 top-1/2 h-[78%] w-[78%] object-contain cursor-move"
                          onPointerDown={(event) => startClipDrag("image", event)}
                          style={{
                            touchAction: "none",
                            transform: `translate(-50%, -50%) translate(${selectedClip?.imageTransform?.x ?? 0}px, ${
                              selectedClip?.imageTransform?.y ?? 0
                            }px) scale(${(selectedClip?.imageTransform?.scale ?? 100) / 100})`,
                          }}
                        />
                      )}
                    </div>
                  )}

                  {!selectedClip || selectedClip.stage === "intro" ? (
                    <>
                      <div
                        className="absolute flex justify-center"
                        style={{
                          left: `${(selectedClipPositions.hookPosition.x / BASE_CANVAS_WIDTH) * 100}%`,
                          top: `${(selectedClipPositions.hookPosition.y / BASE_CANVAS_HEIGHT) * 100}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <div
                          // Hook bubble like the reference: white rounded rectangle that
                          // HUGS the text and stretches with it (w-fit), wraps once it hits
                          // the max width, always with the soft drop shadow.
                          className="relative flex w-fit items-center justify-center text-center shadow-[0_16px_50px_rgba(0,0,0,0.45)] cursor-move select-none"
                          style={{
                            backgroundColor: mergedHookStyle.bubbleColor || "#ffffff",
                            maxWidth: canvasUnit(selectedClipPositions.hookSize.width),
                            minHeight: canvasUnit(selectedClipPositions.hookSize.height),
                            borderRadius: canvasUnit(HOOK_BUBBLE_RADIUS),
                            boxSizing: "border-box",
                            padding: `${canvasUnit(HOOK_BUBBLE_PAD_Y)} ${canvasUnit(HOOK_BUBBLE_PAD_X)}`,
                            touchAction: "none",
                          }}
                          onPointerDown={(event) => startClipDrag("hook", event)}
                        >
                          <p
                            className="relative z-10 whitespace-pre-line leading-snug break-words"
                            style={{
                              color: mergedHookStyle.textColor || "#000000",
                              // Fixed clean sans for the hook (matches the reference image),
                              // independent of the subtitle font picker.
                              fontFamily: HOOK_FONT_CSS,
                              fontWeight: 600,
                              fontSize: canvasFontSize(mergedHookStyle.fontSize || DEFAULT_TEXT_SIZE),
                              maxWidth: canvasUnit(Math.max(120, selectedClipPositions.hookSize.width - HOOK_BUBBLE_PAD_X * 2)),
                            }}
                          >
                            {selectedClip?.hookText || hookText}
                          </p>
                        </div>
                      </div>
                      <div
                        className="absolute flex justify-center"
                        style={{
                          left: `${(selectedClipPositions.subtitlePosition.x / BASE_CANVAS_WIDTH) * 100}%`,
                          top: `${(selectedClipPositions.subtitlePosition.y / BASE_CANVAS_HEIGHT) * 100}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <p
                          className="max-w-[92%] whitespace-nowrap text-center font-black leading-tight cursor-move select-none"
                          style={{ ...subtitlePreviewStyle, touchAction: "none" }}
                          onPointerDown={(event) => startClipDrag("subtitle", event)}
                        >
                          {subtitlePreviewText}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="absolute flex justify-center"
                        style={{
                          left: `${(selectedClipPositions.subtitlePosition.x / BASE_CANVAS_WIDTH) * 100}%`,
                          top: `${(selectedClipPositions.subtitlePosition.y / BASE_CANVAS_HEIGHT) * 100}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <p
                          className="max-w-[95%] whitespace-nowrap text-center font-black leading-tight cursor-move select-none"
                          style={{ ...subtitlePreviewStyle, touchAction: "none" }}
                          onPointerDown={(event) => startClipDrag("subtitle", event)}
                        >
                          {subtitlePreviewText}
                        </p>
                      </div>
                      {/* Logo Klimax : positionné/dimensionné par logoPosition + logoSize
                          (les curseurs X / Y / Taille agissent en direct), fond transparent,
                          déplaçable. */}
                      {klimaxLogoEnabled && (
                        <div
                          className="absolute cursor-move"
                          style={{
                            left: `${(selectedClipPositions.logoPosition.x / BASE_CANVAS_WIDTH) * 100}%`,
                            top: `${(selectedClipPositions.logoPosition.y / BASE_CANVAS_HEIGHT) * 100}%`,
                            width: canvasUnit(selectedClipPositions.logoSize * LOGO_PREVIEW_FRAME_RATIO),
                            transform: "translate(-50%, -50%)",
                            touchAction: "none",
                          }}
                          onPointerDown={(event) => startClipDrag("logo", event)}
                        >
                          <KlimaxLogoPlacementPreview />
                        </div>
                      )}
                    </>
                  )}

                  <div className="absolute bottom-5 left-5 right-5 flex gap-2">
                    <button
                      onClick={() => {
                        const firstIntro = clips.find((clip) => clip.stage === "intro") || clips[0];
                        if (firstIntro) setSelectedClipId(firstIntro.id);
                      }}
                      className={cn("h-2 flex-1 rounded-full", selectedClip?.stage !== "reply" ? "bg-white" : "bg-white/20")}
                    />
                    <button
                      onClick={() => {
                        const secondReply = clips.find((clip) => clip.stage === "reply");
                        if (secondReply) setSelectedClipId(secondReply.id);
                      }}
                      className={cn("h-2 flex-1 rounded-full", selectedClip?.stage === "reply" ? "bg-white" : "bg-white/20")}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    const firstIntro = clips.find((clip) => clip.stage === "intro") || clips[0];
                    if (firstIntro) setSelectedClipId(firstIntro.id);
                  }}
                  className={cn("rounded-2xl border-white/10 h-12", selectedClip?.stage !== "reply" ? "bg-white text-black" : "bg-white/[0.03] text-white hover:bg-white/10")}
                >
                  Personne 1
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const secondReply = clips.find((clip) => clip.stage === "reply");
                    if (secondReply) setSelectedClipId(secondReply.id);
                  }}
                  className={cn("rounded-2xl border-white/10 h-12", selectedClip?.stage === "reply" ? "bg-white text-black" : "bg-white/[0.03] text-white hover:bg-white/10")}
                >
                  Personne 2
                </Button>
              </div>
            </div>
            {/* fin du bloc épinglé (aperçu + switch) — les exports défilent dessous */}

            {(exportHistory.length > 0 || renderError) && (
              <div className="mt-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Exports locaux</p>
                    <span className="text-xs text-white/45">{exportHistory.length} export(s)</span>
                  </div>
                  {exportHistory[0]?.url ? (
                    <div className="mt-4 space-y-4">
                      <video src={exportHistory[0].url} controls preload="metadata" className="w-full rounded-2xl border border-white/10" />
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-emerald-100">Dernier export prêt</p>
                            <p className="mt-1 text-xs text-emerald-50/65">
                              {exportHistory[0].createdAt ? new Date(exportHistory[0].createdAt).toLocaleString("fr-FR") : "Date inconnue"}
                            </p>
                          </div>
                          <BadgeCheck className="h-5 w-5 text-emerald-200" />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-black/35 p-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Format</p>
                            <p className="mt-1 text-xs font-black">
                              {exportHistory[0].width && exportHistory[0].height
                                ? `${exportHistory[0].width}x${exportHistory[0].height}`
                                : "MP4"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-black/35 p-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Durée</p>
                            <p className="mt-1 text-xs font-black">
                              {exportHistory[0].duration ? formatDuration(exportHistory[0].duration) : "inconnue"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-black/35 p-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Poids</p>
                            <p className="mt-1 text-xs font-black">{formatBytes(exportHistory[0].sizeBytes)}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <a
                            href={exportHistory[0].url}
                            download
                            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-black text-black hover:bg-white/90"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Télécharger MP4
                          </a>
                          <a
                            href={exportHistory[0].url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Ouvrir
                          </a>
                        </div>
                      </div>
                      {exportHistory.length > 1 && (
                        <div className="grid gap-3">
                          {exportHistory.slice(1).map((entry, index) => (
                            <div key={`${entry.url || entry.createdAt || index}`} className="rounded-2xl border border-white/10 bg-black p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black">Export précédent {index + 1}</p>
                                  <p className="text-xs text-white/45">
                                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString("fr-FR") : "Date inconnue"}
                                    {entry.width && entry.height ? ` · ${entry.width}x${entry.height}` : ""}
                                    {entry.sizeBytes ? ` · ${formatBytes(entry.sizeBytes)}` : ""}
                                  </p>
                                </div>
                                {entry.url && (
                                  <div className="flex gap-2">
                                    <a href={entry.url} download className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white hover:bg-white/10">
                                      Télécharger
                                    </a>
                                    <a href={entry.url} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white hover:bg-white/10">
                                      Ouvrir
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : renderError ? (
                    <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>{renderError}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
        </aside>

        {/* ============ COLONNE DROITE (scroll) : tous les paramètres ============ */}
        <div className="order-last xl:order-none xl:col-start-2 xl:row-start-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">Montage</p>
                    <h2 className="text-3xl font-black tracking-tight">Montage manuel</h2>
                  </div>
                </div>

                <Tabs defaultValue="manual" value="manual">
                  <TabsContent value="manual" className="mt-6 space-y-5">
                    <div className="grid gap-4">
                      {/* ===================== SECTION : HOOK ===================== */}
                      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="font-black uppercase tracking-tight">Hook</h3>
                            <p className="text-xs text-white/45">Texte d'accroche, police, couleurs et position de la bulle.</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Hook texte personne 1</Label>
                          <Textarea
                            value={hookText}
                            onChange={(e) => {
                              const next = e.target.value;
                              setHookText(next);
                              // The hook ALWAYS belongs to the intro clip — writing to the
                              // selected clip put it on Personne 2 when that clip was open
                              // (and the export then kept the old intro hook).
                              setClips((current) =>
                                current.map((c) => (c.stage === "intro" ? { ...c, hookText: next } : c))
                              );
                            }}
                            rows={5}
                            className="min-h-[130px] rounded-2xl bg-black border-white/10 text-white font-bold leading-snug"
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black p-4 md:col-span-2">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Police hook text</Label>
                            <p className="mt-2 text-xs text-white/45">Police fixe (style bulle de la réf) — bulle blanche arrondie + ombre, s'allonge avec le texte. Tu gardes la couleur et la taille.</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black p-4">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Couleur bulle hook</Label>
                            <div className="mt-3 flex items-center gap-3">
                              <input
                                type="color"
                                value={mergedHookStyle.bubbleColor || "#ffffff"}
                                onChange={(e) => setHookStyle((current) => ({ ...current, bubbleColor: e.target.value }))}
                                className="h-11 w-16 rounded-xl border border-white/10 bg-transparent"
                              />
                              <span className="text-sm text-white/55">{mergedHookStyle.bubbleColor || "#ffffff"}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black p-4">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Couleur texte hook</Label>
                            <div className="mt-3 flex items-center gap-3">
                              <input
                                type="color"
                                value={mergedHookStyle.textColor || "#000000"}
                                onChange={(e) => setHookStyle((current) => ({ ...current, textColor: e.target.value }))}
                                className="h-11 w-16 rounded-xl border border-white/10 bg-transparent"
                              />
                              <span className="text-sm text-white/55">{mergedHookStyle.textColor || "#000000"}</span>
                            </div>
                          </div>
                        </div>
                        {selectedClip && selectedClip.stage === "intro" && (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Hook bulle</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateSelectedClip({ hookPosition: { x: 540, y: selectedClipPositions.hookPosition.y } })
                                }
                                className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                              >
                                Centrer élément
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">X</Label>
                              <span className="text-sm font-black">{selectedClipPositions.hookPosition.x}px</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.hookPosition.x]}
                              min={0}
                              max={1080}
                              step={1}
                              onValueChange={([value]) =>
                                updateSelectedClip({
                                  hookPosition: {
                                    x: value,
                                    y: selectedClipPositions.hookPosition.y,
                                  },
                                })
                              }
                            />
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Y</Label>
                              <span className="text-sm font-black">{selectedClipPositions.hookPosition.y}px</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.hookPosition.y]}
                              min={0}
                              max={1920}
                              step={1}
                              onValueChange={([value]) =>
                                updateSelectedClip({
                                  hookPosition: {
                                    x: selectedClipPositions.hookPosition.x,
                                    y: value,
                                  },
                                })
                              }
                            />
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Largeur</Label>
                                  <span className="text-sm font-black">{selectedClipPositions.hookSize.width}px</span>
                                </div>
                                <Slider
                                  value={[selectedClipPositions.hookSize.width]}
                                  min={360}
                                  max={1080}
                                  step={10}
                                  onValueChange={([value]) =>
                                    updateSelectedClip({
                                      hookSize: {
                                        width: value,
                                        height: selectedClipPositions.hookSize.height,
                                      },
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Hauteur</Label>
                                  <span className="text-sm font-black">{selectedClipPositions.hookSize.height}px</span>
                                </div>
                                <Slider
                                  value={[selectedClipPositions.hookSize.height]}
                                  min={90}
                                  max={360}
                                  step={10}
                                  onValueChange={([value]) =>
                                    updateSelectedClip({
                                      hookSize: {
                                        width: selectedClipPositions.hookSize.width,
                                        height: value,
                                      },
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Taille texte</Label>
                              <span className="text-sm font-black">{hookStyle.fontSize ?? DEFAULT_HOOK_STYLE.fontSize}px</span>
                            </div>
                            <Slider
                              value={[hookStyle.fontSize ?? DEFAULT_HOOK_STYLE.fontSize]}
                              min={12}
                              max={220}
                              step={1}
                              onValueChange={([value]) =>
                                setHookStyle((current) => ({ ...current, fontSize: value }))
                              }
                            />
                          </div>
                        )}
                      </div>

                      {/* ===================== SECTION : SOUS-TITRES ===================== */}
                      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                            <Captions className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="font-black uppercase tracking-tight">Sous-titres</h3>
                            <p className="text-xs text-white/45">Style, animations, couleurs, taille et position des sous-titres.</p>
                          </div>
                        </div>
                      <div className="rounded-2xl border border-white/10 bg-black p-4 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                              <Captions className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-wide">Sous-titres automatiques</p>
                              <p className="text-xs text-white/45">Transcription locale avant export, sans points virgules ni points d'interrogation.</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={refreshTranscription}
                            disabled={isTranscribing}
                            className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                          >
                            {isTranscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isTranscribing ? "Transcription..." : "Actualiser"}
                          </Button>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-white/35">Aperçu texte détecté</p>
                          <p className="mt-2 text-sm font-bold text-white/80">
                            {selectedTranscription?.cues?.slice(0, 3).map((cue) => cue.text).join(" / ") || selectedClip?.subtitle || "Transcription en attente"}
                          </p>
                          {transcriptionError && <p className="mt-2 text-xs text-red-300">{transcriptionError}</p>}
                        </div>
                      </div>
                      {selectedClip && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Position sous-titres</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateSelectedClip({
                                  subtitlePosition: { x: 540, y: selectedClipPositions.subtitlePosition.y },
                                })
                              }
                              className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                            >
                              Centrer sous-titres
                            </Button>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">X</Label>
                            <span className="text-sm font-black">{selectedClipPositions.subtitlePosition.x}px</span>
                          </div>
                          <Slider
                            value={[selectedClipPositions.subtitlePosition.x]}
                            min={0}
                            max={1080}
                            step={1}
                            onValueChange={([value]) =>
                                updateSelectedClip({
                                  subtitlePosition: {
                                    x: value,
                                    y: selectedClipPositions.subtitlePosition.y,
                                  },
                              })
                            }
                          />
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Y</Label>
                            <span className="text-sm font-black">{selectedClipPositions.subtitlePosition.y}px</span>
                          </div>
                          <Slider
                            value={[selectedClipPositions.subtitlePosition.y]}
                            min={0}
                            max={1920}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedClip({
                                subtitlePosition: {
                                  x: selectedClipPositions.subtitlePosition.x,
                                  y: value,
                                },
                              })
                            }
                          />
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Taille</Label>
                            <span className="text-sm font-black">{subtitleSize}px</span>
                          </div>
                          <Slider
                            value={[subtitleSize]}
                            min={12}
                            max={200}
                            step={1}
                            onValueChange={([value]) => {
                              setSubtitleSize(value);
                              setSubtitleStyle((current) => ({ ...current, fontSize: value }));
                            }}
                          />
                        </div>
                      )}
                      <div className="rounded-2xl border border-white/10 bg-black p-4 space-y-4">
                        <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Style sous-titres</Label>
                        <div className="grid gap-3 md:grid-cols-4">
                          {VISUAL_SUBTITLE_PRESETS.map((preset) => {
                            const preview = SUBTITLE_PRESETS[preset.key];
                            const active = mergedSubtitleStyle.stylePreset === preset.key;

                            return (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => {
                                  applySubtitleTextPreset(preview);
                                }}
                                className={cn(
                                  "relative h-24 overflow-hidden rounded-2xl border bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.08]",
                                  active ? "border-white shadow-[0_0_0_1px_rgba(255,255,255,0.45)]" : "border-white/10"
                                )}
                              >
                                {preset.badge && (
                                  <span className="absolute left-3 top-3 rounded bg-white px-2 py-0.5 text-[10px] font-black italic text-black shadow-[3px_3px_0_#b8a7ff]">
                                    {preset.badge}
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    "absolute left-4 right-4 top-1/2 block -translate-y-1/2 whitespace-nowrap text-center font-black leading-none",
                                    preset.key === "quickFade" && "text-left italic",
                                    preset.key === "proQuick" && "text-right lowercase"
                                  )}
                                  style={{
                                    ...buildSubtitleTextPreviewStyle(
                                      preview,
                                      preset.key === "quickFade" ? "12px" : preset.key === "orangeThe" ? "30px" : "24px",
                                      { loopAnimation: true, centerY: true }
                                    ),
                                    opacity: preset.key === "quickFade" ? 0.96 : 1,
                                  }}
                                >
                                  {preset.sample}
                                </span>
                                <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white">
                                  <Download className="h-4 w-4" />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Animations sous-titres</Label>
                          <div className="grid gap-3 md:grid-cols-4">
                            {SUBTITLE_ANIMATION_PRESETS.map((animationPreset) => {
                              const active = (mergedSubtitleStyle.animationPreset || "pop") === animationPreset.key;

                              return (
                                <button
                                  key={animationPreset.key}
                                  type="button"
                                  onClick={() =>
                                    setSubtitleStyle((current) => {
                                      // Clicking the already-selected animation toggles it off,
                                      // falling back to the animation built into the style preset.
                                      const presetAnim = SUBTITLE_PRESETS[current.stylePreset || "impact"]?.animationPreset;
                                      const isActive = (current.animationPreset || presetAnim || "pop") === animationPreset.key;
                                      return {
                                        ...current,
                                        animationPreset: isActive ? presetAnim : animationPreset.key,
                                      };
                                    })
                                  }
                                  className={cn(
                                    "relative h-24 overflow-hidden rounded-2xl border bg-white/[0.04] p-3 transition hover:bg-white/[0.08]",
                                    active ? "border-white shadow-[0_0_0_1px_rgba(255,255,255,0.45)]" : "border-white/10"
                                  )}
                                >
                                  <span
                                    className="absolute inset-x-2 top-1/2 block -translate-y-1/2 whitespace-nowrap text-center font-black leading-none"
                                    style={{
                                      ...buildSubtitleTextPreviewStyle(
                                        mergedSubtitleStyle,
                                        animationPreset.key === "rise" ? "30px" : animationPreset.key === "elastic" ? "20px" : "23px",
                                        {
                                          animationPreset: animationPreset.key,
                                          loopAnimation: animationPreset.key !== "none",
                                          centerY: true,
                                        }
                                      ),
                                    }}
                                  >
                                    {animationPreset.sample}
                                  </span>
                                  <span className="absolute bottom-2 left-3 right-3 truncate text-left text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                                    {animationPreset.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Police</Label>
                            <Select
                              value={mergedSubtitleStyle.fontFamily || "Arial Bold"}
                              onValueChange={(value) => setSubtitleStyle((current) => ({ ...current, fontFamily: value }))}
                            >
                              <SelectTrigger className="rounded-2xl border-white/10 bg-white/[0.03]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FONT_OPTIONS.map((font) => (
                                  <SelectItem key={font.value} value={font.value}>
                                    {font.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Mots par ligne</Label>
                            <Select
                              value={String(mergedSubtitleStyle.wordsPerLine || 2)}
                              onValueChange={(value) => setSubtitleStyle((current) => ({ ...current, wordsPerLine: Number(value) }))}
                            >
                              <SelectTrigger className="rounded-2xl border-white/10 bg-white/[0.03]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 mot</SelectItem>
                                <SelectItem value="2">2 mots</SelectItem>
                                <SelectItem value="3">3 mots</SelectItem>
                                <SelectItem value="4">4 mots</SelectItem>
                                <SelectItem value="5">5 mots</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Texte</Label>
                            <input
                              type="color"
                              value={mergedSubtitleStyle.textColor || "#ffffff"}
                              onChange={(e) => setSubtitleStyle((current) => ({ ...current, textColor: e.target.value }))}
                              className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-transparent"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Contour</Label>
                            <input
                              type="color"
                              value={mergedSubtitleStyle.strokeColor || "#000000"}
                              onChange={(e) => setSubtitleStyle((current) => ({ ...current, strokeColor: e.target.value }))}
                              className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-transparent"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Ombre</Label>
                            <input
                              type="color"
                              value={mergedSubtitleStyle.shadowColor || "#000000"}
                              onChange={(e) => setSubtitleStyle((current) => ({ ...current, shadowColor: e.target.value }))}
                              className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-transparent"
                            />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">Mots clés colorés</p>
                              <p className="text-xs text-white/45">Auto-détection des mots forts, nombres, Klimax et termes importants.</p>
                            </div>
                            <Switch
                              checked={mergedSubtitleStyle.keywordHighlightEnabled !== false}
                              onCheckedChange={(checked) => setSubtitleStyle((current) => ({ ...current, keywordHighlightEnabled: checked }))}
                            />
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Couleur 1</Label>
                              <input
                                type="color"
                                value={mergedSubtitleStyle.keywordColor || DEFAULT_SUBTITLE_STYLE.keywordColor}
                                onChange={(e) => setSubtitleStyle((current) => ({ ...current, keywordColor: e.target.value }))}
                                className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-transparent"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Couleur 2</Label>
                              <input
                                type="color"
                                value={mergedSubtitleStyle.keywordSecondaryColor || DEFAULT_SUBTITLE_STYLE.keywordSecondaryColor}
                                onChange={(e) => setSubtitleStyle((current) => ({ ...current, keywordSecondaryColor: e.target.value }))}
                                className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-transparent"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Mots forcés</Label>
                            <input
                              value={mergedSubtitleStyle.keywordTerms || ""}
                              onChange={(e) => setSubtitleStyle((current) => ({ ...current, keywordTerms: e.target.value }))}
                              placeholder="klimax, exercice, confiance"
                              className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white outline-none placeholder:text-white/25"
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold">Contour</span>
                              <Switch
                                checked={mergedSubtitleStyle.strokeEnabled !== false}
                                onCheckedChange={(checked) => setSubtitleStyle((current) => ({ ...current, strokeEnabled: checked }))}
                              />
                            </div>
                            <div className="mt-3">
                              <Slider
                                value={[mergedSubtitleStyle.strokeWidth || 4]}
                                min={0}
                                max={14}
                                step={1}
                                onValueChange={([value]) => setSubtitleStyle((current) => ({ ...current, strokeWidth: value }))}
                              />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold">Ombre</span>
                              <Switch
                                checked={mergedSubtitleStyle.shadowEnabled !== false}
                                onCheckedChange={(checked) => setSubtitleStyle((current) => ({ ...current, shadowEnabled: checked }))}
                              />
                            </div>
                            <div className="mt-3">
                              <Slider
                                value={[mergedSubtitleStyle.shadowDistance || 4]}
                                min={0}
                                max={22}
                                step={1}
                                onValueChange={([value]) => setSubtitleStyle((current) => ({ ...current, shadowDistance: value }))}
                              />
                            </div>
                            <div className="mt-4">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Flou</Label>
                                <span className="text-sm font-black">{mergedSubtitleStyle.shadowBlur ?? 14}px</span>
                              </div>
                              <Slider
                                value={[mergedSubtitleStyle.shadowBlur ?? 14]}
                                min={0}
                                max={36}
                                step={1}
                                onValueChange={([value]) => setSubtitleStyle((current) => ({ ...current, shadowBlur: value }))}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                      {/* end SECTION : SOUS-TITRES */}

                      {/* ===================== SECTION : VIDÉO ===================== */}
                      {selectedClip && (
                        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                              <Film className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="font-black uppercase tracking-tight">Vidéo</h3>
                              <p className="text-xs text-white/45">Zoom et cadrage de la vidéo source.</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Deuxième speaker (split-screen)</p>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-sm font-bold text-white/80">Ajouter un 2e speaker</Label>
                              <Switch
                                checked={selectedClip?.dualSpeakerEnabled ?? false}
                                onCheckedChange={(v) => updateSelectedClip({ dualSpeakerEnabled: v })}
                              />
                            </div>
                            {selectedClip?.dualSpeakerEnabled && (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Source</Label>
                                  <Select
                                    value={selectedClip?.dualSpeakerSource ?? undefined}
                                    onValueChange={(id) => updateSelectedClip({ dualSpeakerSource: id })}
                                  >
                                    <SelectTrigger className="rounded-2xl border-white/10 bg-white/[0.03]">
                                      <SelectValue placeholder="Choisir une vidéo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {dualSpeakerVideoAssets.length === 0 ? (
                                        <SelectItem value="__none__" disabled>
                                          Aucune vidéo dans la banque
                                        </SelectItem>
                                      ) : (
                                        dualSpeakerVideoAssets.map((asset) => (
                                          <SelectItem key={asset.id} value={asset.id}>
                                            {asset.title}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Position du 2e speaker</Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateSelectedClip({ dualSpeakerPosition: "top" })}
                                      className={`rounded-full border-white/10 ${
                                        (selectedClip?.dualSpeakerPosition ?? "top") === "top"
                                          ? "bg-white text-black hover:bg-white/90"
                                          : "bg-white/[0.03] text-white hover:bg-white/10"
                                      }`}
                                    >
                                      Haut
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateSelectedClip({ dualSpeakerPosition: "bottom" })}
                                      className={`rounded-full border-white/10 ${
                                        selectedClip?.dualSpeakerPosition === "bottom"
                                          ? "bg-white text-black hover:bg-white/90"
                                          : "bg-white/[0.03] text-white hover:bg-white/10"
                                      }`}
                                    >
                                      Bas
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Répartition</Label>
                                    <span className="text-sm font-black">{Math.round((selectedClip?.dualSpeakerSplitRatio ?? 0.5) * 100)}%</span>
                                  </div>
                                  <Slider
                                    value={[selectedClip?.dualSpeakerSplitRatio ?? 0.5]}
                                    min={0.2}
                                    max={0.8}
                                    step={0.01}
                                    onValueChange={([value]) => updateSelectedClip({ dualSpeakerSplitRatio: value })}
                                  />
                                  <p className="text-[11px] text-white/40">Glisse pour agrandir la bande du bas / du haut.</p>
                                </div>
                                {/* Auto-centrage visages */}
                                <div className="space-y-2 pt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isCenteringFaces}
                                    onClick={handleCenterFaces}
                                    className="w-full rounded-full border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
                                  >
                                    {isCenteringFaces ? "Détection des visages…" : "Centrer sur les visages"}
                                  </Button>
                                  <p className="text-[11px] text-white/40">
                                    Détecte automatiquement chaque visage et recadre les deux bandes dessus.
                                  </p>
                                </div>

                                {/* Bande originale */}
                                <p className="pt-2 text-xs font-black uppercase tracking-[0.2em] text-white/45">Bande originale</p>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Zoom</Label>
                                    <span className="text-sm font-black">{selectedClip?.dualSpeakerMainZoom ?? 100}%</span>
                                  </div>
                                  <Slider
                                    value={[selectedClip?.dualSpeakerMainZoom ?? 100]}
                                    min={100}
                                    max={220}
                                    step={1}
                                    onValueChange={([value]) => updateSelectedClip({ dualSpeakerMainZoom: value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Cadrage horizontal</Label>
                                    <span className="text-sm font-black">{selectedClip?.dualSpeakerMainCropX ?? 0}px</span>
                                  </div>
                                  <Slider
                                    value={[selectedClip?.dualSpeakerMainCropX ?? 0]}
                                    min={-480}
                                    max={480}
                                    step={2}
                                    onValueChange={([value]) => updateSelectedClip({ dualSpeakerMainCropX: value })}
                                  />
                                  <p className="text-[11px] text-white/40">positif = sujet vers la gauche</p>
                                </div>

                                {/* 2e speaker */}
                                <p className="pt-2 text-xs font-black uppercase tracking-[0.2em] text-white/45">2e speaker</p>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Zoom</Label>
                                    <span className="text-sm font-black">{selectedClip?.dualSpeakerAddedZoom ?? 100}%</span>
                                  </div>
                                  <Slider
                                    value={[selectedClip?.dualSpeakerAddedZoom ?? 100]}
                                    min={100}
                                    max={220}
                                    step={1}
                                    onValueChange={([value]) => updateSelectedClip({ dualSpeakerAddedZoom: value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Cadrage horizontal</Label>
                                    <span className="text-sm font-black">{selectedClip?.dualSpeakerAddedCropX ?? 0}px</span>
                                  </div>
                                  <Slider
                                    value={[selectedClip?.dualSpeakerAddedCropX ?? 0]}
                                    min={-480}
                                    max={480}
                                    step={2}
                                    onValueChange={([value]) => updateSelectedClip({ dualSpeakerAddedCropX: value })}
                                  />
                                  <p className="text-[11px] text-white/40">positif = sujet vers la gauche</p>
                                </div>
                                <p className="text-[11px] text-white/40">
                                  Ces réglages gardent chaque visage centré dans sa bande. Utilise « Centrer sur les visages » pour les remplir automatiquement, puis ajuste ici si besoin.
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Vidéo source</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateSelectedClip({
                                    videoTransform: { scale: 100, x: 0, y: 0 },
                                  })
                                }
                                className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                              >
                                Reset cadrage
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Zoom</Label>
                              <span className="text-sm font-black">{selectedClipPositions.videoTransform.scale}%</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.videoTransform.scale]}
                              min={70}
                              max={150}
                              step={1}
                              onValueChange={([value]) =>
                                updateSelectedClip({
                                  videoTransform: {
                                    scale: value,
                                    x: selectedClipPositions.videoTransform.x,
                                    y: selectedClipPositions.videoTransform.y,
                                  },
                                })
                              }
                            />
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Déplacement X</Label>
                                  <span className="text-sm font-black">{selectedClipPositions.videoTransform.x}px</span>
                                </div>
                                <Slider
                                  value={[selectedClipPositions.videoTransform.x]}
                                  min={-540}
                                  max={540}
                                  step={1}
                                  onValueChange={([value]) =>
                                    updateSelectedClip({
                                      videoTransform: {
                                        scale: selectedClipPositions.videoTransform.scale,
                                        x: value,
                                        y: selectedClipPositions.videoTransform.y,
                                      },
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Déplacement Y</Label>
                                  <span className="text-sm font-black">{selectedClipPositions.videoTransform.y}px</span>
                                </div>
                                <Slider
                                  value={[selectedClipPositions.videoTransform.y]}
                                  min={-840}
                                  max={840}
                                  step={1}
                                  onValueChange={([value]) =>
                                    updateSelectedClip({
                                      videoTransform: {
                                        scale: selectedClipPositions.videoTransform.scale,
                                        x: selectedClipPositions.videoTransform.x,
                                        y: value,
                                      },
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ===================== SECTION : LOGO / B-ROLL ===================== */}
                      {selectedClip && selectedClip.stage !== "intro" && (
                        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                              <Image className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="font-black uppercase tracking-tight">Logo / B-roll</h3>
                              <p className="text-xs text-white/45">Position et taille du logo Klimax.</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Logo Klimax</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateSelectedClip({ logoPosition: { x: 540, y: selectedClipPositions.logoPosition.y } })
                                }
                                className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                              >
                                Centrer élément
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">X</Label>
                              <span className="text-sm font-black">{selectedClipPositions.logoPosition.x}px</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.logoPosition.x]}
                              min={0}
                              max={1080}
                              step={1}
                              onValueChange={([value]) =>
                                updateSelectedClip({
                                  logoPosition: {
                                    x: value,
                                    y: selectedClipPositions.logoPosition.y,
                                  },
                                })
                              }
                            />
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Y</Label>
                              <span className="text-sm font-black">{selectedClipPositions.logoPosition.y}px</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.logoPosition.y]}
                              min={0}
                              max={1920}
                              step={1}
                              onValueChange={([value]) =>
                                updateSelectedClip({
                                  logoPosition: {
                                    x: selectedClipPositions.logoPosition.x,
                                    y: value,
                                  },
                                })
                              }
                            />
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Taille</Label>
                              <span className="text-sm font-black">{selectedClipPositions.logoSize}px</span>
                            </div>
                            <Slider
                              value={[selectedClipPositions.logoSize]}
                              min={80}
                              max={1080}
                              step={10}
                              onValueChange={([value]) => updateSelectedClip({ logoSize: value })}
                            />
                            <div className="flex flex-wrap gap-2">
                              {[320, 520, 720, 900].map((size) => (
                                <Button
                                  key={size}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateSelectedClip({ logoSize: size })}
                                  className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                                >
                                  {size}px
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-white/10 bg-black p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-black uppercase tracking-wide">Mix audio</p>
                            <p className="text-xs text-white/45">Choisis séparément la musique et le son original de la vidéo avant export.</p>
                          </div>
                          <Music className="h-5 w-5 text-white/50" />
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <VolumeDial label="Musique" value={musicVolumeDb} min={-40} max={0} baseValue={-17} onChange={setMusicVolumeDb} />
                          <VolumeDial label="Son vidéo" value={videoVolumeDb} min={-12} max={12} baseValue={2} onChange={setVideoVolumeDb} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="auto" className="mt-6">
                    <div className="rounded-3xl border border-dashed border-white/15 bg-black p-6">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-white text-black grid place-items-center shrink-0">
                          <Wand2 className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black">Mode automatique à configurer</h3>
                          <p className="mt-2 text-sm leading-relaxed text-white/55">
                            L'IA analysera le dialogue, choisira les hooks, placera les sous-titres,
                            sélectionnera les B-rolls/images et variera les SFX. Pour l'instant, cette maquette prépare les zones de contrôle.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-3 mb-5">
                  <Scissors className="h-5 w-5 text-white/60" />
                  <h3 className="font-black uppercase tracking-tight">Montage</h3>
                </div>
                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black p-4">
                      <div className="h-10 w-10 rounded-full bg-white text-black grid place-items-center font-black text-sm">{timeline.indexOf(item) + 1}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black">{item.label}</p>
                        <p className="text-sm text-white/45 truncate">{item.detail}</p>
                      </div>
                      <span className="text-xs font-black text-white/35">{item.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ===== Panneaux déplacés depuis l'ancienne colonne de droite ===== */}
            <div className="columns-1 gap-5 xl:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="h-5 w-5 text-white/60" />
                <h3 className="font-black uppercase tracking-tight">Réglages rapides</h3>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { label: "Sound effects", value: autoSfxEnabled, setter: setAutoSfxEnabled, icon: Zap },
                { label: "Zoom automatique", value: autoZoomEnabled, setter: setAutoZoomEnabled, icon: Scissors },
                { label: "Transitions entre clips", value: clipTransitionsEnabled, setter: setClipTransitionsEnabled, icon: Scissors },
                { label: "B-rolls sous le texte", value: brollEnabled, setter: setBrollEnabled, icon: Image },
                { label: "Mode shutter (b-roll)", value: brollShutterMode, setter: setBrollShutterMode, icon: Image },
                { label: "Effet miroir", value: mirrorEnabled, setter: setMirrorEnabled, icon: Scissors },
                { label: "Split hook avec b-roll", value: hookBrollSplitEnabled, setter: setHookBrollSplitEnabled, icon: Image },
                { label: "Shake sigma", value: shakeEnabled, setter: setShakeEnabled, icon: Scissors },
                { label: "Musique active", value: musicEnabled, setter: setMusicEnabled, icon: Music },
                { label: "Logo KLIMAX sur mot clé", value: klimaxLogoEnabled, setter: setKlimaxLogoEnabled, icon: Sparkles },
              ].map((setting) => {
                const Icon = setting.icon;
                return (
                  <div key={setting.label} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 text-white/45 shrink-0" />
                      <span className="text-sm font-bold">{setting.label}</span>
                    </div>
                    <Switch checked={setting.value} onCheckedChange={setting.setter} />
                  </div>
                );
              })}
            </div>

            {clipTransitionsEnabled && (
              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/45">Type de transition</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "random", label: "Aléatoire" },
                    { key: "opacity", label: "Fondu" },
                    { key: "camera_flash", label: "Flash caméra" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setClipTransitionType(opt.key)}
                      className={cn(
                        "rounded-xl border px-3 py-3 text-xs font-black transition",
                        clipTransitionType === opt.key
                          ? "border-white bg-white text-black"
                          : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3 mb-3">
                <Wand2 className="h-5 w-5 text-white/60" />
                <h3 className="font-black uppercase tracking-tight">B-rolls IA</h3>
              </div>
              <p className="text-xs text-white/55 leading-relaxed">
                Quand « B-rolls sous le texte » est activé, l'IA place automatiquement
                plusieurs b-rolls aux bons moments du clip 2 (d'après les notes de la banque)
                <span className="font-bold text-white/80"> au moment du rendu</span> — rien à
                lancer. Tagge chaque b-roll « Carré » ou « Entier » dans la{" "}
                <span className="font-bold text-white/80">Banque → onglet B-roll</span>.
              </p>
              <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Style des b-rolls</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "square", label: "Carré" },
                  { key: "fullscreen", label: "Entier 9:16" },
                  { key: "alternate", label: "Les deux" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setBrollStyle(opt.key)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-xs font-black transition",
                      brollStyle === opt.key
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Zoom des b-rolls</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "in", label: "Zoom avant" },
                  { key: "out", label: "Zoom arrière" },
                  { key: "none", label: "Aucun" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setBrollZoom(opt.key)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-xs font-black transition",
                      brollZoom === opt.key
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <PresetsPanel
              refreshSignal={presetsRefresh}
              onApplied={() => setPresetsRefresh((n) => n + 1)}
            />

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-white/60" />
              <h3 className="font-black uppercase tracking-tight">Sound effects</h3>
            </div>
            <p className="mt-2 text-xs text-white/55 leading-relaxed">
              Active « Sound effects » dans les réglages rapides : un son est ajouté tout seul
              ~toutes les 4 s (-9 dB) au hasard parmi tes sons, et le riser termine le 1er clip (-15 dB).
              Ajoute / gère tes sons dans la <span className="font-bold text-white/80">Banque → onglet SFX</span>.
            </p>
          </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Scissors className="h-5 w-5 text-white/60" />
                  <div>
                    <h3 className="font-black uppercase tracking-tight">Auto cut zoom</h3>
                    <p className="text-xs text-white/45">2 zooms aléatoires sur Personne 2 à chaque export.</p>
                  </div>
                </div>
                <Switch checked={autoZoomEnabled} onCheckedChange={setAutoZoomEnabled} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "cut", label: "Cut zoom", detail: "+ zoom direct 2s" },
                  { key: "smooth", label: "Smooth zoom", detail: "zoom fluide + retour" },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setAutoZoomMode(mode.key as "cut" | "smooth")}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-left transition",
                      autoZoomMode === mode.key
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black text-white/65 hover:bg-white/10"
                    )}
                  >
                    <p className="text-xs font-black">{mode.label}</p>
                    <p className="text-[10px] opacity-60">{mode.detail}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2 rounded-2xl border border-white/10 bg-black p-4">
                <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Intensité du zoom</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "leger", label: "Léger", boost: 12, duration: 1.5 },
                    { key: "moyen", label: "Moyen", boost: 22, duration: 2 },
                    { key: "fort", label: "Fort", boost: 40, duration: 2.5 },
                  ].map((preset) => {
                    const active = autoZoomBoostPercent <= 16
                      ? preset.key === "leger"
                      : autoZoomBoostPercent >= 32
                        ? preset.key === "fort"
                        : preset.key === "moyen";
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={!autoZoomEnabled}
                        onClick={() => {
                          setAutoZoomBoostPercent(preset.boost);
                          setAutoZoomDurationSeconds(preset.duration);
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-xs font-black transition disabled:opacity-40",
                          active
                            ? "border-white bg-white text-black"
                            : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/10"
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-black p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-white/45" />
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Zoom out début clip</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold">
                    Personne 1
                    <Switch checked={introZoomOutEnabled} onCheckedChange={setIntroZoomOutEnabled} />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold">
                    Personne 2
                    <Switch checked={replyZoomOutEnabled} onCheckedChange={setReplyZoomOutEnabled} />
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Départ zoom out</Label>
                    <span className="text-xs font-black text-white">{zoomOutStartPercent}%</span>
                  </div>
                  <Slider
                    value={[zoomOutStartPercent]}
                    min={110}
                    max={260}
                    step={5}
                    onValueChange={([value]) => setZoomOutStartPercent(value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Durée zoom out</Label>
                    <span className="text-xs font-black text-white">{zoomOutDurationSeconds.toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[zoomOutDurationSeconds]}
                    min={0.4}
                    max={3}
                    step={0.1}
                    onValueChange={([value]) => setZoomOutDurationSeconds(Number(value.toFixed(1)))}
                  />
                </div>
                <p className="text-xs text-white/45 leading-relaxed">
                  Le Smooth swosh se mixe automatiquement sur chaque zoom pour accentuer le mouvement.
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-white/60" />
                <div>
                  <h3 className="font-black uppercase tracking-tight">FILTRE</h3>
                  <p className="text-xs text-white/45">10 variations exportées par FFmpeg pour différencier les reposts.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVideoFilterKey("none")}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  videoFilterKey === "none"
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-black text-white/65 hover:bg-white/10"
                )}
              >
                <p className="text-sm font-black">Aucun filtre</p>
                <p className="text-xs opacity-60">Garde l'image source intacte.</p>
              </button>
              <div className="grid grid-cols-2 gap-2">
                {VIDEO_FILTER_PRESETS.filter((filter) => filter.key !== "none").map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setVideoFilterKey(filter.key)}
                    className={cn(
                      "rounded-2xl border p-2 text-left transition",
                      videoFilterKey === filter.key
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black text-white/65 hover:bg-white/10"
                    )}
                  >
                    <div
                      className="mb-2 h-16 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,#111,#777_45%,#f3d5b5)]"
                      style={{ filter: filter.css }}
                    >
                      <div className="h-full w-full bg-[radial-gradient(circle_at_24%_32%,#fff6,transparent_18%),linear-gradient(90deg,transparent,#0004)]" />
                    </div>
                    <p className="text-xs font-black">{filter.label}</p>
                    <p className="text-[10px] opacity-60">{filter.note}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <Library className="h-5 w-5 text-white/60" />
                  <h3 className="font-black uppercase tracking-tight">Banque d'assets</h3>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate("/asset-bank")}
                  className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                >
                  Ouvrir la banque
                </Button>
              </div>
              <Tabs defaultValue="broll">
                <TabsList className="grid grid-cols-3 bg-black border border-white/10 rounded-2xl p-1 h-12">
                  <TabsTrigger value="broll" className="rounded-xl"><Film className="h-4 w-4" /></TabsTrigger>
                  <TabsTrigger value="images" className="rounded-xl"><Image className="h-4 w-4" /></TabsTrigger>
                  <TabsTrigger value="music" className="rounded-xl"><Music className="h-4 w-4" /></TabsTrigger>
                </TabsList>
                <TabsContent value="broll" className="mt-4 space-y-3">
                  {!selectedClipCanUseBroll ? (
                    <p className="rounded-2xl border border-white/10 bg-black p-4 text-sm text-white/55">
                      Les B-rolls se placent uniquement sur Personne 2.
                    </p>
                  ) : (
                    <>
                      {bankByCategory.broll.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => selectBankAsset("broll", asset.id)}
                          className={cn(
                            "w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left transition",
                            selectedClip?.brollId === asset.id ? "border-white bg-white text-black" : "border-white/10 bg-black hover:bg-white/[0.05]"
                          )}
                        >
                          <div>
                            <p className="font-black text-sm">{asset.title}</p>
                            <p className={cn("text-xs", selectedClip?.brollId === asset.id ? "text-black/60" : "text-white/40")}>{asset.note}</p>
                          </div>
                          <ChevronRight className={cn("h-4 w-4", selectedClip?.brollId === asset.id ? "text-black/40" : "text-white/30")} />
                        </button>
                      ))}
                      {bankByCategory.broll.length === 0 && <p className="text-sm text-white/45">Ajoute des B-rolls dans la Banque.</p>}
                    </>
                  )}
                </TabsContent>
                <TabsContent value="images" className="mt-4">
                  <div className="space-y-3">
                    {!selectedClipCanUseBroll ? (
                      <p className="rounded-2xl border border-white/10 bg-black p-4 text-sm text-white/55">
                        Les images d'illustration se placent uniquement sur Personne 2.
                      </p>
                    ) : (
                      <>
                        {bankByCategory.image.map((asset) => (
                          <button
                            key={asset.id}
                            onClick={() => selectBankAsset("image", asset.id)}
                            className={cn(
                              "w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left transition",
                              selectedClip?.imageId === asset.id ? "border-white bg-white text-black" : "border-white/10 bg-black hover:bg-white/[0.05]"
                            )}
                          >
                            <div>
                              <p className="font-black text-sm">{asset.title}</p>
                              <p className={cn("text-xs", selectedClip?.imageId === asset.id ? "text-black/60" : "text-white/40")}>{asset.note}</p>
                            </div>
                            <ChevronRight className={cn("h-4 w-4", selectedClip?.imageId === asset.id ? "text-black/40" : "text-white/30")} />
                          </button>
                        ))}
                        {bankByCategory.image.length === 0 && <p className="text-sm text-white/45">Ajoute des images dans la Banque.</p>}
                      </>
                    )}
                  </div>
                  {selectedClipCanUseBroll && selectedClip?.imageId && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black uppercase tracking-wide">Placement image</p>
                          <p className="text-xs text-white/45">{selectedImageAsset?.title || "Image sélectionnée"}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                          onClick={() => updateSelectedClip({ imageTransform: { scale: 100, x: 0, y: 0 } })}
                        >
                          Reset
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Zoom</Label>
                          <span className="text-sm font-black">{selectedClip.imageTransform?.scale ?? 100}%</span>
                        </div>
                        <Slider
                          value={[selectedClip.imageTransform?.scale ?? 100]}
                          min={40}
                          max={180}
                          step={1}
                          onValueChange={([value]) =>
                            updateSelectedClip({
                              imageTransform: {
                                scale: value,
                                x: selectedClip.imageTransform?.x ?? 0,
                                y: selectedClip.imageTransform?.y ?? 0,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Déplacement X</Label>
                            <span className="text-sm font-black">{selectedClip.imageTransform?.x ?? 0}px</span>
                          </div>
                          <Slider
                            value={[selectedClip.imageTransform?.x ?? 0]}
                            min={-420}
                            max={420}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedClip({
                                imageTransform: {
                                  scale: selectedClip.imageTransform?.scale ?? 100,
                                  x: value,
                                  y: selectedClip.imageTransform?.y ?? 0,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Déplacement Y</Label>
                            <span className="text-sm font-black">{selectedClip.imageTransform?.y ?? 0}px</span>
                          </div>
                          <Slider
                            value={[selectedClip.imageTransform?.y ?? 0]}
                            min={-420}
                            max={420}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedClip({
                                imageTransform: {
                                  scale: selectedClip.imageTransform?.scale ?? 100,
                                  x: selectedClip.imageTransform?.x ?? 0,
                                  y: value,
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="music" className="mt-4">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-black uppercase tracking-wide">Musique globale</p>
                      <p className="mt-1 text-xs text-white/45">
                        Une seule musique pour toute la vidéo. Changer Personne 1 ou Personne 2 ne change pas ce choix.
                      </p>
                    </div>
                    {bankByCategory.music.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => selectBankAsset("music", asset.id)}
                        className={cn(
                          "w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left transition",
                          selectedMusicId === asset.id ? "border-white bg-white text-black" : "border-white/10 bg-black hover:bg-white/[0.05]"
                        )}
                      >
                        <div>
                          <p className="font-black text-sm">{asset.title}</p>
                          <p className={cn("text-xs", selectedMusicId === asset.id ? "text-black/60" : "text-white/40")}>{asset.note}</p>
                        </div>
                        <ChevronRight className={cn("h-4 w-4", selectedMusicId === asset.id ? "text-black/40" : "text-white/30")} />
                      </button>
                    ))}
                    {bankByCategory.music.length === 0 && <p className="text-sm text-white/45">Ajoute des musiques dans la Banque.</p>}
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-wide">Volumes export</p>
                        <p className="text-xs text-white/45">Base musique à -17 dB et son vidéo à +2 dB, modifiables avant export.</p>
                      </div>
                      <Music className="h-4 w-4 text-white/45" />
                    </div>
                    <VolumeDial label="Musique" value={musicVolumeDb} min={-40} max={0} baseValue={-17} onChange={setMusicVolumeDb} />
                    <VolumeDial label="Son vidéo" value={videoVolumeDb} min={-12} max={12} baseValue={2} onChange={setVideoVolumeDb} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="h-5 w-5 text-white/60" />
                <h3 className="font-black uppercase tracking-tight">Anti-shadowban</h3>
              </div>
              <div className="space-y-3">
                {antiShadowbanSteps.map((step) => (
                  <div key={step} className="flex items-start gap-3 text-sm text-white/65">
                    <Captions className="h-4 w-4 mt-0.5 text-white/40 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            </div>
            {/* fin des panneaux */}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClimaxVideoEditor;
