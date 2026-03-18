import type {
  GradingRecord,
  GradingRecordRepository,
  NewGradingRecordInput,
} from "./types";

const STORAGE_KEY = "tem4.grading.records.v1";

const sortByUpdatedTimeDesc = (records: GradingRecord[]): GradingRecord[] =>
  [...records].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

const normalizeRecord = (entry: unknown): GradingRecord | null => {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Partial<GradingRecord>;
  if (
    typeof record.id !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    typeof record.title !== "string" ||
    typeof record.summary !== "string" ||
    typeof record.referenceText !== "string" ||
    typeof record.studentText !== "string" ||
    typeof record.totalScore !== "number" ||
    typeof record.gradingResult !== "object" ||
    record.gradingResult === null
  ) {
    return null;
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.title,
    summary: record.summary,
    referenceText: record.referenceText,
    studentText: record.studentText,
    referenceImageDataUrl:
      typeof record.referenceImageDataUrl === "string" ? record.referenceImageDataUrl : null,
    studentImageDataUrl:
      typeof record.studentImageDataUrl === "string" ? record.studentImageDataUrl : null,
    totalScore: record.totalScore,
    gradingResult: record.gradingResult,
  };
};

const safeParseRecords = (raw: string | null): GradingRecord[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeRecord(entry))
      .filter((entry): entry is GradingRecord => entry !== null);
  } catch {
    return [];
  }
};

const readRecords = (): GradingRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return sortByUpdatedTimeDesc(safeParseRecords(raw));
};

const writeRecords = (records: GradingRecord[]): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortByUpdatedTimeDesc(records)));
};

const createId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export class LocalStorageGradingRecordRepository
  implements GradingRecordRepository
{
  async listRecords(): Promise<GradingRecord[]> {
    return readRecords();
  }

  async getRecord(id: string): Promise<GradingRecord | null> {
    const records = readRecords();
    return records.find((record) => record.id === id) ?? null;
  }

  async createRecord(input: NewGradingRecordInput): Promise<GradingRecord> {
    const now = new Date().toISOString();
    const record: GradingRecord = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    const records = readRecords();
    records.push(record);
    writeRecords(records);
    return record;
  }

  async updateRecord(record: GradingRecord): Promise<GradingRecord> {
    const records = readRecords();
    const next = records.map((current) =>
      current.id === record.id
        ? { ...record, updatedAt: new Date().toISOString() }
        : current,
    );
    writeRecords(next);
    return next.find((current) => current.id === record.id) ?? record;
  }

  async deleteRecord(id: string): Promise<void> {
    const records = readRecords();
    writeRecords(records.filter((record) => record.id !== id));
  }
}
