import cors from "cors";
import express from "express";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import multer from "multer";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeFrenchElisionWords } from "./captionWords.mjs";
import { buildLogoMoments, normalizeLogoWords } from "./logoMoments.mjs";
import { claudeChatHandler, runClaude } from "./claudeBridge.mjs";
import {
  buildLearnedRulesBlock, getPlannerOverrides, readLearnedRules,
  ingestFeedback, deleteRule, clearAllRules,
} from "./learnedRules.mjs";
import { faceToBandCrop } from "./autoVariants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "local-data", "klimax");
const dbPath = path.join(dataRoot, "db.json");
const uploadRoot = path.join(dataRoot, "uploads");
const renderRoot = path.join(dataRoot, "renders");
const textRoot = path.join(dataRoot, "render-text");
const systemRoot = path.join(dataRoot, "system");
const tempRoot = path.join(dataRoot, "tmp");
const fontRoot = path.join(dataRoot, "fonts");
const publicSeedRoot = path.join(projectRoot, "public", "klimax-videos");
const pythonBin = path.join(projectRoot, "local-backend", ".venv", "bin", "python");
const transcribeScriptPath = path.join(projectRoot, "local-backend", "transcribe.py");
const hookBubbleScriptPath = path.join(projectRoot, "local-backend", "render_hook_bubble.py");
const detectFacesScriptPath = path.join(projectRoot, "local-backend", "detect_faces.py");
const faceModelPath = path.join(projectRoot, "local-backend", "models", "ultraface-rfb-320.onnx");
const cropAlphaScriptPath = path.join(projectRoot, "local-backend", "crop_alpha_image.py");
const logoAnimationSourceCandidate = "/Users/juliengoussale/Downloads/pop up klimax app store.mov";
const logoAnimationPath = path.join(systemRoot, "klimax-pop-up.mov");
const logoPreviewRawPath = path.join(systemRoot, "klimax-logo-preview.raw.png");
const logoPreviewPath = path.join(systemRoot, "klimax-logo-preview.png");
const logoPreviewTimeSeconds = 2;
// Camera-flash transition clip (1920x1080, ~1.25s). Rotated 90° + scaled to fill
// the 1080x1920 frame and "lighten"-blended over the cut. Its brightest frame is
// at ~0.92s (measured), which is what we align to the clip cut.
const cameraFlashTransitionPath = path.join(projectRoot, "local-backend", "transition-assets", "camera-flash-2.mp4");
const CAMERA_FLASH_PEAK_SEC = 0.92;
// Shutter "click" played between b-rolls in shutter mode.
const shutterSoundPath = path.join(projectRoot, "local-backend", "transition-assets", "shutter-short.mp3");
// Rounded-corner mask + drop-shadow for "square" b-rolls (sized to BROLL_SQUARE_SIZE).
const brollSquareMaskPath = path.join(projectRoot, "local-backend", "transition-assets", "broll-square-mask.png");
const brollSquareShadowPath = path.join(projectRoot, "local-backend", "transition-assets", "broll-square-shadow.png");
const BROLL_SQUARE_PAD = 48;
const whisperModelName = process.env.KLIMAX_WHISPER_MODEL || "small";
const port = Number(process.env.KLIMAX_BACKEND_PORT || 8787);
const transcriptionPipelineVersion = "caption-elision-logo-brand-v5";
const maxStoredExports = 20;
const maxResponseExports = 8;
const maxStoredExportLogChars = 1600;

const app = express();

const defaultSubtitleStyle = {
  stylePreset: "impact",
  fontFamily: "Arial Bold",
  fontSize: 53,
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
};

const defaultHookStyle = {
  bubbleColor: "#ffffff",
  textColor: "#000000",
  fontFamily: "Arial Black",
  fontSize: 53,
};

const defaultClipLayout = (stage) => ({
  videoTransform: {
    scale: 100,
    x: 0,
    y: 0,
  },
  hookPosition: {
    x: 540,
    y: 1325,
  },
  hookSize: {
    width: 980,
    height: 120,
  },
  subtitlePosition: {
    x: 540,
    y: stage === "intro" ? 1500 : 1265,
  },
  logoPosition: {
    x: 540,
    y: 1385,
  },
  logoSize: 520,
});

const defaultProjectSettings = () => ({
  hookText: "Tu connais cette sensation ?",
  subtitleSize: 53,
  musicEnabled: true,
  musicId: null,
  musicVolumeDb: -17,
  videoVolumeDb: 2,
  brollEnabled: true,
  autoSfxEnabled: true,
  autoZoomEnabled: true,
  autoZoomMode: "cut",
  autoZoomBoostPercent: 20,
  autoZoomDurationSeconds: 2,
  introZoomOutEnabled: false,
  replyZoomOutEnabled: false,
  zoomOutStartPercent: 180,
  zoomOutDurationSeconds: 1.2,
  klimaxLogoEnabled: true,
  logoTriggerWord: "klimax",
  videoFilterKey: "none",
  subtitleStyle: { ...defaultSubtitleStyle },
  hookStyle: { ...defaultHookStyle },
});

// CORS: this server binds to localhost, but `origin:true` reflected ANY website's
// origin (with credentials) — so a malicious page the user visits could read every
// API response (assets, projects, settings) via the browser. Restrict to localhost
// front-ends; tools without an Origin header (curl, server-to-server) still pass.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)),
  credentials: true,
}));
app.use(express.json({ limit: "25mb" }));
// /files serves rendered + uploaded MEDIA only. dataRoot's TOP LEVEL also holds the
// state/config files (db.json, settings.json with API keys, job/preset stores) — those
// must NEVER be downloadable. Only allow paths that resolve INSIDE a media subdir
// (this also defeats `..` traversal, which express.static alone would happily follow
// back up to dataRoot/db.json).
const FILES_ALLOWED_DIRS = [uploadRoot, renderRoot, textRoot, systemRoot, tempRoot];
app.use("/files", (req, res, next) => {
  let rel;
  try { rel = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  const abs = path.resolve(dataRoot, `.${rel.startsWith("/") ? rel : `/${rel}`}`);
  if (!FILES_ALLOWED_DIRS.some((dir) => abs === dir || abs.startsWith(dir + path.sep))) {
    return res.status(403).end();
  }
  next();
});
app.use("/files", express.static(dataRoot));

// OpenAI-compatible AI brain backed by the local `claude` CLI.
app.post("/v1/chat/completions", claudeChatHandler);

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const normalizeFileName = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const publicUrlFor = (absolutePath) => {
  const relative = path.relative(dataRoot, absolutePath).split(path.sep).join("/");
  return `http://127.0.0.1:${port}/files/${relative}`;
};

const storage = multer.diskStorage({
  destination: async (_req, file, cb) => {
    const category = file.fieldname.includes("person") ? "videos" : "assets";
    const dir = path.join(uploadRoot, category);
    await ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${normalizeFileName(file.originalname)}`);
  },
});

const upload = multer({ storage });

const stripCaptionPunctuation = (text) =>
  String(text || "")
    .replace(/[.,!?;:]/g, "")
    .replace(/[()[\]{}"]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeHookText = (text) =>
  String(text || "")
    .replace(/[.,!?;:]/g, "")
    .replace(/[()[\]{}"]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

const cleanCaptionText = (text, wordsPerLine = 2) => {
  const words = stripCaptionPunctuation(text).split(" ").filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(" "));
  }
  return lines.join("\n");
};

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const truncateText = (value, maxLength) => {
  const text = String(value || "");
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[log tronque pour garder l'editeur rapide]`;
};

const VIDEO_FILTERS = new Map([
  ["none", ""],
  ["clean_boost", "eq=contrast=1.06:saturation=1.07:brightness=0.006"],
  ["warm_viral", "colorbalance=rs=0.055:gs=0.018:bs=-0.045,eq=contrast=1.05:saturation=1.10:brightness=0.008"],
  ["cold_crisp", "colorbalance=rs=-0.045:gs=0.01:bs=0.07,eq=contrast=1.07:saturation=1.04"],
  ["contrast_punch", "eq=contrast=1.16:saturation=1.13:brightness=-0.004"],
  ["soft_glow", "eq=contrast=1.03:saturation=1.06:brightness=0.014,unsharp=5:5:0.35:3:3:0.15"],
  ["grain_light", "noise=alls=7:allf=t+u,eq=contrast=1.05:saturation=1.04"],
  ["mono_noir", "hue=s=0,eq=contrast=1.15:brightness=0.01"],
  ["green_tint", "colorbalance=rs=-0.035:gs=0.055:bs=-0.035,eq=contrast=1.05:saturation=1.06"],
  ["pink_pop", "colorbalance=rs=0.07:gs=-0.025:bs=0.045,eq=contrast=1.06:saturation=1.16"],
  ["vhs_lite", "noise=alls=10:allf=t+u,eq=contrast=1.08:saturation=0.95"],
]);

const normalizeVideoFilterKey = (key) => (VIDEO_FILTERS.has(String(key || "")) ? String(key) : "none");

const videoFilterChain = (key) => {
  const filter = VIDEO_FILTERS.get(normalizeVideoFilterKey(key));
  return filter ? `,${filter}` : "";
};

const escapeFfmpegExpression = (expression) => String(expression).replace(/,/g, "\\,");

const mergeProjectSettings = (settings = {}) => {
  const defaults = defaultProjectSettings();
  const subtitleStyle = {
    ...defaults.subtitleStyle,
    ...(settings.subtitleStyle || {}),
  };
  const hookStyle = {
    ...defaults.hookStyle,
    ...(settings.hookStyle || {}),
  };

  subtitleStyle.fontSize = safeNumber(subtitleStyle.fontSize || settings.subtitleSize, defaults.subtitleSize);
  subtitleStyle.wordsPerLine = clamp(Math.round(safeNumber(subtitleStyle.wordsPerLine, 2)), 2, 2);
  subtitleStyle.strokeWidth = clamp(safeNumber(subtitleStyle.strokeWidth, 4), 0, 14);
  subtitleStyle.shadowDistance = clamp(safeNumber(subtitleStyle.shadowDistance, 4), 0, 22);
  subtitleStyle.shadowBlur = clamp(safeNumber(subtitleStyle.shadowBlur, 10), 0, 36);
  subtitleStyle.shadowOpacity = clamp(safeNumber(subtitleStyle.shadowOpacity, 0.85), 0, 1);
  subtitleStyle.fontWeight = safeNumber(subtitleStyle.fontWeight, 900);
  subtitleStyle.fontScaleX = clamp(safeNumber(subtitleStyle.fontScaleX, defaults.subtitleStyle.fontScaleX), 90, 118);
  subtitleStyle.keywordHighlightEnabled = subtitleStyle.keywordHighlightEnabled !== false;
  subtitleStyle.keywordColor = /^#[0-9a-fA-F]{6}$/.test(String(subtitleStyle.keywordColor || ""))
    ? subtitleStyle.keywordColor
    : defaults.subtitleStyle.keywordColor;
  subtitleStyle.keywordSecondaryColor = /^#[0-9a-fA-F]{6}$/.test(String(subtitleStyle.keywordSecondaryColor || ""))
    ? subtitleStyle.keywordSecondaryColor
    : defaults.subtitleStyle.keywordSecondaryColor;
  subtitleStyle.keywordTerms = Array.isArray(subtitleStyle.keywordTerms)
    ? subtitleStyle.keywordTerms.join(", ")
    : String(subtitleStyle.keywordTerms || "");
  if (!["none", "pop", "bounce", "rise", "fade", "zoom", "slide", "shake", "typewriter", "flicker", "elastic"].includes(subtitleStyle.animationPreset)) {
    subtitleStyle.animationPreset = defaults.subtitleStyle.animationPreset;
  }
  hookStyle.fontSize = safeNumber(hookStyle.fontSize, 53);
  hookStyle.fontFamily = String(hookStyle.fontFamily || defaults.hookStyle.fontFamily);
  const musicVolumeDb = clamp(safeNumber(settings.musicVolumeDb, defaults.musicVolumeDb), -40, 0);
  const videoVolumeDb = clamp(safeNumber(settings.videoVolumeDb, defaults.videoVolumeDb), -12, 12);
  const videoFilterKey = normalizeVideoFilterKey(settings.videoFilterKey || defaults.videoFilterKey);
  const autoZoomMode = ["cut", "smooth"].includes(String(settings.autoZoomMode || ""))
    ? String(settings.autoZoomMode)
    : defaults.autoZoomMode;

  return {
    ...defaults,
    ...settings,
    subtitleSize: subtitleStyle.fontSize,
    musicVolumeDb,
    videoVolumeDb,
    videoFilterKey,
    autoZoomEnabled: settings.autoZoomEnabled !== false,
    autoZoomMode,
    autoZoomBoostPercent: clamp(safeNumber(settings.autoZoomBoostPercent, defaults.autoZoomBoostPercent), 5, 60),
    autoZoomDurationSeconds: clamp(safeNumber(settings.autoZoomDurationSeconds, defaults.autoZoomDurationSeconds), 0.6, 4),
    introZoomOutEnabled: settings.introZoomOutEnabled === true,
    replyZoomOutEnabled: settings.replyZoomOutEnabled === true,
    clipTransitionsEnabled: settings.clipTransitionsEnabled === true,
    clipTransitionType: ["opacity", "camera_flash", "random"].includes(settings.clipTransitionType)
      ? settings.clipTransitionType
      : "random",
    brollShutterMode: settings.brollShutterMode === true,
    brollAnimIn: ["fade", "none"].includes(settings.brollAnimIn) ? settings.brollAnimIn : "fade",
    brollAnimOut: ["fade", "none"].includes(settings.brollAnimOut) ? settings.brollAnimOut : "fade",
    brollStyle: ["square", "fullscreen", "alternate"].includes(settings.brollStyle) ? settings.brollStyle : "alternate",
    brollZoom: ["none", "in", "out"].includes(settings.brollZoom) ? settings.brollZoom : "in",
    mirrorEnabled: settings.mirrorEnabled === true,
    zoomOutStartPercent: clamp(safeNumber(settings.zoomOutStartPercent, defaults.zoomOutStartPercent), 110, 260),
    zoomOutDurationSeconds: clamp(safeNumber(settings.zoomOutDurationSeconds, defaults.zoomOutDurationSeconds), 0.4, 3),
    subtitleStyle,
    hookStyle,
  };
};

const normalizeClipLayout = (clip) => ({
  videoTransform: {
    scale: safeNumber(clip?.videoTransform?.scale, 100),
    x: safeNumber(clip?.videoTransform?.x, 0),
    y: safeNumber(clip?.videoTransform?.y, 0),
  },
  hookPosition: {
    x: safeNumber(clip?.hookPosition?.x, 540),
    y: safeNumber(clip?.hookPosition?.y, 1325),
  },
  hookSize: {
    width: clamp(safeNumber(clip?.hookSize?.width, 980), 240, 1080),
    height: clamp(safeNumber(clip?.hookSize?.height, 120), 80, 520),
  },
  subtitlePosition: {
    x: safeNumber(clip?.subtitlePosition?.x, 540),
    y: safeNumber(clip?.subtitlePosition?.y, clip?.stage === "intro" ? 1500 : 1265),
  },
  logoPosition: {
    x: safeNumber(clip?.logoPosition?.x, 540),
    y: safeNumber(clip?.logoPosition?.y, 1385),
  },
  logoSize: clamp(safeNumber(clip?.logoSize, 520), 80, 1080),
});

const defaultTranscription = () => ({
  status: "idle",
  generatedAt: null,
  sourceFingerprint: null,
  clips: [],
});

const normalizeExport = (entry, { includeLog = true } = {}) => {
  if (!entry || typeof entry !== "object") return entry;
  const next = { ...entry };
  if (includeLog && typeof next.log === "string") {
    next.log = truncateText(next.log, maxStoredExportLogChars);
  }
  if (!includeLog) {
    delete next.log;
  }
  return next;
};

const normalizeProject = (project, { response = false } = {}) => {
  const settings = mergeProjectSettings(project?.settings || {});
  const exportLimit = response ? maxResponseExports : maxStoredExports;
  const exports = (Array.isArray(project?.exports)
    ? [...project.exports].sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))
    : project?.export
      ? [project.export]
      : [])
    .slice(0, exportLimit)
    .map((entry) => normalizeExport(entry, { includeLog: !response }));

  return {
    ...project,
    created_at: project?.created_at || new Date().toISOString(),
    updated_at: project?.updated_at || project?.created_at || new Date().toISOString(),
    settings,
    clips: Array.isArray(project?.clips) ? project.clips : [],
    transcription: {
      ...defaultTranscription(),
      ...(project?.transcription || {}),
      clips: Array.isArray(project?.transcription?.clips) ? project.transcription.clips : [],
    },
    exports,
    export: exports[0] || project?.export || null,
  };
};

// Legacy second-speaker clips (Shelly / Julien) were stored as standalone
// "video" assets (a video with no videoPart). They are NOT podcast sources —
// they're filler clips incrusted as the dual-speaker band — so promote them to
// their own "speaker" category. Real podcast sources always arrive as a pair and
// keep their videoPart, so they stay "video".
const normalizeAsset = (asset) => {
  if (asset && asset.category === "video" && !asset.videoPart) {
    return { ...asset, category: "speaker" };
  }
  return asset;
};

const normalizeDb = (raw) => ({
  assets: Array.isArray(raw?.assets) ? raw.assets.map(normalizeAsset) : [],
  projects: Array.isArray(raw?.projects) ? raw.projects.map(normalizeProject) : [],
});

const readDb = async () => {
  await ensureDir(dataRoot);
  try {
    return normalizeDb(JSON.parse(await fs.readFile(dbPath, "utf8")));
  } catch (error) {
    // NEVER rewrite the db file here: a transient read/parse failure (e.g. reading
    // mid-write) must not wipe every asset/project. Only seed a brand-new install.
    if (!fsSync.existsSync(dbPath)) {
      const fresh = normalizeDb({ assets: [], projects: [] });
      await writeDb(fresh);
      return fresh;
    }
    console.error("[db] read failed (keeping file untouched):", error.message);
    throw new Error("Base locale momentanément illisible, réessaie.");
  }
};

// Atomic + serialized writes: temp file + rename so a concurrent reader never sees
// torn JSON, and a promise chain so two writers can't interleave.
let dbWriteChain = Promise.resolve();
// Heavy transcription (clips/cues/words/logoMoments) lives in its OWN per-project file
// so db.json stays small and isn't fully re-serialised on every unrelated mutation
// (~23% of db.json was transcription). db.json keeps only a light stub for the
// cache-hit check; the full object is loaded on demand and is also reconstructable
// from the per-asset transcripts (so a missing file is never data loss).
const transcriptsDir = path.join(dataRoot, "transcripts");
const transcriptFile = (projectId) => path.join(transcriptsDir, `${String(projectId).replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
const transcriptStub = (t) => (t && typeof t === "object")
  ? { status: t.status || "idle", sourceFingerprint: t.sourceFingerprint || null, language: t.language, clipCount: Array.isArray(t.clips) ? t.clips.length : safeNumber(t.clipCount, 0) }
  : t;
const loadTranscript = async (projectId) => {
  try { return JSON.parse(await fs.readFile(transcriptFile(projectId), "utf8")); } catch { return null; }
};
const saveTranscript = async (projectId, t) => {
  if (!projectId || !t || !Array.isArray(t.clips) || !t.clips.length) return;
  if (/-auto-\d|-salvage-/.test(String(projectId))) return; // synthetic per-variant id → don't persist
  await ensureDir(transcriptsDir);
  const tmp = `${transcriptFile(projectId)}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(t));
  await fs.rename(tmp, transcriptFile(projectId));
};
// Ensure project.transcription carries its full clips (load the file; rebuild from
// per-asset transcripts if the file is missing). Used before rendering / in the editor.
const hydrateTranscript = async (db, project, sourceGroup) => {
  if (Array.isArray(project?.transcription?.clips) && project.transcription.clips.length) return project.transcription;
  const fromFile = await loadTranscript(project.id);
  if (fromFile?.clips?.length) { project.transcription = fromFile; return project.transcription; }
  if (sourceGroup) { try { await ensureTranscription(project, sourceGroup, db.assets); } catch { /* leave as-is */ } }
  return project.transcription;
};

const writeDb = (db) => {
  // Serialize a LEAN copy: per-project transcription reduced to its stub (the full
  // clips are persisted separately by saveTranscript). The in-memory db is untouched.
  const lean = {
    ...db,
    projects: Array.isArray(db.projects)
      ? db.projects.map((p) => (p && p.transcription ? { ...p, transcription: transcriptStub(p.transcription) } : p))
      : db.projects,
  };
  const payload = JSON.stringify(normalizeDb(lean), null, 2);
  dbWriteChain = dbWriteChain.then(async () => {
    await ensureDir(dataRoot);
    const tmp = `${dbPath}.tmp-${process.pid}`;
    await fs.writeFile(tmp, payload);
    await fs.rename(tmp, dbPath);
  });
  return dbWriteChain;
};

const compactDb = async () => {
  if (!fsSync.existsSync(dbPath)) return;
  const db = await readDb();
  await writeDb(db);
};

// One-time (idempotent) migration: move any transcription clips still INLINE in db.json
// into per-project transcript files, then compact db.json (writeDb strips them to stubs).
// Safe to run every startup — projects already migrated have no inline clips to move.
const migrateTranscriptsOnce = async () => {
  if (!fsSync.existsSync(dbPath)) return;
  const db = await readDb();
  let migrated = 0;
  for (const p of db.projects || []) {
    if (Array.isArray(p.transcription?.clips) && p.transcription.clips.length) {
      await saveTranscript(p.id, p.transcription);
      migrated += 1;
    }
  }
  await writeDb(db); // strips inline transcriptions to stubs
  if (migrated) console.log(`[klimax] transcripts: migrated ${migrated} project(s) to per-project files`);
};

const assetFromFile = ({ file, category, groupId, groupTitle, videoPart, note }) => ({
  id: id(category),
  category,
  title: file.originalname,
  note: note || "Asset local",
  fileName: file.originalname,
  fileSize: file.size,
  mimeType: file.mimetype,
  filePath: file.path,
  fileUrl: publicUrlFor(file.path),
  groupId,
  groupTitle,
  videoPart,
});

const getVideoGroups = (assets) => {
  const groups = new Map();
  for (const asset of assets.filter((item) => item.category === "video")) {
    // Multi-rush "extra" clips (3rd+) belong to a montage, not to a bank pair — they
    // share the montage group but must NOT appear as their own person/group card.
    if (asset.videoPart === "extra") continue;
    const groupId = asset.groupId || asset.id;
    const current = groups.get(groupId) || {
      id: groupId,
      title: asset.groupTitle || asset.title,
      note: asset.note,
      person1: null,
      person2: null,
    };
    current.title = asset.groupTitle || current.title;
    current.note = asset.note || current.note;
    if (asset.videoPart === "person2") current.person2 = asset;
    else current.person1 = asset;
    groups.set(groupId, current);
  }
  return Array.from(groups.values());
};

const resolveProject = (db, projectId) => {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const sourceGroup = getVideoGroups(db.assets).find((group) => group.id === project.sourceGroupId) || null;
  return { ...normalizeProject(project, { response: true }), sourceGroup };
};

// BOUNDED capture: ffmpeg can emit GIGABYTES of repeated warnings (e.g. "Invalid
// NAL unit size" on a glitchy b-roll). Accumulating that unbounded blows past V8's
// max string length and CRASHES the whole backend (RangeError: Invalid string
// length). So cap stdout (generous — ffprobe JSON stays small) and keep only the
// TAIL of stderr (the real error is at the end), discarding the flood.
const RUNPROC_MAX_OUT = 24 * 1024 * 1024; // 24 MB
const RUNPROC_MAX_ERR = 256 * 1024; // 256 KB tail
const runProcess = (command, args, { timeoutMs = 0 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    let outTruncated = false;
    let timedOut = false;
    // Wall-clock guard: a broken input (e.g. a 0-duration b-roll looped into a fixed
    // segment) can make ffmpeg HANG forever — never erroring, never exiting — which
    // would freeze a render slot and stall the whole batch. Kill it so the caller's
    // catch/salvage path runs instead of waiting indefinitely.
    const timer = timeoutMs > 0
      ? setTimeout(() => { timedOut = true; try { child.kill("SIGKILL"); } catch {} }, timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => {
      if (stdout.length < RUNPROC_MAX_OUT) stdout += chunk.toString();
      else outTruncated = true;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > RUNPROC_MAX_ERR) stderr = stderr.slice(stderr.length - RUNPROC_MAX_ERR);
    });
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) return reject(new Error(`process timed out after ${timeoutMs}ms: ${command}`));
      if (code === 0) resolve({ stdout, stderr, outTruncated });
      else reject(new Error((stderr || stdout || `${command} exited with code ${code}`).slice(-4000)));
    });
  });

const runJson = async (command, args) => {
  const { stdout, stderr } = await runProcess(command, args);
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(stderr || stdout || "Réponse JSON invalide.");
  }
};

const ffprobeJson = (filePath) =>
  runJson(ffprobe.path, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath]);

// Duration of a media file in seconds (0 if it can't be probed).
// Media durations and loudness measurements are pure functions of the file —
// cache them by path+mtime so N-variant auto batches don't re-probe/re-decode
// the same unchanged sources N times.
const mediaCacheKey = (filePath) => {
  try { return `${filePath}:${fsSync.statSync(filePath).mtimeMs}`; } catch { return filePath; }
};
const durationCache = new Map();
const probeMediaDurationSec = async (filePath) => {
  const key = mediaCacheKey(filePath);
  if (durationCache.has(key)) return durationCache.get(key);
  let duration = 0;
  try {
    const probe = await ffprobeJson(filePath);
    duration = safeNumber(probe.format?.duration, 0);
  } catch { /* keep 0 */ }
  durationCache.set(key, duration);
  return duration;
};

