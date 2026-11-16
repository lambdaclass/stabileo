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

/** Lines of the voussoirs (joints, intrados and extrados arcs), the thrust line and the load arrow. */
export function archMesh(run: ArchRun, frame: ArchFrame) {
  const { n, r } = run;
  const alpha = (run.alpha * Math.PI) / 180;
  const phi = (j: number) => Math.PI / 2 - alpha + (2 * alpha * j) / n;
  const segments = Math.max(1, Math.ceil(96 / n));
  const xy: number[] = [];
  const displacement: number[] = [];
  const values: number[] = [];
  const cells: number[] = [];
  const bodyOf = new Array<ArchBody | null>(n).fill(null);
  for (const b of run.bodies) for (let k = b.from; k < b.to; k++) bodyOf[k] = b;
  const tau = frame.kind === 'mechanism' ? frame.tau : 0;
  const move = (x: number, y: number, k: number): [number, number] => {
    const b = bodyOf[k];
    if (!b || !tau) return [0, 0];
    const a = b.omega * tau;
    const dx = x - b.centre[0];
    const dy = y - b.centre[1];
    return [b.centre[0] + Math.cos(a) * dx - Math.sin(a) * dy - x, b.centre[1] + Math.sin(a) * dx + Math.cos(a) * dy - y];
  };
  const point = (x0: number, y0: number, x: number, y: number, k: number, value: number) => {
    const [mx, my] = move(x, y, k);
    xy.push(x0, y0);
    displacement.push(x - x0 + mx, y - y0 + my);
    values.push(value);
    return values.length - 1;
  };
  const polar = (angle: number, rho0: number, rho: number, k: number, value: number) =>
    point(-rho0 * Math.cos(angle), rho0 * Math.sin(angle), -rho * Math.cos(angle), rho * Math.sin(angle), k, value);
  const ring = (offset: number) => [r + offset * run.t_max, r + offset * frame.t] as const;
  const ratio = (j: number) => Math.max(-1, Math.min(1, frame.e[j] / (frame.t / 2)));
  const joint = (j: number) => (Math.abs(ratio(j)) > 0.999 ? ratio(j) : 0);
  for (let k = 0; k < n; k++) {
    for (const j of [k, k + 1]) cells.push(polar(phi(j), ...ring(-0.5), k, joint(j)), polar(phi(j), ...ring(0.5), k, joint(j)));
    for (const side of [-0.5, 0.5]) {
      let prev = polar(phi(k), ...ring(side), k, 0);
      for (let i = 1; i <= segments; i++) {
        const next = polar(phi(k) + ((phi(k + 1) - phi(k)) * i) / segments, ...ring(side), k, 0);
        cells.push(prev, next);
        prev = next;
      }
    }
  }
  for (const width of [-0.004, 0, 0.004]) {
    let prev = -1;
    for (let j = 0; j <= n; j++) {
      const e = Math.max(-frame.t, Math.min(frame.t, frame.e[j])) + width * r;
      const id = polar(phi(j), r, r + e, Math.min(j, n - 1), ratio(j));
      if (prev >= 0) cells.push(prev, id);
      prev = id;
    }
  }
  if (run.load) {
    const { x, y, block } = run.load;
    const top = y + 0.5 * run.t_max + 0.3 * r;
    const head = 0.05 * r;
    const ids = [[x, top], [x, y], [x - head * 0.6, y + head], [x + head * 0.6, y + head]].map(([px, py]) => point(px, py, px, py, block, 0));
    cells.push(ids[0], ids[1], ids[1], ids[2], ids[1], ids[3]);
  }
  return { xy, cells, values, displacement };
}
