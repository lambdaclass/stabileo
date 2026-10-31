/**
 * A solved project's results as flat values, the same keys as the results snapshot gate
 * (`results-snapshot/capture.ts`, #716): `base.…`, `case[id].…`, `combo[id].…`, each with its
 * `allZero` flag and its warning/error `diagnosticCodes`.
 *
 * It runs in TWO places, which is why it takes the stores as arguments and imports nothing of
 * the app:
 *
 *   - in a released version's checkout, by `scripts/legacy-projects/generate.mjs`, which copies
 *     this file into that checkout to record what that version showed (#718);
 *   - here, by the legacy-projects test, on the same file opened by the current code.
 *
 * So it reads only what every released version's results store has had since v0.2.0
 * (`results`, `results3D`, `singleResults`, `singleResults3D`, `perCase`, `perCombo`,
 * `perCase3D`, `perCombo3D`). Keep it that way: a getter added later reads `undefined` in an
 * older version and the two sides stop being comparable.
 */
// @ts-expect-error plain JavaScript shared with the results snapshot gate (no declaration file)
import { flatten } from '../../../scripts/results-snapshot/compare.mjs';

export type Values = Record<string, number | string | boolean | null>;

/** The parts of the results store this reads, loosely typed so any version's store fits. */
export interface ResultsLike {
  results?: unknown;
  results3D?: unknown;
  singleResults?: unknown;
  singleResults3D?: unknown;
  perCase?: Map<number, unknown>;
  perCombo?: Map<number, unknown>;
  perCase3D?: Map<number, unknown>;
  perCombo3D?: Map<number, unknown>;
  unstableCombinations3D?: readonly number[];
}

/** One result set as numbers, with its diagnostics as codes (their messages carry formatted numbers). */
export function analysisValues(prefix: string, r: unknown, out: Values): void {
  if (!r || typeof r !== 'object') { out[prefix] = null; return; }
  const { solverDiagnostics, structuredDiagnostics, diagnostics, ...rest } = r as Record<string, unknown>;
  const own: Values = {};
  flatten(rest, prefix, own);
  const numbers = Object.entries(own).filter(([k, v]) => typeof v === 'number' && !/\.nodeIndex$/.test(k)).map(([, v]) => v);
  if (numbers.length > 0 && numbers.every((v) => v === 0)) {
    out[`${prefix}.allZero`] = true;
    for (const [k, v] of Object.entries(own)) if (typeof v !== 'number') out[k] = v;
  } else {
    out[`${prefix}.allZero`] = false;
    Object.assign(out, own);
  }
  const codes = (list: unknown) => (Array.isArray(list)
    ? list.filter((d: { severity?: string }) => d.severity === 'warning' || d.severity === 'error')
      .map((d: { code?: string; severity?: string; metric?: string }) => `${d.severity}:${d.code ?? d.metric ?? ''}`).sort().join(' ')
    : '');
  out[`${prefix}.diagnosticCodes`] = [codes(solverDiagnostics), codes(structuredDiagnostics), codes(diagnostics)].filter(Boolean).join(' | ');
}

/** Every result set the results store publishes for the workspace: the base solve, each case, each combination. */
export function resultValues(store: ResultsLike, is3D: boolean, out: Values): void {
  if (is3D) {
    analysisValues('base', store.singleResults3D ?? store.results3D, out);
    for (const [id, r] of store.perCase3D ?? []) analysisValues(`case[${id}]`, r, out);
    for (const [id, r] of store.perCombo3D ?? []) analysisValues(`combo[${id}]`, r, out);
    if (store.unstableCombinations3D?.length) out['unstableCombinations'] = store.unstableCombinations3D.join(',');
  } else {
    analysisValues('base', store.singleResults ?? store.results, out);
    for (const [id, r] of store.perCase ?? []) analysisValues(`case[${id}]`, r, out);
    for (const [id, r] of store.perCombo ?? []) analysisValues(`combo[${id}]`, r, out);
  }
}