// Detect black bars baked INTO a b-roll source (letterboxed/pillarboxed clips) and
// return an ffmpeg "crop=W:H:X:Y," prefix that strips them, so the cover-fit below
// fills the frame with real content instead of showing the bars. "" when the source
// is already full-frame. Cached per file (mtime-aware) — runs at most once per b-roll.
const brollCropCache = new Map();
const probeBrollContentCrop = async (filePath) => {
  const key = mediaCacheKey(filePath);
  if (brollCropCache.has(key)) return brollCropCache.get(key);
  let cropFilter = "";
  try {
    const { stderr } = await runProcess(ffmpegPath, [
      "-hide_banner", "-nostats", "-ss", "0.4", "-t", "1.2", "-i", filePath,
      "-vf", "fps=8,cropdetect=limit=24:round=2:reset=0", "-f", "null", "-",
    ], { timeoutMs: 15000 });
    const m = [...String(stderr).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    const last = m[m.length - 1];
    if (last) {
      const w = +last[1], h = +last[2], x = +last[3], y = +last[4];
      const probe = await ffprobeJson(filePath);
      const vs = (probe.streams || []).find((s) => s.codec_type === "video") || {};
      const W = +vs.width || 0, H = +vs.height || 0;
      // Crop only on a REAL bar (content noticeably smaller) and never below 40% of the
      // frame (guards against cropdetect over-cropping a dark scene).
      if (W > 0 && H > 0 && w > 0 && h > 0 && (w < W - 6 || h < H - 6) && w >= W * 0.4 && h >= H * 0.4) {
        cropFilter = `crop=${w}:${h}:${x}:${y},`;
      }
    }
  } catch { /* keep "" */ }
  brollCropCache.set(key, cropFilter);
  return cropFilter;
};

// B-roll robustness: some uploaded clips carry a cover-art / data stream or a
// variable resolution/format that crashes the overlay filter at render
// ("Unknown cover type" / "reinitializing filters"). Normalise each b-roll ONCE to a
// clean, stable file — single video stream (drops cover-art/data), yuv420p, constant
// 30fps + SAR=1, capped at 1080 wide — replacing it in place so the fileUrl stays the
// same. Idempotent via the asset's `normalized` flag.
// True if the container has at least one real video stream (not a cover-art
// "attached_pic"). A file failing this is empty/corrupt at the container level.
const hasRealVideo = async (filePath) => {
  try {
    const p = await ffprobeJson(filePath);
    return (p.streams || []).some((s) => s.codec_type === "video" && Number(s.width) > 0 && Number(s.height) > 0 && !(s.disposition && s.disposition.attached_pic));
  } catch { return false; }
};
// Non-destructive normalise: re-encode to a temp file (strip cover-art/data, force
// yuv420p/30fps/SAR, cap 1080 wide) and ONLY replace the original if the result is a
// real, readable video. A bad/partial re-encode must NEVER overwrite a good source
// (that is what previously corrupted b-rolls into 0-stream files).
const normalizeBrollFile = async (filePath) => {
  const tmp = `${filePath}.norm.${Date.now()}.${Math.random().toString(16).slice(2, 8)}.mp4`;
  try {
    await runProcess(ffmpegPath, [
      "-y", "-i", filePath,
      "-map", "0:v:0", "-an",
      "-vf", "fps=30,scale='min(1080,iw)':-2,setsar=1",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", tmp,
    ]);
    // Guard: the freshly-encoded file must itself contain a real video stream before
    // we swap it in. If not, keep the original untouched.
    if (!(await hasRealVideo(tmp))) throw new Error("re-encode produced no video stream");
    await fs.rename(tmp, filePath);
    durationCache.delete(mediaCacheKey(filePath)); // mtime changed
  } finally {
    try { if (fsSync.existsSync(tmp)) fsSync.unlinkSync(tmp); } catch { /* ignore */ }
  }
};
// Self-repair for a SPECIFIC, common corruption: an interrupted/buggy MP4 "faststart"
// remux leaves the `mvhd` (movie-header) box size — the first 4 bytes inside `moov` —
// overwritten with the `mdat` size. Every parser then skips past the whole header and
// finds NO video stream, even though the track + media data are intact. The fix is a
// 4-byte rewrite to the canonical size (mvhd v0 = 108, v1 = 120). Returns true if it
// rewrote the file into a now-readable video.
const tryRepairMoovHeader = async (filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    const sz = buf.length;
    let off = 0, moovOff = -1;
    while (off + 8 <= sz) {
      let s = buf.readUInt32BE(off);
      const t = buf.toString("latin1", off + 4, off + 8);
      if (s === 1) s = Number(buf.readBigUInt64BE(off + 8));
      if (s === 0) s = sz - off;
      if (t === "moov") { moovOff = off; break; }
      if (s < 8) break;
      off += s;
    }
    if (moovOff < 0 || buf.toString("latin1", moovOff + 12, moovOff + 16) !== "mvhd") return false;
    const correct = buf[moovOff + 16] === 1 ? 120 : 108;
    if (buf.readUInt32BE(moovOff + 8) === correct) return false; // not this corruption
    buf.writeUInt32BE(correct, moovOff + 8);
    const tmp = `${filePath}.fix.${Date.now()}`;
    await fs.writeFile(tmp, buf);
    if (await hasRealVideo(tmp)) {
      await fs.rename(tmp, filePath);
      durationCache.delete(mediaCacheKey(filePath));
      return true;
    }
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    return false;
  } catch { return false; }
};
// Quarantine gate — TOLERANT on purpose. A b-roll is unusable only when its container
// has NO real video stream (missing file / 0-stream corruption) AND can't be repaired.
// Per-packet H.264 warnings ("Invalid NAL unit size") are NOT fatal — perfectly good
// clips emit them and still render fine — so they must never quarantine a file. This
// also SELF-HEALS: a file wrongly flagged `broken` is un-quarantined once readable again.
const ensureAssetNormalized = async (asset) => {
  if (!asset || asset.category !== "broll" || !asset.filePath) return false;
  if (asset.normalized && !asset.broken) return false; // already known-good — skip re-probe
  let usable = fsSync.existsSync(asset.filePath) && (await hasRealVideo(asset.filePath));
  // Before quarantining, try the 4-byte moov repair — it resurrects the common
  // faststart-corruption that otherwise looks like a dead, 0-stream file.
  if (!usable && fsSync.existsSync(asset.filePath) && (await tryRepairMoovHeader(asset.filePath))) {
    usable = true;
    console.log("[broll] auto-repaired corrupt moov header:", asset.title);
  }
  if (!usable) {
    if (!asset.broken) { asset.broken = true; console.warn("[broll] no video stream -> quarantined:", asset.title); return true; }
    return false; // already quarantined (genuinely dead — re-upload needed)
  }
  let changed = false;
  if (asset.broken) { asset.broken = false; console.log("[broll] recovered (valid video stream):", asset.title); changed = true; }
  if (!asset.normalized) {
    try { await normalizeBrollFile(asset.filePath); }
    catch (e) { console.warn("[broll] clean skipped (file still usable):", asset.title, e.message); }
    asset.normalized = true; changed = true;
  }
  return changed;
};
// Globally-serialised one-shot: only ONE pool normalisation runs at a time across all
// jobs/renders (otherwise concurrent calls race on the same files). Reads + writes its
// own fresh db snapshot, so callers should re-read db AFTER awaiting this.
let brollNormalizeInFlight = null;
const normalizeBrollPoolOnce = async () => {
  if (brollNormalizeInFlight) return brollNormalizeInFlight;
  brollNormalizeInFlight = (async () => {
    const db = await readDb();
    let changed = false;
    for (const a of db.assets) if (await ensureAssetNormalized(a)) changed = true;
    if (changed) await writeDb(db);
  })();
  try { await brollNormalizeInFlight; } finally { brollNormalizeInFlight = null; }
};

// Face-aware split-screen framing. detect_faces.py samples ~12 frames of a source and
// returns the DOMINANT face's centre as fractions of the frame ({cx,cy,w,h}). We cache
// per source (keyed by filePath:mtime) so a source is analysed at most once, then reuse
// the box for every clip / variant / render that draws from it.
const faceBoxCache = new Map(); // mediaCacheKey -> { cx, cy, w, h, srcW, srcH } | null
const ensureFaceBox = async (asset) => {
  if (!asset || !asset.filePath || !fsSync.existsSync(asset.filePath)) return null;
  const key = mediaCacheKey(asset.filePath);
  if (faceBoxCache.has(key)) return faceBoxCache.get(key);
  let box = null;
  try {
    const { stdout } = await runProcess(pythonBin, [
      detectFacesScriptPath, asset.filePath, "--samples", "12", "--model", faceModelPath,
    ]);
    const line = stdout.trim().split("\n").filter(Boolean).pop() || "{}";
    const parsed = JSON.parse(line);
    if (parsed && parsed.found) {
      let srcW = 0, srcH = 0;
      try {
        const p = await ffprobeJson(asset.filePath);
        const v = (p.streams || []).find((s) => s.codec_type === "video") || {};
        srcW = Number(v.width) || 0; srcH = Number(v.height) || 0;
      } catch { /* dims optional */ }
      box = { cx: parsed.cx, cy: parsed.cy, w: parsed.w, h: parsed.h, srcW, srcH };
    } else if (parsed && parsed.error) {
      console.warn("[face] detect error:", asset.title, parsed.error);
    }
  } catch (e) {
    console.warn("[face] detect failed:", asset && asset.title, e.message);
  }
  faceBoxCache.set(key, box);
  return box;
};

// Detect faces for every source an auto batch could draw from (both podcast cameras +
// each reaction/speaker bank clip), keyed by asset id, so the engine can frame each band
// on the real face. Detection is cached per source, so this is cheap after the first run.
const detectFacesForSources = async (sourceGroup, banks) => {
  const assets = [sourceGroup?.person1, sourceGroup?.person2, ...((banks?.speakers) || [])].filter(Boolean);
  const faceBoxes = {};
  await Promise.all(assets.map(async (a) => {
    const box = await ensureFaceBox(a);
    if (box) faceBoxes[a.id] = box;
  }));
  return faceBoxes;
};

// True (two-pass) EBU R128 loudness normalisation. Target overridable via
// KLIMAX_LOUDNORM_I. measureLoudness() runs the analysis pass and returns the
// measured values; loudnormFilterFor() builds the apply-pass filter (linear) so
// every clip lands on the SAME loudness — a quietly-recorded clip is brought up.
const LOUDNORM_TARGET_I = clamp(safeNumber(process.env.KLIMAX_LOUDNORM_I, -16), -30, -8);
const LOUDNORM_TP = -1.5;
const LOUDNORM_LRA = 11;
const loudnessCache = new Map(); // path+mtime -> measurement (it's a full decode pass)
const measureLoudness = async (filePath) => {
  if (!ffmpegPath) return null;
  let key;
  try { key = `${filePath}:${fsSync.statSync(filePath).mtimeMs}`; } catch { key = filePath; }
  if (loudnessCache.has(key)) return loudnessCache.get(key);
  let measured = null;
  try {
    const { stderr } = await runProcess(ffmpegPath, [
      "-hide_banner", "-nostats", "-i", filePath,
      "-af", `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`,
      "-f", "null", "-",
    ]);
    const matches = stderr.match(/\{[\s\S]*?\}/g);
    if (matches) {
      const m = JSON.parse(matches[matches.length - 1]);
      measured = m && m.input_i != null && Number.isFinite(parseFloat(m.input_i)) ? m : null;
    }
  } catch { /* keep null */ }
  loudnessCache.set(key, measured);
  return measured;
};
const loudnormFilterFor = (measured) => {
  if (measured) {
    return `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}`
      + `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}`
      + `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}`
      + `:offset=${measured.target_offset || 0}:linear=true`;
  }
  // Fallback to single-pass dynamic if the analysis pass failed.
  return `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}`;
};

const exportMetadata = async (filePath) => {
  const [probe, stat] = await Promise.all([ffprobeJson(filePath), fs.stat(filePath)]);
  const videoStream = (probe.streams || []).find((stream) => stream.codec_type === "video") || {};
  return {
    duration: safeNumber(probe.format?.duration, 0),
    width: safeNumber(videoStream.width, 0),
    height: safeNumber(videoStream.height, 0),
    sizeBytes: stat.size,
  };
};

const writeTextFile = async (projectId, name, value, extension = "txt") => {
  await ensureDir(textRoot);
  const filePath = path.join(textRoot, `${projectId}-${name}.${extension}`);
  await fs.writeFile(filePath, value, "utf8");
  return filePath;
};

const writeJsonFile = async (projectId, name, value) => {
  await ensureDir(tempRoot);
  const filePath = path.join(tempRoot, `${projectId}-${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  return filePath;
};

const ensureSystemAssets = async () => {
  await ensureDir(systemRoot);
  if (fsSync.existsSync(logoAnimationSourceCandidate) && !fsSync.existsSync(logoAnimationPath)) {
    await fs.copyFile(logoAnimationSourceCandidate, logoAnimationPath);
  }
  if (ffmpegPath && fsSync.existsSync(logoAnimationPath)) {
    try {
      await runProcess(ffmpegPath, [
        "-y",
        "-ss",
        String(logoPreviewTimeSeconds),
        "-i",
        logoAnimationPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=1080:-1,format=rgba",
        logoPreviewRawPath,
      ]);
      await runProcess(pythonBin, [cropAlphaScriptPath, logoPreviewRawPath, logoPreviewPath, "36"]);
    } catch (error) {
      console.warn("[system] logo preview generation skipped:", error.message);
    }
  }
};

const seedTailleVideos = async () => {
  // OFF by default. This used to re-inject the "taille" demo pair into the bank on
  // every startup where the seed group was absent — so taille kept REAPPEARING after
  // the user deleted it. Now opt-in only (KLIMAX_SEED_TAILLE=1).
  if (process.env.KLIMAX_SEED_TAILLE !== "1") return;
  const sourceOne = path.join(publicSeedRoot, "taille-1.mp4");
  const sourceTwo = path.join(publicSeedRoot, "taille-2.mp4");
  if (!fsSync.existsSync(sourceOne) || !fsSync.existsSync(sourceTwo)) return;

  const db = await readDb();
  if (db.assets.some((asset) => asset.groupId === "video-group-taille-test")) return;

  const targetDir = path.join(uploadRoot, "videos");
  await ensureDir(targetDir);
  const targetOne = path.join(targetDir, "taille-1.mp4");
  const targetTwo = path.join(targetDir, "taille-2.mp4");
  await fs.copyFile(sourceOne, targetOne);
  await fs.copyFile(sourceTwo, targetTwo);
  const statOne = await fs.stat(targetOne);
  const statTwo = await fs.stat(targetTwo);

  db.assets.unshift(
    {
      id: "video-taille-test-person1",
      category: "video",
      title: "taille 1.mp4",
      note: "Test vidéo: taille 1 + taille 2",
      fileName: "taille 1.mp4",
      fileSize: statOne.size,
      mimeType: "video/mp4",
      filePath: targetOne,
      fileUrl: publicUrlFor(targetOne),
      groupId: "video-group-taille-test",
      groupTitle: "taille 1 + taille 2",
      videoPart: "person1",
    },
    {
      id: "video-taille-test-person2",
      category: "video",
      title: "taille 2.mp4",
      note: "Test vidéo: taille 1 + taille 2",
      fileName: "taille 2.mp4",
      fileSize: statTwo.size,
      mimeType: "video/mp4",
      filePath: targetTwo,
      fileUrl: publicUrlFor(targetTwo),
      groupId: "video-group-taille-test",
      groupTitle: "taille 1 + taille 2",
      videoPart: "person2",
    }
  );
  await writeDb(db);
};

// Resolve a clip's source video. The pair's person1/person2 are tried first (keeps the
// 2-clip behaviour identical). For multi-rush projects (3+ alternating clips) a clip can
// reference ANY uploaded video asset by id, so we also resolve clip.sourceVideoId against
// the full asset list when provided. Final fallback: stage-based (reply -> person2).
const sourceAssetForClip = (sourceGroup, clip, assets = null) => {
  const id = clip?.sourceVideoId;
  if (id && sourceGroup) {
    if (id === sourceGroup.person2?.id) return sourceGroup.person2;
    if (id === sourceGroup.person1?.id) return sourceGroup.person1;
  }
  if (id && Array.isArray(assets)) {
    const a = assets.find((x) => x.id === id && x.category === "video");
    if (a?.filePath) return a;
  }
  if (!sourceGroup) return null;
  return clip?.stage === "reply" ? sourceGroup.person2 || sourceGroup.person1 : sourceGroup.person1 || sourceGroup.person2;
};

const buildWordsFromTranscription = (transcription) => {
  const words = [];

  for (const segment of transcription?.segments || []) {
    const directWords = Array.isArray(segment.words) ? segment.words : [];
    if (directWords.length > 0) {
      for (const word of directWords) {
        const cleaned = stripCaptionPunctuation(word.word);
        if (!cleaned) continue;
        words.push({
          start: safeNumber(word.start, segment.start),
          end: safeNumber(word.end, segment.end),
          word: cleaned,
        });
      }
      continue;
    }

    const tokens = stripCaptionPunctuation(segment.text).split(" ").filter(Boolean);
    if (!tokens.length) continue;
    const duration = Math.max(0.08, safeNumber(segment.end, 0) - safeNumber(segment.start, 0));
    const tokenDuration = duration / tokens.length;
    tokens.forEach((token, index) => {
      const start = safeNumber(segment.start, 0) + tokenDuration * index;
      words.push({
        start,
        end: start + tokenDuration,
        word: token,
      });
    });
  }

  return mergeFrenchElisionWords(words);
};

const buildCaptionCues = (words, wordsPerLine = 4) => {
  const cues = [];
  const maxWords = clamp(Math.round(safeNumber(wordsPerLine, 2)), 2, 2);
  let current = [];

  const flush = () => {
    if (!current.length) return;
    cues.push({
      start: current[0].start,
      end: Math.max(current[current.length - 1].end, current[0].start + 0.12),
      text: current.map((item) => item.word).join(" "),
    });
    current = [];
  };

  words.forEach((word, index) => {
    current.push(word);
    const next = words[index + 1];
    const nextGap = next ? safeNumber(next.start, word.end) - safeNumber(word.end, word.end) : Infinity;
    if (current.length >= maxWords || nextGap > 0.75) {
      flush();
    }
  });

  flush();
  return cues;
};

const sfxStopWords = new Set([
  "alors", "apres", "avant", "avec", "aussi", "autre", "avoir", "cette", "comme", "dans",
  "donc", "elle", "elles", "etre", "faire", "faut", "mais", "meme", "moi", "nous",
  "parce", "pour", "quand", "quoi", "sans", "sont", "tout", "tous", "tres", "voila",
  "vous", "vrai", "vraiment",
]);

const sfxKeywordHints = new Set([
  "klimax", "climax", "taille", "compte", "important", "secret", "argent", "amour",
  "application", "video", "tiktok", "femme", "homme", "message", "attention", "probleme",
  "reponse", "choix", "viral", "buzz", "choc", "preuve", "resultat",
]);

const normalizeSfxWord = (word = "") =>
  stripCaptionPunctuation(word)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9%]+/g, "")
    .toLowerCase();

const scoreSfxWord = (word = "") => {
  const token = normalizeSfxWord(word);
  if (!token || sfxStopWords.has(token)) return 0;
  let score = 0;
  if (token.length >= 5) score += token.length;
  if (/^[0-9]+%?$/.test(token)) score += 16;
  if (sfxKeywordHints.has(token)) score += 18;
  if (token === "klimax" || token === "climax") score += 24;
  if (/[A-Z]{2,}/.test(String(word))) score += 4;
  return score;
};

const fallbackWordsFromCues = (clipTranscription) => {
  const words = [];
  for (const cue of clipTranscription?.cues || []) {
    const tokens = stripCaptionPunctuation(cue.text).split(" ").filter(Boolean);
    if (!tokens.length) continue;
    const start = safeNumber(cue.start, 0);
    const duration = Math.max(0.12, safeNumber(cue.end, start + 0.3) - start);
    const step = duration / tokens.length;
    tokens.forEach((word, index) => {
      words.push({ word, start: start + step * index, end: start + step * (index + 1) });
    });
  }
  return words;
};

// Viral SFX placement, "script-logical": drop a few punchy effects on the
// strongest keyword moments of the WHOLE video. We aim for SFX_PER_VIDEO effects,
// kept at least SFX_MIN_GAP_SECONDS apart, with a random sound each (the "fahh"
// quieter). The metallic riser is handled separately in the render.
const SFX_EFFECT_VOLUME_DB = -13;
const LOGO_VOLUME_DB = -4;        // Klimax logo pop-up sound — present but not overpowering
const SFX_FAHH_KEY = "effect_fahhh";
const SFX_FAHH_VOLUME_DB = -24; // was -19; lowered 5 dB — the "fahh" was too loud
const SFX_PER_VIDEO = 3;          // target number of effects per video
const SFX_MIN_GAP_SECONDS = 4;    // minimum spacing between two effects

// clipMeta = [{ transcription, duration }] in play order. Returns a flat plan of
// { clipIndex, time (in-clip seconds), key, volumeDb, word } — up to 3 events,
// on the highest-scoring keywords, spread >= 4 s apart. If the keywords are too
// few/clustered to reach 3, we fill from any word position keeping the spacing.
const buildVideoSfxPlan = (clipMeta, poolKeys) => {
  if (!Array.isArray(poolKeys) || poolKeys.length === 0) return [];

  let clipStart = 0;
  const candidates = []; // scored keywords (preferred)
  const fallback = [];   // every word position (used only to reach the target)
  for (let clipIndex = 0; clipIndex < clipMeta.length; clipIndex += 1) {
    const { transcription, duration } = clipMeta[clipIndex];
    if (duration && duration >= 1.0) {
      const words = Array.isArray(transcription?.words) && transcription.words.length
        ? transcription.words
        : fallbackWordsFromCues(transcription);
      for (const word of words) {
        const inClip = clamp(safeNumber(word.start, 0), 0, Math.max(0, duration - 0.15));
        const entry = { clipIndex, time: inClip, globalTime: clipStart + inClip, word: word.word };
        fallback.push(entry);
        const score = scoreSfxWord(word.word);
        if (score > 0) candidates.push({ ...entry, score });
      }
    }
    clipStart += duration > 0 ? duration : 0;
  }
  if (!fallback.length) return [];

  const chosen = [];
  const farEnough = (g) => chosen.every((p) => Math.abs(p.globalTime - g) >= SFX_MIN_GAP_SECONDS);
  // 1) best keywords first
  for (const cand of [...candidates].sort((a, b) => b.score - a.score || a.globalTime - b.globalTime)) {
    if (chosen.length >= SFX_PER_VIDEO) break;
    if (farEnough(cand.globalTime)) chosen.push(cand);
  }
  // 2) top up from any word position (keeps the 4 s spacing) so we reach 3
  if (chosen.length < SFX_PER_VIDEO) {
    for (const cand of [...fallback].sort((a, b) => a.globalTime - b.globalTime)) {
      if (chosen.length >= SFX_PER_VIDEO) break;
      if (farEnough(cand.globalTime)) chosen.push(cand);
    }
  }

  chosen.sort((a, b) => a.globalTime - b.globalTime);
  // Assign a DISTINCT sound to each beat — no duplicates in the same video while the
  // pool is large enough. Shuffle the pool (Fisher–Yates) and walk it; only wrap (and
  // thus repeat) if there are more beats than distinct sounds. This kills the old bug
  // where the same effect could land twice (it only avoided back-to-back repeats).
  const shuffled = [...poolKeys];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const plan = chosen.map((cand, i) => {
    const key = shuffled[i % shuffled.length];
    const volumeDb = key === SFX_FAHH_KEY ? SFX_FAHH_VOLUME_DB : SFX_EFFECT_VOLUME_DB;
    return { clipIndex: cand.clipIndex, time: cand.time, key, volumeDb, word: cand.word };
  });
  return plan;
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const buildAutoZoomEvents = (clip, clipDuration, settings) => {
  const events = [];
  // No auto-zoom on a split-screen (2-speaker) clip — zooming a stacked frame looks
  // broken, so the zoom at the start is dropped when the 2nd speaker is on.
  if (clip?.dualSpeakerEnabled) return events;
  const duration = Math.max(0.1, safeNumber(clipDuration, 0));
  const zoomDuration = clamp(safeNumber(settings.autoZoomDurationSeconds, 2), 0.6, 4);
  const zoomBoost = clamp(safeNumber(settings.autoZoomBoostPercent, 20), 5, 60) / 100;

  // Auto-zoom beats fire on the REPLY and on every EXTRA clip (clip 3+ of a montage) —
  // never on the intro/hook clip. Each clip's zoom is INDEPENDENT (its own filter), so a
  // zoom on clip 2 never carries into clip 3 — clip 3 starts un-zoomed. availableEnd
  // forces every zoom to FINISH ≥ 0.6 s before the clip ends, so no zoom is still moving
  // within ~½ s of the next cut.
  if (
    settings.autoZoomEnabled !== false &&
    (clip?.stage === "reply" || clip?.stage === "extra") &&
    duration >= zoomDuration + 2.2
  ) {
    const count = 2;
    const availableStart = 0.8;
    const availableEnd = Math.max(availableStart, duration - zoomDuration - 0.6);
    const minGap = zoomDuration + 1.0;
    const starts = [];
    let attempts = 0;
    while (starts.length < count && attempts < 80) {
      attempts += 1;
      const start = randomBetween(availableStart, availableEnd);
      if (starts.every((value) => Math.abs(value - start) >= minGap)) {
        starts.push(start);
      }
    }
    if (starts.length < count) {
      const first = availableStart + Math.max(0, availableEnd - availableStart) * 0.25;
      const second = availableStart + Math.max(0, availableEnd - availableStart) * 0.72;
      starts.splice(0, starts.length, first, second);
    }

    starts.slice(0, count).forEach((start, index) => {
      events.push({
        kind: settings.autoZoomMode === "smooth" ? "smooth" : "cut",
        start: clamp(start, 0, Math.max(0, duration - zoomDuration)),
        duration: zoomDuration,
        boost: zoomBoost,
        label: `auto-${index + 1}`,
      });
    });
  }

  const zoomOutEnabled = clip?.stage === "intro"
    ? settings.introZoomOutEnabled === true
    : settings.replyZoomOutEnabled === true;
  if (zoomOutEnabled && duration > 0.6) {
    events.push({
      kind: "zoomOut",
      start: 0,
      duration: Math.min(clamp(safeNumber(settings.zoomOutDurationSeconds, 1.2), 0.4, 3), duration),
      boost: clamp(safeNumber(settings.zoomOutStartPercent, 180), 110, 260) / 100 - 1,
      label: "clip-start",
    });
  }

  return events.sort((a, b) => a.start - b.start);
};

const zoomExpressionForEvents = (events) => {
  if (!events.length) return "1";
  const terms = events.map((event) => {
    const start = Number(event.start).toFixed(3);
    const end = Number(event.start + event.duration).toFixed(3);
    const duration = Number(event.duration).toFixed(3);
    const boost = Number(event.boost).toFixed(4);
    if (event.kind === "smooth") {
      return `${boost}*between(t,${start},${end})*sin(PI*(t-${start})/${duration})`;
    }
    if (event.kind === "zoomOut") {
      return `${boost}*between(t,0,${duration})*(1-t/${duration})`;
    }
    return `${boost}*between(t,${start},${end})`;
  });
  return `1+${terms.join("+")}`;
};

const applyVideoZoomEvents = (filterChains, inputTag, outputTag, events) => {
  const expression = zoomExpressionForEvents(events);
  if (expression === "1") {
    filterChains.push(`[${inputTag}]null[${outputTag}]`);
    return;
  }
  const escaped = escapeFfmpegExpression(expression);
  // The input is the ALREADY scaled+positioned 1080x1920 clip frame (vbase), so
  // the zoom must center on THAT frame's centre — not on the raw source — to keep
  // the clip's own framing. Default anchor 0.5 = true centre (both axes);
  // KLIMAX_ZOOM_VERTICAL_ANCHOR can bias it upward (0 = top) for talking heads.
  const vAnchor = clamp(safeNumber(process.env.KLIMAX_ZOOM_VERTICAL_ANCHOR, 0.5), 0, 0.5);
  // Oversample ONLY as much as the motion needs (output is ALWAYS 1080x1920):
  //  - smooth / zoom-out beats move the centred crop every frame, so a fractional
  //    crop offset must land sub-pixel → oversample 1.5x (1620x2880) then downscale
  //    to 1080. (Was 2x/2160 — 1.5x is ~44% fewer pixels with no visible difference.)
  //  - pure CUT beats hold a CONSTANT, centred zoom within their window (a step), so
  //    the crop never moves sub-pixel → NO oversample needed: scale up by the zoom and
  //    crop a fixed 1080x1920 centre directly. Much cheaper, identical look.
  // A fixed-size crop keeps the filter chain stable (a per-frame-varying crop size
  // makes ffmpeg fail "reinitializing filters"); max() pins the scale floor so a
  // zoom-out dipping below 1.0 can't make the frame smaller than the crop.
  const smoothMotion = events.some((e) => e.kind !== "cut");
  const W = smoothMotion ? 1620 : 1080;
  const H = smoothMotion ? 2880 : 1920;
  const downscale = smoothMotion ? `scale=1080:1920:flags=lanczos,` : ``;
  filterChains.push(
    `[${inputTag}]scale=w='max(${W},${W}*(${escaped}))':h='max(${H},${H}*(${escaped}))':eval=frame:flags=bicubic,` +
      `crop=${W}:${H}:(in_w-${W})/2:(in_h-${H})*${vAnchor.toFixed(3)},` +
      `${downscale}setsar=1[${outputTag}]`
  );
};

const createSourceFingerprint = async (project, sourceGroup) => {
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const parts = [
    transcriptionPipelineVersion,
    whisperModelName, // a model upgrade (tiny -> small) invalidates cached transcripts
    project.sourceGroupId,
    subtitleStyle.wordsPerLine,
    project.settings?.logoTriggerWord || "klimax",
  ];

  for (const asset of [sourceGroup?.person1, sourceGroup?.person2].filter(Boolean)) {
    const stat = await fs.stat(asset.filePath);
    parts.push(asset.id, stat.size, stat.mtimeMs);
  }

  return parts.join("|");
};

// Transcribe a SINGLE video asset and store the result ON THE ASSET (words + plain
// text), so it's computed ONCE at bank-upload time, reused by every render, and
// editable by the user. Mutates `asset` in place; caller persists with writeDb.
const ensureAssetTranscript = async (asset, { force = false } = {}) => {
  if (!asset?.filePath || asset.category !== "video") return asset;
  if (!force && asset.transcript?.status === "completed" && Array.isArray(asset.transcript.words) && asset.transcript.words.length) {
    return asset; // already transcribed (and possibly user-edited) — keep it
  }
  try {
    const { transcribeFile } = await import("./whisper.mjs");
    const { result: raw } = await transcribeFile(asset.filePath);
    const words = buildWordsFromTranscription(raw);
    asset.transcript = {
      status: "completed",
      language: raw.language || "unknown",
      duration: safeNumber(raw.duration, 0),
      words,
      text: words.map((w) => w.word).join(" "),
      edited: false,
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    asset.transcript = { status: "failed", error: String(e?.message || e).slice(0, 200), words: [], text: "", updatedAt: new Date().toISOString() };
  }
  return asset;
};

// Re-tokenise edited transcript text and re-align word timings: keep the original
// per-word timing when the word count is unchanged, else spread evenly across the
// clip's duration. Returns the new words array.
const realignTranscriptWords = (text, prevWords = [], duration = 0) => {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  if (prevWords.length === tokens.length) {
    return tokens.map((w, i) => ({ start: prevWords[i].start, end: prevWords[i].end, word: w }));
  }
  const span = duration > 0 ? duration : (prevWords.length ? safeNumber(prevWords[prevWords.length - 1].end, tokens.length * 0.4) : tokens.length * 0.4);
  const step = span / tokens.length;
  return tokens.map((w, i) => ({ start: Number((i * step).toFixed(3)), end: Number(((i + 1) * step).toFixed(3)), word: w }));
};

// When an asset's transcript changes (re-transcribed or hand-edited), drop the cached
// transcription of every project that uses it, so the next render rebuilds captions
// from the new words instead of serving the stale cached cues.
const invalidateProjectTranscriptsForAsset = async (db, assetId) => {
  for (const p of db.projects) {
    if ((p.clips || []).some((c) => c.sourceVideoId === assetId)) {
      p.transcription = defaultTranscription();
      // Drop the stale per-project transcript FILE too, so the next render rebuilds
      // from the (edited) per-asset transcript instead of serving old cached cues.
      await fs.unlink(transcriptFile(p.id)).catch(() => {});
    }
  }
};

const ensureTranscription = async (project, sourceGroup, assets = null) => {
  const fingerprint = await createSourceFingerprint(project, sourceGroup);
  // The full clips now live in a per-project file (db.json keeps only a stub). If this
  // project's clips aren't loaded but the stub says "completed", pull the file so the
  // cache-hit check below can short-circuit instead of re-transcribing.
  if (
    project.transcription?.status === "completed" &&
    !(Array.isArray(project.transcription?.clips) && project.transcription.clips.length) &&
    project.id
  ) {
    const fromFile = await loadTranscript(project.id);
    if (fromFile?.clips?.length) project.transcription = fromFile;
  }
  if (
    project.transcription?.status === "completed" &&
    project.transcription?.sourceFingerprint === fingerprint &&
    Array.isArray(project.transcription?.clips) &&
    project.transcription.clips.length === project.clips.length
  ) {
    return project.transcription;
  }

  const { transcribeFile } = await import("./whisper.mjs");
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const bySource = new Map();

  // Transcribe every DISTINCT source video referenced by the clips — person1/person2
  // for a normal pair, plus any extra rush asset for a multi-rush (3+ clips) project.
  const distinctSources = [];
  const seenSrc = new Set();
  for (const a of [sourceGroup?.person1, sourceGroup?.person2].filter(Boolean)) {
    if (a.filePath && !seenSrc.has(a.id)) { seenSrc.add(a.id); distinctSources.push(a); }
  }
  for (const clip of project.clips) {
    const a = sourceAssetForClip(sourceGroup, clip, assets);
    if (a?.filePath && !seenSrc.has(a.id)) { seenSrc.add(a.id); distinctSources.push(a); }
  }
  const triggerWord = project.settings?.logoTriggerWord || "klimax";
  for (const asset of distinctSources) {
    let rawWords;
    let duration;
    let language;
    let segments = null;
    // PREFER the transcript already stored ON THE ASSET (computed at bank upload and
    // user-editable) — no re-transcription, and the user's edits are honoured. Only
    // fall back to Whisper for assets that never got a stored transcript.
    if (asset.transcript?.status === "completed" && Array.isArray(asset.transcript.words) && asset.transcript.words.length) {
      rawWords = asset.transcript.words;
      duration = safeNumber(asset.transcript.duration, 0);
      language = asset.transcript.language || "unknown";
    } else {
      const { result: raw } = await transcribeFile(asset.filePath);
      rawWords = buildWordsFromTranscription(raw);
      duration = safeNumber(raw.duration, 0);
      language = raw.language || "unknown";
      segments = raw.segments || null;
    }
    const words = normalizeLogoWords(rawWords, triggerWord);
    const cues = buildCaptionCues(words, subtitleStyle.wordsPerLine);
    bySource.set(asset.id, {
      sourceVideoId: asset.id,
      language,
      duration,
      cues,
      words,
      logoMoments: buildLogoMoments(words, triggerWord, duration, segments || cues),
    });
  }

  const clips = project.clips.map((clip) => {
    const asset = sourceAssetForClip(sourceGroup, clip, assets);
    const sourceTranscript = asset ? bySource.get(asset.id) : null;
    return {
      clipId: clip.id,
      sourceVideoId: asset?.id || null,
      stage: clip.stage,
      language: sourceTranscript?.language || "unknown",
      duration: safeNumber(sourceTranscript?.duration, 0),
      cues: sourceTranscript?.cues || [],
      words: sourceTranscript?.words || [],
      logoMoments: sourceTranscript?.logoMoments || [],
    };
  });

  project.clips = project.clips.map((clip) => {
    const clipTranscription = clips.find((entry) => entry.clipId === clip.id);
    const previewText = clipTranscription?.cues?.slice(0, 2).map((cue) => cue.text).join(" ") || clip.subtitle;
    return { ...clip, subtitle: previewText || clip.subtitle };
  });

  // Auto-analyse: generate the text hook from the opening question (Personne 1),
  // once, via the local Claude CLI. Never overwrites a hook the user has edited.
  try {
    const introClip = clips.find((c) => c.stage === "intro") || clips[0];
    const introText = (introClip?.cues || []).map((c) => c.text).join(" ").trim();
    const currentHook = (project.settings?.hookText || "").trim();
    const isDefaultHook = !currentHook || currentHook === "Tu connais cette sensation ?";
    if (introText && isDefaultHook && !project.settings?.hookAutoGenerated) {
      // Hooks that already performed. Reused ~75% of the time (at most lightly
      // reworded), a fresh on-brand variant the other ~25%. ALWAYS matched to the
      // clip's real topic — there will be ~20 different videos, the hook must fit.
      const PROVEN_HOOKS = [
        "la taille ça change vraiment tout 🍆",
        "3 exercices pour tenir longtemps au lit 🍆",
        "comment savoir si on est bon au lit 🍆",
        "comment un mec peut devenir bon au lit 🍆",
        "comment durer au lit sans bedave 🍆",
        "est ce que la taille du zgeg ça compte 🍆",
        "est ce que la taille ça compte 🍆",
        "tenir 8 minutes au lit c'est grave ? 🍆",
      ];
      // Topic context = the opening question + the start of the reply.
      const replyClip = clips.find((c) => c.stage === "reply");
      const replyText = (replyClip?.cues || []).slice(0, 14).map((c) => c.text).join(" ").trim();
      const topicText = `${introText}\n${replyText}`.slice(0, 1600);
      const variationSeed = Math.random().toString(36).slice(2, 8);
      const useProven = Math.random() < 0.75;
      const system =
        "Tu écris LE hook (gros texte d'accroche) d'une chaîne de vidéos courtes au créneau INTIME : tenir longtemps au lit, performance et confiance sexuelle masculine, séduction et relations privées hommes-femmes. " +
        "Hooks qui ont DÉJÀ fait des vues (référence de style et de sujets) :\n- " + PROVEN_HOOKS.join("\n- ") + "\n\n" +
        (useProven
          ? "CHOISIS dans cette liste LE hook qui colle le mieux au SUJET RÉEL du transcript ci-dessous. Tu peux le reformuler très légèrement (mots quasi identiques). Il DOIT correspondre au sujet du transcript."
          : "ÉCRIS un hook NOUVEAU (variante) dans le même style et le même créneau, inspiré de la liste mais jamais identique, qui colle au SUJET RÉEL du transcript ci-dessous.") +
        " Vérifie impérativement que le hook correspond à ce dont parle vraiment la vidéo. " +
        "Règles : une seule phrase, 8 mots max (hors emoji), en français, sans guillemets, sans ponctuation superflue. " +
        "Termine par EXACTEMENT UN emoji : 🍆 par défaut (sexe / taille / tenir au lit / intime), sinon le plus pertinent. " +
        "Réponds UNIQUEMENT avec le hook suivi de son unique emoji." +
        `\n\n[variation: ${variationSeed}] Force une formulation différente de toute génération précédente, sans changer le sens.`;
      const hook = (await runClaude(topicText, system)).trim().replace(/^["'«»\s]+|["'«»\s]+$/g, "");
      if (hook && hook.length <= 90) {
        project.settings = { ...(project.settings || {}), hookText: hook, hookAutoGenerated: true };
        project.clips = project.clips.map((c) => (c.stage === "intro" ? { ...c, hookText: hook } : c));
      }
    }
  } catch (err) {
    console.error("[hook-gen]", err.message);
  }

  project.transcription = {
    status: "completed",
    generatedAt: new Date().toISOString(),
    sourceFingerprint: fingerprint,
    clips,
  };
  // Persist the heavy clips to the per-project file (db.json keeps only the stub).
  await saveTranscript(project.id, project.transcription);

  return project.transcription;
};

const hexToAssColor = (value, alpha = 0) => {
  const clean = String(value || "#ffffff").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "&H00FFFFFF";
  const aa = clamp(Math.round(alpha), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  const rr = clean.slice(0, 2).toUpperCase();
  const gg = clean.slice(2, 4).toUpperCase();
  const bb = clean.slice(4, 6).toUpperCase();
  return `&H${aa}${bb}${gg}${rr}`;
};

const hexToAssOverrideColor = (value, fallback = "#ffffff") => {
  const clean = String(value || fallback).replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hexToAssOverrideColor(fallback, "#ffffff");
  const rr = clean.slice(0, 2).toUpperCase();
  const gg = clean.slice(2, 4).toUpperCase();
  const bb = clean.slice(4, 6).toUpperCase();
  return `&H${bb}${gg}${rr}&`;
};

const assTime = (seconds) => {
  const total = Math.max(0, safeNumber(seconds, 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const centis = Math.floor((total - Math.floor(total)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
};

const fontDescriptor = (fontFamily) => {
  const family = String(fontFamily || "");
  const known = [
    {
      match: /arial black/i,
      assName: "Arial Black",
      fontPath: "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    },
    {
      match: /impact/i,
      assName: "Impact",
      fontPath: "/System/Library/Fonts/Supplemental/Impact.ttf",
    },
    {
      match: /courier/i,
      assName: "Courier New",
      fontPath: "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    },
    {
      match: /helvetica/i,
      assName: "Helvetica",
      fontPath: "/System/Library/Fonts/Helvetica.ttc",
    },
    {
      match: /arial/i,
      assName: "Arial",
      fontPath: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    },
    {
      match: /sf pro|system/i,
      assName: "SF Pro Display",
      fontPath: "/System/Library/Fonts/SFNS.ttf",
    },
    { match: /archivo/i, assName: "Archivo Black", fontPath: null },
    { match: /montserrat/i, assName: "Montserrat", fontPath: null },
    { match: /bebas/i, assName: "Bebas Neue", fontPath: null },
    { match: /anton/i, assName: "Anton", fontPath: null },
    {
      match: /din condensed/i,
      assName: "DIN Condensed",
      fontPath: "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
    },
    {
      match: /din/i,
      assName: "DIN Alternate",
      fontPath: "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
    },
    { match: /futura/i, assName: "Futura", fontPath: null },
    { match: /avenir/i, assName: "Avenir Next Heavy", fontPath: null },
    { match: /gill/i, assName: "Gill Sans", fontPath: null },
    { match: /trebuchet/i, assName: "Trebuchet MS", fontPath: null },
    { match: /marker/i, assName: "Marker Felt", fontPath: null },
    { match: /noteworthy/i, assName: "Noteworthy", fontPath: null },
  ];

  return known.find((item) => item.match.test(family)) || known[3];
};

const GOOGLE_EXPORT_FONTS = new Set([
  "Anton",
  "Archivo Black",
  "Bebas Neue",
  "Montserrat",
]);

const googleFontCssUrl = (family, weight) => {
  const encodedFamily = encodeURIComponent(family).replace(/%20/g, "+");
  const safeWeight = clamp(Math.round(safeNumber(weight, 800)), 400, 900);
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${safeWeight}&display=swap`;
};

const downloadGoogleFont = async (family, weight) => {
  await ensureDir(fontRoot);
  const targetPath = path.join(fontRoot, `${normalizeFileName(`${family}-${weight}`)}.ttf`);
  if (fsSync.existsSync(targetPath)) return targetPath;

  const headers = { "User-Agent": "Mozilla/5.0 KlimaxVideo/1.0" };
  let cssResponse = await fetch(googleFontCssUrl(family, weight), { headers });
  let css = cssResponse.ok ? await cssResponse.text() : "";
  if (!/url\((https:[^)]+)\)/.test(css)) {
    const encodedFamily = encodeURIComponent(family).replace(/%20/g, "+");
    cssResponse = await fetch(`https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`, { headers });
    css = cssResponse.ok ? await cssResponse.text() : "";
  }

  const fontUrl = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!fontUrl) return null;

  const fontResponse = await fetch(fontUrl, { headers });
  if (!fontResponse.ok) return null;
  const buffer = Buffer.from(await fontResponse.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return targetPath;
};

