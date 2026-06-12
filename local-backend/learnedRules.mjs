// Learned-rules store — the "training mode" memory.
//
// The Automatic-Mode engine never changes: this file is the ONLY thing that
// evolves. The user writes free-text feedback on a generated video; Claude
// distills it into structured rules saved here; those rules are then injected
// back into the engine on the next run — as PROMPT TEXT for the LLM-driven
// dimensions (hooks, b-roll) and as PLANNER OVERRIDES for the deterministic
// ones (subtitles, zoom, music, split-screen). No code is rewritten — only data.
//
// Everything is a single uniform "rule" list so the UI can list/delete any of
// them the same way. A rule is either:
//   - kind:"text"  -> injected into a system prompt (categories hooks/broll/general)
//   - kind:"param" -> reduced into the planner overrides object (the rest)

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { runClaude } from "./claudeBridge.mjs";
import { PRESET_KEYS, FILTER_KEYS } from "./autoVariants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(path.resolve(__dirname, ".."), "local-data", "klimax");
const rulesFile = path.join(dataRoot, "learned-rules.json");

const TEXT_CATEGORIES = ["hooks", "broll", "general"];
// Deterministic params the planner knows how to honour, with the value shape we
// expect. Claude is told these EXACT keys + ranges so it never invents one.
export const PARAM_SPEC = {
  // music too loud -> lower the ceiling (musicVolumeDb is negative, -20..-14 base)
  musicVolumeMaxDb: { category: "music", type: "number", min: -30, max: -10 },
  // zooms too aggressive -> cap the boost percent (base intensities are 12 & 22)
  zoomMaxBoostPercent: { category: "zoom", type: "number", min: 6, max: 30 },
  // restrict subtitle presets to a whitelist of preset keys
  allowedSubtitlePresets: { category: "subtitles", type: "stringArray", enum: PRESET_KEYS },
  // cap subtitle font size (base varies 65..90)
  subtitleSizeMax: { category: "subtitles", type: "number", min: 40, max: 110 },
  // ban some video filters (keys)
  filterDenylist: { category: "subtitles", type: "stringArray", enum: FILTER_KEYS },
  // share of variants that use 2 speakers (split-screen), 0..1
  twoSpeakerRatio: { category: "splitscreen", type: "number", min: 0, max: 1 },
};

const newId = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const EMPTY = { version: 1, updatedAt: null, rules: [], history: [] };

