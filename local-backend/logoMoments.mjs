const stripCaptionPunctuation = (text) =>
  String(text || "")
    .replace(/[.,!?;:]/g, "")
    .replace(/[()[\]{}"]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeKeyword = (text) =>
  stripCaptionPunctuation(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const logoTriggers = (triggerWord) => {
  const target = normalizeKeyword(triggerWord || "klimax");
  if (!target) return [];
  const triggers = new Set([target]);
  if (target === "klimax") {
    triggers.add("climax");
    triggers.add("klimaks");
    triggers.add("climaks");
  }
  return [...triggers];
};

const containsTrigger = (text, triggers) => {
  const normalized = normalizeKeyword(text);
  return triggers.some((trigger) => normalized.includes(trigger));
};

const dedupeMoments = (moments) => {
  const sorted = [...moments].sort((a, b) => safeNumber(a.start, 0) - safeNumber(b.start, 0));
  const deduped = [];

  for (const moment of sorted) {
    const duplicate = deduped.some(
      (item) => Math.abs(safeNumber(item.start, 0) - safeNumber(moment.start, 0)) < 0.25
    );
    if (!duplicate) deduped.push(moment);
  }

  return deduped;
};

export const buildLogoMoments = (words = [], triggerWord = "klimax", duration = 0, textSpans = []) => {
  const triggers = logoTriggers(triggerWord);
  if (!triggers.length) return [];

  const wordMoments = words
    .filter((word) => containsTrigger(word.word, triggers))
    .map((word) => ({
      term: word.word,
      start: Math.max(0, safeNumber(word.start, 0)),
      end: Math.min(duration || safeNumber(word.end, 0) + 4.8, safeNumber(word.start, 0) + 4.8),
      source: "word",
    }));

  const spanMoments = textSpans
    .filter((span) => containsTrigger(span.text, triggers))
    .map((span) => {
      const start = Math.max(0, safeNumber(span.start, 0));
      return {
        term: triggerWord || "klimax",
        start,
        end: Math.min(duration || safeNumber(span.end, start + 4.8) + 4.8, start + 4.8),
        source: "text",
      };
    });

  return dedupeMoments([...wordMoments, ...spanMoments]);
};
