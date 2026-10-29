/**
 * Which registered result changes concern a project opened in this build.
 *
 * A change concerns the project when
 *   1. it was introduced after the version the project was last solved with
 *      (no stamp: version 0, so every change is after it), and
 *   2. its condition holds for the model's features (`model-features.ts`).
 *
 * Pure: the store (`store/recheck.svelte.ts`) calls it on open, the tests call it directly.
 */
import { conditionGroups, type ResultChange, type ResultChangeRegistry, type ChangeCondition } from './registry';
import { RESULT_CHANGES } from './full-registry';
import { modelFeatures, type FeatureSnapshot } from './model-features';
import type { SolveStamp } from './solve-stamp';

export function conditionHolds(w: ChangeCondition, features: ReadonlySet<string>): boolean {
  return conditionGroups(w).every((g) => g.some((f) => features.has(f)));
}

export interface RecheckAssessment {
  /** The version the project was last solved with (0: unknown). */
  solvedVersion: number;
  /** This build's results version. */
  currentVersion: number;
  /** Solved with an older version than this build. */
  older: boolean;
  /** Solved with a NEWER version than this build: its numbers may not be reproducible here. */
  newer: boolean;
  /** The changes that concern this model, oldest first. */
  changes: ResultChange[];
}

export function assessProject(
  snapshot: FeatureSnapshot,
  stamp: SolveStamp | null | undefined,
  analysisMode?: string,
  registry: ResultChangeRegistry = RESULT_CHANGES,
): RecheckAssessment {
  const solvedVersion = stamp?.resultsVersion ?? 0;
  const currentVersion = registry.currentResultsVersion;
  const known = !!stamp && solvedVersion > 0;
  const features = modelFeatures(snapshot, { analysisMode, analysesRun: known ? stamp!.analyses : null });
  const changes = solvedVersion >= currentVersion ? [] : registry.changes
    .filter((c) => c.resultsVersion > solvedVersion && c.resultsVersion <= currentVersion)
    .filter((c) => conditionHolds(c.when, features))
    .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { solvedVersion, currentVersion, older: solvedVersion < currentVersion, newer: solvedVersion > currentVersion, changes };
}
