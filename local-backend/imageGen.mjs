// Text-to-image generation for the "Image" (carousel) mode.
//
// Provider "gemini" → Google's generativelanguage REST API. Two shapes, selected by the
// configured model name:
//   - "imagen-*"  → POST /models/<model>:predict           (Imagen, returns bytesBase64Encoded)
//   - otherwise   → POST /models/<model>:generateContent   (Gemini image, inline_data base64)
//
// The API key is the user's own Google AI Studio key, stored in settings.imageGen.apiKey
// (NOT shared with b-roll). Generated PNGs are content-addressed and cached on disk so the
// reused per-carousel background and any re-run are free. A small concurrency semaphore
// keeps us under Imagen's rate limit. Safety refusals surface as ImageSafetyError so the
// caller can retry with a more clinical prompt before failing the slide.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { settings as appSettings } from "./settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "local-data", "klimax");
const cacheRoot = path.join(dataRoot, "image-cache");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const IMAGEGEN_CONCURRENCY = Math.max(1, Number(process.env.KLIMAX_IMAGEGEN_CONCURRENCY) || 2);

export class ImageSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageSafetyError";
    this.safety = true;
  }
}

// --- tiny concurrency semaphore (Imagen is rate-limited) ---
let active = 0;
const waiters = [];
const acquire = () =>
  new Promise((resolve) => {
    if (active < IMAGEGEN_CONCURRENCY) { active += 1; resolve(); }
    else waiters.push(resolve);
  });
const release = () => {
  active -= 1;
  const next = waiters.shift();
  if (next) { active += 1; next(); }
};

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

async function imageGenConfig() {
  const sec = await appSettings.getRawSection("imageGen");
  return {
    provider: sec.provider || "gemini",
    apiKey: sec.apiKey || "",
    model: sec.model || "imagen-3.0-generate-002",
  };
}

// Detect a safety/blocked refusal in a Gemini/Imagen error or response body.
function looksLikeSafetyBlock(status, bodyText) {
  const t = String(bodyText || "").toLowerCase();
  return (
    /safety|blocked|sensitive|prohibited|policy|responsible ai|sexually/.test(t) ||
    (status === 400 && /filter/.test(t))
  );
}

async function callImagen(model, apiKey, prompt, aspectRatio) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:predict?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio, personGeneration: "allow_adult" },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (looksLikeSafetyBlock(res.status, text)) throw new ImageSafetyError(`Imagen safety block: ${text.slice(0, 200)}`);
    throw new Error(`Imagen HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Imagen bad JSON: ${text.slice(0, 200)}`); }
  const preds = json.predictions || [];
  const b64 = preds[0] && (preds[0].bytesBase64Encoded || preds[0].image?.bytesBase64Encoded);
  if (!b64) {
    if (looksLikeSafetyBlock(200, text)) throw new ImageSafetyError("Imagen returned no image (safety filtered)");
    throw new Error(`Imagen returned no image: ${text.slice(0, 200)}`);
  }
  return Buffer.from(b64, "base64");
}

// OpenRouter (OpenAI-compatible chat with image output, e.g. google/gemini-2.5-flash-image).
async function callOpenRouterImage(model, apiKey, prompt, aspectRatio) {
  const ar = aspectRatio === "1:1" ? "square 1:1" : "vertical portrait 4:5";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "HTTP-Referer": "https://klimax.local", "X-Title": "Klimax" },
    body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content: `Generate a ${ar} image. ${prompt}` }] }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (looksLikeSafetyBlock(res.status, text)) throw new ImageSafetyError(`OpenRouter safety block: ${text.slice(0, 200)}`);
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`OpenRouter bad JSON: ${text.slice(0, 200)}`); }
  const images = json.choices?.[0]?.message?.images || [];
  const url = images[0]?.image_url?.url || images[0]?.url || null;
  if (!url) {
    if (looksLikeSafetyBlock(200, text)) throw new ImageSafetyError("OpenRouter returned no image (safety filtered)");
    throw new Error(`OpenRouter returned no image: ${text.slice(0, 200)}`);
  }
  const b64 = url.startsWith("data:") ? url.split(",")[1] : null;
  if (!b64) throw new Error("OpenRouter image is not inline base64.");
  return Buffer.from(b64, "base64");
}

async function callGeminiImage(model, apiKey, prompt) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (looksLikeSafetyBlock(res.status, text)) throw new ImageSafetyError(`Gemini image safety block: ${text.slice(0, 200)}`);
    throw new Error(`Gemini image HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Gemini image bad JSON: ${text.slice(0, 200)}`); }
  const parts = json.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p) => p.inline_data || p.inlineData);
  const b64 = inline && (inline.inline_data?.data || inline.inlineData?.data);
  if (!b64) {
    if (looksLikeSafetyBlock(200, text)) throw new ImageSafetyError("Gemini returned no image (safety filtered)");
    throw new Error(`Gemini returned no image: ${text.slice(0, 200)}`);
  }
  return Buffer.from(b64, "base64");
}

// Generate ONE image for `prompt`. Returns { path } to a PNG on disk (cached).
// Throws ImageSafetyError on a policy refusal, or a plain Error otherwise.
export async function generateImage(prompt, { aspectRatio = "3:4", outPath = null } = {}) {
  const { provider, apiKey, model } = await imageGenConfig();
  if (!apiKey) throw new Error("Aucune clé API image (Paramètres → Génération d'image).");
  if (provider !== "gemini" && provider !== "openrouter") throw new Error(`Provider image inconnu: ${provider}`);

  await fsp.mkdir(cacheRoot, { recursive: true });
  const cacheKey = sha(`${provider}|${model}|${aspectRatio}|${prompt}`);
  const cachePath = path.join(cacheRoot, `${cacheKey}.png`);

  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    if (outPath && outPath !== cachePath) { await fsp.copyFile(cachePath, outPath); return { path: outPath, cached: true }; }
    return { path: cachePath, cached: true };
  }

  await acquire();
  try {
    const buf = provider === "openrouter"
      ? await callOpenRouterImage(model, apiKey, prompt, aspectRatio)
      : model.startsWith("imagen")
        ? await callImagen(model, apiKey, prompt, aspectRatio)
        : await callGeminiImage(model, apiKey, prompt);
    if (!buf || buf.length === 0) throw new Error("Image vide renvoyée par le provider.");
    await fsp.writeFile(cachePath, buf);
    if (outPath && outPath !== cachePath) { await fsp.copyFile(cachePath, outPath); return { path: outPath, cached: false }; }
    return { path: cachePath, cached: false };
  } finally {
    release();
  }
}

// Lightweight connectivity/credential check for the settings "Tester" button.
export async function testImageGenConnection() {
  try {
    const { apiKey, model, provider } = await imageGenConfig();
    if (!apiKey) return { ok: false, error: "Aucune clé API configurée." };
    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (res.status === 200) return { ok: true, provider, model };
      return { ok: false, error: `OpenRouter: clé refusée (HTTP ${res.status}).` };
    }
    // A real 1-image generation is the only honest test (lists don't prove image access),
    // but it costs money — so just verify the key is accepted by listing models.
    const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}?key=${apiKey}`);
    if (res.status === 200) return { ok: true, provider, model };
    const text = await res.text();
    if (res.status === 403 || res.status === 401) return { ok: false, error: "Clé refusée (401/403)." };
    if (res.status === 404) return { ok: false, error: `Modèle introuvable: ${model}. Vérifie le nom dans les Paramètres.` };
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
