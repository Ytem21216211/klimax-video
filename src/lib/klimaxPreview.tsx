// Shared parametric preview for klimax auto-mode "mode paramètre".
// The pure helpers below are ported VERBATIM from ClimaxVideoEditor.tsx so the
// preview matches the export 1:1 (band cover-fit, subtitle libass sizing, fonts).
// AutoVariantCanvas draws a full 1080×1920 frame purely from a variant's numbers.
import React from "react";
import { LOCAL_KLIMAX_API } from "@/lib/localKlimaxApi";
import type {
  AutoPlanClip,
  AutoPlanSources,
  AutoPlanVariant,
  LocalHookStyleSettings,
  LocalSubtitleStyleSettings,
} from "@/lib/localKlimaxApi";

export const BASE_CANVAS_WIDTH = 1080;
export const BASE_CANVAS_HEIGHT = 1920;
// libass draws a Fontsize ~11% smaller than a browser draws the same px; this ratio
// shrinks the preview text to match the exported video (see ClimaxVideoEditor).
const PREVIEW_LIBASS_RATIO = 0.885;
const EXPORT_SUBTITLE_FONT_SCALE = 1.08;
const DEFAULT_TEXT_SIZE = 53;

const HOOK_FONT_CSS = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
const HOOK_BUBBLE_RADIUS = 64;
const HOOK_BUBBLE_PAD_X = 56;
const HOOK_BUBBLE_PAD_Y = 30;

const KLIMAX_LOGO_PREVIEW_URL = `${LOCAL_KLIMAX_API}/files/system/klimax-logo-preview.png`;
const KLIMAX_LOGO_PLACEMENT_TIME_SECONDS = 2;
const LOGO_PREVIEW_FRAME_RATIO = 734 / 1080;

// Same css filters as VIDEO_FILTER_PRESETS in ClimaxVideoEditor (key -> css).
const VIDEO_FILTER_CSS: Record<string, string> = {
  none: "none",
  clean_boost: "contrast(1.06) saturate(1.07) brightness(1.006)",
  warm_viral: "contrast(1.05) saturate(1.1) sepia(0.08) brightness(1.008)",
  cold_crisp: "contrast(1.07) saturate(1.04) hue-rotate(7deg)",
  contrast_punch: "contrast(1.16) saturate(1.13) brightness(0.996)",
  soft_glow: "contrast(1.03) saturate(1.06) brightness(1.014)",
  grain_light: "contrast(1.05) saturate(1.04)",
  mono_noir: "grayscale(1) contrast(1.15) brightness(1.01)",
  green_tint: "contrast(1.05) saturate(1.06) hue-rotate(15deg)",
  pink_pop: "contrast(1.06) saturate(1.16) hue-rotate(-8deg)",
  vhs_lite: "contrast(1.08) saturate(0.95)",
};

export const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const canvasUnit = (value: number) => `${(value / BASE_CANVAS_WIDTH) * 100}cqw`;
const canvasFontSize = (size: number) => `${(size / BASE_CANVAS_WIDTH) * 100}cqw`;
const exportSubtitleFontSize = (size: number) =>
  clampValue(Math.round((size || DEFAULT_TEXT_SIZE) * EXPORT_SUBTITLE_FONT_SCALE), 38, 96);

