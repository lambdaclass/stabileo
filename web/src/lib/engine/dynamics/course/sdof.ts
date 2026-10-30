/**
 * The single degree of freedom system m·ü + c·u̇ + k·u = F(t), in closed form:
 * free vibration from u₀, v₀ in its four regimes, and the response to
 * F₀·sin(Ω·t) as transient plus steady state. Units: t, kN/m, kN, m, s.
 */

export type Regime = 'undamped' | 'underdamped' | 'critical' | 'overdamped';

export interface SdofProps {
  m: number;
  k: number;
  xi: number;
  omega: number;
  f: number;
  T: number;
  /** Critical damping 2·m·ω and the damping constant ξ·c_cr, kN·s/m. */
  cCr: number;
  c: number;
  /** Damped circular frequency ω·√(1 − ξ²); 0 outside the underdamped regime. */
  omegaD: number;
  TD: number;
  /** Logarithmic decrement 2πξ/√(1 − ξ²); NaN outside the underdamped regime. */
  logDec: number;
  regime: Regime;
}

const CRITICAL_TOL = 1e-9;

export function regimeOf(xi: number): Regime {
  if (xi <= 0) return 'undamped';
  if (Math.abs(xi - 1) <= CRITICAL_TOL) return 'critical';
  return xi < 1 ? 'underdamped' : 'overdamped';
}

export function sdofProps(m: number, k: number, xi: number): SdofProps {
  if (!(m > 0) || !(k > 0)) throw new Error('m and k must be positive');
  if (!(xi >= 0)) throw new Error('ξ must be ≥ 0');
  const omega = Math.sqrt(k / m);
  const regime = regimeOf(xi);
  const damped = regime === 'underdamped' || regime === 'undamped';
  const omegaD = damped ? omega * Math.sqrt(1 - xi * xi) : 0;
  return {
    m, k, xi, omega, f: omega / (2 * Math.PI), T: (2 * Math.PI) / omega,
    cCr: 2 * m * omega, c: 2 * xi * m * omega,
    omegaD, TD: omegaD > 0 ? (2 * Math.PI) / omegaD : Infinity,
    logDec: regime === 'underdamped' ? (2 * Math.PI * xi) / Math.sqrt(1 - xi * xi) : regime === 'undamped' ? 0 : NaN,
    regime,
  };
}

export interface FreeConstants {
  /** u(t) = e^{−ξωt}·(A·cos ω_D t + B·sin ω_D t), and its analogues in the other regimes. */
  A: number;
  B: number;
  /** Amplitude √(A² + B²) of the oscillating regimes. */
  rho: number;
}

export function freeConstants(p: SdofProps, u0: number, v0: number): FreeConstants {
  const s = p.xi * p.omega;
  let B: number;
  switch (p.regime) {
    case 'undamped': B = v0 / p.omega; break;
    case 'underdamped': B = (v0 + s * u0) / p.omegaD; break;
    case 'critical': B = v0 + p.omega * u0; break;
    case 'overdamped': B = (v0 + s * u0) / (p.omega * Math.sqrt(p.xi * p.xi - 1)); break;
  }
  return { A: u0, B, rho: Math.hypot(u0, B) };
}

/** u(t) of the free vibration from u₀, v₀. */
export function freeResponse(p: SdofProps, u0: number, v0: number): (t: number) => number {
  const { A, B } = freeConstants(p, u0, v0);
  const s = p.xi * p.omega;
  switch (p.regime) {
    case 'undamped': return (t) => A * Math.cos(p.omega * t) + B * Math.sin(p.omega * t);
    case 'underdamped': return (t) => Math.exp(-s * t) * (A * Math.cos(p.omegaD * t) + B * Math.sin(p.omegaD * t));
    case 'critical': return (t) => Math.exp(-p.omega * t) * (A + B * t);
    case 'overdamped': {
      const w = p.omega * Math.sqrt(p.xi * p.xi - 1);
      return (t) => Math.exp(-s * t) * (A * Math.cosh(w * t) + B * Math.sinh(w * t));
    }
  }
}

