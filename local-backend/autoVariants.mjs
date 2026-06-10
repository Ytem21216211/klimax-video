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
};
export const PRESET_KEYS = Object.keys(SUBTITLE_PRESETS);

// Hook bubble look (same fonts/colors manual mode allows).
const HOOK_FONTS = ["Arial Black", "Anton", "Impact", "Montserrat", "Arial Bold"];
const HOOK_BUBBLES = [
  { bubbleColor: "#ffffff", textColor: "#000000" },
  { bubbleColor: "#000000", textColor: "#ffffff" },
  { bubbleColor: "#ffe14a", textColor: "#000000" },
];
const ZOOM_INTENSITIES = [
  { autoZoomBoostPercent: 12, autoZoomDurationSeconds: 1.5 }, // léger
  { autoZoomBoostPercent: 22, autoZoomDurationSeconds: 2.0 }, // moyen
  { autoZoomBoostPercent: 40, autoZoomDurationSeconds: 2.5 }, // fort
];
const CLIP_TRANSITIONS = ["random", "opacity", "camera_flash"];
const BROLL_STYLES = ["square", "fullscreen", "alternate"];

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
// quantize continuous values so the uniqueness signature is meaningful (visual, not float noise)
const q = (v, step) => Math.round(v / step) * step;
const clone = (o) => JSON.parse(JSON.stringify(o));

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
    })),
  };
  return stable(sig);
}

// ---------------------------------------------------------------------------
// Build ONE variant. Returns { settings, clips, signature, combo }.
// ---------------------------------------------------------------------------
export function buildVariant({ base, videoId, variantIndex, varied = {}, lockSplitScreen = false, banks = {}, prev = {}, attempt = 0, config = {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = makeRng(`${videoId}:${variantIndex}:${attempt}`);
  const settings = clone(base.settings || {});
  const clips = clone(base.clips || []);
  const intro = clips.find((c) => c.stage === "intro") || clips[0];
  const reply = clips.find((c) => c.stage === "reply") || clips[1] || clips[0];
  const comboParts = [];

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
        intro.dualSpeakerPosition = pick(["top", "bottom"], rng);
        // RÉPARTITION: wide 30–70 % range so the split itself is a strong variation
        // lever (the hook stays centred on the line whatever the ratio).
        intro.dualSpeakerSplitRatio = q(0.30 + rng() * 0.40, 0.02);
        intro.dualSpeakerMainZoom = q(100 + rng() * 22, 2);   // light 100–122 %
        intro.dualSpeakerAddedZoom = q(100 + rng() * 22, 2);
        intro.dualSpeakerMainCropX = q((rng() - 0.5) * 200, 10);  // ±100, keep faces framed
        intro.dualSpeakerAddedCropX = q((rng() - 0.5) * 200, 10);
        intro.dualSpeakerMainCropY = 0;
        intro.dualSpeakerAddedCropY = 0;
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

  // ---- SUBTITLES (+ filter) ----
  if (varied.subtitles) {
    const presetKey = pickAvoid(PRESET_KEYS, rng, prev.stylePreset);
    settings.subtitleStyle = { ...SUBTITLE_PRESETS[presetKey] };
    settings.subtitleSize = SUBTITLE_PRESETS[presetKey].fontSize;
    settings.videoFilterKey = pickAvoid(FILTER_KEYS, rng, prev.filter);
    comboParts.push(`sous-titres ${presetKey}`, `filtre ${settings.videoFilterKey}`);
  }

  // ---- HOOK (text + look) ----
  if (varied.hook) {
    const hooks = banks.hooks || [];
    if (hooks.length) {
      const text = hooks[variantIndex % hooks.length];
      settings.hookText = text;
      if (intro) intro.hookText = text;
    }
    const bubble = pick(HOOK_BUBBLES, rng);
    settings.hookStyle = {
      ...(settings.hookStyle || {}),
      fontFamily: pick(HOOK_FONTS, rng),
      bubbleColor: bubble.bubbleColor,
      textColor: bubble.textColor,
      fontSize: q(48 + rng() * 24, 2), // 48–72
    };
    comboParts.push("hook varié");
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
    settings.musicVolumeDb = q(-20 + rng() * 6, 1);  // -20..-14
    settings.videoVolumeDb = q(rng() * 4, 1);        // 0..+4
    comboParts.push("musique variée");
  }

  // ---- TRANSITIONS — always ON in auto (the cut variety is a core anti-shadowban
  // lever). "random" alternates fade / camera-flash per cut at render time; when the
  // SFX dimension is varied we also pin a specific type on some variants.
  settings.clipTransitionsEnabled = true;
  settings.clipTransitionType = varied.sfx ? pick(CLIP_TRANSITIONS, rng) : "random";
  if (varied.sfx) comboParts.push(`transition ${settings.clipTransitionType}`);

  // ---- MIRROR — exactly one variant out of two is horizontally flipped (whole
  // video, source footage only, so the podcast layout stays coherent and the text
  // overlays stay readable). Cheap, invisible-to-the-eye anti-shadowban lever.
  settings.mirrorEnabled = variantIndex % 2 === 1;
  if (settings.mirrorEnabled) comboParts.push("miroir");

  // ---- ZOOMS ----
  if (varied.zooms) {
    settings.autoZoomMode = pick(["cut", "smooth"], rng);
    const it = pick(ZOOM_INTENSITIES, rng);
    settings.autoZoomBoostPercent = it.autoZoomBoostPercent;
    settings.autoZoomDurationSeconds = it.autoZoomDurationSeconds;
    settings.introZoomOutEnabled = rng() < 0.4;
    settings.replyZoomOutEnabled = rng() < 0.5;
    settings.zoomOutStartPercent = q(140 + rng() * 60, 5);   // 140–200
    settings.zoomOutDurationSeconds = q(0.8 + rng() * 0.8, 0.1); // 0.8–1.6
    comboParts.push(`zoom ${settings.autoZoomMode}`);
  }

  return {
    settings, clips,
    signature: signatureOf(settings, clips),
    combo: comboParts.join(" · ") || "variante",
    picks: { stylePreset: settings.subtitleStyle?.stylePreset, filter: settings.videoFilterKey, musicId: settings.musicId },
  };
}

// ---------------------------------------------------------------------------
// Plan a batch for ONE video: returns up to `requested` UNIQUE variants, capping
// at the achievable count (decision e) and spreading choices (no repeats in a row).
// ---------------------------------------------------------------------------
export function planVideoVariants({ base, videoId, requested, varied, lockSplitScreen, banks, config }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const seen = new Set();
  const out = [];
  let prev = {};
  for (let i = 0; i < requested; i++) {
    let chosen = null;
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      const v = buildVariant({ base, videoId, variantIndex: i, varied, lockSplitScreen, banks, prev, attempt, config: cfg });
      if (!seen.has(v.signature)) { chosen = v; break; }
    }
    if (!chosen) break; // exhausted: no new unique combo achievable
    seen.add(chosen.signature);
    prev = chosen.picks;
    out.push({ index: i, settings: chosen.settings, clips: chosen.clips, combo: chosen.combo });
  }
  return { variants: out, achievable: out.length, requested };
}
