export interface SentenceSplitResult {
  firstSentence: string;
  body: string;
}

export const removeFirstSentence = (text: string): SentenceSplitResult => {
  const match = text.match(/[.?!]/);

  if (!match || match.index === undefined) {
    return {
      firstSentence: "",
      body: text.trim(),
    };
  }

  const boundary = match.index + 1;
  return {
    firstSentence: text.slice(0, boundary).trim(),
    body: text.slice(boundary).trim(),
  };
};
