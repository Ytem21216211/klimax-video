import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeFrenchElisionWords } from "../local-backend/captionWords.mjs";
import { buildLogoMoments, normalizeLogoWords } from "../local-backend/logoMoments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dbPath = path.join(projectRoot, "local-data", "klimax", "db.json");
const smokeProjectId = "codex-smoke-export";
const port = Number(process.env.KLIMAX_SMOKE_PORT || 8793);
const baseUrl = `http://127.0.0.1:${port}`;

const readDb = async () => JSON.parse(await fs.readFile(dbPath, "utf8"));
const writeDb = async (db) => fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

const assertLogoMomentDetection = () => {
  const direct = buildLogoMoments([{ word: "Klimax", start: 1, end: 1.25 }], "klimax", 8);
  const alternateSpelling = buildLogoMoments([{ word: "climax", start: 2, end: 2.25 }], "klimax", 8);
  const textFallback = buildLogoMoments([], "klimax", 8, [
    { text: "On ouvre Klimax maintenant", start: 3, end: 4 },
  ]);

  const failures = [];
  if (direct.length !== 1 || direct[0].start !== 1) failures.push("direct Klimax word");
  if (alternateSpelling.length !== 1 || alternateSpelling[0].start !== 2) failures.push("climax spelling");
  if (alternateSpelling[0]?.term !== "Klimax") failures.push("canonical Klimax term");
  if (textFallback.length !== 1 || textFallback[0].start !== 3 || textFallback[0].source !== "text") {
    failures.push("text fallback");
  }

  const normalizedWords = normalizeLogoWords([{ word: "climax", start: 17, end: 17.3 }], "klimax");
  if (normalizedWords[0]?.word !== "Klimax") failures.push("caption Klimax replacement");

  if (failures.length) {
    throw new Error(`Détection logo Klimax invalide: ${failures.join(", ")}`);
  }
};

const assertFrenchElisionMerging = () => {
  const words = mergeFrenchElisionWords([
    { word: "on", start: 0, end: 0.1 },
    { word: "fait", start: 0.1, end: 0.2 },
    { word: "l'", start: 0.2, end: 0.25 },
    { word: "appel", start: 0.25, end: 0.55 },
    { word: "demain", start: 0.55, end: 0.9 },
  ]);
  const text = words.map((word) => word.word).join(" ");
  if (text !== "on fait l'appel demain") {
    throw new Error(`Fusion élision française invalide: ${text}`);
  }

  const splitWords = mergeFrenchElisionWords([
    { word: "sur", start: 0, end: 0.1 },
    { word: "l", start: 0.1, end: 0.2 },
    { word: "'application", start: 0.2, end: 0.5 },
    { word: "qu", start: 0.5, end: 0.6 },
    { word: "'on", start: 0.6, end: 0.7 },
    { word: "d", start: 0.7, end: 0.8 },
    { word: "`un", start: 0.8, end: 0.9 },
    { word: "n", start: 0.9, end: 1 },
    { word: "'", start: 1, end: 1.02 },
    { word: "en", start: 1.02, end: 1.1 },
    { word: "t", start: 1.1, end: 1.12 },
    { word: "'auras", start: 1.12, end: 1.3 },
  ]);
  const splitText = splitWords.map((word) => word.word).join(" ");
  if (splitText !== "sur l'application qu'on d'un n'en t'auras") {
    throw new Error(`Fusion élision découpée invalide: ${splitText}`);
  }
};

