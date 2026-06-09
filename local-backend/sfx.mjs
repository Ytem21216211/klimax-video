// SFX library: real .mp3 sound effects bundled with the app, copied on first run
// into `local-data/klimax/system/sfx/`. The library is exposed via /api/sfx and
// consumed by the editor (Banque) + render pipeline.
//
// Each entry: { key, label, type: "effect" | "riser", file, durationMs, description }.
//
// How the render uses them (see local-backend/server.mjs):
//   - When "Sound effects" is enabled, one effect is dropped roughly every 4s at
//     -9 dB, picked at random from the auto pool (the bundled defaults below + any
//     SFX the user imports in the Banque).
//   - The metallic riser is placed once so it FINISHES at the end of the first
//     clip, at -15 dB.
//
// Transitions (zoom / cut) are purely visual now and carry NO sound.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sfxRoot = path.join(projectRoot, "local-data", "klimax", "system", "sfx");
// Real mp3 files shipped with the repo. Copied into sfxRoot on first run.
const bundledSfxRoot = path.join(__dirname, "sfx-assets");

// The key of the riser placed at the end of the first clip (handled specially by
// the render pipeline; excluded from the random "every 4s" pool).
export const RISER_KEY = "effect_riser_metallic";

export const SFX_CATALOG = [
  {
    key: "effect_fahhh",
    type: "effect",
    label: "Fahhh",
    description: "Souffle viral pour souligner un punch.",
    file: "effects/fahhhhhhhhhhhhhh.mp3",
    bundled: "fahhhhhhhhhhhhhh.mp3",
    durationMs: 0,
  },
  {
    key: "effect_movie",
    type: "effect",
    label: "Movie",
    description: "Stinger cinéma court.",
    file: "effects/movie_1.mp3",
    bundled: "movie_1.mp3",
    durationMs: 0,
  },
  {
    key: "effect_rizz",
    type: "effect",
    label: "Rizz",
    description: "Le son rizz classique des shorts.",
    file: "effects/rizz-sound-effect.mp3",
    bundled: "rizz-sound-effect.mp3",
    durationMs: 0,
  },
  {
    key: "effect_vine_boom",
    type: "effect",
    label: "Vine boom",
    description: "Le boom viral pour marquer une réaction.",
    file: "effects/vine-boom.mp3",
    bundled: "vine-boom.mp3",
    durationMs: 0,
  },
  {
    key: RISER_KEY,
    type: "riser",
    label: "Riser métallique",
    description: "Montée d'attention qui se termine à la fin du premier clip.",
    file: "effects/popular-riser-metallic-sound-effect.mp3",
    bundled: "popular-riser-metallic-sound-effect.mp3",
    durationMs: 0,
  },
];

// Copy each bundled mp3 into the system sfx folder if it's not already there.
export async function ensureSfxLibrary() {
  await fsp.mkdir(sfxRoot, { recursive: true });
  for (const item of SFX_CATALOG) {
    const absPath = path.join(sfxRoot, item.file);
    if (fs.existsSync(absPath)) continue;
    const source = item.bundled ? path.join(bundledSfxRoot, item.bundled) : null;
    if (!source || !fs.existsSync(source)) {
      console.warn(`[sfx] bundled source missing for ${item.key}: ${source}`);
      continue;
    }
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    try {
      await fsp.copyFile(source, absPath);
    } catch (err) {
      console.warn(`[sfx] failed to copy ${item.key}:`, err.message);
    }
  }
}

// User-uploaded SFX live in a dedicated folder and are scanned on demand, so you
// can drop in your own sounds from the Banque without touching the catalog.
const userSfxRoot = path.join(sfxRoot, "user");
const USER_SFX_PREFIX = "user_";
const AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"]);

export function getUserSfxDir() {
  return userSfxRoot;
}

function listUserSfx() {
  let files = [];
  try {
    files = fs.readdirSync(userSfxRoot);
  } catch {
    return [];
  }
  return files
    .filter((name) => AUDIO_EXTS.has(path.extname(name).toLowerCase()))
    .map((name) => ({
      key: `${USER_SFX_PREFIX}${name}`,
      type: "effect",
      label: name.replace(/\.[^/.]+$/, ""),
      description: "SFX importé",
      file: path.join("user", name),
      durationMs: 0,
      ready: true,
      user: true,
    }));
}

export function listSfx() {
  const builtIn = SFX_CATALOG.map((item) => {
    const absPath = path.join(sfxRoot, item.file);
    return { ...item, ready: fs.existsSync(absPath) };
  });
  return [...builtIn, ...listUserSfx()];
}

// The pool of effect keys eligible for the automatic "every 4s" placement: the
// bundled defaults (excluding the riser) + every SFX the user imported. Only
// keys whose file is actually present are returned.
export function listAutoSfxKeys() {
  const builtIn = SFX_CATALOG.filter(
    (item) => item.type === "effect" && fs.existsSync(path.join(sfxRoot, item.file))
  ).map((item) => item.key);
  const user = listUserSfx().map((item) => item.key);
  return [...builtIn, ...user];
}

export function getSfxByKey(key) {
  if (typeof key === "string" && key.startsWith(USER_SFX_PREFIX)) {
    return listUserSfx().find((s) => s.key === key) || null;
  }
  return SFX_CATALOG.find((s) => s.key === key) || null;
}

export function getSfxPath(key) {
  const item = getSfxByKey(key);
  if (!item) return null;
  const absPath = path.join(sfxRoot, item.file);
  return fs.existsSync(absPath) ? absPath : null;
}

export function deleteUserSfx(key) {
  if (typeof key !== "string" || !key.startsWith(USER_SFX_PREFIX)) return false;
  const name = key.slice(USER_SFX_PREFIX.length);
  // Guard against path traversal: only a bare filename is allowed.
  if (name.includes("/") || name.includes("..")) return false;
  const abs = path.join(userSfxRoot, name);
  try {
    fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}