export interface Harmonic {
  F0: number;
  Omega: number;
  beta: number;
  /** Static displacement F₀/k. */
  ust: number;
  /** Dynamic amplification factor 1/√((1 − β²)² + (2ξβ)²); Infinity at undamped resonance. */
  D: number;
  /** Phase lag of the steady state behind the force, rad, in [0, π]. */
  phi: number;
  /** Steady-state amplitude D·F₀/k. */
  X: number;
  /** Undamped and at resonance: the steady state does not exist and the amplitude grows with t. */
  resonant: boolean;
}

export function dynamicAmplification(beta: number, xi: number): number {
  const d = Math.hypot(1 - beta * beta, 2 * xi * beta);
  return d < 1e-15 ? Infinity : 1 / d;
}

export function phaseLag(beta: number, xi: number): number {
  return Math.atan2(2 * xi * beta, 1 - beta * beta);
}

export function harmonic(p: SdofProps, F0: number, Omega: number): Harmonic {
  const beta = Omega / p.omega;
  const D = dynamicAmplification(beta, p.xi);
  const ust = F0 / p.k;
  const resonant = !Number.isFinite(D);
  return { F0, Omega, beta, ust, D, phi: phaseLag(beta, p.xi), X: resonant ? Infinity : ust * D, resonant };
}

/** The peak of D(β) and where it is: β = √(1 − 2ξ²), D = 1/(2ξ√(1 − ξ²)); none when ξ ≥ 1/√2. */
export function resonancePeak(xi: number): { beta: number; D: number } | null {
  if (xi <= 0) return { beta: 1, D: Infinity };
  if (xi >= Math.SQRT1_2) return null;
  return { beta: Math.sqrt(1 - 2 * xi * xi), D: 1 / (2 * xi * Math.sqrt(1 - xi * xi)) };
}

export interface ForcedResponse {
  steady: (t: number) => number;
  transient: (t: number) => number;
  total: (t: number) => number;
  /** The initial conditions the transient starts from: u₀ − u_p(0) and v₀ − u̇_p(0). */
  u0t: number;
  v0t: number;
}

/**
 * u(t) under F₀·sin(Ω·t) from u₀, v₀: the steady state u_p plus the free
 * vibration that makes the sum start from the given state.
 */
export function forcedResponse(p: SdofProps, h: Harmonic, u0: number, v0: number): ForcedResponse {
  let steady: (t: number) => number;
  let up0: number, vp0: number;
  if (h.resonant) {
    const a = h.F0 / (2 * p.k);
    steady = (t) => -a * p.omega * t * Math.cos(p.omega * t);
    up0 = 0; vp0 = -a * p.omega;
  } else {
    steady = (t) => h.X * Math.sin(h.Omega * t - h.phi);
    up0 = -h.X * Math.sin(h.phi); vp0 = h.X * h.Omega * Math.cos(h.phi);
  }
  const u0t = u0 - up0, v0t = v0 - vp0;
  const transient = freeResponse(p, u0t, v0t);
  return { steady, transient, total: (t) => transient(t) + steady(t), u0t, v0t };
}

export function sample(f: (t: number) => number, t1: number, n = 400): Array<[number, number]> {
  return Array.from({ length: n + 1 }, (_, i) => { const t = (t1 * i) / n; return [t, f(t)] as [number, number]; });
}

/** A time window that shows the motion: several periods of the slower of the structure and the force. */
export function timeWindow(p: SdofProps, Omega = 0): number {
  const Tf = Omega > 0 ? (2 * Math.PI) / Omega : 0;
  const decay = p.xi > 0 ? 4 / (p.xi * p.omega) : 0;
  const base = Math.max(6 * p.T, 4 * Tf);
  return Math.min(Math.max(base, Math.min(decay, 12 * p.T)), 40 * Math.max(p.T, Tf));
}
