export function conditionGroups(w: { any?: string[]; all?: string[]; allOf?: string[][] }): string[][];
export function conditionHolds(w: { any?: string[]; all?: string[]; allOf?: string[][] }, features: ReadonlySet<string>): boolean;
export function fieldCovered(entry: { when?: object; quantities?: string[]; area?: string }, path: string, features?: string[]): boolean;
export interface Diff { changed: Array<{ path: string; before: unknown; after: unknown }>; removed: string[]; added: string[]; differs: boolean }
export interface Excuse { entries: Array<{ id: string; scope?: string; when?: object; quantities?: string[]; area?: string }>; features: string[] }
export function unexplainedDiff(diff: Diff, excuse?: Excuse): Diff & { explainedBy: string[] };