const assertHookBubbleCentering = async () => {
  const outputPath = path.join(projectRoot, "local-data", "klimax", "tmp", "hook-centering-smoke.png");
  const configPath = path.join(projectRoot, "local-data", "klimax", "tmp", "hook-centering-smoke.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify({
      outputPath,
      text: "Tu connais cette sensation",
      fontSize: 52,
      fontPath: "/System/Library/Fonts/Supplemental/Arial Black.ttf",
      bubbleColor: "#ffffff",
      textColor: "#000000",
      centerX: 540,
      centerY: 1325,
      bubbleWidth: 840,
      bubbleHeight: 180,
    }),
    "utf8"
  );

  const render = spawnSync(path.join(projectRoot, "local-backend", ".venv", "bin", "python"), [
    path.join(projectRoot, "local-backend", "render_hook_bubble.py"),
    configPath,
  ]);
  if (render.status !== 0) {
    throw new Error(`Rendu hook smoke impossible: ${render.stderr?.toString() || render.stdout?.toString()}`);
  }

  const inspect = spawnSync(
    path.join(projectRoot, "local-backend", ".venv", "bin", "python"),
    [
      "-c",
      [
        "import json,sys",
        "from PIL import Image",
        "im=Image.open(sys.argv[1]).convert('RGBA')",
        "alpha=im.getchannel('A')",
        "bbox=alpha.getbbox()",
        "print(json.dumps({'bbox':bbox,'centerX':(bbox[0]+bbox[2])/2,'centerY':(bbox[1]+bbox[3])/2,'width':bbox[2]-bbox[0],'height':bbox[3]-bbox[1]}))",
      ].join(";"),
      outputPath,
    ],
    { encoding: "utf8" }
  );
  if (inspect.status !== 0) {
    throw new Error(`Inspection hook smoke impossible: ${inspect.stderr || inspect.stdout}`);
  }
  const metrics = JSON.parse(inspect.stdout);
  if (Math.abs(metrics.centerX - 540) > 2 || Math.abs(metrics.centerY - 1325) > 2) {
    throw new Error(`Bulle hook non centrée: ${JSON.stringify(metrics)}`);
  }
  if (Math.abs(metrics.width - 840) > 2 || Math.abs(metrics.height - 180) > 2) {
    throw new Error(`Dimensions bulle hook invalides: ${JSON.stringify(metrics)}`);
  }
};

