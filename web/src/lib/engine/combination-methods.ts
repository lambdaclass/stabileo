/**
 * What a combination bundle is made of, after the cases are solved:
 *
 *   which cases    a case marked not to solve, or a reference case, is solved only when a
 *                  combination takes it, and is not listed among the results;
 *   SRSS and ABS   a combination may add its factored cases as the square root of the sum of
 *                  their squares, or as the sum of their absolute values, quantity by quantity: each
 *                  displacement, reaction, member end force and shell stress component. Each case
 *                  enters once, with its factors added, and the settlement once with factor 1, as a
 *                  linear combination takes them. Along a member the diagram is combined point by
 *                  point from the cases' own diagrams (`ElementForces3D.combined`, read by
 *                  `diagrams-3d.ts`), a variable member's piece by piece. A shell's Von Mises
 *                  (centroidal and nodal), σ1 and σ2 are combined by the method from each case's
 *                  own values, as the engine gave them for its element, not recomputed from the
 *                  combined components: those are magnitudes, and a stress computed from them
 *                  lost the sign of σxx·σyy (an ABS of one case read 157 where the case read 178).
 *                  Of one case they are its own values times the factor's size; of several, never
 *                  below any of them.
 *
 * Such a combination is a magnitude, without a sign and in no equilibrium: it is listed with its
 * own results (`AnalysisResults3D.magnitude`) and read by nothing that needs a sign — design, the
 * governing search, the envelopes, the statics check (`result-scopes.ts` `isMagnitudeCombination`).
 * With P-Delta per combination it is the first-order cases' magnitude, said on the result, and none
 * is given for one with no second-order equilibrium; a nonlinear model refuses it
 * (`magnitudeRefusal`), since its cases do not superpose.
 *
 *   spectral       a spectral case's result is its own (`spectral-case.ts`): no loads, so the solve
 *                  of a linear combination that takes it solves the rest of the combination, and the
 *                  spectral part is added to that, factor by factor (`superposed`): to the linear
 *                  result, or under P-Delta per combination to the second-order one. The spectral
 *                  part stays first order, as the modal analysis it comes from is linear; a
 *                  combination with no second-order equilibrium gets no result, spectral part or
 *                  not. A nonlinear model refuses these combinations by name (`spectralRefusal`):
 *                  a linear spectral part added to a nonlinear state is no state of the structure.
 *                  Rebuilding them from the first-order cases lost the P-Delta of the rest, gave a
 *                  buckled combination results, and the engine's combiner dropped the shells.
 *
 * Pure, over the engine's results.
 */
import type { AnalysisResults3D, ElementForces3D, FullEnvelope3D, PlateStress, QuadStress } from './types-3d';
import type { LoadCase, LoadCombination } from '../store/model.svelte';
import type { ResultPiece } from './variable-members';
import { mergeResultDiagnostics } from './result-diagnostics';
import { envelopeOver, isMagnitudeCombination } from './result-scopes';
import { SETTLEMENT_CASE_ID } from './settlement-case';
import { combineShellStresses, type PlateThickness } from './shell-combos';

export type MagnitudeMethod = 'srss' | 'abs';

/** The cases a solve needs: those to be listed, and any a combination takes. */
export function casesToSolve<C extends Pick<LoadCase, 'id' | 'reference' | 'solve'>>(cases: readonly C[], combinations: ReadonlyArray<Pick<LoadCombination, 'factors'>>): C[] {
  const used = new Set(combinations.flatMap((c) => c.factors.filter((f) => f.factor !== 0).map((f) => f.caseId)));
  return cases.filter((c) => listed(c) || used.has(c.id));
}

/** Whether a case is listed among the results. */
export const listed = (c: Pick<LoadCase, 'reference' | 'solve'>) => !c.reference && c.solve !== false;

/**
 * A nonlinear model's SRSS and ABS combinations, by name: its cases do not superpose, so no
 * magnitude of them means anything. Null when there is none, or the model is linear.
 */
