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
import { runClaude } from "./claudeBridge.mjs";

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

async function callClaude({ clips, brolls }) {
  const prompt = `${buildUserPayload({ clips, brolls })}\n\nRends le tableau JSON demandé.`;
  const text = await runClaude(prompt, SYSTEM_INSTRUCTION);
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Réponse Claude invalide (JSON non parsé).");
  }
  return parsed;
}

export async function pickBrollsForClips({ clips, brolls }) {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  if (!Array.isArray(brolls) || brolls.length === 0) {
    // Nothing to pick from: return null for every clip.
    return clips.map((c) => ({ clipId: c.id, brollId: null, reason: "no_brolls_available" }));
  }
  // B-roll selection now runs on the local Claude CLI — no API key required.
  const allowedBrollIds = new Set(brolls.map((b) => b.id));
  const allowedClipIds = new Set(clips.map((c) => c.id));
  const raw = await callClaude({ clips, brolls });
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

// ---------------------------------------------------------------------------
// Moment-level placement: instead of one b-roll for a whole clip, decide WHEN
// (which transcript cue) each b-roll should appear, so several b-rolls can play
// in sequence inside one clip — "on parle de X → b-roll de X".
// ---------------------------------------------------------------------------
const MOMENT_SYSTEM = `Tu es un monteur vidéo expert pour des TikTok/Shorts. On te donne :
1. Une liste de b-rolls (id + description de ce qu'ils montrent / représentent).
2. La transcription d'UN segment, découpée en "cues" numérotés avec leur temps (en secondes).

Ta tâche : placer des b-rolls pour ILLUSTRER ce qui est dit, sur le bon cue, au bon mot.

PERTINENCE (le plus important) :
- Place un b-roll quand sa description correspond à l'IDÉE ou au THÈME exprimé à ce moment — au sens propre OU figuré.
- RÈGLES FIXES (applique-les systématiquement quand le mot est dit) :
  • "respiration" / "exercice de respiration" / "respirer" → un b-roll de respiration.
  • "périnée" / "kegel" / "exercices de kegel" → un b-roll de kegel.
  • "confiance en soi" / "confiance" / "réussite" / "tenir au lit" → un b-roll d'affirmations positives / réussite / confiance.
- MAIS ne force jamais un b-roll sans lien réel. Contre-exemple : "doubler le temps" parle de durée → PAS un b-roll d'exercice juste parce que c'est "lié au sport".
- Place-en à CHAQUE fois qu'un mot/concept a un b-roll qui colle vraiment (n'hésite pas à en mettre plusieurs au fil du segment).

TRANSCRIPTION IMPARFAITE :
- Le texte vient d'une transcription automatique : les mots techniques sont souvent mal écrits. Lis PHONÉTIQUEMENT : "périnée" peut apparaître comme "péri né", "perinet", "périnnée" ; "kegel" comme "kéguel", "quegel", "kegle", "cake-gel" ; "respiration" comme "respi", "respirassion". Si un mot SONNE comme un mot-clé des règles, applique la règle.

TIMING :
- Pour chaque b-roll, renvoie aussi "trigger" : le MOT EXACT (ou 1-2 mots) du cue qui déclenche le b-roll, copié tel quel depuis le texte. Le b-roll s'affichera dès ce mot.

VARIÉTÉ :
- N'utilise JAMAIS deux fois le même b-roll (même id) dans tout le segment. Si un thème revient et que plusieurs b-rolls différents le montrent, prends une VARIANTE différente à chaque fois. Si aucun b-roll inutilisé ne colle, ne mets rien.

FORMAT :
- Réponds UNIQUEMENT avec du JSON valide (un tableau), sans texte ni markdown.
- [{"cueIndex": <number>, "brollId": "<id>", "trigger": "<mot exact>"}].
- Ids EXACTS fournis, n'invente rien. Au plus un b-roll par cue. Si rien ne colle, renvoie [].`;

// clip = { id, cues: [{ start, text }] }. Returns [{ cueIndex, brollId }].
export async function pickBrollMomentsForClip({ clip, brolls }) {
  if (!clip || !Array.isArray(clip.cues) || clip.cues.length === 0) return [];
  if (!Array.isArray(brolls) || brolls.length === 0) return [];
  const allowed = new Set(brolls.map((b) => b.id));
  const payload = JSON.stringify({
    brolls: brolls.map((b) => ({ id: b.id, description: (b.note || b.title || "").trim() })),
    cues: clip.cues.map((c, i) => ({ cueIndex: i, t: Number((c.start || 0).toFixed(2)), text: (c.text || "").trim() })),
  }, null, 2);
  const text = await runClaude(`${payload}\n\nRends le tableau JSON demandé.`, MOMENT_SYSTEM);
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const out = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const cueIndex = Number(item.cueIndex);
    if (!Number.isInteger(cueIndex) || cueIndex < 0 || cueIndex >= clip.cues.length) continue;
    if (!allowed.has(item.brollId)) continue;
    if (seen.has(cueIndex)) continue;
    seen.add(cueIndex);
    out.push({ cueIndex, brollId: item.brollId, trigger: typeof item.trigger === "string" ? item.trigger : "" });
  }
  out.sort((a, b) => a.cueIndex - b.cueIndex);
  return out;
}

export async function testBrollIntelligenceConnection() {
  try {
    const text = await runClaude('Réponds uniquement "ok".', "Tu es un service de test de connexion.");
    if (!text) return { ok: false, error: "Claude n'a renvoyé aucune réponse." };
    return { ok: true, model: process.env.KLIMAX_CLAUDE_MODEL || "claude (sonnet)" };
  } catch (e) {
    return { ok: false, error: `Claude: ${String(e.message || e).slice(0, 200)}` };
  }
}
