// SFX library: visual transitions + original audio effects, generated on first run
// with ffmpeg into `local-data/klimax/system/sfx/`. The library is exposed via
// /api/sfx and consumed by the editor + render pipeline.
//
// Each entry: { key, label, type: "transition" | "effect", file, durationMs, description }.
// "transition" files are short MP4s (alpha channel for overlays) or generated via
// FFmpeg's color source. "effect" files are short generated WAV clips.
//
// The render pipeline applies the selected transition between clips via the
// ffmpeg `xfade` filter. Manual and automatic audio SFX are mixed via
// `adelay`+`amix`.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sfxRoot = path.join(projectRoot, "local-data", "klimax", "system", "sfx");

export const SFX_CATALOG = [
  // Visual transitions — short MP4 overlays (alpha not required, the render uses xfade).
  {
    key: "transition_film_roll",
    type: "transition",
    label: "Film roll",
    description: "Transition cinéma: défilement vertical de bandes.",
    file: "transitions/film-roll.mp4",
    durationMs: 600,
  },
  {
    key: "transition_whoosh",
    type: "transition",
    label: "Whoosh",
    description: "Balayage rapide avec flou de mouvement.",
    file: "transitions/whoosh.mp4",
    durationMs: 450,
  },
  {
    key: "transition_flash",
    type: "transition",
    label: "Flash",
    description: "Flash blanc/net entre deux plans, classique des shorts.",
    file: "transitions/flash.mp4",
    durationMs: 300,
  },
  // Audio effects — short WAV clips. Generated as sine bursts with envelopes.
  {
    key: "effect_pop",
    type: "effect",
    label: "Pop",
    description: "Burst court pour souligner un mot-clé.",
    file: "effects/pop.wav",
    durationMs: 180,
  },
  {
    key: "effect_fahh",
    type: "effect",
    label: "FAHH",
    description: "Souffle viral court pour ouvrir l'attention.",
    file: "effects/fahh.wav",
    durationMs: 420,
  },
  {
    key: "effect_ding",
    type: "effect",
    label: "Ding",
    description: "Cloche rapide, idéal pour les reveals.",
    file: "effects/ding.wav",
    durationMs: 350,
  },
  {
    key: "effect_bell",
    type: "effect",
    label: "Cloche",
    description: "Double cloche brillante pour souligner un mot fort.",
    file: "effects/bell.wav",
    durationMs: 520,
  },
  {
    key: "effect_tick",
    type: "effect",
    label: "Tick",
    description: "Tick net pour rythmer les coupes rapides.",
    file: "effects/tick.wav",
    durationMs: 90,
  },
  {
    key: "effect_snap",
    type: "effect",
    label: "Snap",
    description: "Clap sec pour marquer un reveal ou une réaction.",
    file: "effects/snap.wav",
    durationMs: 140,
  },
  {
    key: "effect_cash",
    type: "effect",
    label: "Cash",
    description: "Tintement léger type notification virale.",
    file: "effects/cash.wav",
    durationMs: 380,
  },
  {
    key: "effect_glitch",
    type: "effect",
    label: "Glitch",
    description: "Texture digitale courte pour casser la répétition.",
    file: "effects/glitch.wav",
    durationMs: 240,
  },
  {
    key: "effect_smooth_whoosh",
    type: "effect",
    label: "Smooth swosh",
    description: "Whoosh doux pour accompagner les zooms smooth et zoom out.",
    file: "effects/smooth-whoosh.wav",
    durationMs: 620,
  },
  {
    key: "effect_boom",
    type: "effect",
    label: "Boom",
    description: "Impact basse fréquence, parfait pour les punchlines.",
    file: "effects/boom.wav",
    durationMs: 500,
  },
  {
    key: "effect_riser",
    type: "effect",
    label: "Riser",
    description: "Montée d'attention avant la deuxième personne.",
    file: "effects/riser.wav",
    durationMs: 1150,
  },
];

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-y", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${label} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

// Generate one SFX. Returns the absolute file path.
async function ensureEffectPop(file) {
  // 180ms pop: 800Hz → 200Hz exponential sweep with sharp envelope.
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=800:duration=0.18",
    "-af", "afade=t=in:st=0:d=0.005,afade=t=out:st=0.05:d=0.13,volume=1.8,acompressor=threshold=-12dB:ratio=8:attack=5:release=50",
    "-ar", "48000", "-ac", "1",
    file,
  ], "pop");
}