export function magnitudeRefusal(nonlinear: boolean, combinations: ReadonlyArray<Pick<LoadCombination, 'name' | 'method'>>): string[] | null {
  if (!nonlinear) return null;
  const named = combinations.filter(isMagnitudeCombination).map((c) => c.name);
  return named.length ? named : null;
}

/** Whether a combination takes one of `spectralIds` (`LoadCase.spectral`). */
export const takesSpectral = (c: Pick<LoadCombination, 'factors'>, spectralIds: ReadonlySet<number>) =>
  c.factors.some((f) => f.factor !== 0 && spectralIds.has(f.caseId));

/**
 * A nonlinear model's linear combinations that take a spectral case, by name: the spectral part is
 * a linear result, and the rest of the combination a nonlinear state it cannot be added to. Null
 * when there is none, or the model is linear. (Its SRSS and ABS ones `magnitudeRefusal` names.)
 */
export function spectralRefusal(
  nonlinear: boolean,
  cases: ReadonlyArray<Pick<LoadCase, 'id' | 'spectral'>>,
  combinations: ReadonlyArray<Pick<LoadCombination, 'name' | 'method' | 'factors'>>,
): string[] | null {
  if (!nonlinear) return null;
  const ids = new Set(cases.filter((c) => c.spectral).map((c) => c.id));
  const named = combinations.filter((c) => !isMagnitudeCombination(c) && takesSpectral(c, ids)).map((c) => c.name);
  return named.length ? named : null;
}

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

/** Every numeric field of a row (and every number of an array field) combined over the rows. */
function combineRows<T extends object>(method: MagnitudeMethod, rows: readonly T[], keep: ReadonlySet<string>): T {
  return reduceRows((vs) => combine(method, vs), rows, keep);
}

/** Rows keyed by an id, grouped across results. */
function groupById<T extends object>(lists: ReadonlyArray<readonly T[] | undefined>, idKey: string): T[][] {
  const ids = new Map<number, T[]>();
  for (const list of lists) for (const r of list ?? []) {
    const id = (r as Record<string, unknown>)[idKey] as number;
    (ids.get(id) ?? ids.set(id, []).get(id)!).push(r);
  }
  return [...ids.values()];
}

/** Rows keyed by an id, combined across results; a row missing from some result counts as zero. */
function byId<T extends object>(method: MagnitudeMethod, lists: ReadonlyArray<readonly T[] | undefined>, idKey: string, keep: ReadonlySet<string>): T[] {
  return groupById(lists, idKey).map((rows) => combineRows(method, rows, keep));
}

/**
 * Rows keyed by an id, combined across results in their order; a row missing from a result counts
 * as zero there, so the reducer always sees one value per result (a spectral case's modes, whose
 * combination pairs them by position: `spectral-case.ts`).
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
const NODE_KEEP = new Set(['nodeId']);
const SHELL_KEEP = new Set(['elementId']);

/** Every numeric field of a row (and every number of an array field) times `f`. */
function scaledRow<T extends object>(row: T, f: number, keep: ReadonlySet<string>): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (keep.has(k)) continue;
    if (typeof v === 'number') out[k] = f * v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map((x: number) => f * x);
  }
  return out as T;
}

/** A member's forces times `f`: its ends, its loads, and a variable member's pieces. */
function scaledForces(ef: ElementForces3D, f: number): ElementForces3D {
  const q = (ds: ElementForces3D['distributedLoadsY']) => ds.map((d) => ({ ...d, qI: f * d.qI, qJ: f * d.qJ }));
  const p = (ps: ElementForces3D['pointLoadsY']) => ps.map((x) => ({ ...x, p: f * x.p }));
  return {
    ...scaledRow(ef, f, ELEMENT_KEEP),
    distributedLoadsY: q(ef.distributedLoadsY), distributedLoadsZ: q(ef.distributedLoadsZ),
    ...(ef.distributedLoadsX ? { distributedLoadsX: q(ef.distributedLoadsX) } : {}),
    pointLoadsY: p(ef.pointLoadsY), pointLoadsZ: p(ef.pointLoadsZ),
    ...(ef.pieces ? { pieces: ef.pieces.map((pc): ResultPiece => ({
      ...pc, forces: scaledForces(pc.forces, f),
      ...(pc.dI ? { dI: scaledRow(pc.dI, f, NODE_KEEP) } : {}),
      ...(pc.dJ ? { dJ: scaledRow(pc.dJ, f, NODE_KEEP) } : {}),
    })) } : {}),
  };
}

