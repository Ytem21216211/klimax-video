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
const logoAnimationSourceCandidate = "/Users/juliengoussale/Downloads/pop up klimax app store.mov";
const logoAnimationPath = path.join(systemRoot, "klimax-pop-up.mov");
const whisperModelName = process.env.KLIMAX_WHISPER_MODEL || "tiny";
const port = Number(process.env.KLIMAX_BACKEND_PORT || 8787);
const transcriptionPipelineVersion = "caption-elision-logo-brand-v5";

const app = express();

const defaultSubtitleStyle = {
  stylePreset: "impact",
  fontFamily: "Arial Bold",
  fontSize: 34,
  textColor: "#ffffff",
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 4,
  shadowEnabled: true,
  shadowColor: "#000000",
  shadowOpacity: 0.85,
  shadowDistance: 4,
  shadowBlur: 10,
  animationPreset: "pop",
  wordsPerLine: 2,
  introVerticalPosition: "lower",
  replyVerticalPosition: "middle",
  fontWeight: 900,
};

const defaultHookStyle = {
  bubbleColor: "#ffffff",
  textColor: "#000000",
  fontSize: 46,
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
});

const defaultProjectSettings = () => ({
  hookText: "Tu connais cette sensation ?",
  subtitleSize: 34,
  musicEnabled: true,
  musicVolumeDb: -17,
  brollEnabled: true,
  autoSfxEnabled: true,
  klimaxLogoEnabled: true,
  logoTriggerWord: "klimax",
  subtitleStyle: { ...defaultSubtitleStyle },
  hookStyle: { ...defaultHookStyle },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
app.use("/files", express.static(dataRoot));

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
  subtitleStyle.strokeWidth = clamp(safeNumber(subtitleStyle.strokeWidth, 4), 0, 12);
  subtitleStyle.shadowDistance = clamp(safeNumber(subtitleStyle.shadowDistance, 4), 0, 18);
  subtitleStyle.shadowBlur = clamp(safeNumber(subtitleStyle.shadowBlur, 10), 0, 28);
  subtitleStyle.shadowOpacity = clamp(safeNumber(subtitleStyle.shadowOpacity, 0.85), 0, 1);
  subtitleStyle.fontWeight = safeNumber(subtitleStyle.fontWeight, 900);
  if (!["none", "pop", "bounce", "rise"].includes(subtitleStyle.animationPreset)) {
    subtitleStyle.animationPreset = defaults.subtitleStyle.animationPreset;
  }
  hookStyle.fontSize = safeNumber(hookStyle.fontSize, 46);
  const musicVolumeDb = clamp(safeNumber(settings.musicVolumeDb, defaults.musicVolumeDb), -40, 0);

  return {
    ...defaults,
    ...settings,
    subtitleSize: subtitleStyle.fontSize,
    musicVolumeDb,
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
});

const defaultTranscription = () => ({
  status: "idle",
  generatedAt: null,
  sourceFingerprint: null,
  clips: [],
});

const normalizeProject = (project) => {
  const settings = mergeProjectSettings(project?.settings || {});
  const exports = Array.isArray(project?.exports)
    ? [...project.exports].sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))
    : project?.export
      ? [project.export]
      : [];

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

