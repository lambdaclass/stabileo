/**
 * The Basic mode's P-Δ: the engine on the model cut into n elements per member when the method
 * is its own (consistent geometric matrix, members with axial stiffness), the teaching solver
 * otherwise, the results read back on the model's members either way. With them, what the
 * panel shows: B₂ = 1/(1 − 1/λ₁) from the first critical load factor, the largest amplification
 * of the displacements, the iterations, and the engine's answer beside the teaching one.
 */
import type { AnalysisResults, SolverInput } from '../types';
import type { PDeltaResult } from '../result-types';
import type { Txt } from '../steps/doc';
import { tx } from '../steps/doc';
import { solvePDelta, solveBuckling } from '../wasm-solver';
import { buildSystem } from './system';
import { iteratePDelta, toAnalysisResults, InteriorNotFinite, PDELTA_MAX_ITER, PDELTA_TOL, type TeachingPDelta } from './pdelta';
import { teachingBuckling } from './buckling';
import { collapseResults, refineInput, type Refined } from './refine';
import { heldEndsBound, engineClampedBound } from './run-buckling';
import { firstModeB2, teachingOptions, usesEngine, type SoSettings } from './settings';
import { peakAlong } from '../governing-case';
import { computeDiagramValueAt } from '../diagrams';
import { planeModel } from '../steps/plane-model';

export interface IterationRow {
  k: number;
  change: number;
  /** Largest nodal translation of the iterate, m. */
  umax: number;
  /** Most compressed member's N the iteration's K was built from, kN (tension positive). */
  nmin: number;
}

export interface Comparison {
  /** Translation of the reference node (the one that moves most in first order), m. */
  u: number;
  /** Largest end moment, kN·m. */
  m: number;
  b2: number;
  lambda1: number | null;
}

export interface PDeltaInfo {
  settings: SoSettings;
  lambda1: number | null;
  b2: number;
  /** |u_II|/|u_I| at the node that moves most in first order, that node, and whether u_II points against u_I there. */
  amplification: Amplification | null;
  history: IterationRow[] | null;
  /** The iteration history was replayed by the teaching solver and lands on the engine's answer. */
  historyMatchesEngine: boolean;
  /** This run against the engine's (consistent, axial stiffness, same n), when they differ in method. */
  compare: { method: Comparison; engine: Comparison } | null;
}

export type SoPDeltaResult = PDeltaResult & { secondOrder: PDeltaInfo; notice?: string };

const translation = (d: { ux: number; uz: number }) => Math.hypot(d.ux, d.uz);

export interface Amplification { ratio: number; nodeId: number; reversed: boolean }

/** Second- over first-order translation at the node that moves most in first order. */
export function displacementAmplification(linear: AnalysisResults, second: AnalysisResults): Amplification | null {
  let best: { nodeId: number; u: number } | null = null;
  for (const d of linear.displacements) if (!best || translation(d) > best.u) best = { nodeId: d.nodeId, u: translation(d) };
  if (!best || best.u < 1e-12) return null;
  const d1 = linear.displacements.find((d) => d.nodeId === best!.nodeId)!;
  const d2 = second.displacements.find((d) => d.nodeId === best!.nodeId);
  if (!d2) return null;
  const dot = d1.ux * d2.ux + d1.uz * d2.uz;
  return { nodeId: best.nodeId, ratio: translation(d2) / best.u, reversed: dot < 0 };
}

const maxMoment = (r: AnalysisResults) => Math.max(0, ...r.elementForces.map((f) => peakAlong('moment', f)));

/** Midpoint deflection of a member from its chord, ∫ G(L/2, x)·M(x)/EI dx: a fixed physical point at every n. */
function midspanSag(r: AnalysisResults, id: number, EI: number): number | null {
  const f = r.elementForces.find((e) => e.elementId === id);
  if (!f || !(EI > 0)) return null;
  const L = f.length, N = 400;
  let sum = 0;
  for (let k = 0; k <= N; k++) {
    const x = (L * k) / N;
    const g = x <= L / 2 ? x / 2 : (L - x) / 2;
    sum += (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) * g * computeDiagramValueAt('moment', k / N, f);
  }
  return Math.abs((sum * L) / (3 * N) / EI);
}

function comparison(linear: AnalysisResults, second: AnalysisResults, lambda1: number | null): Comparison {
  const amp = displacementAmplification(linear, second);
  const node = amp ? second.displacements.find((d) => d.nodeId === amp.nodeId) : undefined;
  return { u: node ? translation(node) : 0, m: maxMoment(second), b2: firstModeB2(lambda1), lambda1 };
}

