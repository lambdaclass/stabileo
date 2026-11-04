/**
 * The force (flexibility) method, step by step, for 2D frames and trusses.
 *
 *   1. GH, the classic count (static-degree.ts)
 *   2. GH redundants X₁…Xₙ, chosen by the method or by the reader, and the
 *      primary structure they leave
 *   3. state 0: the primary under the real loads → M₀, N₀, reactions
 *   4. state i: the primary under Xᵢ = 1 alone → mᵢ, nᵢ, reactions
 *   5. δᵢⱼ = Σ ∫ mᵢ·mⱼ/EI + nᵢ·nⱼ/EA dx + Σ R̄ᵢ·R̄ⱼ/k (+ a removed biela's own L/EA, a released spring's 1/k)
 *   6. δᵢ₀ = Σ ∫ mᵢ·M₀/EI + nᵢ·N₀/EA dx + Σ R̄ᵢ·R₀/k (+ temperature, − settlements)
 *   7. compatibility [δ]{X} = {Δ} − {δ₀}, solved for X
 *   8. superposition: M = M₀ + Σ Xᵢ·mᵢ, and the same for N and reactions
 *   9. the answer against the stiffness method's
 *
 * Every coefficient is computed twice: by Mohr's integrals, and as the
 * displacement of the primary at redundant i (`deltaCheck`). The two must
 * agree; the tests hold them together.
 */
import type { SolverInput } from '../types';
import { solveDetailed } from '../solver-detailed';
import { countIndeterminacy, candidates, buildPrimary, removedBarEnds, type Redundant } from './primary';
import { barLoadsOf, axialLoadsOnly, NO_LOADS, solveSystem } from './internal';
import type { BarState, StateResult, TermRow, ForceMethodResult } from './result-types';
import { chooseRedundants, restraintCarries, fallbackBudget, FM_MAX_GH } from './redundants';
import { ForceMethodError } from './errors';
import { redundantsFromKeys, checkCount, checkOrphans, orphanRotations, isBiela, releaseOptions } from './releases';
import { unitPattern, patternLoads, generalised, type PatternItem } from './patterns';
import { solveState, stateOf, barState, geometryOf, lenOf, movingNodes, type Solved } from './state';
import { mohr, selfTerm, loadExtras, type Bar } from './coefficients';
import { axialKept, undetermined } from './terms';
import { ghReport } from '../static-degree';

export type { Redundant, IndeterminacyCount } from './primary';
export type { BarState, StateResult, TermRow, Geometry, ForceMethodResult } from './result-types';
export { numbered, chooseRedundants, restraintCarries, FM_MAX_GH, fallbackBudget } from './redundants';
export { solveSystem } from './internal';
export { ForceMethodError } from './errors';

export interface ForceMethodOptions {
  /** The releases the reader chose, as keys (`releases.ts`); absent, the method chooses them. */
  releases?: string[];
  /** Frame members' axial term in the coefficients; bielas keep theirs. Default on. */
  axial?: boolean;
}

/*
 * Released one at a time with a stability check at each, as it is done by
 * hand, with an exhaustive search behind it for the rare case the greedy order
 * cannot land on exactly GH. A release that leaves a node's rotation held by
 * nothing does not show as unstable (the solver gives that rotation a
 * vanishing spring), so it is checked apart.
 */
function isStable(input: SolverInput, rs: Redundant[], orphansBefore: Set<number>): boolean {
  try {
    const { input: p } = buildPrimary(input, rs, input.loads, { keepPrescribed: true, keepThermal: true });
    for (const n of orphanRotations(p)) if (!orphansBefore.has(n) && input.nodes.has(n)) return false;
    const d = solveDetailed(p);
    return d.nullModes.length === 0 && d.uAll.every(Number.isFinite);
  } catch { return false; }
}

function choose(input: SolverInput, gh: number): Redundant[] | null {
  let carries: (nodeId: number, c: number) => boolean = () => true;
  let nFree = 0;
  try {
    const d = solveDetailed(input);
    carries = restraintCarries(d);
    nFree = d.dofNumbering.nFree;
  } catch { /* the stability checks will say */ }
  const before = orphanRotations(input);
  return chooseRedundants(candidates(input, carries), gh, (rs) => isStable(input, rs, before), fallbackBudget(nFree));
}

/** The reader's releases, checked before anything is solved on them. */
function chosen(input: SolverInput, keys: string[], gh: number): Redundant[] {
  const rs = redundantsFromKeys(input, keys);
  checkCount(rs, gh);
  const { input: p } = buildPrimary(input, rs, [], { keepPrescribed: false, keepThermal: false });
  checkOrphans(input, p);
  const d = solveDetailed(p);
  if (d.nullModes.length > 0) {
    const ids = new Set(input.nodes.keys());
    throw new ForceMethodError('unstable', d.nullModes, gh, { nodes: movingNodes(d).filter((n) => ids.has(n)) });
  }
  return rs;
}

