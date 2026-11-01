/**
 * Modal decomposition of M·ü + C·u̇ + K·u = F·g(t): the eigenproblem
 * (K − ω²M)·φ = 0, the orthogonality of the modes, the generalized masses,
 * stiffnesses and forces, the uncoupled single degree of freedom equations
 * and their superposition u(t) = Σ φᵢ·qᵢ(t); and a direct step-by-step
 * integration of the coupled system to compare with.
 *
 * Damping is modal: the same ξ in every mode.
 */
import { type Mat, generalizedEigen, transpose, matMul, matVec, dot, solve, inverse, column, maxAbs } from './dense';
import { sdofProps, harmonic, forcedResponse, freeResponse, type SdofProps, type Harmonic } from './sdof';
import type { DofRef } from './mdof-system';

export interface Mode {
  omega: number;
  f: number;
  T: number;
  /** The shape scaled so its largest component is 1. */
  phi: number[];
  /** Generalized mass and stiffness φᵀMφ, φᵀKφ of that shape. */
  Mg: number;
  Kg: number;
  /** Participation φᵀMr/φᵀMφ and effective mass (φᵀMr)²/φᵀMφ, horizontal (x) and vertical (z). */
  gammaX: number;
  gammaZ: number;
  meffX: number;
  meffZ: number;
}

export interface ModalSolution {
  modes: Mode[];
  /** Φ with the modes as columns (max-normalized). */
  Phi: Mat;
  /** ΦᵀMΦ and ΦᵀKΦ: diagonal, up to round-off. */
  PtMP: Mat;
  PtKP: Mat;
  /** Largest off-diagonal of each, as a share of its diagonal. */
  offM: number;
  offK: number;
  totalMassX: number;
  totalMassZ: number;
}

export function influence(dofs: readonly DofRef[], dir: 'ux' | 'uz'): number[] {
  return dofs.map((d) => (d.dir === dir ? 1 : 0));
}

function offDiagonal(a: Mat): number {
  let off = 0, diag = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) {
    if (i === j) diag = Math.max(diag, Math.abs(a[i][i])); else off = Math.max(off, Math.abs(a[i][j]));
  }
  return diag > 0 ? off / diag : 0;
}

export function modalSolve(K: Mat, M: Mat, dofs: readonly DofRef[]): ModalSolution {
  const { lambda, phi } = generalizedEigen(K, M);
  const rx = influence(dofs, 'ux'), rz = influence(dofs, 'uz');
  const Mrx = matVec(M, rx), Mrz = matVec(M, rz);
  const cols: number[][] = [];
  const modes: Mode[] = lambda.map((lam, i) => {
    const raw = column(phi, i);
    const big = maxAbs(raw);
    let s = raw.find((v) => Math.abs(v) === big) ?? 1;
    if (s === 0) s = 1;
    const v = raw.map((x) => x / s);
    cols.push(v);
    const Mg = dot(v, matVec(M, v)), Kg = dot(v, matVec(K, v));
    const omega = Math.sqrt(Math.max(lam, 0));
    const lx = dot(v, Mrx), lz = dot(v, Mrz);
    return { omega, f: omega / (2 * Math.PI), T: omega > 0 ? (2 * Math.PI) / omega : Infinity, phi: v, Mg, Kg, gammaX: lx / Mg, gammaZ: lz / Mg, meffX: (lx * lx) / Mg, meffZ: (lz * lz) / Mg };
  });
  const Phi = transpose(cols);
  const PtMP = matMul(transpose(Phi), matMul(M, Phi));
  const PtKP = matMul(transpose(Phi), matMul(K, Phi));
  return { modes, Phi, PtMP, PtKP, offM: offDiagonal(PtMP), offK: offDiagonal(PtKP), totalMassX: dot(rx, Mrx), totalMassZ: dot(rz, Mrz) };
}

export type Excitation =
  | { kind: 'free'; u0: number[]; v0: number[] }
  | { kind: 'harmonic'; F: number[]; Omega: number; u0?: number[]; v0?: number[] };