/** λ₁ of the engine on the refined model: Infinity with nothing compressed, null when it fails. */
export function engineLambda1(input: SolverInput): number | null {
  try {
    return solveBuckling(input, 1).modes[0]?.loadFactor ?? null;
  } catch (e) {
    return /no compressed elements/i.test(String((e as Error)?.message ?? e)) ? Infinity : null;
  }
}

function teachingLambda1(input: SolverInput, s: SoSettings): number | null {
  const b = teachingBuckling(input, teachingOptions(s), 1);
  if (b.ok) return b.run.modes[0]?.lambda ?? null;
  return b.reason.key === 'course.second-order.refuse.noCompression' ? Infinity : null;
}

function rows(run: TeachingPDelta): IterationRow[] {
  return run.history.map((h) => ({
    k: h.k, change: h.change,
    umax: Math.max(0, ...run.sys.pm.nodeOrder.map((id) => {
      const ix = run.sys.free.indexOf(run.sys.dof(id, 0)), iz = run.sys.free.indexOf(run.sys.dof(id, 1));
      return Math.hypot(ix >= 0 ? h.D[ix] : 0, iz >= 0 ? h.D[iz] : 0);
    })),
    nmin: Math.min(0, ...h.N.values()),
  }));
}

/** Every node of the engine's answer has the same ux, uz and ry here, each to 1e-6 of its largest component. */
export function sameDisplacements(mine: AnalysisResults, engine: AnalysisResults): boolean {
  const e = engine.displacements;
  if (mine.displacements.length !== e.length) return false;
  const byId = new Map(mine.displacements.map((d) => [d.nodeId, d]));
  const tScale = Math.max(1e-12, ...e.map((d) => Math.max(Math.abs(d.ux), Math.abs(d.uz))));
  const rScale = Math.max(1e-12, ...e.map((d) => Math.abs(d.ry)));
  return e.every((d) => {
    const a = byId.get(d.nodeId);
    return !!a && Math.abs(a.ux - d.ux) <= 1e-6 * tScale && Math.abs(a.uz - d.uz) <= 1e-6 * tScale && Math.abs(a.ry - d.ry) <= 1e-6 * rScale;
  });
}

/** The B₂ the result carries: the first mode's when λ₁ is known, else what the solve says. */
function reportedB2(lambda1: number | null, b2: number, stable: boolean, fallback: number): number {
  if (lambda1 !== null) return b2;
  return stable ? fallback : Infinity;
}

function teachingResults(r: Refined, input: SolverInput, run: TeachingPDelta): { results: AnalysisResults; linear: AnalysisResults } {
  const results = toAnalysisResults(run.sys, r.input, run.final, run.method, run.finalSolvedWith);
  const linear = toAnalysisResults(run.sys, r.input, run.linear, 'none', new Map());
  return { results: collapseResults(r, input, results, run.method === 'phi'), linear: collapseResults(r, input, linear) };
}

function engineRun(r: Refined, input: SolverInput) {
  const raw = solvePDelta(r.input, PDELTA_MAX_ITER, PDELTA_TOL) as PDeltaResult & { notice?: string };
  const pieceN = new Map(raw.linearResults.elementForces.map((f) => [f.elementId, Math.min(f.nStart, f.nEnd)]));
  const finalN = new Map(raw.results.elementForces.map((f) => [f.elementId, Math.min(f.nStart, f.nEnd)]));
  return { ...raw, heldBound: heldEndsBound(r.input, pieceN), finalBound: engineClampedBound(r.input, finalN), results: collapseResults(r, input, raw.results), linearResults: collapseResults(r, input, raw.linearResults) };
}