export const readLearnedRules = async () => {
  try {
    const raw = JSON.parse(await fs.readFile(rulesFile, "utf8"));
    return {
      version: 1,
      updatedAt: raw.updatedAt || null,
      rules: Array.isArray(raw.rules) ? raw.rules : [],
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  } catch {
    return { ...EMPTY };
  }
};

// Atomic + serialized writes (mirror server.mjs db/auto-jobs pattern).
let writeChain = Promise.resolve();
const writeLearnedRules = (store) => {
  store.updatedAt = nowIso();
  const payload = JSON.stringify(store, null, 2);
  writeChain = writeChain.then(async () => {
    await fs.mkdir(dataRoot, { recursive: true });
    const tmp = `${rulesFile}.tmp-${process.pid}`;
    await fs.writeFile(tmp, payload);
    await fs.rename(tmp, rulesFile);
  }).catch(() => {});
  return writeChain;
};

// ---------------------------------------------------------------------------
// Injection helpers — read by the engine at generation time.
// ---------------------------------------------------------------------------

// Text block appended to an LLM system prompt for a given category. `general`
// rules apply to every category. Returns "" when there's nothing learned.
export async function buildLearnedRulesBlock(category) {
  const { rules } = await readLearnedRules();
  const texts = rules
    .filter((r) => r.kind === "text" && (r.category === category || r.category === "general"))
    .sort((a, b) => (b.weight || 1) - (a.weight || 1))
    .map((r) => `- ${r.text}`);
  if (!texts.length) return "";
  return (
    `\n\n# RÈGLES APPRISES (feedback utilisateur — applique-les EN PRIORITÉ)\n` +
    `Ces consignes viennent des retours sur les vidéos précédentes. Respecte-les strictement :\n` +
    texts.join("\n")
  );
}

// Reduce the param-rules into a single overrides object the planner consumes.
// Last write wins per param (rules are kept in creation order).
export async function getPlannerOverrides() {
  const { rules } = await readLearnedRules();
  const overrides = {};
  for (const r of rules.filter((x) => x.kind === "param" && PARAM_SPEC[x.param])) {
    overrides[r.param] = r.value;
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Validation + merge of a distilled result.
// ---------------------------------------------------------------------------
function coerceParam(param, value) {
  const spec = PARAM_SPEC[param];
  if (!spec) return undefined;
  if (spec.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(spec.max, Math.max(spec.min, n));
  }
  if (spec.type === "stringArray") {
    if (!Array.isArray(value)) return undefined;
    const allowed = new Set(spec.enum);
    const out = value.map(String).filter((v) => allowed.has(v));
    return out.length ? Array.from(new Set(out)) : undefined;
  }
  return undefined;
}

// Apply a distilled `{ promptRules, paramRules, removeRuleIds }` onto the store.
function applyDistillation(store, distilled, meta) {
  const added = [];
  const removed = [];

  for (const id of distilled.removeRuleIds || []) {
    const before = store.rules.length;
    store.rules = store.rules.filter((r) => r.id !== id);
    if (store.rules.length < before) removed.push(id);
  }

  const existingText = new Set(store.rules.filter((r) => r.kind === "text").map((r) => norm(r.text)));
  for (const { category, text } of distilled.promptRules || []) {
    const cat = TEXT_CATEGORIES.includes(category) ? category : "general";
    const clean = String(text || "").trim();
    if (!clean || existingText.has(norm(clean))) continue;
    existingText.add(norm(clean));
    const rule = { id: newId("rule"), category: cat, kind: "text", text: clean, weight: 1, source: "feedback", createdAt: nowIso(), feedbackId: meta.feedbackId };
    store.rules.push(rule);
    added.push(rule.id);
  }

  for (const { param, value } of distilled.paramRules || []) {
    const coerced = coerceParam(param, value);
    if (coerced === undefined) continue;
    // One active rule per param: replace any existing one (the new value wins).
    const dropped = store.rules.filter((r) => r.kind === "param" && r.param === param).map((r) => r.id);
    store.rules = store.rules.filter((r) => !(r.kind === "param" && r.param === param));
    removed.push(...dropped);
    const rule = { id: newId("rule"), category: PARAM_SPEC[param].category, kind: "param", param, value: coerced, weight: 1, source: "feedback", createdAt: nowIso(), feedbackId: meta.feedbackId };
    store.rules.push(rule);
    added.push(rule.id);
  }

  return { added, removed };
}

// ---------------------------------------------------------------------------
// Distillation — turn free-text feedback (+ the actual decisions taken) into rules.
// ---------------------------------------------------------------------------
const ARCHITECT_SYSTEM =
  "Tu es l'architecte d'un moteur de montage vidéo automatique (TikTok/Shorts FR). " +
  "Un humain te donne un FEEDBACK en langage naturel sur une vidéo générée, plus les DÉCISIONS réelles prises par le moteur et les RÈGLES déjà apprises. " +
  "Ton job : convertir le feedback en règles persistantes réutilisables (pas un correctif ponctuel). " +
  "Le moteur a deux types de leviers :\n" +
  "1) PROMPT (texte injecté dans l'IA) pour les catégories : hooks (accroches), broll (vidéos d'illustration), general. " +
  "Écris des consignes courtes, générales, impératives, en français.\n" +
  "2) PARAMÈTRES déterministes — utilise EXACTEMENT ces clés et bornes :\n" +
  Object.entries(PARAM_SPEC)
    .map(([k, s]) => `   - ${k} (${s.category}) : ${s.type === "stringArray" ? `tableau parmi [${s.enum.join(", ")}]` : `nombre ${s.min}..${s.max}`}`)
    .join("\n") +
  "\n\nRègles de sortie :\n" +
  "- N'invente JAMAIS une clé de paramètre ou une valeur d'enum hors des listes.\n" +
  "- Préfère un paramètre quand le feedback est quantifiable (musique trop forte → musicVolumeMaxDb plus bas ; zooms trop violents → zoomMaxBoostPercent plus bas ; sous-titres trop gros → subtitleSizeMax).\n" +
  "- Si le feedback contredit/remplace une règle existante, mets son id dans removeRuleIds.\n" +
  "- Si le feedback ne concerne pas une catégorie, ne produis rien pour elle. Pas de bla-bla.\n" +
  'Réponds UNIQUEMENT en JSON valide, sans markdown :\n' +
  '{"promptRules":[{"category":"hooks|broll|general","text":"..."}],"paramRules":[{"param":"<clé>","value":<valeur>}],"removeRuleIds":["..."]}';

function safeJson(text) {
  if (!text) return null;
  const fenced = String(text).replace(/```json|```/g, "");
  const m = fenced.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Distill + persist. Returns { store, added, removed, distilled, history }.
export async function ingestFeedback({ feedback, decisions, jobId = null, itemId = null }) {
  const store = await readLearnedRules();
  const feedbackId = newId("fb");

  const promptText =
    `FEEDBACK DE L'UTILISATEUR :\n${String(feedback).slice(0, 2000)}\n\n` +
    `DÉCISIONS PRISES PAR LE MOTEUR SUR CETTE VIDÉO :\n${JSON.stringify(decisions || {}, null, 2).slice(0, 2500)}\n\n` +
    `RÈGLES DÉJÀ APPRISES (id → contenu) :\n${
      store.rules.length
        ? store.rules.map((r) => `${r.id}: [${r.category}] ${r.kind === "text" ? r.text : `${r.param}=${JSON.stringify(r.value)}`}`).join("\n")
        : "(aucune)"
    }\n\nProduis le JSON demandé.`;

  let distilled = null;
  try {
    distilled = safeJson(await runClaude(promptText, ARCHITECT_SYSTEM));
  } catch (e) {
    throw new Error(`Distillation échouée: ${e.message}`);
  }
  if (!distilled || typeof distilled !== "object") {
    throw new Error("L'IA n'a pas renvoyé de règles exploitables. Reformule le feedback.");
  }

  const { added, removed } = applyDistillation(store, distilled, { feedbackId });
  const historyEntry = {
    id: feedbackId, jobId, itemId, feedback: String(feedback).slice(0, 2000),
    decisions: decisions || null, addedRuleIds: added, removedRuleIds: removed, createdAt: nowIso(),
  };
  store.history.unshift(historyEntry);
  store.history = store.history.slice(0, 100);
  await writeLearnedRules(store);
  return { store, added, removed, distilled, history: historyEntry };
}

export async function deleteRule(id) {
  const store = await readLearnedRules();
  const before = store.rules.length;
  store.rules = store.rules.filter((r) => r.id !== id);
  const removed = store.rules.length < before;
  if (removed) await writeLearnedRules(store);
  return { store, removed };
}

export async function clearAllRules() {
  const store = await readLearnedRules();
  store.rules = [];
  await writeLearnedRules(store);
  return { store };
}
