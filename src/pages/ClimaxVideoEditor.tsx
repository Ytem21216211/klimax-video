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
import SfxPanel from "@/components/editor/SfxPanel";
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

const KLIMAX_LOGO_PREVIEW_URL = `${LOCAL_KLIMAX_API}/files/system/klimax-pop-up.mov`;

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
};

const DEFAULT_SUBTITLE_STYLE = SUBTITLE_PRESETS.impact;
const VISUAL_SUBTITLE_PRESETS = [
  { key: "quickFade", label: "Quick opacite", sample: "THE QUICK BROWN FOX", badge: null },
  { key: "orangeThe", label: "THE orange", sample: "THE", badge: null },
  { key: "proQuick", label: "Pro quick", sample: "quick", badge: "Pro" },
] as const;
const SUBTITLE_ANIMATION_PRESETS: { key: NonNullable<LocalSubtitleStyleSettings["animationPreset"]>; label: string; sample: string }[] = [
  { key: "pop", label: "Pop-up", sample: "POP" },
  { key: "bounce", label: "Bounce", sample: "BOUNCE" },
  { key: "rise", label: "Montee", sample: "THE" },
  { key: "fade", label: "Opacite", sample: "quick" },
  { key: "none", label: "Fixe", sample: "FIXE" },
];

