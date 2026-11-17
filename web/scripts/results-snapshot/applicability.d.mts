import type { ResultChange } from '../../src/lib/provenance/registry';

export function conditionGroups(w: { any?: string[]; all?: string[]; allOf?: string[][] }): string[][];
export function conditionHolds(w: { any?: string[]; all?: string[]; allOf?: string[][] }, features: ReadonlySet<string>): boolean;
export function conditionAllowsResult(w: { any?: string[]; all?: string[]; allOf?: string[][] }, path: string): boolean;
export function fieldCovered(entry: { when?: object; quantities?: ResultChange['quantities']; area?: string }, path: string, features?: string[]): boolean;