/**
 * A shell's stresses times `f`: its components, and its Von Mises by the factor's size, which is
 * what a stress state times `f` has. Reversed, a state's largest principal stress is its smallest
 * one reversed, and the other way round.
 */
function scaledShell<T extends { vonMises: number; nodalVonMises?: number[]; sigma1?: number; sigma2?: number }>(s: T, f: number): T {
  const out = scaledRow(s, f, SHELL_KEEP);
  out.vonMises = Math.abs(f) * s.vonMises;
  if (s.nodalVonMises) out.nodalVonMises = s.nodalVonMises.map((v) => Math.abs(f) * v);
  if (f < 0 && s.sigma1 !== undefined && s.sigma2 !== undefined) { out.sigma1 = f * s.sigma2; out.sigma2 = f * s.sigma1; }
  return out;
}

/**
 * A case's results times `f`, all of them linear in the load: displacements, reactions, member
 * forces with their loads and pieces, shell stresses. The engine's combiner, which this replaces
 * here, drops the shell stresses and a variable member's pieces: an SRSS at 1,5 had no stresses,
 * and a variable member a prismatic diagram.
 */
function scaledResult(r: AnalysisResults3D, f: number): AnalysisResults3D {
  if (f === 1) return r;
  return {
    ...mergeResultDiagnostics([r]),
    displacements: r.displacements.map((d) => scaledRow(d, f, NODE_KEEP)),
    reactions: r.reactions.map((d) => scaledRow(d, f, NODE_KEEP)),
    elementForces: r.elementForces.map((ef) => scaledForces(ef, f)),
    ...(r.plateStresses ? { plateStresses: r.plateStresses.map((s) => scaledShell(s, f)) } : {}),
    ...(r.quadStresses ? { quadStresses: r.quadStresses.map((s) => scaledShell(s, f)) } : {}),
  };
}

/**
 * A member's part between x0 and x1, of a result with no loads along the member (a spectral case's):
 * each end field read off the straight line between the member's ends.
 */
function spanOf(ef: ElementForces3D, x0: number, x1: number, length: number): ElementForces3D {
  const out: Record<string, unknown> = { ...ef, length: x1 - x0 };
  for (const k of Object.keys(ef)) {
    if (!k.endsWith('Start')) continue;
    const base = k.slice(0, -5), a = (ef as unknown as Record<string, unknown>)[k], b = (ef as unknown as Record<string, unknown>)[base + 'End'];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const at = (x: number) => a + (b - a) * (length > 0 ? x / length : 0);
    out[k] = at(x0); out[base + 'End'] = at(x1);
  }
  return out as unknown as ElementForces3D;
}

/** Members' forces added, each part times its factor: the ends, every part's loads, the pieces. */
function summedForces(parts: ReadonlyArray<{ ef: ElementForces3D; f: number }>): ElementForces3D {
  const scaled = parts.map(({ ef, f }) => scaledForces(ef, f));
  const ends = reduceRows((vs) => vs.reduce((s, v) => s + v, 0), scaled, ELEMENT_KEEP);
  const withPieces = scaled.find((e) => e.pieces?.length);
  // A variable member's pieces: each part's own piece, or its straight line over the piece's span.
  const pieces = withPieces?.pieces?.map((pc, i): ResultPiece => {
    const own = scaled.map((e) => (e.pieces?.[i] ? e.pieces[i]!.forces : spanOf(e, pc.x0, pc.x1, e.length)));
    const all = scaled.every((e) => e.pieces?.[i]);
    return {
      ...pc, forces: summedForces(own.map((ef) => ({ ef, f: 1 }))),
      // Displacements along the member only where every part has them.
      dI: all && pc.dI ? reduceRows((vs) => vs.reduce((s, v) => s + v, 0), scaled.map((e) => e.pieces![i]!.dI!), NODE_KEEP) : undefined,
      dJ: all && pc.dJ ? reduceRows((vs) => vs.reduce((s, v) => s + v, 0), scaled.map((e) => e.pieces![i]!.dJ!), NODE_KEEP) : undefined,
    };
  });
  return {
    ...ends,
    distributedLoadsY: scaled.flatMap((e) => e.distributedLoadsY), distributedLoadsZ: scaled.flatMap((e) => e.distributedLoadsZ),
    distributedLoadsX: scaled.flatMap((e) => e.distributedLoadsX ?? []),
    pointLoadsY: scaled.flatMap((e) => e.pointLoadsY), pointLoadsZ: scaled.flatMap((e) => e.pointLoadsZ),
    pieces, combined: undefined,
  };
}