const resolveFontDescriptor = async (fontFamily, fontWeight = 800) => {
  const descriptor = fontDescriptor(fontFamily);
  if (descriptor.fontPath || !GOOGLE_EXPORT_FONTS.has(descriptor.assName)) return descriptor;

  try {
    const fontPath = await downloadGoogleFont(descriptor.assName, fontWeight);
    if (fontPath) return { ...descriptor, fontPath };
  } catch (error) {
    console.warn(`[font] fallback for ${descriptor.assName}: ${error.message}`);
  }

  return descriptor;
};

const keywordStopWords = new Set([
  "alors", "apres", "assez", "aucun", "aussi", "autant", "avec", "avoir", "bien", "cette",
  "comme", "dans", "deja", "donc", "elle", "elles", "encore", "entre", "fait", "faire",
  "faut", "il", "ils", "jour", "la", "le", "les", "leur", "mais", "mes", "mon", "nous",
  "pas", "plus", "pour", "quand", "que", "qui", "quoi", "sans", "ses", "son", "sont",
  "sur", "tes", "toi", "ton", "tous", "tout", "tres", "une", "vraiment", "vous",
]);

const curatedKeywordTerms = new Set([
  "klimax", "climax", "application", "taille", "compte", "femmes", "statistiques",
  "duree", "rapport", "rapports", "probleme", "exercice", "respiration", "confiance",
  "temps", "mois", "jours", "petit", "grande", "grand", "double", "doubler",
]);

const normalizeKeywordToken = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9%]+/g, "")
    .toLowerCase();

const parseKeywordTerms = (terms) =>
  String(terms || "")
    .split(/[,;\n]+/)
    .map(normalizeKeywordToken)
    .filter(Boolean);

const buildSubtitleKeywordSet = (clipTranscription, subtitleStyle) => {
  if (subtitleStyle.keywordHighlightEnabled === false) return new Set();

  const configured = parseKeywordTerms(subtitleStyle.keywordTerms);
  const scores = new Map(configured.map((term) => [term, 100]));
  const words = clipTranscription?.words?.length
    ? clipTranscription.words.map((item) => item.word)
    : (clipTranscription?.cues || []).flatMap((cue) => stripCaptionPunctuation(cue.text).split(" "));

  for (const rawWord of words) {
    const token = normalizeKeywordToken(rawWord);
    if (!token || keywordStopWords.has(token)) continue;
    const isNumber = /^[0-9]+%?$/.test(token);
    const isCurated = curatedKeywordTerms.has(token);
    if (!isNumber && !isCurated && token.length < 5) continue;
    const score = (scores.get(token) || 0) + 1 + (isNumber ? 8 : 0) + (isCurated ? 6 : 0) + Math.min(token.length / 4, 3);
    scores.set(token, score);
  }

  return new Set(
    Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 22)
      .map(([term]) => term)
  );
};

const assEscapePlain = (text) =>
  String(text || "")
    .replace(/\r?\n/g, "\\N")
    .replace(/[{}]/g, "")
    .trim();

// Render a cue's text with inline ASS color tags. Two layers of emphasis:
//  - KEYWORDS (heuristic set) get the preset's keyword colors (alternating pair).
//  - The ACTIVE word (karaoke: the word being SPOKEN right now, `activeIndex` =
//    word position in the cue) gets the active color — CapCut-style word-by-word
//    highlight. Color-only (no size change) so glyph geometry never reflows and
//    the shadow/outline layers (rendered per-cue) stay perfectly aligned.
const formatAssSubtitleText = (text, keywordSet, subtitleStyle, activeIndex = null) => {
  const hasKeywords = Boolean(keywordSet?.size);
  if (!hasKeywords && activeIndex === null) return assEscapePlain(text);

  const primary = hexToAssOverrideColor(subtitleStyle.textColor, "#ffffff");
  // In box mode (BorderStyle=4) the "outline" colour IS the box fill — never override
  // it inline or the keyword/active tags would recolor the box itself.
  const outlineTag = subtitleStyle.boxEnabled === true ? "" : `\\3c${hexToAssOverrideColor(subtitleStyle.strokeColor, "#000000")}`;
  const palette = [
    hexToAssOverrideColor(subtitleStyle.keywordColor, defaultSubtitleStyle.keywordColor),
    hexToAssOverrideColor(subtitleStyle.keywordSecondaryColor, defaultSubtitleStyle.keywordSecondaryColor),
  ];
  const activeColor = hexToAssOverrideColor(subtitleStyle.activeWordColor || subtitleStyle.keywordColor, defaultSubtitleStyle.keywordColor);
  let highlighted = 0;
  let wordIndex = -1;

  return String(text || "")
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part.replace(/\r?\n/g, "\\N");
      wordIndex += 1;
      const escaped = assEscapePlain(part);
      const token = normalizeKeywordToken(part);
      const isKeyword = Boolean(token && hasKeywords && (keywordSet.has(token) || /^[0-9]+%?$/.test(token)));
      const keywordColor = isKeyword ? palette[highlighted % palette.length] : null;
      if (isKeyword) highlighted += 1;
      if (wordIndex === activeIndex) {
        // Active word: if it's a keyword already shown in the active color, flip to
        // the secondary so the karaoke step stays visible.
        const color = keywordColor === activeColor ? palette[1] : activeColor;
        return `{\\c${color}${outlineTag}\\b1}${escaped}{\\c${primary}${outlineTag}\\b1}`;
      }
      if (!isKeyword) return escaped;
      return `{\\c${keywordColor}${outlineTag}\\b1}${escaped}{\\c${primary}${outlineTag}\\b1}`;
    })
    .join("");
};

const subtitleYForStage = (stage, subtitleStyle) => {
  const introPosition = subtitleStyle.introVerticalPosition || "lower";
  const replyPosition = subtitleStyle.replyVerticalPosition || "middle";
  // extra clips (3+) share the reply-like lower-third position (the auto engine sets an
  // explicit clip.subtitlePosition anyway; this is only the manual/fallback value).
  if (stage === "reply" || stage === "extra") {
    return replyPosition === "lower" ? 1470 : 1240;
  }
  return introPosition === "middle" ? 1260 : 1450;
};

const resolveSubtitleRenderStyle = (subtitleStyle = defaultSubtitleStyle) => {
  const baseFontSize = safeNumber(subtitleStyle.fontSize, defaultSubtitleStyle.fontSize);
  const userOutline = subtitleStyle.strokeEnabled === false ? 0 : safeNumber(subtitleStyle.strokeWidth, defaultSubtitleStyle.strokeWidth);
  const userShadow = subtitleStyle.shadowEnabled === false ? 0 : safeNumber(subtitleStyle.shadowDistance, defaultSubtitleStyle.shadowDistance);
  const userBlur = subtitleStyle.shadowEnabled === false ? 0 : safeNumber(subtitleStyle.shadowBlur, defaultSubtitleStyle.shadowBlur);

  return {
    ...subtitleStyle,
    fontSize: clamp(Math.round(baseFontSize * 1.08), 38, 96),
    fontWeight: Math.max(900, safeNumber(subtitleStyle.fontWeight, 900)),
    fontScaleX: clamp(safeNumber(subtitleStyle.fontScaleX, defaultSubtitleStyle.fontScaleX), 98, 112),
    outline: clamp(userOutline, 0, 14),
    shadowDistance: clamp(userShadow, 0, 22),
    shadowBlur: clamp(userBlur, 0, 36),
    shadowOpacity: clamp(safeNumber(subtitleStyle.shadowOpacity, 0.9), 0, 1),
    strokeColor: subtitleStyle.strokeColor || "#000000",
    shadowColor: subtitleStyle.shadowColor || "#000000",
    textColor: subtitleStyle.textColor || "#ffffff",
    // TikTok-style background box (ASS BorderStyle=4 — one box behind the line).
    boxEnabled: subtitleStyle.boxEnabled === true,
    boxColor: /^#[0-9a-fA-F]{6}$/.test(String(subtitleStyle.boxColor || "")) ? subtitleStyle.boxColor : "#ffffff",
    boxOpacity: clamp(safeNumber(subtitleStyle.boxOpacity, 1), 0, 1),
    boxPadding: clamp(safeNumber(subtitleStyle.boxPadding, 16), 8, 28),
  };
};

const subtitleAnimationOverride = (subtitleStyle, x, y, shadowDown, options = {}) => {
  const yOffset = safeNumber(options.yOffset, 0);
  const blur = Math.max(0, Math.min(8, safeNumber(options.blur ?? subtitleStyle.shadowBlur, 10) / 5));
  // Integer coordinates: libass rounds floats unpredictably, causing 1px jitter
  // between the shadow/outline/main layers of the same caption.
  x = Math.round(x);
  const targetY = Math.round(y + yOffset);
  const base = [`\\an5`, `\\xshad0`, `\\yshad${shadowDown}`, `\\blur${blur.toFixed(1)}`];
  const animation = subtitleStyle.animationPreset || "pop";

  if (animation === "rise") {
    return `{${[...base, `\\move(${x},${targetY + 52},${x},${targetY},0,260)`].join("")}}`;
  }
  if (animation === "bounce") {
    return `{${[
      ...base,
      `\\pos(${x},${targetY})`,
      "\\fscx76",
      "\\fscy76",
      "\\t(0,210,\\fscx114\\fscy114)",
      "\\t(210,390,\\fscx100\\fscy100)",
    ].join("")}}`;
  }
  if (animation === "none") {
    return `{${[...base, `\\pos(${x},${targetY})`].join("")}}`;
  }
  if (animation === "fade") {
    return `{${[...base, `\\pos(${x},${targetY})`, "\\alpha&HFF&", "\\t(0,180,\\alpha&H00&)"].join("")}}`;
  }
  if (animation === "zoom") {
    return `{${[
      ...base,
      `\\pos(${x},${targetY})`,
      "\\alpha&HFF&",
      "\\fscx132",
      "\\fscy132",
      "\\t(0,220,\\alpha&H00&\\fscx100\\fscy100)",
    ].join("")}}`;
  }
  if (animation === "slide") {
    return `{${[...base, `\\move(${x - 120},${targetY},${x},${targetY},0,320)`, "\\alpha&H88&", "\\t(0,180,\\alpha&H00&)"].join("")}}`;
  }
  if (animation === "shake") {
    return `{${[
      ...base,
      `\\pos(${x},${targetY})`,
      "\\alpha&H88&",
      "\\t(0,80,\\alpha&H00&\\fscx106\\fscy106)",
      "\\t(80,170,\\frz-2)",
      "\\t(170,260,\\frz2)",
      "\\t(260,420,\\frz0\\fscx100\\fscy100)",
    ].join("")}}`;
  }
  if (animation === "typewriter") {
    return `{${[...base, `\\pos(${x},${targetY})`, "\\alpha&HFF&", "\\t(0,260,\\alpha&H00&)"].join("")}}`;
  }
  if (animation === "flicker") {
    return `{${[
      ...base,
      `\\pos(${x},${targetY})`,
      "\\alpha&HFF&",
      "\\t(0,70,\\alpha&H00&)",
      "\\t(70,130,\\alpha&H88&)",
      "\\t(130,220,\\alpha&H00&)",
      "\\t(220,300,\\alpha&H44&)",
      "\\t(300,420,\\alpha&H00&)",
    ].join("")}}`;
  }
  if (animation === "elastic") {
    return `{${[
      ...base,
      `\\pos(${x},${targetY})`,
      "\\alpha&HCC&",
      "\\fscx55",
      "\\fscy128",
      "\\t(0,210,\\alpha&H00&\\fscx118\\fscy88)",
      "\\t(210,390,\\fscx94\\fscy106)",
      "\\t(390,560,\\fscx100\\fscy100)",
    ].join("")}}`;
  }
  return `{${[
    ...base,
    `\\pos(${x},${targetY})`,
    "\\fscx70",
    "\\fscy70",
    "\\t(0,150,\\fscx112\\fscy112)",
    "\\t(150,280,\\fscx100\\fscy100)",
  ].join("")}}`;
};

const buildAssSubtitleFile = async (project, clip, clipTranscription, logoWindows = [], subtitleAboveSquare = false, hideInLogoWindow = false) => {
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const renderStyle = resolveSubtitleRenderStyle(subtitleStyle);
  const clipLayout = normalizeClipLayout(clip);
  const font = await resolveFontDescriptor(renderStyle.fontFamily, renderStyle.fontWeight);
  const outline = renderStyle.outline;
  const shadowOffset = Math.round(renderStyle.shadowDistance);
  const shadowAlpha = Math.round((1 - renderStyle.shadowOpacity) * 255);
  const primary = hexToAssColor(renderStyle.textColor, 0);
  const outlineColor = hexToAssColor(renderStyle.strokeColor, 0);
  const shadowColor = hexToAssColor(renderStyle.shadowColor, shadowAlpha);
  const y = clipLayout.subtitlePosition.y ?? subtitleYForStage(clip.stage, subtitleStyle);
  const x = clipLayout.subtitlePosition.x ?? 540;
  const fontSize = renderStyle.fontSize;
  const fontWeight = -1;
  const shadowOutline = renderStyle.shadowEnabled === false
    ? 0
    : clamp(outline > 0 ? outline + 3 : renderStyle.shadowBlur / 4, 0, 10);
  // BOX mode (TikTok native caption look): the main style draws ONE box behind the
  // line (BorderStyle=4, fill=BackColour, padding=Outline — verified supported by the
  // bundled libass). Shadow/outline layers are SKIPPED (they would draw a second,
  // offset box) and \blur stays 0 so the box edges remain crisp.
  const boxOn = renderStyle.boxEnabled === true;
  const boxColor = hexToAssColor(renderStyle.boxColor, Math.round((1 - renderStyle.boxOpacity) * 255));
  const boxPadding = Math.round(renderStyle.boxPadding);
  const keywordSet = buildSubtitleKeywordSet(clipTranscription, renderStyle);
  // Override builders. `preset` overrides the animation (null = the style's). Returns
  // the main + shadow override strings for a given Y. While the Klimax logo is on
  // screen (auto mode) the caption is lifted to the TOP so it's never over the logo.
  const ovFor = (cy, preset) => {
    const st = preset ? { ...renderStyle, animationPreset: preset } : renderStyle;
    return {
      main: subtitleAnimationOverride(st, x, cy, 0, { blur: 0 }),
      shadow: subtitleAnimationOverride(st, x, cy, 0, { yOffset: shadowOffset, blur: renderStyle.shadowBlur }),
    };
  };
  const SUBTITLE_LOGO_TOP_Y = 280; // very top band, well clear of the centred logo card
  // Just above the centred square b-roll (square image top ≈ BROLL_SQUARE_Y = 1080).
  const SUBTITLE_ABOVE_SQUARE_Y = 990;
  const baseY = subtitleAboveSquare ? SUBTITLE_ABOVE_SQUARE_Y : y;
  const baseAnim = ovFor(baseY);
  const baseStill = ovFor(baseY, "none");
  const topAnim = logoWindows.length ? ovFor(SUBTITLE_LOGO_TOP_Y) : baseAnim;
  const topStill = logoWindows.length ? ovFor(SUBTITLE_LOGO_TOP_Y, "none") : baseStill;
  const inLogoWindow = (cue) =>
    logoWindows.some((w) => safeNumber(cue.start, 0) < w.end && safeNumber(cue.end, 0) > w.start);
  const cues = clipTranscription?.cues?.length
    ? clipTranscription.cues
    : [{ start: 0, end: 2, text: stripCaptionPunctuation(clip.subtitle || "Sous titres automatiques") }];
  // KARAOKE (active-word highlight, CapCut style): the spoken word is recolored in
  // real time. To recolor mid-caption, ASS needs one Dialogue event per word window.
  // CRUCIAL: ALL THREE layers (shadow, outline, main) are split on the SAME word
  // boundaries, and the entry animation plays ONLY on the first segment of EACH layer.
  // That keeps shadow/outline/main perfectly in lock-step — otherwise the shadow ran
  // its animation across the whole cue while the text snapped to place per word (the
  // "shadow lags the text" bug).
  const transcriptWords = Array.isArray(clipTranscription?.words) ? clipTranscription.words : [];
  const karaokeOn = renderStyle.activeWordEnabled !== false;
  const events = cues.flatMap((cue) => {
    if (hideInLogoWindow && inLogoWindow(cue)) return []; // centred-logo variant
    const cueStart = safeNumber(cue.start, 0);
    const cueEnd = Math.max(cueStart + 0.05, safeNumber(cue.end, cueStart + 0.05));
    const cueText = renderStyle.uppercase === true ? String(cue.text || "").toUpperCase() : String(cue.text || "");
    const shadowText = assEscapePlain(cueText);
    const inLogo = inLogoWindow(cue);
    const anim = inLogo ? topAnim : baseAnim;
    const still = inLogo ? topStill : baseStill;
    const tokens = cueText.split(/\s+/).filter(Boolean);

    // Build word segments (single segment = whole cue when karaoke is off / 1 word).
    let segs;
    if (karaokeOn && tokens.length >= 2) {
      const cueWords = transcriptWords.filter((w) => safeNumber(w.start, -1) < cueEnd && safeNumber(w.end, -1) > cueStart);
      const boundaries = [cueStart];
      if (cueWords.length === tokens.length) {
        for (let k = 1; k < tokens.length; k += 1) boundaries.push(clamp(safeNumber(cueWords[k].start, cueStart), cueStart, cueEnd));
      } else {
        const step = (cueEnd - cueStart) / tokens.length;
        for (let k = 1; k < tokens.length; k += 1) boundaries.push(cueStart + k * step);
      }
      boundaries.push(cueEnd);
      segs = [];
      for (let k = 0; k < tokens.length; k += 1) {
        const s = boundaries[k], e = boundaries[k + 1];
        if (segs.length && e - s < 0.03) { segs[segs.length - 1].end = e; continue; } // merge ultra-fast word
        segs.push({ start: s, end: e, idx: k });
      }
    } else {
      segs = [{ start: cueStart, end: cueEnd, idx: null }];
    }

    const out = [];
    for (let s = 0; s < segs.length; s += 1) {
      const st = assTime(segs[s].start);
      const en = assTime(segs[s].end);
      const ov = s === 0 ? anim : still; // entry animation on the first window only
      if (!boxOn) {
        out.push(`Dialogue: 0,${st},${en},KlimaxShadow,,0,0,0,,${ov.shadow}${shadowText}`);
        if (outline > 0) out.push(`Dialogue: 1,${st},${en},KlimaxOutline,,0,0,0,,${ov.main}${shadowText}`);
      }
      out.push(`Dialogue: 2,${st},${en},Klimax,,0,0,0,,${ov.main}${formatAssSubtitleText(cueText, keywordSet, renderStyle, segs[s].idx)}`);
    }
    return out;
  });

  const ass = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: KlimaxShadow,${font.assName},${fontSize},${shadowColor},${shadowColor},${shadowColor},${shadowColor},${fontWeight},0,0,0,${renderStyle.fontScaleX},100,0,0,1,${shadowOutline},0,5,0,0,0,1`,
    `Style: KlimaxOutline,${font.assName},${fontSize},${outlineColor},${outlineColor},${outlineColor},${outlineColor},${fontWeight},0,0,0,${renderStyle.fontScaleX},100,0,0,1,${outline},0,5,0,0,0,1`,
    boxOn
      ? `Style: Klimax,${font.assName},${fontSize},${primary},${primary},${boxColor},${boxColor},${fontWeight},0,0,0,${renderStyle.fontScaleX},100,0,0,4,${boxPadding},0,5,0,0,0,1`
      : `Style: Klimax,${font.assName},${fontSize},${primary},${primary},${primary},${shadowColor},${fontWeight},0,0,0,${renderStyle.fontScaleX},100,0,0,1,0,0,5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
  ].join("\n");

  return writeTextFile(project.id, `${clip.id}-subtitles`, ass, "ass");
};

