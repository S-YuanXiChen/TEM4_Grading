"use client";

import Image from "next/image";
import { useRef } from "react";

import type { OcrSuggestion } from "@/lib/ocr";

interface TextOcrPanelProps {
  title: string;
  subtitle: string;
  helperText: string;
  file: File | null;
  imageDataUrl?: string | null;
  text: string;
  placeholder: string;
  loading: boolean;
  readOnly?: boolean;
  note?: string;
  statusText?: string;
  suggestions?: OcrSuggestion[];
  onFileChange: (file: File | null) => void;
  onTextChange: (value: string) => void;
  onRunOcr: () => Promise<void>;
  onApplySuggestion?: (suggestion: OcrSuggestion) => void;
}

export function TextOcrPanel({
  title,
  subtitle,
  helperText,
  file,
  imageDataUrl,
  text,
  placeholder,
  loading,
  readOnly = false,
  note,
  statusText,
  suggestions = [],
  onFileChange,
  onTextChange,
  onRunOcr,
  onApplySuggestion,
}: TextOcrPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </header>

      {statusText ? (
        <div className="mb-4 rounded-xl border border-border bg-accent-soft/20 px-3 py-2 text-xs text-muted">
          当前状态：{statusText}
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <div className="mb-4 rounded-xl border border-dashed border-border bg-accent-soft/30 p-4">
            <label className="mb-2 block text-sm font-medium text-foreground">
              上传图片
            </label>
            <input
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:cursor-pointer hover:file:opacity-90"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="mt-3 inline-flex rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground"
            >
              拍照上传
            </button>
            <p className="mt-2 text-xs text-muted">
              {file ? `已选择：${file.name}` : "尚未选择图片文件"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void onRunOcr();
            }}
            disabled={loading || !file}
            className="mb-3 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "转换中..." : "图片转文字"}
          </button>
        </>
      ) : null}

      {imageDataUrl ? (
        <div className="mb-3 rounded-xl border border-border bg-accent-soft/20 p-3">
          <p className="text-xs text-muted">已保存图片</p>
          <a
            href={imageDataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block"
          >
            <Image
              src={imageDataUrl}
              alt={`${title}图片`}
              width={800}
              height={320}
              unoptimized
              className="max-h-48 w-full rounded-lg object-contain"
            />
          </a>
        </div>
      ) : null}

      {note ? <p className="mb-3 text-xs text-muted">{note}</p> : null}

      <label className="mb-1 block text-sm font-medium text-foreground">
        英语文本（可手动修改）
      </label>
      <p className="mb-2 text-xs text-muted">{helperText}</p>
      <textarea
        value={text}
        onChange={(event) => {
          if (!readOnly) {
            onTextChange(event.target.value);
          }
        }}
        readOnly={readOnly}
        className="min-h-40 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        placeholder={placeholder}
      />

      {suggestions.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">疑似识别问题</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            以下仅为 OCR 辅助提示，不会自动改写文本；批改只使用您在文本框中最终确认的内容。
          </p>
          <ul className="mt-3 space-y-3 text-sm text-foreground">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <p>
                  <span className="font-medium">{suggestion.sourceText}</span>
                  {suggestion.suggestedText ? (
                    <span className="text-muted"> 建议核对为 {suggestion.suggestedText}</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">{suggestion.reason}</p>
                {!readOnly && suggestion.suggestedText && onApplySuggestion ? (
                  <button
                    type="button"
                    onClick={() => onApplySuggestion(suggestion)}
                    className="mt-2 inline-flex rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground"
                  >
                    应用此建议
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
