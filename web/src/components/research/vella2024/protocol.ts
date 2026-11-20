export type Settings = {
  alpha: number;
  n: number;
  slenderness: number;
  rate: number;
  start: number;
  oneEnd: boolean;
  ramp: number;
  imperfection: number;
  phase: number;
  dt: number;
  hht: number;
  after: number;
};

export type Frame = { t: number; mu: number; theta: number; height: number; x: number[]; z: number[] };

export type SnapRun = {
  settings: Settings;
  critical: { muA: number; muStar: number; heightA: number; heightStar: number };
  frames: Frame[];
  trace: { t: number[]; mu: number[]; thetaMin: number[]; thetaMax: number[]; height: number[] };
  outcome: {
    snapped: boolean; tSnap: number; muSnap: number; tEnd: number; thetaBefore: number; thetaDuring: number;
    amplification: number; amplificationFromMuA: number; steps: number; newtonIterations: number;
  };
  mode: { x: number[]; z: number[]; dx: number[]; dz: number[] };
  rateMS: number;
};

/** An amplification at or above this is called an asymmetric snap (our threshold, not the paper's). */
export const ASYMMETRIC = 2;
export const RATE_RANGE = [0.005, 0.7] as const;
export const SEED_RANGE = [1e-4, 1e-2] as const;
export const ALPHA_RANGE = [0.1, 0.4] as const;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numbers = (a: unknown, length?: number) => Array.isArray(a) && a.every(finite) && (length === undefined || a.length === length);

export function decodeRun(value: unknown): SnapRun {
  const r = value as SnapRun & { rate_m_s?: number; rateMS?: number };
  const s = r?.settings;
  if (!s || !(['alpha', 'slenderness', 'rate', 'start', 'ramp', 'imperfection', 'phase', 'dt', 'hht', 'after'] as const).every(k => finite(s[k]))
    || !Number.isInteger(s.n) || s.n < 4 || typeof s.oneEnd !== 'boolean') throw new Error('Invalid snap-through settings');
  const nodes = s.n + 1;
  const c = r.critical;
  if (!c || ![c.muA, c.muStar, c.heightA, c.heightStar].every(finite) || !(c.muA > c.muStar)) throw new Error('Invalid critical points');
  if (!Array.isArray(r.frames) || r.frames.length < 2 || !r.frames.every(f => [f.t, f.mu, f.theta, f.height].every(finite) && numbers(f.x, nodes) && numbers(f.z, nodes))) throw new Error('Invalid frames');
  const t = r.trace;
  const k = t?.t?.length ?? 0;
  if (!k || !(['t', 'mu', 'thetaMin', 'thetaMax', 'height'] as const).every(key => numbers(t[key], k))) throw new Error('Invalid trace');
  const o = r.outcome;
  if (!o || typeof o.snapped !== 'boolean' || ![o.thetaBefore, o.thetaDuring, o.amplification].every(finite)) throw new Error('Invalid outcome');
  const m = r.mode;
  if (!m || !(['x', 'z', 'dx', 'dz'] as const).every(key => numbers(m[key], nodes))) throw new Error('Invalid mode');
  const rateMS = (r as { rate_m_s?: number }).rate_m_s ?? r.rateMS;
  if (!finite(rateMS)) throw new Error('Invalid rate');
  return { settings: s, critical: c, frames: r.frames, trace: t, outcome: o, mode: m, rateMS };
}

/** Rest positions (a flat strip of unit length) and the cells of the n elements. */
export function restGeometry(n: number) {
  return {
    xy: Array.from({ length: n + 1 }, (_, i) => [i / n, 0]).flat(),
    cells: Array.from({ length: n }, (_, i) => [i, i + 1]).flat(),
  };
}

/** The strip's vertical mirror asymmetry at each node, z(x) − z(1 − x). */
export function asymmetry(z: number[]): number[] {
  const n = z.length - 1;
  return z.map((v, i) => v - z[n - i]);
}

export function displacementOf(x: number[], z: number[]): number[] {
  const n = x.length - 1;
  return x.flatMap((xi, i) => [xi - i / n, z[i]]);
}

export const sameSettings = (a: Settings, b: Settings) =>
  (Object.keys(a) as (keyof Settings)[]).every(k => (typeof a[k] === 'number' ? Math.abs((a[k] as number) - (b[k] as number)) <= 1e-12 * Math.max(1, Math.abs(a[k] as number)) : a[k] === b[k]));

/** Slider positions are logarithmic in the rate and in the seed. */
export const logStep = (range: readonly [number, number], steps: number, value: number) =>
  Math.round((Math.log(value / range[0]) / Math.log(range[1] / range[0])) * steps);
export const logValue = (range: readonly [number, number], steps: number, step: number) => {
  const v = range[0] * Math.pow(range[1] / range[0], step / steps);
  const digits = Math.max(0, 2 - Math.floor(Math.log10(v)));
  return Number(v.toFixed(digits));
};

/** Index of the frame shown at the snap: the first with the midpoint above the line of the clamps. */
export const snapFrame = (run: SnapRun) => Math.max(0, run.frames.findIndex(f => f.height > 0));

export function parseFigure(csv: string) {
  const rows = csv.trim().split('\n').slice(1).map(l => l.split(','));
  const take = (series: string) => rows.filter(r => r[0] === series).map(r => [Number(r[1]), Number(r[2])] as [number, number]).filter(p => p.every(Number.isFinite));
  return { simulation: take('simulation'), experiment: take('experiment') };
}
