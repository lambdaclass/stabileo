/**
 * Element mass matrices of a plane bar and the static condensation of a
 * stiffness and mass pair onto chosen master degrees of freedom.
 *
 * Mass per length ρA in t/m. The consistent matrices are the engine's
 * (solver/mass_matrix.rs): a frame member with an end release takes half its
 * mass at each end, translations only, as the engine does.
 */
import { type Mat, zeros, pick, solveMany, matMul, transpose, congruence, identity } from './dense';

export type MassModel = 'lumped' | 'consistent' | 'guyan';

/** ρAL/2 on each end translation, nothing on the rotations (local order u₁ v₁ θ₁ u₂ v₂ θ₂). */
export function lumpedFrameMass(rhoA: number, L: number): Mat {
  const m = zeros(6);
  const h = (rhoA * L) / 2;
  m[0][0] = m[1][1] = m[3][3] = m[4][4] = h;
  return m;
}

/** The consistent 6×6 matrix ρAL/420·[…] of a prismatic Euler-Bernoulli member. */
export function consistentFrameMass(rhoA: number, L: number): Mat {
  const c = (rhoA * L) / 420;
  const a = [
    [140, 0, 0, 70, 0, 0],
    [0, 156, 22 * L, 0, 54, -13 * L],
    [0, 22 * L, 4 * L * L, 0, 13 * L, -3 * L * L],
    [70, 0, 0, 140, 0, 0],
    [0, 54, 13 * L, 0, 156, -22 * L],
    [0, -13 * L, -3 * L * L, 0, -22 * L, 4 * L * L],
  ];
  return a.map((r) => r.map((v) => v * c));
}

/** A truss bar, global order u₁ w₁ u₂ w₂: ρAL/2 on each translation, or ρAL/6·[2 1; 1 2] per direction. */
export function trussMass(rhoA: number, L: number, consistent: boolean): Mat {
  const m = zeros(4);
  if (!consistent) {
    const h = (rhoA * L) / 2;
    for (let i = 0; i < 4; i++) m[i][i] = h;
    return m;
  }
  const c = (rhoA * L) / 6;
  for (let d = 0; d < 2; d++) {
    m[d][d] = m[d + 2][d + 2] = 2 * c;
    m[d][d + 2] = m[d + 2][d] = c;
  }
  return m;
}

export interface Condensation {
  /** Indices of the kept (master) and condensed (slave) degrees of freedom in the full system. */
  masters: number[];
  slaves: number[];
  Kmm: Mat; Kms: Mat; Ksm: Mat; Kss: Mat;
  /** −K_ss⁻¹·K_sm: how the slaves follow the masters when no force acts on them. */
  Ts: Mat;
  /** T = [I; −K_ss⁻¹·K_sm] in master-then-slave order. */
  T: Mat;
  K: Mat;
  M: Mat;
  F: number[];
}

/**
 * K_red = K_mm − K_ms·K_ss⁻¹·K_sm, M_red = Tᵀ·M·T, F_red = Tᵀ·F, with M and F
 * reordered master-then-slave. Exact for the stiffness; for the mass it is
 * exact when the slaves carry none.
 */
export function condense(K: Mat, M: Mat, F: number[], masters: number[]): Condensation {
  const all = K.map((_, i) => i);
  const slaves = all.filter((i) => !masters.includes(i));
  const Kmm = pick(K, masters, masters), Kms = pick(K, masters, slaves), Ksm = pick(K, slaves, masters), Kss = pick(K, slaves, slaves);
  const Ts = slaves.length ? solveMany(Kss, Ksm).map((r) => r.map((v) => -v)) : [];
  const T = [...identity(masters.length), ...Ts];
  const order = [...masters, ...slaves];
  const Mo = pick(M, order, order);
  const Fo = order.map((i) => F[i]);
  const Kred = slaves.length ? Kmm.map((r, i) => r.map((v, j) => v + Kms[i].reduce((s, kms, k) => s + kms * Ts[k][j], 0))) : Kmm;
  const Mred = congruence(T, Mo);
  const Fred = matMul(transpose(T), Fo.map((v) => [v])).map((r) => r[0]);
  const sym = (a: Mat) => a.map((r, i) => r.map((v, j) => (v + a[j][i]) / 2));
  return { masters, slaves, Kmm, Kms, Ksm, Kss, Ts, T, K: sym(Kred), M: sym(Mred), F: Fred };
}
