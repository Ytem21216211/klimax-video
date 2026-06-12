// Automatic Mode — variant generation ENGINE.
//
// Produces variants that are indistinguishable in kind from manual mode: it builds
// the EXACT same { settings, clips } shape (see renderCurrentProject in
// ClimaxVideoEditor.tsx) and only PICKS among the same options manual mode exposes
// (same subtitle presets, fonts, filters, dualSpeaker fields, autoZoom modes,
// transition types, b-roll styles, music bank). It never invents new effects, and it
// never touches manual-mode code — server.mjs drives the manual render pipeline
// (renderProject / mergeProjectSettings / ensureTranscription) with these objects.
//
// LOCKED dimension  -> keep the base project's value (we just don't override it).
// VARIED dimension  -> choose WHICH value to use within the existing option space.
// Split-screen is the primary lever and varies on every variant unless locked.

// ---------------------------------------------------------------------------
// Value pools — mirrored 1:1 from manual mode (ClimaxVideoEditor.tsx SUBTITLE_PRESETS
// + VIDEO_FILTERS keys in server.mjs). Kept here so the engine stays self-contained.
// ---------------------------------------------------------------------------

export const FILTER_KEYS = [
  "none", "clean_boost", "warm_viral", "cold_crisp", "contrast_punch",
  "soft_glow", "grain_light", "mono_noir", "green_tint", "pink_pop", "vhs_lite",
];