const hexToRgba = (hex = "#000000", alpha = 1) => {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// One split-screen band's framing — matches the export 1:1, no source dims needed.
const bandPanFraction = (crop: number) => clampValue(0.5 + crop / 960, 0, 1);
const exportBandFrameStyle = (zoom: number, cropX: number, cropY: number): React.CSSProperties => {
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

const resolvePreviewFont = (fontFamily?: string): { family: string; weight: number } => {
  const f = String(fontFamily || "");
  const t = (re: RegExp) => re.test(f);
  if (t(/arial black/i)) return { family: '"Arial Black", Arial, sans-serif', weight: 900 };
  if (t(/impact/i)) return { family: 'Impact, "Arial Narrow", sans-serif', weight: 400 };
  if (t(/courier/i)) return { family: '"Courier New", monospace', weight: 700 };
  if (t(/helvetica/i)) return { family: "Helvetica, Arial, sans-serif", weight: 700 };
  if (t(/arial/i)) return { family: "Arial, Helvetica, sans-serif", weight: 700 };
  if (t(/sf pro|system/i)) return { family: '-apple-system, "SF Pro Display", sans-serif', weight: 700 };
  if (t(/archivo/i)) return { family: '"Archivo Black", Arial, sans-serif', weight: 400 };
  if (t(/montserrat/i)) return { family: "Montserrat, Arial, sans-serif", weight: 800 };
  if (t(/bebas/i)) return { family: '"Bebas Neue", Arial, sans-serif', weight: 400 };
  if (t(/anton/i)) return { family: "Anton, Arial, sans-serif", weight: 400 };
  if (t(/din condensed/i)) return { family: '"DIN Condensed", Arial, sans-serif', weight: 700 };
  if (t(/din/i)) return { family: '"DIN Alternate", Arial, sans-serif', weight: 700 };
  if (t(/futura/i)) return { family: "Futura, Arial, sans-serif", weight: 700 };
  if (t(/avenir/i)) return { family: '"Avenir Next", Arial, sans-serif', weight: 800 };
  if (t(/gill/i)) return { family: '"Gill Sans", Arial, sans-serif', weight: 700 };
  if (t(/trebuchet/i)) return { family: '"Trebuchet MS", Arial, sans-serif', weight: 700 };
  if (t(/marker/i)) return { family: '"Marker Felt", Arial, sans-serif', weight: 700 };
  if (t(/noteworthy/i)) return { family: "Noteworthy, Arial, sans-serif", weight: 700 };
  return { family: "Helvetica, Arial, sans-serif", weight: 700 };
};

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
  shadowOpacity: number,
) => {
  const shadows: string[] = [];
  if (strokeWidth > 0) {
    const stroke = canvasUnit(strokeWidth);
    [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72],
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

const buildSubtitleTextPreviewStyle = (style: LocalSubtitleStyleSettings, fontSize: string): React.CSSProperties => {
  const previewStrokeWidth = style.strokeEnabled === false ? 0 : clampValue(Math.max(style.strokeWidth || 5, 5), 0, 14);
  const previewShadowDistance = style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowDistance || 5, 5), 0, 22);
  const previewShadowBlur = style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowBlur ?? 16, 16), 0, 36);
  const previewShadowOpacity = style.shadowEnabled === false ? 0 : clampValue(Math.max(style.shadowOpacity ?? 0.9, 0.2), 0, 1);
  const previewFont = resolvePreviewFont(style.fontFamily);
  const boxOn = style.boxEnabled === true;
  const boxAlpha = Math.round(clampValue(style.boxOpacity ?? 1, 0, 1) * 255).toString(16).padStart(2, "0");
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
          previewShadowOpacity,
        ),
    ...(boxOn
      ? { backgroundColor: `${style.boxColor || "#ffffff"}${boxAlpha}`, padding: "0.12em 0.4em", borderRadius: "0.16em" }
      : {}),
    textTransform: style.uppercase === true ? ("uppercase" as const) : undefined,
    transform: `scaleX(${(style.fontScaleX || 104) / 100})`,
    animation: subtitleAnimationCss(style.animationPreset, false),
  };
};

// Keyframes the subtitle/logo animations reference — render once per preview page.
export const KLIMAX_PREVIEW_KEYFRAMES = `
  @keyframes klimaxSubtitlePop { 0% { transform: scale(.72); opacity: .15; } 68% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes klimaxSubtitleBounce { 0% { transform: translateY(18%) scale(.8); opacity: .2; } 55% { transform: translateY(-7%) scale(1.08); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
  @keyframes klimaxSubtitleRise { 0% { transform: translateY(18%); opacity: .1; } 100% { transform: translateY(0); opacity: 1; } }
  @keyframes klimaxSubtitleFade { 0% { opacity: 0; } 100% { opacity: 1; } }
  @keyframes klimaxSubtitleZoom { 0% { transform: scale(1.32); opacity: 0; filter: blur(2px); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
  @keyframes klimaxSubtitleSlide { 0% { transform: translateX(-24%) scale(.94); opacity: 0; } 72% { transform: translateX(3%) scale(1.02); opacity: 1; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
  @keyframes klimaxSubtitleShake { 0% { transform: translateX(0) scale(1); opacity: .2; } 18% { transform: translateX(-7%) scale(1.05); opacity: 1; } 36% { transform: translateX(6%) scale(1.05); } 54% { transform: translateX(-4%) scale(1.02); } 72% { transform: translateX(3%) scale(1.01); } 100% { transform: translateX(0) scale(1); opacity: 1; } }
  @keyframes klimaxSubtitleType { 0% { clip-path: inset(0 100% 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 1; } }
  @keyframes klimaxSubtitleFlicker { 0% { opacity: 0; } 12% { opacity: 1; } 22% { opacity: .18; } 34% { opacity: 1; } 48% { opacity: .55; } 62% { opacity: 1; } 100% { opacity: 1; } }
  @keyframes klimaxSubtitleElastic { 0% { transform: scale(.55,1.28); opacity: .08; } 42% { transform: scale(1.18,.88); opacity: 1; } 66% { transform: scale(.94,1.06); } 100% { transform: scale(1); opacity: 1; } }
`;