const subtitleAnimationCss = (animation?: LocalSubtitleStyleSettings["animationPreset"], loop = false) => {
  const repeat = loop ? " infinite" : "";
  if (animation === "pop") return `klimaxSubtitlePop 360ms cubic-bezier(.2,1.35,.3,1)${repeat}`;
  if (animation === "bounce") return `klimaxSubtitleBounce 520ms cubic-bezier(.2,1.25,.2,1)${repeat}`;
  if (animation === "rise") return `klimaxSubtitleRise 360ms ease-out${repeat}`;
  if (animation === "fade") return `klimaxSubtitleFade 760ms ease-out${repeat}`;
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
  fontSize: 46,
};

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
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [autoSfxEnabled, setAutoSfxEnabled] = useState(true);
  const [klimaxLogoEnabled, setKlimaxLogoEnabled] = useState(true);
  const [brollEnabled, setBrollEnabled] = useState(true);
  const [isAutoPickingBrolls, setIsAutoPickingBrolls] = useState(false);
  const [autoBrollMessage, setAutoBrollMessage] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [presetsRefresh, setPresetsRefresh] = useState(0);
  const [musicVolumeDb, setMusicVolumeDb] = useState(-17);
  const [videoVolumeDb, setVideoVolumeDb] = useState(2);
  const [subtitleSize, setSubtitleSize] = useState(34);
  const [subtitleStyle, setSubtitleStyle] = useState<LocalSubtitleStyleSettings>({ ...DEFAULT_SUBTITLE_STYLE });
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
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      brollEnabled,
      autoSfxEnabled,
      klimaxLogoEnabled,
      logoTriggerWord: "klimax",
    });
    return () => { delete (window as any).__klimaxCurrentSnapshot; };
  }, [hookText, subtitleSize, subtitleStyle, hookStyle, musicEnabled, musicVolumeDb, videoVolumeDb, brollEnabled, autoSfxEnabled, klimaxLogoEnabled]);

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
      if (typeof detail.musicEnabled === "boolean") setMusicEnabled(detail.musicEnabled);
      if (typeof detail.musicVolumeDb === "number") setMusicVolumeDb(detail.musicVolumeDb);
      if (typeof detail.videoVolumeDb === "number") setVideoVolumeDb(detail.videoVolumeDb);
      if (typeof detail.brollEnabled === "boolean") setBrollEnabled(detail.brollEnabled);
      if (typeof detail.autoSfxEnabled === "boolean") setAutoSfxEnabled(detail.autoSfxEnabled);
      if (typeof detail.klimaxLogoEnabled === "boolean") setKlimaxLogoEnabled(detail.klimaxLogoEnabled);
      toast({ title: "Preset appliqué", description: "Les réglages sont en place. Sauvegarde le projet pour les conserver." });
    };
    window.addEventListener("klimax:apply-preset", handler as EventListener);
    return () => window.removeEventListener("klimax:apply-preset", handler as EventListener);
  }, [toast]);
  const [bankAssets, setBankAssets] = useState<KlimaxBankAsset[]>(() => loadKlimaxBankAssets());
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
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
      logoSize: clip?.logoSize || 320,
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
      fontSize: Number(project.settings?.subtitleStyle?.fontSize || project.settings?.subtitleSize || 34),
    };
    setSubtitleStyle(nextSubtitleStyle);
    setSubtitleSize(Number(nextSubtitleStyle.fontSize || 34));
    setHookStyle({ ...DEFAULT_HOOK_STYLE, ...(project.settings?.hookStyle || {}) });
    setHookText(project.settings?.hookText || project.clips?.[0]?.hookText || "Tu connais cette sensation ?");
    setMusicEnabled(project.settings?.musicEnabled !== false);
    setMusicVolumeDb(Number(project.settings?.musicVolumeDb ?? -17));
    setVideoVolumeDb(Number(project.settings?.videoVolumeDb ?? 2));
    setAutoSfxEnabled(project.settings?.autoSfxEnabled !== false);
    setKlimaxLogoEnabled(project.settings?.klimaxLogoEnabled !== false);
    setBrollEnabled(project.settings?.brollEnabled !== false);
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
    saveKlimaxProjectClips(projectId, clips);
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
      const previewFontSize = clampValue(Math.round((mergedSubtitleStyle.fontSize || subtitleSize) * 1.08), 38, 96);
      const previewStrokeWidth =
        mergedSubtitleStyle.strokeEnabled === false ? 0 : clampValue(Math.max(mergedSubtitleStyle.strokeWidth || 5, 5), 0, 14);
      const previewShadowDistance =
        mergedSubtitleStyle.shadowEnabled === false ? 0 : clampValue(Math.max(mergedSubtitleStyle.shadowDistance || 5, 5), 0, 22);
      const previewShadowBlur =
        mergedSubtitleStyle.shadowEnabled === false ? 0 : clampValue(Math.max(mergedSubtitleStyle.shadowBlur ?? 16, 16), 0, 36);
      const previewShadowOpacity =
        mergedSubtitleStyle.shadowEnabled === false ? 0 : clampValue(Math.max(mergedSubtitleStyle.shadowOpacity ?? 0.9, 0.2), 0, 1);

      return {
        fontSize: canvasFontSize(previewFontSize),
        color: mergedSubtitleStyle.textColor || "#ffffff",
        fontFamily: mergedSubtitleStyle.fontFamily || "Arial Black, Arial, sans-serif",
        fontWeight: Math.max(900, mergedSubtitleStyle.fontWeight || 900),
        WebkitTextStroke: "0 transparent",
        textShadow: buildOuterSubtitleShadow(
          previewStrokeWidth,
          mergedSubtitleStyle.strokeColor || "#000000",
          previewShadowDistance,
          previewShadowBlur,
          mergedSubtitleStyle.shadowColor || "#000000",
          previewShadowOpacity
        ),
        transform: `scaleX(${(mergedSubtitleStyle.fontScaleX || 104) / 100})`,
        animation: subtitleAnimationCss(mergedSubtitleStyle.animationPreset),
      };
    },
    [mergedSubtitleStyle, subtitleSize]
  );
  React.useEffect(() => {
    setHookText(selectedClip?.hookText || "Tu connais cette sensation ?");
  }, [selectedClip?.id]);
  const selectedAutoSubtitle =
    formatSubtitleSingleLine(selectedTranscription?.cues?.[0]?.text || selectedClip?.subtitle || (isTranscribing ? "Transcription en cours" : "Transcription en attente"));
  const subtitlePreviewText = useMemo(() => {
    if (mergedSubtitleStyle.keywordHighlightEnabled === false) return selectedAutoSubtitle;
    return selectedAutoSubtitle.split(/(\s+)/).map((part, index) => {
      if (!part.trim() || !isPreviewKeyword(part)) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      const color = index % 2 === 0
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
    localProject?.sourceGroup?.person1,
    localProject?.sourceGroup?.person2,
    localProject?.transcription?.clips,
    localProject?.transcription?.status,
    mergedSubtitleStyle.animationPreset,
    mergedSubtitleStyle.fontFamily,
  ]);
  const canStartRender = projectDiagnostics.filter((item) => item.required).every((item) => item.ok);

  const selectBankAsset = (category: Exclude<KlimaxAssetCategory, "video">, assetId: string) => {
    if (!selectedClip) return;
    if (category === "music") updateSelectedClip({ musicId: assetId });
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
    setSubtitleStyle((current) => ({
      ...preset,
      animationPreset: current.animationPreset || preset.animationPreset,
    }));
    setSubtitleSize(preset.fontSize || 34);
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

  const updateSelectedClip = (patch: Partial<KlimaxProjectClip>) => {
    if (!selectedClip) return;
    setClips((current) =>
      current.map((clip) => (clip.id === selectedClip.id ? { ...clip, ...patch } : clip))
    );
  };

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
        updateSelectedClip({
          videoTransform: {
            scale: selectedClip?.videoTransform?.scale ?? 100,
            x: clampValue(nextX, -540, 540),
            y: clampValue(nextY, -840, 840),
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
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      autoSfxEnabled,
      klimaxLogoEnabled,
      brollEnabled,
      logoTriggerWord: "klimax",
      subtitleStyle: { ...mergedSubtitleStyle, fontSize: subtitleSize },
      hookStyle: mergedHookStyle,
    };

    try {
      await localKlimaxApi.saveProject(projectId, { settings, clips });
      const { project } = await localKlimaxApi.transcribeProject(projectId, settings);
      applyProjectState(project);
    } catch (error: any) {
      setTranscriptionError(error.message || "Transcription impossible");
    } finally {
      setIsTranscribing(false);
    }
  }, [
    applyProjectState,
    autoSfxEnabled,
    brollEnabled,
    clips,
    hookText,
    isTranscribing,
    klimaxLogoEnabled,
    mergedHookStyle,
    mergedSubtitleStyle,
    musicEnabled,
    musicVolumeDb,
    videoVolumeDb,
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
      musicEnabled,
      musicVolumeDb,
      videoVolumeDb,
      autoSfxEnabled,
      klimaxLogoEnabled,
      brollEnabled,
      logoTriggerWord: "klimax",
      subtitleStyle: { ...mergedSubtitleStyle, fontSize: subtitleSize },
      hookStyle: mergedHookStyle,
    };

    try {
      await localKlimaxApi.saveProject(projectId, { settings, clips });
      const { project } = await localKlimaxApi.renderProject(projectId, settings);
      applyProjectState(project);
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
        `}
      </style>
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="fixed inset-x-0 top-0 h-64 pointer-events-none bg-gradient-to-b from-white/[0.07] to-transparent" />

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
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black uppercase tracking-tight">Klimax vidéo</h1>
              <span className="hidden sm:inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                V1 locale
              </span>
            </div>
            <p className="text-xs text-white/45 truncate">Projet {projectId?.replace("project-", "").slice(0, 8)} · pipeline court-form sans voix off</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => setMode("manual")}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition",
                mode === "manual" ? "bg-white text-black" : "text-white/50 hover:text-white"
              )}
            >
              Manuel
            </button>
            <button
              onClick={() => setMode("auto")}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition",
                mode === "auto" ? "bg-white text-black" : "text-white/50 hover:text-white"
              )}
            >
              Automatique
            </button>
          </div>
          <Button onClick={renderCurrentProject} disabled={isRendering || !canStartRender} className="rounded-full bg-white text-black hover:bg-white/90 font-black disabled:opacity-40">
            <Play className="mr-2 h-4 w-4 fill-current" />
            {isRendering ? "Export..." : "Créer la vidéo"}
          </Button>
        </div>
      </header>

      <main className="relative z-10 grid h-[calc(100vh-80px)] grid-cols-1 xl:grid-cols-[300px_minmax(420px,1fr)_390px] overflow-hidden">
        <aside className="hidden xl:flex border-r border-white/10 bg-black/50 flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Source vidéo</p>
            <p className="mt-2 font-black truncate">{projectSource?.title || "Aucune vidéo liée"}</p>
            <p className="mt-1 text-xs text-white/45 line-clamp-2">
              {projectSource ? "Deux vidéos liées: personne 1 et personne 2 dans le même projet." : "Choisis un duo vidéo dans Nouveau projet pour lier la source."}
            </p>
          </div>
          <div className="p-5 border-b border-white/10 space-y-3">
            <Button onClick={() => addClip("intro")} className="w-full rounded-2xl bg-white text-black hover:bg-white/90 font-black">
              <Plus className="mr-2 h-4 w-4" />
              Segment personne 1
            </Button>
            <Button onClick={() => addClip("reply")} variant="outline" className="w-full rounded-2xl border-white/10 bg-white/[0.03] text-white hover:bg-white/10 font-black">
              <Plus className="mr-2 h-4 w-4" />
              Segment personne 2
            </Button>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Segments projet</p>
              <p className="text-sm text-white/60">{clips.length > 0 ? `${clips.length} segment(s)` : "Aucun segment ajouté"}</p>
            </div>
            <BadgeCheck className="h-5 w-5 text-white/50" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
            {clips.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
                La liste se remplit avec les deux personnes de la vidéo source.
              </div>
            )}
            {clips.map((clip, index) => (
              <button
                key={clip.id}
                onClick={() => setSelectedClipId(clip.id)}
                className={cn(
                  "w-full text-left rounded-2xl border p-4 transition group",
                  selectedClip?.id === clip.id ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black uppercase tracking-tight truncate">{clip.title}</p>
                    <p className={cn("text-xs mt-1", selectedClip?.id === clip.id ? "text-black/60" : "text-white/45")}>
                      {clip.stage === "intro" ? "Video liee personne 1" : "Video liee personne 2"}
                    </p>
                    <p className={cn("text-[10px] mt-2 line-clamp-2", selectedClip?.id === clip.id ? "text-black/55" : "text-white/30")}>
                      {clip.subtitle}
                    </p>
                  </div>
                  <Film className={cn("h-4 w-4 shrink-0", selectedClip?.id === clip.id ? "text-black" : "text-white/35")} />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[minmax(320px,430px)_1fr] items-start">
            <div className="space-y-5">
              <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
                <div
                  ref={previewCanvasRef}
                  className="aspect-[9/16] rounded-[28px] bg-neutral-950 overflow-hidden relative border border-white/10 touch-none"
                  style={{ containerType: "size" }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,#ffffff26,transparent_28%),linear-gradient(160deg,#1f1f1f,#050505_52%,#202020)]" />
                  {selectedSourceAsset?.fileUrl && (
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
                        maxWidth: "none",
                        maxHeight: "none",
                        touchAction: "none",
                      }}
                    />
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

                  <div className="absolute inset-x-5 top-[16%] h-[42%] rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-[2px] overflow-hidden">
                    <div className="absolute inset-0 grid place-items-center">
                      <CirclePlay className="h-16 w-16 text-white/70" />
                    </div>
                    {selectedClipCanUseBroll && selectedImageAsset?.fileUrl && (
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
                    {selectedClipCanUseBroll && brollEnabled && (
                      <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white text-black px-4 py-3 text-xs font-black uppercase tracking-wide">
                        B-roll reserve · image ou vidéo sous le texte
                      </div>
                    )}
                  </div>

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
                          className="relative flex w-fit items-center justify-center rounded-[999px] text-center shadow-[0_16px_50px_rgba(0,0,0,0.45)] cursor-move select-none"
                          style={{
                            backgroundColor: mergedHookStyle.bubbleColor || "#ffffff",
                            width: canvasUnit(selectedClipPositions.hookSize.width),
                            minHeight: canvasUnit(selectedClipPositions.hookSize.height),
                            boxSizing: "border-box",
                            padding: `${canvasUnit(32)} ${canvasUnit(64)}`,
                            touchAction: "none",
                          }}
                          onPointerDown={(event) => startClipDrag("hook", event)}
                        >
                          <p
                            className="relative z-10 whitespace-pre-line font-black leading-snug tracking-tight break-words"
                            style={{
                              color: mergedHookStyle.textColor || "#000000",
                              fontFamily: mergedHookStyle.fontFamily || "Arial Black, Arial, sans-serif",
                              fontSize: canvasFontSize(mergedHookStyle.fontSize || 46),
                              maxWidth: canvasUnit(Math.max(120, selectedClipPositions.hookSize.width - 128)),
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
                      {klimaxLogoEnabled && (
                        <div
                          className="absolute rounded-[24px] border border-white/20 bg-black/70 p-2 cursor-move"
                          style={{
                            left: `${(selectedClipPositions.logoPosition.x / BASE_CANVAS_WIDTH) * 100}%`,
                            top: `${(selectedClipPositions.logoPosition.y / BASE_CANVAS_HEIGHT) * 100}%`,
                            transform: "translate(-50%, -50%)",
                            touchAction: "none",
                          }}
                          onPointerDown={(event) => startClipDrag("logo", event)}
                        >
                          <video
                            src={KLIMAX_LOGO_PREVIEW_URL}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="rounded-2xl object-contain pointer-events-none"
                            style={{
                              width: canvasUnit(selectedClipPositions.logoSize),
                              height: canvasUnit(selectedClipPositions.logoSize),
                            }}
                          />
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

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Préparation export</p>
                    <p className="mt-1 text-sm text-white/55">
                      {canStartRender ? "La vidéo peut être créée." : "Il manque une base avant export."}
                    </p>
                  </div>
                  {canStartRender ? (
                    <BadgeCheck className="h-5 w-5 text-emerald-200" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-200" />
                  )}
                </div>
                <div className="mt-4 grid gap-2">
                  {projectDiagnostics.map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/35 p-3">
                      <div
                        className={cn(
                          "mt-0.5 h-3 w-3 rounded-full border",
                          item.ok
                            ? "border-emerald-200 bg-emerald-300"
                            : item.required
                              ? "border-amber-200 bg-amber-300"
                              : "border-white/20 bg-white/10"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-black">{item.label}</p>
                        <p className="text-xs text-white/45">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(exportHistory.length > 0 || renderError) && (
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Exports locaux</p>
                    <span className="text-xs text-white/45">{exportHistory.length} export(s)</span>
                  </div>
                  {exportHistory[0]?.url ? (
                    <div className="mt-4 space-y-4">
                      <video src={exportHistory[0].url} controls className="w-full rounded-2xl border border-white/10" />
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
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">Mode actuel</p>
                    <h2 className="text-3xl font-black tracking-tight">{mode === "manual" ? "Montage manuel" : "Automatisation IA"}</h2>
                  </div>
                  <div className="md:hidden flex rounded-full border border-white/10 bg-white/[0.03] p-1">
                    <button onClick={() => setMode("manual")} className={cn("rounded-full px-3 py-2 text-xs font-black", mode === "manual" ? "bg-white text-black" : "text-white/50")}>Manuel</button>
                    <button onClick={() => setMode("auto")} className={cn("rounded-full px-3 py-2 text-xs font-black", mode === "auto" ? "bg-white text-black" : "text-white/50")}>Auto</button>
                  </div>
                </div>

                <Tabs defaultValue="manual" value={mode} onValueChange={(value) => setMode(value as "manual" | "auto")}>
                  <TabsList className="grid grid-cols-2 bg-white/[0.04] border border-white/10 rounded-2xl p-1 h-14">
                    <TabsTrigger value="manual" className="rounded-xl font-black uppercase tracking-wider text-xs">Manuel</TabsTrigger>
                    <TabsTrigger value="auto" className="rounded-xl font-black uppercase tracking-wider text-xs">Automatique</TabsTrigger>
                  </TabsList>

                  <TabsContent value="manual" className="mt-6 space-y-5">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Hook texte personne 1</Label>
                        <Textarea
                          value={hookText}
                          onChange={(e) => {
                            setHookText(e.target.value);
                            updateSelectedClip({ hookText: e.target.value });
                          }}
                          rows={5}
                          className="min-h-[130px] rounded-2xl bg-black border-white/10 text-white font-bold leading-snug"
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black p-4 md:col-span-2">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Police hook text</Label>
                          <Select
                            value={mergedHookStyle.fontFamily || "Arial Black"}
                            onValueChange={(value) => setHookStyle((current) => ({ ...current, fontFamily: value }))}
                          >
                            <SelectTrigger className="mt-3 rounded-2xl border-white/10 bg-white/[0.03]">
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
                      {selectedClip && (
                        <div className="rounded-2xl border border-white/10 bg-black p-4 space-y-4">
                          <div>
                            <p className="text-sm font-black uppercase tracking-wide">Placement direct</p>
                            <p className="text-xs text-white/45">Glisse les éléments sur la preview ou ajuste leurs coordonnées ici.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
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
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                selectedClip.stage === "intro"
                                  ? updateSelectedClip({ hookPosition: { x: 540, y: selectedClipPositions.hookPosition.y } })
                                  : updateSelectedClip({ logoPosition: { x: 540, y: selectedClipPositions.logoPosition.y } })
                              }
                              className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                            >
                              Centrer élément
                            </Button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 md:col-span-2">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Vidéo source</p>
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
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Sous-titres</p>
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
                            </div>
                            {selectedClip.stage === "intro" ? (
                              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Hook bulle</p>
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
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Logo Klimax</p>
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
                                  min={120}
                                  max={620}
                                  step={10}
                                  onValueChange={([value]) => updateSelectedClip({ logoSize: value })}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

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
                      <div className="rounded-2xl border border-white/10 bg-black p-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Taille sous-titres</Label>
                          <span className="text-sm font-black">{subtitleSize}px</span>
                        </div>
                        <Slider
                          value={[subtitleSize]}
                          min={14}
                          max={128}
                          step={1}
                          onValueChange={([value]) => {
                            setSubtitleSize(value);
                            setSubtitleStyle((current) => ({ ...current, fontSize: value }));
                          }}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Style sous-titres</Label>
                          <div className="flex gap-2">
                            {[
                              { key: "impact", label: "Impact" },
                              { key: "clean", label: "Clean" },
                              { key: "highlight", label: "Highlight" },
                              { key: "capcut", label: "CapCut" },
                              { key: "punch", label: "Punch" },
                              { key: "neon", label: "Neon" },
                            ].map((preset) => (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => {
                                  const next = SUBTITLE_PRESETS[preset.key];
                                  applySubtitleTextPreset(next);
                                }}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs font-black transition",
                                  mergedSubtitleStyle.stylePreset === preset.key
                                    ? "border-white bg-white text-black"
                                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
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
                                    color: preview.textColor || "#ffffff",
                                    fontFamily: preview.fontFamily || "Arial Black, Arial, sans-serif",
                                    fontSize: preset.key === "quickFade" ? "12px" : preset.key === "orangeThe" ? "30px" : "26px",
                                    WebkitTextStroke: `${preset.key === "quickFade" ? 0 : 1.5}px ${preview.strokeColor || "#000000"}`,
                                    textShadow:
                                      preset.key === "quickFade"
                                        ? "none"
                                        : `0 3px 0 ${preview.strokeColor || "#000000"}, 0 8px 18px rgba(0,0,0,.55)`,
                                    opacity: preset.key === "quickFade" ? 0.96 : 1,
                                    animation: subtitleAnimationCss(preview.animationPreset, true),
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
                          <div className="grid gap-3 md:grid-cols-5">
                            {SUBTITLE_ANIMATION_PRESETS.map((animationPreset) => {
                              const active = (mergedSubtitleStyle.animationPreset || "pop") === animationPreset.key;

                              return (
                                <button
                                  key={animationPreset.key}
                                  type="button"
                                  onClick={() =>
                                    setSubtitleStyle((current) => ({
                                      ...current,
                                      animationPreset: animationPreset.key,
                                    }))
                                  }
                                  className={cn(
                                    "relative h-24 overflow-hidden rounded-2xl border bg-white/[0.04] p-3 transition hover:bg-white/[0.08]",
                                    active ? "border-white shadow-[0_0_0_1px_rgba(255,255,255,0.45)]" : "border-white/10"
                                  )}
                                >
                                  <span
                                    className="absolute inset-x-2 top-1/2 block -translate-y-1/2 whitespace-nowrap text-center font-black leading-none"
                                    style={{
                                      color: mergedSubtitleStyle.textColor || "#ffffff",
                                      fontFamily: mergedSubtitleStyle.fontFamily || "Arial Black, Arial, sans-serif",
                                      fontSize: animationPreset.key === "rise" ? "30px" : "24px",
                                      WebkitTextStroke:
                                        mergedSubtitleStyle.strokeEnabled === false
                                          ? "0 transparent"
                                          : `1.5px ${mergedSubtitleStyle.strokeColor || "#000000"}`,
                                      textShadow:
                                        mergedSubtitleStyle.strokeEnabled === false
                                          ? `0 5px 14px ${hexToRgba(mergedSubtitleStyle.shadowColor || "#000000", 0.45)}`
                                          : `0 3px 0 ${mergedSubtitleStyle.strokeColor || "#000000"}, 0 8px 18px rgba(0,0,0,.55)`,
                                      animation: subtitleAnimationCss(animationPreset.key, animationPreset.key !== "none"),
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
                                <SelectItem value="2">2 mots max</SelectItem>
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
          </div>
        </section>

        {rightPanelOpen ? (
          <aside className="border-l border-white/10 bg-black/70 overflow-y-auto p-5 space-y-5 relative">
            <button
              type="button"
              onClick={() => setRightPanelOpen(false)}
              title="Réduire le panneau"
              className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white/55 hover:bg-white/10 hover:text-white transition"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3 mb-5 pr-10">
                <SlidersHorizontal className="h-5 w-5 text-white/60" />
                <h3 className="font-black uppercase tracking-tight">Réglages rapides</h3>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { label: "SFX automatiques", value: autoSfxEnabled, setter: setAutoSfxEnabled, icon: Zap },
                { label: "B-rolls sous le texte", value: brollEnabled, setter: setBrollEnabled, icon: Image },
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

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3 mb-3">
                <Wand2 className="h-5 w-5 text-white/60" />
                <h3 className="font-black uppercase tracking-tight">B-rolls IA</h3>
              </div>
              <p className="text-xs text-white/55 leading-relaxed">
                Compare la transcription de chaque clip aux labels des b-rolls de la banque et place le bon b-roll au bon moment (sans écraser tes choix manuels).
              </p>
              <Button
                type="button"
                onClick={autoPickBrolls}
                disabled={isAutoPickingBrolls}
                className="mt-4 w-full rounded-2xl bg-white text-black hover:bg-white/90 font-black disabled:opacity-40"
              >
                {isAutoPickingBrolls ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                {isAutoPickingBrolls ? "Analyse en cours…" : "Choisir les b-rolls via l'IA"}
              </Button>
              {autoBrollMessage && (
                <p className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-white/65">
                  {autoBrollMessage}
                </p>
              )}
            </div>

            <PresetsPanel
              refreshSignal={presetsRefresh}
              onApplied={() => setPresetsRefresh((n) => n + 1)}
            />

          {projectId && (
            <SfxPanel
              projectId={projectId}
              clips={(localProject?.transcription?.clips || []).map((c) => ({ id: c.clipId, stage: c.stage, sfxEffect: c.sfxEffect }))}
              transitionKey={localProject?.settings?.sfxTransition}
              onChange={async () => {
                // Re-fetch the project to reflect the updated sfxEffect on each clip.
                if (!projectId) return;
                try {
                  const { project } = await localKlimaxApi.getProject(projectId);
                  setLocalProject(project);
                } catch {
                  // best-effort
                }
              }}
            />
          )}

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
                    {bankByCategory.music.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => selectBankAsset("music", asset.id)}
                        className={cn(
                          "w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left transition",
                          selectedClip?.musicId === asset.id ? "border-white bg-white text-black" : "border-white/10 bg-black hover:bg-white/[0.05]"
                        )}
                      >
                        <div>
                          <p className="font-black text-sm">{asset.title}</p>
                          <p className={cn("text-xs", selectedClip?.musicId === asset.id ? "text-black/60" : "text-white/40")}>{asset.note}</p>
                        </div>
                        <ChevronRight className={cn("h-4 w-4", selectedClip?.musicId === asset.id ? "text-black/40" : "text-white/30")} />
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
          </aside>
        ) : (
          <aside className="border-l border-white/10 bg-black/70 w-12 flex flex-col items-center py-5">
            <button
              type="button"
              onClick={() => setRightPanelOpen(true)}
              title="Ouvrir le panneau"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <p
              className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/30 select-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Réglages
            </p>
          </aside>
        )}
      </main>
    </div>
  );
};

export default ClimaxVideoEditor;
