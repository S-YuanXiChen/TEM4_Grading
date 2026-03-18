"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { GradingResultView } from "@/components/GradingResultView";
import { TextOcrPanel } from "@/components/TextOcrPanel";
import { gradeTem4Dictation, type GradingResult } from "@/lib/grading";
import { createGradingRecordRepository } from "@/lib/history";
import {
  analyzeSuspiciousOcrIssues,
  recognizeImageText,
  type OcrSuggestion,
  type OcrTarget,
  type OcrWordConfidence,
} from "@/lib/ocr";

const buildPanelStatus = (params: {
  readOnly: boolean;
  statusLabel: string;
  file: File | null;
  text: string;
  suggestions: OcrSuggestion[];
}): string => {
  if (params.readOnly) {
    return "历史记录快照，只读查看";
  }
  if (params.statusLabel) {
    return params.statusLabel;
  }
  if (params.text.trim()) {
    return params.suggestions.length > 0
      ? `已生成文本，并发现 ${params.suggestions.length} 处疑似识别问题`
      : "已生成或录入文本，可直接人工核对";
  }
  if (params.file) {
    return `已选择图片：${params.file.name}`;
  }
  return "尚未上传图片或输入文本";
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片读取失败"));
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });

const buildRecordTitle = (studentText: string, score: number): string => {
  const short = studentText.replace(/\s+/g, " ").trim().slice(0, 36);
  return `${short || "未命名批改"}（${score.toFixed(1)}）`;
};

const buildRecordSummary = (result: GradingResult): string =>
  `得分 ${result.finalScore.toFixed(1)} / 10，扣分 ${result.totalDeduction.toFixed(1)}`;

