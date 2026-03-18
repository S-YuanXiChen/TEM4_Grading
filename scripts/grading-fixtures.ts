import { gradeTem4Dictation } from "../src/lib/grading/engine";
import { buildMeaningGroups } from "../src/lib/grading/grouping";

type Check = {
  name: string;
  run: () => void;
};

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const personalLoanReference =
  "A personal loan involves borrowing a lump sum from a lender which you agree to pay back, with interest, over a fixed period. " +
  "There are two main types of personal loans: secured and unsecured. " +
  "Unsecured loans are not tied to any of your assets. " +
  "But secured loans are usually tied to your property. " +
  "If you default on a secured loan, your lender can force you to sell the asset to pay off your debt. " +
  "Interest rates on loans can be fixed or variable. " +
  "A fixed rate will remain the same for the term of the loan, while a variable rate will be subject to change.";

const personalLoanStudent =
  "which you agree to pay back with interest over a fixed period. " +
  "There are two main types of personal loans: secured and unsecured. " +
  "Unsecured loans are not tied to any of your assets. " +
  "But secured loans are usually tied to your property. " +
  "If you default on your secured loan, your lender can force you to sell the assets to pay off your debt. " +
  "Interests rate on loans can be fixed or variable. " +
  "A fixed rate will remain the same for the term of the loan while a variable rate will be subjected to change.";

const checks: Check[] = [
  {
    name: "Anchor-based start: student opening is not discarded",
    run: () => {
      const reference =
        "Lead-in words before anchor. The scored fragment starts here, with details.";
      const student = "fragment starts here with details.";
      const result = gradeTem4Dictation(reference, student);

      assert(
        result.effectiveReferenceStartTokenIndex > 0,
        "Anchor should move the reference start beyond token 0.",
      );
      assert(
        result.effectiveReferenceStartText.toLowerCase().startsWith("fragment starts here"),
        "Reference start should anchor to the student opening fragment.",
      );
      assert(
        result.studentOpeningAnchorText.toLowerCase().startsWith("fragment starts here"),
        "Student opening anchor text should be captured in result.",
      );
      assert(
        result.anchorMatchScore > 0.4,
        "Anchor match score should indicate meaningful overlap.",
      );
    },
  },
  {
    name: "Grouping remains 5 groups from punctuation candidates",
    run: () => {
      const body = "alpha, beta, gamma; delta: epsilon, zeta, eta, theta.";
      const grouping = buildMeaningGroups(body);
      assert(grouping.groups.length === 5, "Grouping should always produce 5 groups.");
      assert(!grouping.usedFallback, "Strict punctuation splitting should succeed.");
    },
  },
  {
    name: "Fallback still avoids hard failure",
    run: () => {
      const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
      const grouping = buildMeaningGroups(body);
      assert(grouping.groups.length === 5, "Fallback must still return 5 groups.");
      assert(grouping.usedFallback, "Fallback flag should be true when punctuation is insufficient.");
    },
  },
  {
    name: "Personal Loans anchor fixture",
    run: () => {
      const result = gradeTem4Dictation(personalLoanReference, personalLoanStudent);
      assert(
        result.effectiveReferenceStartText
          .toLowerCase()
          .startsWith("which you agree to pay back"),
        "Expected anchor to land at tail of the first reference sentence.",
      );
      assert(
        result.effectiveReferenceStartTokenIndex > 5,
        "Anchor token index should be inside the first sentence, not fixed sentence boundary.",
      );
      assert(result.meaningGroups.length === 5, "Anchored reference should still split into 5 groups.");
      assert(result.anchorMatchScore > 0.5, "Personal Loans fixture should have a strong anchor score.");
    },
  },
  {
    name: "Fix 1A: internal punctuation + uppercase counts as one error",
    run: () => {
      const reference =
        "Alpha, beta gamma delta epsilon zeta. Eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six.";
      const student =
        "Alpha. Beta gamma delta epsilon zeta. Eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six.";
      const result = gradeTem4Dictation(reference, student);

      assert(result.errors.length === 1, "Internal punctuation + capitalization should count as one error total.");
      assert(result.totalDeduction === 0.5, "Internal punctuation + capitalization should deduct only 0.5.");
      assert(
        result.errors[0]?.errorType === "punctuation",
        "The single error should be classified as punctuation.",
      );
    },
  },
  {
    name: "Fix 1B: sentence-boundary punctuation + lowercase counts as two errors",
    run: () => {
      const reference =
        "Alpha beta gamma delta epsilon zeta. Eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six. Seven eight nine ten eleven twelve.";
      const student =
        "Alpha beta gamma delta epsilon zeta, eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six. Seven eight nine ten eleven twelve.";
      const result = gradeTem4Dictation(reference, student);

      assert(result.errors.length === 2, "Sentence-boundary punctuation + lowercase should count as two errors.");
      assert(result.totalDeduction === 1, "Sentence-boundary punctuation + lowercase should deduct 1.0.");
    },
  },
  {
    name: "Fix 1C: global no-punctuation problem adds exactly one extra error",
    run: () => {
      const reference =
        "Alpha, beta gamma delta epsilon zeta. Eta theta iota, kappa lambda mu. Nu xi omicron pi, rho sigma. Tau upsilon phi chi, psi omega. One two three four, five six.";
      const student =
        "Alpha / beta gamma delta epsilon zeta / Eta theta iota / kappa lambda mu / Nu xi omicron pi / rho sigma / Tau upsilon phi chi / psi omega / One two three four / five six";
      const result = gradeTem4Dictation(reference, student);
      const globalErrors = result.errors.filter((error) =>
        error.mistakeDescription.includes("全文未使用真实标点"),
      );

      assert(globalErrors.length === 1, "Global no-punctuation/slash substitution should add exactly one extra error.");
      assert(globalErrors[0]?.deductionApplied === 0.5, "The extra global punctuation error should deduct 0.5 exactly once.");
    },
  },
  {
    name: "Fix 2: merged correct words count as one missing-space error",
    run: () => {
      const reference =
        "Alpha beta gamma delta may be epsilon zeta. Eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six. Seven eight nine ten eleven twelve.";
      const student =
        "Alpha beta gamma delta maybe epsilon zeta. Eta theta iota kappa lambda mu. Nu xi omicron pi rho sigma. Tau upsilon phi chi psi omega. One two three four five six. Seven eight nine ten eleven twelve.";
      const result = gradeTem4Dictation(reference, student);

      assert(result.errors.length === 1, "Merged correct words should produce only one error.");
      assert(result.errors[0]?.errorType === "missing_space", "Merged correct words should be classified as missing-space.");
      assert(result.totalDeduction === 0.5, "Merged correct words should deduct only 0.5.");
    },
  },
];

const run = () => {
  checks.forEach((check) => {
    check.run();
    console.log(`PASS: ${check.name}`);
  });
  console.log(`All grading checks passed (${checks.length}).`);
};

run();
