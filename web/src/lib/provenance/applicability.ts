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
import { globalAxes } from '../features';
import { concernsLoadBasis, registryLocale, type ResultChange, type ResultChangeRegistry } from './registry';
import { RESULT_CHANGES } from './full-registry';
import { GLOBAL_AXES_EVIDENCE, LEGACY_RECORDED_ANALYSES, loadsGeneratedWith, UNVERIFIED_SEISMIC_FEATURE, type FeatureSnapshot } from './model-features';
import { recheckFeatures } from './recheck-features';
import { analysesContext, type SolveStamp } from './solve-stamp';
import { advisoriesFor, type Advisory } from './advisories';

import { conditionHolds } from '../../../scripts/results-snapshot/applicability.mjs';
export { conditionHolds };

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
  /** Known wrong-result bugs in the version that solved it, in a feature this model uses. */
  advisories: Advisory[];
  /** The advisories whose analysis the stamp does not record, or whose `certain` condition the model does not meet: their results may be affected. */
  maybe: string[];
}

export function combinedSectionShearExplanation(locale: string): string | undefined {
  const notice = RESULT_CHANGES.changes.find(change => change.id === 'combined-section-shear-refusal');
  return notice ? notice.explanation[registryLocale(locale, notice.explanation)] : undefined;
}

export function assessProject(
  snapshot: FeatureSnapshot,
  stamp: SolveStamp | null | undefined,
  analysisMode?: string,
  registry: ResultChangeRegistry = RESULT_CHANGES,
  originalFeatures?: ReadonlySet<string>,
  loadsVersion: number = loadsGeneratedWith(snapshot),
): RecheckAssessment {
  const solvedVersion = stamp?.resultsVersion ?? 0;
  const currentVersion = registry.currentResultsVersion;
  const evidence = originalFeatures ?? recheckFeatures(snapshot, { analysisMode, ...(stamp ? analysesContext(stamp) : { analysesRun: null }) });
  const features = !globalAxes() && evidence.has(GLOBAL_AXES_EVIDENCE)
    ? new Set([...evidence].filter(feature => feature !== GLOBAL_AXES_EVIDENCE))
    : evidence;
  const changes = registry.changes
    .filter((c) => c.resultsVersion <= currentVersion && c.scope !== 'examples')
    .filter((c) => c.resultsVersion > solvedVersion || (concernsLoadBasis(c) &&
      (c.resultsVersion > loadsVersion || c.when?.all?.includes(UNVERIFIED_SEISMIC_FEATURE))))
    .filter((c) => conditionHolds(c.when ?? {}, features))
    .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const advisories = advisoriesFor(solvedVersion, (w) => conditionHolds(w, features), registry);
  const recorded = solvedVersion > 0 ? stamp?.recorded ?? LEGACY_RECORDED_ANALYSES : [];
  const maybe = advisories
    .filter((a) => (a.analysis && !recorded.includes(a.analysis)) || (a.certain && !a.certain.some((w) => conditionHolds(w, features))))
    .map((a) => a.id);
  return { solvedVersion, currentVersion, older: solvedVersion < currentVersion, newer: solvedVersion > currentVersion, changes, advisories, maybe };
}
