/**
 * The critical load factor λ: the multiple of the loads at which K(λ·N₀) stops being positive
 * definite, N₀ the axial forces of the first-order solution.
 *
 * - With a geometric matrix linear in N (consistent or chord), K(λN₀) = K_E + λ·K_G(N₀) and
 *   λ solves the eigenproblem (K_E + λK_G)·φ = 0.
 * - With the stability functions K(λN₀) is transcendental in λ, and the critical load is the
 *   first root of det K(λ) = 0. det K has poles too (where a member alone, its ends held,
 *   would buckle), so the roots are counted, not searched by sign: the number of critical
 *   loads below λ is J(λ) = J₀(λ) + s{K(λ)}, s the negative eigenvalues of K(λ) and J₀ those of
 *   the members with their ends held (the Wittrick–Williams count), and λ_i is where J reaches i.
 */
import type { Txt } from '../steps/doc';
import { tx } from '../steps/doc';
import type { SolverInput } from '../types';
import { assemble, buildSystem, memberDofs, memberLocals, type SecondOrderOptions, type SoSystem } from './system';
import { clampedCount, reducedStiffness, rigidAxialScale, solveState } from './pdelta';
import { generalizedEigen, logDet, matMul, matVec, negativeEigenvalues, norm2, transpose, zeros, type Mat } from './dense';
import { solveDense } from '../steps/sway-modes';
import { rotation, type GeomMethod } from './member-matrices';
import { clampedModesBelow } from './stability-functions';

export interface TeachingMode {
  lambda: number;
  /** Every DOF of the model, scaled so the largest component is 1; all zero when `internal`. */
  D: number[];
  /** A mode inside a member with its ends held: the nodal DOFs cannot draw it. */
  internal?: true;
}

export interface TeachingBuckling {
  sys: SoSystem;
  method: GeomMethod;
  /** First-order axial forces, tension positive. */
  N0: Map<number, number>;
  /** Below this |N| a member's first-order axial force is round-off of its own terms. */
  N0Noise: Map<number, number>;
  modes: TeachingMode[];
}

export const sub = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((v, j) => v - B[i][j]));
const scaled = (N: Map<number, number>, f: number) => new Map([...N].map(([k, v]) => [k, v * f]));

function expand(sys: SoSystem, x: number[]): number[] {
  const free = sys.rigid ? matVec(sys.rigid.T, x) : x;
  const D = new Array(sys.nTotal).fill(0);
  sys.free.forEach((d, k) => { D[d] = free[k]; });
  const big = Math.max(...D.map(Math.abs));
  if (big > 0) {
    const k = D.reduce((best, v, i) => (Math.abs(v) > Math.abs(D[best]) ? i : best), 0);
    const sgn = Math.sign(D[k]) || 1;
    return D.map((v) => (v / big) * sgn);
  }
  return D;
}

/** First-order axial forces of the system, or why there is nothing to buckle. */
export function firstOrderAxial(sys: SoSystem): { ok: true; N0: Map<number, number>; noise: Map<number, number> } | { ok: false; reason: Txt } {
  const lin = solveState(sys, new Map(), 'none');
  if (!lin) return { ok: false, reason: tx('course.second-order.refuse.singular') };
  const rigidScale = rigidAxialScale(sys, lin, 'none');
  if (sys.rigid && !rigidScale) return { ok: false, reason: tx('course.second-order.refuse.singular') };
  const noise = new Map(sys.members.map((m) => [m.id, 1e-9 * (rigidScale ? rigidScale.get(m.id) ?? 0 : elasticUncertainty(sys, m, lin))]));
  if (!sys.members.some((m) => (lin.N.get(m.id) ?? 0) < -(noise.get(m.id) ?? 0))) return { ok: false, reason: tx('course.second-order.refuse.noCompression') };
  return { ok: true, N0: lin.N, noise };
}

function elasticUncertainty(sys: SoSystem, m: SoSystem['members'][number], lin: { D: number[] }): number {
  const at = (node: number) => Math.abs(m.c * lin.D[sys.dof(node, 0)]) + Math.abs(m.s * lin.D[sys.dof(node, 1)]);
  return (m.EA / m.L) * (at(m.i) + at(m.j));
}

function geometricStiffness(sys: SoSystem, N0: Map<number, number>, method: 'consistent' | 'string'): Mat {
  const at = new Map(sys.free.map((d, k) => [d, k]));
  const G = zeros(sys.free.length, sys.free.length);
  const local = memberLocals(sys, N0, method);
  for (const m of sys.members) {
    const R = rotation(m.c, m.s);
    const kg = matMul(transpose(R), matMul(local.get(m.id)!.kg, R));
    const ids = memberDofs(sys, m);
    for (let a = 0; a < 6; a++) {
      const r = at.get(ids[a]);
      if (r === undefined) continue;
      for (let b = 0; b < 6; b++) { const c = at.get(ids[b]); if (c !== undefined) G[r][c] += kg[a][b]; }
    }
  }
  return G;
}

