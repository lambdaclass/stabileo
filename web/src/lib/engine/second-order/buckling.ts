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
import { buildSystem, type SecondOrderOptions, type SoSystem } from './system';
import { clampedCount, reducedStiffness, solveState } from './pdelta';
import { generalizedEigen, logDet, matVec, negativeEigenvalues, norm2, type Mat } from './dense';
import { solveDense } from '../steps/sway-modes';
import type { GeomMethod } from './member-matrices';

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
export function firstOrderAxial(sys: SoSystem): { ok: true; N0: Map<number, number> } | { ok: false; reason: Txt } {
  const lin = solveState(sys, new Map(), 'none');
  if (!lin) return { ok: false, reason: tx('course.second-order.refuse.singular') };
  if (!sys.members.some((m) => { const n = lin.N.get(m.id) ?? 0; return n < -1e-9 && n < -1e-9 * axialUncertainty(sys, m, lin); })) return { ok: false, reason: tx('course.second-order.refuse.noCompression') };
  return { ok: true, N0: lin.N };
}

function axialUncertainty(sys: SoSystem, m: SoSystem['members'][number], lin: { D: number[]; N: Map<number, number> }): number {
  if (sys.rigid) return Math.max(1e-12, ...sys.members.filter((o) => o.i === m.i || o.i === m.j || o.j === m.i || o.j === m.j).map((o) => Math.abs(lin.N.get(o.id) ?? 0)));
  const at = (node: number) => Math.hypot(lin.D[sys.dof(node, 0)], lin.D[sys.dof(node, 1)]);
  return Math.max(1e-12, (m.EA / m.L) * (at(m.i) + at(m.j)));
}

/** The eigenproblem with a geometric matrix linear in N. */
export function linearBuckling(sys: SoSystem, method: 'consistent' | 'string', nModes: number, N0: Map<number, number>): TeachingMode[] {
  const K = reducedStiffness(sys, new Map(), 'none');
  const KG = sub(reducedStiffness(sys, N0, method), K);
  const pairs = generalizedEigen(K, KG.map((r) => r.map((v) => -v)));
  if (!pairs) return [];
  return pairs.slice(0, nModes).map((p) => ({ lambda: p.lambda, D: expand(sys, p.vector) }));
}

/** J(λ): how many critical load factors lie below λ. */
export function criticalCount(sys: SoSystem, N0: Map<number, number>, lambda: number): number {
  return clampedCount(sys, N0, lambda) + negativeEigenvalues(reducedStiffness(sys, scaled(N0, lambda), 'phi'));
}

/** Whether the root at λ is a buckling of the nodes: there K(λ) gains a negative eigenvalue. */
function nodalRoot(sys: SoSystem, N0: Map<number, number>, lambda: number): boolean {
  const s = (f: number) => criticalCount(sys, N0, lambda * f) - clampedCount(sys, N0, lambda * f);
  return s(1 + 1e-7) > s(1 - 1e-7);
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
    if (!nodalRoot(sys, N0, lambda)) { out.push({ lambda, D: new Array(sys.nTotal).fill(0), internal: true }); continue; }
    const same = found.filter((f) => Math.abs(f.lambda - lambda) <= 1e-7 * lambda).map((f) => f.x);
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
  }
  if (!modes.length) return { ok: false, reason: tx('course.second-order.refuse.noPositive') };
  return { ok: true, run: { sys: b.sys, method: opts.method, N0: first.N0, modes } };
}