async function ensureEffectDing(file) {
  // 350ms ding: 1800Hz primary + 2700Hz harmonic with bell envelope.
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=1800:duration=0.35",
    "-f", "lavfi", "-i", "sine=frequency=2700:duration=0.35",
    "-filter_complex", "[0:a]volume=1.0[a];[1:a]volume=0.4[b];[a][b]amix=inputs=2:duration=longest,afade=t=out:st=0.05:d=0.3,acompressor=threshold=-15dB:ratio=6:attack=3:release=80",
    "-ar", "48000", "-ac", "1",
    file,
  ], "ding");
}

async function ensureEffectFahh(file) {
  // 420ms breath/noise burst with a tonal layer. Original, generated locally.
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.42:sample_rate=48000",
    "-f", "lavfi", "-i", "sine=frequency=220:duration=0.42",
    "-filter_complex", "[0:a]highpass=f=650,lowpass=f=4200,afade=t=in:st=0:d=0.01,afade=t=out:st=0.13:d=0.29,volume=1.05[n];[1:a]volume=0.28,afade=t=out:st=0.08:d=0.34[t];[n][t]amix=inputs=2:duration=longest,acompressor=threshold=-14dB:ratio=8:attack=3:release=80",
    "-ar", "48000", "-ac", "1",
    file,
  ], "fahh");
}

async function ensureEffectBell(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=1260:duration=0.52",
    "-f", "lavfi", "-i", "sine=frequency=2520:duration=0.52",
    "-filter_complex", "[0:a]volume=0.9[a];[1:a]volume=0.35[b];[a][b]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.005,afade=t=out:st=0.10:d=0.42,acompressor=threshold=-16dB:ratio=5:attack=2:release=100",
    "-ar", "48000", "-ac", "1",
    file,
  ], "bell");
}

async function ensureEffectTick(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=2600:duration=0.09",
    "-af", "afade=t=in:st=0:d=0.002,afade=t=out:st=0.018:d=0.072,volume=1.4,acompressor=threshold=-12dB:ratio=10:attack=1:release=30",
    "-ar", "48000", "-ac", "1",
    file,
  ], "tick");
}

async function ensureEffectSnap(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=white:duration=0.14:sample_rate=48000",
    "-af", "highpass=f=1200,lowpass=f=7600,afade=t=in:st=0:d=0.002,afade=t=out:st=0.018:d=0.122,volume=0.95,acompressor=threshold=-12dB:ratio=10:attack=1:release=35",
    "-ar", "48000", "-ac", "1",
    file,
  ], "snap");
}

async function ensureEffectCash(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=980:duration=0.38",
    "-f", "lavfi", "-i", "sine=frequency=1960:duration=0.38",
    "-filter_complex", "[0:a]volume=0.65[a];[1:a]volume=0.5,adelay=65[b];[a][b]amix=inputs=2:duration=longest,afade=t=out:st=0.05:d=0.33,tremolo=f=18:d=0.45,acompressor=threshold=-15dB:ratio=5:attack=2:release=80",
    "-ar", "48000", "-ac", "1",
    file,
  ], "cash");
}

async function ensureEffectGlitch(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=violet:duration=0.24:sample_rate=48000",
    "-af", "highpass=f=900,lowpass=f=5200,tremolo=f=42:d=0.85,afade=t=in:st=0:d=0.004,afade=t=out:st=0.12:d=0.12,volume=0.85,acompressor=threshold=-14dB:ratio=9:attack=2:release=45",
    "-ar", "48000", "-ac", "1",
    file,
  ], "glitch");
}

async function ensureEffectSmoothWhoosh(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.62:sample_rate=48000",
    "-f", "lavfi", "-i", "sine=frequency=420:duration=0.62",
    "-filter_complex", "[0:a]highpass=f=420,lowpass=f=5200,afade=t=in:st=0:d=0.08,afade=t=out:st=0.38:d=0.24,volume=0.72[n];[1:a]volume=0.14,afade=t=in:st=0:d=0.08,afade=t=out:st=0.34:d=0.28[t];[n][t]amix=inputs=2:duration=longest,acompressor=threshold=-16dB:ratio=5:attack=8:release=120",
    "-ar", "48000", "-ac", "1",
    file,
  ], "smooth-whoosh");
}