const replaceSuggestionText = (
  value: string,
  suggestion: OcrSuggestion,
): string | null => {
  if (!suggestion.suggestedText) {
    return null;
  }

  const currentSlice = value.slice(suggestion.start, suggestion.end);
  if (currentSlice !== suggestion.sourceText) {
    return null;
  }

  return `${value.slice(0, suggestion.start)}${suggestion.suggestedText}${value.slice(
    suggestion.end,
  )}`;
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repository = useMemo(() => createGradingRecordRepository(), []);

  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState<string | null>(null);
  const [studentImageDataUrl, setStudentImageDataUrl] = useState<string | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [studentText, setStudentText] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [studentNote, setStudentNote] = useState("");
  const [referenceSuggestions, setReferenceSuggestions] = useState<OcrSuggestion[]>([]);
  const [studentSuggestions, setStudentSuggestions] = useState<OcrSuggestion[]>([]);
  const [referenceStatusLabel, setReferenceStatusLabel] = useState("");
  const [studentStatusLabel, setStudentStatusLabel] = useState("");
  const [studentOcrWordConfidences, setStudentOcrWordConfidences] = useState<
    OcrWordConfidence[]
  >([]);
  const [studentAssistanceActive, setStudentAssistanceActive] = useState(false);
  const [ocrLoadingTarget, setOcrLoadingTarget] = useState<OcrTarget | null>(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<GradingResult | null>(null);

  const recordId = searchParams.get("recordId");
  const openMode = searchParams.get("mode");
  const isHistoryReadOnly = openMode === "history" && Boolean(recordId);

  useEffect(() => {
    let cancelled = false;

    const loadRecord = async () => {
      if (!recordId) {
        return;
      }

      const record = await repository.getRecord(recordId);
      if (cancelled) {
        return;
      }

      if (!record) {
        setErrorMessage("未找到该历史记录，可能已被删除。");
        return;
      }

      setReferenceText(record.referenceText);
      setStudentText(record.studentText);
      setResult(record.gradingResult);
      setReferenceFile(null);
      setStudentFile(null);
      setReferenceImageDataUrl(record.referenceImageDataUrl ?? null);
      setStudentImageDataUrl(record.studentImageDataUrl ?? null);
      setReferenceNote("");
      setStudentNote("");
      setReferenceSuggestions([]);
      setStudentSuggestions([]);
      setReferenceStatusLabel("");
      setStudentStatusLabel("");
      setStudentOcrWordConfidences([]);
      setStudentAssistanceActive(false);
      setErrorMessage("");
    };

    void loadRecord();

    return () => {
      cancelled = true;
    };
  }, [recordId, repository]);

  const handleNewGrading = () => {
    setReferenceFile(null);
    setStudentFile(null);
    setReferenceImageDataUrl(null);
    setStudentImageDataUrl(null);
    setReferenceText("");
    setStudentText("");
    setReferenceNote("");
    setStudentNote("");
    setReferenceSuggestions([]);
    setStudentSuggestions([]);
    setReferenceStatusLabel("");
    setStudentStatusLabel("");
    setStudentOcrWordConfidences([]);
    setStudentAssistanceActive(false);
    setResult(null);
    setErrorMessage("");
    router.push("/");
  };

  const runOcr = async (target: OcrTarget) => {
    if (isHistoryReadOnly) {
      return;
    }

    const file = target === "reference" ? referenceFile : studentFile;
    if (!file) {
      setErrorMessage("请先上传图片，再进行图片转文字。");
      return;
    }

    setErrorMessage("");
    setOcrLoadingTarget(target);
    setReferenceStatusLabel((current) =>
      target === "reference" ? "正在进行本地识别" : current,
    );
    setStudentStatusLabel((current) =>
      target === "student" ? "正在判断文本类型" : current,
    );

    try {
      const response = await recognizeImageText(file, target);
      const noteWithCleanup =
        response.cleanupSummary && response.cleanupSummary.length > 0
          ? `${response.note ?? "图片转文字已完成。"} ${response.cleanupSummary.join("；")}。`
          : response.note ?? "";

      if (target === "reference") {
        setReferenceText(response.text);
        setReferenceNote(noteWithCleanup);
        setReferenceStatusLabel(response.statusLabel || "本地识别已完成");
        setReferenceSuggestions(
          analyzeSuspiciousOcrIssues({
            text: response.text,
            wordConfidences: response.wordConfidences,
          }),
        );
      } else {
        setStudentText(response.text);
        setStudentNote(noteWithCleanup);
        setStudentStatusLabel(response.statusLabel || "高精度识别已完成");
        setStudentOcrWordConfidences(response.wordConfidences ?? []);
        setStudentAssistanceActive(true);
        setStudentSuggestions(
          analyzeSuspiciousOcrIssues({
            text: response.text,
            referenceText,
            wordConfidences: response.wordConfidences,
          }),
        );
      }
    } catch (error) {
      const fallbackMessage =
        target === "student" ? "学生作答识别失败" : "参考答案本地 OCR 失败";
      const message = error instanceof Error ? error.message : fallbackMessage;
      if (target === "reference") {
        setReferenceStatusLabel("识别失败");
      } else {
        setStudentStatusLabel("识别失败");
      }
      setErrorMessage(message.startsWith(fallbackMessage) ? message : `${fallbackMessage}：${message}`);
    } finally {
      setOcrLoadingTarget(null);
    }
  };

  useEffect(() => {
    if (
      isHistoryReadOnly ||
      !studentAssistanceActive ||
      studentOcrWordConfidences.length === 0 ||
      !studentText.trim()
    ) {
      return;
    }

    setStudentSuggestions(
      analyzeSuspiciousOcrIssues({
        text: studentText,
        referenceText,
        wordConfidences: studentOcrWordConfidences,
      }),
    );
  }, [
    referenceText,
    isHistoryReadOnly,
    studentAssistanceActive,
    studentOcrWordConfidences,
    studentText,
  ]);

  const handleApplySuggestion = (target: OcrTarget, suggestion: OcrSuggestion) => {
    if (isHistoryReadOnly) {
      return;
    }

    if (target === "reference") {
      const nextText = replaceSuggestionText(referenceText, suggestion);
      if (!nextText) {
        setErrorMessage("参考答案文本已发生变化，请重新核对疑似识别问题。");
        return;
      }
      setReferenceText(nextText);
      setReferenceSuggestions([]);
      setReferenceNote("已应用一条 OCR 建议，请继续人工核对其余内容。");
      setReferenceStatusLabel("本地识别结果已手动调整");
      return;
    }

    const nextText = replaceSuggestionText(studentText, suggestion);
    if (!nextText) {
      setErrorMessage("学生作答文本已发生变化，请重新核对疑似识别问题。");
      return;
    }

    setStudentText(nextText);
    setStudentSuggestions(
      analyzeSuspiciousOcrIssues({
        text: nextText,
        referenceText,
        wordConfidences: studentOcrWordConfidences,
      }),
    );
    setStudentAssistanceActive(true);
    setStudentNote("已应用一条 OCR 建议，请继续人工核对文本后再批改。");
    setStudentStatusLabel("学生识别结果已手动调整");
  };

  const handleGrade = async () => {
    if (isHistoryReadOnly) {
      return;
    }

    setErrorMessage("");

    if (!referenceText.trim()) {
      setErrorMessage("请先提供参考答案英语文本（可手动输入或由图片转文字得到）。");
      return;
    }
    if (!studentText.trim()) {
      setErrorMessage("请先提供学生作答英语文本（可手动输入或由图片转文字得到）。");
      return;
    }

    setGradingLoading(true);

    try {
      const graded = gradeTem4Dictation(referenceText, studentText);
      setResult(graded);

      const saved = await repository.createRecord({
        title: buildRecordTitle(studentText, graded.finalScore),
        summary: buildRecordSummary(graded),
        referenceText,
        studentText,
        referenceImageDataUrl,
        studentImageDataUrl,
        totalScore: graded.finalScore,
        gradingResult: graded,
      });
      router.replace(`/?recordId=${saved.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "批改失败";
      setResult(null);
      setErrorMessage(message);
    } finally {
      setGradingLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          TEM-4 听写批改助手
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          依据新规执行批改，将文本分为5个意群，每个意群2分，总分为10分。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNewGrading}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground"
          >
            新建批改
          </button>
          <Link
            href="/history"
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground"
          >
            批改历史
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <TextOcrPanel
          title="参考答案"
          subtitle="上传参考答案图片，默认使用本地 OCR，转换后可手动修改文本。"
          helperText="如无需使用图片，可直接于文本框输入"
          file={referenceFile}
          imageDataUrl={referenceImageDataUrl}
          text={referenceText}
          placeholder="图片转文字结果会显示在这里，您可继续修改。"
          loading={ocrLoadingTarget === "reference"}
          readOnly={isHistoryReadOnly}
          note={referenceNote}
          statusText={buildPanelStatus({
            readOnly: isHistoryReadOnly,
            statusLabel: referenceStatusLabel,
            file: referenceFile,
            text: referenceText,
            suggestions: referenceSuggestions,
          })}
          suggestions={referenceSuggestions}
          onFileChange={(file) => {
            setReferenceFile(file);
            setReferenceNote("");
            setReferenceSuggestions([]);
            setReferenceStatusLabel("");
            if (!file) {
              setReferenceImageDataUrl(null);
              return;
            }
            void fileToDataUrl(file)
              .then((dataUrl) => {
                setReferenceImageDataUrl(dataUrl);
              })
              .catch(() => {
                setReferenceImageDataUrl(null);
                setErrorMessage("读取参考答案图片失败，请重试。");
              });
          }}
          onTextChange={(value) => {
            setReferenceText(value);
            setReferenceSuggestions([]);
            setReferenceStatusLabel(value.trim() ? "文本已手动录入/修改" : "");
          }}
          onRunOcr={() => runOcr("reference")}
          onApplySuggestion={(suggestion) => handleApplySuggestion("reference", suggestion)}
        />

        <TextOcrPanel
          title="学生作答"
          subtitle="上传学生作答图片，系统会先判断是否为印刷体，再决定使用本地或高精度 OCR。"
          helperText="请确保学生作答的首句不包含无需批改的前置句"
          file={studentFile}
          imageDataUrl={studentImageDataUrl}
          text={studentText}
          placeholder="图片转文字结果会显示在这里，您可继续修改。"
          loading={ocrLoadingTarget === "student"}
          readOnly={isHistoryReadOnly}
          note={studentNote}
          statusText={buildPanelStatus({
            readOnly: isHistoryReadOnly,
            statusLabel: studentStatusLabel,
            file: studentFile,
            text: studentText,
            suggestions: studentSuggestions,
          })}
          suggestions={studentSuggestions}
          onFileChange={(file) => {
            setStudentFile(file);
            setStudentNote("");
            setStudentSuggestions([]);
            setStudentStatusLabel("");
            setStudentOcrWordConfidences([]);
            setStudentAssistanceActive(false);
            if (!file) {
              setStudentImageDataUrl(null);
              return;
            }
            void fileToDataUrl(file)
              .then((dataUrl) => {
                setStudentImageDataUrl(dataUrl);
              })
              .catch(() => {
                setStudentImageDataUrl(null);
                setErrorMessage("读取学生作答图片失败，请重试。");
              });
          }}
          onTextChange={(value) => {
            setStudentText(value);
            setStudentSuggestions([]);
            setStudentStatusLabel(value.trim() ? "文本已手动录入/修改" : "");
            setStudentAssistanceActive(false);
          }}
          onRunOcr={() => runOcr("student")}
          onApplySuggestion={(suggestion) => handleApplySuggestion("student", suggestion)}
        />
      </section>

      {!isHistoryReadOnly ? (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted">
              请确保学生作答的首句不包含无需批改的前置句。最终批改仅使用当前文本框中的内容，不会自动采用 OCR 建议。
            </p>
            <button
              type="button"
              onClick={() => {
                void handleGrade();
              }}
              disabled={gradingLoading}
              className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gradingLoading ? "批改中..." : "开始批改"}
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted shadow-sm">
          当前为历史记录快照，已禁用上传图片、图片转文字与开始批改。请点击“新建批改”进入可编辑页面。
          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </section>
      )}

      <section className="mt-6">
        {result ? (
          <GradingResultView result={result} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted">
            结果区为空。请先准备两段英语文本，再点击“开始批改”。
          </div>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={<main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8" />}
    >
      <HomeContent />
    </Suspense>
  );
}
