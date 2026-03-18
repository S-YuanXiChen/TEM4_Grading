interface LowRiskCleanupResult {
  text: string;
  appliedSteps: string[];
}

export const applyLowRiskOcrCleanup = (text: string): LowRiskCleanupResult => {
  const appliedSteps: string[] = [];
  let output = text ?? "";

  if (/[\\/]/.test(output)) {
    output = output.replace(/[\\/]/g, " ");
    appliedSteps.push("已移除 OCR 插入的斜杠符号");
  }

  if (/[\r\n]/.test(output)) {
    output = output.replace(/[\r\n]+/g, " ");
    appliedSteps.push("已移除换行并合并为单行");
  }

  const compacted = output.replace(/\s+/g, " ").trim();
  if (compacted !== output) {
    appliedSteps.push("已规范化多余空白");
    output = compacted;
  }

  return {
    text: output,
    appliedSteps,
  };
};
