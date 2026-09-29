/**
 * A ground motion compatible with a design spectrum: an artificial accelerogram whose 5 %-damped
 * response spectrum follows the target (the INPRES-CIRSOC 103 elastic spectrum, or any Sa(T)).
 *
 * The classic construction: a sum of sinusoids at frequencies spread over the band of interest,
 * random phases from a seed (so the same seed gives the same record), under a trapezoidal
 * intensity envelope with an exponential decay; then the amplitudes are corrected, a few times
 * over, by the ratio of the target to the response spectrum the record actually has. The
 * response spectrum is computed exactly as the one it is compared with would be: an elastic
 * single degree of freedom at each period, Newmark average acceleration, pseudo-acceleration
 * ω²·|u|max.
 *
 * Pure.
 */

const G = 9.80665;

export interface CompatibleOptions {
  /** Target pseudo-acceleration, g, at period T (s). */
  target: (period: number) => number;
  duration: number;
  dt: number;
  seed?: number;
  /** Damping of the spectrum matched, default 0,05. */
  xi?: number;
  iterations?: number;
  /** Periods matched, s. Default 0,05 to 4 s, 60 of them, log-spaced. */
  periods?: number[];
}

export interface CompatibleRecord {
  /** m/s², at k·dt. */
  accel: number[];
  dt: number;
  periods: number[];
  /** The record's own response spectrum, g, at `periods`. */
  achieved: number[];
  target: number[];
}

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pseudo-acceleration response spectrum of `accel` (m/s², step dt), in g. */
export function responseSpectrum(accel: number[], dt: number, periods: number[], xi = 0.05): number[] {
  return periods.map((T) => {
    const w = (2 * Math.PI) / T;
    const k = w * w, c = 2 * xi * w;
    // Newmark average acceleration, unit mass: ü + c·u̇ + k·u = −a_g.
    const beta = 0.25, gamma = 0.5;
    const kh = k + gamma / (beta * dt) * c + 1 / (beta * dt * dt);
    let u = 0, v = 0, acc = -accel[0]!;
    let umax = 0;
    for (let i = 1; i < accel.length; i++) {
      const p = -accel[i]!
        + (u / (beta * dt * dt) + v / (beta * dt) + (1 / (2 * beta) - 1) * acc)
        + c * (gamma / (beta * dt) * u + (gamma / beta - 1) * v + dt * (gamma / (2 * beta) - 1) * acc);
      const un = p / kh;
      const an = (un - u) / (beta * dt * dt) - v / (beta * dt) - (1 / (2 * beta) - 1) * acc;
      const vn = v + dt * ((1 - gamma) * acc + gamma * an);
      u = un; v = vn; acc = an;
      if (Math.abs(u) > umax) umax = Math.abs(u);
    }
    return (k * umax) / G;
  });
}

/** Trapezoid with exponential decay: ramp to 15 % of the duration, strong to 55 %, then decay. */
function envelope(t: number, D: number): number {
  const t1 = 0.15 * D, t2 = 0.55 * D;
  if (t < t1) return (t / t1) ** 2;
  if (t <= t2) return 1;
  return Math.exp(-3 * ((t - t2) / (D - t2)));
}

export function spectrumCompatible(o: CompatibleOptions): CompatibleRecord {
  const xi = o.xi ?? 0.05;
  const periods = o.periods ?? Array.from({ length: 60 }, (_, i) => 0.05 * Math.pow(4 / 0.05, i / 59));
  const target = periods.map((T) => o.target(T));
  const n = Math.max(2, Math.round(o.duration / o.dt) + 1);
  const rand = rng(o.seed ?? 1);
  // Several sinusoids per matched period, spread between its neighbours, so the energy is not
  // concentrated on single lines; the phases drawn once.
  const PER = 4;
  const lnT = periods.map(Math.log);
  const w: number[] = [], owner: number[] = [], phase: number[] = [];
  periods.forEach((_, k) => {
    const lo = k > 0 ? (lnT[k - 1]! + lnT[k]!) / 2 : lnT[k]! - (lnT[1]! - lnT[0]!) / 2;
    const hi = k < periods.length - 1 ? (lnT[k]! + lnT[k + 1]!) / 2 : lnT[k]! + (lnT[k]! - lnT[k - 1]!) / 2;
    for (let j = 0; j < PER; j++) {
      const T = Math.exp(lo + ((j + rand()) / PER) * (hi - lo));
      w.push((2 * Math.PI) / T); owner.push(k); phase.push(2 * Math.PI * rand());
    }
  });
  let amp = w.map((_, i) => target[owner[i]!]! * G * 0.05);
  const build = () => {
    const a = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const t = i * o.dt;
      let s = 0;
      for (let k = 0; k < w.length; k++) s += amp[k]! * Math.sin(w[k]! * t + phase[k]!);
      a[i] = envelope(t, o.duration) * s;
    }
    // Baseline: no mean acceleration, so the ground does not drift away at the end.
    const mean = a.reduce((x, y) => x + y, 0) / n;
    for (let i = 0; i < n; i++) a[i] = a[i]! - mean * envelope(i * o.dt, o.duration);
    return a;
  };
  let accel = build();
  let achieved = responseSpectrum(accel, o.dt, periods, xi);
  let best = { accel, achieved, err: Infinity };
  for (let it = 0; it < (o.iterations ?? 16); it++) {
    // The ratio smoothed over neighbouring periods, applied with a little relaxation: a period's
    // response depends on its neighbours' sinusoids too, and a raw correction oscillates.
    const ratio = achieved.map((a, k) => (a > 1e-12 ? target[k]! / a : 1));
    const smooth = ratio.map((_, k) => {
      const ks = [k - 1, k, k + 1].filter((x) => x >= 0 && x < ratio.length);
      return ks.reduce((p, x) => p * ratio[x]!, 1) ** (1 / ks.length);
    });
    amp = amp.map((a, i) => a * Math.pow(0.5 * ratio[owner[i]!]! + 0.5 * smooth[owner[i]!]!, 0.9));
    accel = build();
    achieved = responseSpectrum(accel, o.dt, periods, xi);
    const err = Math.max(...achieved.map((a, k) => Math.abs(a / target[k]! - 1)));
    if (err < best.err) best = { accel, achieved, err };
  }
  accel = best.accel; achieved = best.achieved;
  return { accel, dt: o.dt, periods, achieved, target };
}