const createHookBubbleOverlay = async (project, clip) => {
  const hookStyle = project.settings?.hookStyle || defaultHookStyle;
  const clipLayout = normalizeClipLayout(clip);
  // Hook font is FIXED to a clean sans (matches the reference image), independent of
  // the subtitle font. Only the hook text options (color, size, position) are kept.
  const font = await resolveFontDescriptor("Helvetica", 600);
  const outputPath = path.join(tempRoot, `${project.id}-${clip.id}-hook.png`);
  // Shrink the WHOLE hook (bubble + text) uniformly — it was taking too much space.
  // One factor scales font, box bounds, padding and radius together so proportions
  // stay intact. Applies to both manual and automatic mode (shared render path).
  // Tune this single value up/down to make the hook bigger/smaller.
  const HOOK_SCALE = 0.8;
  const configPath = await writeJsonFile(project.id, `${clip.id}-hook-style`, {
    outputPath,
    text: sanitizeHookText(clip.hookText || project.settings?.hookText || "Tu connais cette sensation"),
    fontSize: Math.round((hookStyle.fontSize || 53) * HOOK_SCALE),
    fontPath: font.fontPath,
    bubbleColor: hookStyle.bubbleColor || "#ffffff",
    textColor: hookStyle.textColor || "#000000",
    centerX: clipLayout.hookPosition.x,
    centerY: clipLayout.hookPosition.y,
    // The bubble auto-stretches with the text and wraps once it hits maxWidth.
    maxWidth: Math.round(clipLayout.hookSize.width * HOOK_SCALE),
    minHeight: Math.round(clipLayout.hookSize.height * HOOK_SCALE),
    radius: Math.round(64 * HOOK_SCALE),
    paddingX: Math.round(56 * HOOK_SCALE),
    paddingY: Math.round(30 * HOOK_SCALE),
  });

  await runProcess(pythonBin, [hookBubbleScriptPath, configPath]);
  return outputPath;
};

// For a dual-speaker (split-screen) clip, decide WHEN the whole clip hard-cuts
// to the next one. We cut the instant the MAIN speaker stops talking — the end
// of the last transcribed word plus a short breath — instead of running to the
// full source length. Without this the second-speaker band keeps moving after
// Person 1 is done and the clip only ends when the (often longer) added video
// runs out. Falls back to the full duration when there are no word timings.
const DUAL_SPEAKER_TAIL_SECONDS = 0.3;
const dualSpeakerCutDuration = (clipTranscription, fullDuration) => {
  const words = clipTranscription?.words || [];
  let lastWordEnd = 0;
  for (const word of words) {
    lastWordEnd = Math.max(lastWordEnd, safeNumber(word.end, 0));
  }
  if (lastWordEnd <= 0) return fullDuration;
  const candidate = lastWordEnd + DUAL_SPEAKER_TAIL_SECONDS;
  return fullDuration > 0 ? Math.min(candidate, fullDuration) : candidate;
};

// B-roll timeline: which b-rolls play WHEN, per clip. The brain (LLM) maps each
// b-roll to a transcript cue; here we turn those into segments that each run from
// their trigger until the next b-roll (capped), take a RANDOM window of the source
// (anti-shadowban) and get trimmed to fit. Returns { [clipId]: [segment...] }.
const BROLL_MAX_SEC = 3; // a b-roll runs until the next one, but never longer than this
const BROLL_MIN_SEC = 2;
const BROLL_LAST_SEC = 2.5; // a trailing video b-roll (no next) lasts this long
const BROLL_IMAGE_LAST_SEC = 2; // a trailing image (no next) lasts 2 s
const BROLL_FADEOUT_MIN_SEC = 1; // below this, no fade-out (just cut)
const clone = (value) => JSON.parse(JSON.stringify(value));
const brollMomentsCache = new Map(); // (cues+bank) -> LLM moments, shared across variants

// Resolve a b-roll to the EXACT time its trigger word is spoken (word-level), so it
// lands ON the word instead of the coarser cue. Picks the matching word closest to
// the cue the brain chose; falls back to the cue start.
const normalizeWord = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const resolveTriggerTime = (words, trigger, cueStart) => {
  const toks = String(trigger || "").split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!toks.length || !Array.isArray(words) || !words.length) return cueStart;
  let best = null;
  let bestDist = Infinity;
  for (const w of words) {
    if (normalizeWord(w.word) !== toks[0]) continue;
    const t = safeNumber(w.start, 0);
    const dist = Math.abs(t - cueStart);
    if (dist < bestDist) { bestDist = dist; best = t; }
  }
  return best != null ? best : cueStart;
};
// Fixed square zone for "square" placement: a centred square below the text zone.
// Kept a touch smaller (620) so the subtitle band sits comfortably just above it.
const BROLL_SQUARE_SIZE = 620;
const BROLL_SQUARE_Y = 1080;
// Per-occurrence square-b-roll size variation: ±3% so the layout isn't pixel-identical
// every time, WITHOUT shifting the subject (the cover-fit crop stays centred and the
// overlay x/y are recomputed from the jittered size). Tunable.
const BROLL_SQUARE_SCALE_JITTER = 0.03;
// Small string-seeded PRNG (mulberry32) so per-render layout jitter is reproducible
// from a logged seed — re-render with KLIMAX_RENDER_SEED=<seed> to reproduce a frame.
const seededRng = (seedStr) => {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i += 1) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// Theme matching for b-rolls: two clips are the SAME subject if they share ANY
// meaningful word (accent-folded; generic filler dropped). Order-insensitive, so
// "exercice périné kegel" and "kegel périné exercice 2" match on {perine, kegel}.
// Lets the engine rotate through ALL of a subject's clips across a batch (kegel-1,
// kegel-2, …) instead of always picking the same one.
const BROLL_STOPWORDS = new Set(["exercice", "exercices", "sport", "difficile", "forte", "devant", "avec", "pour", "dans", "les", "des", "une", "qui", "met", "pression", "mettre", "plus", "tres", "bon", "lit", "the", "video", "mp4", "mov"]);
const foldAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const brollTokens = (asset) => {
  const raw = foldAccents(String(asset.note || asset.title || "").toLowerCase()).replace(/[^a-z0-9 ]+/g, " ");
  return new Set(raw.split(/\s+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !BROLL_STOPWORDS.has(t)));
};
const brollSameTheme = (a, b) => {
  const ta = brollTokens(a);
  for (const t of brollTokens(b)) if (ta.has(t)) return true;
  return false;
};
const buildBrollPlan = async (db, project, clipMeta) => {
  const plan = {};
  if (project.settings?.brollEnabled === false) return plan;
  const brolls = db.assets.filter(
    (a) => (a.category === "broll" || a.category === "image") && !a.broken && a.filePath && fsSync.existsSync(a.filePath) && (a.note || a.title)
  );
  if (!brolls.length) return plan;

  // Each b-roll has a VERSION ("square" = cut 1:1 for the square zone, else
  // "fullscreen" = full 9:16). brollStyle decides which versions are eligible and
  // how they're shown:
  //   square     -> the square zone. ALL b-rolls allowed (9:16 ones cover-cropped).
  //   fullscreen -> 9:16 ONLY (a 1:1 square b-roll is never blown up fullscreen).
  //   alternate  -> both: square versions stay square; 9:16 versions alternate
  //                 between fullscreen and square (cover) for variety. A given
  //                 source is used once (no-repeat), so it's never shown both ways.
  const brollStyle = ["square", "fullscreen", "alternate"].includes(project.settings?.brollStyle)
    ? project.settings.brollStyle
    : "alternate";
  const variantOf = (b) => (b.placement === "square" ? "square" : "fullscreen");
  let pool = brollStyle === "fullscreen"
    ? brolls.filter((b) => variantOf(b) === "fullscreen")
    : brolls;
  if (!pool.length) return plan;

  const { pickBrollMomentsForClip } = await import("./brollIntelligence.mjs");
  // Probe ALL b-roll durations in PARALLEL (was sequential — up to ~40 ffprobe calls
  // back-to-back on a cold cache). probeMediaDurationSec is cached + pure → identical
  // values, just gathered faster.
  const durById = {};
  const brollDurs = await Promise.all(pool.map((b) => probeMediaDurationSec(b.filePath)));
  pool.forEach((b, i) => { durById[b.id] = brollDurs[i]; });
  // Drop VIDEO b-rolls whose probed duration is ~0: they're broken/empty and would
  // make ffmpeg HANG when looped into a segment (root cause of the stalled auto batch
  // — the "src 0.0" entries in the b-roll plan log). Images legitimately have no
  // duration, so they're kept.
  const isVideoBroll = (b) => String(b.mimeType || "").startsWith("video") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(b.filePath || "");
  pool = pool.filter((b) => !isVideoBroll(b) || safeNumber(durById[b.id], 0) > 0.15);
  if (!pool.length) return plan;
  const brollPayload = pool.map((b) => ({ id: b.id, note: b.note, title: b.title }));
  // Never reuse the same b-roll in the whole video — recurring themes must use a
  // different variant (the LLM is told this too; we enforce it as a safety net).
  const usedBrollIds = new Set();
  // ROTATE through all of a subject's b-rolls across the batch (variant 0 → kegel-1,
  // variant 1 → kegel-2, …) instead of always picking the same file. `brollRotation`
  // = the variant index (set per render); siblings are matched by shared theme below.
  const rotation = Math.max(0, Math.floor(safeNumber(project.settings?.brollRotation, 0)));

  for (const { clip, transcription, duration } of clipMeta) {
    if (clip.stage !== "reply" || !duration || duration < 1.5) continue;
    if (clip.imageId) continue; // a manual image overlay still owns the whole clip
    const cues = Array.isArray(transcription?.cues) ? transcription.cues : [];
    if (!cues.length) continue;

    // The LLM moment pick is deterministic in (transcript, bank): cache it so an
    // N-variant auto batch makes ONE Claude call per clip, not N. The per-variant
    // randomness (source slice, placement) is applied below, after the cache.
    const momentsKey = JSON.stringify({ c: cues.map((c) => c.text), b: brollPayload.map((b) => `${b.id}:${b.note}`) });
    let moments = [];
    if (brollMomentsCache.has(momentsKey)) {
      moments = clone(brollMomentsCache.get(momentsKey));
    } else {
      try {
        moments = await pickBrollMomentsForClip({ clip: { id: clip.id, cues }, brolls: brollPayload });
        brollMomentsCache.set(momentsKey, clone(moments));
      } catch (error) {
        console.warn(`[broll] moment pick failed for ${clip.id}:`, error.message);
        moments = [];
      }
    }
    // Resolve each b-roll to its trigger WORD time (so it lands on the word, not
    // late on the cue), keep distinct b-rolls only, and enforce >= BROLL_MIN_SEC
    // between consecutive starts so segments never overlap.
    const words = Array.isArray(transcription?.words) ? transcription.words : [];
    const kept = [];
    let lastStart = -Infinity;
    for (const m of moments) {
      // Rotate within the picked b-roll's THEME: successive variants use DIFFERENT
      // files of the same subject (kegel-1, kegel-2, …), never the same one twice in a
      // video, spread across the batch via `rotation`. Falls back to the LLM's pick.
      const picked = pool.find((b) => b.id === m.brollId);
      let brollId = m.brollId;
      if (picked) {
        const siblings = pool.filter((b) => brollSameTheme(b, picked) && !usedBrollIds.has(b.id));
        if (siblings.length) brollId = siblings[(rotation + m.cueIndex) % siblings.length].id;
      }
      if (usedBrollIds.has(brollId)) continue;
      const cueStart = safeNumber(cues[m.cueIndex]?.start, 0);
      const t = resolveTriggerTime(words, m.trigger, cueStart);
      if (t - lastStart < BROLL_MIN_SEC) continue;
      usedBrollIds.add(brollId);
      lastStart = t;
      kept.push({ ...m, brollId, startSec: t });
    }
    moments = kept;
    if (!moments.length) continue;

    const segs = [];
    for (let i = 0; i < moments.length; i += 1) {
      const broll = pool.find((b) => b.id === moments[i].brollId);
      if (!broll) continue;
      const isVideo = String(broll.mimeType || "").startsWith("video") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(broll.filePath);
      const start = clamp(safeNumber(moments[i].startSec, 0), 0, Math.max(0, duration - 0.4));
      // Each b-roll runs until the NEXT one; a trailing one (no next) lasts its
      // default — 2 s for an image, 2.5 s for a video — capped at BROLL_MAX_SEC.
      const rawNext = i + 1 < moments.length
        ? clamp(safeNumber(moments[i + 1].startSec, duration), 0, duration)
        : start + (isVideo ? BROLL_LAST_SEC : BROLL_IMAGE_LAST_SEC);
      let end = Math.min(rawNext, start + BROLL_MAX_SEC, duration - 0.05);
      if (end - start < BROLL_MIN_SEC) end = Math.min(start + BROLL_MIN_SEC, duration - 0.05);
      const segDur = end - start;
      if (segDur < 0.4) continue;
      const brollDur = safeNumber(durById[broll.id], 0);
      const loop = isVideo && brollDur > 0 && brollDur < segDur + 0.05;
      const sourceStart = isVideo && brollDur > segDur + 0.1 ? randomBetween(0, brollDur - segDur - 0.05) : 0;
      // square -> always square; fullscreen -> always fullscreen; alternate -> a
      // "les deux" shows each b-roll in its NATIVE form: a 9:16 version stays
      // fullscreen, a square version stays square (no source is reused, so a given
      // 9:16 is never shown both ways).
      const placement = brollStyle === "square" ? "square"
        : brollStyle === "fullscreen" ? "fullscreen"
        : variantOf(broll);
      segs.push({ brollId: broll.id, path: broll.filePath, start, end, segDur, sourceStart, isVideo, loop, placement });
    }
    if (segs.length) plan[clip.id] = segs;
    console.log(`[broll] clip ${clip.id}: ${moments.length} moments -> ${segs.length} segments`, segs.map((s) => `${s.brollId.slice(-6)}@${s.start.toFixed(1)}-${s.end.toFixed(1)}s${s.isVideo ? `(src ${s.sourceStart.toFixed(1)})` : ""}`).join(" | "));
  }
  return plan;
};

// Keep the renders/ folder bounded so it can never fill the disk again (the disk-full
// bug corrupted renders). Keep the NEWEST files up to a count AND a total-size cap;
// delete the rest. Override via env. Safe: renders are regenerable from the project.
const MAX_RENDER_FILES = clamp(Math.round(safeNumber(process.env.KLIMAX_MAX_RENDER_FILES, 200)), 20, 2000);
const MAX_RENDER_BYTES = clamp(safeNumber(process.env.KLIMAX_MAX_RENDER_GB, 5), 1, 100) * 1024 * 1024 * 1024;
let prunePending = false;
const pruneRenders = async () => {
  if (prunePending) return;
  prunePending = true;
  try {
    const names = (await fs.readdir(renderRoot).catch(() => [])).filter((n) => n.endsWith(".mp4"));
    const stats = [];
    for (const n of names) {
      try { const st = await fs.stat(path.join(renderRoot, n)); stats.push({ n, m: st.mtimeMs, s: st.size }); } catch { /* skip */ }
    }
    stats.sort((a, b) => b.m - a.m); // newest first
    let keptCount = 0, keptBytes = 0, removed = 0;
    for (const f of stats) {
      if (keptCount < MAX_RENDER_FILES && keptBytes + f.s <= MAX_RENDER_BYTES) { keptCount += 1; keptBytes += f.s; continue; }
      try { await fs.unlink(path.join(renderRoot, f.n)); removed += 1; } catch { /* skip */ }
    }
    if (removed) console.log(`[renders] auto-pruned ${removed} old render(s) — keeping newest ${keptCount} (~${(keptBytes / 1e9).toFixed(1)}GB)`);
  } catch { /* never block a render on prune */ } finally {
    prunePending = false;
  }
};

