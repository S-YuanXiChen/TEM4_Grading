import type { GradingResult } from "@/lib/grading";

export interface GradingRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  summary: string;
  referenceText: string;
  studentText: string;
  referenceImageDataUrl: string | null;
  studentImageDataUrl: string | null;
  totalScore: number;
  gradingResult: GradingResult;
}

export type NewGradingRecordInput = Omit<
  GradingRecord,
  "id" | "createdAt" | "updatedAt"
>;

export interface GradingRecordRepository {
  listRecords(): Promise<GradingRecord[]>;
  getRecord(id: string): Promise<GradingRecord | null>;
  createRecord(input: NewGradingRecordInput): Promise<GradingRecord>;
  updateRecord(record: GradingRecord): Promise<GradingRecord>;
  deleteRecord(id: string): Promise<void>;
}
