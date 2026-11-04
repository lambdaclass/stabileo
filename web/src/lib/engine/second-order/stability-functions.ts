/**
 * Stability functions of a prismatic beam-column: the exact bending stiffness of a member that
 * carries an axial force P along it.
 *
 * With u = kL = L·√(|P|/EI) and ρ = P/P_E (P_E = π²EI/L², compression positive), the member's
 * end stiffnesses are those of the first-order member multiplied by
 *
 *   φ₃ = s/4,  φ₄ = s·c/2,  φ₂ = s(1 + c)/6,  φ₁ = [2s(1 + c) − u²]/12
 *
 * s and c the classical rotational stiffness and carry-over functions. In compression
 *   s = u(sin u − u cos u)/(2 − 2cos u − u sin u),  c = (u − sin u)/(sin u − u cos u)
 * and in tension the same with the hyperbolic functions. All four φ are 1 when P = 0.
 *
 * Every quantity is written through x = π²ρ (u² in compression, −u² in tension): the series in x
 * are the same on both branches, so near P = 0, where the closed forms lose every digit to
 * cancellation, the series are used and the two branches meet continuously.
 */

export interface StabilityFunctions {
  /** P/P_E, compression positive. */
  rho: number;
  /** kL = π·√|ρ|. */
  u: number;
  s: number;
  c: number;
  sc: number;
  phi1: number;
  phi2: number;
  phi3: number;
  phi4: number;
}

const SERIES_LIMIT = 2;
const TERMS = 24;

function factorials(n: number): number[] {
  const f = [1];
  for (let k = 1; k <= n; k++) f.push(f[k - 1] * k);
  return f;
}
const FACT = factorials(2 * TERMS + 4);

/** A = (sin u − u cos u)/u³, B = (u − sin u)/u³, D = (2 − 2cos u − u sin u)/u⁴, as functions of x. */
function abd(x: number): { A: number; B: number; D: number } {
  if (Math.abs(x) < SERIES_LIMIT) {
    let A = 0, B = 0, D = 0;
    let p = 1;
    for (let k = 1; k <= TERMS; k++) {
      A += (2 * k * p) / FACT[2 * k + 1];
      B += p / FACT[2 * k + 1];
      D += (2 * k * p) / FACT[2 * k + 2];
      p *= -x;
    }
    return { A, B, D };
  }
  if (x > 0) {
    const u = Math.sqrt(x);
    const sn = Math.sin(u), cs = Math.cos(u);
    return { A: (sn - u * cs) / u ** 3, B: (u - sn) / u ** 3, D: (2 - 2 * cs - u * sn) / u ** 4 };
  }
  const u = Math.sqrt(-x);
  const e = Math.exp(-u), e2 = e * e;
  const ch = (1 + e2) / 2, sh = (1 - e2) / 2;
  return { A: (u * ch - sh) / u ** 3, B: (sh - u * e) / u ** 3, D: (u * sh - 2 * ch + 2 * e) / u ** 4 };
}

/**
 * The stability functions at ρ = P/P_E (compression positive). In tension the hyperbolic
 * branch is scaled by e^(−u), so the ratios stay finite for any tension.
 */
export function stabilityFunctions(rho: number): StabilityFunctions {
  const x = Math.PI * Math.PI * rho;
  const u = Math.sqrt(Math.abs(x));
  const { A, B, D } = abd(x);
  const s = A / D;
  const sc = B / D;
  const c = B / A;
  return {
    rho, u, s, c, sc,
    phi1: (2 * (s + sc) - x) / 12,
    phi2: (s + sc) / 6,
    phi3: s / 4,
    phi4: sc / 2,
  };
}

/** The φ functions of a member of bending stiffness EI and length L under N (tension positive). */
export function memberStability(N: number, EI: number, L: number): StabilityFunctions {
  const PE = (Math.PI * Math.PI * EI) / (L * L);
  return stabilityFunctions(PE > 0 ? -N / PE : 0);
}

/** Roots of tan z = z, z > 0, below `limit`. */
function tanRootsBelow(limit: number): number {
  let count = 0;
  for (let k = 1; ; k++) {
    let z = (k + 0.5) * Math.PI - 0.1;
    for (let it = 0; it < 50; it++) {
      const f = Math.tan(z) - z;
      const df = 1 / Math.cos(z) ** 2 - 1;
      const step = f / df;
      z -= step;
      if (Math.abs(step) < 1e-14 * z) break;
    }
    if (z >= limit) return count;
    count++;
  }
}

/**
 * How many buckling loads of the member with all its connected ends held lie below u = kL:
 * the J₀ of the Wittrick–Williams count. Both ends rigid: u = 2π, 4π, … and tan(u/2) = u/2;
 * one end released: tan u = u; both released: u = π, 2π, …
 */
export function clampedModesBelow(u: number, hingeI: boolean, hingeJ: boolean): number {
  if (!(u > 0)) return 0;
  if (hingeI && hingeJ) return Math.floor(u / Math.PI - 1e-12);
  if (hingeI || hingeJ) return tanRootsBelow(u);
  return Math.floor(u / (2 * Math.PI) - 1e-12) + tanRootsBelow(u / 2);
}
