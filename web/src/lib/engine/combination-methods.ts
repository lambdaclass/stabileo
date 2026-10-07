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
 *                  `diagrams-3d.ts`), a variable member's piece by piece. A shell's σ1, σ2 and Von
 *                  Mises are recomputed from the combined components, as a linear combination's
 *                  are: a value of the magnitudes, not a stress state any load puts there.
 *
 * Such a combination is a magnitude, without a sign and in no equilibrium: it is listed with its
 * own results (`AnalysisResults3D.magnitude`) and read by nothing that needs a sign — design, the
 * governing search, the envelopes, the statics check (`result-scopes.ts` `isMagnitudeCombination`).
 * With P-Delta per combination it is the first-order cases' magnitude, said on the result, and none
 * is given for one with no second-order equilibrium; a nonlinear model refuses it
 * (`magnitudeRefusal`), since its cases do not superpose.
 *
 * Pure, over the engine's results.
 */
import type { AnalysisResults3D, ElementForces3D, FullEnvelope3D, PlateStress, QuadStress } from './types-3d';
import type { LoadCase, LoadCombination } from '../store/model.svelte';
import type { ResultPiece } from './variable-members';
import type { PlateThickness } from './shell-combos';
import { envelopeOver, isMagnitudeCombination } from './result-scopes';
import { SETTLEMENT_CASE_ID } from './settlement-case';
import { principalStresses, vonMisesPlane, worseFace } from './shell-stress';

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

const combine = (method: MagnitudeMethod, vs: readonly number[]) =>
  method === 'srss' ? Math.sqrt(vs.reduce((s, v) => s + v * v, 0)) : vs.reduce((s, v) => s + Math.abs(v), 0);