const normalizeDb = (raw) => ({
  assets: Array.isArray(raw?.assets) ? raw.assets : [],
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
  return { ...normalizeProject(project), sourceGroup };
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
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H${aa}${bb}${gg}${rr}`;
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

const assEscape = (text) =>
  String(text || "")
    .replace(/\r?\n/g, "\\N")
    .replace(/[{}]/g, "")
    .trim();

const subtitleYForStage = (stage, subtitleStyle) => {
  const introPosition = subtitleStyle.introVerticalPosition || "lower";
  const replyPosition = subtitleStyle.replyVerticalPosition || "middle";
  if (stage === "reply") {
    return replyPosition === "lower" ? 1470 : 1240;
  }
  return introPosition === "middle" ? 1260 : 1450;
};

const subtitleAnimationOverride = (subtitleStyle, x, y, shadowDown) => {
  const blur = Math.max(0, Math.min(4, safeNumber(subtitleStyle.shadowBlur, 10) / 8));
  const base = [`\\an5`, `\\xshad0`, `\\yshad${shadowDown}`, `\\blur${blur.toFixed(1)}`];
  const animation = subtitleStyle.animationPreset || "pop";

  if (animation === "rise") {
    return `{${[...base, `\\move(${x},${y + 52},${x},${y},0,260)`].join("")}}`;
  }
  if (animation === "bounce") {
    return `{${[
      ...base,
      `\\pos(${x},${y})`,
      "\\fscx76",
      "\\fscy76",
      "\\t(0,210,\\fscx114\\fscy114)",
      "\\t(210,390,\\fscx100\\fscy100)",
    ].join("")}}`;
  }
  if (animation === "none") {
    return `{${[...base, `\\pos(${x},${y})`].join("")}}`;
  }
  return `{${[
    ...base,
    `\\pos(${x},${y})`,
    "\\fscx70",
    "\\fscy70",
    "\\t(0,150,\\fscx112\\fscy112)",
    "\\t(150,280,\\fscx100\\fscy100)",
  ].join("")}}`;
};

const buildAssSubtitleFile = async (project, clip, clipTranscription) => {
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const clipLayout = normalizeClipLayout(clip);
  const font = await resolveFontDescriptor(subtitleStyle.fontFamily, subtitleStyle.fontWeight || 800);
  const outline = subtitleStyle.strokeEnabled ? safeNumber(subtitleStyle.strokeWidth, 4) : 0;
  const shadow = subtitleStyle.shadowEnabled ? safeNumber(subtitleStyle.shadowDistance, 4) : 0;
  const backAlpha = subtitleStyle.shadowEnabled
    ? Math.round((1 - safeNumber(subtitleStyle.shadowOpacity, 0.85)) * 255)
    : 255;
  const primary = hexToAssColor(subtitleStyle.textColor, 0);
  const outlineColor = hexToAssColor(subtitleStyle.strokeColor, 0);
  const backColor = hexToAssColor(subtitleStyle.shadowColor, backAlpha);
  const y = clipLayout.subtitlePosition.y ?? subtitleYForStage(clip.stage, subtitleStyle);
  const x = clipLayout.subtitlePosition.x ?? 540;
  const fontSize = safeNumber(subtitleStyle.fontSize, 34);
  const fontWeight = safeNumber(subtitleStyle.fontWeight, 900) >= 700 ? -1 : 0;
  const shadowDown = Math.max(0, Math.round(shadow));
  const cueOverride = subtitleAnimationOverride(subtitleStyle, x, y, shadowDown);
  const cues = clipTranscription?.cues?.length
    ? clipTranscription.cues
    : [{ start: 0, end: 2, text: stripCaptionPunctuation(clip.subtitle || "Sous titres automatiques") }];

  const ass = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Klimax,${font.assName},${fontSize},${primary},${primary},${outlineColor},${backColor},${fontWeight},0,0,0,100,100,0,0,1,${outline},${shadow},5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map(
      (cue) =>
        `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Klimax,,0,0,0,,${cueOverride}${assEscape(cue.text)}`
    ),
  ].join("\n");

  return writeTextFile(project.id, `${clip.id}-subtitles`, ass, "ass");
};

const createHookBubbleOverlay = async (project, clip) => {
  const subtitleStyle = project.settings?.subtitleStyle || defaultSubtitleStyle;
  const hookStyle = project.settings?.hookStyle || defaultHookStyle;
  const clipLayout = normalizeClipLayout(clip);
  const font = await resolveFontDescriptor(subtitleStyle.fontFamily, subtitleStyle.fontWeight || 800);
  const outputPath = path.join(tempRoot, `${project.id}-${clip.id}-hook.png`);
  const configPath = await writeJsonFile(project.id, `${clip.id}-hook-style`, {
    outputPath,
    text: sanitizeHookText(clip.hookText || project.settings?.hookText || "Tu connais cette sensation"),
    fontSize: hookStyle.fontSize || 46,
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

const renderProject = async (db, project, sourceGroup) => {
  const { getSfxPath } = await import("./sfx.mjs");
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

  const inputArgs = ["-y"];
  const filterChains = [];
  const concatPieces = [];
  let inputIndex = 0;
  let totalDuration = 0;

  for (let clipIndex = 0; clipIndex < clipsToRender.length; clipIndex += 1) {
    const clip = clipsToRender[clipIndex];
    const sourceAsset = sourceAssetForClip(sourceGroup, clip);
    const clipTranscription = project.transcription?.clips?.find((entry) => entry.clipId === clip.id);
    const clipDuration = safeNumber(clipTranscription?.duration, 0);
    const clipLayout = normalizeClipLayout(clip);
    totalDuration += clipDuration;

    inputArgs.push("-i", sourceAsset.filePath);
    const sourceInput = inputIndex;
    inputIndex += 1;

    let currentVideo = `vbase${clipIndex}`;
    const baseScale = clamp(safeNumber(clipLayout.videoTransform.scale, 100), 40, 180) / 100;
    const baseOffsetX = safeNumber(clipLayout.videoTransform.x, 0);
    const baseOffsetY = safeNumber(clipLayout.videoTransform.y, 0);
    filterChains.push(
      `[${sourceInput}:v]scale=1080*${baseScale}:1920*${baseScale}:force_original_aspect_ratio=increase,crop=1080:1920:min(max((in_w-1080)/2+${baseOffsetX}\\,0)\\,in_w-1080):min(max((in_h-1920)/2+${baseOffsetY}\\,0)\\,in_h-1920),setsar=1,format=rgba[${currentVideo}]`
    );

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
    const overlayId = clip.imageId || clip.autoBrollId;
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
        filterChains.push(`[${logoInput}:v]scale=320:-1,format=rgba[${shiftedLogo}]`);
        filterChains.push(
          `[${shiftedLogo}]trim=duration=${logoDuration.toFixed(3)},setpts=PTS-STARTPTS+${logoStart.toFixed(3)}/TB[${shiftedLogo}_delayed]`
        );
        filterChains.push(
          `[${currentVideo}][${shiftedLogo}_delayed]overlay=x=${Math.round(logoX - 160)}:y=${Math.round(logoY - 160)}:eof_action=pass[${nextVideo}]`
        );
        currentVideo = nextVideo;
      }
    }

    const assFilePath = await buildAssSubtitleFile(project, clip, clipTranscription);
    const subtitledVideo = `vsub${clipIndex}`;
    filterChains.push(`[${currentVideo}]subtitles='${assFilePath}':fontsdir='${fontRoot}'[${subtitledVideo}]`);
    filterChains.push(`[${sourceInput}:a]volume=2dB,aresample=async=1[acl${clipIndex}]`);

    // Audio SFX for this clip (if any). Mixed at the start of the clip audio.
    const sfxPath = clip.sfxEffect ? getSfxPath(clip.sfxEffect) : null;
    if (sfxPath) {
      inputArgs.push("-i", sfxPath);
      const sfxInput = inputIndex;
      inputIndex += 1;
      filterChains.push(
        `[${sfxInput}:a]aresample=async=1,atrim=0:${Math.max(0.1, clipDuration).toFixed(3)},asetpts=PTS-STARTPTS[asfx${clipIndex}]`
      );
      filterChains.push(
        `[acl${clipIndex}][asfx${clipIndex}]amix=inputs=2:duration=first:dropout_transition=0:weights=0.85 1.0[a${clipIndex}]`
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
    const transitionKey = project.settings?.sfxTransition;
    const transitionSfx = transitionKey ? getSfxPath(transitionKey) : null;
    if (transitionSfx) {
      // xfade between consecutive video clips. Audio stays as a simple concat.
      const xfadeMs = transitionKey === "transition_film_roll" ? 500
        : transitionKey === "transition_whoosh" ? 400
        : transitionKey === "transition_flash" ? 200
        : 300;
      // We approximate durations via the transcribed durations, or 4s fallback per clip.
      const clipDurations = clipsToRender.map((c) => {
        const tc = project.transcription?.clips?.find((entry) => entry.clipId === c.id);
        return safeNumber(tc?.duration, 4);
      });
      const offsets = [];
      let acc = 0;
      for (let i = 0; i < clipDurations.length; i += 1) {
        offsets.push(Math.max(0, acc + clipDurations[i] - xfadeMs / 1000));
        acc += clipDurations[i];
      }
      let prevTag = "vsub0";
      for (let i = 1; i < clipsToRender.length; i += 1) {
        const isLast = i === clipsToRender.length - 1;
        const nextTag = isLast ? "vcat" : `vx${i}`;
        filterChains.push(
          `[${prevTag}][vsub${i}]xfade=transition=fade:duration=${(xfadeMs / 1000).toFixed(3)}:offset=${offsets[i - 1].toFixed(3)}[${nextTag}]`
        );
        prevTag = nextTag;
      }
      // For 2 clips, the loop runs once and vcat is the final. For 3+, the last iteration also produces vcat.
      // Audio: simple concat of the audio parts (every other element of concatPieces).
      const audioPieces = concatPieces.filter((_, idx) => idx % 2 === 1);
      filterChains.push(`${audioPieces.join("")}concat=n=${clipsToRender.length}:v=0:a=1[acat]`);
    } else {
      filterChains.push(`${concatPieces.join("")}concat=n=${clipsToRender.length}:v=1:a=1[vcat][acat]`);
    }
  }

  const musicAssetId = clipsToRender.find((clip) => clip.musicId)?.musicId || null;
  const musicAsset = project.settings?.musicEnabled
    ? db.assets.find((asset) => asset.id === musicAssetId && asset.category === "music")
    : null;

  if (musicAsset?.filePath) {
    inputArgs.push("-stream_loop", "-1", "-i", musicAsset.filePath);
    const musicInput = inputIndex;
    inputIndex += 1;
    const musicVolumeDb = safeNumber(project.settings?.musicVolumeDb, -17);
    filterChains.push(
      `[${musicInput}:a]volume=${musicVolumeDb}dB,atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=N/SR/TB,aresample=async=1[bgm]`
    );
    filterChains.push("[acat][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]");
  } else {
    filterChains.push("[acat]anull[aout]");
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
    "veryfast",
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
    log: stderr,
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
  if (!["music", "broll", "image"].includes(category)) return res.status(400).json({ error: "Catégorie invalide." });
  if (!req.file) return res.status(400).json({ error: "Fichier manquant." });
  const db = await readDb();
  const asset = assetFromFile({ file: req.file, category, note: req.body?.note || req.file.originalname });
  db.assets.unshift(asset);
  await writeDb(db);
  res.json({ asset, assets: db.assets });
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
      const needsPick = project.clips.some((c) => !c.imageId && !c.autoBrollId);
      const hasBrolls = db.assets.some((a) => a.category === "broll" && (a.note || a.title));
      if (needsPick && hasBrolls) {
        const { pickBrollsForClips } = await import("./brollIntelligence.mjs");
        const clipsPayload = project.clips.map((clip) => {
          const tc = project.transcription?.clips?.find((c) => c.clipId === clip.id);
          return { id: clip.id, transcript: (tc?.cues || []).map((cue) => cue.text).join(" ").trim() };
        });
        const brollsPayload = db.assets
          .filter((a) => a.category === "broll" && (a.note || a.title))
          .map((b) => ({ id: b.id, note: b.note || b.title, title: b.title }));
        const picks = await pickBrollsForClips({ clips: clipsPayload, brolls: brollsPayload });
        for (const pick of picks) {
          const clip = project.clips.find((c) => c.id === pick.clipId);
          if (!clip || clip.imageId) continue;
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
    project.exports = [exported, ...(Array.isArray(project.exports) ? project.exports : [])];
    project.export = exported;
    project.updated_at = new Date().toISOString();
    await writeDb(db);
    res.json({ project: resolveProject(db, project.id), export: exported });
  } catch (error) {
    const failedExport = { status: "failed", error: error.message, createdAt: new Date().toISOString() };
    project.status = "failed";
    project.render_progress = 0;
    project.exports = [failedExport, ...(Array.isArray(project.exports) ? project.exports : [])];
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

  const clipsPayload = project.clips.map((clip) => {
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