const previewKeywordStopWords = new Set(["mais", "avec", "pour", "dans", "plus", "tout", "tous", "elle", "cette", "vraiment"]);
const normalizePreviewKeyword = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9%]+/g, "").toLowerCase();
const isPreviewKeyword = (word: string) => {
  const token = normalizePreviewKeyword(word);
  if (!token || previewKeywordStopWords.has(token)) return false;
  if (token === "klimax") return true;
  if (/^[0-9]+%?$/.test(token)) return true;
  return token.length >= 5;
};

const KlimaxLogoPlacementPreview = () => (
  <img
    src={`${KLIMAX_LOGO_PREVIEW_URL}?t=${KLIMAX_LOGO_PLACEMENT_TIME_SECONDS}`}
    alt="Logo KLIMAX"
    draggable={false}
    className="pointer-events-none block w-full select-none object-contain"
    style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.5))" }}
  />
);

// ---------------------------------------------------------------------------

const resolveSourceUrl = (id: string | null | undefined, sources: AutoPlanSources): string | undefined => {
  if (!id) return undefined;
  for (const s of [sources.person1, sources.person2, ...sources.speakers]) if (s && s.id === id) return s.fileUrl;
  return undefined;
};

export type AutoVariantCanvasProps = {
  variant: AutoPlanVariant;
  sources: AutoPlanSources;
  clipStage: "intro" | "reply";
  subtitleSample: string;
  /** loop the subtitle entry animation so it stays visible */
  animateSubtitle?: boolean;
};

