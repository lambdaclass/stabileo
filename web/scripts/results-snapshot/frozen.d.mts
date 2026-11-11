export const FROZEN_DIR: string;
export type FrozenLeaf = number | string | boolean | null;
export type FrozenValues = Record<string, FrozenLeaf>;
export interface FrozenDiff {
  changed: Array<{ path: string; before: FrozenLeaf; after: FrozenLeaf }>;
  removed: string[];
  added: string[];
  differs: boolean;
}
export function freezeValues(value: unknown, prefix?: string, out?: FrozenValues): FrozenValues;
export function compareFrozen(base: FrozenValues, head: FrozenValues): FrozenDiff;