const waitForHealth = async (child) => {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (child.exitCode !== null) {
      throw new Error("Le backend smoke s'est arrêté avant de répondre.");
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error("Le backend smoke ne répond pas.");
};

const createSmokeProject = async () => {
  const db = await readDb();
  const base = db.projects.find(
    (project) =>
      project.id !== smokeProjectId &&
      project.sourceGroupId &&
      project.transcription?.status === "completed" &&
      project.transcription?.clips?.length >= 2 &&
      project.clips?.length >= 2
  );

  if (!base) {
    throw new Error(
      "Aucun projet local transcrit trouvé. Ajoute les deux vidéos de test dans la banque puis crée un projet avant ce smoke test."
    );
  }

  const smoke = JSON.parse(JSON.stringify(base));
  smoke.id = smokeProjectId;
  smoke.title = "Smoke export Klimax";
  smoke.status = "draft";
  smoke.render_progress = 0;
  smoke.exports = [];
  smoke.export = null;
  smoke.settings = {
    ...smoke.settings,
    musicEnabled: false,
    brollEnabled: true,
    klimaxLogoEnabled: true,
    logoTriggerWord: "klimax",
    subtitleSize: 40,
    subtitleStyle: {
      ...(smoke.settings?.subtitleStyle || {}),
      stylePreset: "capcut",
      fontFamily: "Montserrat",
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
      fontWeight: 900,
      fontScaleX: 104,
      keywordHighlightEnabled: true,
      keywordColor: "#ffe14a",
      keywordSecondaryColor: "#45f08a",
      keywordTerms: "klimax, taille, compte, exercice",
    },
    hookStyle: {
      bubbleColor: "#ffffff",
      textColor: "#000000",
      fontSize: 52,
    },
  };

  const clipIdMap = new Map();
  smoke.clips = smoke.clips.slice(0, 2).map((clip, index) => {
    const nextId = `${clip.stage || "clip"}-smoke-${index}`;
    clipIdMap.set(clip.id, nextId);
    return {
      ...clip,
      id: nextId,
      videoTransform: index === 0 ? { scale: 118, x: -120, y: 40 } : { scale: 112, x: 90, y: -30 },
      hookPosition: { x: 540, y: 1325 },
      subtitlePosition: index === 0 ? { x: 540, y: 1490 } : { x: 540, y: 1265 },
      logoPosition: { x: 540, y: 1395 },
    };
  });

  smoke.transcription = {
    ...smoke.transcription,
    status: "completed",
    clips: smoke.transcription.clips.slice(0, 2).map((clip, index) => ({
      ...clip,
      clipId: clipIdMap.get(clip.clipId) || smoke.clips[index]?.id || clip.clipId,
      logoMoments: index === 1 ? [{ term: "Klimax", start: 0.2, end: 2.2 }] : [],
    })),
  };

  db.projects = [smoke, ...db.projects.filter((project) => project.id !== smokeProjectId)];
  await writeDb(db);
};

const removeSmokeProject = async () => {
  if (!fsSync.existsSync(dbPath)) return;
  const db = await readDb();
  db.projects = db.projects.filter((project) => project.id !== smokeProjectId);
  await writeDb(db);
};

const main = async () => {
  if (!fsSync.existsSync(dbPath)) {
    throw new Error("Base locale introuvable: local-data/klimax/db.json.");
  }

  assertLogoMomentDetection();
  assertFrenchElisionMerging();
  await assertHookBubbleCentering();
  await createSmokeProject();

  const child = spawn(process.execPath, ["local-backend/server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, KLIMAX_BACKEND_PORT: String(port), KLIMAX_SUPABASE_ENABLED: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(child);
    const response = await fetch(`${baseUrl}/api/projects/${smokeProjectId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { musicEnabled: false, klimaxLogoEnabled: true } }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Export smoke impossible.");
    }

    const exported = data.export;
    const failures = [];
    if (data.project?.status !== "completed") failures.push("project status not completed");
    if (exported?.status !== "completed") failures.push("export status not completed");
    if (!exported?.path || !fsSync.existsSync(exported.path)) failures.push("export file missing");
    if (exported?.width !== 1080 || exported?.height !== 1920) failures.push(`bad dimensions ${exported?.width}x${exported?.height}`);
    if (!exported?.duration || exported.duration < 2) failures.push("duration too short");
    if (!exported?.sizeBytes || exported.sizeBytes < 100000) failures.push("file too small");
    if (!String(exported?.log || "").includes("klimax-pop-up.mov")) failures.push("logo animation not used");
    if (!String(exported?.log || "").includes("Montserrat")) failures.push("Montserrat not used");
    const assPath = path.join(projectRoot, "local-data", "klimax", "render-text", `${smokeProjectId}-intro-smoke-0-subtitles.ass`);
    const assText = fsSync.existsSync(assPath) ? await fs.readFile(assPath, "utf8") : "";
    if (!assText.includes("Style: KlimaxShadow")) failures.push("subtitle shadow style missing");
    if (!assText.includes("\\c&H4AE1FF&") && !assText.includes("\\c&H8AF045&")) failures.push("keyword color override missing");

    if (failures.length) {
      throw new Error(`Smoke export failed: ${failures.join(", ")}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          export: exported.path,
          width: exported.width,
          height: exported.height,
          duration: exported.duration,
          sizeBytes: exported.sizeBytes,
        },
        null,
        2
      )
    );
  } finally {
    child.kill("SIGINT");
    await removeSmokeProject();
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once("exit", resolve));
    }
    if (process.env.KLIMAX_SMOKE_DEBUG_LOGS === "1") {
      console.error(logs);
    }
  }
};

main().catch(async (error) => {
  await removeSmokeProject().catch(() => {});
  console.error(error.message);
  process.exit(1);
});
