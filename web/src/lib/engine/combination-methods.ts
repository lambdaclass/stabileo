/**
 * What a combination bundle is made of, after the cases are solved:
 *
 *   which cases    a case marked not to solve, or a reference case, is solved only when a
 *                  combination takes it, and is not listed among the results;
 *   SRSS and ABS   a combination may add its factored cases as the square root of the sum of
 *                  their squares, or as the sum of their absolute values, quantity by quantity: each
 *                  displacement, reaction, member end force and shell stress. Along a member the
 *                  diagram is combined point by point from the cases' own diagrams
 *                  (`ElementForces3D.combined`, read by `diagrams-3d.ts`). Such a combination is a
 *                  magnitude, without a sign: it is listed with its own results and left out of the
 *                  linear envelope.
 *
 * Pure, over the engine's results.
 */
import type { AnalysisResults3D, ElementForces3D, FullEnvelope3D } from './types-3d';
import type { LoadCase, LoadCombination } from '../store/model.svelte';
import { combineResults3D } from './wasm-solver';
import { envelopeOver } from './result-scopes';

export type MagnitudeMethod = 'srss' | 'abs';

/** The cases a solve needs: those to be listed, and any a combination takes. */
export function casesToSolve<C extends Pick<LoadCase, 'id' | 'reference' | 'solve'>>(cases: readonly C[], combinations: ReadonlyArray<Pick<LoadCombination, 'factors'>>): C[] {
  const used = new Set(combinations.flatMap((c) => c.factors.filter((f) => f.factor !== 0).map((f) => f.caseId)));
  return cases.filter((c) => listed(c) || used.has(c.id));
}

/** Whether a case is listed among the results. */
export const listed = (c: Pick<LoadCase, 'reference' | 'solve'>) => !c.reference && c.solve !== false;

const combine = (method: MagnitudeMethod, vs: readonly number[]) =>
  method === 'srss' ? Math.sqrt(vs.reduce((s, v) => s + v * v, 0)) : vs.reduce((s, v) => s + Math.abs(v), 0);

/** Every numeric field of a row (and every number of an array field) combined over the rows by `reduce`. */
export function reduceRows<T extends object>(reduce: (vs: readonly number[]) => number, rows: readonly T[], keep: ReadonlySet<string>): T {
  const first = rows[0]! as Record<string, unknown>;
  const out: Record<string, unknown> = { ...first };
  for (const [k, v] of Object.entries(first)) {
    if (keep.has(k)) continue;
    if (typeof v === 'number') out[k] = reduce(rows.map((r) => ((r as Record<string, unknown>)[k] as number) ?? 0));
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map((_, i) => reduce(rows.map((r) => (((r as Record<string, unknown>)[k] as number[] | undefined)?.[i]) ?? 0)));
  }
  return out as T;
}

/**
 * Rows keyed by an id, combined across results in their order; a row missing from a result counts
 * as zero there, so the reducer always sees one value per result.
 */
export function reduceById<T extends object>(reduce: (vs: readonly number[]) => number, lists: ReadonlyArray<readonly T[] | undefined>, idKey: string, keep: ReadonlySet<string>): T[] {
  const ids = new Map<number, Array<T | undefined>>();
  lists.forEach((list, i) => {
    for (const r of list ?? []) {
      const id = (r as Record<string, unknown>)[idKey] as number;
      const row = ids.get(id) ?? ids.set(id, new Array<T | undefined>(lists.length).fill(undefined)).get(id)!;
      row[i] = r;
    }
  });
  return [...ids.values()].map((rows) => {
    const present = rows.find((r): r is T => !!r)!;
    const zero = Object.fromEntries(Object.entries(present).map(([k, v]) => [k, typeof v === 'number' && !keep.has(k) ? 0 : v])) as T;
    return reduceRows(reduce, rows.map((r) => r ?? zero), keep);
  });
}

export const ELEMENT_KEEP = new Set(['elementId', 'length', 'releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd']);

