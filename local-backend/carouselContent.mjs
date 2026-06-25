// Carousel CONTENT pipeline for the "Image" mode.
//
// 1. Topic mining ("train on our videos"): scan the existing project transcripts for the
//    exercise vocabulary the app already recognises (kegel/périnée, respiration, confiance…)
//    and return the topics actually discussed, ranked by how often they appear.
// 2. Per-topic slide content: ONE runClaude call → {topicLabel, slideCount, backgroundPrompt,
//    slides[{role,title,explanation,diagramPrompt}]}. All image prompts are forced CLINICAL/SFW
//    (Imagen/Gemini refuse sexual content) — the crude video-hook tone never reaches the image model.
// The server appends the deterministic Klimax-logo CTA slide (no image prompt, uses the logo PNG).

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClaude } from "./claudeBridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const transcriptsDir = path.join(projectRoot, "local-data", "klimax", "transcripts");

// Hard SFW preamble prepended to EVERY image prompt sent to the generator.
export const SFW_PREFIX =
  "Clinical medical anatomical diagram, SFW, educational textbook illustration, tasteful, fully clothed, no nudity, no explicit or suggestive content: ";

// Canonical exercise topics + phonetic detection (mirrors brollIntelligence's vocabulary).
const TOPIC_VOCAB = [
  { key: "kegel", label: "Exercices de Kegel (périnée)", rx: /\b(k[ée]gels?|k[ée]guels?|quegels?|kegle|cake.?gel|p[ée]rin[ée]+e?|peri.?n[ée]|perinet)\b/i },
  { key: "respiration", label: "Respiration & contrôle", rx: /\b(respiration|respirer|respi(?:rassion)?|souffle|inspire?|expire?)\b/i },
  { key: "confiance", label: "Confiance en soi", rx: /\b(confiance|assurance|mental|r[ée]ussite|estime)\b/i },
  { key: "endurance", label: "Endurance & durée", rx: /\b(endurance|tenir|dur[ée]e?|tenir plus longtemps|contr[ôo]le)\b/i },
  { key: "muscles", label: "Muscles du plancher pelvien", rx: /\b(muscles?|plancher pelvien|contracter|contraction|tonus)\b/i },
];

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

// mulberry32 — deterministic PRNG so topic rotation is reproducible on resume.
function seededRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Read every transcript, flatten the spoken text, and rank the exercise topics present.
export async function mineExerciseTopics() {
  let files = [];
  try { files = (await fsp.readdir(transcriptsDir)).filter((f) => f.endsWith(".json")); } catch { files = []; }
  const counts = new Map();
  for (const f of files) {
    let doc;
    try { doc = JSON.parse(await fsp.readFile(path.join(transcriptsDir, f), "utf8")); } catch { continue; }
    const text = (doc.clips || [])
      .flatMap((c) => (c.cues || []).map((q) => q.text || ""))
      .join(" ");
    if (!text) continue;
    for (const topic of TOPIC_VOCAB) {
      const m = text.match(new RegExp(topic.rx, "gi"));
      if (m && m.length) counts.set(topic.key, (counts.get(topic.key) || 0) + m.length);
    }
  }
  const ranked = TOPIC_VOCAB
    .map((t) => ({ ...t, count: counts.get(t.key) || 0 }))
    .sort((a, b) => b.count - a.count);
  // If nothing was mined (no transcripts), still offer the canonical base set.
  return ranked.some((t) => t.count > 0) ? ranked.filter((t) => t.count > 0) : ranked;
}

// Pick `count` distinct topics (mined-first), rotated deterministically by seed.
export async function pickTopics(count, seed = 1) {
  const ranked = await mineExerciseTopics();
  if (ranked.length === 0) return [];
  const rng = seededRng(seed);
  const pool = ranked.slice();
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  // If more carousels than distinct topics are requested, cycle through them again.
  let k = 0;
  while (out.length < count) { out.push(ranked[k % ranked.length]); k += 1; }
  return out.slice(0, count);
}

const HOOK_EXAMPLES = [
  "3 exercices pour tenir 2× plus longtemps au lit 🍆",
  "tu finis trop vite ? voilà pourquoi 🍆",
  "comment durer au lit sans galérer 🍆",
  "le muscle que 90% des mecs oublient 🍆",
  "tenir 8 minutes c'est possible (voici comment) 🍆",
];

