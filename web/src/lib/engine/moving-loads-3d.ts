/**
 * Moving loads on a 3D model: a train of axles along a path of members, the envelope of every
 * member's forces over all positions.
 *
 * ── Why the app sweeps the positions itself ───────────────────────
 *
 * The engine has a 3D moving-load routine, and it takes each member's envelope from the forces
 * at its two ends. The largest moment under a moving axle is under the axle, inside the member,
 * so on a simply supported span modelled as one member it reports zero for a beam whose real
 * envelope is P·L/4. The 2D path met the same thing and reads its pointwise envelope instead
 * (`moving-loads.ts`). Here each position is solved with the ordinary 3D solve and read at the
 * member's critical stations (`station-forces.ts`), which include every point-load position, so
 * the maximum under each axle is read where it occurs.
 *
 * ── The loads ────────────────────────────────────────────────────
 *
 * Each axle weighs downward (−Z in the solver's frame, which is also the frame a flat model is
 * embedded in). On the member it stands on, the weight is split onto the member's own axes, as
 * the load serializer does for a point load (`solver-service.ts`): the transverse part as a
 * point load, the axial part as nodal forces shared by the two ends in proportion to position.
 * A train that is not symmetric also runs the other way, on the mirrored positions.
 */
import { solve3D } from './wasm-solver';
import { computeLocalAxes3D } from './local-axes-3d';
import { buildCriticalStations, extractForcesAtStation } from './station-forces';
import type { SolverInput3D, SolverLoad3D, AnalysisResults3D } from './types-3d';
import type { LoadTrain } from './moving-loads';

export interface PathSegment3D {
  elementId: number;
  /** Node the path enters the member by. */
  from: number;
  to: number;
  length: number;
  cumStart: number;
  /** True when the path runs from the member's node J to node I. */
  reversed: boolean;
}

export type EnvelopeComponent = 'n' | 'vy' | 'vz' | 'my' | 'mz' | 'torsion';
export const ENVELOPE_COMPONENTS: readonly EnvelopeComponent[] = ['n', 'vy', 'vz', 'my', 'mz', 'torsion'];

export interface Extreme { value: number; x: number; position: number }

export interface MovingEnvelope3D {
  /** Per member, per component: the largest and the smallest value, where, and the reference axle's position. */
  elements: Map<number, Record<EnvelopeComponent, { max: Extreme; min: Extreme }>>;
  path: PathSegment3D[];
  train: LoadTrain;
  positions: number;
  failed: number;
}

/**
 * Order `ids` into a chain, each member entered at the node it shares with the previous one.
 * Null when the members do not form one open chain.
 */
