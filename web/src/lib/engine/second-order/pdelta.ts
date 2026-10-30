/**
 * Second-order analysis by iteration, the way the course writes it: solve the first-order
 * problem, read the axial force of every member, rebuild each member's stiffness with it,
 * K(N)·D = F, and repeat until two successive displacement vectors agree,
 * ‖D_k − D_(k−1)‖/‖D_k‖ < tol. The same scheme, start and test as the engine's P-Δ, so with the
 * consistent geometric matrix the two give the same iterates.
 *
 * N is EA·δ/L, the mean force of the member's elongation, as the engine takes it; with axially
 * rigid members there is no elongation and N comes from equilibrium: the forces in the members
 * are the multipliers of the constraints that keep their length, Cᵀ·N = F − K·D.
 */
import type { SolverInput, AnalysisResults, ElementForces } from '../types';
import type { Txt } from '../steps/doc';
import { solveDense } from '../steps/sway-modes';
import { assemble, buildSystem, elasticAxial, localDisplacements, memberDofs, type SecondOrderOptions, type SoSystem } from './system';
import { congruent, matMul, matVec, negativeEigenvalues, norm2, transpose, type Mat } from './dense';
import { rotation, type GeomMethod } from './member-matrices';

export interface State {
  /** Every DOF of the model (restrained ones at their prescribed value). */
  D: number[];
  /** Axial force by member, tension positive, the one this state's K was NOT built from but implies. */
  N: Map<number, number>;
}

export interface IterationRecord {
  k: number;
  /** The axial forces K_k was built from. */
  N: Map<number, number>;
  /** The free displacements solved with K_k. */
  D: number[];
  change: number;
}

export interface TeachingPDelta {
  sys: SoSystem;
  method: GeomMethod;
  linear: State;
  final: State;
  history: IterationRecord[];
  iterations: number;
  converged: boolean;
  /** K(N) positive definite at the end: the equilibrium found is a stable one. */
  stable: boolean;
  /** The solve broke down (K(N) singular). */
  failed: boolean;
}

export const PDELTA_MAX_ITER = 100;
export const PDELTA_TOL = 1e-4;

/** One solve of K(N)·D = F over the unknowns, and the axial forces the result implies. */
export function solveState(sys: SoSystem, N: Map<number, number>, method: GeomMethod): State | null {
  const { K } = assemble(sys, N, method);
  const f = sys.free;
  const D = new Array(sys.nTotal).fill(0);
  for (const [d, v] of sys.prescribed) D[d] = v;
  const rhs = f.map((i) => sys.F[i] - [...sys.prescribed].reduce((s, [d, v]) => s + K[i][d] * v, 0));
  const Kff = f.map((i) => f.map((j) => K[i][j]));
  if (!sys.rigid) {
    const x = solveDense(Kff, rhs);
    if (!x || x.some((v) => !Number.isFinite(v))) return null;
    f.forEach((d, k) => { D[d] = x[k]; });
    return { D, N: elasticAxial(sys, D) };
  }
  const { T, C } = sys.rigid;
  const q = solveDense(congruent(Kff, T), matVec(transpose(T), rhs));
  if (!q || q.some((v) => !Number.isFinite(v))) return null;
  const x = matVec(T, q);
  f.forEach((d, k) => { D[d] = x[k]; });
  const r = rhs.map((v, i) => v - Kff[i].reduce((s, a, j) => s + a * x[j], 0));
  const n = solveDense(matMul(C, transpose(C)), matVec(C, r));
  if (!n) return null;
  return { D, N: new Map(sys.members.map((m, k) => [m.id, n[k]])) };
}

/** The reduced K(N) the iteration solves with: over the free DOFs, and over Tq with rigid members. */
export function reducedStiffness(sys: SoSystem, N: Map<number, number>, method: GeomMethod): Mat {
  const { K } = assemble(sys, N, method);
  const Kff = sys.free.map((i) => sys.free.map((j) => K[i][j]));
  return sys.rigid ? congruent(Kff, sys.rigid.T) : Kff;
}

const freeVector = (sys: SoSystem, D: number[]) => sys.free.map((d) => D[d]);

export function iteratePDelta(sys: SoSystem, method: GeomMethod, maxIter = PDELTA_MAX_ITER, tol = PDELTA_TOL): TeachingPDelta {
  const linear = solveState(sys, new Map(), 'none');
  const empty = { D: new Array(sys.nTotal).fill(0), N: new Map<number, number>() };
  if (!linear) return { sys, method, linear: empty, final: empty, history: [], iterations: 0, converged: false, stable: false, failed: true };
  const history: IterationRecord[] = [];
  let state = linear;
  let converged = false, failed = false;
  for (let k = 1; k <= maxIter; k++) {
    const next = solveState(sys, state.N, method);
    if (!next) { failed = true; break; }
    const a = freeVector(sys, next.D), b = freeVector(sys, state.D);
    const diff = norm2(a.map((v, i) => v - b[i]));
    const nrm = norm2(a);
    const change = nrm > 1e-20 ? diff / nrm : 0;
    history.push({ k, N: state.N, D: a, change });
    state = next;
    if ((nrm === 0 && diff === 0) || (nrm > 1e-20 && change < tol)) { converged = true; break; }
  }
  const last = history[history.length - 1];
  const stable = !failed && negativeEigenvalues(reducedStiffness(sys, last?.N ?? new Map(), method)) === 0;
  return { sys, method, linear, final: state, history, iterations: history.length, converged, stable, failed };
}