const buildSystem = (hookExamples) => `Tu es un créateur de contenu santé sexuelle masculine qui fait des CARROUSELS Instagram
qui CARTONNENT, dans le même style viral que nos vidéos (ton cash, direct, masculin).
On te donne UN sujet. Produis le contenu d'un carrousel.

SLIDE 1 = LE HOOK (le plus important) : elle doit POSER UN PROBLÈME ou PROMETTRE UNE SOLUTION,
courte et accrocheuse, dans le style EXACT de nos hooks de vidéos. Exemples de notre ton :
${hookExamples.map((h) => `  - ${h}`).join("\n")}
Le "title" de la slide 1 doit être un hook comme ça (problème/promesse, peut finir par 🍆).

SLIDES SUIVANTES : la solution / les étapes, pédagogiques mais qui gardent le ton. Explications
COURTES (1 phrase, ~12 mots max) — le fond image doit rester visible, on ne le cache pas de texte.

CONTRAINTE ABSOLUE sur "backgroundPrompt" : 100% CLINIQUE/ANATOMIQUE/ÉDUCATIF, NON SEXUEL, NON
SUGGESTIF (le générateur d'image refuse le sexuel). Décris-le en ANGLAIS. Le texte FR des titres
peut être cash, MAIS l'image jamais.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
 "topicLabel": "<titre court du sujet, en français>",
 "slideCount": <entier dans la fourchette donnée>,
 "backgroundPrompt": "<EN: la scène/visuel principal SFW réutilisé sur toutes les slides — ex: anatomical illustration of a male skeleton with visible pelvic floor muscles highlighted, clinical poster; OR a fit clothed man in a bedroom>",
 "slides": [
   {"role":"intro|content",
    "title":"<FR — slide 1 = HOOK problème/promesse ; suivantes = court & accrocheur>",
    "explanation":"<FR, 1 phrase courte (~12 mots max)>"}
 ]
}
N'inclus PAS de slide finale d'appel à l'action (ajoutée automatiquement).`;

// Generate the content for ONE carousel. `topicLabel` is a string (mined label or manual prompt).
// Returns { topicLabel, slideCount, backgroundPrompt, slides:[{role,title,explanation,diagramPrompt}] }
// with SFW_PREFIX already applied to every image prompt. CTA slide is added by the caller.
// Load the curated viral hooks (distilled from the Klimax videos) for slide-1 style.
async function loadHookExamples() {
  try {
    const raw = JSON.parse(await fsp.readFile(path.join(projectRoot, "local-data", "klimax", "hook-bank.json"), "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.hooks || [];
    const live = arr.filter((h) => typeof h === "string" && h.trim()).slice(0, 8);
    return live.length ? live : HOOK_EXAMPLES;
  } catch { return HOOK_EXAMPLES; }
}

export async function generateCarouselContent({ topicLabel, slideCountMin = 2, slideCountMax = 5 }) {
  const hooks = await loadHookExamples();
  const prompt = `Sujet : ${topicLabel}\nFourchette de slides (hors CTA) : ${slideCountMin} à ${slideCountMax}.\nRends le JSON demandé.`;
  let parsed = null;
  try {
    const text = await runClaude(prompt, buildSystem(hooks));
    parsed = extractJsonObject(text);
  } catch { parsed = null; }

  // Fallback content if Claude fails — keeps the pipeline alive (hook + short steps, SFW bg).
  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    parsed = {
      topicLabel: String(topicLabel),
      slideCount: Math.max(slideCountMin, 2),
      backgroundPrompt: "Anatomical illustration of a male skeleton with pelvic floor muscles highlighted, clinical educational poster",
      slides: [
        { role: "intro", title: `${topicLabel} 🍆`, explanation: "Le détail que presque personne ne travaille." },
        { role: "content", title: "Comment faire", explanation: "Contracte 5s, relâche, répète 10 fois." },
      ],
    };
  }

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const want = clamp(Number(parsed.slideCount) || slideCountMin, slideCountMin, slideCountMax);
  const slides = parsed.slides.slice(0, want).map((s, i) => ({
    role: s.role === "intro" || i === 0 ? "intro" : "content",
    title: String(s.title || "").slice(0, 80),
    explanation: String(s.explanation || "").slice(0, 150),
    diagramPrompt: null,
  }));

  return {
    topicLabel: String(parsed.topicLabel || topicLabel).slice(0, 80),
    slideCount: slides.length,
    backgroundPrompt: SFW_PREFIX + String(parsed.backgroundPrompt || "Clean minimal medical studio background").trim(),
    slides,
  };
}
