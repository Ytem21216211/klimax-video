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
  // Bebas tall caps, big and editorial, gold active word.
  bebasGold: { stylePreset: "bebasGold", fontFamily: "Bebas Neue", fontSize: 56, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 5, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#ffcf33", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#ffcf33" },
  // Montserrat clean, ice-blue keyword, soft rise — modern/premium.
  iceBlue: { stylePreset: "iceBlue", fontFamily: "Montserrat", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#0a2540", strokeWidth: 4, shadowEnabled: true, shadowColor: "#0a2540", shadowOpacity: 0.7, shadowDistance: 4, shadowBlur: 20, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#37c6ff", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#37c6ff" },
  // Anton red-alert, UPPERCASE, shake — aggressive hook style.
  redAlert: { stylePreset: "redAlert", fontFamily: "Anton", fontSize: 50, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#b00000", shadowOpacity: 0.8, shadowDistance: 6, shadowBlur: 18, animationPreset: "shake", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 104, keywordHighlightEnabled: true, keywordColor: "#ff3b3b", keywordSecondaryColor: "#ffe14a", keywordTerms: "", uppercase: true, activeWordColor: "#ff3b3b" },
  // Mint bounce, playful — green/white, lower-strength stroke.
  mintBounce: { stylePreset: "mintBounce", fontFamily: "Arial Black", fontSize: 44, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#06281f", strokeWidth: 5, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.85, shadowDistance: 5, shadowBlur: 14, animationPreset: "bounce", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 103, keywordHighlightEnabled: true, keywordColor: "#36f1a6", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#36f1a6" },
  // Pure white minimalist, NO keyword color, gentle fade — clean documentary look.
  cleanMinimal: { stylePreset: "cleanMinimal", fontFamily: "Helvetica", fontSize: 40, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.55, shadowDistance: 3, shadowBlur: 12, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffffff", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#ffe14a" },
  // Black box on white — Impact inverted, slide. Bold meme/news vibe.
  invertBox: { stylePreset: "invertBox", fontFamily: "Impact", fontSize: 44, textColor: "#111111", strokeEnabled: false, strokeColor: "#111111", strokeWidth: 0, shadowEnabled: true, shadowColor: "#ffffff", shadowOpacity: 0.6, shadowDistance: 3, shadowBlur: 10, animationPreset: "slide", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#ff2d8f", keywordSecondaryColor: "#0a84ff", keywordTerms: "", uppercase: true, activeWordColor: "#ff2d8f" },
  // Purple neon glow, Montserrat, elastic — flashy nightlife look.
  purpleNeon: { stylePreset: "purpleNeon", fontFamily: "Montserrat", fontSize: 42, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#1a0033", strokeWidth: 4, shadowEnabled: true, shadowColor: "#a855f7", shadowOpacity: 0.85, shadowDistance: 4, shadowBlur: 26, animationPreset: "elastic", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: true, keywordColor: "#c084fc", keywordSecondaryColor: "#22d3ee", keywordTerms: "", activeWordColor: "#c084fc" },
  // --- TikTok/CapCut pack (boxEnabled = ASS BorderStyle=4 background box) ---
  // TikTok native caption: black text on a white box, spoken word in TikTok red.
  tiktokWhite: { stylePreset: "tiktokWhite", fontFamily: "Helvetica", fontSize: 44, textColor: "#000000", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "none", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#fe2c55", keywordSecondaryColor: "#25f4ee", keywordTerms: "", activeWordColor: "#fe2c55", boxEnabled: true, boxColor: "#ffffff", boxOpacity: 1, boxPadding: 18 },
  // Inverted: white text on a translucent black box, TikTok cyan/red keywords.
  tiktokBlack: { stylePreset: "tiktokBlack", fontFamily: "Helvetica", fontSize: 44, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "fade", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#25f4ee", keywordSecondaryColor: "#fe2c55", keywordTerms: "", activeWordColor: "#25f4ee", boxEnabled: true, boxColor: "#000000", boxOpacity: 0.78, boxPadding: 18 },
  // Sticker style: UPPERCASE white on TikTok red box.
  tiktokRed: { stylePreset: "tiktokRed", fontFamily: "Arial Black", fontSize: 42, textColor: "#ffffff", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffe14a", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#ffe14a", boxEnabled: true, boxColor: "#fe2c55", boxOpacity: 1, boxPadding: 16 },
  // CapCut sticker: UPPERCASE dark text on a yellow box.
  capcutYellow: { stylePreset: "capcutYellow", fontFamily: "Arial Black", fontSize: 42, textColor: "#111111", strokeEnabled: false, strokeColor: "#000000", strokeWidth: 0, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#ffffff", keywordSecondaryColor: "#111111", keywordTerms: "", uppercase: true, activeWordColor: "#ffffff", boxEnabled: true, boxColor: "#ffe14a", boxOpacity: 1, boxPadding: 16 },
  // CapCut auto-caption: bold white + heavy stroke, spoken word flips yellow.
  capcutKaraoke: { stylePreset: "capcutKaraoke", fontFamily: "Arial Black", fontSize: 46, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 8, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 102, keywordHighlightEnabled: false, keywordColor: "#ffd400", keywordSecondaryColor: "#ffffff", keywordTerms: "", activeWordColor: "#ffd400" },
  // Static UPPERCASE text, only the spoken word turns green — very TikTok.
  karaokeGreen: { stylePreset: "karaokeGreen", fontFamily: "Archivo Black", fontSize: 44, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 7, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.9, shadowDistance: 5, shadowBlur: 14, animationPreset: "none", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#39e55f", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#39e55f" },
  // Thick outline, no shadow halo — crisp TikTok red/cyan keyword pops.
  tiktokOutline: { stylePreset: "tiktokOutline", fontFamily: "Montserrat", fontSize: 46, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 10, shadowEnabled: false, shadowColor: "#000000", shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, animationPreset: "pop", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: true, keywordColor: "#fe2c55", keywordSecondaryColor: "#25f4ee", keywordTerms: "", activeWordColor: "#ffe14a" },
  // Bebas tall caps, editorial, spoken word in TikTok red.
  bebasCaps: { stylePreset: "bebasCaps", fontFamily: "Bebas Neue", fontSize: 54, textColor: "#ffffff", strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6, shadowEnabled: true, shadowColor: "#000000", shadowOpacity: 0.85, shadowDistance: 4, shadowBlur: 12, animationPreset: "rise", wordsPerLine: 2, introVerticalPosition: "lower", replyVerticalPosition: "middle", fontWeight: 900, fontScaleX: 100, keywordHighlightEnabled: false, keywordColor: "#fe2c55", keywordSecondaryColor: "#ffffff", keywordTerms: "", uppercase: true, activeWordColor: "#fe2c55" },
};
export const PRESET_KEYS = Object.keys(SUBTITLE_PRESETS);

// Hook bubble look (same fonts/colors manual mode allows).
const HOOK_FONTS = ["Arial Black", "Anton", "Impact", "Montserrat", "Arial Bold"];
// The hook bubble colour varies per render again (was forced white): white/black,
// black/white, yellow/black, red/white …
const HOOK_BUBBLES = [
  { bubbleColor: "#ffffff", textColor: "#000000" }, // blanc / noir
  { bubbleColor: "#000000", textColor: "#ffffff" }, // noir / blanc
  { bubbleColor: "#ffe14a", textColor: "#000000" }, // jaune / noir
  { bubbleColor: "#ff3b3b", textColor: "#ffffff" }, // rouge / blanc
];
// Subtitle entry animations (valid mergeProjectSettings presets, "none" excluded so
// there's always motion). Picked INDEPENDENTLY of the style preset so the animation
// changes every render, not just the colour/font preset.
const SUBTITLE_ANIMS = ["pop", "bounce", "rise", "fade", "zoom", "slide", "shake", "typewriter", "flicker", "elastic"];
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
  // vasko = 2nd speaker (right) for the "Klimax 2" podcast — same calibration as shelly
  // (the previous right speaker). Detected by the "vasko" prefix in the clip/source name.
  vasko: { xMin: 200, xMax: 300, y: 0, zoomMax: 120 },
};
const detectPerson = (name) => {
  const n = String(name || "").toLowerCase();
  if (n.includes("julien")) return "julien";
  if (n.includes("shelly")) return "shelly";
  if (n.includes("vasko")) return "vasko";
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
// SAFE-ZONE LAYOUT — hook + subtitles are placed inside zones computed from what
// the variant already knows: the on-screen face rects (after crop/zoom), the split
// line, the hook bubble rect and the estimated subtitle block height. A SMALL
// bounded rng jitter keeps anti-shadowban variety WITHOUT ever overlapping.
// NB: the Klimax logo needs no geometric handling here — the renderer resolves
// logo conflicts temporally (subtitles are lifted to the top or hidden while the
// logo is on screen, see buildAssSubtitleFile logoWindows in server.mjs).
// All Y values are vertical CENTRES in the 1080×1920 canvas.
// ---------------------------------------------------------------------------

// Vertical screen interval {y0,y1} of the face in a SOLO clip — inverts the render's
// cover-fit: hflip? -> scale 1080s×1920s (increase) -> crop 1080×1920 at
// (Sw-1080)/2 + tx. Mirror only moves X, so the vertical interval ignores it.
const faceIntervalSolo = (face, transform) => {
  if (!face?.srcW || !face?.srcH) return null;
  const s = clamp((Number(transform?.scale) || 100) / 100, 0.5, 3);
  const k = Math.max((1080 * s) / face.srcW, (1920 * s) / face.srcH);
  const Sh = face.srcH * k;
  const cropY = clamp((Sh - 1920) / 2 + (Number(transform?.y) || 0), 0, Math.max(0, Sh - 1920));
  const cy = face.cy * Sh - cropY;
  const fh = (face.h || 0.2) * Sh;
  // Inflate: hairline above, chin + margin below so text never sits on the mouth.
  return { y0: cy - 1.15 * fh, y1: cy + 1.45 * fh };
};

// Same for a split BAND of height bandH whose top sits at y0Band on the canvas —
// inverts the faceToBandCrop geometry (fy = 0.5 + cropY/960 fraction of overscan).
const faceIntervalBand = (face, { bandH, y0Band, zoom, cropY }) => {
  if (!face?.srcW || !face?.srcH || !bandH) return null;
  const As = face.srcW / face.srcH;
  const Ab = 1080 / bandH;
  const z = clamp(zoom || 1, 1, 3);
  const Sy = (As >= Ab ? bandH : 1080 / As) * z;
  const fy = clamp(0.5 + (Number(cropY) || 0) / 960, 0, 1);
  const cy = face.cy * Sy - (Sy - bandH) * fy;
  const fh = (face.h || 0.2) * Sy;
  const y0 = y0Band + clamp(cy - 1.15 * fh, 0, bandH);
  const y1 = y0Band + clamp(cy + 1.45 * fh, 0, bandH);
  return y1 > y0 + 1 ? { y0, y1 } : null;
};

// TikTok/Shorts UI reserves: nothing readable in the very top or bottom strips.
const SAFE_TOP = 140;
const SAFE_BOTTOM = 1750;

// Complement of the blocked intervals inside [SAFE_TOP, SAFE_BOTTOM] -> [[lo,hi],…]
const freeIntervals = (blocked) => {
  const bs = (blocked || [])
    .filter(Boolean)
    .map((b) => [Math.max(SAFE_TOP, b.y0), Math.min(SAFE_BOTTOM, b.y1)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = SAFE_TOP;
  for (const [a, b] of bs) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < SAFE_BOTTOM) out.push([cur, SAFE_BOTTOM]);
  return out;
};

// Real on-screen height of the hook bubble PNG (render_hook_bubble.py wraps at
// maxWidth ≈ 784 px / HOOK_SCALE 0.8 — ≈38 chars per line at ~42 px Helvetica).
export const estimateHookHeight = (text, layoutHeight = 120) => {
  const len = String(text || "").trim().length;
  const minH = Math.max(96, Math.round(layoutHeight * 0.8));
  if (!len) return minH;
  const lines = Math.max(1, Math.ceil(len / 38));
  return Math.max(minH, 48 + lines * 55);
};

// On-screen height of one caption line (wordsPerLine is forced to 2 -> single line):
// render font = clamp(round(size*1.08), 38, 96), glyph block ≈ 1.5×, + shadow drop.
export const estimateSubtitleBlockHeight = (fontSizePx, shadowDistance = 6) =>
  Math.round(clamp(Math.round((Number(fontSizePx) || 53) * 1.08), 38, 96) * 1.5) + (Number(shadowDistance) || 0);

// ---------------------------------------------------------------------------
// Hook position — x always 540. Split: stays on the split line (it hides the seam)
// but slides ±margin to clear both faces. Solo: free zone below the face.
// ALWAYS consumes exactly ONE rng draw whatever the branch (planning ↔ rendering
// lock-step must not depend on faceBoxes availability).
// ---------------------------------------------------------------------------
export function computeHookPosition({ dualSpeakerEnabled, splitRatio, hookHeight, hookHeightEst = 0, rng, margin = 150, maxHeight = 200, faces = [] }) {
  const x = 540;
  const r = rng ? rng() : 0.5; // the single draw — consumed up-front in BOTH branches
  if (dualSpeakerEnabled) {
    const h = Math.min(hookHeight, maxHeight); // layout height (legacy semantics)
    const hg = Math.max(h, hookHeightEst);     // REAL bubble height, for collisions
    const line = splitRatio * 1920;
    // The hook sits ON the split SEAM — literally BETWEEN the two speakers — hiding the
    // band boundary. Pinned to the seam with only a tiny ±30 px jitter so it never
    // drifts off into one speaker's band. (Faces are intentionally NOT dodged here: the
    // seam region is between the two faces, which is exactly where we want it.)
    // Exactly ONE rng draw (r), as in the solo branch — planning ↔ rendering lock-step.
    const y = clamp(line + (r - 0.5) * 60, hg / 2, 1920 - hg / 2);
    return { x, y: Math.round(y), height: h, geomHeight: hg };
  }
  // Solo: place the bubble in a face-free zone, preferring the classic band BELOW
  // the face (1050–1450). No face info -> degrades to ≈ the legacy 1159–1322 band.
  const hg = Math.max(hookHeight, hookHeightEst);
  const feasible = freeIntervals(faces)
    .map(([a, b]) => [a + hg / 2, b - hg / 2])
    .filter(([lo, hi]) => hi >= lo);
  let lo = 1159, hi = 1322; // legacy fallback (everything blocked)
  const inBand = feasible.filter(([a, b]) => Math.min(b, 1450) >= Math.max(a, 1050));
  if (inBand.length) {
    const z = inBand[inBand.length - 1]; // the LOWEST such zone = below the face
    lo = Math.max(z[0], 1050);
    hi = Math.min(z[1], 1450);
  } else if (feasible.length) {
    const z = feasible.reduce((m, c) => (c[1] - c[0] > m[1] - m[0] ? c : m));
    lo = z[0];
    hi = z[1];
  }
  // Bounded jitter: at most ±100 px around the zone midpoint.
  const mid = (lo + hi) / 2;
  lo = Math.max(lo, mid - 100);
  hi = Math.min(hi, mid + 100);
  return { x, y: Math.round(lo + r * (hi - lo)), height: hookHeight, geomHeight: hg };
}

// ---------------------------------------------------------------------------
// Subtitle position — the captions sit a CLEAR GAP below (or above) the hook and
// NEVER on top of it. Faces don't block the hook-relative placement: a caption over
// a torso is normal for short-form, and far better than the previous bug that parked
// the subtitle exactly ON the hook when faces+reserves left no "free zone".
// `hookY = null` on clips without a hook (reply) -> lower third, dodging the face.
// ALWAYS consumes exactly TWO rng draws (planning ↔ rendering lock-step).
// ---------------------------------------------------------------------------
export function computeSubtitlePosition({ hookY = null, hookHeight = 0, rng, faces = [], blockH = 120 }) {
  const r1 = rng ? rng() : 0;   // below/above choice (hook case)
  const r2 = rng ? rng() : 0.5; // bounded jitter / zone offset
  const half = blockH / 2;
  const GAP = 56; // generous clearance between the hook edge and the caption block
  const loBound = SAFE_TOP + half;
  const hiBound = SAFE_BOTTOM - half;

  if (hookY != null) {
    const hookBot = hookY + hookHeight / 2;
    const hookTop = hookY - hookHeight / 2;
    const belowY = hookBot + GAP + half;
    const aboveY = hookTop - GAP - half;
    const belowFits = belowY <= hiBound;
    const aboveFits = aboveY >= loBound;
    let y;
    if (belowFits && (r1 < 0.75 || !aboveFits)) y = Math.min(belowY + r2 * 36, hiBound); // a touch lower
    else if (aboveFits) y = Math.max(aboveY - r2 * 36, loBound);                          // a touch higher
    else y = clamp(belowY, loBound, hiBound);
    return { x: 540, y: Math.round(clamp(y, loBound, hiBound)) };
  }

  // No hook (reply): lower third, dodging the speaker's face when there's room.
  const free = freeIntervals(faces)
    .map(([a, b]) => [a + half, b - half])
    .filter(([lo, hi]) => hi >= lo);
  const lowerPref = free.filter(([lo, hi]) => hi >= 1150 && lo <= 1700);
  const zone = lowerPref.length ? lowerPref[lowerPref.length - 1] : free.length ? free[free.length - 1] : null;
  if (!zone) return { x: 540, y: Math.round(clamp(1240 + (r2 - 0.5) * 120, loBound, hiBound)) };
  const lo = Math.max(zone[0], 1150);
  const hi = Math.min(zone[1], 1680);
  const y = lo <= hi ? lo + (0.35 + r2 * 0.5) * (hi - lo) : (zone[0] + zone[1]) / 2;
  return { x: 540, y: Math.round(clamp(y, loBound, hiBound)) };
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
    tr: s.clipTransitionType, bs: s.brollStyle, bsq: s.brollSquareScale, mi: s.mirrorEnabled,
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
  // Per-project editable RANGES (exposed in the Studio project editor). Each reads an
  // override pair with a sane default; the engine still ALWAYS consumes the same rng
  // draws, so only the values shift, never the lock-step. `rangePick` keeps draw order.
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const range = (loKey, hiKey, dLo, dHi) => {
    let lo = num(ov[loKey], dLo);
    let hi = num(ov[hiKey], dHi);
    if (lo > hi) [lo, hi] = [hi, lo];
    return [lo, hi];
  };
  const rng = makeRng(`${videoId}:${variantIndex}:${attempt}`);
  const settings = clone(base.settings || {});
  const clips = clone(base.clips || []);
  const intro = clips.find((c) => c.stage === "intro") || clips[0];
  // null on a SINGLE-clip project (a "rush simple") -> all reply ops below are guarded
  // and skipped, so the rush renders as one solo clip (no doubled second segment).
  const reply = clips.find((c) => c.stage === "reply") || clips[1] || null;
  const comboParts = [];

  // ---- MIRROR — decided FIRST because the split/dual-speaker framing below is
  // mirror-aware (face cx -> 1-cx; static band offsets flip sign — see faceToBandCrop).
  // The SOLO framing, by contrast, stores X in the natural orientation and lets the
  // renderer negate it under mirror (single source of truth). Exactly one variant out
  // of two is flipped (cheap anti-shadowban lever, layout stays coherent).
  settings.mirrorEnabled = variantIndex % 2 === 1;
  const mirrored = settings.mirrorEnabled === true;

  // ---- SPLIT-SCREEN (primary lever, FIRST CLIP ONLY) — varies unless locked ----
  let introRatio = intro?.dualSpeakerSplitRatio ?? 0.5;
  if (!lockSplitScreen) {
    const speakers = banks.speakers || [];
    // A "rush simple" (solo project, no reply clip) is rendered as JUST that one rush —
    // never split with a reaction speaker. Split is a podcast-only lever.
    const two = !!reply && speakers.length > 0 && isTwoSpeaker(variantIndex, cfg.twoSpeakerRatio);
    // The 2nd speaker (reaction) is the bank clip that is NOT the same person as the
    // intro's main speaker — so a "julien" intro gets "shelly", a "shelly" intro gets
    // "other version". Never the same person twice. We match the speaker's name token
    // against the source name; "other version" has no token so it always qualifies.
    const p1name = String(base.sourceNames?.person1 || "").toLowerCase();
    // Name token of a speaker bank clip. MUST drop the file extension first — otherwise
    // "Vasko.mp4" -> "vaskomp" (the "mp" of mp4), which never matches the source name, so
    // the SAME-person speaker fails to be excluded and a Vasko hook wrongly gets Vasko.
    const tokenOf = (t) => String(t || "").toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/other|version|clip|speaker|incrustation/g, "")
      .replace(/[^a-z]/g, "");
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
        {
          const [sLo, sHi] = range("splitRatioMin", "splitRatioMax", 0.25, 0.75);
          intro.dualSpeakerSplitRatio = q(clamp(sLo + rng() * (sHi - sLo), 0.2, 0.8), 0.01);
        }
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

  // (hook + subtitle positions are computed in the SAFE-ZONE LAYOUT block below,
  //  AFTER framing/hook-text so face rects and the real hook height are known)

  // ---- SUBTITLES (+ filter) — size is ALWAYS randomized (62–94 px) ----
  if (varied.subtitles) {
    // learned overrides: whitelist presets, cap size, deny some filters
    const presetPool = (Array.isArray(ov.allowedSubtitlePresets) && ov.allowedSubtitlePresets.length)
      ? PRESET_KEYS.filter((k) => ov.allowedSubtitlePresets.includes(k))
      : PRESET_KEYS;
    const filterPool = (Array.isArray(ov.filterDenylist) && ov.filterDenylist.length)
      ? FILTER_KEYS.filter((k) => !ov.filterDenylist.includes(k))
      : FILTER_KEYS;
    const presetKey = pickUnused(presetPool.length ? presetPool : PRESET_KEYS, rng, used.presets, prev.stylePreset);
    // Subtitle SIZE: fully RANDOM per variant (no manual px control) — the whole point
    // of auto mode is that this varies. 62–94 px on the 1080-wide canvas. A learned
    // "subtitleSizeMax" override can still cap it; ov.subtitleSizeFixed pins it if a
    // training rule ever needs a constant.
    const [szLo, szHi] = range("subtitleSizeMin", "subtitleSizeMax", 62, 94);
    let subtitleSize = q(clamp(szLo + rng() * (szHi - szLo), 30, 120), 1);
    if (typeof ov.subtitleSizeFixed === "number") subtitleSize = clamp(ov.subtitleSizeFixed, 40, 120);
    settings.subtitleStyle = { ...SUBTITLE_PRESETS[presetKey], fontSize: subtitleSize };
    // ANIMATION varies independently of the preset's built-in look so the entry
    // animation changes EVERY render (not just the preset colour/font).
    settings.subtitleStyle.animationPreset = pickAvoid(SUBTITLE_ANIMS, rng, prev.subtitleAnim);
    settings.subtitleSize = subtitleSize;
    settings.videoFilterKey = pickUnused(filterPool.length ? filterPool : FILTER_KEYS, rng, used.filters, prev.filter);
    // POSITION is computed in the SAFE-ZONE LAYOUT block below (face-aware, both
    // clips). When a square b-roll is present the renderer pulls the caption just
    // above the square (subtitleAboveSquare), and while the logo pops up it's lifted
    // to the top — both handled in server.mjs.
    comboParts.push(`sous-titres ${presetKey} ${subtitleSize}px ${settings.subtitleStyle.animationPreset}`, `filtre ${settings.videoFilterKey}`);
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
  // EXTRA clips frame per PERSON with a CONSISTENT zoom: the first extra of each person
  // computes the framing, every later extra of the SAME person REUSES it (clip 4 == clip 5
  // zoom for the same speaker — no jarring re-randomisation). rx/rz are still drawn for
  // every clip so the rng stays in lock-step.
  // Frame each clip per PERSON with a CONSISTENT crop+zoom: the FIRST clip of a given
  // speaker computes the framing, every later clip of the SAME speaker REUSES it — so
  // e.g. Vasko's clip 1 (hook) and clip 3 (extra) are centred and zoomed IDENTICALLY,
  // and clip 4 == clip 5 for the same person. A plain 2-person pair has two DIFFERENT
  // people so it shares nothing → identical to the old per-clip behaviour. rx/rz are
  // still drawn for EVERY clip so planning ↔ rendering stay in rng lock-step.
  // MIRROR: the solo X is stored in the NATURAL (un-mirrored) orientation; the renderer
  // negates it when mirrorEnabled (single source of truth) so the speaker stays centred
  // whether the clip came from auto OR manual mode. (The split/dual-speaker path keeps
  // its own mirror-aware cropX — see faceToBandCrop above.)
  const frameCache = {};
  for (const clip of clips) {
    const rx = rng();
    const rz = rng();
    if (clip?.dualSpeakerEnabled) continue; // split bands have their own zooms
    const isExtra = clip.stage !== "intro" && clip.stage !== "reply";
    // intro/reply: person from the pair. extra: from the clip's own source name.
    const personName = isExtra
      ? (clip.sourceTitle || clip.title)
      : (clip?.stage === "reply" ? base.sourceNames?.person2 : base.sourceNames?.person1);
    const person = detectPerson(personName);
    // Cache key groups a speaker's clips across ALL stages. Known persons key by name;
    // otherwise the clip's own person tag, else the STAGE (intro/reply kept distinct so
    // a 2-person pair never shares framing between its two people).
    const frameKey = person || clip.person
      || (clip.stage === "reply" ? "__reply__" : clip.stage === "intro" ? "__intro__" : "__other__");
    if (frameCache[frameKey]) {
      clip.videoTransform = { ...frameCache[frameKey] }; // reuse → consistent centre+zoom
      continue;
    }
    const fb = faceBoxes[clip.sourceVideoId];
    const zoomMax = person ? PERSON_FRAMES[person].zoomMax : 120;
    if (fb?.srcW && fb?.srcH) {
      const scale = Math.round(100 + rz * (zoomMax - 100));
      const s = scale / 100;
      const As = fb.srcW / fb.srcH;
      const Sx = (As >= 1080 / 1920 ? 1920 * As : 1080) * s; // cover-fit scaled width
      const x = Math.round((fb.cx - 0.5) * Sx + (rx - 0.5) * 40); // centre on face + ±20 px jitter
      clip.videoTransform = { x, y: 0, scale };
    } else if (person) {
      const pf = personFrame(person, rx, rz);
      clip.videoTransform = { x: pf.x, y: pf.y, scale: pf.zoom };
    } else {
      clip.videoTransform = { ...(clip.videoTransform || { x: 0, y: 0 }), scale: q(100 + rz * 20, 2) };
    }
    frameCache[frameKey] = clip.videoTransform; // cache the FIRST clip of this person
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
    // Hook COLOUR varies again (white / black / yellow / red …) instead of being
    // forced to white — avoid repeating the previous variant's bubble colour.
    const bubble = pickAvoid(HOOK_BUBBLES, rng, HOOK_BUBBLES.find((b) => b.bubbleColor === prev.hookBubble));
    settings.hookStyle = { ...(settings.hookStyle || {}), bubbleColor: bubble.bubbleColor, textColor: bubble.textColor };
    comboParts.push(`hook ${bubble.bubbleColor}`);
  }

  // ---- SAFE-ZONE LAYOUT (hook + subtitle positions) ----
  // Runs AFTER split/framing/hook-text so every input is known: the face intervals
  // for THIS variant's crop/zoom/split, the real hook text (height estimate) and the
  // chosen subtitle size. Draw counts are FIXED (hook 1, subtitles 2 per clip)
  // whatever faceBoxes contains, so planning ↔ rendering stay in lock-step even if
  // face detection results change between the two.
  {
    const subStyle = settings.subtitleStyle || {};
    const blockH = estimateSubtitleBlockHeight(settings.subtitleSize ?? subStyle.fontSize, subStyle.shadowDistance);
    if (intro) {
      const introFaces = [];
      if (intro.dualSpeakerEnabled) {
        const ratio = intro.dualSpeakerSplitRatio ?? 0.5;
        const topBand = Math.round(1920 * ratio);
        const addedOnTop = intro.dualSpeakerPosition === "top";
        const main = faceIntervalBand(faceBoxes[intro.sourceVideoId], {
          bandH: addedOnTop ? 1920 - topBand : topBand,
          y0Band: addedOnTop ? topBand : 0,
          zoom: (Number(intro.dualSpeakerMainZoom) || 100) / 100,
          cropY: intro.dualSpeakerMainCropY,
        });
        const added = faceIntervalBand(faceBoxes[intro.dualSpeakerSource], {
          bandH: addedOnTop ? topBand : 1920 - topBand,
          y0Band: addedOnTop ? 0 : topBand,
          zoom: (Number(intro.dualSpeakerAddedZoom) || 100) / 100,
          cropY: intro.dualSpeakerAddedCropY,
        });
        if (main) introFaces.push(main);
        if (added) introFaces.push(added);
      } else {
        const f = faceIntervalSolo(faceBoxes[intro.sourceVideoId], intro.videoTransform);
        if (f) introFaces.push(f);
      }
      intro.hookSize = intro.hookSize || { width: 980, height: 120 };
      const hookText = intro.hookText || settings.hookText || "";
      const hp = computeHookPosition({
        dualSpeakerEnabled: !!intro.dualSpeakerEnabled,
        splitRatio: intro.dualSpeakerSplitRatio ?? introRatio,
        hookHeight: intro.hookSize.height,
        hookHeightEst: estimateHookHeight(hookText, intro.hookSize.height),
        rng, margin: cfg.hookMargin, maxHeight: cfg.hookMaxHeight, faces: introFaces,
      });
      intro.hookPosition = { x: hp.x, y: hp.y };
      intro.hookSize = { ...intro.hookSize, height: hp.height };
      intro.subtitlePosition = computeSubtitlePosition({
        hookY: hp.y, hookHeight: hp.geomHeight, rng, faces: introFaces, blockH,
      });
    }
    if (reply && reply !== intro) {
      const replyFaces = [];
      const f = faceIntervalSolo(faceBoxes[reply.sourceVideoId], reply.videoTransform);
      if (f) replyFaces.push(f);
      reply.subtitlePosition = computeSubtitlePosition({ hookY: null, rng, faces: replyFaces, blockH });
    }
    // EXTRA clips (3+) — the alternating back-and-forth. They act "as one": ONE shared
    // subtitle position (it never moves when the speaker changes), computed once and
    // reused. No hook, no per-clip jitter. (1 rng draw, deterministic.)
    const extraClips = clips.filter((c) => c !== intro && c !== reply && c.stage !== "intro" && c.stage !== "reply");
    if (extraClips.length) {
      const extraSubY = q(1180 + rng() * 120, 2); // ~1180–1300, identical for every extra
      for (const c of extraClips) c.subtitlePosition = { x: 540, y: extraSubY };
    }
  }

  // ---- B-ROLL (reply only) ----
  if (varied.broll && reply) {
    const pool = (banks.brolls && banks.brolls.length ? banks.brolls : banks.images) || [];
    if (pool.length) {
      reply.brollId = pick(pool, rng).id;
      reply.imageId = null;
    }
    settings.brollStyle = pick(BROLL_STYLES, rng);
    // B-roll stays at its FIXED on-screen spot (no position jitter). Only the SQUARE
    // b-roll may shrink (0.70–1.00 of the reference size) — the 9:16 fullscreen b-roll
    // always fills the frame and is never resized.
    settings.brollSquareScale = q(0.7 + rng() * 0.3, 0.05); // 0.70–1.00
    reply.imageTransform = { scale: 100, x: 0, y: 0 };
    comboParts.push(`b-roll ${settings.brollStyle} sq${settings.brollSquareScale}`);
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
  const [lgLo, lgHi] = range("logoSizeMin", "logoSizeMax", 850, 920);
  const logoSize = q(clamp(lgLo + rng() * (lgHi - lgLo), 200, 1080), 2); // varied per variant
  const logoCenter = rng() < 0.5;
  for (const clip of clips) { clip.logoSize = logoSize; clip.logoCenter = logoCenter; }
  comboParts.push(`logo ${logoSize}px${logoCenter ? " centré" : ""}`);

  return {
    settings, clips,
    signature: signatureOf(settings, clips),
    combo: comboParts.join(" · ") || "variante",
    picks: { stylePreset: settings.subtitleStyle?.stylePreset, filter: settings.videoFilterKey, musicId: settings.musicId, subtitleAnim: settings.subtitleStyle?.animationPreset, hookBubble: settings.hookStyle?.bubbleColor },
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