// Draws a single clip's 1080×1920 frame from its numeric parameters. Read-only —
// the parent owns the variant state and edits flow back in via props.
export const AutoVariantCanvas: React.FC<AutoVariantCanvasProps> = ({ variant, sources, clipStage, subtitleSample, animateSubtitle = true }) => {
  const clip: AutoPlanClip | undefined = variant.clips.find((c) => c.stage === clipStage) || variant.clips[0];
  const settings = variant.settings || {};
  const mirror = settings.mirrorEnabled === true;
  const filterCss = VIDEO_FILTER_CSS[String(settings.videoFilterKey || "none")] || "none";
  const subtitleStyle = (settings.subtitleStyle || {}) as LocalSubtitleStyleSettings;
  const hookStyle = (settings.hookStyle || {}) as LocalHookStyleSettings;

  const [sizes, setSizes] = React.useState<Record<string, { width: number; height: number }>>({});
  const onMeta = (url: string) => (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const { videoWidth, videoHeight } = e.currentTarget;
    if (!videoWidth || !videoHeight) return;
    setSizes((cur) => (cur[url]?.width === videoWidth ? cur : { ...cur, [url]: { width: videoWidth, height: videoHeight } }));
  };

  // Solo cover-fit framing from videoTransform (needs source dims, defaults 16:9).
  const soloFrameStyle = (url: string | undefined, transform?: AutoPlanClip["videoTransform"]): React.CSSProperties => {
    const dim = (url && sizes[url]) || { width: 1920, height: 1080 };
    const sourceAspect = dim.width / dim.height || 16 / 9;
    const targetAspect = BASE_CANVAS_WIDTH / BASE_CANVAS_HEIGHT;
    const zoom = (transform?.scale ?? 100) / 100;
    let scaledWidth = BASE_CANVAS_WIDTH * zoom;
    let scaledHeight = scaledWidth / sourceAspect;
    if (sourceAspect > targetAspect) {
      scaledHeight = BASE_CANVAS_HEIGHT * zoom;
      scaledWidth = scaledHeight * sourceAspect;
    }
    return {
      position: "absolute",
      width: `${(scaledWidth / BASE_CANVAS_WIDTH) * 100}%`,
      height: `${(scaledHeight / BASE_CANVAS_HEIGHT) * 100}%`,
      left: `${50 - ((transform?.x ?? 0) / BASE_CANVAS_WIDTH) * 100}%`,
      top: `${50 - ((transform?.y ?? 0) / BASE_CANVAS_HEIGHT) * 100}%`,
      transform: `translate(-50%, -50%)${mirror ? " scaleX(-1)" : ""}`,
      objectFit: "fill",
      maxWidth: "none",
      maxHeight: "none",
    };
  };

  const split = clip?.dualSpeakerEnabled === true;
  const mainUrl = resolveSourceUrl(clip?.sourceVideoId, sources);
  const addedUrl = resolveSourceUrl(clip?.dualSpeakerSource, sources);

  // Logo: auto mode shows it BIG, centred when logoCenter else at the base spot.
  const logoSize = clip?.logoSize ?? 520;
  const logoCenter = clip?.logoCenter === true;
  const logoPos = logoCenter ? { x: 540, y: 960 } : { x: 540, y: 1385 };

  const hookPos = clip?.hookPosition ?? { x: 540, y: 1325 };
  const hookSizeBox = clip?.hookSize ?? { width: 980, height: 120 };
  const hookText = clip?.hookText || settings.hookText || "";
  const subPos = clip?.subtitlePosition ?? { x: 540, y: clipStage === "intro" ? 1500 : 1265 };

  const previewFontSize = exportSubtitleFontSize(subtitleStyle.fontSize || settings.subtitleSize || DEFAULT_TEXT_SIZE) * PREVIEW_LIBASS_RATIO;
  const subStyle = buildSubtitleTextPreviewStyle(subtitleStyle, canvasFontSize(previewFontSize));
  if (!animateSubtitle) subStyle.animation = undefined;
  const keywordOn = subtitleStyle.keywordHighlightEnabled !== false;
  const sampleText = (subtitleSample || "Sous-titres automatiques").trim();

  const renderBand = (url: string | undefined, zoom: number, cropX: number, cropY: number, key: string) =>
    url ? (
      <video
        key={`${key}-${url}`}
        src={url}
        muted
        playsInline
        onLoadedMetadata={onMeta(url)}
        style={{
          ...exportBandFrameStyle(clampValue(zoom, 100, 220) / 100, clampValue(cropX, -480, 480), clampValue(cropY, -480, 480)),
          ...(mirror ? { transform: `${exportBandFrameStyle(clampValue(zoom, 100, 220) / 100, clampValue(cropX, -480, 480), clampValue(cropY, -480, 480)).transform} scaleX(-1)` } : {}),
          filter: filterCss,
        }}
      />
    ) : (
      <div className="absolute inset-0 grid place-items-center text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
        Source manquante
      </div>
    );

  return (
    <div
      className="relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-[24px] border border-white/10 bg-neutral-950"
      style={{ containerType: "size" }}
    >
      {/* VIDEO LAYER */}
      {split ? (
        (() => {
          const ratio = clampValue(clip?.dualSpeakerSplitRatio ?? 0.5, 0.2, 0.8);
          const addedAtTop = (clip?.dualSpeakerPosition ?? "top") === "top";
          const topPct = ratio * 100;
          const topUrl = addedAtTop ? addedUrl : mainUrl;
          const topZoom = addedAtTop ? clip?.dualSpeakerAddedZoom ?? 100 : clip?.dualSpeakerMainZoom ?? 100;
          const topCropX = addedAtTop ? clip?.dualSpeakerAddedCropX ?? 0 : clip?.dualSpeakerMainCropX ?? 0;
          const topCropY = addedAtTop ? clip?.dualSpeakerAddedCropY ?? 0 : clip?.dualSpeakerMainCropY ?? 0;
          const botUrl = addedAtTop ? mainUrl : addedUrl;
          const botZoom = addedAtTop ? clip?.dualSpeakerMainZoom ?? 100 : clip?.dualSpeakerAddedZoom ?? 100;
          const botCropX = addedAtTop ? clip?.dualSpeakerMainCropX ?? 0 : clip?.dualSpeakerAddedCropX ?? 0;
          const botCropY = addedAtTop ? clip?.dualSpeakerMainCropY ?? 0 : clip?.dualSpeakerAddedCropY ?? 0;
          return (
            <>
              <div className="absolute left-0 top-0 w-full overflow-hidden" style={{ height: `${topPct}%` }}>
                {renderBand(topUrl, topZoom, topCropX, topCropY, "top")}
              </div>
              <div className="absolute left-0 w-full overflow-hidden" style={{ top: `${topPct}%`, height: `${100 - topPct}%` }}>
                {renderBand(botUrl, botZoom, botCropX, botCropY, "bottom")}
              </div>
              {/* split line marker */}
              <div className="absolute left-0 w-full border-t border-dashed border-cyan-400/40" style={{ top: `${topPct}%` }} />
            </>
          );
        })()
      ) : mainUrl ? (
        <video
          key={mainUrl}
          src={mainUrl}
          muted
          playsInline
          onLoadedMetadata={onMeta(mainUrl)}
          className="opacity-90"
          style={{ ...soloFrameStyle(mainUrl, clip?.videoTransform), filter: filterCss }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs font-black uppercase tracking-[0.2em] text-white/40">
          Source manquante
        </div>
      )}

      {/* SUBTITLE */}
      <div
        className="absolute flex justify-center px-2 text-center font-black leading-tight"
        style={{
          left: `${(subPos.x / BASE_CANVAS_WIDTH) * 100}%`,
          top: `${(subPos.y / BASE_CANVAS_HEIGHT) * 100}%`,
          transform: "translate(-50%, -50%)",
          width: "92%",
        }}
      >
        <span style={subStyle}>
          {keywordOn
            ? sampleText.split(/(\s+)/).map((part, i) => {
                if (!part.trim() || !isPreviewKeyword(part)) return <React.Fragment key={i}>{part}</React.Fragment>;
                const color = (subtitleStyle.keywordColor as string) || "#ffe14a";
                return (
                  <span key={i} style={{ color }}>
                    {part}
                  </span>
                );
              })
            : sampleText}
        </span>
      </div>

      {/* HOOK (intro only) */}
      {clipStage === "intro" && hookText ? (
        <div
          className="absolute flex justify-center"
          style={{
            left: `${(hookPos.x / BASE_CANVAS_WIDTH) * 100}%`,
            top: `${(hookPos.y / BASE_CANVAS_HEIGHT) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="relative flex w-fit items-center justify-center text-center shadow-[0_16px_50px_rgba(0,0,0,0.45)]"
            style={{
              backgroundColor: hookStyle.bubbleColor || "#ffffff",
              maxWidth: canvasUnit(hookSizeBox.width * 0.8),
              minHeight: canvasUnit(hookSizeBox.height * 0.8),
              borderRadius: canvasUnit(HOOK_BUBBLE_RADIUS * 0.8),
              boxSizing: "border-box",
              padding: `${canvasUnit(HOOK_BUBBLE_PAD_Y * 0.8)} ${canvasUnit(HOOK_BUBBLE_PAD_X * 0.8)}`,
            }}
          >
            <p
              className="whitespace-pre-line break-words"
              style={{
                color: hookStyle.textColor || "#000000",
                fontFamily: HOOK_FONT_CSS,
                fontWeight: 600,
                fontSize: canvasFontSize((hookStyle.fontSize || DEFAULT_TEXT_SIZE) * 0.8),
                maxWidth: canvasUnit(Math.max(120, hookSizeBox.width * 0.8 - HOOK_BUBBLE_PAD_X * 1.6)),
                lineHeight: 1.1,
              }}
            >
              {hookText}
            </p>
          </div>
        </div>
      ) : null}

      {/* KLIMAX LOGO — semi-transparent in this inspector so it never hides the hook
          or subtitle it sits in front of (in the real render the logo is opaque and
          on top, but only flashes briefly on the "klimax" word). */}
      <div
        className="absolute"
        style={{
          left: `${(logoPos.x / BASE_CANVAS_WIDTH) * 100}%`,
          top: `${(logoPos.y / BASE_CANVAS_HEIGHT) * 100}%`,
          width: canvasUnit(logoSize * LOGO_PREVIEW_FRAME_RATIO),
          transform: "translate(-50%, -50%)",
          opacity: 0.7,
        }}
      >
        <KlimaxLogoPlacementPreview />
      </div>
    </div>
  );
};
