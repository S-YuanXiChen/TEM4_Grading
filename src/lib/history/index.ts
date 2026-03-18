import { LocalStorageGradingRecordRepository } from "./local-storage-repository";
import type { GradingRecordRepository } from "./types";

export const createGradingRecordRepository = (): GradingRecordRepository =>
  new LocalStorageGradingRecordRepository();

export type { GradingRecord, GradingRecordRepository, NewGradingRecordInput } from "./types";