/**
 * Results added, each times its factor: displacements, reactions, member forces with their loads
 * and pieces (`summedForces`), and shell stresses, whose components add and whose Von Mises, σ1
 * and σ2 are worked out from the sums as the engine does for its element (`combineShellStresses`).
 * The first part's own fields (a second-order result's `secondOrder`) are kept. The engine's
 * combiner, which this replaces for a combination taking a spectral case, drops the shells.
 */
export function superposed(parts: ReadonlyArray<{ r: AnalysisResults3D; f: number }>, plates: PlateThickness = new Map()): AnalysisResults3D {
  const sum = (vs: readonly number[]) => vs.reduce((s, v, i) => s + parts[i]!.f * v, 0);
  const elements = new Map<number, Array<{ ef: ElementForces3D; f: number }>>();
  for (const { r, f } of parts) for (const ef of r.elementForces) (elements.get(ef.elementId) ?? elements.set(ef.elementId, []).get(ef.elementId)!).push({ ef, f });
  const shells = parts.some(({ r }) => r.plateStresses?.length || r.quadStresses?.length)
    ? combineShellStresses(
        parts.map(({ f }, i) => ({ caseId: i, factor: f })),
        new Map(parts.map(({ r }, i) => [i, new Map((r.plateStresses ?? []).map((s) => [s.elementId, s]))])),
        new Map(parts.map(({ r }, i) => [i, new Map((r.quadStresses ?? []).map((s) => [s.elementId, s]))])),
        plates,
      )
    : null;
  // The rest's own fields kept (`secondOrder`), never a magnitude's mark: the sum has a sign.
  const first: AnalysisResults3D = { ...parts[0]!.r };
  delete first.magnitude;
  return {
    ...first,
    ...mergeResultDiagnostics(parts.filter(({ f }) => f !== 0).map(({ r }) => r)),
    displacements: reduceById(sum, parts.map(({ r }) => r.displacements), 'nodeId', NODE_KEEP),
    reactions: reduceById(sum, parts.map(({ r }) => r.reactions), 'nodeId', NODE_KEEP),
    elementForces: [...elements.values()].map(summedForces),
    ...(shells ? { plateStresses: shells.plateStresses, quadStresses: shells.quadStresses } : {}),
  };
}

const MEMBRANE = ['sigmaXx', 'sigmaYy', 'tauXy', 'mx', 'my', 'mxy'] as const;
type Membrane = Record<(typeof MEMBRANE)[number], number>;

/** A shell's components combined across the parts; a part without the shell counts as zero. */
function combinedMembrane(method: MagnitudeMethod, rows: ReadonlyArray<Membrane>): Membrane {
  const m = {} as Membrane;
  for (const k of MEMBRANE) m[k] = combine(method, rows.map((r) => r[k]));
  return m;
}

/**
 * Von Mises of the parts combined, at the centre and at each node. A part without nodal values
 * enters each node with its centroidal one, as a linear combination falls back to it.
 */
