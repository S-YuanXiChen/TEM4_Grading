"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createGradingRecordRepository, type GradingRecord } from "@/lib/history";

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("zh-CN", { hour12: false });

export default function HistoryPage() {
  const repository = useMemo(() => createGradingRecordRepository(), []);
  const [records, setRecords] = useState<GradingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const list = await repository.listRecords();
      if (!cancelled) {
        setRecords(list);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          批改历史
        </h1>
        <p className="mt-3 text-sm text-muted">
          点击任意记录可重新打开对应的批改内容和结果。
        </p>
        <div className="mt-4">
          <Link
            href="/"
            className="inline-flex rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground"
          >
            新建批改
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-muted">加载中...</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted">暂无历史记录。</p>
        ) : (
          <ul className="space-y-3">
            {records.map((record) => (
              <li
                key={record.id}
                className="rounded-xl border border-border bg-white p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{record.title}</p>
                    <p className="mt-1 text-xs text-muted">{record.summary}</p>
                    <p className="mt-1 text-xs text-muted">
                      创建：{formatDateTime(record.createdAt)} | 更新：
                      {formatDateTime(record.updatedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/?recordId=${record.id}&mode=history`}
                    className="inline-flex rounded-lg border border-border bg-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    打开记录
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