export function runPDelta2D(input: SolverInput, s: SoSettings): { ok: true; result: SoPDeltaResult } | { ok: false; reason: Txt } {
  const r = refineInput(input, s.n);
  if (usesEngine(s)) {
    const res = engineRun(r, input);
    const seen = engineLambda1(r.input);
    const lambda1 = seen !== null && seen > res.heldBound * (1 + 1e-9) ? null : seen;
    const b2 = firstModeB2(lambda1);
    let history: IterationRow[] | null = null;
    let matches = false;
    const sys = buildSystem(r.input, teachingOptions(s));
    if (sys.ok && !res.notice) {
      const run = iteratePDelta(sys.sys, 'consistent');
      history = rows(run);
      const mine = collapseResults(r, input, toAnalysisResults(run.sys, r.input, run.final, 'consistent', run.finalSolvedWith));
      matches = run.iterations === res.iterations && sameDisplacements(mine, res.results);
    }
    const stable = res.isStable && !(res.heldBound <= 1) && !(res.finalBound <= 1) && !(lambda1 !== null && lambda1 <= 1);
    return {
      ok: true,
      result: {
        ...res, isStable: stable, b2Factor: reportedB2(lambda1, b2, stable, res.b2Factor),
        secondOrder: { settings: s, lambda1, b2, amplification: displacementAmplification(res.linearResults, res.results), history, historyMatchesEngine: matches, compare: null },
      },
    };
  }
  const sys = buildSystem(r.input, teachingOptions(s));
  if (!sys.ok) return sys;
  const run = iteratePDelta(sys.sys, s.method);
  let solved: ReturnType<typeof teachingResults>;
  try { solved = teachingResults(r, input, run); } catch (e) {
    if (e instanceof InteriorNotFinite) return { ok: false, reason: tx('course.second-order.refuse.interiorNotFinite') };
    throw e;
  }
  const { results, linear } = solved;
  const lambda1 = teachingLambda1(r.input, s);
  const b2 = firstModeB2(lambda1);
  const stable = run.converged && run.stable && !run.failed && !(lambda1 !== null && lambda1 <= 1);
  let compare: PDeltaInfo['compare'] = null;
  try {
    const eng = engineRun(r, input);
    compare = { method: comparison(linear, results, lambda1), engine: comparison(eng.linearResults, eng.results, engineLambda1(r.input)) };
  } catch {
    compare = null;
  }
  return {
    ok: true,
    result: {
      results, linearResults: linear, iterations: run.iterations, converged: run.converged, isStable: stable,
      b2Factor: reportedB2(lambda1, b2, stable, NaN), amplification: [],
      secondOrder: { settings: s, lambda1, b2, amplification: displacementAmplification(linear, results), history: rows(run), historyMatchesEngine: false, compare },
    },
  };
}

export interface ConvergenceRow {
  label: 'n' | 'phi';
  n: number;
  u: number | null;
  m: number | null;
  lambda1: number | null;
  uAt: { node: number } | { member: number } | null;
}

/** The same P-Δ with 1, 2, 4 and 8 elements per member, and with the stability functions. */
export function pdeltaConvergence(input: SolverInput, s: SoSettings, counts: readonly number[] = [1, 2, 4, 8]): ConvergenceRow[] {
  const out: ConvergenceRow[] = [];
  let ref: { node: number } | { member: number } | null = null;
  const pm = planeModel(input);
  const pick = (res: SoPDeltaResult): typeof ref => {
    const node = displacementAmplification(res.linearResults, res.results)?.nodeId;
    if (node !== undefined) return { node };
    let best = -1, member: number | null = null;
    for (const f of res.results.elementForces) {
      const v = peakAlong('moment', f);
      if (v > best && !pm.members.get(f.elementId)?.truss) { best = v; member = f.elementId; }
    }
    return member === null ? null : { member };
  };
  const read = (res: SoPDeltaResult): Pick<ConvergenceRow, 'u' | 'm' | 'uAt'> => {
    if (!(res.converged && res.isStable)) return { u: null, m: null, uAt: ref };
    ref ??= pick(res);
    const m = maxMoment(res.results);
    if (ref && 'node' in ref) {
      const id = ref.node;
      const d = res.results.displacements.find((x) => x.nodeId === id);
      return { u: d ? translation(d) : null, m, uAt: ref };
    }
    if (!ref) return { u: null, m, uAt: ref };
    const id = ref.member;
    return { u: midspanSag(res.results, id, pm.members.get(id)?.EI ?? 0), m, uAt: ref };
  };
  for (const n of counts) {
    const got = runPDelta2D(input, { ...s, method: s.method === 'phi' ? 'consistent' : s.method, n });
    if (!got.ok) { out.push({ label: 'n', n, u: null, m: null, lambda1: null, uAt: ref }); continue; }
    out.push({ label: 'n', n, ...read(got.result), lambda1: got.result.secondOrder.lambda1 });
  }
  const phi = runPDelta2D(input, { ...s, method: 'phi', n: 1 });
  if (phi.ok) out.push({ label: 'phi', n: 1, ...read(phi.result), lambda1: phi.result.secondOrder.lambda1 });
  return out;
}