function combinedVonMises(method: MagnitudeMethod, rows: ReadonlyArray<{ vonMises: number; nodalVonMises?: number[] }>): { vonMises: number; nodalVonMises?: number[] } {
  const vonMises = combine(method, rows.map((r) => r.vonMises));
  const n = Math.max(0, ...rows.map((r) => r.nodalVonMises?.length ?? 0));
  if (n === 0) return { vonMises };
  return { vonMises, nodalVonMises: Array.from({ length: n }, (_, i) => combine(method, rows.map((r) => r.nodalVonMises?.[i] ?? r.vonMises))) };
}

/** The plates' stresses combined: Von Mises, σ1 and σ2 from the parts' own (`scaledShell`). */
function combinedPlates(method: MagnitudeMethod, lists: ReadonlyArray<readonly PlateStress[] | undefined>): PlateStress[] {
  return groupById(lists, 'elementId').map((rows) => ({
    elementId: rows[0]!.elementId, ...combinedMembrane(method, rows),
    sigma1: combine(method, rows.map((r) => r.sigma1)), sigma2: combine(method, rows.map((r) => r.sigma2)),
    ...combinedVonMises(method, rows),
  }));
}

/** The quads' stresses combined: Von Mises from the parts' own; Q where every part has it. */
function combinedQuads(method: MagnitudeMethod, lists: ReadonlyArray<readonly QuadStress[] | undefined>): QuadStress[] {
  return groupById(lists, 'elementId').map((rows) => {
    const q = rows.every((r) => r.qx !== undefined && r.qy !== undefined)
      ? { qx: combine(method, rows.map((r) => r.qx!)), qy: combine(method, rows.map((r) => r.qy!)) } : {};
    return { elementId: rows[0]!.elementId, ...combinedMembrane(method, rows), ...combinedVonMises(method, rows), ...q };
  });
}