const renderProject = async (db, project, sourceGroup) => {
  const { getSfxPath, listAutoSfxKeys, RISER_KEY } = await import("./sfx.mjs");
  if (!ffmpegPath) throw new Error("FFmpeg local indisponible.");
  // person2 is OPTIONAL — a "rush simple" (solo) project has person1 only.
  if (!sourceGroup?.person1?.filePath) {
    throw new Error("Ce projet n'a pas de vidéo source.");
  }
  // Transcription clips now live in a per-project file (db.json keeps a stub). Make sure
  // the full clips are present before rendering — load the file, else rebuild from the
  // per-asset transcripts (no Whisper). Covers resumed auto variants (stub from db).
  if (!(Array.isArray(project.transcription?.clips) && project.transcription.clips.length)) {
    await hydrateTranscript(db, project, sourceGroup);
  }

  await ensureDir(renderRoot);
  await ensureDir(tempRoot);
  await ensureDir(fontRoot);
  const outputPath = path.join(renderRoot, `${project.id}-${Date.now()}.mp4`);

  const clipsToRender = project.clips.filter((clip) => sourceAssetForClip(sourceGroup, clip, db.assets));
  if (!clipsToRender.length) {
    throw new Error("Ce projet n'a aucun segment exploitable.");
  }

  // -loglevel error (not warning): glitchy-but-usable b-rolls emit a CONTINUOUS flood
  // of "Invalid NAL unit size" warnings during decode — at warning level that's GBs of
  // stderr per render. error level keeps real failures, drops the decode-warning spam.
  const inputArgs = ["-y", "-hide_banner", "-nostats", "-loglevel", "error"];
  const filterChains = [];
  const concatPieces = [];
  // Audio of each camera-flash transition (its own whoosh), to fold into the mix.
  const flashAudioTags = [];
  let inputIndex = 0;
  let totalDuration = 0;

  // Lightweight phase profiler (KLIMAX_PERF=1). Measures where render time goes.
  const _perf = process.env.KLIMAX_PERF === "1";
  let _last = Date.now();
  const _mark = (label) => { if (!_perf) return; const now = Date.now(); console.log(`[perf] ${label}: ${now - _last}ms`); _last = now; };

  // Per-render layout seed (logged) — drives the small b-roll size jitter and is
  // reproducible: set KLIMAX_RENDER_SEED=<seed> to re-render the exact same layout.
  const renderSeed = process.env.KLIMAX_RENDER_SEED || `${project.id}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
  const renderRng = seededRng(renderSeed);
  console.log(`[layout] render seed=${renderSeed}`);

  // Voice loudness normalisation (EBU R128, TWO-PASS): measure each source's real
  // loudness first, then normalise every clip to the same target — so a quietly
  // recorded clip (e.g. personne 2) is brought up to match the louder one.
  // Measure all DISTINCT sources in PARALLEL (was sequential ~7s each). measureLoudness
  // is a pure, cached function so concurrent calls give identical results — output is
  // byte-for-byte unchanged, just measured faster.
  const loudnessByPath = new Map();
  const distinctLoudnessPaths = [...new Set(
    clipsToRender.map((c) => sourceAssetForClip(sourceGroup, c, db.assets)?.filePath).filter(Boolean)
  )];
  const measuredLoudness = await Promise.all(distinctLoudnessPaths.map((p) => measureLoudness(p)));
  distinctLoudnessPaths.forEach((p, i) => loudnessByPath.set(p, measuredLoudness[i]));
  _mark("loudness");

  // Per-clip cut duration + transcription, in play order. Drives the whole-video
  // SFX plan (computed ONCE so the 2-3 effects span the entire video, not per clip)
  // and the cross-clip transition offsets below.
  const clipMeta = clipsToRender.map((clip) => {
    const transcription = project.transcription?.clips?.find((entry) => entry.clipId === clip.id);
    const full = safeNumber(transcription?.duration, 0);
    const added = clip.dualSpeakerEnabled ? db.assets.find((a) => a.id === clip.dualSpeakerSource) : null;
    const isDual = Boolean(clip.dualSpeakerEnabled && added?.filePath);
    const duration = isDual ? dualSpeakerCutDuration(transcription, full) : full;
    return { clip, transcription, duration };
  });

  // The Klimax logo card is WORD-TRIGGERED: it pops only when the brand word is spoken —
  // "klimax" OR "climax" (+ klimaks/climaks variants; see logoTriggers in logoMoments.mjs).
  // Clips that never say it get no card, on purpose (no forced fallback).
  const videoSfxPlan = project.settings?.autoSfxEnabled !== false
    ? buildVideoSfxPlan(clipMeta, listAutoSfxKeys())
    : [];

  // Moment-level b-roll timeline (which b-rolls play when, per clip).
  const brollPlan = await buildBrollPlan(db, project, clipMeta);
  _mark("brollPlan");
  const brollShutterMode = project.settings?.brollShutterMode === true;
  const brollAnimIn = ["fade", "none"].includes(project.settings?.brollAnimIn) ? project.settings.brollAnimIn : "fade";
  const brollAnimOut = ["fade", "none"].includes(project.settings?.brollAnimOut) ? project.settings.brollAnimOut : "fade";
  const brollZoom = ["none", "in", "out"].includes(project.settings?.brollZoom) ? project.settings.brollZoom : "in";
  // Smooth Ken-Burns zoom on a b-roll (scale-over-time + centre crop, no jitter).
  const brollZoomFx = (W, H, segDur) => {
    if (brollZoom === "none") return "";
    // Ken-Burns via ZOOMPAN (fixed W×H output). The old approach animated the scale's
    // OUTPUT size per frame (scale=…:eval=frame), which re-inits the ffmpeg scaler on
    // EVERY frame → ~18x slower renders. zoompan keeps a constant output size and zooms
    // internally, so it's as fast as a static b-roll. Centred 7% travel over the segment.
    const frames = Math.max(1, Math.round(Math.max(0.2, segDur) * 30));
    const per = (0.07 / frames).toFixed(6);
    const z = brollZoom === "out"
      ? `max(1.07-${per}*on,1.0)`
      : `min(1.0+${per}*on,1.07)`;
    return `,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30`;
  };
  const hasShutter = fsSync.existsSync(shutterSoundPath);
  const hasSquareAssets = fsSync.existsSync(brollSquareMaskPath) && fsSync.existsSync(brollSquareShadowPath);
  // Mirror effect: flips the SOURCE footage of every clip horizontally (the whole
  // podcast is mirrored consistently, people keep their relative positions).
  // Overlays (hook, subtitles, b-rolls, logo) are added AFTER, so text stays readable.
  const mirrorFx = project.settings?.mirrorEnabled === true ? "hflip," : "";

  for (let clipIndex = 0; clipIndex < clipsToRender.length; clipIndex += 1) {
    const clip = clipsToRender[clipIndex];
    console.log(`[layout] clip ${clipIndex} (${clip.stage}) subtitleY=${clip.subtitlePosition?.y ?? "default"}`); // logged for repro
    const sourceAsset = sourceAssetForClip(sourceGroup, clip, db.assets);
    const clipTranscription = project.transcription?.clips?.find((entry) => entry.clipId === clip.id);
    const fullClipDuration = safeNumber(clipTranscription?.duration, 0);
    // The added speaker source (if dual-speaker is on). Resolved once and reused
    // for both the cut-duration decision and the split-screen filter below.
    const addedAsset = clip.dualSpeakerEnabled
      ? db.assets.find((a) => a.id === clip.dualSpeakerSource)
      : null;
    const isDualSpeaker = Boolean(clip.dualSpeakerEnabled && addedAsset?.filePath);
    // Dual-speaker clips cut when the main speaker stops talking; everyone else
    // runs the full source length. This single value drives the band/audio trim,
    // the auto-zoom timeline, totalDuration and the cross-clip transition offsets.
    const clipDuration = isDualSpeaker
      ? dualSpeakerCutDuration(clipTranscription, fullClipDuration)
      : fullClipDuration;
    const clipLayout = normalizeClipLayout(clip);
    const zoomEvents = buildAutoZoomEvents(clip, clipDuration, project.settings || {});
    totalDuration += clipDuration;

    inputArgs.push("-i", sourceAsset.filePath);
    const sourceInput = inputIndex;
    inputIndex += 1;

    let currentVideo = `vbase${clipIndex}`;
    // Dual-Speaker Split-Screen: when enabled and the added source resolves to a
    // registered asset, the base 1080x1920 frame is built by stacking two bands
    // (the main clip + the added speaker video) instead of the standard
    // scale/crop. Everything downstream (zoom, overlays, subtitles, audio)
    // stays identical because we land the result in the same `vbase` label.
    if (isDualSpeaker) {
      const ratio = clamp(safeNumber(clip.dualSpeakerSplitRatio, 0.5), 0.2, 0.8);
      const TOP = Math.round(1920 * ratio);
      const BOTTOM = 1920 - TOP;

      // Loop the second-speaker clip so it fills the main clip's duration without
      // freezing when it's shorter; the bandTrim below cuts it to clipDuration so
      // it never runs longer than the main speaker. It only ever "accompanies".
      // SAFETY: -t bounds the looped input even when clipDuration is unknown
      // (missing transcription) — an unbounded -stream_loop -1 with no trim would
      // make ffmpeg encode forever (vstack never EOFs).
      const addedBound = clipDuration > 0 ? clipDuration + 0.5 : 60;
      inputArgs.push("-stream_loop", "-1", "-t", addedBound.toFixed(3), "-i", addedAsset.filePath);
      const addedIdx = inputIndex;
      inputIndex += 1;

      const mainCropY = clamp(safeNumber(clip.dualSpeakerMainCropY, 0), -480, 480);
      const addedCropY = clamp(safeNumber(clip.dualSpeakerAddedCropY, 0), -480, 480);
      // Horizontal framing + extra zoom per band (auto-ready: same numeric ranges
      // a face detector will fill later). Zoom > 1 gives the crop room to shift.
      const mainCropX = clamp(safeNumber(clip.dualSpeakerMainCropX, 0), -480, 480);
      const addedCropX = clamp(safeNumber(clip.dualSpeakerAddedCropX, 0), -480, 480);
      const mainZoom = clamp(safeNumber(clip.dualSpeakerMainZoom, 100), 100, 220) / 100;
      const addedZoom = clamp(safeNumber(clip.dualSpeakerAddedZoom, 100), 100, 220) / 100;

      // Decide which source feeds which band. The ADDED source goes wherever
      // `dualSpeakerPosition` points; the MAIN clip fills the other band.
      const addedOnTop = clip.dualSpeakerPosition === "top";
      const topSrcIdx = addedOnTop ? addedIdx : sourceInput;
      const topCropY = addedOnTop ? addedCropY : mainCropY;
      const topCropX = addedOnTop ? addedCropX : mainCropX;
      const topZoom = addedOnTop ? addedZoom : mainZoom;
      const bottomSrcIdx = addedOnTop ? sourceInput : addedIdx;
      const bottomCropY = addedOnTop ? mainCropY : addedCropY;
      const bottomCropX = addedOnTop ? mainCropX : addedCropX;
      const bottomZoom = addedOnTop ? mainZoom : addedZoom;

      const bandTop = `bandTop${clipIndex}`;
      const bandBottom = `bandBottom${clipIndex}`;
      // Cut both bands at clipDuration (= the end of the main speaker's speech,
      // see dualSpeakerCutDuration) so they end TOGETHER and the whole clip
      // hard-cuts to the next one the instant Person 1 stops talking. Without
      // this, vstack runs to the longer source: the second-speaker band keeps
      // moving while Person 1 has already finished. (No-op when clipDuration is
      // unknown — falls back to the raw vstack behaviour.)
      const bandTrim = clipDuration > 0
        ? `,trim=0:${clipDuration.toFixed(3)},setpts=PTS-STARTPTS`
        : "";
      // Pan as a FRACTION of the overscan (0.5 = centered), identical to the
      // preview's bandPanFraction. (in_w-1080)*f and (in_h-band)*f always land in
      // [0, overscan], so the crop can never fall off the scaled source → no black
      // bars; and because the same fraction is held as the scale (zoom) grows, the
      // zoom stays centered on the chosen point instead of drifting.
      const panFrac = (crop) => clamp(0.5 + crop / 960, 0, 1);
      const fxTop = panFrac(topCropX).toFixed(4);
      const fyTop = panFrac(topCropY).toFixed(4);
      const fxBottom = panFrac(bottomCropX).toFixed(4);
      const fyBottom = panFrac(bottomCropY).toFixed(4);
      filterChains.push(
        `[${topSrcIdx}:v]${mirrorFx}scale=${Math.round(1080 * topZoom)}:${Math.round(TOP * topZoom)}:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:${TOP}:(in_w-1080)*${fxTop}:(in_h-${TOP})*${fyTop},setsar=1${bandTrim}[${bandTop}]`
      );
      filterChains.push(
        `[${bottomSrcIdx}:v]${mirrorFx}scale=${Math.round(1080 * bottomZoom)}:${Math.round(BOTTOM * bottomZoom)}:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:${BOTTOM}:(in_w-1080)*${fxBottom}:(in_h-${BOTTOM})*${fyBottom},setsar=1${bandTrim}[${bandBottom}]`
      );
      filterChains.push(
        `[${bandTop}][${bandBottom}]vstack=inputs=2[clipStacked${clipIndex}]`
      );
      filterChains.push(
        `[clipStacked${clipIndex}]setsar=1${videoFilterChain(project.settings?.videoFilterKey)},format=rgba[${currentVideo}]`
      );
    } else {
      const baseScale = clamp(safeNumber(clipLayout.videoTransform.scale, 100), 40, 180) / 100;
      // mirrorFx (hflip) runs BEFORE the crop, so the speaker ends up on the OPPOSITE
      // side. The X offset is stored in the natural orientation, so negate it under
      // mirror to keep the same person centred (single source of truth for both auto
      // and manual). Y is unaffected by a horizontal flip.
      const baseOffsetX = (mirrorFx ? -1 : 1) * safeNumber(clipLayout.videoTransform.x, 0);
      const baseOffsetY = safeNumber(clipLayout.videoTransform.y, 0);
      filterChains.push(
        `[${sourceInput}:v]${mirrorFx}scale=1080*${baseScale}:1920*${baseScale}:force_original_aspect_ratio=increase,crop=1080:1920:min(max((in_w-1080)/2+${baseOffsetX}\\,0)\\,in_w-1080):min(max((in_h-1920)/2+${baseOffsetY}\\,0)\\,in_h-1920),setsar=1${videoFilterChain(project.settings?.videoFilterKey)},format=rgba[${currentVideo}]`
      );
    }
    const zoomedVideo = `vzoom${clipIndex}`;
    applyVideoZoomEvents(filterChains, currentVideo, zoomedVideo, zoomEvents);
    currentVideo = zoomedVideo;

    if (clip.stage === "intro") {
      // Per-rush VIRAL HOOK override: if the hook clip's source rush has a custom hook
      // set in the bank, it wins over the auto/AI/rotation hook (manual AND auto mode).
      const introAsset = sourceAssetForClip(sourceGroup, clip, db.assets);
      if (introAsset?.customHook) clip.hookText = introAsset.customHook;
      const hookOverlayPath = await createHookBubbleOverlay(project, clip);
      inputArgs.push("-i", hookOverlayPath);
      const hookInput = inputIndex;
      inputIndex += 1;
      const nextVideo = `vhook${clipIndex}`;
      filterChains.push(`[${hookInput}:v]format=rgba[hook${clipIndex}]`);
      filterChains.push(`[${currentVideo}][hook${clipIndex}]overlay=0:0[${nextVideo}]`);
      currentVideo = nextVideo;
    }

    // Klimax logo pop-up — started 1.5 s EARLY so the animation leads into the
    // spoken "klimax". In MANUAL mode it's composited here (before the b-roll, so
    // the b-roll sits ON TOP of it); in AUTO mode `applyLogoOverlay` is instead
    // called LAST (after b-roll AND subtitles) so the logo stays on top and nothing
    // ever covers it — see the subtitles step below.
    const logoApplies =
      (clip.stage === "reply" || clip.stage === "extra") &&
      project.settings?.klimaxLogoEnabled &&
      fsSync.existsSync(logoAnimationPath) &&
      Boolean(clipTranscription?.logoMoments?.length);
    const logoOnTop = project.settings?.autoMode === true && logoApplies;
    // Per-variant the logo either sits at its base position OR jumps to the exact centre
    // of the frame (same size, in front of everything). When centred, the subtitle is
    // dropped during the logo window so nothing sits behind/over it.
    const logoCenter = clip.logoCenter === true;
    // Logo audio ("garder le son"): collected while compositing each pop-up, then mixed
    // into the clip's audio below so the Klimax animation plays its sound.
    const logoAudioTags = [];
    // The on-screen time window of each logo pop-up (clip-local secs). Used to place
    // the overlay AND — in auto mode — to keep the b-roll OUT of these windows so
    // nothing ever shares the screen with the logo.
    const logoWindows = logoApplies
      ? clipTranscription.logoMoments.slice(0, 3).map((moment) => {
          const triggerTime = safeNumber(moment.start, 0);
          const start = Math.max(0, triggerTime - 1.5);
          const duration = Math.max(0.1, safeNumber(moment.end, triggerTime + 4.8) - triggerTime);
          // Clamp to the clip: an unbounded window (bad moment.end) would wrongly
          // evict every late b-roll segment from the "logo owns the screen" filter.
          const clipLen = safeNumber(clipTranscription?.duration, 0);
          const end = clipLen > 0 ? Math.min(start + duration, clipLen) : start + duration;
          return { start, end };
        }).filter((w) => w.end - w.start > 0.05)
      : [];
    // Overlays the Klimax pop-up onto `inLabel`; the last overlay writes to
    // `finalLabel` when given (so the auto path can land directly on `vsub`).
    const applyLogoOverlay = (inLabel, finalLabel = null) => {
      if (!logoApplies) return inLabel;
      let cur = inLabel;
      for (let logoIndex = 0; logoIndex < logoWindows.length; logoIndex += 1) {
        const win = logoWindows[logoIndex];
        inputArgs.push("-i", logoAnimationPath);
        const logoInput = inputIndex;
        inputIndex += 1;
        const shiftedLogo = `logo${clipIndex}_${logoIndex}`;
        const isLast = logoIndex === logoWindows.length - 1;
        const nextVideo = isLast && finalLabel ? finalLabel : `vlogo${clipIndex}_${logoIndex}`;
        // Centred variant → dead centre of the 1080x1920 frame; else the clip's base pos.
        const logoX = logoCenter ? 540 : clipLayout.logoPosition.x;
        const logoY = logoCenter ? 960 : clipLayout.logoPosition.y;
        const logoSize = clipLayout.logoSize;
        filterChains.push(`[${logoInput}:v]scale=${logoSize}:-1,format=rgba[${shiftedLogo}]`);
        filterChains.push(
          `[${shiftedLogo}]trim=duration=${(win.end - win.start).toFixed(3)},setpts=PTS-STARTPTS+${win.start.toFixed(3)}/TB[${shiftedLogo}_delayed]`
        );
        filterChains.push(
          `[${cur}][${shiftedLogo}_delayed]overlay=x=${Math.round(logoX)}-w/2:y=${Math.round(logoY)}-h/2:eof_action=pass[${nextVideo}]`
        );
        cur = nextVideo;
        // Keep the pop-up's own sound: delay this logo's audio to its window start and
        // collect it for the clip audio mix below. Bounded to the clip length.
        const logoDelayMs = Math.max(0, Math.round(win.start * 1000));
        const logoATag = `alogo${clipIndex}_${logoIndex}`;
        filterChains.push(
          `[${logoInput}:a]aresample=async=1,volume=${LOGO_VOLUME_DB}dB,adelay=${logoDelayMs}:all=1,atrim=0:${Math.max(0.1, clipDuration).toFixed(3)},asetpts=PTS-STARTPTS[${logoATag}]`
        );
        logoAudioTags.push(`[${logoATag}]`);
      }
      return cur;
    };
    if (logoApplies && !logoOnTop) currentVideo = applyLogoOverlay(currentVideo);

    // B-roll overlay. A manual image (clip.imageId) still owns the whole clip as a
    // centered overlay (legacy). Otherwise the moment-level plan composites several
    // FULL-SCREEN b-rolls in sequence — each its own window, a RANDOM slice of the
    // source, fade in/out — or hard cuts + a shutter click in shutter mode.
    const brollShutterTimes = [];
    // Auto mode: when a SQUARE b-roll sits in the fixed bottom zone, the subtitle is
    // pulled to JUST ABOVE the square (instead of its default band, which would land
    // on top of the square). Set while compositing the b-roll below.
    let subtitleAboveSquare = false;
    if (clip.stage === "reply" && project.settings?.brollEnabled !== false && clip.imageId) {
      const overlayAsset = db.assets.find((asset) => asset.id === clip.imageId && (asset.category === "image" || asset.category === "broll"));
      if (overlayAsset?.filePath) {
        inputArgs.push("-i", overlayAsset.filePath);
        const imageInput = inputIndex;
        inputIndex += 1;
        const transform = clip.imageTransform || { scale: 100, x: 0, y: 0 };
        const imageScale = clamp(safeNumber(transform.scale, 100), 20, 180) / 100;
        const imageX = safeNumber(transform.x, 0);
        const imageY = safeNumber(transform.y, 0);
        const nextVideo = `vimg${clipIndex}`;
        filterChains.push(`[${imageInput}:v]scale=iw*${imageScale}:ih*${imageScale}:flags=lanczos,format=rgba[img${clipIndex}]`);
        filterChains.push(
          `[${currentVideo}][img${clipIndex}]overlay=x=(W-w)/2+${imageX}:y=(H-h)/2+${imageY - 120}:enable='between(t,0,${Math.max(clipDuration, 0.1).toFixed(3)})'[${nextVideo}]`
        );
        currentVideo = nextVideo;
      }
    } else if (brollPlan[clip.id]?.length) {
      const FADE = 0.25;
      // AUTO mode: the Klimax logo owns its window alone — drop any b-roll segment
      // that overlaps a logo pop-up so nothing shares the screen with it (no b-roll
      // over OR under the logo during those ~seconds).
      const segments = logoOnTop && logoWindows.length
        ? brollPlan[clip.id].filter((seg) => !logoWindows.some((w) => seg.start < w.end && seg.end > w.start))
        : brollPlan[clip.id];
      // Auto mode only: a square segment means the subtitle should ride just above it.
      if (project.settings?.autoMode === true && segments.some((seg) => seg.placement === "square")) {
        subtitleAboveSquare = true;
      }
      for (let bi = 0; bi < segments.length; bi += 1) {
        const seg = segments[bi];
        // Input: a random window of a video (loop if shorter than the slot), or a held image.
        if (!seg.isVideo) {
          inputArgs.push("-loop", "1", "-t", seg.segDur.toFixed(3), "-i", seg.path);
        } else if (seg.loop) {
          inputArgs.push("-stream_loop", "-1", "-t", seg.segDur.toFixed(3), "-i", seg.path);
        } else {
          inputArgs.push("-ss", seg.sourceStart.toFixed(3), "-t", seg.segDur.toFixed(3), "-i", seg.path);
        }
        const brIn = inputIndex;
        inputIndex += 1;
        // Strip black bars baked into the source so the cover-fit fills with real
        // content (no letterbox showing through). Videos only; cached per file.
        const contentCrop = seg.isVideo ? await probeBrollContentCrop(seg.path) : "";
        const fadeOut = Math.max(0, seg.segDur - FADE).toFixed(3);
        // Animations are INDEPENDENT of shutter mode (you can have fade + zoom AND
        // the shutter click). fade=alpha multiplies the existing alpha (keeps rounded
        // corners). A b-roll < 1 s gets no fade-out — it just cuts.
        let anim = "";
        if (brollAnimIn === "fade") anim += `,fade=t=in:st=0:d=${FADE}:alpha=1`;
        if (brollAnimOut === "fade" && seg.segDur >= BROLL_FADEOUT_MIN_SEC) anim += `,fade=t=out:st=${fadeOut}:d=${FADE}:alpha=1`;
        const shift = `setpts=PTS-STARTPTS+${seg.start.toFixed(3)}/TB`;
        const enable = `enable='between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})'`;
        const brTag = `broll${clipIndex}_${bi}`;
        const nextVideo = `vbroll${clipIndex}_${bi}`;

        if (seg.placement === "square" && hasSquareAssets) {
          // Cover-fit a fixed centred square below the text, with ROUNDED corners
          // (alpha mask) and a DROP SHADOW (pre-blurred PNG behind). Cover-fit keeps
          // the source ratio — a 1:1 source fills exactly, any other ratio is cropped.
          // Auto mode may shrink the square (brollSquareScale, 0.5–1.0) while keeping
          // its TOP anchored at BROLL_SQUARE_Y, so it stays at the SAME spot — only the
          // 9:16 fullscreen b-roll is never resized. Even px keeps scale/crop happy.
          const baseSquareScale = clamp(safeNumber(project.settings?.brollSquareScale, 1), 0.5, 1);
          // ±3% per-occurrence size jitter (seeded → reproducible, logged). Centre/crop
          // unchanged (ox/oy recomputed from the jittered size), so the subject doesn't move.
          const squareScale = clamp(baseSquareScale * (1 + (renderRng() * 2 - 1) * BROLL_SQUARE_SCALE_JITTER), 0.5, 1.03);
          console.log(`[layout] broll square scale=${squareScale.toFixed(4)} (base ${baseSquareScale})`);
          const S = Math.round(BROLL_SQUARE_SIZE * squareScale / 2) * 2;
          const PAD = BROLL_SQUARE_PAD;
          const ox = Math.round((1080 - S) / 2) - PAD; // combined layer carries the shadow margin
          const oy = BROLL_SQUARE_Y - PAD;
          inputArgs.push("-i", brollSquareMaskPath);
          const maskIn = inputIndex; inputIndex += 1;
          inputArgs.push("-i", brollSquareShadowPath);
          const shadowIn = inputIndex; inputIndex += 1;
          const p = `${clipIndex}_${bi}`;
          filterChains.push(`[${brIn}:v]${contentCrop}scale=${S}:${S}:force_original_aspect_ratio=increase,crop=${S}:${S},setsar=1,fps=30${brollZoomFx(S, S, seg.segDur)},format=rgba[bsc${p}]`);
          // The mask/shadow PNGs are authored for a 720px square (mask 720x720,
          // shadow 816x816 = 720 + 2*48 pad). alphamerge REQUIRES equal dimensions,
          // so scale both to the CURRENT square size or the whole render fails
          // (which silently downgraded variants to no-b-roll via the salvage path).
          filterChains.push(`[${maskIn}:v]scale=${S}:${S},format=gray[bmask${p}]`);
          filterChains.push(`[bsc${p}][bmask${p}]alphamerge[bround${p}]`);
          filterChains.push(`[${shadowIn}:v]scale=${S + 2 * PAD}:${S + 2 * PAD},format=rgba[bshad${p}]`);
          filterChains.push(`[bshad${p}][bround${p}]overlay=${PAD}:${PAD}[bcomb${p}]`);
          filterChains.push(`[bcomb${p}]${anim ? anim.slice(1) + "," : ""}${shift}[${brTag}]`);
          filterChains.push(`[${currentVideo}][${brTag}]overlay=${ox}:${oy}:${enable}[${nextVideo}]`);
        } else {
          // "fullscreen" fills the 9:16 frame (or a plain square fallback if the
          // rounded/shadow assets are missing). The square fallback honours the same
          // auto-mode shrink (top-anchored); fullscreen 9:16 is never resized.
          const isSquare = seg.placement === "square";
          const baseSquareScale = clamp(safeNumber(project.settings?.brollSquareScale, 1), 0.5, 1);
          // ±3% per-occurrence size jitter (seeded → reproducible, logged). Centre/crop
          // unchanged (ox/oy recomputed from the jittered size), so the subject doesn't move.
          const squareScale = clamp(baseSquareScale * (1 + (renderRng() * 2 - 1) * BROLL_SQUARE_SCALE_JITTER), 0.5, 1.03);
          console.log(`[layout] broll square scale=${squareScale.toFixed(4)} (base ${baseSquareScale})`);
          const sqSize = Math.round(BROLL_SQUARE_SIZE * squareScale / 2) * 2;
          const W = isSquare ? sqSize : 1080;
          const H = isSquare ? sqSize : 1920;
          const ox = isSquare ? Math.round((1080 - sqSize) / 2) : 0;
          const oy = isSquare ? BROLL_SQUARE_Y : 0;
          filterChains.push(
            `[${brIn}:v]${contentCrop}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30${brollZoomFx(W, H, seg.segDur)},format=rgba${anim},${shift}[${brTag}]`
          );
          filterChains.push(`[${currentVideo}][${brTag}]overlay=${ox}:${oy}:${enable}[${nextVideo}]`);
        }
        currentVideo = nextVideo;
        if (brollShutterMode) brollShutterTimes.push(seg.start);
      }
    }

    // In auto mode, lift any subtitle that overlaps a logo pop-up to the TOP of the
    // frame so it's never over or under the logo (manual mode: no windows passed).
    // Centred logo → DROP the subtitle during the pop-up window (nothing behind it);
    // base-position logo → LIFT the subtitle to the top so it clears the logo (default).
    const assFilePath = await buildAssSubtitleFile(project, clip, clipTranscription, logoOnTop ? logoWindows : [], subtitleAboveSquare, logoCenter);
    const subtitledVideo = `vsub${clipIndex}`;
    // In AUTO mode the logo is composited LAST (on top of the b-roll AND the
    // subtitles), so write the subtitles to a pre-logo label and let the logo
    // overlay land on `vsub`. Otherwise subtitles write straight to `vsub`.
    const subOut = logoOnTop ? `vsubpre${clipIndex}` : subtitledVideo;
    // Normalise to EXACTLY 1080x1920 before concat/xfade: some upstream filters
    // (zoom, dual-speaker stack) can round a clip to 1080x1918, which makes concat
    // fail ("parameters do not match"). A no-op for already-correct clips.
    // fps=30 normalises mixed-framerate sources — xfade/concat require matching fps.
    filterChains.push(`[${currentVideo}]subtitles='${assFilePath}':fontsdir='${fontRoot}',scale=1080:1920,setsar=1,fps=30[${subOut}]`);
    if (logoOnTop) applyLogoOverlay(subOut, subtitledVideo);
    const videoVolumeDb = safeNumber(project.settings?.videoVolumeDb, 2);
    // For a dual-speaker clip the video is cut short at clipDuration; trim the
    // audio to match so the main speaker's voice doesn't bleed over the next
    // clip in the concat (video and audio segments must stay the same length).
    const clipAudioTrim = isDualSpeaker && clipDuration > 0
      ? `,atrim=0:${clipDuration.toFixed(3)},asetpts=PTS-STARTPTS`
      : "";
    // loudnorm (consistent level) → aformat pins the rate back to 48 kHz (its
    // dynamic mode emits 192 kHz) → +videoVolumeDb boost on top → async resample.
    const loudnormFilter = loudnormFilterFor(loudnessByPath.get(sourceAsset.filePath));
    filterChains.push(`[${sourceInput}:a]${loudnormFilter},aformat=sample_rates=48000,volume=${videoVolumeDb}dB,aresample=async=1${clipAudioTrim}[acl${clipIndex}]`);

    // Sound effects: the 2-3 strongest keyword beats of the WHOLE video carry one
    // effect each (effects at -13 dB, "fahh" at -24 dB — see buildVideoSfxPlan), but
    // NEVER on the hook clip; plus the metallic riser on the first clip's cut at -15 dB.
    // Added automatically and only when "Sound effects" is enabled. Transitions
    // (zoom / cut) stay purely visual — no sound is attached to them.
    const sfxEvents = [];
    if (project.settings?.autoSfxEnabled !== false) {
      // The HOOK (clip 0) gets NO keyword sound effects — only the base end-of-intro
      // accent (fahh / riser) below. Keyword effects play on the reply/extra clips.
      if (clipIndex !== 0) sfxEvents.push(...videoSfxPlan.filter((event) => event.clipIndex === clipIndex));
      // End-of-intro accent: varies between the metallic riser (-15 dB) and the
      // "fahh" (quieter, -24 dB). Its tail is anchored to the first clip's cut and
      // it starts earlier by its own length (sped up if the intro is too short, so
      // the climax always lands exactly on the cut).
      if (clipIndex === 0 && clipsToRender.length > 1 && clipDuration > 1.4) {
        const useFahh = Math.random() < 0.5;
        const accentKey = useFahh && getSfxPath(SFX_FAHH_KEY) ? SFX_FAHH_KEY : RISER_KEY;
        const accentPath = getSfxPath(accentKey);
        if (accentPath) {
          const accentDur = await probeMediaDurationSec(accentPath);
          let accentStart = Math.max(0, clipDuration - (accentDur > 0 ? accentDur : 1.15));
          let accentTempo;
          if (accentDur > 0 && accentDur > clipDuration) {
            accentTempo = clamp(accentDur / clipDuration, 1, 2);
            accentStart = Math.max(0, clipDuration - accentDur / accentTempo);
          }
          const accentVolume = accentKey === SFX_FAHH_KEY ? SFX_FAHH_VOLUME_DB : -15;
          sfxEvents.push({ key: accentKey, time: accentStart, volumeDb: accentVolume, word: "accent-intro", atempo: accentTempo });
        }
      }
    }

    // Shutter mode: a camera-shutter click on each b-roll's appearance.
    if (brollShutterMode && hasShutter) {
      for (const t of brollShutterTimes) {
        sfxEvents.push({ path: shutterSoundPath, time: t, volumeDb: -6, word: "shutter" });
      }
    }

    // Inter-clip shutter: when the project has MORE than 2 clips, a camera-shutter click
    // marks the cut INTO each extra clip (3rd onward) — the back-and-forth between the
    // alternating P1/P2 segments. Only the first cut (1->2) keeps a real transition.
    if (project.settings?.clipShutterBetween !== false && clipsToRender.length > 2 && clipIndex >= 2 && hasShutter) {
      sfxEvents.push({ path: shutterSoundPath, time: 0, volumeDb: -7, word: "clip-shutter" });
    }

    const sfxMixTags = [];
    const usedSfxEvents = sfxEvents
      .map((event) => ({ ...event, path: event.path || getSfxPath(event.key) }))
      .filter((event) => event.path && safeNumber(event.time, 0) < clipDuration);

    for (let eventIndex = 0; eventIndex < usedSfxEvents.length; eventIndex += 1) {
      const event = usedSfxEvents[eventIndex];
      inputArgs.push("-i", event.path);
      const sfxInput = inputIndex;
      inputIndex += 1;
      const delayMs = Math.max(0, Math.round(safeNumber(event.time, 0) * 1000));
      const sfxVolumeDb = safeNumber(event.volumeDb, SFX_EFFECT_VOLUME_DB);
      const tempoFilter = event.atempo && event.atempo > 0 ? `atempo=${event.atempo.toFixed(4)},` : "";
      const tag = `asfx${clipIndex}_${eventIndex}`;
      filterChains.push(
        `[${sfxInput}:a]${tempoFilter}volume=${sfxVolumeDb}dB,aresample=async=1,adelay=${delayMs}:all=1,atrim=0:${Math.max(0.1, clipDuration).toFixed(3)},asetpts=PTS-STARTPTS[${tag}]`
      );
      sfxMixTags.push(`[${tag}]`);
    }

    // The voice gets the SFX beats AND the Klimax logo pop-up sound(s) summed on top.
    const extraAudioTags = [...sfxMixTags, ...logoAudioTags];
    if (extraAudioTags.length) {
      filterChains.push(
        // normalize=0 so amix SUMS (doesn't divide the voice by the input count) —
        // otherwise each extra SFX/logo would quieten the voice. A limiter guards peaks.
        `[acl${clipIndex}]${extraAudioTags.join("")}amix=inputs=${extraAudioTags.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[a${clipIndex}]`
      );
    } else {
      filterChains.push(`[acl${clipIndex}]anull[a${clipIndex}]`);
    }
    concatPieces.push(`[${subtitledVideo}]`, `[a${clipIndex}]`);
  }

  if (clipsToRender.length === 1) {
    filterChains.push("[vsub0]null[vcat]");
    filterChains.push("[a0]anull[acat]");
  } else {
    // Effective per-clip durations (dual-speaker clips already cut at the main
    // speaker's speech end), used to place the transitions on the real cuts.
    const clipDurations = clipMeta.map((m) => (m.duration > 0 ? m.duration : 4));
    const transitionsEnabled = project.settings?.clipTransitionsEnabled === true;

    if (!transitionsEnabled) {
      const audioPieces = concatPieces.filter((_, idx) => idx % 2 === 1);
      filterChains.push(`${audioPieces.join("")}concat=n=${clipsToRender.length}:v=0:a=1[acat]`);
      const videoPieces = concatPieces.filter((_, idx) => idx % 2 === 0);
      filterChains.push(`${videoPieces.join("")}concat=n=${clipsToRender.length}:v=1:a=0[vcat]`);
    } else {
      // Two transitions: (a) the base opacity cross-fade, or (b) the camera flash —
      // a rotated, full-screen clip "lighten"-blended over the cut with its brightest
      // frame (~0.92 s in) landing exactly on the cut. The type is chosen per cut by
      // `clipTransitionType`: "opacity", "camera_flash", or "random" (50/50, default).
      // We build the video chain (opacity cuts overlap via xfade, flash cuts hard-cut
      // and are recorded), then blend the flashes on top to land on [vcat].
      const XFADE_SEC = 0.3;
      const flashAvailable = fsSync.existsSync(cameraFlashTransitionPath);
      const transitionType = project.settings?.clipTransitionType || "random";
      // The transition is applied ONLY at the first cut (clip 1 -> clip 2). Every later
      // cut is a HARD cut: the extra clips (3+) are a single continuous back-and-forth,
      // so we don't fade/flash between them (a shutter click marks those cuts instead).
      // Cut 1's kind is decided once so the audio chain mirrors the video exactly.
      const firstCutFlash = flashAvailable && (
        transitionType === "camera_flash" || (transitionType !== "opacity" && Math.random() < 0.5)
      );
      const cutKind = (i) => (i === 1 ? (firstCutFlash ? "flash" : "xfade") : "cut");

      const flashJobs = [];
      let prevTag = "vsub0";
      let lastTag = "vsub0";
      let timelineEnd = clipDurations[0]; // running end of the built chain (video timeline)
      for (let i = 1; i < clipsToRender.length; i += 1) {
        const kind = cutKind(i);
        const outTag = `vt${i}`;
        if (kind === "xfade") {
          // Opacity cross-fade: the two clips overlap by XFADE_SEC.
          const offset = Math.max(0, timelineEnd - XFADE_SEC);
          filterChains.push(
            `[${prevTag}][vsub${i}]xfade=transition=fade:duration=${XFADE_SEC.toFixed(3)}:offset=${offset.toFixed(3)}[${outTag}]`
          );
          timelineEnd = timelineEnd + clipDurations[i] - XFADE_SEC;
        } else {
          // Hard cut (kind "flash": blend a flash on top peaking on the cut; kind "cut":
          // plain back-to-back, used for every boundary between the extra clips).
          filterChains.push(`[${prevTag}][vsub${i}]concat=n=2:v=1:a=0[${outTag}]`);
          if (kind === "flash") flashJobs.push({ cutTime: timelineEnd });
          timelineEnd += clipDurations[i];
        }
        prevTag = outTag;
        lastTag = outTag;
      }

      // Audio mirrors the video: acrossfade at the opacity cut, plain concat at every
      // hard cut (flash or extra-clip) — A/V stay in sync whatever the mix of cuts.
      let prevAudio = "a0";
      for (let i = 1; i < clipsToRender.length; i += 1) {
        const outAudio = i === clipsToRender.length - 1 ? "acat" : `at${i}`;
        if (cutKind(i) === "xfade") {
          filterChains.push(`[${prevAudio}][a${i}]acrossfade=d=${XFADE_SEC.toFixed(3)}[${outAudio}]`);
        } else {
          filterChains.push(`[${prevAudio}][a${i}]concat=n=2:v=0:a=1[${outAudio}]`);
        }
        prevAudio = outAudio;
      }

      if (flashJobs.length) {
        // Normalise the base to a common fps/format so blend lines up frame-for-frame.
        filterChains.push(`[${lastTag}]fps=30,format=gbrp[flbase]`);
        let baseTag = "flbase";
        for (let j = 0; j < flashJobs.length; j += 1) {
          const flashStart = Math.max(0, flashJobs[j].cutTime - CAMERA_FLASH_PEAK_SEC);
          inputArgs.push("-i", cameraFlashTransitionPath);
          const flIdx = inputIndex;
          inputIndex += 1;
          const stopPad = Math.max(1, totalDuration);
          // Rotate 90°, fill the 1080x1920 frame, then pad black before/after so the
          // bright flash lands at `flashStart` and the rest of the track is black
          // (lighten with black = base unchanged).
          filterChains.push(
            `[${flIdx}:v]transpose=1,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=gbrp,tpad=start_duration=${flashStart.toFixed(3)}:start_mode=add:color=black:stop_duration=${stopPad.toFixed(3)}:stop_mode=add:color=black[flin${j}]`
          );
          const blendOut = j === flashJobs.length - 1 ? "vblend" : `vbl${j}`;
          filterChains.push(`[${baseTag}][flin${j}]blend=all_mode=lighten:shortest=1[${blendOut}]`);
          baseTag = blendOut;
          // Keep the flash's own whoosh, delayed to the flash start, at -5 dB.
          filterChains.push(
            `[${flIdx}:a]volume=-5dB,adelay=${Math.round(flashStart * 1000)}:all=1,aresample=async=1[fla${j}]`
          );
          flashAudioTags.push(`[fla${j}]`);
        }
        filterChains.push(`[${baseTag}]format=yuv420p[vcat]`);
      } else {
        filterChains.push(`[${lastTag}]format=yuv420p[vcat]`);
      }
    }
  }

  const musicAssetId = project.settings?.musicId || clipsToRender.find((clip) => clip.musicId)?.musicId || null;
  const musicAsset = project.settings?.musicEnabled
    ? db.assets.find((asset) => asset.id === musicAssetId && asset.category === "music")
    : null;

  // Fold the camera-flash whooshes onto the voice first (summed, so the voice
  // keeps its level; a limiter guards the brief peaks), then mix the music as
  // before. With no flashes this is a no-op and [acat] passes straight through.
  let voiceTag = "acat";
  if (flashAudioTags.length) {
    filterChains.push(
      `[acat]${flashAudioTags.join("")}amix=inputs=${1 + flashAudioTags.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.97[acatfl]`
    );
    voiceTag = "acatfl";
  }

  if (musicAsset?.filePath) {
    inputArgs.push("-stream_loop", "-1", "-i", musicAsset.filePath);
    const musicInput = inputIndex;
    inputIndex += 1;
    const musicVolumeDb = safeNumber(project.settings?.musicVolumeDb, -17);
    filterChains.push(
      `[${musicInput}:a]volume=${musicVolumeDb}dB,atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=N/SR/TB,aresample=async=1[bgm]`
    );
    filterChains.push(`[${voiceTag}][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
  } else {
    filterChains.push(`[${voiceTag}]anull[aout]`);
  }

  const args = [
    ...inputArgs,
    "-filter_complex",
    filterChains.join(";"),
    "-map",
    "[vcat]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-threads",
    "0",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  // Wall-clock cap so a hung ffmpeg (e.g. a broken/0-duration b-roll looped into a
  // segment) can't freeze the render slot forever and stall the whole auto batch.
  // ~12 s of compute per second of output, floor 3 min, cap 8 min.
  const renderTimeoutMs = Math.min(480000, Math.max(180000, Math.round((totalDuration || 30) * 12000)));
  _mark("buildFilters+facedetect+hookPNG");
  const { stderr } = await runProcess(ffmpegPath, args, { timeoutMs: renderTimeoutMs });
  _mark("ffmpegEncode");
  const metadata = await exportMetadata(outputPath);
  pruneRenders().catch(() => {}); // keep renders/ bounded (fire-and-forget, never blocks)
  return {
    status: "completed",
    path: outputPath,
    url: publicUrlFor(outputPath),
    createdAt: new Date().toISOString(),
    ...metadata,
    log: truncateText(stderr, maxStoredExportLogChars),
  };
};

app.get("/api/health", async (_req, res) => {
  let drive = "off";
  try { ({ driveMode: drive } = await import("./driveUpload.mjs")); drive = drive(); } catch { drive = "off"; }
  res.json({
    ok: true,
    ffmpeg: ffmpegPath,
    ffprobe: ffprobe.path,
    dataRoot,
    python: fsSync.existsSync(pythonBin) ? pythonBin : null,
    drive, // "oauth" (perso, OK) | "service" (Workspace/Shared Drive) | "off"
    logoAnimation: fsSync.existsSync(logoAnimationPath) ? publicUrlFor(logoAnimationPath) : null,
    logoPreview: fsSync.existsSync(logoPreviewPath) ? publicUrlFor(logoPreviewPath) : null,
  });
});

app.get("/api/assets", async (_req, res) => {
  const db = await readDb();
  res.json({ assets: db.assets, videoGroups: getVideoGroups(db.assets) });
});

app.post(
  "/api/assets/video-pair",
  upload.fields([
    { name: "person1", maxCount: 1 },
    { name: "person2", maxCount: 1 },
  ]),
  async (req, res) => {
    const one = req.files?.person1?.[0];
    const two = req.files?.person2?.[0];
    if (!one || !two) return res.status(400).json({ error: "Ajoute les deux vidéos." });

    const db = await readDb();
    const groupId = id("video-group");
    const groupTitle = `${one.originalname.replace(/\.[^/.]+$/, "")} + ${two.originalname.replace(/\.[^/.]+$/, "")}`;
    const note = req.body?.note || "Deux vidéos liées au même projet";
    const assets = [
      assetFromFile({ file: one, category: "video", groupId, groupTitle, videoPart: "person1", note }),
      assetFromFile({ file: two, category: "video", groupId, groupTitle, videoPart: "person2", note }),
    ];
    db.assets.unshift(...assets);
    await writeDb(db);
    // Transcribe each clip NOW (stored on the asset, reused by every render, editable
    // in the bank). Persist assets first so a transcription hiccup can't lose them.
    for (const a of assets) await ensureAssetTranscript(a);
    await writeDb(db);
    res.json({ added: assets, assets: db.assets, videoGroups: getVideoGroups(db.assets) });
  }
);

// RUSH SIMPLE — a single video (1 person). Creates a solo group (person1 only); the
// auto pipeline then builds a single-clip project from it. Field name "person1" so it
// lands in the videos dir like a pair half.
app.post("/api/assets/single-rush", upload.single("person1"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Ajoute une vidéo." });
  const db = await readDb();
  const groupId = id("video-group");
  const groupTitle = req.body?.note || file.originalname.replace(/\.[^/.]+$/, "");
  const note = req.body?.note || "Rush simple (1 vidéo)";
  const asset = assetFromFile({ file, category: "video", groupId, groupTitle, videoPart: "person1", note });
  db.assets.unshift(asset);
  await writeDb(db);
  await ensureAssetTranscript(asset); // transcribe at upload, store on the asset
  await writeDb(db);
  res.json({ added: [asset], assets: db.assets, videoGroups: getVideoGroups(db.assets) });
});

app.post("/api/assets/:category", upload.single("file"), async (req, res) => {
  const category = req.params.category;
  if (!["music", "broll", "image", "speaker"].includes(category)) return res.status(400).json({ error: "Catégorie invalide." });
  if (!req.file) return res.status(400).json({ error: "Fichier manquant." });
  const db = await readDb();
  const asset = assetFromFile({ file: req.file, category, note: req.body?.note || req.file.originalname });
  await ensureAssetNormalized(asset); // clean b-roll files at upload so they never crash a render
  db.assets.unshift(asset);
  await writeDb(db);
  res.json({ asset, assets: db.assets });
});

// --- Per-asset transcript: read / (re)generate / edit. Stored ON the asset so it's
// computed once at upload, reused by every render, and editable from the bank. ---
app.get("/api/assets/:id/transcript", async (req, res) => {
  const db = await readDb();
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: "Asset introuvable." });
  res.json({ transcript: asset.transcript || { status: "idle", words: [], text: "" } });
});

app.post("/api/assets/:id/transcribe", async (req, res) => {
  const db = await readDb();
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: "Asset introuvable." });
  await ensureAssetTranscript(asset, { force: true });
  await invalidateProjectTranscriptsForAsset(db, asset.id);
  await writeDb(db);
  res.json({ transcript: asset.transcript });
});

