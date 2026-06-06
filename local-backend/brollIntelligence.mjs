// B-roll intelligence.
//
// Picks the most relevant b-roll asset for each video clip in a project.
// The "AI" part is a single call to a hosted LLM (default: Gemini 1.5 Flash)
// that gets a list of b-rolls (with their description/note) and a list of
// clips (with their transcript) and returns a JSON mapping.
//
// Pluggable: `provider` is "gemini" by default, but the call layer is
// isolated so we can add OpenAI / Anthropic / local later without touching
// the call sites.

import { settings as appSettings } from "./settings.mjs";

const SYSTEM_INSTRUCTION = `Tu es un monteur vidéo expert. On te donne :
1. Une liste de b-rolls avec, pour chacun, un identifiant et une description (ce que la vidéo montre réellement, en français ou dans la langue du transcript).
2. Une liste de segments vidéo d'un projet, avec, pour chacun, un identifiant et la transcription de ce qui est dit.

Ta tâche : pour CHAQUE segment, choisis le b-roll dont la description correspond le mieux au contenu parlé. Si aucun b-roll ne correspond (le segment parle d'un sujet sans rapport avec tous les b-rolls disponibles), renvoie null.

Règles strictes :
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans bloc markdown.
- Le JSON doit être un tableau : [{"clipId": "...", "brollId": "..."}] (ou null pour brollId).
- Utilise EXACTEMENT les identifiants fournis, ne modifie rien.
- N'invente pas de b-roll qui n'existe pas dans la liste.`;

function buildUserPayload({ clips, brolls }) {
  return JSON.stringify({
    brolls: brolls.map((b) => ({
      id: b.id,
      description: (b.note || b.title || "").trim(),
    })),
    segments: clips.map((c) => ({
      id: c.id,
      transcript: (c.transcript || "").trim(),
    })),
  }, null, 2);
}

function extractJson(text) {
  if (!text) return null;
  // Strip ```json fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  // Find the first JSON array in the body
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGemini({ apiKey, model, clips, brolls }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-1.5-flash")}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{
      role: "user",
      parts: [{ text: buildUserPayload({ clips, brolls }) }],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Réponse Gemini invalide (JSON non parsé).");
  }
  return parsed;
}

export async function pickBrollsForClips({ clips, brolls }) {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  if (!Array.isArray(brolls) || brolls.length === 0) {
    // Nothing to pick from: return null for every clip.
    return clips.map((c) => ({ clipId: c.id, brollId: null, reason: "no_brolls_available" }));
  }
  const section = await appSettings.getRawSection("brollIntelligence");
  if (!section.apiKey) {
    return clips.map((c) => ({ clipId: c.id, brollId: null, reason: "no_api_key" }));
  }
  const provider = section.provider || "gemini";
  if (provider !== "gemini") {
    return clips.map((c) => ({ clipId: c.id, brollId: null, reason: `provider_not_implemented:${provider}` }));
  }
  const allowedBrollIds = new Set(brolls.map((b) => b.id));
  const allowedClipIds = new Set(clips.map((c) => c.id));
  const raw = await callGemini({ apiKey: section.apiKey, model: section.model, clips, brolls });
  // Sanitize: drop unknown IDs, only return our known clips.
  const out = clips.map((c) => ({ clipId: c.id, brollId: null, reason: "no_match" }));
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (!allowedClipIds.has(item.clipId)) continue;
    const idx = out.findIndex((o) => o.clipId === item.clipId);
    if (idx === -1) continue;
    if (item.brollId == null) continue;
    if (!allowedBrollIds.has(item.brollId)) continue;
    out[idx] = { clipId: item.clipId, brollId: item.brollId, reason: "ok" };
  }
  return out;
}

export async function testBrollIntelligenceConnection() {
  const section = await appSettings.getRawSection("brollIntelligence");
  if (!section.apiKey) return { ok: false, error: "Aucune clé API configurée." };
  const model = section.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(section.apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Gemini ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, model };
}