/** A combination of the factored cases by SRSS or ABS; null when none of its cases was solved. */
export function magnitudeCombination(
  method: MagnitudeMethod,
  factors: ReadonlyArray<{ caseId: number; factor: number }>,
  perCase: ReadonlyMap<number, AnalysisResults3D>,
): AnalysisResults3D | null {
  const parts = factors.filter((f) => f.factor !== 0 && perCase.has(f.caseId))
    .map((f) => (f.factor === 1 ? perCase.get(f.caseId)! : combineResults3D([{ caseId: f.caseId, factor: f.factor }], perCase as Map<number, AnalysisResults3D>)))
    .filter((r): r is AnalysisResults3D => !!r);
  if (!parts.length) return null;
  const elements = new Map<number, ElementForces3D[]>();
  for (const p of parts) for (const ef of p.elementForces) (elements.get(ef.elementId) ?? elements.set(ef.elementId, []).get(ef.elementId)!).push(ef);
  const elementForces = [...elements.values()].map((efs): ElementForces3D => {
    const ends = reduceRows((vs) => combine(method, vs), efs, ELEMENT_KEEP);
    const at = (k: 'pointLoadsY' | 'pointLoadsZ') => efs.flatMap((e) => e[k].map((p) => ({ a: p.a, p: 0 })));
    // No loads of its own: along the member it is read from its parts (`diagrams-3d.ts`).
    return {
      ...ends,
      qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
      distributedLoadsY: [], distributedLoadsZ: [], distributedLoadsX: [],
      pointLoadsY: at('pointLoadsY'), pointLoadsZ: at('pointLoadsZ'),
      pieces: undefined,
      combined: { method, parts: efs },
    };
  });
  return {
    displacements: reduceById((vs) => combine(method, vs), parts.map((p) => p.displacements), 'nodeId', new Set(['nodeId'])),
    reactions: reduceById((vs) => combine(method, vs), parts.map((p) => p.reactions), 'nodeId', new Set(['nodeId'])),
    elementForces,
    ...(parts.some((p) => p.plateStresses?.length) ? { plateStresses: reduceById((vs) => combine(method, vs), parts.map((p) => p.plateStresses), 'elementId', new Set(['elementId'])) } : {}),
    ...(parts.some((p) => p.quadStresses?.length) ? { quadStresses: reduceById((vs) => combine(method, vs), parts.map((p) => p.quadStresses), 'elementId', new Set(['elementId'])) } : {}),
  };
}

export interface CombinationBundle { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D; unstable?: number[] }

/**
 * The bundle with SRSS and ABS combinations combined as they say, the linear envelope over the
 * others, and the cases not to be listed taken out.
 */
export function finishBundle<B extends CombinationBundle>(
  bundle: B | string | null,
  cases: ReadonlyArray<Pick<LoadCase, 'id' | 'reference' | 'solve' | 'spectral'>>,
  combinations: ReadonlyArray<Pick<LoadCombination, 'id' | 'factors' | 'method'>>,
  /** The spectral cases' results; a spectral case without one is left out, with what takes it. */
  spectral?: ReadonlyMap<number, AnalysisResults3D>,
): B | string | null {
  if (!bundle || typeof bundle === 'string') return bundle;
  const magnitude = combinations.filter((c) => c.method === 'srss' || c.method === 'abs');
  let { perCombo, envelope } = bundle;
  // A spectral case's result is its own; the linear combinations that take it add it again.
  const spectralIds = cases.filter((c) => c.spectral).map((c) => c.id);
  let basePerCase = bundle.perCase;
  if (spectralIds.length) {
    basePerCase = new Map(bundle.perCase);
    perCombo = new Map(perCombo);
    for (const id of spectralIds) {
      const r = spectral?.get(id);
      if (r) basePerCase.set(id, r); else basePerCase.delete(id);
    }
    for (const c of combinations) {
      if (!c.factors.some((f) => f.factor !== 0 && spectralIds.includes(f.caseId))) continue;
      if (c.factors.some((f) => f.factor !== 0 && spectralIds.includes(f.caseId) && !basePerCase.has(f.caseId))) { perCombo.delete(c.id); continue; }
      if (c.method === 'srss' || c.method === 'abs') continue;
      const r = combineResults3D(c.factors.filter((f) => basePerCase.has(f.caseId)), basePerCase as Map<number, AnalysisResults3D>);
      if (r) perCombo.set(c.id, r); else perCombo.delete(c.id);
    }
  }
  if (magnitude.length || spectralIds.length) {
    perCombo = new Map(perCombo);
    for (const c of magnitude) {
      const r = magnitudeCombination(c.method as MagnitudeMethod, c.factors, basePerCase);
      if (r) perCombo.set(c.id, r); else perCombo.delete(c.id);
    }
    const linear = combinations.filter((c) => !c.method || c.method === 'linear').map((c) => c.id).filter((id) => perCombo.has(id));
    // Without a linear combination, the envelope is the listed cases'.
    const cases0 = cases.filter((c) => listed(c) && basePerCase.has(c.id)).map((c) => c.id);
    envelope = (linear.length ? envelopeOver(perCombo, linear) : envelopeOver(new Map(), [], basePerCase, cases0)) ?? envelope;
  }
  const hidden = new Set(cases.filter((c) => !listed(c)).map((c) => c.id));
  const perCase = hidden.size ? new Map([...basePerCase].filter(([id]) => !hidden.has(id))) : basePerCase;
  return { ...bundle, perCase, perCombo, envelope };
}
