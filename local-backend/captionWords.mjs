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

const FRENCH_ELISION_BASE_PREFIXES = new Set(
  [...FRENCH_ELISION_PREFIXES].map((prefix) => prefix.replace(/'$/, ""))
);

const normalizeApostrophe = (value) => String(value || "").trim().replace(/[’`´ʼ]/g, "'");

const trimLeadingApostrophes = (value) => normalizeApostrophe(value).replace(/^'+/, "");

const isFrenchElisionPrefix = (word) => FRENCH_ELISION_PREFIXES.has(normalizeApostrophe(word).toLowerCase());

const isFrenchElisionBasePrefix = (word) =>
  FRENCH_ELISION_BASE_PREFIXES.has(normalizeApostrophe(word).toLowerCase());

const isApostropheOnly = (word) => /^'+$/.test(normalizeApostrophe(word));

export const mergeFrenchElisionWords = (words = []) => {
  const merged = [];

  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    const afterNext = words[index + 2];

    if (current && next && isFrenchElisionPrefix(current.word)) {
      merged.push({
        start: current.start,
        end: next.end,
        word: `${normalizeApostrophe(current.word)}${trimLeadingApostrophes(next.word)}`,
      });
      index += 1;
      continue;
    }

    if (current && next && afterNext && isFrenchElisionBasePrefix(current.word) && isApostropheOnly(next.word)) {
      merged.push({
        start: current.start,
        end: afterNext.end,
        word: `${normalizeApostrophe(current.word)}'${trimLeadingApostrophes(afterNext.word)}`,
      });
      index += 2;
      continue;
    }

    if (current && next && isFrenchElisionBasePrefix(current.word)) {
      merged.push({
        start: current.start,
        end: next.end,
        word: `${normalizeApostrophe(current.word)}'${trimLeadingApostrophes(next.word)}`,
      });
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged;
};
