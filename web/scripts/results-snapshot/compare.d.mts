export type SnapshotLeaf = number | string | boolean | null;
export type SnapshotValues = Record<string, SnapshotLeaf>;
export interface Snapshot {
  case: string;
  covers: string;
  format: number;
  values: SnapshotValues;
}
export interface SnapshotDiff<T = SnapshotLeaf> {
  changed: Array<{ path: string; before: T; after: T }>;
  removed: string[];
  added: string[];
  differs: boolean;
}
export const FORMAT: number;
export const FORMAT_ADDITIONS: { 2: RegExp };
export const RTOL: number;
export const ATOL: number;
export const STORED_DIGITS: number;
export const SIGN_FREE: RegExp;
export const DEFAULT_SKIP: Set<string>;
export const HOW_TO_REGISTER: string;
export function groupOf(path: string): string;
export function storeNumber(value: number): number | 'NaN' | 'Infinity' | '-Infinity';
export function peaks(...maps: SnapshotValues[]): Map<string, number>;
export function sameLeaf(a: SnapshotLeaf, b: SnapshotLeaf, peak?: number, path?: string): boolean;
export function compareValues(reference: SnapshotValues, current: SnapshotValues): SnapshotDiff;
export function mergeValues(reference: SnapshotValues | null | undefined, current: SnapshotValues): SnapshotValues;
export function flatten(value: unknown, prefix: string, out: SnapshotValues, skip?: ReadonlySet<string>): SnapshotValues;
export function formatCaseReport(name: string, diff: SnapshotDiff<unknown>, limit?: number): string;
export function serialiseSnapshot(snapshot: Snapshot): string;
export function parseSnapshot(text: string): Snapshot;