/** The eigenproblem with a geometric matrix linear in N. */
export function linearBuckling(sys: SoSystem, method: 'consistent' | 'string', nModes: number, N0: Map<number, number>): TeachingMode[] {
  const K = assemble(sys, new Map(), 'none', sys.free).K;
  const KG = geometricStiffness(sys, N0, method);
  const pairs = generalizedEigen(K, KG.map((r) => r.map((v) => -v)), sys.rigid?.T);
  if (!pairs) return [];
  return pairs.slice(0, nModes).map((p) => ({ lambda: p.lambda, D: expand(sys, p.vector) }));
}

/**
 * An upper bound on the true λ₁: with every node held, the first member to buckle between its
 * ends. A linear-matrix λ₁ above it is a mode the discretization cannot represent.
 */
export function clampedBound(sys: SoSystem, N0: Map<number, number>): number {
  let best = Infinity;
  for (const m of sys.members) {
    const n = N0.get(m.id) ?? 0;
    if (m.truss || !(n < 0) || !(m.EI > 0)) continue;
    const u = m.hingeI && m.hingeJ ? Math.PI : m.hingeI || m.hingeJ ? 4.493409457909064 : 2 * Math.PI;
    best = Math.min(best, (u * u * m.EI) / (m.L * m.L * -n));
  }
  return best;
}

export const representsFirstMode = (sys: SoSystem, N0: Map<number, number>, lambda1: number): boolean => !(lambda1 > clampedBound(sys, N0) * (1 + 1e-9));

/** J(λ): how many critical load factors lie below λ. */
export function criticalCount(sys: SoSystem, N0: Map<number, number>, lambda: number): number {
  return clampedCount(sys, N0, lambda) + negativeEigenvalues(reducedStiffness(sys, scaled(N0, lambda), 'phi'));
}

const ROOT_STEP = 1e-7;

function memberClamped(m: SoSystem['members'][number], N0: Map<number, number>, lambda: number): number {
  const n = (N0.get(m.id) ?? 0) * lambda;
  if (m.truss || !(n < 0) || !(m.EI > 0)) return 0;
  return clampedModesBelow(m.L * Math.sqrt(-n / m.EI), m.hingeI, m.hingeJ);
}

function columnRank(cols: number[][], tol: number): number {
  const basis: number[][] = [];
  for (const c of [...cols].sort((a, b) => norm2(b) - norm2(a))) {
    const r = [...c];
    for (const q of basis) { const d = q.reduce((acc, v, i) => acc + v * r[i], 0); q.forEach((v, i) => { r[i] -= d * v; }); }
    const n = norm2(r);
    if (n > tol) basis.push(r.map((v) => v / n));
  }
  return basis.length;
}

/**
 * The buckling modes at a root λ with every joint still: combinations of the members' clamped
 * modes there whose end forces cancel on the free degrees of freedom.
 */
function internalModesAt(sys: SoSystem, N0: Map<number, number>, lambda: number): number {
  const lo = lambda * (1 - ROOT_STEP), hi = lambda * (1 + ROOT_STEP);
  const poles = sys.members.map((m) => ({ m, c: memberClamped(m, N0, hi) - memberClamped(m, N0, lo) })).filter((p) => p.c > 0);
  if (!poles.length) return 0;
  const at = new Map(sys.free.map((d, k) => [d, k]));
  const local = memberLocals(sys, scaled(N0, hi), 'phi');
  const cols: number[][] = [];
  let scale = 0;
  for (const { m } of poles) {
    const R = rotation(m.c, m.s);
    const k = matMul(transpose(R), matMul(local.get(m.id)!.k, R));
    const ids = memberDofs(sys, m);
    for (let b = 0; b < 6; b++) {
      const col = new Array(sys.free.length).fill(0);
      for (let a = 0; a < 6; a++) {
        scale = Math.max(scale, Math.abs(k[a][b]));
        const r = at.get(ids[a]);
        if (r !== undefined) col[r] += k[a][b];
      }
      cols.push(sys.rigid ? matVec(transpose(sys.rigid.T), col) : col);
    }
  }
  const c = poles.reduce((acc, p) => acc + p.c, 0);
  return Math.max(0, c - columnRank(cols, 1e-3 * scale));
}

/** How many of the roots at λ buckle the nodes: all of them but the internal ones. */
function nodalRootsAt(sys: SoSystem, N0: Map<number, number>, lambda: number): number {
  const total = criticalCount(sys, N0, lambda * (1 + ROOT_STEP)) - criticalCount(sys, N0, lambda * (1 - ROOT_STEP));
  return Math.max(0, total - internalModesAt(sys, N0, lambda));
}

