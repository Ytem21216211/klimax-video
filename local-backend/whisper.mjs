// Whisper transcription dispatcher.
//
// Three backends, picked from the configured whisper key (settings.whisper.apiKey):
//   - OpenRouter key (sk-or-...)  -> OpenRouter /api/v1/audio/transcriptions
//       (model openai/whisper-1). NOTE: OpenRouter returns TEXT ONLY — no word or
//       segment timestamps — so we synthesize even word timing across the audio
//       duration. Subtitles/SFX therefore land APPROXIMATELY; for tight sync use
//       the local backend (or OpenAI direct).
//   - OpenAI key (sk-...)         -> api.openai.com Whisper with real word-level
//       timestamps (timestamp_granularities[]=word,segment).
//   - No key                       -> local Faster-Whisper (transcribe.py), accurate
//       word timestamps, free.
//
// All paths return the same shape:
//   { backend, result: { language, duration, segments: [{start, end, text, words:[{word,start,end}]}] } }

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { settings as appSettings } from "./settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const pythonBin = path.join(projectRoot, "local-backend", ".venv", "bin", "python");
const transcribeScriptPath = path.join(projectRoot, "local-backend", "transcribe.py");
const whisperModelName = process.env.KLIMAX_WHISPER_MODEL || "small";

const isOpenRouterKey = (key) => /^sk-or-/i.test(key || "");

function runProcess(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, opts);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

// Extract a small speech-grade mono audio file (so we can base64 it under the 25 MB
// API limit and feed any video container to an audio-only endpoint).
async function extractAudioMp3(filePath) {
  const out = path.join(os.tmpdir(), `klimax-tr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.mp3`);
  await runProcess(ffmpegPath, ["-y", "-i", filePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", out]);
  return out;
}

async function probeDurationSec(filePath) {
  try {
    const { stdout } = await runProcess(ffprobe.path, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath]);
    return parseFloat(stdout) || 0;
  } catch {
    return 0;
  }
}

async function transcribeWithLocal(filePath) {
  try {
    await fsp.access(pythonBin);
  } catch {
    throw new Error("Le moteur local de transcription n'est pas installé (Python venv manquant).");
  }
  const { stdout } = await runProcess(pythonBin, [transcribeScriptPath, filePath, whisperModelName]);
  return JSON.parse(stdout);
}

async function transcribeWithOpenAI(filePath, apiKey, model) {
  const fileBuffer = await fsp.readFile(filePath);
  const fileName = path.basename(filePath);
  const blob = new Blob([fileBuffer]);
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("model", model || "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper API ${res.status}: ${text}`);
  }
  const data = await res.json();
  return {
    language: data.language || "unknown",
    duration: data.duration || 0,
    segments: (data.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      words: s.words || [],
    })),
  };
}

// OpenRouter returns plain text only. We extract the audio, send it base64, then
// SYNTHESIZE word timing by distributing the words evenly across the real audio
// duration (probed with ffprobe). Approximate, but keeps the whole caption / SFX /
// logo pipeline working.
async function transcribeWithOpenRouter(filePath, apiKey, model) {
  const audioPath = await extractAudioMp3(filePath);
  try {
    const buf = await fsp.readFile(audioPath);
    const slug = model && String(model).includes("/") ? model : "openai/whisper-1";
    const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: slug, input_audio: { data: buf.toString("base64"), format: "mp3" } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = String(data.text || "").trim();
    const duration = await probeDurationSec(audioPath);
    const tokens = text.split(/\s+/).filter(Boolean);
    const per = tokens.length && duration > 0 ? duration / tokens.length : 0;
    const words = tokens.map((w, i) => ({
      word: w,
      start: Number((i * per).toFixed(3)),
      end: Number(((i + 1) * per).toFixed(3)),
    }));
    return {
      language: data.language || "unknown",
      duration,
      segments: text ? [{ start: 0, end: duration, text, words }] : [],
    };
  } finally {
    fsp.unlink(audioPath).catch(() => {});
  }
}

export async function transcribeFile(filePath) {
  const section = await appSettings.getRawSection("whisper");
  if (section.apiKey) {
    try {
      if (isOpenRouterKey(section.apiKey)) {
        return { backend: "openrouter", result: await transcribeWithOpenRouter(filePath, section.apiKey, section.model) };
      }
      return { backend: "openai", result: await transcribeWithOpenAI(filePath, section.apiKey, section.model) };
    } catch (error) {
      // A remote-API problem (bad key, quota, outage) must never kill a render —
      // fall back to the accurate, free local backend.
      console.warn("[whisper] remote backend failed, falling back to local:", error.message);
    }
  }
  return { backend: "local", result: await transcribeWithLocal(filePath) };
}

export async function testWhisperConnection() {
  const section = await appSettings.getRawSection("whisper");
  if (!section.apiKey) return { ok: false, error: "Aucune clé API configurée." };
  if (isOpenRouterKey(section.apiKey)) {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${section.apiKey}` },
    });
    if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, model: section.model || "openai/whisper-1", provider: "openrouter", note: "Timing mot à mot approximé (OpenRouter ne renvoie pas les timestamps)." };
  }
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${section.apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `OpenAI ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, model: section.model, provider: "openai" };
}
