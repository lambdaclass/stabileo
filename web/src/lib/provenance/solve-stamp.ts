/**
 * What a project records about the build that last solved it.
 *
 * Rides on the model snapshot (`ModelSnapshot.solvedWith`) so every way a project is kept carries
 * it: a `.ded`, a session file, the autosave, a tab. It is adopted on open, like the export
 * record (`store/project-provenance.ts`), and never by undo: undoing an edit does not un-solve
 * the model.
 *
 * Absent on every project saved before this existed. That absence means "we do not know which
 * version solved it", and it is read as the oldest version: the conservative answer, because it
 * shows every registered change that concerns the model rather than none.
 */
import { RESULTS_VERSION } from './registry';
import { buildIdentity } from './build-identity';
import type { AnalysisKind } from './model-features';

/** Bumped when the shape of stored results changes (independent of what the numbers are). */
export const RESULTS_SCHEMA_VERSION = 1;

export interface SolveStamp {
  /** Unique per solve: tells two stamps of the same version apart (acknowledgements key on it). */
  id: string;
  /** The registry's results version the numbers were produced under. */
  resultsVersion: number;
  resultsSchemaVersion: number;
  appVersion: string;
  engineVersion: string;
  commit: string;
  wasmHash: string;
  /** ISO time of the solve. */
  solvedAt: string;
  /** The analyses run under this stamp (best effort: the static solve and the advanced panels). */
  analyses: AnalysisKind[];
}

/** A stamp for a project that carries none: the oldest version, nothing else known. */
export function unknownStamp(): SolveStamp {
  return {
    id: `unknown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    resultsVersion: 0,
    resultsSchemaVersion: 0,
    appVersion: 'unknown',
    engineVersion: 'unknown',
    commit: 'unknown',
    wasmHash: 'unknown',
    solvedAt: '',
    analyses: [],
  };
}

/** Whether a stamp says nothing about which version solved the project. */
export function isUnknownStamp(s: SolveStamp | undefined | null): boolean {
  return !s || s.resultsVersion === 0;
}

/**
 * The stamp of a project created in this build and not yet solved. It has no results, so none of
 * them can predate a change: it carries this build's version, and opening it in a later build
 * lists the changes since this one.
 */
export function freshStamp(now = new Date()): SolveStamp {
  return { ...stampSolve('linear', null, now), analyses: [], solvedAt: '' };
}

/**
 * The stamp for a solve that just finished in this build. Analyses accumulate while the results
 * version stays the same: a modal run after the static solve is part of the same results.
 */
export function stampSolve(kind: AnalysisKind, previous: SolveStamp | null | undefined, now = new Date()): SolveStamp {
  const b = buildIdentity();
  const keep = previous && previous.resultsVersion === RESULTS_VERSION && previous.commit === b.commit ? previous.analyses : [];
  const analyses = [...new Set<AnalysisKind>([...keep, kind])].sort();
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    resultsVersion: RESULTS_VERSION,
    resultsSchemaVersion: RESULTS_SCHEMA_VERSION,
    appVersion: b.appVersion,
    engineVersion: b.engineVersion,
    commit: b.commit,
    wasmHash: b.wasmHash,
    solvedAt: now.toISOString(),
    analyses,
  };
}

/**
 * Read a stamp from a stored snapshot, refusing anything malformed (a crafted file must not be
 * able to claim a version it was not solved with in a way that breaks the reader). A malformed
 * stamp reads as no stamp, which is the conservative reading.
 */
export function readStamp(v: unknown): SolveStamp | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  if (typeof s.resultsVersion !== 'number' || !Number.isInteger(s.resultsVersion) || s.resultsVersion < 0) return undefined;
  const str = (k: string, d = 'unknown') => (typeof s[k] === 'string' ? (s[k] as string) : d);
  return {
    id: str('id', `stored-${s.resultsVersion}`),
    resultsVersion: Math.min(s.resultsVersion, RESULTS_VERSION + 1_000_000),
    resultsSchemaVersion: typeof s.resultsSchemaVersion === 'number' ? s.resultsSchemaVersion : 0,
    appVersion: str('appVersion'),
    engineVersion: str('engineVersion'),
    commit: str('commit'),
    wasmHash: str('wasmHash'),
    solvedAt: str('solvedAt', ''),
    analyses: Array.isArray(s.analyses) ? (s.analyses.filter((a) => typeof a === 'string') as AnalysisKind[]) : [],
  };
}