export interface ModalResponse {
  /** Modal initial conditions qᵢ(0), q̇ᵢ(0) and generalized force amplitude Pᵢ = φᵢᵀF. */
  q0: number[];
  qd0: number[];
  P: number[];
  sdof: SdofProps[];
  harmonics: Array<Harmonic | null>;
  /** qᵢ(t) of each mode. */
  q: Array<(t: number) => number>;
  /** u(t) = Σ φᵢ·qᵢ(t). */
  u: (t: number) => number[];
}

export function modalResponse(sol: ModalSolution, M: Mat, xi: number, ex: Excitation): ModalResponse {
  const n = sol.modes.length;
  const zero = new Array<number>(n).fill(0);
  const u0 = ex.u0 ?? new Array(M.length).fill(0), v0 = ex.v0 ?? new Array(M.length).fill(0);
  const Mu0 = matVec(M, u0), Mv0 = matVec(M, v0);
  const q0 = sol.modes.map((m) => dot(m.phi, Mu0) / m.Mg);
  const qd0 = sol.modes.map((m) => dot(m.phi, Mv0) / m.Mg);
  const P = ex.kind === 'harmonic' ? sol.modes.map((m) => dot(m.phi, ex.F)) : zero;
  const sdof = sol.modes.map((m) => sdofProps(m.Mg, m.Kg, xi));
  const harmonics = sdof.map((p, i) => (ex.kind === 'harmonic' ? harmonic(p, P[i], ex.Omega) : null));
  const q = sdof.map((p, i) => {
    const h = harmonics[i];
    return h ? forcedResponse(p, h, q0[i], qd0[i]).total : freeResponse(p, q0[i], qd0[i]);
  });
  const u = (t: number) => {
    const qs = q.map((f) => f(t));
    return sol.Phi.map((row) => dot(row, qs));
  };
  return { q0, qd0, P, sdof, harmonics, q, u };
}

/** C = M·Φ·diag(2ξωᵢ/Mᵢ)·Φᵀ·M: the damping matrix that gives every mode the ratio ξ. */
export function modalDampingMatrix(sol: ModalSolution, M: Mat, xi: number): Mat {
  const MP = matMul(M, sol.Phi);
  const d = sol.modes.map((m) => (2 * xi * m.omega) / m.Mg);
  return MP.map((ri) => MP.map((rj) => ri.reduce((s, v, k) => s + v * d[k] * rj[k], 0)));
}

/**
 * The coupled system integrated directly, Newmark's average acceleration
 * (β = 1/4, γ = 1/2), from u₀, v₀. Returns u at the requested times.
 */
export function directIntegration(K: Mat, M: Mat, C: Mat, force: (t: number) => number[], u0: number[], v0: number[], times: readonly number[], dt: number): number[][] {
  const n = K.length;
  const a1 = 4 / (dt * dt), a2 = 2 / dt;
  const KeffInv = inverse(K.map((r, i) => r.map((v, j) => v + a1 * M[i][j] + a2 * C[i][j])));
  let u = [...u0], v = [...v0];
  const f0 = force(0);
  let a = solve(M, f0.map((fi, i) => fi - dot(C[i], v) - dot(K[i], u)));
  const out: number[][] = [];
  let t = 0, k = 0;
  const tEnd = times[times.length - 1] ?? 0;
  while (k < times.length && times[k] <= 1e-12) { out.push([...u]); k++; }
  while (t < tEnd - 1e-12 && k < times.length) {
    const tn = t + dt;
    const fn = force(tn);
    const rhs = fn.map((fi, i) => {
      let s = fi;
      for (let j = 0; j < n; j++) {
        s += M[i][j] * (a1 * u[j] + (4 / dt) * v[j] + a[j]);
        s += C[i][j] * (a2 * u[j] + v[j]);
      }
      return s;
    });
    const un = matVec(KeffInv, rhs);
    const an = un.map((x, i) => a1 * (x - u[i]) - (4 / dt) * v[i] - a[i]);
    const vn = v.map((x, i) => x + (dt / 2) * (a[i] + an[i]));
    while (k < times.length && times[k] <= tn + 1e-12) {
      const w = (times[k] - t) / dt;
      out.push(u.map((x, i) => x + w * (un[i] - x)));
      k++;
    }
    u = un; v = vn; a = an; t = tn;
  }
  return out;
}