export function buildPath3D(input: SolverInput3D, ids: number[]): PathSegment3D[] | null {
  const els = ids.map((id) => input.elements.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  if (els.length === 0 || els.length !== ids.length) return null;
  const degree = new Map<number, number>();
  for (const e of els) for (const n of [e.nodeI, e.nodeJ]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if ([...degree.values()].some((d) => d > 2)) return null;
  const ends = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2) return null;
  // Start at the end the first listed member touches, so the user's order sets the direction.
  const first = els[0]!;
  let at = ends.includes(first.nodeI) ? first.nodeI : ends.includes(first.nodeJ) ? first.nodeJ : ends[0]!;
  const left = new Set(els.map((e) => e.id));
  const out: PathSegment3D[] = [];
  let cum = 0;
  while (left.size > 0) {
    const e = els.find((x) => left.has(x.id) && (x.nodeI === at || x.nodeJ === at));
    if (!e) return null;
    left.delete(e.id);
    const reversed = e.nodeJ === at;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    out.push({ elementId: e.id, from: at, to: reversed ? e.nodeI : e.nodeJ, length: L, cumStart: cum, reversed });
    cum += L;
    at = reversed ? e.nodeI : e.nodeJ;
  }
  return out;
}

/** The solver loads of `train` with its reference axle at `refPos` along the path. */
export function trainLoads(input: SolverInput3D, path: PathSegment3D[], train: LoadTrain, refPos: number): SolverLoad3D[] {
  const total = path.reduce((s, p) => s + p.length, 0);
  const loads: SolverLoad3D[] = [];
  for (const axle of train.axles) {
    const s = refPos + axle.offset;
    if (s < 0 || s > total) continue;
    const seg = path.find((p) => s >= p.cumStart - 1e-12 && s <= p.cumStart + p.length + 1e-12);
    if (!seg) continue;
    const e = input.elements.get(seg.elementId)!;
    const ni = input.nodes.get(e.nodeI)!, nj = input.nodes.get(e.nodeJ)!;
    const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
      ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    const axes = computeLocalAxes3D(ni, nj, localY, e.rollAngle ?? 0, false);
    const along = Math.min(Math.max(s - seg.cumStart, 0), seg.length);
    const a = seg.reversed ? seg.length - along : along;
    const F: [number, number, number] = [0, 0, -axle.weight];
    const dot = (v: readonly number[]) => v[0]! * F[0] + v[1]! * F[1] + v[2]! * F[2];
    const py = dot(axes.ey), pz = dot(axes.ez), px = dot(axes.ex);
    if (Math.abs(py) > 1e-12 || Math.abs(pz) > 1e-12) {
      loads.push({ type: 'pointOnElement', data: { elementId: e.id, a, py, pz } });
    }
    if (Math.abs(px) > 1e-12) {
      const t = a / seg.length;
      for (const [node, f] of [[e.nodeI, px * (1 - t)], [e.nodeJ, px * t]] as const) {
        loads.push({ type: 'nodal', data: { nodeId: node, fx: f * axes.ex[0], fy: f * axes.ex[1], fz: f * axes.ex[2], mx: 0, my: 0, mz: 0 } });
      }
    }
  }
  return loads;
}

const isSymmetric = (train: LoadTrain) => {
  const max = Math.max(...train.axles.map((a) => a.offset));
  return train.axles.every((a) => train.axles.some((b) => Math.abs(b.offset - (max - a.offset)) < 1e-6 && Math.abs(b.weight - a.weight) < 1e-6));
};
const reversedTrain = (train: LoadTrain): LoadTrain => {
  const max = Math.max(...train.axles.map((a) => a.offset));
  return { name: train.name, axles: train.axles.map((a) => ({ offset: max - a.offset, weight: a.weight })) };
};

function blank(): Record<EnvelopeComponent, { max: Extreme; min: Extreme }> {
  const e = () => ({ max: { value: 0, x: 0, position: 0 }, min: { value: 0, x: 0, position: 0 } });
  return { n: e(), vy: e(), vz: e(), my: e(), mz: e(), torsion: e() };
}

/** Fold one position's results into the envelope, at each member's critical stations. */
export function foldPosition(env: MovingEnvelope3D['elements'], results: AnalysisResults3D, position: number): void {
  for (const ef of results.elementForces) {
    let rec = env.get(ef.elementId);
    if (!rec) { rec = blank(); env.set(ef.elementId, rec); }
    for (const t of buildCriticalStations(ef)) {
      const f = extractForcesAtStation(ef, t);
      for (const c of ENVELOPE_COMPONENTS) {
        const v = f[c];
        if (v > rec[c].max.value) rec[c].max = { value: v, x: f.x, position };
        if (v < rec[c].min.value) rec[c].min = { value: v, x: f.x, position };
      }
    }
  }
}

export interface MovingLoad3DOptions {
  step?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Sweep `train` along `path`, forward and (for an asymmetric train) back. */
export async function sweepMovingLoad3D(
  base: SolverInput3D, path: PathSegment3D[], train: LoadTrain, opts: MovingLoad3DOptions = {},
): Promise<MovingEnvelope3D> {
  const step = opts.step && opts.step > 0 ? opts.step : 0.25;
  const total = path.reduce((s, p) => s + p.length, 0);
  const maxOff = Math.max(0, ...train.axles.map((a) => a.offset));
  const forward: number[] = [];
  for (let r = -maxOff; r <= total + 1e-9; r += step) forward.push(r);
  const passes: Array<{ train: LoadTrain; refs: number[] }> = [{ train, refs: forward }];
  if (!isSymmetric(train)) passes.push({ train: reversedTrain(train), refs: forward.map((r) => total - r - maxOff) });
  const count = passes.reduce((n, p) => n + p.refs.length, 0);
  const env: MovingEnvelope3D['elements'] = new Map();
  let done = 0, failed = 0;
  for (const p of passes) {
    for (const r of p.refs) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      try {
        foldPosition(env, solve3D({ ...base, loads: trainLoads(base, path, p.train, r) }), r);
      } catch {
        failed++;
      }
      done++;
      opts.onProgress?.(done, count);
      if (done % 8 === 0) await new Promise((res) => setTimeout(res, 0));
    }
  }
  return { elements: env, path, train, positions: done - failed, failed };
}