async function ensureEffectBoom(file) {
  // 500ms boom: 60Hz with fast attack and slow decay.
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=60:duration=0.5",
    "-af", "afade=t=in:st=0:d=0.003,afade=t=out:st=0.05:d=0.45,volume=2.5,acompressor=threshold=-10dB:ratio=12:attack=2:release=120",
    "-ar", "48000", "-ac", "1",
    file,
  ], "boom");
}

async function ensureEffectRiser(file) {
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=pink:duration=1.15:sample_rate=48000",
    "-f", "lavfi", "-i", "sine=frequency=620:duration=1.15",
    "-filter_complex", "[0:a]highpass=f=500,lowpass=f=6800,afade=t=in:st=0:d=0.12,afade=t=out:st=0.98:d=0.17,volume=0.72[n];[1:a]volume=0.22,afade=t=in:st=0:d=0.2,afade=t=out:st=0.98:d=0.17[t];[n][t]amix=inputs=2:duration=longest,acompressor=threshold=-15dB:ratio=7:attack=6:release=120",
    "-ar", "48000", "-ac", "1",
    file,
  ], "riser");
}

async function ensureTransitionFilmRoll(file) {
  // 600ms film-roll: alternating black/white vertical bands scrolling down,
  // then a normal frame. This produces a 1080x1920@30 MP4 the render can xfade against.
  await runFfmpeg([
    "-f", "lavfi", "-i", `color=black:s=1080x1920:d=0.6:r=30`,
    "-vf", "format=yuv420p,drawbox=x=0:y=0:w=1080:h=960:color=white@0.0:t=fill,drawgrid=width=120:height=1920:color=white@0.9:thickness=6",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    file,
  ], "film-roll");
}

async function ensureTransitionWhoosh(file) {
  // 450ms whoosh: black canvas with a white diagonal blur swipe.
  await runFfmpeg([
    "-f", "lavfi", "-i", "color=black:s=1080x1920:d=0.45:r=30",
    "-vf", "format=yuv420p,gblur=sigma=20,drawbox=x='if(lt(t,0.225),(t/0.225)*1400-200,1080)':y=0:w=400:h=1920:color=white@0.85:t=fill",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    file,
  ], "whoosh");
}

async function ensureTransitionFlash(file) {
  // 300ms flash: white frame, fading to black.
  await runFfmpeg([
    "-f", "lavfi", "-i", "color=white:s=1080x1920:d=0.3:r=30",
    "-vf", "format=yuv420p,curves=preset=lighter,eq=brightness='1-2*t/0.3':saturation=0",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    file,
  ], "flash");
}

const GENERATORS = {
  effect_pop: ensureEffectPop,
  effect_fahh: ensureEffectFahh,
  effect_ding: ensureEffectDing,
  effect_bell: ensureEffectBell,
  effect_tick: ensureEffectTick,
  effect_snap: ensureEffectSnap,
  effect_cash: ensureEffectCash,
  effect_glitch: ensureEffectGlitch,
  effect_smooth_whoosh: ensureEffectSmoothWhoosh,
  effect_boom: ensureEffectBoom,
  effect_riser: ensureEffectRiser,
  transition_film_roll: ensureTransitionFilmRoll,
  transition_whoosh: ensureTransitionWhoosh,
  transition_flash: ensureTransitionFlash,
};

export async function ensureSfxLibrary() {
  await fsp.mkdir(sfxRoot, { recursive: true });
  for (const item of SFX_CATALOG) {
    const absPath = path.join(sfxRoot, item.file);
    if (fs.existsSync(absPath)) continue;
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    const gen = GENERATORS[item.key];
    if (!gen) continue;
    try {
      await gen(absPath);
    } catch (err) {
      console.warn(`[sfx] failed to generate ${item.key}:`, err.message);
    }
  }
}

export function listSfx() {
  return SFX_CATALOG.map((item) => {
    const absPath = path.join(sfxRoot, item.file);
    return { ...item, ready: fs.existsSync(absPath) };
  });
}

export function getSfxByKey(key) {
  return SFX_CATALOG.find((s) => s.key === key) || null;
}

export function getSfxPath(key) {
  const item = getSfxByKey(key);
  if (!item) return null;
  const absPath = path.join(sfxRoot, item.file);
  return fs.existsSync(absPath) ? absPath : null;
}