/** A combination of the factored cases by SRSS or ABS; null when none of its cases was solved. */
export function magnitudeCombination(
  method: MagnitudeMethod,
  factors: ReadonlyArray<{ caseId: number; factor: number }>,
  perCase: ReadonlyMap<number, AnalysisResults3D>,
): AnalysisResults3D | null {
  // A case named twice enters once, with its factors added, as a linear combination takes it:
  // 1,2 D and 0,2 D are 1,4 D, not two terms squared apart.
  const summed = new Map<number, number>();
  for (const f of factors) if (perCase.has(f.caseId) && f.caseId !== SETTLEMENT_CASE_ID) summed.set(f.caseId, (summed.get(f.caseId) ?? 0) + f.factor);
  const terms = [...summed].filter(([, f]) => f !== 0);
  if (!terms.length) return null;
  // The settlement, once with factor 1, as every linear combination takes it (`settlement-case.ts`).
  if (perCase.has(SETTLEMENT_CASE_ID)) terms.push([SETTLEMENT_CASE_ID, 1]);
  const parts = terms.map(([id, f]) => scaledResult(perCase.get(id)!, f));
  const elements = new Map<number, ElementForces3D[]>();
  for (const p of parts) for (const ef of p.elementForces) (elements.get(ef.elementId) ?? elements.set(ef.elementId, []).get(ef.elementId)!).push(ef);
  const elementForces = [...elements.values()].map((efs): ElementForces3D => {
    const ends = combineRows(method, efs, ELEMENT_KEEP);
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
    ...mergeResultDiagnostics(parts),
    displacements: byId(method, parts.map((p) => p.displacements), 'nodeId', NODE_KEEP),
    reactions: byId(method, parts.map((p) => p.reactions), 'nodeId', NODE_KEEP),
    elementForces,
    ...(parts.some((p) => p.plateStresses?.length) ? { plateStresses: combinedPlates(method, parts.map((p) => p.plateStresses)) } : {}),
    ...(parts.some((p) => p.quadStresses?.length) ? { quadStresses: combinedQuads(method, parts.map((p) => p.quadStresses)) } : {}),
    magnitude: { method },
  };
}

export interface CombinationBundle { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D; unstable?: number[] }

/**
 * The bundle with SRSS and ABS combinations combined as they say, the linear envelope over the
 * others, and the cases not to be listed taken out.
 *
 * `firstOrder`: the combinations were solved with P-Delta. An SRSS or ABS combination is then the
 * linear cases' magnitude, said on its result; one the P-Delta solve found with no second-order
 * equilibrium at its summed load gets no result, as a linear one does not. It got the magnitude
 * back, and an unstable combination read as one with results.
 *
 * `plates`: the plates' thicknesses, for the stresses of a combination taking a spectral case.
 */
export function finishBundle<B extends CombinationBundle>(
  bundle: B | string | null,
  cases: ReadonlyArray<Pick<LoadCase, 'id' | 'reference' | 'solve' | 'spectral'>>,
  combinations: ReadonlyArray<Pick<LoadCombination, 'id' | 'factors' | 'method'>>,
  opts: { firstOrder?: boolean; plates?: PlateThickness } = {},
  /** The spectral cases' results; a spectral case without one is left out, with what takes it. */
  spectral?: ReadonlyMap<number, AnalysisResults3D>,
): B | string | null {
  if (!bundle || typeof bundle === 'string') return bundle;
  const magnitude = combinations.filter(isMagnitudeCombination);
  const hidden = new Set(cases.filter((c) => !listed(c)).map((c) => c.id));
  let { perCombo, envelope } = bundle;
  // A spectral case's result is its own; a linear combination that takes it is the rest of the
  // combination as the solve gave it (linear, or second order), with the spectral part added.
  const spectralIds = cases.filter((c) => c.spectral).map((c) => c.id);
  const spectralSet = new Set(spectralIds);
  const unstable = new Set(bundle.unstable ?? []);
  let basePerCase = bundle.perCase;
  if (spectralIds.length) {
    basePerCase = new Map(bundle.perCase);
    perCombo = new Map(perCombo);
    for (const id of spectralIds) {
      const r = spectral?.get(id);
      if (r) basePerCase.set(id, r); else basePerCase.delete(id);
    }
    for (const c of combinations) {
      if (!takesSpectral(c, spectralSet)) continue;
      if (c.factors.some((f) => f.factor !== 0 && spectralSet.has(f.caseId) && !basePerCase.has(f.caseId))) { perCombo.delete(c.id); continue; }
      if (isMagnitudeCombination(c)) continue;
      // No second-order equilibrium at its load: no result, as for any combination.
      if (unstable.has(c.id)) { perCombo.delete(c.id); continue; }
      // The rest is absent when the combination takes nothing but spectral cases.
      const rest = bundle.perCombo.get(c.id);
      const parts = [
        ...(rest ? [{ r: rest, f: 1 }] : []),
        ...c.factors.filter((f) => f.factor !== 0 && spectralSet.has(f.caseId)).map((f) => ({ r: basePerCase.get(f.caseId)!, f: f.factor })),
      ];
      perCombo.set(c.id, superposed(parts, opts.plates));
    }
  }
  const perCase = hidden.size ? new Map([...basePerCase].filter(([id]) => !hidden.has(id))) : basePerCase;
  if (magnitude.length || spectralIds.length) {
    perCombo = new Map(perCombo);
    for (const c of magnitude) {
      if (!perCombo.has(c.id) && c.factors.some((f) => f.factor !== 0 && spectralSet.has(f.caseId) && !basePerCase.has(f.caseId))) continue;
      const r = unstable.has(c.id) ? null : magnitudeCombination(c.method as MagnitudeMethod, c.factors, basePerCase);
      if (r) perCombo.set(c.id, opts.firstOrder ? { ...r, magnitude: { method: r.magnitude!.method, firstOrder: true } } : r);
      else perCombo.delete(c.id);
    }
    const linear = combinations.filter((c) => !isMagnitudeCombination(c)).map((c) => c.id).filter((id) => perCombo.has(id));
    // Without a linear combination, the envelope is the listed cases' (`scopeBundle3D` the same).
    envelope = (linear.length ? envelopeOver(perCombo, linear) : envelopeOver(new Map(), [], perCase, [...perCase.keys()])) ?? envelope;
  }
  return { ...bundle, perCase, perCombo, envelope };
}
