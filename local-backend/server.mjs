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
const whisperModelName = process.env.KLIMAX_WHISPER_MODEL || "tiny";
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
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
  } catch {
    const fresh = normalizeDb({ assets: [], projects: [] });
    await fs.writeFile(dbPath, JSON.stringify(fresh, null, 2));
    return fresh;
  }
};

const writeDb = async (db) => {
  await ensureDir(dataRoot);
  await fs.writeFile(dbPath, JSON.stringify(normalizeDb(db), null, 2));
};

const compactDb = async () => {
  if (!fsSync.existsSync(dbPath)) return;
  const db = await readDb();
  await writeDb(db);
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

const runProcess = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
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
const probeMediaDurationSec = async (filePath) => {
  try {
    const probe = await ffprobeJson(filePath);
    return safeNumber(probe.format?.duration, 0);
  } catch {
    return 0;
  }
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

const sourceAssetForClip = (sourceGroup, clip) => {
  if (!sourceGroup) return null;
  if (clip?.sourceVideoId === sourceGroup.person2?.id) return sourceGroup.person2;
  if (clip?.sourceVideoId === sourceGroup.person1?.id) return sourceGroup.person1;
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
const SFX_FAHH_KEY = "effect_fahhh";
const SFX_FAHH_VOLUME_DB = -19;
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
  let lastKey = null;
  const plan = chosen.map((cand) => {
    let key = poolKeys[Math.floor(Math.random() * poolKeys.length)];
    if (poolKeys.length > 1 && key === lastKey) {
      key = poolKeys[(poolKeys.indexOf(key) + 1) % poolKeys.length];
    }
    lastKey = key;
    const volumeDb = key === SFX_FAHH_KEY ? SFX_FAHH_VOLUME_DB : SFX_EFFECT_VOLUME_DB;
    return { clipIndex: cand.clipIndex, time: cand.time, key, volumeDb, word: cand.word };
  });
  return plan;
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const buildAutoZoomEvents = (clip, clipDuration, settings) => {
  const events = [];
  const duration = Math.max(0.1, safeNumber(clipDuration, 0));
  const zoomDuration = clamp(safeNumber(settings.autoZoomDurationSeconds, 2), 0.6, 4);
  const zoomBoost = clamp(safeNumber(settings.autoZoomBoostPercent, 20), 5, 60) / 100;

  if (
    settings.autoZoomEnabled !== false &&
    clip?.stage === "reply" &&
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
  // Smooth, jitter-free zoom at 2x supersampling: scale the clip UP by the zoom
  // expression (2160x3840 at zoom=1, larger as it zooms in), crop a FIXED
  // 2160x3840 window centred on the clip, then downscale once to 1080x1920.
  // A fixed-size crop keeps the filter chain stable — a per-frame-varying crop
  // size makes ffmpeg fail ("reinitializing filters") — and the 2x resolution
  // turns the per-frame integer crop offset into a sub-pixel move at output, so
  // there's no stair-stepping/jitter. x is centred; y uses vAnchor (0.5 = centre).
  filterChains.push(
    `[${inputTag}]scale=w='2160*(${escaped})':h='3840*(${escaped})':eval=frame:flags=bicubic,` +
      `crop=2160:3840:(in_w-2160)/2:(in_h-3840)*${vAnchor.toFixed(3)},` +
      `scale=1080:1920:flags=lanczos,setsar=1[${outputTag}]`
  );
};

const createSourceFingerprint = async (project, sourceGroup) => {
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const parts = [
    transcriptionPipelineVersion,
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

const ensureTranscription = async (project, sourceGroup) => {
  const fingerprint = await createSourceFingerprint(project, sourceGroup);
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

  for (const asset of [sourceGroup?.person1, sourceGroup?.person2].filter(Boolean)) {
    const { result: raw } = await transcribeFile(asset.filePath);
    const words = normalizeLogoWords(
      buildWordsFromTranscription(raw),
      project.settings?.logoTriggerWord || "klimax"
    );
    const cues = buildCaptionCues(words, subtitleStyle.wordsPerLine);
    const duration = safeNumber(raw.duration, 0);
    bySource.set(asset.id, {
      sourceVideoId: asset.id,
      language: raw.language || "unknown",
      duration,
      cues,
      words,
      logoMoments: buildLogoMoments(words, project.settings?.logoTriggerWord || "klimax", duration, raw.segments || cues),
    });
  }

  const clips = project.clips.map((clip) => {
    const asset = sourceAssetForClip(sourceGroup, clip);
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
      const variationSeed = Math.random().toString(36).slice(2, 8);
      const system =
        "Tu es monteur de vidéos courtes. On te donne le début (transcript) d'un clip où une personne pose une question ou lance un sujet. " +
        "Génère UN hook court et accrocheur à afficher en gros à l'écran : reformule la question/accroche de départ. " +
        "Règles strictes : une seule phrase, 8 mots max (sans compter l'emoji), en français, sans guillemets, sans ponctuation superflue. " +
        "Termine OBLIGATOIREMENT le hook par EXACTEMENT UN emoji choisi pour coller au sujet. " +
        "Si le sujet est sexuel, séduction, NSFW, 18+, le corps, ou une allusion grivoise du type « la taille de… », utilise un emoji suggestif parmi : 🍆 🍑 💦 😏 🔥 👀 (par défaut 🍆 pour une allusion claire à la taille / au sexe). " +
        "Sinon, choisis UN seul emoji qui correspond vraiment au sujet (argent 💰, sport 💪, mindset 🧠, etc.). " +
        "Réponds UNIQUEMENT avec le hook suivi de son unique emoji." +
        `\n\n[variation: ${variationSeed}] Utilise cette graine uniquement pour varier légèrement le choix des mots et de l'emoji entre deux générations, jamais pour changer le sens.`;
      const hook = (await runClaude(introText.slice(0, 1200), system)).trim().replace(/^["'«»\s]+|["'«»\s]+$/g, "");
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

const formatAssSubtitleText = (text, keywordSet, subtitleStyle) => {
  if (!keywordSet?.size) return assEscapePlain(text);

  const primary = hexToAssOverrideColor(subtitleStyle.textColor, "#ffffff");
  const outline = hexToAssOverrideColor(subtitleStyle.strokeColor, "#000000");
  const palette = [
    hexToAssOverrideColor(subtitleStyle.keywordColor, defaultSubtitleStyle.keywordColor),
    hexToAssOverrideColor(subtitleStyle.keywordSecondaryColor, defaultSubtitleStyle.keywordSecondaryColor),
  ];
  let highlighted = 0;

  return String(text || "")
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part.replace(/\r?\n/g, "\\N");
      const escaped = assEscapePlain(part);
      const token = normalizeKeywordToken(part);
      if (!token || (!keywordSet.has(token) && !/^[0-9]+%?$/.test(token))) return escaped;
      const color = palette[highlighted % palette.length];
      highlighted += 1;
      return `{\\c${color}\\3c${outline}\\b1}${escaped}{\\c${primary}\\3c${outline}\\b1}`;
    })
    .join("");
};

const subtitleYForStage = (stage, subtitleStyle) => {
  const introPosition = subtitleStyle.introVerticalPosition || "lower";
  const replyPosition = subtitleStyle.replyVerticalPosition || "middle";
  if (stage === "reply") {
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
  };
};

const subtitleAnimationOverride = (subtitleStyle, x, y, shadowDown, options = {}) => {
  const yOffset = safeNumber(options.yOffset, 0);
  const blur = Math.max(0, Math.min(8, safeNumber(options.blur ?? subtitleStyle.shadowBlur, 10) / 5));
  const targetY = y + yOffset;
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

const buildAssSubtitleFile = async (project, clip, clipTranscription) => {
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
  const keywordSet = buildSubtitleKeywordSet(clipTranscription, renderStyle);
  const mainOverride = subtitleAnimationOverride(renderStyle, x, y, 0, { blur: 0 });
  const shadowOverride = subtitleAnimationOverride(renderStyle, x, y, 0, {
    yOffset: shadowOffset,
    blur: renderStyle.shadowBlur,
  });
  const cues = clipTranscription?.cues?.length
    ? clipTranscription.cues
    : [{ start: 0, end: 2, text: stripCaptionPunctuation(clip.subtitle || "Sous titres automatiques") }];
  const events = cues.flatMap((cue) => {
    const start = assTime(cue.start);
    const end = assTime(cue.end);
    const shadowText = assEscapePlain(cue.text);
    const mainText = formatAssSubtitleText(cue.text, keywordSet, renderStyle);
    const layers = [
      `Dialogue: 0,${start},${end},KlimaxShadow,,0,0,0,,${shadowOverride}${shadowText}`,
    ];
    if (outline > 0) {
      layers.push(`Dialogue: 1,${start},${end},KlimaxOutline,,0,0,0,,${mainOverride}${shadowText}`);
    }
    layers.push(
      `Dialogue: 2,${start},${end},Klimax,,0,0,0,,${mainOverride}${mainText}`,
    );
    return layers;
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
    `Style: Klimax,${font.assName},${fontSize},${primary},${primary},${primary},${shadowColor},${fontWeight},0,0,0,${renderStyle.fontScaleX},100,0,0,1,0,0,5,0,0,0,1`,
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
  const font = await resolveFontDescriptor(hookStyle.fontFamily, hookStyle.fontWeight || 800);
  const outputPath = path.join(tempRoot, `${project.id}-${clip.id}-hook.png`);
  const configPath = await writeJsonFile(project.id, `${clip.id}-hook-style`, {
    outputPath,
    text: sanitizeHookText(clip.hookText || project.settings?.hookText || "Tu connais cette sensation"),
    fontSize: hookStyle.fontSize || 53,
    fontPath: font.fontPath,
    bubbleColor: hookStyle.bubbleColor || "#ffffff",
    textColor: hookStyle.textColor || "#000000",
    centerX: clipLayout.hookPosition.x,
    centerY: clipLayout.hookPosition.y,
    bubbleWidth: clipLayout.hookSize.width,
    bubbleHeight: clipLayout.hookSize.height,
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

const renderProject = async (db, project, sourceGroup) => {
  const { getSfxPath, listAutoSfxKeys, RISER_KEY } = await import("./sfx.mjs");
  if (!ffmpegPath) throw new Error("FFmpeg local indisponible.");
  if (!sourceGroup?.person1?.filePath || !sourceGroup?.person2?.filePath) {
    throw new Error("Ce projet n'a pas ses deux vidéos source.");
  }

  await ensureDir(renderRoot);
  await ensureDir(tempRoot);
  await ensureDir(fontRoot);
  const outputPath = path.join(renderRoot, `${project.id}-${Date.now()}.mp4`);

  const clipsToRender = project.clips.filter((clip) => sourceAssetForClip(sourceGroup, clip));
  if (!clipsToRender.length) {
    throw new Error("Ce projet n'a aucun segment exploitable.");
  }

  const inputArgs = ["-y", "-hide_banner", "-nostats", "-loglevel", "warning"];
  const filterChains = [];
  const concatPieces = [];
  // Audio of each camera-flash transition (its own whoosh), to fold into the mix.
  const flashAudioTags = [];
  let inputIndex = 0;
  let totalDuration = 0;

  // Voice loudness normalisation (EBU R128, single-pass dynamic). Applied to
  // every original clip BEFORE the +videoVolumeDb boost so a quietly-recorded
  // clip (e.g. personne 2) ends up at the same perceived level as a loud one
  // instead of staying low. Target overridable via KLIMAX_LOUDNORM_I.
  const loudnormFilter = `loudnorm=I=${clamp(safeNumber(process.env.KLIMAX_LOUDNORM_I, -16), -30, -8)}:TP=-1.5:LRA=11`;

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
  const videoSfxPlan = project.settings?.autoSfxEnabled !== false
    ? buildVideoSfxPlan(clipMeta, listAutoSfxKeys())
    : [];

  for (let clipIndex = 0; clipIndex < clipsToRender.length; clipIndex += 1) {
    const clip = clipsToRender[clipIndex];
    const sourceAsset = sourceAssetForClip(sourceGroup, clip);
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
      inputArgs.push("-stream_loop", "-1", "-i", addedAsset.filePath);
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
        `[${topSrcIdx}:v]scale=${Math.round(1080 * topZoom)}:${Math.round(TOP * topZoom)}:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:${TOP}:(in_w-1080)*${fxTop}:(in_h-${TOP})*${fyTop},setsar=1${bandTrim}[${bandTop}]`
      );
      filterChains.push(
        `[${bottomSrcIdx}:v]scale=${Math.round(1080 * bottomZoom)}:${Math.round(BOTTOM * bottomZoom)}:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:${BOTTOM}:(in_w-1080)*${fxBottom}:(in_h-${BOTTOM})*${fyBottom},setsar=1${bandTrim}[${bandBottom}]`
      );
      filterChains.push(
        `[${bandTop}][${bandBottom}]vstack=inputs=2[clipStacked${clipIndex}]`
      );
      filterChains.push(
        `[clipStacked${clipIndex}]setsar=1${videoFilterChain(project.settings?.videoFilterKey)},format=rgba[${currentVideo}]`
      );
    } else {
      const baseScale = clamp(safeNumber(clipLayout.videoTransform.scale, 100), 40, 180) / 100;
      const baseOffsetX = safeNumber(clipLayout.videoTransform.x, 0);
      const baseOffsetY = safeNumber(clipLayout.videoTransform.y, 0);
      filterChains.push(
        `[${sourceInput}:v]scale=1080*${baseScale}:1920*${baseScale}:force_original_aspect_ratio=increase,crop=1080:1920:min(max((in_w-1080)/2+${baseOffsetX}\\,0)\\,in_w-1080):min(max((in_h-1920)/2+${baseOffsetY}\\,0)\\,in_h-1920),setsar=1${videoFilterChain(project.settings?.videoFilterKey)},format=rgba[${currentVideo}]`
      );
    }
    const zoomedVideo = `vzoom${clipIndex}`;
    applyVideoZoomEvents(filterChains, currentVideo, zoomedVideo, zoomEvents);
    currentVideo = zoomedVideo;

    if (clip.stage === "intro") {
      const hookOverlayPath = await createHookBubbleOverlay(project, clip);
      inputArgs.push("-i", hookOverlayPath);
      const hookInput = inputIndex;
      inputIndex += 1;
      const nextVideo = `vhook${clipIndex}`;
      filterChains.push(`[${hookInput}:v]format=rgba[hook${clipIndex}]`);
      filterChains.push(`[${currentVideo}][hook${clipIndex}]overlay=0:0[${nextVideo}]`);
      currentVideo = nextVideo;
    }

    // Image overlay: manual `imageId` (category "image") wins. If none, fall back to
    // `autoBrollId` (category "broll") set by the b-roll intelligence module.
    const overlayId = clip.stage === "reply" && project.settings?.brollEnabled !== false
      ? clip.imageId || clip.brollId || clip.autoBrollId
      : null;
    if (overlayId) {
      const overlayAsset = db.assets.find((asset) => asset.id === overlayId && (asset.category === "image" || asset.category === "broll"));
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
    }

    if (
      clip.stage === "reply" &&
      project.settings?.klimaxLogoEnabled &&
      fsSync.existsSync(logoAnimationPath) &&
      clipTranscription?.logoMoments?.length
    ) {
      const logoMoments = clipTranscription.logoMoments.slice(0, 3);
      for (let logoIndex = 0; logoIndex < logoMoments.length; logoIndex += 1) {
        const moment = logoMoments[logoIndex];
        inputArgs.push("-i", logoAnimationPath);
        const logoInput = inputIndex;
        inputIndex += 1;
        const shiftedLogo = `logo${clipIndex}_${logoIndex}`;
        const nextVideo = `vlogo${clipIndex}_${logoIndex}`;
        const logoStart = safeNumber(moment.start, 0);
        const logoDuration = Math.max(0.1, safeNumber(moment.end, logoStart + 4.8) - logoStart);
        const logoX = clipLayout.logoPosition.x;
        const logoY = clipLayout.logoPosition.y;
        const logoSize = clipLayout.logoSize;
        filterChains.push(`[${logoInput}:v]scale=${logoSize}:-1,format=rgba[${shiftedLogo}]`);
        filterChains.push(
          `[${shiftedLogo}]trim=duration=${logoDuration.toFixed(3)},setpts=PTS-STARTPTS+${logoStart.toFixed(3)}/TB[${shiftedLogo}_delayed]`
        );
        filterChains.push(
          `[${currentVideo}][${shiftedLogo}_delayed]overlay=x=${Math.round(logoX)}-w/2:y=${Math.round(logoY)}-h/2:eof_action=pass[${nextVideo}]`
        );
        currentVideo = nextVideo;
      }
    }

    const assFilePath = await buildAssSubtitleFile(project, clip, clipTranscription);
    const subtitledVideo = `vsub${clipIndex}`;
    filterChains.push(`[${currentVideo}]subtitles='${assFilePath}':fontsdir='${fontRoot}'[${subtitledVideo}]`);
    const videoVolumeDb = safeNumber(project.settings?.videoVolumeDb, 2);
    // For a dual-speaker clip the video is cut short at clipDuration; trim the
    // audio to match so the main speaker's voice doesn't bleed over the next
    // clip in the concat (video and audio segments must stay the same length).
    const clipAudioTrim = isDualSpeaker && clipDuration > 0
      ? `,atrim=0:${clipDuration.toFixed(3)},asetpts=PTS-STARTPTS`
      : "";
    // loudnorm (consistent level) → aformat pins the rate back to 48 kHz (its
    // dynamic mode emits 192 kHz) → +videoVolumeDb boost on top → async resample.
    filterChains.push(`[${sourceInput}:a]${loudnormFilter},aformat=sample_rates=48000,volume=${videoVolumeDb}dB,aresample=async=1${clipAudioTrim}[acl${clipIndex}]`);

    // Sound effects: the 2-3 strongest keyword beats of the WHOLE video carry one
    // effect each (effects at -13 dB, "fahh" at -19 dB — see buildVideoSfxPlan),
    // plus the metallic riser landing exactly on the first clip's cut at -15 dB.
    // Added automatically and only when "Sound effects" is enabled. Transitions
    // (zoom / cut) stay purely visual — no sound is attached to them.
    const sfxEvents = [];
    if (project.settings?.autoSfxEnabled !== false) {
      sfxEvents.push(...videoSfxPlan.filter((event) => event.clipIndex === clipIndex));
      // Riser: a riser has to resolve on a cut, so we anchor its tail to the end
      // of the first clip (the hand-off to Personne 2) and start it earlier by
      // its own length.
      if (clipIndex === 0 && clipsToRender.length > 1 && clipDuration > 1.4) {
        const riserPath = getSfxPath(RISER_KEY);
        if (riserPath) {
          const riserDur = await probeMediaDurationSec(riserPath);
          let riserStart = Math.max(0, clipDuration - (riserDur > 0 ? riserDur : 1.15));
          let riserTempo;
          // If the intro is shorter than the riser, it would start at 0 and get cut
          // at the transition — you'd only hear the quiet build, never the metallic
          // resolve. Speed it up (atempo) so the whole build+climax fits the intro
          // and the climax lands exactly on the cut.
          if (riserDur > 0 && riserDur > clipDuration) {
            riserTempo = clamp(riserDur / clipDuration, 1, 2);
            riserStart = Math.max(0, clipDuration - riserDur / riserTempo);
          }
          sfxEvents.push({ key: RISER_KEY, time: riserStart, volumeDb: -15, word: "riser", atempo: riserTempo });
        }
      }
    }

    const sfxMixTags = [];
    const usedSfxEvents = sfxEvents
      .map((event) => ({ ...event, path: getSfxPath(event.key) }))
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

    if (sfxMixTags.length) {
      filterChains.push(
        `[acl${clipIndex}]${sfxMixTags.join("")}amix=inputs=${sfxMixTags.length + 1}:duration=first:dropout_transition=0:weights=${["1", ...sfxMixTags.map(() => "1")].join(" ")}[a${clipIndex}]`
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
    // Audio is always a plain concat (no audio cross-fade), whatever the visual
    // transition is. Video gets the transition treatment below.
    const audioPieces = concatPieces.filter((_, idx) => idx % 2 === 1);
    filterChains.push(`${audioPieces.join("")}concat=n=${clipsToRender.length}:v=0:a=1[acat]`);

    // Effective per-clip durations (dual-speaker clips already cut at the main
    // speaker's speech end), used to place the transitions on the real cuts.
    const clipDurations = clipMeta.map((m) => (m.duration > 0 ? m.duration : 4));
    const transitionsEnabled = project.settings?.clipTransitionsEnabled === true;

    if (!transitionsEnabled) {
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
      const flashJobs = [];
      let prevTag = "vsub0";
      let lastTag = "vsub0";
      let timelineEnd = clipDurations[0]; // running end of the built chain (video timeline)
      for (let i = 1; i < clipsToRender.length; i += 1) {
        const useFlash = flashAvailable && (
          transitionType === "camera_flash" ||
          (transitionType !== "opacity" && Math.random() < 0.5)
        );
        const outTag = `vt${i}`;
        if (useFlash) {
          // Hard cut now; the flash is blended on top afterwards, peaking on the cut.
          filterChains.push(`[${prevTag}][vsub${i}]concat=n=2:v=1:a=0[${outTag}]`);
          flashJobs.push({ cutTime: timelineEnd });
          timelineEnd += clipDurations[i];
        } else {
          // Opacity cross-fade: the two clips overlap by XFADE_SEC.
          const offset = Math.max(0, timelineEnd - XFADE_SEC);
          filterChains.push(
            `[${prevTag}][vsub${i}]xfade=transition=fade:duration=${XFADE_SEC.toFixed(3)}:offset=${offset.toFixed(3)}[${outTag}]`
          );
          timelineEnd = timelineEnd + clipDurations[i] - XFADE_SEC;
        }
        prevTag = outTag;
        lastTag = outTag;
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

  const { stderr } = await runProcess(ffmpegPath, args);
  const metadata = await exportMetadata(outputPath);
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
  res.json({
    ok: true,
    ffmpeg: ffmpegPath,
    ffprobe: ffprobe.path,
    dataRoot,
    python: fsSync.existsSync(pythonBin) ? pythonBin : null,
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
    res.json({ added: assets, assets: db.assets, videoGroups: getVideoGroups(db.assets) });
  }
);

app.post("/api/assets/:category", upload.single("file"), async (req, res) => {
  const category = req.params.category;
  if (!["music", "broll", "image", "speaker"].includes(category)) return res.status(400).json({ error: "Catégorie invalide." });
  if (!req.file) return res.status(400).json({ error: "Fichier manquant." });
  const db = await readDb();
  const asset = assetFromFile({ file: req.file, category, note: req.body?.note || req.file.originalname });
  db.assets.unshift(asset);
  await writeDb(db);
  res.json({ asset, assets: db.assets });
});

// Rename a single asset (a video part — personne 1 / personne 2 — or a 2e-speaker
// clip). Only the `title` changes; grouping (groupId/videoPart) stays intact.
app.patch("/api/assets/:id", async (req, res) => {
  const db = await readDb();
  const target = db.assets.find((asset) => asset.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Asset introuvable." });
  const nextTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!nextTitle) return res.status(400).json({ error: "Titre manquant." });
  target.title = nextTitle;
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
    clips: sourceGroup
      ? [
          {
            id: id("intro"),
            stage: "intro",
            sourceVideoId: sourceGroup.person1?.id || null,
            title: "Personne 1 - segment 1",
            hookText: settings.hookText,
            subtitle: "Transcription en attente",
            musicId: null,
            brollId: null,
            imageId: null,
            ...defaultClipLayout("intro"),
            imageTransform: { scale: 100, x: 0, y: 0 },
          },
          {
            id: id("reply"),
            stage: "reply",
            sourceVideoId: sourceGroup.person2?.id || null,
            title: "Personne 2 - segment 2",
            hookText: "La suite arrive maintenant",
            subtitle: "Transcription en attente",
            musicId: null,
            brollId: null,
            imageId: null,
            ...defaultClipLayout("reply"),
            imageTransform: { scale: 100, x: 0, y: 0 },
          },
        ]
      : [],
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
    await ensureTranscription(project, sourceGroup);
    project.updated_at = new Date().toISOString();
    await writeDb(db);
    res.json({ project: resolveProject(db, project.id) });
  } catch (error) {
    project.transcription = {
      ...defaultTranscription(),
      status: "failed",
      generatedAt: new Date().toISOString(),
      error: error.message,
      clips: [],
    };
    project.updated_at = new Date().toISOString();
    await writeDb(db);
    res.status(500).json({ error: error.message, project: resolveProject(db, project.id) });
  }
});

app.post("/api/projects/:id/render", async (req, res) => {
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
    await ensureTranscription(project, sourceGroup);
    project.render_progress = 55;
    await writeDb(db);

    // Auto-pick a b-roll for any clip that doesn't have a manual `imageId` and
    // also doesn't already have an `autoBrollId` from a previous run. This is
    // best-effort: if the AI isn't configured or fails, we still render.
    try {
      const needsPick = project.clips.some((c) => c.stage === "reply" && !c.imageId && !c.autoBrollId);
      const hasBrolls = db.assets.some((a) => a.category === "broll" && (a.note || a.title));
      if (needsPick && hasBrolls) {
        const { pickBrollsForClips } = await import("./brollIntelligence.mjs");
        const clipsPayload = project.clips.filter((clip) => clip.stage === "reply").map((clip) => {
          const tc = project.transcription?.clips?.find((c) => c.clipId === clip.id);
          return { id: clip.id, transcript: (tc?.cues || []).map((cue) => cue.text).join(" ").trim() };
        });
        const brollsPayload = db.assets
          .filter((a) => a.category === "broll" && (a.note || a.title))
          .map((b) => ({ id: b.id, note: b.note || b.title, title: b.title }));
        const picks = await pickBrollsForClips({ clips: clipsPayload, brolls: brollsPayload });
        for (const pick of picks) {
          const clip = project.clips.find((c) => c.id === pick.clipId);
          if (!clip || clip.stage !== "reply" || clip.imageId) continue;
          if (pick.brollId) clip.autoBrollId = pick.brollId;
        }
        await writeDb(db);
      }
    } catch (autoErr) {
      console.warn("[render] auto-b-roll skipped:", autoErr.message);
    }

    const exported = await renderProject(db, project, sourceGroup);
    project.status = "completed";
    project.render_progress = 100;
    project.exports = [exported, ...(Array.isArray(project.exports) ? project.exports : [])]
      .slice(0, maxStoredExports)
      .map((entry) => normalizeExport(entry, { includeLog: true }));
    project.export = exported;
    project.updated_at = new Date().toISOString();
    await writeDb(db);
    res.json({ project: resolveProject(db, project.id), export: exported });
  } catch (error) {
    const failedExport = { status: "failed", error: error.message, createdAt: new Date().toISOString() };
    project.status = "failed";
    project.render_progress = 0;
    project.exports = [failedExport, ...(Array.isArray(project.exports) ? project.exports : [])]
      .slice(0, maxStoredExports)
      .map((entry) => normalizeExport(entry, { includeLog: true }));
    project.export = failedExport;
    project.updated_at = new Date().toISOString();
    await writeDb(db);
    res.status(500).json({ error: error.message, project: resolveProject(db, project.id) });
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
    await ensureTranscription(project, sourceGroup);
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

await Promise.all([
  ensureDir(uploadRoot),
  ensureDir(renderRoot),
  ensureDir(textRoot),
  ensureDir(systemRoot),
  ensureDir(tempRoot),
]);
await ensureSystemAssets();
await seedTailleVideos();
await compactDb();

app.listen(port, "127.0.0.1", () => {
  console.log(`Klimax local backend: http://127.0.0.1:${port}`);
});

// Start the local Supabase-compatible shim (auth + rest + storage on port 54321)
// so the front-end can use real Postgres-backed auth/db/storage without any
// external service. Disable with KLIMAX_SUPABASE_ENABLED=0.
if (process.env.KLIMAX_SUPABASE_ENABLED !== "0") {
  try {
    const { start: startShim } = await import("../local-supabase/server.mjs");
    await startShim();
  } catch (e) {
    console.error("[local-supabase] failed to start:", e.message);
  }
}
