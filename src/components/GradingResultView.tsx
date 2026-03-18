import type { GradingResult } from "@/lib/grading";
import type { ContextToken } from "@/lib/grading/types";

interface GradingResultViewProps {
  result: GradingResult;
}

const formatDeduction = (value: number): string => `${value.toFixed(1)} 分`;
const truncateText = (value: string, length = 120): string =>
  value.length <= length ? value : `${value.slice(0, length)}...`;
const formatTableDeduction = (value: number): string =>
  Number(value.toFixed(2)).toString();

const renderContextTokens = (tokens: ContextToken[]) => {
  if (!tokens || tokens.length === 0) {
    return "（无）";
  }

  return tokens.map((token, index) => {
    const withSpace = index > 0 && token.kind !== "punct";
    const content = token.highlight ? (
      <span className="font-bold underline decoration-2 underline-offset-2">
        {token.raw}
      </span>
    ) : (
      token.raw
    );

    return (
      <span key={`${token.raw}-${index}`}>
        {withSpace ? " " : ""}
        {content}
      </span>
    );
  });
};

export function GradingResultView({ result }: GradingResultViewProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">
          自动划分的5个意群
        </h3>
        <p className="mt-2 text-xs text-muted">
          实际评分起点：参考文本 token #
          {result.effectiveReferenceStartTokenIndex}，匹配分数{" "}
          {result.anchorMatchScore.toFixed(3)}。
        </p>
        <p className="mt-1 text-xs text-muted">
          学生开头片段：{truncateText(result.studentOpeningAnchorText, 90)}
        </p>
        <p className="mt-1 text-xs text-muted">
          参考起点评分文本：{truncateText(result.effectiveReferenceStartText, 110)}
        </p>
        <p className="mt-1 text-xs text-muted">
          切分说明：{result.segmentationNote}
          {result.segmentationUsedFallback ? "（已启用回退）" : "（严格标点切分）"}
        </p>
        <ul className="mt-4 space-y-3 text-sm text-foreground">
          {result.meaningGroups.map((group) => (
            <li
              key={group.id}
              className="rounded-xl border border-border bg-accent-soft/20 p-3"
            >
              <p className="mb-1 font-medium">意群{group.id}</p>
              <p className="leading-6">{group.text || "（空）"}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                <span>词数：{group.wordCount}</span>
                <span>
                  切分模式：
                  {group.boundaryMode === "strict_punctuation"
                    ? "严格标点"
                    : "软回退"}
                </span>
                <span>回退：{group.fallbackUsed ? "是" : "否"}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">总分</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-accent-soft/30 p-4">
            <p className="text-sm text-muted">总扣分</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {formatDeduction(result.totalDeduction)}
            </p>
          </div>
          <div className="rounded-xl bg-accent-soft/30 p-4">
            <p className="text-sm text-muted">最终得分（满分10分）</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {result.finalScore.toFixed(1)} 分
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {result.groupScores.map((group) => (
            <span
              key={group.groupId}
              className="rounded-lg border border-border bg-white px-3 py-1"
            >
              意群{group.groupId}：扣{group.deduction.toFixed(1)} / 得
              {group.score.toFixed(1)}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">详细批改表</h3>
        {result.errors.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-accent-soft/30 p-4 text-sm text-foreground">
            未检测到扣分项。
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-accent-soft/30">
                  <th className="px-3 py-2 font-medium">所属意群</th>
                  <th className="px-3 py-2 font-medium">原文对应</th>
                  <th className="px-3 py-2 font-medium">您的作答</th>
                  <th className="px-3 py-2 font-medium">错法</th>
                  <th className="px-3 py-2 font-medium">扣分</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((error) => (
                  <tr key={error.id} className="border-b border-border align-top">
                    <td className="px-3 py-2">意群{error.groupId}</td>
                    <td className="px-3 py-2 leading-6">
                      {renderContextTokens(error.referenceContextTokens)}
                    </td>
                    <td className="px-3 py-2 leading-6">
                      {renderContextTokens(error.studentContextTokens)}
                    </td>
                    <td className="px-3 py-2">{error.mistakeDescription}</td>
                    <td className="px-3 py-2">
                      {formatTableDeduction(error.deductionApplied)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