app.put("/api/assets/:id/transcript", async (req, res) => {
  const db = await readDb();
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: "Asset introuvable." });
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  const prev = asset.transcript || {};
  const words = realignTranscriptWords(text, prev.words || [], safeNumber(prev.duration, 0));
  asset.transcript = {
    ...prev, status: "completed", words, text: words.map((w) => w.word).join(" "),
    edited: true, updatedAt: new Date().toISOString(),
  };
  await invalidateProjectTranscriptsForAsset(db, asset.id); // stale cached captions must rebuild
  await writeDb(db);
  res.json({ transcript: asset.transcript });
});

// Rename a single asset (a video part — personne 1 / personne 2 — or a 2e-speaker
// clip). Only the `title` changes; grouping (groupId/videoPart) stays intact.
app.patch("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  const target = db.assets.find((asset) => asset.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Asset introuvable." });
  const nextTitle = typeof req.body?.title === "string" ? req.body.title.trim() : null;
  const nextNote = typeof req.body?.note === "string" ? req.body.note.trim() : null;
  // "fullscreen" | "square" — how this b-roll is composited (manual, per b-roll).
  const nextPlacement = ["fullscreen", "square"].includes(req.body?.placement) ? req.body.placement : null;
  // Per-rush VIRAL HOOK: when this rush is the hook clip (clip 1), this exact text is
  // used as the hook — the auto/AI hook is NOT generated for it. "" clears it.
  const nextCustomHook = typeof req.body?.customHook === "string" ? req.body.customHook.trim() : null;
  // The note is the b-roll's description used by the placement brain — editable
  // from the bank so the user can refine what each b-roll "means".
  if (nextNote !== null) target.note = nextNote;
  if (nextTitle) target.title = nextTitle;
  if (nextPlacement) target.placement = nextPlacement;
  if (nextCustomHook !== null) target.customHook = nextCustomHook || undefined; // "" clears
  if (nextNote === null && !nextTitle && !nextPlacement && nextCustomHook === null) return res.status(400).json({ error: "Rien à mettre à jour." });
  await writeDb(db);
  res.json({ ok: true, asset: target, assets: db.assets, videoGroups: getVideoGroups(db.assets) });
});

app.delete("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  const target = db.assets.find((asset) => asset.id === req.params.id || asset.groupId === req.params.id);
  if (!target) return res.status(404).json({ error: "Asset introuvable." });

  const removeIds = new Set(
    db.assets
      .filter((asset) => asset.id === req.params.id || asset.groupId === req.params.id || (target.groupId && asset.groupId === target.groupId))
      .map((asset) => asset.id)
  );

  db.assets = db.assets.filter((asset) => !removeIds.has(asset.id));
  await writeDb(db);
  res.json({ ok: true, assets: db.assets, videoGroups: getVideoGroups(db.assets) });
});

app.get("/api/projects", async (_req, res) => {
  const db = await readDb();
  res.json({ projects: db.projects.map((project) => resolveProject(db, project.id)).filter(Boolean) });
});

app.post("/api/projects", async (req, res) => {
  const db = await readDb();
  const sourceGroup = getVideoGroups(db.assets).find((group) => group.id === req.body?.sourceGroupId);
  const now = new Date().toISOString();
  const settings = defaultProjectSettings();
  const project = normalizeProject({
    id: id("project"),
    title: req.body?.title || (sourceGroup ? `Klimax ${sourceGroup.title}` : `Klimax ${db.projects.length + 1}`),
    description: req.body?.description || sourceGroup?.note || "Projet local Klimax",
    status: "draft",
    render_progress: 0,
    created_at: now,
    updated_at: now,
    sourceGroupId: sourceGroup?.id || null,
    settings,
    // Montage-aware: a group with "extra" assets (bank "Ajouter des clips" / multi-rush)
    // yields ALL its clips (intro + reply + extras), never just the first 2.
    clips: sourceGroup ? buildClipsForGroup(db, sourceGroup, settings) : [],
    transcription: defaultTranscription(),
    exports: [],
    export: null,
  });

  db.projects.unshift(project);
  await writeDb(db);
  res.json({ project: resolveProject(db, project.id) });
});

app.get("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const project = resolveProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  // The editor reads transcription.clips — db.json keeps only a stub, so load the full
  // per-project transcript file into the response (no rebuild; just a file read).
  if (!(project.transcription?.clips?.length)) {
    const full = await loadTranscript(project.id);
    if (full?.clips?.length) project.transcription = full;
  }
  res.json({ project });
});

app.patch("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  project.settings = mergeProjectSettings({ ...project.settings, ...(req.body?.settings || {}) });
  if (Array.isArray(req.body?.clips)) project.clips = req.body.clips;
  project.updated_at = new Date().toISOString();
  await writeDb(db);
  res.json({ project: resolveProject(db, project.id) });
});

// Delete a project RECORD only — never its source assets/files (a montage group's
// clips may be shared, and assets are precious; see the asset-loss pitfalls).
app.delete("/api/projects/:id", async (req, res) => {
  const db = await readDb();
  const before = db.projects.length;
  db.projects = db.projects.filter((item) => item.id !== req.params.id);
  if (db.projects.length === before) return res.status(404).json({ error: "Projet introuvable." });
  await writeDb(db);
  await fs.unlink(transcriptFile(req.params.id)).catch(() => {}); // clean its transcript file
  res.json({ ok: true, projects: db.projects.map((p) => resolveProject(db, p.id)).filter(Boolean) });
});

// Auto-centre the split-screen bands on each speaker's face. Detects the dominant
// face in the MAIN source (sourceAssetForClip) and the ADDED source
// (dualSpeakerSource), then fills the exact cropX/cropY that lands each face in the
// centre of its band — accounting for split ratio, top/bottom position, per-band zoom
// and mirror. Writes to the same fields the preview & export already read, so it's
// WYSIWYG. `clipId` in the body targets one clip; omitted = every dual-speaker clip.
app.post("/api/projects/:id/center-faces", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  const sourceGroup = getVideoGroups(db.assets).find((group) => group.id === project.sourceGroupId);
  if (!sourceGroup) return res.status(400).json({ error: "Source vidéo manquante." });

  const mirror = project.settings?.mirrorEnabled === true;
  const clipId = req.body?.clipId;
  const targets = (project.clips || []).filter(
    (c) => c.dualSpeakerEnabled && (!clipId || c.id === clipId)
  );
  let centered = 0;
  let noFace = 0;
  for (const clip of targets) {
    const ratio = clamp(safeNumber(clip.dualSpeakerSplitRatio, 0.5), 0.2, 0.8);
    const TOP = Math.round(1920 * ratio);
    const BOTTOM = 1920 - TOP;
    const addedOnTop = clip.dualSpeakerPosition === "top";
    const mainBandH = addedOnTop ? BOTTOM : TOP;
    const addedBandH = addedOnTop ? TOP : BOTTOM;
    const mainZoom = clamp(safeNumber(clip.dualSpeakerMainZoom, 100), 100, 220) / 100;
    const addedZoom = clamp(safeNumber(clip.dualSpeakerAddedZoom, 100), 100, 220) / 100;

    const mainAsset = sourceAssetForClip(sourceGroup, clip);
    const addedAsset = db.assets.find((a) => a.id === clip.dualSpeakerSource);
    const [mainBox, addedBox] = await Promise.all([
      ensureFaceBox(mainAsset),
      ensureFaceBox(addedAsset),
    ]);
    if (mainBox) {
      const { cropX, cropY } = faceToBandCrop({ ...mainBox, bandH: mainBandH, zoom: mainZoom, mirror });
      clip.dualSpeakerMainCropX = cropX;
      clip.dualSpeakerMainCropY = cropY;
      centered += 1;
    } else { noFace += 1; }
    if (addedBox) {
      const { cropX, cropY } = faceToBandCrop({ ...addedBox, bandH: addedBandH, zoom: addedZoom, mirror });
      clip.dualSpeakerAddedCropX = cropX;
      clip.dualSpeakerAddedCropY = cropY;
    }
  }
  project.updated_at = new Date().toISOString();
  await writeDb(db);
  res.json({ project: resolveProject(db, project.id), centered, noFace, clips: targets.length });
});

// Long-running routes (transcribe, render) hold their `db` snapshot for minutes.
// Writing that stale snapshot back would clobber anything saved meanwhile (asset
// uploads, project edits, auto jobs) — so the FINAL write re-reads the db and
// applies only this project's fields to the fresh copy.
const mutateProjectFresh = async (projectId, mutator) => {
  const freshDb = await readDb();
  const freshProject = freshDb.projects.find((p) => p.id === projectId);
  if (!freshProject) return null;
  mutator(freshProject);
  freshProject.updated_at = new Date().toISOString();
  await writeDb(freshDb);
  return { db: freshDb, project: freshProject };
};

app.post("/api/projects/:id/transcribe", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  const sourceGroup = getVideoGroups(db.assets).find((group) => group.id === project.sourceGroupId);
  if (!sourceGroup) return res.status(400).json({ error: "Source vidéo manquante." });

  project.settings = mergeProjectSettings({ ...project.settings, ...(req.body?.settings || {}) });
  project.transcription = {
    ...defaultTranscription(),
    ...(project.transcription || {}),
    status: "running",
  };
  project.updated_at = new Date().toISOString();
  await writeDb(db);

  try {
    await ensureTranscription(project, sourceGroup, db.assets);
    const fresh = await mutateProjectFresh(project.id, (p) => {
      p.settings = project.settings;
      p.transcription = project.transcription;
      p.clips = project.clips;
    });
    res.json({ project: resolveProject(fresh?.db || db, project.id) });
  } catch (error) {
    const failedTranscription = {
      ...defaultTranscription(),
      status: "failed",
      generatedAt: new Date().toISOString(),
      error: error.message,
      clips: [],
    };
    const fresh = await mutateProjectFresh(project.id, (p) => {
      p.transcription = failedTranscription;
    });
    res.status(500).json({ error: error.message, project: resolveProject(fresh?.db || db, project.id) });
  }
});

app.post("/api/projects/:id/render", async (req, res) => {
  await normalizeBrollPoolOnce(); // clean/quarantine b-roll first (serialised), then read fresh db
  const db = await readDb();
  const project = db.projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  const sourceGroup = getVideoGroups(db.assets).find((group) => group.id === project.sourceGroupId);
  if (!sourceGroup) return res.status(400).json({ error: "Source vidéo manquante." });

  project.settings = mergeProjectSettings({ ...project.settings, ...(req.body?.settings || {}) });
  project.status = "rendering";
  project.render_progress = 15;
  project.updated_at = new Date().toISOString();
  await writeDb(db);

  try {
    await ensureTranscription(project, sourceGroup, db.assets);
    await mutateProjectFresh(project.id, (p) => {
      p.transcription = project.transcription;
      p.clips = project.clips;
      p.render_progress = 55;
    });

    // (The legacy clip-level auto-b-roll pick was removed: renderProject's
    // moment-level plan does the placement itself — the old call cost one extra
    // Claude round-trip per render for a value nothing reads.)
    const exported = await renderProject(db, project, sourceGroup);
    const fresh = await mutateProjectFresh(project.id, (p) => {
      p.settings = project.settings;
      p.status = "completed";
      p.render_progress = 100;
      p.exports = [exported, ...(Array.isArray(p.exports) ? p.exports : [])]
        .slice(0, maxStoredExports)
        .map((entry) => normalizeExport(entry, { includeLog: true }));
      p.export = exported;
    });
    res.json({ project: resolveProject(fresh?.db || db, project.id), export: exported });
  } catch (error) {
    const failedExport = { status: "failed", error: error.message, createdAt: new Date().toISOString() };
    const fresh = await mutateProjectFresh(project.id, (p) => {
      p.status = "failed";
      p.render_progress = 0;
      p.exports = [failedExport, ...(Array.isArray(p.exports) ? p.exports : [])]
        .slice(0, maxStoredExports)
        .map((entry) => normalizeExport(entry, { includeLog: true }));
      p.export = failedExport;
    });
    res.status(500).json({ error: error.message, project: resolveProject(fresh?.db || db, project.id) });
  }
});

// -------------------------------------------------------------------------
// SFX library
// -------------------------------------------------------------------------
app.get("/api/sfx", async (_req, res) => {
  const { listSfx, ensureSfxLibrary } = await import("./sfx.mjs");
  // Best-effort: ensure the on-disk files exist (sync if missing) so the UI
  // can show them as "ready" without a separate bootstrap step.
  try { await ensureSfxLibrary(); } catch { /* ignored: surfaced in item.ready=false */ }
  res.json({ sfx: listSfx() });
});

app.get("/api/sfx/:key/file", async (req, res) => {
  const { getSfxPath } = await import("./sfx.mjs");
  const abs = getSfxPath(req.params.key);
  if (!abs) return res.status(404).json({ error: "SFX introuvable" });
  res.sendFile(abs);
});

// Upload your own SFX sound into the bank. Lands in the user SFX folder so it
// shows up in listSfx() and can be picked as the zoom / cut transition sound.
app.post("/api/sfx/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier manquant." });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"].includes(ext)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: "Format audio non supporté." });
  }
  const { getUserSfxDir, listSfx } = await import("./sfx.mjs");
  const dir = getUserSfxDir();
  await ensureDir(dir);
  const baseName = normalizeFileName(req.file.originalname.replace(/\.[^/.]+$/, ""));
  const target = path.join(dir, `${baseName}${ext}`);
  await fs.rename(req.file.path, target).catch(async () => {
    await fs.copyFile(req.file.path, target);
    await fs.unlink(req.file.path).catch(() => {});
  });
  res.json({ sfx: listSfx() });
});

app.delete("/api/sfx/:key", async (req, res) => {
  const { deleteUserSfx, listSfx } = await import("./sfx.mjs");
  const ok = deleteUserSfx(req.params.key);
  if (!ok) return res.status(400).json({ error: "SFX importé introuvable." });
  res.json({ sfx: listSfx() });
});

app.post("/api/projects/:id/sfx", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });
  const { transitionKey, clipSfx } = req.body || {};
  if (typeof transitionKey === "string" || transitionKey === null) {
    if (transitionKey) project.settings = { ...project.settings, sfxTransition: transitionKey };
    else {
      const next = { ...project.settings };
      delete next.sfxTransition;
      project.settings = next;
    }
  }
  if (clipSfx && typeof clipSfx === "object") {
    // clipSfx = { [clipId]: effectKey | null }
    for (const clip of project.clips) {
      if (Object.prototype.hasOwnProperty.call(clipSfx, clip.id)) {
        const value = clipSfx[clip.id];
        if (value) clip.sfxEffect = value;
        else delete clip.sfxEffect;
      }
    }
  }
  project.updated_at = new Date().toISOString();
  await writeDb(db);
  res.json({ project: resolveProject(db, project.id) });
});

await (async () => {
  try {
    const { ensureSfxLibrary } = await import("./sfx.mjs");
    await ensureSfxLibrary();
  } catch (e) {
    console.warn("[sfx] bootstrap failed:", e.message);
  }
})();

// -------------------------------------------------------------------------
// Presets
// -------------------------------------------------------------------------
app.get("/api/presets", async (_req, res) => {
  const { listPresets } = await import("./presets.mjs");
  res.json({ presets: await listPresets() });
});

app.post("/api/presets", async (req, res) => {
  const { createPreset } = await import("./presets.mjs");
  try {
    const preset = await createPreset(req.body || {});
    res.json({ preset });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/presets/:id", async (req, res) => {
  const { updatePreset } = await import("./presets.mjs");
  try {
    const preset = await updatePreset(req.params.id, req.body || {});
    res.json({ preset });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/presets/:id", async (req, res) => {
  const { deletePreset } = await import("./presets.mjs");
  res.json(await deletePreset(req.params.id));
});

// -------------------------------------------------------------------------
// Settings (API keys for Whisper, b-roll intelligence, ...)
// -------------------------------------------------------------------------
app.get("/api/settings", async (_req, res) => {
  const { settings } = await import("./settings.mjs");
  res.json(await settings.maskedForBrowser());
});

app.put("/api/settings", async (req, res) => {
  const { settings } = await import("./settings.mjs");
  const body = req.body || {};
  // Only accept known sections, only accept apiKey + model fields.
  const patch = {};
  for (const sectionKey of ["whisper", "brollIntelligence"]) {
    if (body[sectionKey] && typeof body[sectionKey] === "object") {
      const s = {};
      if (typeof body[sectionKey].apiKey === "string") s.apiKey = body[sectionKey].apiKey.trim();
      if (typeof body[sectionKey].model === "string") s.model = body[sectionKey].model.trim();
      if (Object.keys(s).length > 0) patch[sectionKey] = s;
    }
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Aucun champ reconnu dans la requête." });
  }
  const next = await settings.update(patch);
  res.json(next);
});

app.post("/api/settings/test/whisper", async (_req, res) => {
  const { testWhisperConnection } = await import("./whisper.mjs");
  res.json(await testWhisperConnection());
});

app.post("/api/settings/test/broll-intelligence", async (_req, res) => {
  const { testBrollIntelligenceConnection } = await import("./brollIntelligence.mjs");
  res.json(await testBrollIntelligenceConnection());
});

// -------------------------------------------------------------------------
// Auto b-roll: ask the intelligence module to pick a b-roll per clip
// based on transcripts and b-roll descriptions. Persists the result on
// each clip as `autoBrollId`. Idempotent: re-running overwrites.
// -------------------------------------------------------------------------
app.post("/api/projects/:id/auto-brolls", async (req, res) => {
  const db = await readDb();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });

  const sourceGroup = getVideoGroups(db.assets).find((g) => g.id === project.sourceGroupId);
  if (!sourceGroup) return res.status(400).json({ error: "Source vidéo manquante." });

  // Make sure we have a fresh transcription so the AI can read the words.
  try {
    await ensureTranscription(project, sourceGroup, db.assets);
  } catch (err) {
    return res.status(500).json({ error: `Transcription impossible: ${err.message}` });
  }

  const brolls = db.assets.filter((a) => a.category === "broll" && (a.note || a.title));
  if (brolls.length === 0) {
    return res.status(400).json({ error: "Aucun b-roll labellisé dans la banque. Ajoute des descriptions." });
  }

  const clipsPayload = project.clips.filter((clip) => clip.stage === "reply").map((clip) => {
    const tc = project.transcription?.clips?.find((c) => c.clipId === clip.id);
    const text = (tc?.cues || []).map((c) => c.text).join(" ").trim();
    return { id: clip.id, transcript: text };
  });
  const brollsPayload = brolls.map((b) => ({ id: b.id, note: b.note || b.title, title: b.title }));

  const { pickBrollsForClips } = await import("./brollIntelligence.mjs");
  const picks = await pickBrollsForClips({ clips: clipsPayload, brolls: brollsPayload });

  // Persist on the clip object. Do NOT clobber `imageId` (the user's manual pick).
  for (const pick of picks) {
    const clip = project.clips.find((c) => c.id === pick.clipId);
    if (!clip) continue;
    if (pick.brollId) clip.autoBrollId = pick.brollId;
    else delete clip.autoBrollId;
  }
  project.updated_at = new Date().toISOString();
  await writeDb(db);

  res.json({ picks, project: resolveProject(db, project.id) });
});

