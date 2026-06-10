// Whisper transcription dispatcher.
//
// - If the user has configured an OpenAI API key in settings, we call
//   the hosted Whisper API (model: `whisper-1`) and get word-level timestamps
//   via `timestamp_granularities[]=["word","segment"]`.
// - Otherwise we fall back to the local Faster-Whisper Python script
//   (transcribe.py) that the project already ships with.
//
// Both code paths return the same shape:
//   { backend, result: { language, duration, segments: [{start, end, text, words: [{word, start, end}]}] } }

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { settings as appSettings } from "./settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const pythonBin = path.join(projectRoot, "local-backend", ".venv", "bin", "python");
const transcribeScriptPath = path.join(projectRoot, "local-backend", "transcribe.py");
const whisperModelName = process.env.KLIMAX_WHISPER_MODEL || "small";

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

export async function transcribeFile(filePath) {
  const section = await appSettings.getRawSection("whisper");
  if (section.apiKey) {
    return { backend: "openai", result: await transcribeWithOpenAI(filePath, section.apiKey, section.model) };
  }
  return { backend: "local", result: await transcribeWithLocal(filePath) };
}

export async function testWhisperConnection() {
  const section = await appSettings.getRawSection("whisper");
  if (!section.apiKey) return { ok: false, error: "Aucune clé API configurée." };
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${section.apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `OpenAI ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, model: section.model };
}

