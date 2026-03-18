import { PUNCTUATION_TOKENS } from "./constants";
import { normalizeWordToken } from "./normalization";
import type { Token } from "./types";

const TOKEN_REGEX = /[A-Za-z0-9]+(?:[\/'-][A-Za-z0-9]+)*|[.,;:?!]/g;

const mergeNumberEquivalentTokens = (tokens: Token[], text: string): Token[] => {
  const merged: Token[] = [];
  let index = 0;

  while (index < tokens.length) {
    const current = tokens[index];
    const next = tokens[index + 1];

    if (
      current &&
      next &&
      current.kind === "word" &&
      next.kind === "word" &&
      current.normalized === "one" &&
      next.normalized === "third"
    ) {
      merged.push({
        kind: "word",
        raw: text.slice(current.start, next.end),
        normalized: "num:one-third",
        start: current.start,
        end: next.end,
      });
      index += 2;
      continue;
    }

    merged.push(current);
    index += 1;
  }

  return merged;
};

export const tokenizeText = (text: string): Token[] => {
  const matches = Array.from(text.matchAll(TOKEN_REGEX));
  const tokens: Token[] = matches
    .map((match) => {
      const raw = match[0];
      const start = match.index ?? 0;
      const end = start + raw.length;
      const isPunctuation = PUNCTUATION_TOKENS.has(raw);

      return {
        kind: isPunctuation ? "punct" : "word",
        raw,
        normalized: isPunctuation ? raw : normalizeWordToken(raw),
        start,
        end,
      } satisfies Token;
    })
    .filter((token) => token.raw.length > 0);

  return mergeNumberEquivalentTokens(tokens, text);
};