// -------------------------------------------------------------------------
// Automatic Mode — batch variant generation. Builds the SAME settings/clips
// manual mode builds (via autoVariants.mjs) and renders each variant through the
// EXISTING manual pipeline (renderProject / ensureTranscription). No manual code
// is touched. Jobs are PERSISTED to disk and RESUMED on startup, so a backend
// restart (or the sandbox killing the process) never loses or stalls a batch —
// variants are re-derived deterministically (seed = videoId:index).
// -------------------------------------------------------------------------
const autoJobsFile = path.join(dataRoot, "auto-jobs.json");
const autoJobs = new Map(); // jobId -> job
let autoJobsLoaded = false;

const loadAutoJobs = async () => {
  if (autoJobsLoaded) return;
  autoJobsLoaded = true;
  try {
    const raw = JSON.parse(await fs.readFile(autoJobsFile, "utf8"));
    for (const job of raw.jobs || []) autoJobs.set(job.id, job);
  } catch { /* no jobs file yet */ }
};
// Atomic + serialized (two parallel render workers save concurrently).
let autoJobsWriteChain = Promise.resolve();
const saveAutoJobs = () => {
  // Keep only the last 30 jobs in MEMORY too (not just on disk) so a long-running
  // session can't grow auto-jobs unbounded. Running jobs are always among the newest.
  if (autoJobs.size > 40) {
    const keep = [...autoJobs.values()].slice(-30);
    autoJobs.clear();
    for (const j of keep) autoJobs.set(j.id, j);
  }
  const jobs = [...autoJobs.values()].slice(-30).map(({ _running, ...j }) => j); // keep last 30, drop transient flag
  const payload = JSON.stringify({ jobs }, null, 2);
  autoJobsWriteChain = autoJobsWriteChain.then(async () => {
    const tmp = `${autoJobsFile}.tmp-${process.pid}`;
    await fs.writeFile(tmp, payload);
    await fs.rename(tmp, autoJobsFile);
  }).catch(() => {});
  return autoJobsWriteChain;
};
const jobDoneCount = (job) => job.items.filter((it) => it.status === "ready" || it.status === "failed").length;
const cleanJob = ({ _running, hooksByProject, ...j }) => j; // hide internals from the UI

// Hook bank: proven hooks the user curates. 75% of variant hooks are EXACT copies
// from the bank (the ones that fit the transcript); 25% are AI variants in the same
// style. Stored in local-data/klimax/hook-bank.json (editable), seeded with defaults.
const HOOK_BANK_DEFAULT = [
  "la taille ça change vraiment tout 🍆",
  "3 exercices pour tenir longtemps au lit 🍆",
  "comment savoir si on est bon au lit 🍆",
  "comment un mec peut devenir bon au lit 🍆",
  "comment durer au lit sans bedave 🍆",
  "comment durer au lit sans se dr**er 🍆",
  "est ce que la taille du zgeg ça compte 🍆",
  "est ce que la taille ça compte 🍆",
  "tenir 8 minutes au lit c'est grave ? 🍆",
];
const hookBankFile = path.join(dataRoot, "hook-bank.json");
const readHookBank = async () => {
  try {
    const parsed = JSON.parse(await fs.readFile(hookBankFile, "utf8"));
    return Array.isArray(parsed.hooks) && parsed.hooks.length ? parsed.hooks.map(String) : HOOK_BANK_DEFAULT;
  } catch {
    // Seed the editable file on first use.
    fs.writeFile(hookBankFile, JSON.stringify({ hooks: HOOK_BANK_DEFAULT }, null, 2)).catch(() => {});
    return HOOK_BANK_DEFAULT;
  }
};

// Build the N hooks of a batch: ~75% exact bank copies (transcript-matched, best
// first), ~25% AI variants in the same crude/punchy style. One Claude call does both
// the matching and the variants; on failure we fall back to cycling the whole bank.
const genVariantHooks = async (introText, replyText, n) => {
  const ctx = `${introText} ${replyText}`.trim();
  const bank = await readHookBank();
  const nVariants = Math.max(0, Math.round(n * 0.25));
  const nCopies = n - nVariants;
  let fits = bank.map((_, i) => i);
  let variants = [];
  if (ctx) {
    const system =
      "Tu es monteur de vidéos courtes virales. On te donne le TRANSCRIPT d'un clip et une BANQUE de hooks éprouvés (numérotés). " +
      '1) "fits" : les indices des hooks de la banque qui collent VRAIMENT au sujet du transcript, du plus au moins pertinent (exclus ceux qui ne collent pas). ' +
      (nVariants > 0
        ? `2) "variants" : ${nVariants} NOUVEAUX hooks, variantes des hooks de la banque adaptées au transcript — EXACTEMENT le même style (court, percutant, ton cru assumé, max ~9 mots, terminé par UN emoji collant au sujet). `
        : '2) "variants" : renvoie un tableau VIDE []. ') +
      "RÈGLE ABSOLUE pour les variants : le CONTEXTE du sujet doit être explicite dans le hook. Si le sujet est la performance sexuelle, mentionne \"au lit\" (ou équivalent clair). " +
      'CONTRE-EXEMPLE interdit : "3 exos pour finir en 7 minutes" (ambigu, on dirait du sport) → il faut "il finissait en 7 minutes au lit" ou "3 exos pour tenir au lit". Un hook sans son contexte est un hook raté. ' +
      'Réponds UNIQUEMENT en JSON : {"fits":[...], "variants":["..."]}.' +
      (await buildLearnedRulesBlock("hooks"));
    try {
      const raw = await runClaude(
        `BANQUE:\n${bank.map((h, i) => `${i}: ${h}`).join("\n")}\n\nTRANSCRIPT:\n${ctx.slice(0, 1500)}`,
        system
      );
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.fits)) {
          const valid = parsed.fits.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < bank.length);
          if (valid.length) fits = valid;
        }
        if (Array.isArray(parsed.variants)) {
          variants = parsed.variants.map((s) => String(s).trim().replace(/^["'«»\s]+|["'«»\s]+$/g, "")).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn("[auto] hook bank pick failed:", e.message);
    }
  }
  const copies = [];
  for (let i = 0; copies.length < nCopies && fits.length; i += 1) copies.push(bank[fits[i % fits.length]]);
  variants = variants.slice(0, nVariants);
  // Interleave: copies dominate, one variant every ~4 slots.
  const out = [];
  let ci = 0;
  let vi = 0;
  for (let i = 0; i < n; i += 1) {
    const useVariant = vi < variants.length && (i % 4 === 3 || ci >= copies.length);
    if (useVariant) out.push(variants[vi++]);
    else if (copies.length) out.push(copies[ci++ % copies.length]);
  }
  console.log(`[auto] hooks (${out.length}): ${out.map((h, i) => `${i}:${h.slice(0, 30)}`).join(" | ")}`);
  return out.slice(0, n);
};

// Auto mode picks VIDEO PAIRS from the bank (not pre-made projects). For a pair we
// reuse an existing project if one exists (keeps its cached transcription), else we
// assemble one exactly like manual mode (intro = personne 1, reply = personne 2).
// Extra ("extra"-part) assets of a montage group, ordered by conversation index.
// A plain 2-person group has none; a montage group (bank "Ajouter des clips" or
// multi-rush upload) has clip 3+ here.
const extraAssetsForGroup = (db, groupId) =>
  db.assets
    .filter((a) => a.category === "video" && a.groupId === groupId && a.videoPart === "extra")
    .sort((a, b) => safeNumber(a.clipIndex, 0) - safeNumber(b.clipIndex, 0));

// Build the ORDERED clip list for a (possibly montage) source group:
//   intro [+ reply] [+ extra…]
// SINGLE source of truth shared by every project-creating path (auto, manual
// POST /api/projects, multi-rush) so a montage group ALWAYS yields all N clips —
// never a deficient 2-clip project that would render only 2 of 3 segments.
const buildClipsForGroup = (db, sourceGroup, settings) => {
  const introClip = {
    id: id("intro"), stage: "intro", sourceVideoId: sourceGroup.person1?.id || null,
    sourceTitle: sourceGroup.person1?.title, person: personTagFromTitle(sourceGroup.person1?.title),
    title: "Personne 1 - segment 1", hookText: settings.hookText, subtitle: "Transcription en attente",
    musicId: null, brollId: null, imageId: null, ...defaultClipLayout("intro"), imageTransform: { scale: 100, x: 0, y: 0 },
  };
  const clips = [introClip];
  if (sourceGroup.person2?.filePath) {
    clips.push({
      id: id("reply"), stage: "reply", sourceVideoId: sourceGroup.person2?.id || null,
      sourceTitle: sourceGroup.person2?.title, person: personTagFromTitle(sourceGroup.person2?.title),
      title: "Personne 2 - segment 2", hookText: "La suite arrive maintenant", subtitle: "Transcription en attente",
      musicId: null, brollId: null, imageId: null, ...defaultClipLayout("reply"), imageTransform: { scale: 100, x: 0, y: 0 },
    });
  }
  for (const a of extraAssetsForGroup(db, sourceGroup.id)) {
    clips.push({
      id: id("extra"), stage: "extra", sourceVideoId: a.id, sourceTitle: a.title, person: personTagFromTitle(a.title),
      title: a.title, hookText: "", subtitle: "Transcription en attente",
      musicId: null, brollId: null, imageId: null, ...defaultClipLayout("extra"), imageTransform: { scale: 100, x: 0, y: 0 },
    });
  }
  return clips;
};

const ensureAutoProject = async (db, groupId) => {
  const sourceGroup = getVideoGroups(db.assets).find((g) => g.id === groupId);
  if (!sourceGroup?.person1?.filePath) return null; // person2 OPTIONAL (rush simple = solo)
  // The COMPLETE clip count this group should render: intro + (reply) + extras.
  const expectedCount = 1 + (sourceGroup.person2?.filePath ? 1 : 0) + extraAssetsForGroup(db, groupId).length;
  // Pick the project that already covers every segment. A stale 2-clip project
  // (e.g. one created by POST /api/projects before it was montage-aware) must NOT
  // shadow the full montage — so require clips.length >= expectedCount, not just
  // the first match. If none qualifies, create a fresh COMPLETE one below.
  const existing = db.projects
    .filter((p) => p.sourceGroupId === groupId)
    .find((p) => (p.clips || []).length >= expectedCount);
  if (existing) return existing;
  const now = new Date().toISOString();
  const settings = defaultProjectSettings();
  const project = normalizeProject({
    id: id("project"),
    title: `Auto ${sourceGroup.title}`,
    description: sourceGroup.note || "Projet auto Klimax",
    status: "draft", render_progress: 0, created_at: now, updated_at: now,
    sourceGroupId: sourceGroup.id, settings,
    clips: buildClipsForGroup(db, sourceGroup, settings),
  });
  db.projects.unshift(project);
  await writeDb(db);
  return project;
};

// Render every not-yet-ready item of a job. Variants are re-derived from the stored
// params so a resumed job reproduces them exactly. Renders run with a small worker
// pool (AUTO_RENDER_CONCURRENCY at a time) — ffmpeg is heavy but parallelises well.
// 3 on an 8-core mac: each ffmpeg render uses ~2.7 cores (filtergraph + x264 superfast),
// so 3 keeps the cores busy WITHOUT oversubscribing. 4 thrashed (encodes ballooned from
// ~22s to ~160s under contention in profiling). Tunable via KLIMAX_AUTO_CONCURRENCY.
const AUTO_RENDER_CONCURRENCY = clamp(Math.round(safeNumber(process.env.KLIMAX_AUTO_CONCURRENCY, 3)), 1, 6);
// GLOBAL ffmpeg slot pool — shared across jobs, so two concurrent batches (or a
// resume of several) can never stack 2 pools × 2 ffmpeg and overload the machine.
let renderSlotsInUse = 0;
const renderSlotWaiters = [];
const acquireRenderSlot = () =>
  new Promise((resolve) => {
    if (renderSlotsInUse < AUTO_RENDER_CONCURRENCY) { renderSlotsInUse += 1; resolve(); }
    else renderSlotWaiters.push(resolve);
  });
const releaseRenderSlot = () => {
  const next = renderSlotWaiters.shift();
  if (next) next();
  else renderSlotsInUse = Math.max(0, renderSlotsInUse - 1);
};
// Bumped whenever buildVariant's rng draw ORDER changes (e.g. safe-zone layout v2):
// a job planned under another version would re-derive DIFFERENT variants on resume,
// silently mismatching its stored combo/decisions — refuse to resume it instead.
// v4: per-person framing cache (clip 1 == clip 3 for the same speaker) + solo X stored
// natural (renderer negates under mirror). Output of 3+-clip and mirrored variants changed.
// v5: 2nd-speaker token fix — the hook's incrusted speaker is now correctly the OTHER
// person (Julien hook -> Vasko, Vasko hook -> Julien); changes dualSpeakerSource.
// v6: hook bubble pinned to the split SEAM (between the two speakers) instead of
// drifting up to ±150px to dodge faces; changes intro.hookPosition.y on split variants.
// v7: captions are mouth-safe (always below the speaker's mouth + margin) with a base
// offset + per-render vertical jitter; b-roll square gets ±3% size jitter.
const AUTO_ENGINE_VERSION = 7;

const processAutoJob = async (job) => {
  if (job._running) return;
  job._running = true;
  try {
    if ((job.engineVersion || 1) !== AUTO_ENGINE_VERSION) {
      console.warn(`[auto] job ${job.id}: moteur v${job.engineVersion || 1} ≠ v${AUTO_ENGINE_VERSION} — reprise refusée, relance un nouveau batch.`);
      for (const it of job.items) {
        if (it.status !== "ready") { it.status = "failed"; it.error = "Moteur auto mis à jour — relance un nouveau batch."; }
      }
      job.done = jobDoneCount(job);
      job.finishedAt = job.finishedAt || new Date().toISOString();
      return;
    }
    const { planVideoVariants } = await import("./autoVariants.mjs");

    // 0) Clean/quarantine every b-roll once (globally serialised), THEN read fresh db
    //    so the work list excludes any quarantined file.
    await normalizeBrollPoolOnce();
    const db = await readDb();
    const p = job.params;

    // 1) Re-derive the full flat work list (variant params per item).
    const work = [];
    for (const pid of p.projectIds) {
      const project = db.projects.find((x) => x.id === pid);
      if (!project) continue;
      const sourceGroup = getVideoGroups(db.assets).find((g) => g.id === project.sourceGroupId);
      if (!sourceGroup?.person1?.filePath) continue; // person2 optional (rush simple = solo)
      // Load the full transcription ONCE (db.json keeps only a stub) so every variant
      // reuses it instead of rebuilding per render. Rebuilds from per-asset transcripts
      // if the file is missing.
      await hydrateTranscript(db, project, sourceGroup);
      const liveBanks = {
        speakers: db.assets.filter((a) => a.category === "speaker"),
        brolls: db.assets.filter((a) => a.category === "broll" && !a.broken),
        images: db.assets.filter((a) => a.category === "image"),
        music: db.assets.filter((a) => a.category === "music"),
      };
      // Prefer the PLANNING-TIME snapshots (see /api/auto/generate): a resumed job
      // must reproduce the exact same variants even if the project or the banks
      // changed since. Face detection still needs the live assets (file paths).
      const snapBanks = (p.banksByProject || {})[pid];
      const banks = {
        ...(snapBanks || liveBanks),
        hooks: (job.hooksByProject || {})[pid] || [],
      };
      const faceBoxes = await detectFacesForSources(sourceGroup, liveBanks);
      const snapBase = (p.baseByProject || {})[pid];
      const plan = planVideoVariants({
        base: snapBase || {
          settings: project.settings || {},
          clips: project.clips || [],
          sourceNames: { person1: sourceGroup.person1?.title, person2: sourceGroup.person2?.title },
        },
        videoId: pid, requested: p.variantsPerVideo, varied: p.varied, lockSplitScreen: p.lockSplitScreen, banks, faceBoxes, overrides: p.plannerOverrides || {},
      });
      for (const v of plan.variants) {
        const item = job.items.find((it) => it.id === `${job.id}-${pid}-${v.index}`);
        if (!item || item.status === "ready") continue;
        if (!item.decisions) item.decisions = v.decisions; // backfill for jobs created before this field
        work.push({ item, project, sourceGroup, variant: v, pid });
      }
    }

    // 2) Worker pool: N concurrent renders.
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const slot = cursor < work.length ? work[cursor++] : null;
        if (!slot) return;
        const { item, project, sourceGroup, variant: v, pid } = slot;
        await acquireRenderSlot(); // global cap across ALL jobs
        item.status = "rendering"; await saveAutoJobs();
        try {
          const variantProject = {
            id: `${pid}-auto-${v.index}-${Date.now()}`,
            sourceGroupId: project.sourceGroupId,
            settings: mergeProjectSettings({ ...v.settings, hookAutoGenerated: true, brollRotation: v.index }), // skip in-render hook regen; rotate b-roll theme per variant
            clips: v.clips,
            transcription: project.transcription, // reuse cached transcription -> no re-transcribe, 0 tokens
          };
          const exported = await renderProject(db, variantProject, sourceGroup);
          item.status = "ready"; item.url = exported.url; item.path = exported.path; item.error = null;
        } catch (e) {
          // Salvage: a bad b-roll shouldn't waste the slot — retry once WITHOUT b-roll
          // before marking the variant failed.
          try {
            const salvageProject = {
              id: `${pid}-auto-${v.index}-salvage-${Date.now()}`,
              sourceGroupId: project.sourceGroupId,
              settings: mergeProjectSettings({ ...v.settings, brollEnabled: false, hookAutoGenerated: true }),
              clips: v.clips.map((c) => ({ ...c, brollId: null, imageId: null, autoBrollId: null })),
              transcription: project.transcription,
            };
            const exported = await renderProject(db, salvageProject, sourceGroup);
            item.status = "ready"; item.url = exported.url; item.path = exported.path; item.error = null; item.salvaged = true;
            // Decisions must reflect what ACTUALLY rendered: the salvage stripped the
            // b-roll, so don't show one in the UI / feed one to the training loop.
            if (item.decisions) item.decisions = { ...item.decisions, brollId: null, brollStyle: null };
            console.warn("[auto] variant salvaged without b-roll:", e.message);
          } catch (e2) {
            item.status = "failed"; item.error = String(e.message || e).slice(0, 300);
            console.error("[auto] variant render failed (salvage too):", e2.message);
          }
        } finally {
          releaseRenderSlot();
        }
        job.done = jobDoneCount(job); await saveAutoJobs();
      }
    };
    await Promise.all(Array.from({ length: Math.min(AUTO_RENDER_CONCURRENCY, work.length || 1) }, worker));
    job.finishedAt = new Date().toISOString();

    // Google Drive: one folder per batch, every READY variant uploaded into it.
    // The UI polls job.drive {status, link, uploaded, total} to animate the step.
    try {
      const { isDriveConfigured, uploadBatchToDrive } = await import("./driveUpload.mjs");
      const readyFiles = job.items
        .filter((it) => it.status === "ready" && it.path && fsSync.existsSync(it.path))
        .map((it, i) => ({ path: it.path, name: `${String(it.source || "variante").replace(/[^\w\- ]+/g, "").trim() || "variante"} - v${(it.index ?? i) + 1}.mp4` }));
      if (!isDriveConfigured() || !readyFiles.length) {
        if (job.drive?.status !== "done") job.drive = { status: "skipped", uploaded: 0, total: readyFiles.length, link: null, error: null };
      } else if (job.drive?.status !== "done") {
        const stamp = new Date();
        const folderName = `Klimax ${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")} ${String(stamp.getHours()).padStart(2, "0")}h${String(stamp.getMinutes()).padStart(2, "0")} (${readyFiles.length} vidéos)`;
        job.drive = { status: "uploading", uploaded: 0, total: readyFiles.length, link: null, error: null };
        await saveAutoJobs();
        const result = await uploadBatchToDrive({
          folderName,
          files: readyFiles,
          onProgress: (uploaded, total) => {
            job.drive = { ...job.drive, uploaded, total };
            saveAutoJobs();
          },
        });
        job.drive = { status: "done", uploaded: result.uploaded, total: result.total, link: result.folderLink, error: null };
        console.log(`[drive] batch ${job.id}: ${result.uploaded}/${result.total} → ${result.folderLink}`);
      }
    } catch (error) {
      job.drive = { status: "failed", uploaded: job.drive?.uploaded || 0, total: job.drive?.total || 0, link: null, error: String(error.message || error).slice(0, 200) };
      console.error("[drive] upload du batch échoué:", error.message);
    }
  } finally {
    job._running = false;
    await saveAutoJobs();
  }
};

// On startup: resume any batch that didn't finish (requeue interrupted renders).
const resumeAutoJobs = async () => {
  await loadAutoJobs();
  for (const job of autoJobs.values()) {
    for (const it of job.items) if (it.status === "rendering") it.status = "queued";
    job.done = jobDoneCount(job);
    if (jobDoneCount(job) < job.total) processAutoJob(job).catch(() => {});
  }
  await saveAutoJobs();
};

// Shared planning core for /api/auto/generate AND /api/auto/plan — ONE deterministic
// path so the preview ("mode paramètre") shows EXACTLY what generate would render.
// Ensures auto-projects + transcription, then plans variants per project. Returns a
// per-project array with the full plan + the light bank snapshot generate persists.
// Does NOT create a job or render. `genHooks` can be disabled (preview re-runs) — the
// hooks bank only feeds the hook TEXT, so without it variants fall back to style-only.
const parseAutoBatchParams = (body) => ({
  videoGroupIds: Array.isArray(body?.videoGroupIds) ? body.videoGroupIds : [],
  projectIds: Array.isArray(body?.projectIds) ? body.projectIds : [],
  variantsPerVideo: clamp(Math.round(safeNumber(body?.variantsPerVideo, 6)), 1, 20),
  varied: body?.varied || { broll: true, subtitles: true, hook: true, sfx: false, zooms: false, music: true },
  lockSplitScreen: body?.lockSplitScreen === true,
  subtitleSizePx: body?.subtitleSizePx != null ? clamp(Math.round(safeNumber(body.subtitleSizePx, 0)), 30, 120) : 0,
});

const buildAutoPlan = async (db, { videoGroupIds, projectIds, variantsPerVideo, varied, lockSplitScreen, subtitleSizePx, plannerOverrides, genHooks = true, assetPools = null, hookBank = null }) => {
  const { planVideoVariants } = await import("./autoVariants.mjs");
  // Assemble/reuse a project per video pair and transcribe it (whisper) — A→Z.
  const allProjectIds = [...projectIds];
  for (const gid of videoGroupIds) {
    const proj = await ensureAutoProject(db, gid);
    if (proj && !allProjectIds.includes(proj.id)) allProjectIds.push(proj.id);
  }
  for (const pid of allProjectIds) {
    const project = db.projects.find((p) => p.id === pid);
    const sg = project && getVideoGroups(db.assets).find((g) => g.id === project.sourceGroupId);
    if (project && sg && project.transcription?.status !== "completed") {
      try { await ensureTranscription(project, sg, db.assets); } catch (e) { console.warn("[auto] transcription failed:", e.message); }
    }
  }
  await writeDb(db);

  const out = [];
  for (const pid of allProjectIds) {
    const project = db.projects.find((p) => p.id === pid);
    if (!project) continue;
    const sourceGroup = getVideoGroups(db.assets).find((g) => g.id === project.sourceGroupId);
    if (!sourceGroup?.person1?.filePath) continue; // person2 optional (rush simple = solo)

    const tc = project.transcription?.clips || [];
    const introCues = tc.find((c) => c.stage === "intro")?.cues || [];
    const replyCues = tc.find((c) => c.stage === "reply")?.cues || [];
    // A studio project's custom hook bank wins; otherwise generate hooks from the
    // transcript (when the hook dimension is varied).
    const customHooks = Array.isArray(hookBank) ? hookBank.map((h) => String(h || "").trim()).filter(Boolean) : [];
    let hooks = [];
    if (customHooks.length) {
      hooks = customHooks;
    } else if (genHooks && varied.hook && project.transcription?.status === "completed") {
      const introText = introCues.map((c) => c.text).join(" ");
      const replyText = replyCues.map((c) => c.text).join(" ");
      hooks = await genVariantHooks(introText, replyText, variantsPerVideo); // [] -> style-only fallback (C)
    }
    // A studio project can RESTRICT each pool to a chosen set of asset ids (null/absent
    // = the whole bank). The 2nd-speaker bank is never empty-filtered to nothing.
    const inPool = (ids) => (Array.isArray(ids) && ids.length ? (a) => ids.includes(a.id) : () => true);
    const banks = {
      speakers: db.assets.filter((a) => a.category === "speaker").filter(inPool(assetPools?.speakerIds)),
      brolls: db.assets.filter((a) => a.category === "broll" && !a.broken).filter(inPool(assetPools?.brollIds)),
      images: db.assets.filter((a) => a.category === "image").filter(inPool(assetPools?.imageIds)),
      music: db.assets.filter((a) => a.category === "music").filter(inPool(assetPools?.musicIds)),
      hooks,
    };
    const faceBoxes = await detectFacesForSources(sourceGroup, banks);
    // Apply the user's chosen subtitle px to the base so the planner honours it
    // (exact when subtitles are locked, ±7px jitter when varied).
    const baseSettings = { ...(project.settings || {}) };
    if (subtitleSizePx) {
      baseSettings.subtitleSize = subtitleSizePx;
      baseSettings.subtitleStyle = { ...(baseSettings.subtitleStyle || {}), fontSize: subtitleSizePx };
    }
    const base = {
      settings: baseSettings,
      clips: project.clips || [],
      sourceNames: { person1: sourceGroup.person1?.title, person2: sourceGroup.person2?.title },
    };
    const banksLight = {
      speakers: banks.speakers.map((a) => ({ id: a.id, title: a.title })),
      brolls: banks.brolls.map((a) => ({ id: a.id, title: a.title })),
      images: banks.images.map((a) => ({ id: a.id, title: a.title })),
      music: banks.music.map((a) => ({ id: a.id, title: a.title })),
    };
    const plan = planVideoVariants({
      base, videoId: pid, requested: variantsPerVideo, varied, lockSplitScreen, banks, faceBoxes, overrides: plannerOverrides,
    });
    // First ~3 caption cues per stage = a representative subtitle sample for the preview.
    const sampleOf = (cues) => cues.slice(0, 3).map((c) => c.text).join(" ").trim();
    out.push({
      pid, project, sourceGroup, hooks, base, banksLight, plan,
      subtitleSamples: { intro: sampleOf(introCues), reply: sampleOf(replyCues) },
    });
  }
  return { allProjectIds, perProject: out };
};