const sum = (rows: TermRow[]) => rows.reduce((s, r) => s + r.value, 0);

export function solveForceMethod(input: SolverInput, opts: ForceMethodOptions = {}): ForceMethodResult {
  const count = countIndeterminacy(input);
  const withAxial = opts.axial ?? true;
  const manual = opts.releases !== undefined;
  if (count.gh < 0) throw new ForceMethodError('hypostatic');
  if (count.gh > FM_MAX_GH) throw new ForceMethodError('tooHyperstatic', [], count.gh);

  const original = geometryOf(input);
  const gh = ghReport(input, 0, { split: true });
  if (count.gh === 0) {
    if (manual && opts.releases!.length > 0) throw new ForceMethodError('count', [], 0, { chosen: opts.releases!.length });
    let s0: Solved;
    try { s0 = solveState(input); } catch (e) {
      throw e instanceof ForceMethodError ? e : new ForceMethodError('unstable');
    }
    const st = stateOf(s0, input.loads);
    return {
      count, isostatic: true, redundants: [], original, primary: original,
      states: [st], delta: [], delta0: [], prescribed: [], deltaTerms: [], delta0Terms: [],
      deltaCheck: [], delta0Check: [], X: [], final: st,
      verification: { maxForceDiff: 0, maxReactionDiff: 0, scale: 1, ok: true },
      stiffness: st, axial: withAxial, axialKept: [], choice: manual ? 'manual' : 'auto', gh, releaseOptions: releaseOptions(input),
    };
  }

  const redundants = manual ? chosen(input, opts.releases!, count.gh) : choose(input, count.gh);
  if (!redundants) throw new ForceMethodError('noRedundants');

  const p0 = buildPrimary(input, redundants, input.loads, { keepPrescribed: true, keepThermal: true });
  const s0 = solveState(p0.input);

  const patterns: PatternItem[][] = redundants.map((r) => unitPattern(input, r, p0.cutNode));
  const unit = patterns.map((pat) => {
    const prim = buildPrimary(input, redundants, [], { keepPrescribed: false, keepThermal: false }).input;
    return solveState({ ...prim, loads: patternLoads(prim, pat) }, pat);
  });

  const bars: Bar[] = [...p0.input.elements.values()].map((e) => {
    const mat = input.materials.get(e.materialId)!;
    const sec = input.sections.get(e.sectionId)!;
    const L = lenOf(p0.input, e.nodeI, e.nodeJ);
    return {
      e, L, EI: mat.e * 1000 * sec.iz, EA: mat.e * 1000 * sec.a, biela: isBiela(input, e.id),
      loads: e.type === 'frame' ? barLoadsOf(p0.input, e.id, L) : axialLoadsOnly(barLoadsOf(p0.input, e.id, L)),
    };
  });
  const none = () => NO_LOADS;
  const realLoads = (id: number) => bars.find((b) => b.e.id === id)?.loads ?? NO_LOADS;
  const biela = new Set(bars.filter((b) => b.biela).map((b) => b.e.id));
  const droppable = (row: TermRow) => row.source === 'axial' && row.elementId !== null && !biela.has(row.elementId);

  const fullTerms: TermRow[][][] = redundants.map((ri, i) => redundants.map((_, j) => {
    const rows = mohr(bars, p0.input, unit[i], none, unit[j], none);
    const own = i === j ? selfTerm(input, ri) : null;
    return own ? [...rows, own] : rows;
  }));
  const full = fullTerms.map((r) => r.map(sum));
  const full0Terms = redundants.map((r, i) => [...mohr(bars, p0.input, unit[i], none, s0, realLoads), ...loadExtras(input, p0.input, bars, unit[i], r)]);

  const kept = withAxial ? new Set<number>() : axialKept(fullTerms, full, droppable);
  const keep = (i: number, j?: number) => withAxial || kept.has(i) || (j !== undefined && kept.has(j));
  const deltaTerms = fullTerms.map((r, i) => r.map((rows, j) => (keep(i, j) ? rows : rows.filter((q) => !droppable(q)))));
  const delta0Terms = full0Terms.map((rows, i) => (keep(i) ? rows : rows.filter((q) => !droppable(q))));
  const delta = deltaTerms.map((r) => r.map(sum));
  const delta0 = delta0Terms.map(sum);

  const free = undetermined(delta);
  if (free.length > 0) throw new ForceMethodError('singular', [], count.gh, { which: free.map((k) => k + 1).sort((a, b) => a - b) });

  /* The second route: displacements of the primary, less what the option leaves out. */
  const deltaCheck = redundants.map((_, i) => redundants.map((_, j) => {
    let v = generalised(unit[j].input, unit[j].data, unit[j].disp, patterns[i]);
    if (i === j) v += sum(fullTerms[i][j].filter((q) => q.source === 'bar' || q.detail?.released));
    return v - (full[i][j] - delta[i][j]);
  }));
  const delta0Check = redundants.map((ri, i) => {
    let v = generalised(s0.input, s0.data, s0.disp, patterns[i]);
    if (ri.kind === 'barForce') v += sum(delta0Terms[i].filter((r) => r.source === 'thermal' && r.elementId === ri.elementId));
    return v - (sum(full0Terms[i]) - delta0[i]);
  });

  const prescribed = redundants.map((r) => r.prescribed ?? 0);
  const X = solveSystem(delta, prescribed.map((d, i) => d - delta0[i]));

  const finalBars: BarState[] = [];
  for (const bar of bars) {
    const f = [...s0.forces(bar.e.id)!];
    unit.forEach((u, j) => { const fj = u.forces(bar.e.id)!; for (let k = 0; k < 6; k++) f[k] += X[j] * fj[k]; });
    finalBars.push(barState(bar.e.id, bar.L, f, bar.loads));
  }
  redundants.forEach((r, i) => {
    if (r.kind !== 'barForce') return;
    const e = input.elements.get(r.elementId!)!;
    const L = lenOf(input, e.nodeI, e.nodeJ);
    const bl = barLoadsOf(input, e.id, L);
    finalBars.push(barState(e.id, L, removedBarEnds(input, e.id, X[i]), e.type === 'frame' ? bl : axialLoadsOnly(bl)));
  });
  const finalReactions = s0.reactions.map((r) => {
    let v = r.value;
    unit.forEach((u, j) => {
      const m = u.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
      if (m) v += X[j] * m.value;
    });
    return { ...r, value: v };
  });
  redundants.forEach((r, i) => {
    if (r.kind === 'reaction') finalReactions.push({ nodeId: r.nodeId, component: r.component!, value: X[i] });
  });
  const byNode = (a: { nodeId: number; component: number }, b: { nodeId: number; component: number }) =>
    a.nodeId - b.nodeId || a.component - b.component;
  finalReactions.sort(byNode);
  finalBars.sort((a, b) => a.elementId - b.elementId);
  const final: StateResult = { bars: finalBars, reactions: finalReactions };

  const dsmState = stateOf(solveState(input), input.loads);
  return {
    count, isostatic: false, redundants, original, primary: geometryOf(p0.input),
    states: [stateOf(s0, p0.input.loads), ...unit.map((u) => stateOf(u, []))],
    delta, delta0, prescribed, deltaTerms, delta0Terms, deltaCheck, delta0Check, X, final,
    verification: { ...verify(input, final, dsmState), ...(withAxial ? {} : { axialOff: true }) },
    stiffness: dsmState, axial: withAxial, axialKept: [...kept].sort((a, b) => a - b), choice: manual ? 'manual' : 'auto', gh, releaseOptions: releaseOptions(input),
  };
}

