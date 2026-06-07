// Presets storage for the editor.
//
// A preset captures a full project settings snapshot (subtitle style, hook style,
// hook text, music settings, b-roll / SFX / logo toggles, etc.) so the user can
// re-apply it to a new project in one click — and so A/B tests are traceable
// by name. Storage is `local-data/klimax/presets.json`.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "local-data", "klimax");
const presetsPath = path.join(dataRoot, "presets.json");

// Field allowlist — anything else in the saved payload is dropped. This is the
// single source of truth for what a preset is allowed to override.
export const PRESET_FIELDS = [
  "hookText",
  "subtitleSize",
  "subtitleStyle",
  "hookStyle",
  "musicEnabled",
  "musicVolumeDb",
  "videoFilterKey",
  "brollEnabled",
  "autoSfxEnabled",
  "autoZoomEnabled",
  "autoZoomMode",
  "autoZoomBoostPercent",
  "autoZoomDurationSeconds",
  "introZoomOutEnabled",
  "replyZoomOutEnabled",
  "zoomOutStartPercent",
  "zoomOutDurationSeconds",
  "klimaxLogoEnabled",
  "logoTriggerWord",
  "introVerticalPosition",
  "replyVerticalPosition",
];

function readAll() {
  try {
    const raw = JSON.parse(fs.readFileSync(presetsPath, "utf8"));
    return Array.isArray(raw?.presets) ? raw.presets : [];
  } catch {
    return [];
  }
}

async function writeAll(presets) {
  await fsp.mkdir(dataRoot, { recursive: true });
  await fsp.writeFile(presetsPath, JSON.stringify({ presets }, null, 2));
}

function sanitizePayload(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  if (typeof input.name === "string" && input.name.trim().length > 0) {
    out.name = input.name.trim().slice(0, 80);
  }
  for (const field of PRESET_FIELDS) {
    if (field in input) out[field] = input[field];
  }
  return out;
}

export async function listPresets() {
  return readAll();
}

export async function createPreset(input) {
  const sanitized = sanitizePayload(input);
  if (!sanitized.name) throw new Error("Nom de preset requis");
  const now = new Date().toISOString();
  const preset = {
    id: `preset-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    name: sanitized.name,
    created_at: now,
    updated_at: now,
    settings: { ...sanitized },
  };
  delete preset.settings.name;
  const all = readAll();
  all.unshift(preset);
  await writeAll(all);
  return preset;
}

export async function updatePreset(id, input) {
  const sanitized = sanitizePayload(input);
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Preset introuvable");
  const current = all[idx];
  const next = {
    ...current,
    name: sanitized.name || current.name,
    updated_at: new Date().toISOString(),
    settings: { ...current.settings, ...sanitized.settings },
  };
  delete next.settings.name;
  all[idx] = next;
  await writeAll(all);
  return next;
}

export async function deletePreset(id) {
  const all = readAll();
  const next = all.filter((p) => p.id !== id);
  await writeAll(next);
  return { ok: true, removed: all.length - next.length };
}