app.post("/api/auto/generate", async (req, res) => {
  await loadAutoJobs();
  const db = await readDb();
  const { videoGroupIds, projectIds, variantsPerVideo, varied, lockSplitScreen, subtitleSizePx, overrides, assetPools, hookBank } = await resolveBatchInputs(req.body);
  // Training mode: learned overrides narrow the deterministic picks. A studio project's
  // overrides fold on top. Snapshot the MERGED set on the job so a resumed/re-derived
  // job reproduces the exact same variants even if rules/projects change later.
  const plannerOverrides = { ...(await getPlannerOverrides()), ...(overrides || {}) };

  if (!videoGroupIds.length && !projectIds.length) return res.status(400).json({ error: "Aucune vidéo sélectionnée." });
  const { allProjectIds, perProject } = await buildAutoPlan(db, {
    videoGroupIds, projectIds, variantsPerVideo, varied, lockSplitScreen, subtitleSizePx, plannerOverrides, assetPools, hookBank,
  });

  const jobId = `auto-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const items = [];
  const hooksByProject = {};
  const achievablePerVideo = [];
  // Snapshot the planning inputs PER PROJECT on the job: a resumed job must re-derive
  // EXACTLY the same variants even if the base project's settings/clips or the asset
  // banks changed in the meantime (deterministic RNG only guarantees identity for
  // identical inputs). Banks are stored light (ids/titles) — picking only needs those.
  const baseByProject = {};
  const banksByProject = {};
  for (const { pid, project, hooks, base, banksLight, plan } of perProject) {
    hooksByProject[pid] = hooks;
    baseByProject[pid] = clone(base);
    banksByProject[pid] = banksLight;
    achievablePerVideo.push({ projectId: pid, source: project.title || pid, achievable: plan.variants.length, requested: variantsPerVideo });
    for (const v of plan.variants) {
      items.push({ id: `${jobId}-${pid}-${v.index}`, projectId: pid, source: project.title || pid, index: v.index, combo: v.combo, decisions: v.decisions, status: "queued", url: null });
    }
  }
  if (!items.length) return res.status(400).json({ error: "Aucune variante générable (vérifie sources + transcription)." });

  const job = {
    id: jobId, createdAt: new Date().toISOString(), finishedAt: null, total: items.length, done: 0,
    engineVersion: AUTO_ENGINE_VERSION,
    params: { projectIds: allProjectIds, variantsPerVideo, varied, lockSplitScreen, plannerOverrides, baseByProject, banksByProject }, hooksByProject, items,
  };
  autoJobs.set(jobId, job);
  await saveAutoJobs();
  processAutoJob(job).catch((e) => console.error("[auto] job failed:", e.message)); // background

  res.json({ jobId, total: job.total, items: job.items, achievablePerVideo });
});

// PLAN ONLY (mode paramètre / testing): same deterministic planning as /generate but
// renders NOTHING — returns each variant's full { settings, clips, decisions, combo }
// plus the source video URLs so the frontend can draw a parametric preview and let the
// user inspect/edit every random value (per-clip x/y/zoom, logo, subtitles, mirror…).
app.post("/api/auto/plan", async (req, res) => {
  try {
    const db = await readDb();
    const { videoGroupIds, projectIds, variantsPerVideo, varied, lockSplitScreen, subtitleSizePx, overrides, assetPools, hookBank } = await resolveBatchInputs(req.body);
    if (!videoGroupIds.length && !projectIds.length) return res.status(400).json({ error: "Aucune vidéo sélectionnée." });
    const plannerOverrides = { ...(await getPlannerOverrides()), ...(overrides || {}) };
    const { perProject } = await buildAutoPlan(db, {
      videoGroupIds, projectIds, variantsPerVideo, varied, lockSplitScreen, subtitleSizePx, plannerOverrides, assetPools, hookBank,
    });
    const lite = (asset) => (asset ? { id: asset.id, title: asset.title, fileUrl: asset.fileUrl } : null);
    const speakers = db.assets.filter((a) => a.category === "speaker").map(lite);
    const projects = perProject.map(({ pid, project, sourceGroup, plan, subtitleSamples }) => ({
      projectId: pid,
      source: project.title || pid,
      sources: { person1: lite(sourceGroup.person1), person2: lite(sourceGroup.person2), speakers },
      subtitleSamples,
      variants: plan.variants.map((v) => ({
        index: v.index, combo: v.combo, decisions: v.decisions, settings: v.settings, clips: v.clips,
      })),
    }));
    if (!projects.length) return res.status(400).json({ error: "Aucune variante planifiable (vérifie sources + transcription)." });
    res.json({ projects });
  } catch (e) {
    console.error("[auto] plan failed:", e.message);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/auto/jobs", async (_req, res) => {
  await loadAutoJobs();
  const jobs = [...autoJobs.values()]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 10).map(cleanJob);
  res.json({ jobs });
});

app.get("/api/auto/jobs/:jobId", async (req, res) => {
  await loadAutoJobs();
  const job = autoJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job introuvable." });
  res.json({ job: cleanJob(job) });
});

// "Tout télécharger": zip every READY variant of a job (system zip, -j flattens).
app.get("/api/auto/jobs/:jobId/download", async (req, res) => {
  await loadAutoJobs();
  const job = autoJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job introuvable." });
  const files = job.items
    .filter((it) => it.status === "ready" && it.path && fsSync.existsSync(it.path))
    .map((it) => it.path);
  if (!files.length) return res.status(400).json({ error: "Aucune variante prête." });
  const zipPath = path.join(tempRoot, `auto-${job.id}-${Date.now()}.zip`);
  try {
    await runProcess("/usr/bin/zip", ["-j", "-q", zipPath, ...files]);
    res.download(zipPath, `klimax-variantes-${job.id}.zip`, () => {
      fs.unlink(zipPath).catch(() => {});
    });
  } catch (e) {
    fs.unlink(zipPath).catch(() => {});
    res.status(500).json({ error: `Zip impossible: ${String(e.message || e).slice(0, 200)}` });
  }
});

// ---------------------------------------------------------------------------
// Batch presets + planification. A preset stores a full batch config (selection,
// variantes, dimensions variées) and can be scheduled daily at HH:MM — the runner
// re-posts /api/auto/generate so scheduled runs share the exact same pipeline.
// ---------------------------------------------------------------------------
const autoPresetsFile = path.join(dataRoot, "auto-presets.json");
const readAutoPresets = async () => {
  try { return JSON.parse(await fs.readFile(autoPresetsFile, "utf8")).presets || []; }
  catch { return []; }
};
const writeAutoPresets = async (presets) =>
  fs.writeFile(autoPresetsFile, JSON.stringify({ presets }, null, 2));

app.get("/api/auto/presets", async (_req, res) => {
  res.json({ presets: await readAutoPresets() });
});

app.post("/api/auto/presets", async (req, res) => {
  const presets = await readAutoPresets();
  const body = req.body || {};
  const preset = {
    id: body.id || `preset-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: String(body.name || "Preset").slice(0, 80),
    videoGroupIds: Array.isArray(body.videoGroupIds) ? body.videoGroupIds : [],
    variantsPerVideo: clamp(Math.round(safeNumber(body.variantsPerVideo, 6)), 1, 20),
    varied: body.varied || {},
    lockSplitScreen: body.lockSplitScreen === true,
    schedule: body.schedule && typeof body.schedule === "object"
      ? { enabled: body.schedule.enabled === true, time: /^\d{2}:\d{2}$/.test(body.schedule.time || "") ? body.schedule.time : "09:00" }
      : { enabled: false, time: "09:00" },
    lastRunDate: body.lastRunDate || null,
  };
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) presets[idx] = { ...presets[idx], ...preset };
  else presets.push(preset);
  await writeAutoPresets(presets);
  res.json({ presets });
});

app.delete("/api/auto/presets/:id", async (req, res) => {
  const presets = (await readAutoPresets()).filter((p) => p.id !== req.params.id);
  await writeAutoPresets(presets);
  res.json({ presets });
});

// Run a preset NOW (also used by the scheduler).
const runAutoPreset = async (preset) => {
  const resp = await fetch(`http://127.0.0.1:${port}/api/auto/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoGroupIds: preset.videoGroupIds,
      variantsPerVideo: preset.variantsPerVideo,
      varied: preset.varied,
      lockSplitScreen: preset.lockSplitScreen,
    }),
  });
  if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
  return resp.json();
};

app.post("/api/auto/presets/:id/run", async (req, res) => {
  const preset = (await readAutoPresets()).find((p) => p.id === req.params.id);
  if (!preset) return res.status(404).json({ error: "Preset introuvable." });
  try {
    res.json(await runAutoPreset(preset));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// ---------------------------------------------------------------------------
// STUDIO PROJECTS — a reusable, fully-configurable "project" per podcast: its
// source video pair(s), which asset pools it draws from, the dimensions that vary,
// and ALL the random RANGES (subtitle size, split %, zoom, logo, allowed presets,
// excluded filters, hook bank). Generation reads it via studioProjectId so the whole
// pipeline can be driven from the SaaS without touching code.
// ---------------------------------------------------------------------------
const studioProjectsFile = path.join(dataRoot, "studio-projects.json");
const readStudioProjects = async () => {
  try { return JSON.parse(await fs.readFile(studioProjectsFile, "utf8")).projects || []; }
  catch { return []; }
};
const writeStudioProjects = async (projects) =>
  fs.writeFile(studioProjectsFile, JSON.stringify({ projects }, null, 2));

const sanitizeStudioOverrides = (raw = {}) => {
  const ov = {};
  const numKeys = ["twoSpeakerRatio", "splitRatioMin", "splitRatioMax", "subtitleSizeMin", "subtitleSizeMax", "logoSizeMin", "logoSizeMax", "zoomMaxBoostPercent", "musicVolumeMaxDb"];
  for (const k of numKeys) if (typeof raw[k] === "number" && Number.isFinite(raw[k])) ov[k] = raw[k];
  if (Array.isArray(raw.allowedSubtitlePresets)) ov.allowedSubtitlePresets = raw.allowedSubtitlePresets.filter((x) => typeof x === "string");
  if (Array.isArray(raw.filterDenylist)) ov.filterDenylist = raw.filterDenylist.filter((x) => typeof x === "string");
  return ov;
};
const sanitizeStudioPools = (raw = {}) => {
  const out = {};
  for (const k of ["brollIds", "imageIds", "musicIds", "speakerIds"]) {
    out[k] = Array.isArray(raw[k]) ? raw[k].filter((x) => typeof x === "string") : null;
  }
  return out;
};
const normalizeStudioProject = (body, existing) => {
  const now = new Date().toISOString();
  return {
    id: body.id || existing?.id || `studio-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: String(body.name ?? existing?.name ?? "Projet").slice(0, 80),
    description: String(body.description ?? existing?.description ?? "").slice(0, 400),
    videoGroupIds: Array.isArray(body.videoGroupIds) ? body.videoGroupIds : existing?.videoGroupIds || [],
    variantsPerVideo: clamp(Math.round(safeNumber(body.variantsPerVideo, existing?.variantsPerVideo ?? 6)), 1, 20),
    varied: body.varied || existing?.varied || { broll: true, subtitles: true, hook: true, sfx: true, zooms: true, music: true },
    lockSplitScreen: body.lockSplitScreen != null ? body.lockSplitScreen === true : existing?.lockSplitScreen === true,
    overrides: sanitizeStudioOverrides(body.overrides || existing?.overrides || {}),
    assetPools: sanitizeStudioPools(body.assetPools || existing?.assetPools || {}),
    hookBank: Array.isArray(body.hookBank)
      ? body.hookBank.map((h) => String(h || "").trim()).filter(Boolean).slice(0, 40)
      : existing?.hookBank || [],
    // Multi-rush montage: an assembled N-clip KlimaxProject (P1/P2/P1/P2…). When set,
    // "Lancer" generates from it (with this studio project's DA/overrides) instead of a
    // 2-clip video group. renderClipStages = the per-clip stages, for the editor display.
    renderProjectId: typeof body.renderProjectId === "string" ? body.renderProjectId : (existing?.renderProjectId || null),
    renderClipStages: Array.isArray(body.renderClipStages) ? body.renderClipStages : (existing?.renderClipStages || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
};

app.get("/api/studio/projects", async (_req, res) => {
  res.json({ projects: await readStudioProjects() });
});
app.post("/api/studio/projects", async (req, res) => {
  const projects = await readStudioProjects();
  const existing = req.body?.id ? projects.find((p) => p.id === req.body.id) : null;
  const project = normalizeStudioProject(req.body || {}, existing);
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  await writeStudioProjects(projects);
  res.json({ project, projects });
});
app.delete("/api/studio/projects/:id", async (req, res) => {
  const projects = (await readStudioProjects()).filter((p) => p.id !== req.params.id);
  await writeStudioProjects(projects);
  res.json({ projects });
});
app.post("/api/studio/projects/:id/run", async (req, res) => {
  const project = (await readStudioProjects()).find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable." });
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/auto/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studioProjectId: project.id, variantsPerVideo: req.body?.variantsPerVideo }),
    });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// MULTI-RUSH: assemble a real N-clip project from an ORDERED list of video-asset ids
// (the rushes, in conversation order). clip 1 = intro (hook), clip 2 = reply (distinct
// DA), clips 3+ = "extra" (shared DA, per-person consistent zoom). Each clip carries
// sourceVideoId + sourceTitle + person so the engine frames per speaker. The project
// then generates via the normal auto pipeline (pass its id as projectIds).
const personTagFromTitle = (title) => {
  const t = String(title || "").toLowerCase();
  if (t.includes("vasko")) return "vasko";
  if (t.includes("shelly")) return "shelly";
  if (t.includes("julien")) return "julien";
  return "host";
};
// Build (and transcribe) an N-clip project from ordered video assets. Mutates db
// (creates a pair group from the first two rushes when none is given). Returns project.
const assembleMultirushProject = async (db, name, seqAssets, sourceGroupId = null) => {
  let groupId = sourceGroupId;
  let sg = groupId ? getVideoGroups(db.assets).find((g) => g.id === groupId) : null;
  if (!sg?.person1?.filePath || !sg?.person2?.filePath) {
    // Put ALL rushes in ONE montage group: clip1=person1, clip2=person2, the rest are
    // "extra" (hidden from the bank by getVideoGroups). Render resolves extras by id.
    groupId = id("video-group");
    seqAssets.forEach((a, i) => {
      a.groupId = groupId;
      a.groupTitle = name;
      a.videoPart = i === 0 ? "person1" : i === 1 ? "person2" : "extra";
      a.clipIndex = i; // conversation order, so a montage group rebuilds the N clips in order
    });
    sg = getVideoGroups(db.assets).find((g) => g.id === groupId);
  }
  const settings = defaultProjectSettings();
  const clips = seqAssets.map((a, i) => {
    const stage = i === 0 ? "intro" : i === 1 ? "reply" : "extra";
    return {
      id: id(stage), stage, sourceVideoId: a.id, sourceTitle: a.title, person: personTagFromTitle(a.title),
      title: a.title, hookText: i === 0 ? settings.hookText : "", subtitle: "Transcription en attente",
      musicId: null, brollId: null, imageId: null, ...defaultClipLayout(stage), imageTransform: { scale: 100, x: 0, y: 0 },
    };
  });
  const now = new Date().toISOString();
  const project = normalizeProject({
    id: id("project"), title: name, description: "Multi-rush podcast (P1/P2 alternés)",
    status: "draft", render_progress: 0, created_at: now, updated_at: now, sourceGroupId: groupId, settings, clips,
  });
  db.projects.unshift(project);
  await writeDb(db);
  try { await ensureTranscription(project, sg, db.assets); await writeDb(db); }
  catch (e) { console.warn("[multirush] transcription:", e.message); }
  return { project, groupId, clips };
};

// Assemble from EXISTING ordered video-asset ids.
app.post("/api/projects/multirush", async (req, res) => {
  try {
    const db = await readDb();
    const name = String(req.body?.name || "Multi-rush").slice(0, 80);
    const sequence = Array.isArray(req.body?.sequence) ? req.body.sequence.filter((x) => typeof x === "string") : [];
    if (sequence.length < 2) return res.status(400).json({ error: "Au moins 2 rushs (P1 + P2)." });
    const byId = new Map(db.assets.filter((a) => a.category === "video").map((a) => [a.id, a]));
    const seqAssets = sequence.map((sid) => byId.get(sid)).filter((a) => a?.filePath);
    if (seqAssets.length < 2) return res.status(400).json({ error: "Rushs vidéo introuvables." });
    const { project, groupId, clips } = await assembleMultirushProject(db, name, seqAssets, req.body?.sourceGroupId || null);
    res.json({ projectId: project.id, sourceGroupId: groupId, clipCount: clips.length, stages: clips.map((c) => c.stage) });
  } catch (e) {
    console.error("[multirush]", e.message);
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// Upload N rush files (in order) AND assemble the project in one call.
app.post("/api/projects/multirush-upload", upload.array("rushes", 30), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length < 2) return res.status(400).json({ error: "Envoie au moins 2 rushs (P1 + P2)." });
    const db = await readDb();
    const name = String(req.body?.name || "Multi-rush").slice(0, 80);
    // Each uploaded file -> a standalone video asset (the first two are paired by the
    // assembler). Keep the upload ORDER (= conversation order).
    const seqAssets = files.map((f) =>
      assetFromFile({ file: f, category: "video", groupId: id("video-group"), groupTitle: f.originalname, videoPart: "person1", note: "rush" })
    );
    db.assets.unshift(...seqAssets);
    await writeDb(db);
    // Transcribe every rush NOW and store on the asset, BEFORE assembling — so the
    // project's ensureTranscription reuses them instead of re-running Whisper.
    for (const a of seqAssets) await ensureAssetTranscript(a);
    await writeDb(db);
    const { project, groupId, clips } = await assembleMultirushProject(db, name, seqAssets, null);
    // If tied to a studio project, attach this montage so "Lancer" renders it with the DA.
    const studioProjectId = req.body?.studioProjectId || null;
    if (studioProjectId) {
      const projects = await readStudioProjects();
      const idx = projects.findIndex((p) => p.id === studioProjectId);
      if (idx >= 0) {
        projects[idx] = { ...projects[idx], renderProjectId: project.id, renderClipStages: clips.map((c) => c.stage), updatedAt: new Date().toISOString() };
        await writeStudioProjects(projects);
      }
    }
    res.json({ projectId: project.id, sourceGroupId: groupId, clipCount: clips.length, stages: clips.map((c) => c.stage), studioProjectId });
  } catch (e) {
    console.error("[multirush-upload]", e.message);
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// Resolve a batch request body into full planning inputs, merging a studio project
// (if studioProjectId is given) under any explicit body fields, and folding the
// studio's overrides into the learned-rule planner overrides.
const resolveBatchInputs = async (body) => {
  const base = parseAutoBatchParams(body);
  let overrides = {};
  let assetPools = null;
  let hookBank = null;
  if (body?.studioProjectId) {
    const studio = (await readStudioProjects()).find((p) => p.id === body.studioProjectId);
    if (studio) {
      if (body.videoGroupIds == null) base.videoGroupIds = studio.videoGroupIds || [];
      // A studio project with a multi-rush montage renders THAT N-clip project (with the
      // studio's DA/overrides) — unless explicit projectIds/videoGroupIds were passed.
      if (studio.renderProjectId && body.projectIds == null && (body.videoGroupIds == null && !(studio.videoGroupIds || []).length)) {
        base.projectIds = [studio.renderProjectId];
      }
      if (body.variantsPerVideo == null) base.variantsPerVideo = clamp(Math.round(safeNumber(studio.variantsPerVideo, 6)), 1, 20);
      if (body.varied == null) base.varied = studio.varied || base.varied;
      if (body.lockSplitScreen == null) base.lockSplitScreen = studio.lockSplitScreen === true;
      overrides = { ...studio.overrides };
      assetPools = studio.assetPools || null;
      hookBank = studio.hookBank || null;
    }
  }
  if (body?.overrides) overrides = { ...overrides, ...sanitizeStudioOverrides(body.overrides) };
  if (body?.assetPools) assetPools = sanitizeStudioPools(body.assetPools);
  if (Array.isArray(body?.hookBank)) hookBank = body.hookBank;
  return { ...base, overrides, assetPools, hookBank };
};

// MODE VIDÉO AI (dashboard home): the user describes in plain language what they want;
// Claude maps it to a batch config (which dimensions vary, how many videos, and the
// random RANGES), then we launch generation — optionally bound to a studio project.
app.post("/api/auto/ai-request", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Décris ce que tu veux." });
  const studioProjectId = req.body?.studioProjectId || null;
  const videoGroupIds = Array.isArray(req.body?.videoGroupIds) ? req.body.videoGroupIds : null;
  const projectIds = Array.isArray(req.body?.projectIds) ? req.body.projectIds : null;
  // An explicit "nombre de vidéos" from the UI wins over whatever Claude infers.
  const forcedCount = req.body?.variantsPerVideo != null ? clamp(Math.round(safeNumber(req.body.variantsPerVideo, 6)), 1, 20) : null;
  const presetKeys = ["impact", "clean", "highlight", "capcut", "punch", "neon", "hormozi", "bebasGold", "iceBlue", "redAlert", "cleanMinimal", "tiktokWhite", "tiktokBlack", "tiktokRed", "capcutYellow", "capcutKaraoke", "karaokeGreen", "tiktokOutline", "bebasCaps"];
  const system =
    "Tu configures un générateur de vidéos courtes (podcast → shorts verticaux). À partir de la DEMANDE en langage naturel, produis la config du lot. " +
    'Réponds UNIQUEMENT en JSON: {"variantsPerVideo":<1-20>,"varied":{"broll":bool,"subtitles":bool,"hook":bool,"sfx":bool,"zooms":bool,"music":bool},"overrides":{...},"summary":"<1 phrase FR>"}. ' +
    "overrides (tous optionnels): twoSpeakerRatio (0-1, fréquence du split 2 speakers), splitRatioMin/splitRatioMax (0.2-0.8), subtitleSizeMin/subtitleSizeMax (40-110), zoomMaxBoostPercent (0-30), logoSizeMin/logoSizeMax (400-1000), musicVolumeMaxDb (-30 à -8), allowedSubtitlePresets (sous-ensemble de: " +
    presetKeys.join(", ") +
    "), filterDenylist (filtres couleur à exclure). N'inclus que les overrides pertinents à la demande. Si la demande veut un nombre précis de vidéos, mets-le dans variantsPerVideo. summary = ce que tu as réglé.";
  let cfg = { variantsPerVideo: 6, varied: { broll: true, subtitles: true, hook: true, sfx: true, zooms: true, music: true }, overrides: {}, summary: "" };
  try {
    const raw = await runClaude(`DEMANDE:\n${prompt.slice(0, 1200)}`, system);
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.variantsPerVideo) cfg.variantsPerVideo = clamp(Math.round(safeNumber(parsed.variantsPerVideo, 6)), 1, 20);
      if (parsed.varied && typeof parsed.varied === "object") {
        for (const k of ["broll", "subtitles", "hook", "sfx", "zooms", "music"]) if (typeof parsed.varied[k] === "boolean") cfg.varied[k] = parsed.varied[k];
      }
      cfg.overrides = sanitizeStudioOverrides(parsed.overrides || {});
      cfg.summary = String(parsed.summary || "").slice(0, 240);
    }
  } catch (e) {
    console.warn("[auto] ai-request mapping failed, using defaults:", e.message);
  }
  if (forcedCount != null) cfg.variantsPerVideo = forcedCount;
  // Launch generation through the normal pipeline (studio defaults + AI config on top).
  try {
    const genBody = { studioProjectId, variantsPerVideo: cfg.variantsPerVideo, varied: cfg.varied, overrides: cfg.overrides };
    if (videoGroupIds) genBody.videoGroupIds = videoGroupIds;
    if (projectIds) genBody.projectIds = projectIds;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auto/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(genBody),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: data.error || `HTTP ${resp.status}` });
    res.json({ ...data, summary: cfg.summary, config: cfg });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// ---------------------------------------------------------------------------
// TRAINING MODE — the feedback loop. The user writes free-text feedback on a
// generated variant; Claude distills it into persistent learned rules (text for
// hooks/b-roll prompts, params for the deterministic planner) that auto-apply on
// the next /api/auto/generate run. See learnedRules.mjs.
// ---------------------------------------------------------------------------

// List every learned rule + the resolved planner overrides + recent history.
app.get("/api/training/rules", async (_req, res) => {
  const store = await readLearnedRules();
  res.json({ rules: store.rules, overrides: await getPlannerOverrides(), history: store.history.slice(0, 20), updatedAt: store.updatedAt });
});

// Submit feedback on a job/item -> distill -> persist -> return what was learned.
app.post("/api/training/feedback", async (req, res) => {
  const feedback = String(req.body?.feedback || "").trim();
  if (!feedback) return res.status(400).json({ error: "Feedback vide." });
  const { jobId = null, itemId = null } = req.body || {};

  // Pull the actual decisions for this item (context for the distillation).
  let decisions = req.body?.decisions || null;
  if (!decisions && jobId) {
    await loadAutoJobs();
    const job = autoJobs.get(jobId);
    const item = job && (itemId ? job.items.find((it) => it.id === itemId) : job.items.find((it) => it.status === "ready") || job.items[0]);
    decisions = item?.decisions || null;
  }

  try {
    const result = await ingestFeedback({ feedback, decisions, jobId, itemId });
    const store = result.store;
    res.json({
      added: result.added, removed: result.removed, distilled: result.distilled,
      rules: store.rules, overrides: await getPlannerOverrides(), history: store.history.slice(0, 20),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
});

app.delete("/api/training/rules/:id", async (req, res) => {
  const { store, removed } = await deleteRule(req.params.id);
  if (!removed) return res.status(404).json({ error: "Règle introuvable." });
  res.json({ rules: store.rules, overrides: await getPlannerOverrides() });
});

app.post("/api/training/rules/clear", async (_req, res) => {
  const { store } = await clearAllRules();
  res.json({ rules: store.rules, overrides: await getPlannerOverrides() });
});

// Scheduler: every minute, launch any enabled preset whose HH:MM just passed and
// that hasn't run today yet.
// DISABLED by default (KLIMAX_AUTO_SCHEDULER!=="1") so NO planned generation ever runs
// on its own — auto batches only happen when YOU click "Générer" (manual). Set the env
// flag to re-enable timed presets.
const AUTO_SCHEDULER_ENABLED = process.env.KLIMAX_AUTO_SCHEDULER === "1";
if (AUTO_SCHEDULER_ENABLED) setInterval(async () => {
  try {
    const presets = await readAutoPresets();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    // Local date (not UTC) so the once-a-day guard flips at local midnight.
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let changed = false;
    for (const preset of presets) {
      if (!preset.schedule?.enabled || preset.lastRunDate === today) continue;
      if (hhmm < preset.schedule.time) continue;
      preset.lastRunDate = today;
      changed = true;
      runAutoPreset(preset)
        .then(() => console.log(`[auto] preset planifié lancé: ${preset.name}`))
        .catch((e) => console.error(`[auto] preset planifié échec (${preset.name}):`, e.message));
    }
    if (changed) await writeAutoPresets(presets);
  } catch { /* next tick */ }
}, 60_000).unref();

await Promise.all([
  ensureDir(uploadRoot),
  ensureDir(renderRoot),
  ensureDir(textRoot),
  ensureDir(systemRoot),
  ensureDir(tempRoot),
]);

// SINGLE-WRITER GUARD. The backend can be (re)spawned by an external supervisor
// (e.g. Conductor) while another instance is already live — and the data dir
// (db.json, auto-jobs.json) is HARDCODED and shared. Two instances that both
// read→mutate→write db.json race, and a stale snapshot from a duplicate's
// startup `compactDb()` silently CLOBBERS the live instance's uploads (the
// recurring "assets vanished" bug). Fix: bind the port FIRST, and run every
// db-mutating startup step (seed/compact/resume) ONLY after we own the port.
// A duplicate that can't bind exits immediately, before touching db.json.
const httpServer = app.listen(port, "127.0.0.1");
httpServer.on("error", (e) => {
  if (e && e.code === "EADDRINUSE") {
    console.error(`[klimax] port ${port} already in use — another backend instance owns it. Exiting WITHOUT touching db.json (avoids data races).`);
    process.exit(0);
  }
  console.error("[klimax] listen failed:", e?.message || e);
  process.exit(1);
});
httpServer.on("listening", async () => {
  console.log(`Klimax local backend: http://127.0.0.1:${port}`);
  // We own the port → safe to seed/compact/resume. Wrapped so a maintenance
  // hiccup never crashes the live server.
  try {
    await ensureSystemAssets();
    await seedTailleVideos();
    await migrateTranscriptsOnce(); // split inline transcripts to files + compact db.json
    await pruneRenders(); // bound the renders/ folder so it can't fill the disk
  } catch (e) {
    console.error("[klimax] startup maintenance failed:", e?.message || e);
  }
  // Resume any Automatic-Mode batch interrupted by a previous shutdown.
  resumeAutoJobs().catch((e) => console.error("[auto] resume failed:", e.message));
  // Start the local Supabase-compatible shim (auth + rest + storage on 54321)
  // so the front-end uses real Postgres-backed auth/db/storage without any
  // external service. Disable with KLIMAX_SUPABASE_ENABLED=0.
  if (process.env.KLIMAX_SUPABASE_ENABLED !== "0") {
    try {
      const { start: startShim } = await import("../local-supabase/server.mjs");
      await startShim();
    } catch (e) {
      console.error("[local-supabase] failed to start:", e.message);
    }
  }
});
