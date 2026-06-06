const FRENCH_ELISION_PREFIXES = new Set([
  "c'",
  "d'",
  "j'",
  "l'",
  "m'",
  "n'",
  "qu'",
  "s'",
  "t'",
  "jusqu'",
  "lorsqu'",
  "aujourd'",
  "presqu'",
  "puisqu'",
  "quelqu'",
  "quoiqu'",
]);

const normalizeApostrophe = (value) => String(value || "").replace(/[’`´]/g, "'");

const isFrenchElisionPrefix = (word) => FRENCH_ELISION_PREFIXES.has(normalizeApostrophe(word).toLowerCase());

export const mergeFrenchElisionWords = (words = []) => {
  const merged = [];

  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];

    if (current && next && isFrenchElisionPrefix(current.word)) {
      merged.push({
        start: current.start,
        end: next.end,
        word: `${normalizeApostrophe(current.word)}${String(next.word || "").trim()}`,
      });
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged;
};
