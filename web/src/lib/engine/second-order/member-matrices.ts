/**
 * A plane member's stiffness in its own axes (u, v, θ at I, then at J; v a quarter turn
 * counter-clockwise from the axis), first order and second order by the three methods taught:
 *
 * - `consistent`: K_E + K_G with the consistent geometric matrix of the cubic element,
 *   N/(30L)·[36, 3L, −36, 3L; 3L, 4L², −3L, −L²; …] (6N/5L, N/10, 2NL/15, −NL/30), the one the
 *   engine uses;
 * - `string`: K_E + N/L on the two transverse translations (the chord, or P/L, matrix);
 * - `phi`: the exact matrix with the stability functions φ₁…φ₄ (`stability-functions.ts`).
 *
 * A released end (hinge) is condensed out. For the two geometric matrices it is condensed with
 * the elastic member's relation between the released rotation and the other end displacements,
 * Kc = Tᵀ(K_E + K_G)T, as the engine does; the exact matrix is condensed exactly, by its own
 * Schur complement. A truss bar has EA/L along its axis and N/L across it, whatever the method.
 */
import type { PMember } from '../steps/plane-model';
import { memberStability, type StabilityFunctions } from './stability-functions';
import { zeros, type Mat } from './dense';

export type GeomMethod = 'none' | 'consistent' | 'string' | 'phi';

export interface MemberStiffness {
  /** First-order bending and axial part, condensed. */
  ke: Mat;
  /** What the axial force adds, condensed: K − K_E. */
  kg: Mat;
  k: Mat;
  /** Released-end condensation, d_full = T·d (identity without releases). */
  T: Mat;
  phi?: StabilityFunctions;
}

const V = [1, 2, 4, 5];

export function elasticLocal(m: Pick<PMember, 'EA' | 'EI' | 'L' | 'truss'>, axial = true): Mat {
  const k = zeros(6, 6);
  const { L } = m;
  const a = axial ? m.EA / L : 0;
  k[0][0] = a; k[0][3] = -a; k[3][0] = -a; k[3][3] = a;
  if (m.truss) return k;
  const b = m.EI / L ** 3;
  const blk = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) k[V[r]][V[c]] = b * blk[r][c];
  return k;
}

function consistentKg(N: number, L: number): Mat {
  const k = zeros(6, 6);
  const q = N / (30 * L);
  const blk = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L], [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) k[V[r]][V[c]] = q * blk[r][c];
  return k;
}

function stringKg(N: number, L: number): Mat {
  const k = zeros(6, 6);
  const q = N / L;
  k[1][1] = q; k[1][4] = -q; k[4][1] = -q; k[4][4] = q;
  return k;
}

/** The exact plane beam-column matrix under N (tension positive), φ form. */
function exactLocal(m: Pick<PMember, 'EA' | 'EI' | 'L'>, N: number, axial: boolean): { k: Mat; phi: StabilityFunctions } {
  const { L, EI } = m;
  const f = memberStability(N, EI, L);
  const k = zeros(6, 6);
  const a = axial ? m.EA / L : 0;
  k[0][0] = a; k[0][3] = -a; k[3][0] = -a; k[3][3] = a;
  const b = EI / L ** 3;
  const k11 = 12 * f.phi1, k12 = 6 * L * f.phi2, k22 = 4 * L * L * f.phi3, k24 = 2 * L * L * f.phi4;
  const blk = [[k11, k12, -k11, k12], [k12, k22, -k12, k24], [-k11, -k12, k11, -k12], [k12, k24, -k12, k22]];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) k[V[r]][V[c]] = b * blk[r][c];
  return { k, phi: f };
}

/** T with the released rotations written from the other end displacements by K's own rows. */
export function condensation(K: Mat, released: number[]): Mat {
  const T = zeros(6, 6);
  const kept = [0, 1, 2, 3, 4, 5].filter((d) => !released.includes(d));
  for (const d of kept) T[d][d] = 1;
  if (!released.length) return T;
  if (released.length === 1) {
    const r = released[0];
    for (const d of kept) T[r][d] = -K[r][d] / K[r][r];
    return T;
  }
  const [r1, r2] = released;
  const a = K[r1][r1], b = K[r1][r2], c = K[r2][r1], dd = K[r2][r2];
  const det = a * dd - b * c;
  for (const d of kept) {
    const f1 = -K[r1][d], f2 = -K[r2][d];
    T[r1][d] = (dd * f1 - b * f2) / det;
    T[r2][d] = (a * f2 - c * f1) / det;
  }
  return T;
}

function tkt(K: Mat, T: Mat): Mat {
  const out = zeros(6, 6);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    let s = 0;
    for (let a = 0; a < 6; a++) {
      if (T[a][i] === 0) continue;
      for (let b = 0; b < 6; b++) if (T[b][j] !== 0) s += T[a][i] * K[a][b] * T[b][j];
    }
    out[i][j] = s;
  }
  return out;
}

const sub = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((v, j) => v - B[i][j]));
const add = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((v, j) => v + B[i][j]));

export const releasedOf = (m: Pick<PMember, 'truss' | 'hingeI' | 'hingeJ'>): number[] =>
  m.truss ? [] : [...(m.hingeI ? [2] : []), ...(m.hingeJ ? [5] : [])];

/**
 * The member's condensed local stiffness under the axial force N (tension positive).
 * `axial: false` drops EA/L: the bar is axially rigid and its length is held by a constraint.
 */
export function memberStiffness(m: PMember, N: number, method: GeomMethod, axial = true): MemberStiffness {
  const ke0 = elasticLocal(m, axial);
  if (m.truss) {
    const kg = method === 'none' ? zeros(6, 6) : stringKg(N, m.L);
    const T = condensation(ke0, []);
    return { ke: ke0, kg, k: add(ke0, kg), T };
  }
  const released = releasedOf(m);
  if (method === 'phi') {
    const { k: kx, phi } = exactLocal(m, N, axial);
    const T = condensation(kx, released);
    const Te = condensation(elasticLocal(m, true), released);
    const ke = tkt(ke0, Te);
    const k = tkt(kx, T);
    return { ke, kg: sub(k, ke), k, T, phi };
  }
  const T = condensation(elasticLocal(m, true), released);
  const ke = tkt(ke0, T);
  const g = method === 'consistent' ? consistentKg(N, m.L) : method === 'string' ? stringKg(N, m.L) : zeros(6, 6);
  const kg = tkt(g, T);
  return { ke, kg, k: add(ke, kg), T };
}

/** The unit geometric matrix (N = 1) of a method, condensed: K_G(N) = N·G for the two linear methods. */
export function unitGeometric(m: PMember, method: 'consistent' | 'string'): Mat {
  return memberStiffness(m, 1, method).kg;
}

/** Global ← local rotation: d_local = R·d_global. */
export function rotation(c: number, s: number): Mat {
  const R = zeros(6, 6);
  for (const o of [0, 3]) {
    R[o][o] = c; R[o][o + 1] = s;
    R[o + 1][o] = -s; R[o + 1][o + 1] = c;
    R[o + 2][o + 2] = 1;
  }
  return R;
}
