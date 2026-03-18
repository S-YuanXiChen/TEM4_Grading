import type { AlignmentOperation, Token } from "./types";

const insertionCost = 1;
const deletionCost = 1;

const substitutionCost = (reference: Token, student: Token): number => {
  if (reference.kind === student.kind) {
    return reference.normalized === student.normalized ? 0 : 1;
  }

  return 2;
};

export const alignTokens = (
  referenceTokens: Token[],
  studentTokens: Token[],
): AlignmentOperation[] => {
  const rows = referenceTokens.length + 1;
  const cols = studentTokens.length + 1;

  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Number.POSITIVE_INFINITY),
  );

  dp[0][0] = 0;

  for (let row = 1; row < rows; row += 1) {
    dp[row][0] = row * deletionCost;
  }
  for (let col = 1; col < cols; col += 1) {
    dp[0][col] = col * insertionCost;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const reference = referenceTokens[row - 1];
      const student = studentTokens[col - 1];

      const sub = dp[row - 1][col - 1] + substitutionCost(reference, student);
      const del = dp[row - 1][col] + deletionCost;
      const ins = dp[row][col - 1] + insertionCost;

      dp[row][col] = Math.min(sub, del, ins);
    }
  }

  const operations: AlignmentOperation[] = [];
  let row = referenceTokens.length;
  let col = studentTokens.length;

  while (row > 0 || col > 0) {
    if (row > 0 && col > 0) {
      const reference = referenceTokens[row - 1];
      const student = studentTokens[col - 1];
      const subCost = substitutionCost(reference, student);
      const scoreFromSub = dp[row - 1][col - 1] + subCost;

      if (dp[row][col] === scoreFromSub) {
        operations.push({
          type: subCost === 0 ? "match" : "substitution",
          refIndex: row - 1,
          studentIndex: col - 1,
        });
        row -= 1;
        col -= 1;
        continue;
      }
    }

    if (row > 0 && dp[row][col] === dp[row - 1][col] + deletionCost) {
      operations.push({
        type: "deletion",
        refIndex: row - 1,
      });
      row -= 1;
      continue;
    }

    operations.push({
      type: "insertion",
      studentIndex: col - 1,
    });
    col -= 1;
  }

  return operations.reverse();
};
