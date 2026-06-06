import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dbPath = path.join(projectRoot, "local-data", "klimax", "db.json");
const smokeProjectId = "codex-smoke-export";
const port = Number(process.env.KLIMAX_SMOKE_PORT || 8793);
const baseUrl = `http://127.0.0.1:${port}`;

const readDb = async () => JSON.parse(await fs.readFile(dbPath, "utf8"));
const writeDb = async (db) => fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

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
      fontWeight: 900,
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

  await createSmokeProject();

  const child = spawn(process.execPath, ["local-backend/server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, KLIMAX_BACKEND_PORT: String(port) },
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
    if (!String(exported?.log || "").includes("Arial Black")) failures.push("Arial Black not used");

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