export function teachingPDelta(input: SolverInput, opts: SecondOrderOptions): { ok: true; run: TeachingPDelta } | { ok: false; reason: Txt } {
  const b = buildSystem(input, opts);
  if (!b.ok) return b;
  return { ok: true, run: iteratePDelta(b.sys, opts.method) };
}

/**
 * A member's end forces in its own axes, f = K(N)·d − p (p its condensed equivalent loads):
 * the forces the nodes apply to it. With rigid members the axial ones come from N.
 */
export function memberEndForces(sys: SoSystem, state: State, method: GeomMethod, N: Map<number, number>): Map<number, number[]> {
  const { local } = assemble(sys, N, method);
  const out = new Map<number, number[]>();
  for (const m of sys.members) {
    const ms = local.get(m.id)!;
    const d = localDisplacements(sys, m, state.D);
    const p = sys.memberLoads.get(m.id) ?? [0, 0, 0, 0, 0, 0];
    const pc = transpose(ms.T).map((r) => r.reduce((s, v, j) => s + v * p[j], 0));
    const f = ms.k.map((r, i) => r.reduce((s, v, j) => s + v * d[j], 0) - pc[i]);
    if (sys.rigid) { const n = state.N.get(m.id) ?? 0; f[0] -= n; f[3] += n; }
    out.set(m.id, f);
  }
  return out;
}

/** The state as the engine reports a solve: displacements, reactions and member forces with their loads. */
export function toAnalysisResults(sys: SoSystem, input: SolverInput, state: State, method: GeomMethod, N: Map<number, number>): AnalysisResults {
  const ends = memberEndForces(sys, state, method, N);
  const nodal = new Array(sys.nTotal).fill(0);
  for (const m of sys.members) {
    const g = matVec(transpose(rotation(m.c, m.s)), ends.get(m.id)!);
    memberDofs(sys, m).forEach((d, k) => { nodal[d] += g[k]; });
  }
  const pm = sys.pm;
  const displacements = pm.nodeOrder.map((id) => ({ nodeId: id, ux: state.D[sys.dof(id, 0)], uz: state.D[sys.dof(id, 1)], ry: state.D[sys.dof(id, 2)] }));
  const reactions = [...pm.supports.values()].map((s) => {
    const r = [0, 1, 2].map((k) => {
      const d = sys.dof(s.node, k);
      const held = sys.prescribed.has(d) || sys.springs.some((x) => x.dof === d);
      return held ? nodal[d] - sys.Fnodal[d] : 0;
    });
    return { nodeId: s.node, rx: r[0], rz: r[1], my: r[2] };
  }).sort((a, b) => a.nodeId - b.nodeId);
  const elementForces: ElementForces[] = sys.members.map((m) => {
    const f = ends.get(m.id)!;
    return { elementId: m.id, nStart: -f[0], nEnd: f[3], vStart: f[1], vEnd: -f[4], mStart: f[2], mEnd: -f[5], length: m.L, hingeStart: m.hingeI, hingeEnd: m.hingeJ, ...memberLoadsOf(input, m.id, m.L) };
  });
  return { displacements, reactions, elementForces };
}

/** The loads along a member, as the engine lists them with its forces (for the diagrams). */
export function memberLoadsOf(input: SolverInput, id: number, L: number): Pick<ElementForces, 'qI' | 'qJ' | 'pointLoads' | 'distributedLoads'> {
  let qI = 0, qJ = 0;
  const pointLoads: ElementForces['pointLoads'] = [];
  const distributedLoads: ElementForces['distributedLoads'] = [];
  for (const l of input.loads) {
    if (l.type === 'distributed' && l.data.elementId === id) {
      const a = l.data.a ?? 0, b = l.data.b ?? L;
      distributedLoads.push({ qI: l.data.qI, qJ: l.data.qJ, a, b });
      if (a < 1e-9 && Math.abs(b - L) < 1e-9) { qI += l.data.qI; qJ += l.data.qJ; }
    } else if (l.type === 'pointOnElement' && l.data.elementId === id) {
      pointLoads.push({ a: l.data.a, p: l.data.p, ...(l.data.px ? { px: l.data.px } : {}), ...(l.data.my ? { my: l.data.my } : {}) });
    }
  }
  return { qI, qJ, pointLoads, distributedLoads };
}