/*
 * The floor is what counts as no force at all, 1 mN: a load that stresses
 * nothing leaves every force at round-off on both sides.
 */
function verify(input: SolverInput, final: StateResult, dsm: StateResult): ForceMethodResult['verification'] {
  let scale = 1e-6;
  for (const b of dsm.bars) for (const v of Object.values(b.ends)) scale = Math.max(scale, Math.abs(v ?? 0));
  for (const r of dsm.reactions) scale = Math.max(scale, Math.abs(r.value));
  let maxForceDiff = 0;
  for (const b of dsm.bars) {
    const mine = final.bars.find((q) => q.elementId === b.elementId);
    if (!mine) continue;
    const isTruss = input.elements.get(b.elementId)!.type === 'truss';
    for (const k of Object.keys(b.ends) as Array<keyof BarState['ends']>) {
      if (isTruss && k !== 'nStart' && k !== 'nEnd') continue;
      maxForceDiff = Math.max(maxForceDiff, Math.abs((mine.ends[k] ?? 0) - (b.ends[k] ?? 0)));
    }
  }
  let maxReactionDiff = 0;
  for (const r of dsm.reactions) {
    const mine = final.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
    maxReactionDiff = Math.max(maxReactionDiff, Math.abs((mine?.value ?? 0) - r.value));
  }
  return { maxForceDiff, maxReactionDiff, scale, ok: Math.max(maxForceDiff, maxReactionDiff) / scale < 1e-6 };
}