// The 14 subtitle presets manual mode offers (concrete field sets, copied verbatim).
export const SUBTITLE_PRESETS = {
  impact: { stylePreset: "impact", fontFamily: "Arial Bold", fontSize: 40, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 6, shadowBlur: 18, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  clean: { stylePreset: "clean", fontFamily: "Helvetica", fontSize: 40, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.45, shadowDistance: 3, shadowBlur: 10, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 103, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  highlight: { stylePreset: "highlight", fontFamily: "Impact", fontSize: 36, textColor: "#fff16b", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 5, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "bounce", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  capcut: { stylePreset: "capcut", fontFamily: "Arial Black", fontSize: 40, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.95, shadowDistance: 5, shadowBlur: 18, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 105, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  punch: { stylePreset: "punch", fontFamily: "Anton", fontSize: 44, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#111111", strokeWidth: 5, shadowEnabled: true, shadowColor: "#ff2d55", shadowOpacity: 0.55, shadowDistance: 6, shadowBlur: 20, animationPreset: "bounce", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 106, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  neon: { stylePreset: "neon", fontFamily: "Montserrat", fontSize: 38, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#111111", strokeWidth: 4, shadowEnabled: true, shadowColor: "#00e5ff", shadowOpacity: 0.7, shadowDistance: 4, shadowBlur: 22, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  quickFade: { stylePreset: "quickFade", fontFamily: "Arial Black", fontSize: 38, textColor: "#ffe45c", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 16, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: false, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  orangeThe: { stylePreset: "orangeThe", fontFamily: "Anton", fontSize: 58, textColor: "#ff7a00", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.92, shadowDistance: 5, shadowBlur: 18, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 106, keywordHighlightEnabled: false, keywordColor: "#ff7a00", keywordSecondaryColor: "#ffe14a", keywordTerms: "" },
  proQuick: { stylePreset: "proQuick", fontFamily: "Arial Black", fontSize: 50, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 8, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.95, shadowDistance: 6, shadowBlur: 20, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: false, keywordColor: "#ffe14a", keywordSecondaryColor: "#45f08a", keywordTerms: "" },
  yellowPop: { stylePreset: "yellowPop", fontFamily: "Arial Black", fontSize: 48, textColor: "#ffe14a", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 8, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.95, shadowDistance: 7, shadowBlur: 18, animationPreset: "elastic", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 106, keywordHighlightEnabled: true, keywordColor: "#ffffff", keywordSecondaryColor: "#ff7a00", keywordTerms: "" },
  pinkPunch: { stylePreset: "pinkPunch", fontFamily: "Anton", fontSize: 52, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#ff2d8f", shadowOpacity: 0.82, shadowDistance: 7, shadowBlur: 24, animationPreset: "shake", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 106, keywordHighlightEnabled: true, keywordColor: "#ff4fd8", keywordSecondaryColor: "#ffe14a", keywordTerms: "" },
  cyanGlow: { stylePreset: "cyanGlow", fontFamily: "Montserrat", fontSize: 44, textColor: "#dffcff", strokeEnabled: true, strokeColor: "#001014", strokeWidth: 5, shadowEnabled: true, shadowColor: "#18e8ff", shadowOpacity: 0.9, shadowDistance: 4, shadowBlur: 28, animationPreset: "flicker", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#18e8ff", keywordSecondaryColor: "#ffffff", keywordTerms: "" },
  whiteBox: { stylePreset: "whiteBox", fontFamily: "Impact", fontSize: 42, textColor: "#000000", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: true, shadowColor: "#ffffff", shadowOpacity: 0.65, shadowDistance: 3, shadowBlur: 14, animationPreset: "slide", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#ff7a00", keywordSecondaryColor: "#ffe14a", keywordTerms: "" },
  creatorClean: { stylePreset: "creatorClean", fontFamily: "Avenir Next Heavy", fontSize: 40, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 4, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.72, shadowDistance: 5, shadowBlur: 18, animationPreset: "typewriter", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#45f08a", keywordSecondaryColor: "#ffe14a", keywordTerms: "" },
  // Hormozi-style: heavy black sans, UPPERCASE, green/red keyword pops, yellow
  // active-word karaoke — the look of the biggest talking-head creators.
  hormozi: { stylePreset: "hormozi", fontFamily: "Archivo Black", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.95, shadowDistance: 6, shadowBlur: 16, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#3df25e", keywordSecondaryColor: "#ff4040", keywordTerms: "", uppercase: true, activeWordColor: "#ffe14a" },
};
export const PRESET_KEYS = Object.keys(SUBTITLE_PRESETS);

// Hook bubble look (same fonts/colors manual mode allows).
const HOOK_FONTS = ["Arial Black", "Anton", "Impact", "Montserrat", "Arial Bold"];
const HOOK_BUBBLES = [
  { bubbleColor: "#ffffff", textColor: "#000000" },
  { bubbleColor: "#000000", textColor: "#ffffff" },
  { bubbleColor: "#ffe14a", textColor: "#000000" },
];
// Small/medium only — strong zooms push off-centre faces out of frame.
const ZOOM_INTENSITIES = [
  { autoZoomBoostPercent: 12, autoZoomDurationSeconds: 1.5 }, // léger
  { autoZoomBoostPercent: 22, autoZoomDurationSeconds: 2.0 }, // moyen
];
const CLIP_TRANSITIONS = ["random", "opacity", "camera_flash"];
const BROLL_STYLES = ["square", "fullscreen", "alternate"];

// ---------------------------------------------------------------------------
// PER-PERSON BASE FRAMING (calibrated by hand for this podcast's two cameras).
// The speaker's name is the PREFIX of the clip/source name (any case). For each
// variant we pick a RANDOM value inside the person's range so the framing is the
// clip's BASE crop (where the camera sits), NOT the punch-in zoom effect.
//   x      : horizontal crop offset, px (negative = reveal more of the LEFT)
//   y      : vertical crop offset, px
//   zoom   : base scale %, picked in [100, zoomMax]
// Solo clip → applied to videoTransform {x,y,scale}. Split 2nd speaker → applied to
// dualSpeakerAdded{CropX,CropY,Zoom} (X clamped to the band's ±480 range).
const PERSON_FRAMES = {
  julien: { xMin: -540, xMax: -417, y: 0, zoomMax: 105 },
  shelly: { xMin: 200, xMax: 300, y: 0, zoomMax: 120 },
};
const detectPerson = (name) => {
  const n = String(name || "").toLowerCase();
  if (n.includes("julien")) return "julien";
  if (n.includes("shelly")) return "shelly";
  return null;
};
// Sample a person's base frame from two unit-random draws (rx, rz) so the caller
// controls rng consumption (keeps planning ↔ rendering in lock-step).
const personFrame = (person, rx, rz) => {
  const f = PERSON_FRAMES[person];
  if (!f) return null;
  return {
    x: Math.round(f.xMin + rx * (f.xMax - f.xMin)),
    y: f.y,
    zoom: Math.round(100 + rz * (f.zoomMax - 100)),
  };
};

export const DEFAULT_CONFIG = {
  twoSpeakerRatio: 0.6, // (c) tunable: share of variants that use 2 speakers
  hookMargin: 150,      // (b) max px the hook bubble may sit from the split line
  hookMaxHeight: 200,   // (b) cap bubble height when split is on
  maxAttempts: 40,      // (e) re-rolls before declaring exhaustion
};

// ---------------------------------------------------------------------------
// Deterministic RNG (so a (videoId, index) always yields the same variant).
// ---------------------------------------------------------------------------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeRng = (str) => mulberry32(xmur3(str)());
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const pickAvoid = (arr, rng, avoid) => {
  if (arr.length <= 1) return arr[0];
  let v = pick(arr, rng);
  let guard = 0;
  while (v === avoid && guard++ < 8) v = pick(arr, rng);
  return v;
};
// Stronger variation: never reuse a value already used in this batch until the
// whole pool is exhausted (then fall back to just avoiding the previous one).
const pickUnused = (arr, rng, used, avoid) => {
  const fresh = arr.filter((v) => !used || !used.has(v));
  if (fresh.length) return pick(fresh, rng);
  return pickAvoid(arr, rng, avoid);
};
// quantize continuous values so the uniqueness signature is meaningful (visual, not float noise)
const q = (v, step) => Math.round(v / step) * step;
const clone = (o) => JSON.parse(JSON.stringify(o));

// Convert a detected face centre (fraction of the source frame) into the dualSpeaker
// cropX/cropY for a band, inverting the cover-fit geometry the render applies per band:
//   scale=1080*z : bandH*z (force_original_aspect_ratio=increase), crop=1080:bandH at
//   offset (in_w-1080)*fx / (in_h-bandH)*fy, with fx = clamp(0.5 + cropX/960, 0, 1).
// Shared by the manual /center-faces endpoint (server.mjs) and the auto engine so both
// frame faces identically. A naive (cx-0.5)*960 is WRONG (the source is overscanned).
export const faceToBandCrop = ({ cx, cy, srcW, srcH, bandH, zoom = 1, mirror = false }) => {
  if (!srcW || !srcH || !bandH) return { cropX: 0, cropY: 0 };
  const fcx = mirror ? 1 - cx : cx;
  const As = srcW / srcH;
  const Ab = 1080 / bandH;
  const z = clamp(zoom, 1, 3);
  const Sx = (As >= Ab ? bandH * As : 1080) * z; // scaled source width  (px)
  const Sy = (As >= Ab ? bandH : 1080 / As) * z; // scaled source height (px)
  const axis = (c, S, B) => (S > B + 1 ? clamp((c * S - B / 2) / (S - B), 0, 1) : 0.5);
  const fx = axis(fcx, Sx, 1080);
  const fy = axis(cy, Sy, bandH);
  const toCrop = (f) => clamp(Math.round((f - 0.5) * 960), -480, 480);
  return { cropX: toCrop(fx), cropY: toCrop(fy) };
};

// Even (Bresenham-style) spread of the two-speaker share across the batch.
function isTwoSpeaker(variantIndex, ratio) {
  return Math.round((variantIndex + 1) * ratio) > Math.round(variantIndex * ratio);
}

// ---------------------------------------------------------------------------
// Hook position — x always 540; if split on, centered on the split line (capped
// height + ±margin clamp); if split off, in the safe band between head and subs.
// ---------------------------------------------------------------------------
export function computeHookPosition({ dualSpeakerEnabled, splitRatio, hookHeight, rng, margin = 150, maxHeight = 200 }) {
  const x = 540;
  if (dualSpeakerEnabled) {
    const h = Math.min(hookHeight, maxHeight);
    const line = splitRatio * 1920;
    let y = line - h / 2;
    y = clamp(y, line - margin, line + margin);
    y = clamp(y, 0, 1920 - h);
    return { x, y: Math.round(y), height: h };
  }
  // Solo speaker: the hook sits BELOW the face — its centre varies in the measured
  // 1159–1322 px band (hookPosition.y is the bubble's CENTRE).
  const y = Math.round(1159 + (rng ? rng() : 0.5) * (1322 - 1159));
  return { x, y, height: hookHeight };
}

// Subtitles never overlap the hook: usually right below it, sometimes above.
export function computeSubtitlePosition({ hookY, hookHeight, rng }) {
  const below = (rng ? rng() : 0) < 0.75;
  const gap = 150 + Math.round((rng ? rng() : 0.5) * 40); // hook edge -> sub centre
  const y = below ? hookY + hookHeight / 2 + gap : hookY - hookHeight / 2 - gap;
  return { x: 540, y: Math.round(clamp(y, 900, 1600)) };
}

// stable stringify for the uniqueness hash
function stable(obj) {
  if (Array.isArray(obj)) return `[${obj.map(stable).join(",")}]`;
  if (obj && typeof obj === "object") {
    return `{${Object.keys(obj).sort().map((k) => `${k}:${stable(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(obj);
}

// The fields that actually change the picture — what we hash for dedup.
function signatureOf(settings, clips) {
  const s = settings;
  const sig = {
    f: s.videoFilterKey, sp: s.subtitleStyle?.stylePreset, an: s.subtitleStyle?.animationPreset,
    ff: s.subtitleStyle?.fontFamily, ss: s.subtitleSize, tc: s.subtitleStyle?.textColor,
    hk: s.hookText, hf: s.hookStyle?.fontFamily, hb: s.hookStyle?.bubbleColor,
    mu: s.musicId, mv: s.musicVolumeDb, vv: s.videoVolumeDb,
    zm: s.autoZoomMode, zb: s.autoZoomBoostPercent, zoi: s.introZoomOutEnabled, zor: s.replyZoomOutEnabled,
    tr: s.clipTransitionType, bs: s.brollStyle, mi: s.mirrorEnabled,
    clips: clips.map((c) => ({
      st: c.stage, ds: !!c.dualSpeakerEnabled, dp: c.dualSpeakerPosition, drr: c.dualSpeakerSplitRatio,
      dsrc: c.dualSpeakerSource, dmz: c.dualSpeakerMainZoom, daz: c.dualSpeakerAddedZoom,
      dmx: c.dualSpeakerMainCropX, dax: c.dualSpeakerAddedCropX, br: c.brollId, im: c.imageId,
      vs: c.videoTransform?.scale, hy: c.hookPosition?.y, sy: c.subtitlePosition?.y,
    })),
  };
  return stable(sig);
}

// ---------------------------------------------------------------------------
// Build ONE variant. Returns { settings, clips, signature, combo }.
// ---------------------------------------------------------------------------
export function buildVariant({ base, videoId, variantIndex, varied = {}, lockSplitScreen = false, banks = {}, faceBoxes = {}, prev = {}, attempt = 0, config = {}, overrides = {}, used = {} }) {
  // LEARNED OVERRIDES (training mode): narrow the option space without changing
  // the engine. twoSpeakerRatio biases split-screen frequency; the rest clamp
  // subtitle/music/zoom picks below. null/undefined => default behaviour.
  const ov = overrides || {};
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    // override wins over both default and the caller's config
    ...(typeof ov.twoSpeakerRatio === "number" ? { twoSpeakerRatio: ov.twoSpeakerRatio } : {}),
  };
  const rng = makeRng(`${videoId}:${variantIndex}:${attempt}`);
  const settings = clone(base.settings || {});
  const clips = clone(base.clips || []);
  const intro = clips.find((c) => c.stage === "intro") || clips[0];
  const reply = clips.find((c) => c.stage === "reply") || clips[1] || clips[0];
  const comboParts = [];

  // ---- MIRROR — decided FIRST because every framing computation below must know it:
  // hflip runs BEFORE scale/crop in the render, so a mirrored variant must frame
  // against the FLIPPED image (face cx -> 1-cx; static offsets flip sign). Exactly one
  // variant out of two is flipped (cheap anti-shadowban lever, layout stays coherent).
  settings.mirrorEnabled = variantIndex % 2 === 1;
  const mirrored = settings.mirrorEnabled === true;

  // ---- SPLIT-SCREEN (primary lever, FIRST CLIP ONLY) — varies unless locked ----
  let introSplit = !!intro?.dualSpeakerEnabled;
  let introRatio = intro?.dualSpeakerSplitRatio ?? 0.5;
  if (!lockSplitScreen) {
    const speakers = banks.speakers || [];
    const two = speakers.length > 0 && isTwoSpeaker(variantIndex, cfg.twoSpeakerRatio);
    introSplit = two;
    // The 2nd speaker (reaction) is the bank clip that is NOT the same person as the
    // intro's main speaker — so a "julien" intro gets "shelly", a "shelly" intro gets
    // "other version". Never the same person twice. We match the speaker's name token
    // against the source name; "other version" has no token so it always qualifies.
    const p1name = String(base.sourceNames?.person1 || "").toLowerCase();
    const tokenOf = (t) => String(t || "").toLowerCase().replace(/other|version|clip|speaker|incrustation/g, "").replace(/[^a-z]/g, "");
    const reactionId = (() => {
      if (!speakers.length) return null;
      const cands = speakers.filter((s) => { const tok = tokenOf(s.title); return !tok || !p1name.includes(tok); });
      const sorted = (cands.length ? cands : speakers).slice()
        .sort((a, b) => (/other/i.test(a.title) ? 1 : 0) - (/other/i.test(b.title) ? 1 : 0)); // prefer a named speaker over "other"
      return sorted[0]?.id || intro?.dualSpeakerSource || null;
    })();
    if (intro) {
      intro.dualSpeakerEnabled = two;
      if (two) {
        intro.dualSpeakerSource = reactionId;
        // HAUT/BAS: alterne par variante (les DEUX layouts apparaissent toujours dans le
        // lot) avec un flip aléatoire 25 % pour casser le motif → vraiment varié, jamais
        // tout le lot du même côté.
        const baseTop = variantIndex % 2 === 0;
        intro.dualSpeakerPosition = (rng() < 0.75 ? baseTop : !baseTop) ? "top" : "bottom";
        // RÉPARTITION: plage élargie 25–75 %, pas de 1 % → beaucoup plus de valeurs
        // distinctes (le hook reste centré sur la ligne quel que soit le ratio).
        intro.dualSpeakerSplitRatio = q(0.25 + rng() * 0.50, 0.01);
        // 6 rng draws below, ALWAYS consumed in this fixed order so planning ↔ rendering
        // stay in lock-step whatever branch each band takes.
        // 6 rng draws below, ALWAYS consumed in this fixed order so planning ↔ rendering
        // stay in lock-step whatever branch each band takes.
        intro.dualSpeakerMainZoom = q(105 + rng() * 23, 1); // main band zoom (face path)
        const rAddedZoom = rng();
        const rMainX = rng();
        const rAddedX = rng();
        const rMainY = rng();
        const rAddedY = rng();
        const addedOnTop = intro.dualSpeakerPosition === "top";
        const topBand = Math.round(1920 * intro.dualSpeakerSplitRatio);
        const bottomBand = 1920 - topBand;
        const mainBandH = addedOnTop ? bottomBand : topBand;
        const addedBandH = addedOnTop ? topBand : bottomBand;
        // Jitter is expressed in REAL on-screen pixels (±20 px), converted to cropX
        // units per band: cropX/960 is a fraction of the band's overscan, so the same
        // cropX moves the image more when the overscan is large. Without this
        // conversion a "±40 cropX" jitter was worth up to ±65 real px.
        const bandJitter = (face, bandH, z, rUnit, px) => {
          if (!face?.srcW || !face?.srcH) return 0;
          const As = face.srcW / face.srcH;
          const Sx = (As >= 1080 / bandH ? bandH * As : 1080) * z;
          const overscan = Sx - 1080;
          return overscan > 1 ? (rUnit - 0.5) * 2 * px * (960 / overscan) : 0;
        };

        // MAIN band (1st speaker) — face-anchored centring (mirror-aware), tight jitter.
        const mainFace = faceBoxes[intro.sourceVideoId];
        if (mainFace) {
          const z = intro.dualSpeakerMainZoom / 100;
          const c = faceToBandCrop({ ...mainFace, bandH: mainBandH, zoom: z, mirror: mirrored });
          intro.dualSpeakerMainCropX = clamp(q(c.cropX + bandJitter(mainFace, mainBandH, z, rMainX, 20), 2), -480, 480);
          intro.dualSpeakerMainCropY = clamp(q(c.cropY + bandJitter(mainFace, mainBandH, z, rMainY, 10), 2), -480, 480);
        } else {
          const fallbackX = q((rMainX - 0.5) * 200, 10); // ±100, mirror-flipped
          intro.dualSpeakerMainCropX = mirrored ? -fallbackX : fallbackX;
          intro.dualSpeakerMainCropY = 0;
        }

        // 2nd SPEAKER (added band) — face-anchored too (the only way the face is truly
        // centred whatever the band height/zoom/mirror), with the person's calibrated
        // zoom cap (julien ≤105, shelly ≤120). The static per-person X is only the
        // no-detection fallback, sign-flipped under mirror.
        const addedTitle = (banks.speakers || []).find((s) => s.id === reactionId)?.title;
        const addedPerson = detectPerson(addedTitle);
        const addedFace = faceBoxes[reactionId];
        const addedZoomMax = addedPerson ? PERSON_FRAMES[addedPerson].zoomMax : 128;
        const addedZoomMin = addedPerson ? 100 : 105;
        intro.dualSpeakerAddedZoom = q(addedZoomMin + rAddedZoom * (addedZoomMax - addedZoomMin), 1);
        if (addedFace) {
          const z = intro.dualSpeakerAddedZoom / 100;
          const c = faceToBandCrop({ ...addedFace, bandH: addedBandH, zoom: z, mirror: mirrored });
          intro.dualSpeakerAddedCropX = clamp(q(c.cropX + bandJitter(addedFace, addedBandH, z, rAddedX, 20), 2), -480, 480);
          intro.dualSpeakerAddedCropY = clamp(q(c.cropY + bandJitter(addedFace, addedBandH, z, rAddedY, 10), 2), -480, 480);
        } else {
          const pf = personFrame(addedPerson, rAddedX, rAddedZoom);
          const fallbackX = pf ? pf.x : q((rAddedX - 0.5) * 200, 10);
          intro.dualSpeakerAddedCropX = clamp(mirrored ? -fallbackX : fallbackX, -480, 480);
          intro.dualSpeakerAddedCropY = 0;
        }
        introRatio = intro.dualSpeakerSplitRatio;
      }
    }
    // The 2nd speaker is NEVER on the reply — it stays only on the first clip.
    if (reply) reply.dualSpeakerEnabled = false;
    comboParts.push(two ? `split ${Math.round(introRatio * 100)}%` : "solo");
  }

  // ---- HOOK + SUBTITLE POSITION — recomputed for THIS variant's intro split ----
  if (intro) {
    intro.hookSize = intro.hookSize || { width: 980, height: 120 };
    const hp = computeHookPosition({
      dualSpeakerEnabled: introSplit, splitRatio: introRatio,
      hookHeight: intro.hookSize.height, rng, margin: cfg.hookMargin, maxHeight: cfg.hookMaxHeight,
    });
    intro.hookPosition = { x: hp.x, y: hp.y };
    intro.hookSize = { ...intro.hookSize, height: hp.height };
    // Subtitles track the hook (below it most of the time, sometimes above) so
    // they never overlap whatever band the hook landed in.
    intro.subtitlePosition = computeSubtitlePosition({ hookY: hp.y, hookHeight: hp.height, rng });
  }

  // ---- SUBTITLES (+ filter) — size varies 65–90 px whatever the preset ----
  if (varied.subtitles) {
    // learned overrides: whitelist presets, cap size, deny some filters
    const presetPool = (Array.isArray(ov.allowedSubtitlePresets) && ov.allowedSubtitlePresets.length)
      ? PRESET_KEYS.filter((k) => ov.allowedSubtitlePresets.includes(k))
      : PRESET_KEYS;
    const filterPool = (Array.isArray(ov.filterDenylist) && ov.filterDenylist.length)
      ? FILTER_KEYS.filter((k) => !ov.filterDenylist.includes(k))
      : FILTER_KEYS;
    const presetKey = pickUnused(presetPool.length ? presetPool : PRESET_KEYS, rng, used.presets, prev.stylePreset);
    let subtitleSize = q(65 + rng() * 25, 1);
    if (typeof ov.subtitleSizeMax === "number") subtitleSize = Math.min(subtitleSize, ov.subtitleSizeMax);
    settings.subtitleStyle = { ...SUBTITLE_PRESETS[presetKey], fontSize: subtitleSize };
    settings.subtitleSize = subtitleSize;
    settings.videoFilterKey = pickUnused(filterPool.length ? filterPool : FILTER_KEYS, rng, used.filters, prev.filter);
    comboParts.push(`sous-titres ${presetKey} ${subtitleSize}px`, `filtre ${settings.videoFilterKey}`);
  }

  // ---- SOLO CLIP FRAMING — face-anchored base crop (1 speaker) ----
  // The render's solo path is: hflip? -> scale 1080s x 1920s (cover) -> crop 1080x1920
  // at offset (in_w-1080)/2 + x. Solving for the x that puts the face centre in the
  // middle of the crop: x = (cx - 0.5) * scaledWidth (cx -> 1-cx when mirrored). The
  // person's calibrated zoom cap bounds the BASE scale (julien ≤105, shelly ≤120) and a
  // small ±20 px jitter varies each variant without ever leaving the face. Static
  // per-person X only when detection failed (sign-flipped under mirror); unknown
  // person → the old generic 100–120 % centre crop. Two rng draws per solo clip,
  // ALWAYS consumed so planning ↔ rendering stay in lock-step.
  for (const clip of clips) {
    const rx = rng();
    const rz = rng();
    if (clip?.dualSpeakerEnabled) continue; // split bands have their own zooms
    const personName = clip?.stage === "reply" ? base.sourceNames?.person2 : base.sourceNames?.person1;
    const person = detectPerson(personName);
    const fb = faceBoxes[clip.sourceVideoId];
    const zoomMax = person ? PERSON_FRAMES[person].zoomMax : 120;
    if (fb?.srcW && fb?.srcH) {
      const scale = Math.round(100 + rz * (zoomMax - 100));
      const s = scale / 100;
      const As = fb.srcW / fb.srcH;
      const Sx = (As >= 1080 / 1920 ? 1920 * As : 1080) * s; // cover-fit scaled width
      const cx = mirrored ? 1 - fb.cx : fb.cx;
      const x = Math.round((cx - 0.5) * Sx + (rx - 0.5) * 40); // centre + ±20 px jitter
      clip.videoTransform = { x, y: 0, scale };
    } else if (person) {
      const pf = personFrame(person, rx, rz);
      clip.videoTransform = { x: mirrored ? -pf.x : pf.x, y: pf.y, scale: pf.zoom };
    } else {
      clip.videoTransform = { ...(clip.videoTransform || { x: 0, y: 0 }), scale: q(100 + rz * 20, 2) };
    }
  }

  // ---- HOOK (text only) ----
  // Box + font are FIXED to the reference look (white rounded rectangle, clean sans
  // — enforced by the renderer), so only the hook TEXT varies. That's what matters
  // for OCR-dedup / shadowban anyway.
  if (varied.hook) {
    const hooks = banks.hooks || [];
    if (hooks.length) {
      const text = hooks[variantIndex % hooks.length];
      settings.hookText = text;
      if (intro) intro.hookText = text;
      comboParts.push("hook varié"); // only claim variation when a hook was actually set
    }
    settings.hookStyle = { ...(settings.hookStyle || {}), bubbleColor: "#ffffff", textColor: "#000000" };
  }

  // ---- B-ROLL (reply only) ----
  if (varied.broll && reply) {
    const pool = (banks.brolls && banks.brolls.length ? banks.brolls : banks.images) || [];
    if (pool.length) {
      reply.brollId = pick(pool, rng).id;
      reply.imageId = null;
    }
    settings.brollStyle = pick(BROLL_STYLES, rng);
    reply.imageTransform = {
      scale: q(90 + rng() * 40, 2),     // 90–130 %
      x: q((rng() - 0.5) * 160, 10),    // ±80
      y: q((rng() - 0.5) * 160, 10),
    };
    comboParts.push(`b-roll ${settings.brollStyle}`);
  }

  // ---- MUSIC (+ levels) ----
  if (varied.music) {
    const tracks = banks.music || [];
    if (tracks.length) settings.musicId = pickAvoid(tracks.map((m) => m.id), rng, prev.musicId);
    let musicVolumeDb = q(-20 + rng() * 6, 1);  // -20..-14
    // learned override: "musique trop forte" lowers the ceiling (more negative dB)
    if (typeof ov.musicVolumeMaxDb === "number") musicVolumeDb = Math.min(musicVolumeDb, ov.musicVolumeMaxDb);
    settings.musicVolumeDb = musicVolumeDb;
    settings.videoVolumeDb = q(rng() * 4, 1);        // 0..+4
    comboParts.push("musique variée");
  }

  // ---- TRANSITIONS — always ON in auto (the cut variety is a core anti-shadowban
  // lever). "random" alternates fade / camera-flash per cut at render time; when the
  // SFX dimension is varied we also pin a specific type on some variants.
  settings.clipTransitionsEnabled = true;
  settings.clipTransitionType = varied.sfx ? pick(CLIP_TRANSITIONS, rng) : "random";
  if (varied.sfx) comboParts.push(`transition ${settings.clipTransitionType}`);

  // (mirror is decided at the very top of buildVariant — see `mirrored`)
  if (settings.mirrorEnabled) comboParts.push("miroir");

  // ---- ZOOMS (in-clip punch-in effect — the "Zooms" toggle) ----
  // When the dimension is LOCKED (varied.zooms === false) the user wants NO punch-in
  // zoom at all. The engine used to leave autoZoomEnabled untouched, so it inherited the
  // base project's value (default true) and zoomed anyway — that's the bug. Now we set
  // the flag explicitly both ways so the toggle truly turns the effect on/off.
  // NB: this is independent of the per-person BASE framing zoom below (that's how the
  // clip is cropped, not the punch-in effect).
  if (varied.zooms) {
    settings.autoZoomEnabled = true;
    settings.autoZoomMode = pick(["cut", "smooth"], rng);
    // learned override: cap zoom intensity ("zooms trop violents")
    const zoomPool = typeof ov.zoomMaxBoostPercent === "number"
      ? ZOOM_INTENSITIES.filter((z) => z.autoZoomBoostPercent <= ov.zoomMaxBoostPercent)
      : ZOOM_INTENSITIES;
    const it = pick(zoomPool.length ? zoomPool : ZOOM_INTENSITIES, rng);
    settings.autoZoomBoostPercent = typeof ov.zoomMaxBoostPercent === "number"
      ? Math.min(it.autoZoomBoostPercent, ov.zoomMaxBoostPercent)
      : it.autoZoomBoostPercent;
    settings.autoZoomDurationSeconds = it.autoZoomDurationSeconds;
    comboParts.push(`zoom ${settings.autoZoomMode}`);
  } else {
    settings.autoZoomEnabled = false;
  }
  // Start-of-clip zoom-outs look robotic in auto — disabled until reworked.
  // (The IN-clip random zooms above stay: they're the anti-shadowban lever.)
  settings.introZoomOutEnabled = false;
  settings.replyZoomOutEnabled = false;

  // ---- KLIMAX LOGO — auto mode always shows it BIG and ON TOP. Its size varies
  // 850–920 px per variant (the only logo lever), and `autoMode` tells the renderer
  // to composite the logo LAST so nothing (b-roll, subtitles, hook) ever covers it.
  // POSITION also varies per variant: half the time the logo stays at its base spot,
  // half the time it pops dead-centre of the frame (same size, in front) — and when it's
  // centred the renderer drops the subtitle during the pop-up so nothing sits behind it.
  settings.autoMode = true;
  const logoSize = q(850 + rng() * 70, 2); // 850–920 px, varied per variant
  const logoCenter = rng() < 0.5;
  for (const clip of clips) { clip.logoSize = logoSize; clip.logoCenter = logoCenter; }
  comboParts.push(`logo ${logoSize}px${logoCenter ? " centré" : ""}`);

  return {
    settings, clips,
    signature: signatureOf(settings, clips),
    combo: comboParts.join(" · ") || "variante",
    picks: { stylePreset: settings.subtitleStyle?.stylePreset, filter: settings.videoFilterKey, musicId: settings.musicId },
    // Human-readable snapshot of what the engine chose — shown in training mode
    // and fed to Claude as context when distilling feedback.
    decisions: {
      hookText: settings.hookText || null,
      splitScreen: !!intro?.dualSpeakerEnabled,
      splitRatio: intro?.dualSpeakerEnabled ? introRatio : null,
      subtitlePreset: settings.subtitleStyle?.stylePreset || null,
      subtitleSize: settings.subtitleSize ?? null,
      videoFilter: settings.videoFilterKey || null,
      brollStyle: settings.brollStyle || null,
      brollId: reply?.brollId || null,
      musicId: settings.musicId || null,
      musicVolumeDb: settings.musicVolumeDb ?? null,
      zoomMode: varied.zooms ? settings.autoZoomMode : null,
      zoomBoostPercent: varied.zooms ? settings.autoZoomBoostPercent : null,
      mirror: !!settings.mirrorEnabled,
    },
  };
}

// ---------------------------------------------------------------------------
// Plan a batch for ONE video: returns up to `requested` UNIQUE variants, capping
// at the achievable count (decision e) and spreading choices (no repeats in a row).
// ---------------------------------------------------------------------------
export function planVideoVariants({ base, videoId, requested, varied, lockSplitScreen, banks, faceBoxes = {}, config, overrides }) {
  // twoSpeakerRatio override must also bias cfg here (isTwoSpeaker reads cfg).
  const ov = overrides || {};
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    ...(typeof ov.twoSpeakerRatio === "number" ? { twoSpeakerRatio: ov.twoSpeakerRatio } : {}),
  };
  const seen = new Set();
  const out = [];
  let prev = {};
  // Track presets/filters already used in THIS batch so every variant looks clearly
  // different (no preset/filter repeats until the pool is exhausted).
  const used = { presets: new Set(), filters: new Set() };
  for (let i = 0; i < requested; i++) {
    let chosen = null;
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      const v = buildVariant({ base, videoId, variantIndex: i, varied, lockSplitScreen, banks, faceBoxes, prev, attempt, config: cfg, overrides: ov, used });
      if (!seen.has(v.signature)) { chosen = v; break; }
    }
    if (!chosen) break; // exhausted: no new unique combo achievable
    seen.add(chosen.signature);
    prev = chosen.picks;
    if (chosen.picks.stylePreset) used.presets.add(chosen.picks.stylePreset);
    if (chosen.picks.filter) used.filters.add(chosen.picks.filter);
    out.push({ index: i, settings: chosen.settings, clips: chosen.clips, combo: chosen.combo, decisions: chosen.decisions });
  }
  return { variants: out, achievable: out.length, requested };
}
