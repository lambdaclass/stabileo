export type Side = 'intrados' | 'extrados';
export type FrameKind = 'bisection' | 'least' | 'load' | 'collapse' | 'mechanism';
export type ArchFrame = { kind: FrameKind; t: number; lambda: number; s: number; feasible: boolean; tau: number; e: number[] };
export type ArchHinge = { joint: number; side: Side; angle: number };
export type ArchBody = { from: number; to: number; centre: [number, number]; omega: number };
export type Weights = 'true' | 'centreline';
export type ArchRun = {
  case: 'self-weight' | 'point-load';
  alpha: number; n: number; weights: Weights; r: number; d: number; gamma: number; t_max: number;
  position?: number; load?: { x: number; y: number; block: number };
  result: {
    eta?: number; beta?: number; h: number; hinges: ArchHinge[];
    lambda?: number; lambda_kinematic?: number | null;
  };
  bodies: ArchBody[];
  frames: ArchFrame[];
};

const finite = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export function decodeRun(value: unknown): ArchRun {
  const r = value as ArchRun;
  if (!r || !['self-weight', 'point-load'].includes(r.case) || !Number.isInteger(r.n) || r.n < 2
    || ![r.alpha, r.r, r.t_max].every(Number.isFinite) || !Array.isArray(r.frames) || r.frames.length < 1
    || !r.frames.every(f => [f.t, f.lambda, f.s, f.tau].every(Number.isFinite) && typeof f.feasible === 'boolean' && finite(f.e, r.n + 1))
    || !Array.isArray(r.bodies) || !r.result || !Array.isArray(r.result.hinges)) throw new Error('Invalid arch result');
  return r;
}

export type SolverOutcome = { result: ArchRun } | { error: 'infeasible' | 'unbounded' | 'solver' };

/** What the worker reports for the solver's JSON: a run, or why there is none. */
export function solverOutcome(out: { error?: unknown }): SolverOutcome {
  if (out.error === 'Infeasible') return { error: 'infeasible' };
  if (out.error === 'Unbounded') return { error: 'unbounded' };
  if (out.error) return { error: 'solver' };
  try {
    return { result: decodeRun(out) };
  } catch {
    return { error: 'solver' };
  }
}

export type WeightSettings = { alpha: number; n: number; centreline: boolean };
export type LoadSettings = { n: number; t: number; position: number };
export const PAPER_WEIGHT: WeightSettings = { alpha: 90, n: 101, centreline: false };
export const PAPER_LOAD: LoadSettings = { n: 31, t: 0.3, position: 0.25 };
export const RING_INNER_RADIUS = 2.35;
export const KINEMATIC_MAX = 40;

export const weightOf = (r: ArchRun): WeightSettings => ({ alpha: r.alpha, n: r.n, centreline: r.weights === 'centreline' });
export const loadOf = (r: ArchRun): LoadSettings => ({ n: r.n, t: r.t_max, position: r.position ?? 0 });
export const sameWeight = (a: WeightSettings, b: WeightSettings) => a.alpha === b.alpha && a.n === b.n && a.centreline === b.centreline;
export const sameLoad = (a: LoadSettings, b: LoadSettings) => a.n === b.n && Math.abs(a.t - b.t) < 1e-9 && Math.abs(a.position - b.position) < 1e-9;

export const FIGURE = { stone: [0.333, 0.27], line: -1, outside: 1, hinge: 0.9, load: 0.667, support: -0.333, ground: -0.333 } as const;
export const MOTION_GAIN = 1.6;
const HINGE_FRAMES: ReadonlySet<FrameKind> = new Set(['least', 'collapse', 'mechanism']);

type Point = [number, number];

function frameGeometry(run: ArchRun) {
  const alpha = (run.alpha * Math.PI) / 180;
  const reach = (run.r + run.t_max / 2) * (run.alpha >= 90 ? 1 : Math.sin(alpha));
  const size = 2 * reach;
  const phi0 = Math.PI / 2 - alpha;
  const springY = Math.min(...[run.r - run.t_max / 2, run.r + run.t_max / 2].map(rho => rho * Math.sin(phi0)));
  const base = springY - 0.12 * size;
  return { alpha, size, base, ground: reach + 0.12 * size, line: 0.008 * size, hatch: 0.04 * size, marker: 0.042 * size, arrow: 0.16 * size, pier: 0.04 * size };
}