/** Every numeric field of a row (and every number of an array field) combined over the rows. */
function combineRows<T extends object>(method: MagnitudeMethod, rows: readonly T[], keep: ReadonlySet<string>): T {
  const first = rows[0]! as Record<string, unknown>;
  const out: Record<string, unknown> = { ...first };
  for (const [k, v] of Object.entries(first)) {
    if (keep.has(k)) continue;
    if (typeof v === 'number') out[k] = combine(method, rows.map((r) => ((r as Record<string, unknown>)[k] as number) ?? 0));
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map((_, i) => combine(method, rows.map((r) => (((r as Record<string, unknown>)[k] as number[] | undefined)?.[i]) ?? 0)));
  }
  return out as T;
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

const ELEMENT_KEEP = new Set(['elementId', 'length', 'releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd']);
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
 * A case's results times `f`, all of them linear in the load: displacements, reactions, member
 * forces with their loads and pieces, shell stress components. The engine's combiner, which this
 * replaces here, drops the shell stresses and a variable member's pieces: an SRSS at 1,5 had no
 * stresses, and a variable member a prismatic diagram. σ1, σ2 and Von Mises are recomputed from
 * the combined components (`combinedPlates`, `combinedQuads`).
 */
function scaledResult(r: AnalysisResults3D, f: number): AnalysisResults3D {
  if (f === 1) return r;
  return {
    displacements: r.displacements.map((d) => scaledRow(d, f, NODE_KEEP)),
    reactions: r.reactions.map((d) => scaledRow(d, f, NODE_KEEP)),
    elementForces: r.elementForces.map((ef) => scaledForces(ef, f)),
    ...(r.plateStresses ? { plateStresses: r.plateStresses.map((s) => scaledRow(s, f, SHELL_KEEP)) } : {}),
    ...(r.quadStresses ? { quadStresses: r.quadStresses.map((s) => scaledRow(s, f, SHELL_KEEP)) } : {}),
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

/** The plates' stresses combined, σ1, σ2 and Von Mises recomputed as a linear combination's are. */
function combinedPlates(method: MagnitudeMethod, lists: ReadonlyArray<readonly PlateStress[] | undefined>, plates?: PlateThickness): PlateStress[] {
  return groupById(lists, 'elementId').map((rows) => {
    const m = combinedMembrane(method, rows);
    const t = plates?.get(rows[0]!.elementId)?.thickness ?? 0;
    const pr = t > 0 ? worseFace(m, t) : { ...principalStresses(m.sigmaXx, m.sigmaYy, m.tauXy), vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy) };
    return { elementId: rows[0]!.elementId, ...m, sigma1: pr.sigma1, sigma2: pr.sigma2, vonMises: pr.vonMises };
  });
}

/** The quads' stresses combined, Von Mises recomputed from the membrane; Q where every part has it. */
function combinedQuads(method: MagnitudeMethod, lists: ReadonlyArray<readonly QuadStress[] | undefined>): QuadStress[] {
  return groupById(lists, 'elementId').map((rows) => {
    const m = combinedMembrane(method, rows);
    const q = rows.every((r) => r.qx !== undefined && r.qy !== undefined)
      ? { qx: combine(method, rows.map((r) => r.qx!)), qy: combine(method, rows.map((r) => r.qy!)) } : {};
    return { elementId: rows[0]!.elementId, ...m, vonMises: vonMisesPlane(m.sigmaXx, m.sigmaYy, m.tauXy), ...q };
  });
}

/**
 * A combination of the factored cases by SRSS or ABS; null when none of its cases was solved.
 * `plates`: the plates' thicknesses, for their face stresses.
 */
export function magnitudeCombination(
  method: MagnitudeMethod,
  factors: ReadonlyArray<{ caseId: number; factor: number }>,
  perCase: ReadonlyMap<number, AnalysisResults3D>,
  plates?: PlateThickness,
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
    displacements: byId(method, parts.map((p) => p.displacements), 'nodeId', NODE_KEEP),
    reactions: byId(method, parts.map((p) => p.reactions), 'nodeId', NODE_KEEP),
    elementForces,
    ...(parts.some((p) => p.plateStresses?.length) ? { plateStresses: combinedPlates(method, parts.map((p) => p.plateStresses), plates) } : {}),
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
 */
export function finishBundle<B extends CombinationBundle>(
  bundle: B | string | null,
  cases: ReadonlyArray<Pick<LoadCase, 'id' | 'reference' | 'solve'>>,
  combinations: ReadonlyArray<Pick<LoadCombination, 'id' | 'factors' | 'method'>>,
  opts: { plates?: PlateThickness; firstOrder?: boolean } = {},
): B | string | null {
  if (!bundle || typeof bundle === 'string') return bundle;
  const magnitude = combinations.filter(isMagnitudeCombination);
  const hidden = new Set(cases.filter((c) => !listed(c)).map((c) => c.id));
  const perCase = hidden.size ? new Map([...bundle.perCase].filter(([id]) => !hidden.has(id))) : bundle.perCase;
  let { perCombo, envelope } = bundle;
  if (magnitude.length) {
    perCombo = new Map(perCombo);
    const unstable = new Set(bundle.unstable ?? []);
    for (const c of magnitude) {
      const r = unstable.has(c.id) ? null : magnitudeCombination(c.method as MagnitudeMethod, c.factors, bundle.perCase, opts.plates);
      if (r) perCombo.set(c.id, opts.firstOrder ? { ...r, magnitude: { method: r.magnitude!.method, firstOrder: true } } : r);
      else perCombo.delete(c.id);
    }
    const linear = combinations.filter((c) => !isMagnitudeCombination(c)).map((c) => c.id).filter((id) => perCombo.has(id));
    // Without a linear combination, the envelope is the listed cases' (`scopeBundle3D` the same).
    envelope = (linear.length ? envelopeOver(perCombo, linear) : envelopeOver(new Map(), [], perCase, [...perCase.keys()])) ?? envelope;
  }
  return { ...bundle, perCase, perCombo, envelope };
}
