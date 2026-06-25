// App-level settings for the local backend (API keys, feature flags).
// Persisted in `local-data/klimax/settings.json` (gitignored alongside the data dir).
//
// Secret values are returned masked to the browser via `maskedForBrowser()` and only
// ever leave the server in plain text over local HTTP. To get the real value for an
// outbound call, use `getRaw()`.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "local-data", "klimax");
const settingsPath = path.join(dataRoot, "settings.json");

export const DEFAULT_SETTINGS = {
  whisper: {
    apiKey: "",
    model: "whisper-1",
  },
  brollIntelligence: {
    apiKey: "",
    model: "gemini-1.5-flash",
  },
  // Text-to-image generation for the "Image" (carousel) mode. Own key (not shared with
  // b-roll). provider "gemini" → Google Imagen / Gemini image models via the
  // generativelanguage REST API. The key is the user's Google AI Studio API key.
  imageGen: {
    provider: "gemini",
    apiKey: "",
    model: "imagen-3.0-generate-002",
  },
};

function deepMerge(base, override) {
  if (override == null || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base?.[k], v);
  return out;
}

function maskKey(value) {
  if (!value || typeof value !== "string" || value.length < 8) return value ? "•".repeat(value.length) : "";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function maskedSnapshot(settings) {
  // Always returns MASKED keys — never the raw secret. The browser-side
  // "show" toggle decodes the mask client-side, but the server never
  // re-exposes the original value over HTTP after the user has saved it.
  return {
    whisper: {
      apiKeyMasked: maskKey(settings.whisper?.apiKey || ""),
      hasKey: Boolean(settings.whisper?.apiKey),
      model: settings.whisper?.model || "whisper-1",
    },
    brollIntelligence: {
      apiKeyMasked: maskKey(settings.brollIntelligence?.apiKey || ""),
      hasKey: Boolean(settings.brollIntelligence?.apiKey),
      model: settings.brollIntelligence?.model || "gemini-1.5-flash",
    },
    imageGen: {
      apiKeyMasked: maskKey(settings.imageGen?.apiKey || ""),
      hasKey: Boolean(settings.imageGen?.apiKey),
      provider: settings.imageGen?.provider || "gemini",
      model: settings.imageGen?.model || "imagen-3.0-generate-002",
    },
  };
}

class Settings {
  constructor() {
    this._cache = null;
  }

  async _loadFromDisk() {
    await fsp.mkdir(dataRoot, { recursive: true });
    try {
      const raw = JSON.parse(await fsp.readFile(settingsPath, "utf8"));
      this._cache = deepMerge(DEFAULT_SETTINGS, raw);
    } catch {
      this._cache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await fsp.writeFile(settingsPath, JSON.stringify(this._cache, null, 2));
    }
    return this._cache;
  }

  async getRaw() {
    if (!this._cache) await this._loadFromDisk();
    return this._cache;
  }

  async getRawSection(section) {
    const all = await this.getRaw();
    return all[section] || {};
  }

  async maskedForBrowser() {
    const all = await this.getRaw();
    return maskedSnapshot(all);
  }

  async update(partial) {
    const current = await this.getRaw();
    const next = deepMerge(current, partial || {});
    await fsp.writeFile(settingsPath, JSON.stringify(next, null, 2));
    this._cache = next;
    return maskedSnapshot(next);
  }
}

export const settings = new Settings();

export function ensureSettingsFileExistsSync() {
  try {
    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(dataRoot, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    }
  } catch {
    // best-effort
  }
}