/** The region the viewer fits: the ring, its hinge markers, the load arrow, the abutments and the ground. */
export function archView(run: ArchRun): [number, number, number, number] {
  const g = frameGeometry(run);
  const crown = run.r + run.t_max / 2 + 0.01 * g.size + g.marker;
  const top = run.load ? Math.max(crown, run.load.y + 0.02 * g.size + g.marker + g.arrow) : crown;
  const x = g.ground + 0.02 * g.size;
  return [-x, g.base - g.line - g.hatch - 0.03 * g.size, x, top + 0.03 * g.size];
}

/**
 * The arch as an engineering figure, all quads with one category value each (FIGURE): voussoirs
 * separated by open joints, the line of thrust as a ribbon (FIGURE.outside where it leaves the
 * stone), a marker on the face of each hinge, the load arrow, the abutments and the ground.
 * The topology depends on the run only, so one frame's positions displace another's.
 */
export function archFigure(run: ArchRun, frame: ArchFrame) {
  const { n, r } = run;
  const g = frameGeometry(run);
  const step = (2 * g.alpha) / n;
  const phi = (j: number) => Math.PI / 2 - g.alpha + step * j;
  const t = frame.t;
  const inner = r - t / 2;
  const outer = r + t / 2;
  const width = 0.006 * g.size;
  const gap = Math.min(0.18 * step, 0.012);
  const segments = Math.max(1, Math.ceil(96 / n));
  const xy: number[] = [];
  const cells: number[] = [];
  const values: number[] = [];
  const bodyOf = new Array<ArchBody | null>(n).fill(null);
  for (const b of run.bodies) for (let k = b.from; k < b.to; k++) bodyOf[k] = b;
  const turn = frame.kind === 'mechanism' ? frame.tau * MOTION_GAIN : 0;
  const place = (p: Point, k: number | null): Point => {
    const b = k == null ? null : bodyOf[k];
    if (!b || !turn) return p;
    const a = b.omega * turn;
    const dx = p[0] - b.centre[0];
    const dy = p[1] - b.centre[1];
    return [b.centre[0] + Math.cos(a) * dx - Math.sin(a) * dy, b.centre[1] + Math.sin(a) * dx + Math.cos(a) * dy];
  };
  const quad = (corners: Point[], value: number, k: number | null = null) => {
    for (const p of corners) {
      const [x, y] = place(p, k);
      xy.push(x, y);
      cells.push(xy.length / 2 - 1);
    }
    values.push(value);
  };
  const polar = (angle: number, rho: number): Point => [-rho * Math.cos(angle), rho * Math.sin(angle)];
  const ecc = (angle: number) => {
    const u = Math.max(0, Math.min(n, (angle - phi(0)) / step));
    const j = Math.min(n - 1, Math.floor(u));
    const e = frame.e[j] + (frame.e[j + 1] - frame.e[j]) * (u - j);
    return Math.max(-t, Math.min(t, e));
  };
  const clamp = (rho: number) => Math.max(inner, Math.min(outer, rho));
  const band = (a0: number, a1: number, lo: [number, number], hi: [number, number], value: number, k: number) =>
    quad([polar(a0, lo[0]), polar(a1, lo[1]), polar(a1, hi[1]), polar(a0, hi[0])], value, k);
  const piece = (a0: number, a1: number, k: number, stone: boolean) => {
    const e0 = ecc(a0);
    const e1 = ecc(a1);
    if (stone) {
      const shade = FIGURE.stone[k % 2];
      band(a0, a1, [inner, inner], [clamp(r + e0 - width), clamp(r + e1 - width)], shade, k);
      band(a0, a1, [clamp(r + e0 + width), clamp(r + e1 + width)], [outer, outer], shade, k);
    }
    const out = Math.max(Math.abs(e0), Math.abs(e1)) > (t / 2) * (1 + 1e-4);
    band(a0, a1, [r + e0 - width, r + e1 - width], [r + e0 + width, r + e1 + width], out ? FIGURE.outside : FIGURE.line, k);
  };
  for (let k = 0; k < n; k++) {
    const from = phi(k) + (k > 0 ? gap / 2 : 0);
    const to = phi(k + 1) - (k < n - 1 ? gap / 2 : 0);
    if (k > 0) piece(phi(k), from, k, false);
    for (let i = 0; i < segments; i++) piece(from + ((to - from) * i) / segments, from + ((to - from) * (i + 1)) / segments, k, true);
    if (k < n - 1) piece(to, phi(k + 1), k, false);
  }
  const shoulder = Math.min(...[0, n].flatMap(j => [inner, outer].map(rho => polar(phi(j), rho)[1]))) - 0.01 * g.size - 0.7 * g.marker;
  for (const j of [0, n]) {
    const a = polar(phi(j), inner);
    const b = polar(phi(j), outer);
    const left = Math.min(a[0], b[0]);
    const right = Math.max(a[0], b[0]);
    quad([a, b, [b[0], g.base], [a[0], g.base]], FIGURE.support);
    quad([[left - g.pier, g.base], [left, g.base], [left, shoulder], [left - g.pier, shoulder]], FIGURE.support);
    quad([[right, g.base], [right + g.pier, g.base], [right + g.pier, shoulder], [right, shoulder]], FIGURE.support);
  }
  quad([[-g.ground, g.base - g.line], [g.ground, g.base - g.line], [g.ground, g.base], [-g.ground, g.base]], FIGURE.ground);
  const pitch = 0.03 * g.size;
  const stroke = 0.006 * g.size;
  const top = g.base - g.line;
  for (let x = -g.ground + g.hatch; x + stroke <= g.ground; x += pitch) {
    quad([[x - g.hatch, top - g.hatch], [x - g.hatch + stroke, top - g.hatch], [x + stroke, top], [x, top]], FIGURE.ground);
  }
  const shown = HINGE_FRAMES.has(frame.kind);
  for (const h of run.result.hinges) {
    const angle = phi(h.joint);
    const out = h.side === 'extrados' ? 1 : -1;
    const face = polar(angle, h.side === 'extrados' ? outer : inner);
    const along = (d: number, s: number): Point => [face[0] - out * d * Math.cos(angle) + s * Math.sin(angle), face[1] + out * d * Math.sin(angle) + s * Math.cos(angle)];
    const lift = 0.01 * g.size;
    const corners: Point[] = shown
      ? [along(lift, 0), along(lift + g.marker, 0.6 * g.marker), along(lift + g.marker, 0), along(lift + g.marker, -0.6 * g.marker)]
      : [face, face, face, face];
    quad(corners, FIGURE.hinge, Math.min(h.joint, n - 1));
  }
  if (run.load) {
    const { x, y, block } = run.load;
    const full = run.result.lambda ?? 0;
    const share = frame.kind === 'load' && full > 0 ? Math.max(0, Math.min(1, frame.lambda / full)) : 1;
    const head = 0.4 * g.arrow;
    const length = head + (g.arrow - head) * (0.15 + 0.85 * share);
    const crowded = shown && run.result.hinges.some(h => h.side === 'extrados' && Math.abs(polar(phi(h.joint), outer)[0] - x) < g.marker);
    const tip: Point = [x, y + 0.01 * g.size + (crowded ? 0.01 * g.size + g.marker : 0)];
    const [mx, my] = place(tip, block);
    const shift = (p: Point): Point => [p[0] + mx - tip[0], p[1] + my - tip[1]];
    const shaft = 0.007 * g.size;
    const wing = 0.022 * g.size;
    quad([[x - shaft, tip[1] + head], [x + shaft, tip[1] + head], [x + shaft, tip[1] + length], [x - shaft, tip[1] + length]].map(p => shift(p as Point)), FIGURE.load);
    quad([tip, [x + wing, tip[1] + head], [x, tip[1] + head], [x - wing, tip[1] + head]].map(p => shift(p as Point)), FIGURE.load);
  }
  return { xy, cells, values };
}