/** λ_i with the stability functions: bisection on the count J(λ) ≥ i. `guess` is an upper estimate. Null when no λ reaches the count. */
export function phiRoot(sys: SoSystem, N0: Map<number, number>, i: number, guess: number): number | null {
  let lo = 0, hi = Math.max(guess, 1e-6);
  for (let k = 0; k < 80 && criticalCount(sys, N0, hi) < i; k++) { lo = hi; hi *= 2; }
  if (criticalCount(sys, N0, hi) < i) return null;
  for (let k = 0; k < 200 && hi - lo > 1e-11 * hi; k++) {
    const mid = (lo + hi) / 2;
    if (criticalCount(sys, N0, mid) >= i) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The mode at a root of det K(λ): the vector K(λ) nearly annihilates, by inverse iteration. At a
 * repeated root, `others` are the modes already found there (reduced coordinates), projected out.
 */
export function phiModeReduced(sys: SoSystem, N0: Map<number, number>, lambda: number, others: number[][] = []): number[] {
  const K = reducedStiffness(sys, scaled(N0, lambda * (1 - 1e-8)), 'phi');
  const deflate = (v: number[]) => {
    let w = v;
    for (let pass = 0; pass < 2; pass++) for (const o of others) {
      const c = w.reduce((s, x, i) => s + x * o[i], 0) / o.reduce((s, x) => s + x * x, 0);
      w = w.map((x, i) => x - c * o[i]);
    }
    return w;
  };
  let x = deflate(K.map((_, i) => 1 + 0.1 * Math.sin(i + 1)));
  for (let k = 0; k < 6; k++) {
    const y = solveDense(K, x);
    if (!y || y.some((v) => !Number.isFinite(v))) break;
    const z = deflate(y);
    const n = norm2(z);
    if (!(n > 0)) break;
    x = z.map((v) => v / n);
  }
  return x;
}

export function phiMode(sys: SoSystem, N0: Map<number, number>, lambda: number): number[] {
  return expand(sys, phiModeReduced(sys, N0, lambda));
}

export function phiBuckling(sys: SoSystem, nModes: number, N0: Map<number, number>, guesses: number[]): TeachingMode[] {
  const out: TeachingMode[] = [];
  const found: Array<{ lambda: number; x: number[] }> = [];
  for (let i = 1; i <= nModes; i++) {
    const lambda = phiRoot(sys, N0, i, guesses[i - 1] ?? (out[out.length - 1]?.lambda ?? 1) * 2);
    if (lambda === null) break;
    const first = out.find((o) => Math.abs(o.lambda - lambda) <= ROOT_STEP * lambda)?.lambda ?? lambda;
    const nodalSoFar = out.filter((o) => Math.abs(o.lambda - first) <= ROOT_STEP * first && !o.internal).length;
    if (nodalSoFar >= nodalRootsAt(sys, N0, first)) { out.push({ lambda, D: new Array(sys.nTotal).fill(0), internal: true }); continue; }
    const same = found.filter((f) => Math.abs(f.lambda - lambda) <= ROOT_STEP * lambda).map((f) => f.x);
    const x = phiModeReduced(sys, N0, lambda, same);
    found.push({ lambda, x });
    out.push({ lambda, D: expand(sys, x) });
  }
  return out;
}

/** det K(λ) sampled on [0, top]: its sign and log₁₀ of its size, for the curve the root is read from. */
export function determinantCurve(sys: SoSystem, N0: Map<number, number>, top: number, samples = 48): Array<{ lambda: number; sign: number; log10: number }> {
  const out: Array<{ lambda: number; sign: number; log10: number }> = [];
  for (let k = 0; k <= samples; k++) {
    const lambda = (top * k) / samples;
    out.push({ lambda, ...logDet(reducedStiffness(sys, scaled(N0, lambda), 'phi')) });
  }
  return out;
}

export function teachingBuckling(input: SolverInput, opts: SecondOrderOptions, nModes: number): { ok: true; run: TeachingBuckling } | { ok: false; reason: Txt } {
  const b = buildSystem(input, opts, opts.method === 'phi' && !opts.axialRigid);
  if (!b.ok) return b;
  const first = firstOrderAxial(b.sys);
  if (!first.ok) return first;
  const nAvail = (b.sys.rigid ? b.sys.rigid.T[0]?.length ?? 0 : b.sys.free.length);
  const count = Math.max(1, Math.min(nModes, nAvail));
  let modes: TeachingMode[];
  if (opts.method === 'phi') {
    const est = linearBuckling(b.sys, 'consistent', count, first.N0).map((m) => m.lambda * 1.0001);
    modes = phiBuckling(b.sys, Math.max(1, nModes), first.N0, est);
  } else {
    modes = linearBuckling(b.sys, opts.method === 'string' ? 'string' : 'consistent', count, first.N0);
    if (modes.length && !representsFirstMode(b.sys, first.N0, modes[0].lambda)) return { ok: false, reason: tx('course.second-order.refuse.noModeRepresented') };
  }
  if (!modes.length) return { ok: false, reason: tx('course.second-order.refuse.noPositive') };
  return { ok: true, run: { sys: b.sys, method: opts.method, N0: first.N0, N0Noise: first.noise, modes } };
}
