const CHAR_NORMALIZATION_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u3001": ",",
  "\uFF0C": ",",
  "\uFF1B": ";",
  "\uFF1A": ":",
  "\uFF01": "!",
  "\uFF1F": "?",
  "\u3002": ".",
};

const normalizeCharacters = (input: string): string =>
  Array.from(input)
    .map((char) => CHAR_NORMALIZATION_MAP[char] ?? char)
    .join("");

export const normalizeRawText = (text: string): string => {
  const normalizedChars = normalizeCharacters(text ?? "");
  return normalizedChars
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const normalizeWordToken = (rawWord: string): string => {
  const lower = rawWord.toLowerCase();

  if (lower === "1/3" || lower === "one-third") {
    return "num:one-third";
  }

  return lower;
};

export const compactWord = (word: string): string =>
  word.toLowerCase().replace(/[^a-z0-9]/g, "");

export const isSameWordIgnoringCase = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase();

export const startsWithUppercase = (word: string): boolean =>
  /^[A-Z]/.test(word);
