/**
 * The pushover as a curve and a sequence: base shear against the displacement of a control node,
 * one point per hinge event, and which hinges exist at each step.
 *
 * The engine's plastic analysis is event to event: each step solves the structure as it stands,
 * finds the load increment that forms the next hinge, and reports that step's results scaled to
 * that increment. So a step's displacements and reactions are the INCREMENT, and the state at a
 * step is the sum of the increments up to it. The load factor it reports is already cumulative.
 *
 * Pure.
 */
import type { Vec3 } from '../model/edit/affine';
import type { TimeHistoryResult3D } from '../store/time-history-view.svelte';

export type PushDir = 'x' | 'y' | 'z';

export interface PushoverHinge {
  elementId: number;
  end: 'start' | 'end' | string;
  momentY: number;
  momentZ: number;
  interactionRatio: number;
  loadFactor: number;
  step: number;
}

interface StepResults {
  displacements: Array<{ nodeId: number; ux?: number; uy?: number; uz?: number; rx?: number; ry?: number; rz?: number }>;
  reactions: Array<{ nodeId: number; fx?: number; fy?: number; fz?: number }>;
}

export interface PushoverResult {
  collapseFactor: number;
  steps: Array<{ loadFactor: number; hingesFormed: PushoverHinge[]; results: StepResults }>;
  hinges: PushoverHinge[];
  isMechanism: boolean;
}

export interface CapacityPoint {
  /** −1 for the origin; otherwise the engine's step index. */
  step: number;
  loadFactor: number;
  /** Of the control node in the push direction, m, signed so the push is positive. */
  displacement: number;
  /** Sum of the reactions in the push direction, kN, with the same sign convention. */
  baseShear: number;
  hinges: PushoverHinge[];
}

const comp = (o: { ux?: number; uy?: number; uz?: number }, d: PushDir) => (d === 'x' ? o.ux : d === 'y' ? o.uy : o.uz) ?? 0;
const force = (o: { fx?: number; fy?: number; fz?: number }, d: PushDir) => (d === 'x' ? o.fx : d === 'y' ? o.fy : o.fz) ?? 0;

/** The control node and direction to follow when none is chosen: the largest first-step move. */
export function defaultControl(res: PushoverResult): { nodeId: number; dir: PushDir } | null {
  const first = res.steps[0]?.results.displacements ?? [];
  let best: { nodeId: number; dir: PushDir; v: number } | null = null;
  for (const d of first) {
    for (const dir of ['x', 'y', 'z'] as const) {
      const v = Math.abs(comp(d, dir));
      if (!best || v > best.v) best = { nodeId: d.nodeId, dir, v };
    }
  }
  return best && best.v > 0 ? { nodeId: best.nodeId, dir: best.dir } : null;
}

/** The capacity curve: the origin, then one point per step, cumulative. */
export function capacityCurve(res: PushoverResult, control: { nodeId: number; dir: PushDir }): CapacityPoint[] {
  const out: CapacityPoint[] = [{ step: -1, loadFactor: 0, displacement: 0, baseShear: 0, hinges: [] }];
  let u = 0, v = 0;
  res.steps.forEach((s, k) => {
    const d = s.results.displacements.find((x) => x.nodeId === control.nodeId);
    u += d ? comp(d, control.dir) : 0;
    // The reactions oppose the push: the base shear the structure carries is minus their sum.
    v -= s.results.reactions.reduce((a, r) => a + force(r, control.dir), 0);
    out.push({ step: k, loadFactor: s.loadFactor, displacement: u, baseShear: v, hinges: s.hingesFormed });
  });
  const sign = Math.sign(out[out.length - 1]!.displacement) || 1;
  return sign > 0 ? out : out.map((p) => ({ ...p, displacement: -p.displacement, baseShear: -p.baseShear }));
}

/** Every hinge formed up to and including `step` (−1: none). */
export function hingesThrough(res: PushoverResult, step: number): PushoverHinge[] {
  return res.steps.slice(0, step + 1).flatMap((s) => s.hingesFormed);
}

/**
 * Where to draw each hinge: on its member, a small fraction of the length in from the end it
 * formed at, so two hinges at one joint read as two.
 */
export function hingePoints(
  hinges: PushoverHinge[],
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number }>,
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>,
  frac = 0.08,
): Vec3[] {
  const out: Vec3[] = [];
  for (const h of hinges) {
    const e = elements.get(h.elementId);
    const a = e && nodes.get(e.nodeI), b = e && nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const [p, q] = h.end === 'end' ? [b, a] : [a, b];
    out.push([p.x + frac * (q.x - p.x), p.y + frac * (q.y - p.y), (p.z ?? 0) + frac * ((q.z ?? 0) - (p.z ?? 0))]);
  }
  return out;
}

/**
 * The joint the run stopped at, when it stopped because every member end meeting there was
 * released: the engine releases all the ends that reach Mp in the same step, and when those are
 * all the ends at a joint, its rotation has no stiffness left and the next solve fails, which the
 * engine reads as a mechanism. The structure may still carry more; the collapse factor is then a
 * lower bound. Null when the run did not end that way.
 */
export function stoppedAtJoint(
  res: PushoverResult,
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number; type?: string }>,
): number | null {
  const last = res.steps[res.steps.length - 1];
  if (!last || !res.isMechanism || last.hingesFormed.length < 2) return null;
  const released = new Set(hingesThrough(res, res.steps.length - 1).map((h) => `${h.elementId}:${h.end}`));
  const nodeOf = (h: PushoverHinge) => { const e = elements.get(h.elementId); return e ? (h.end === 'end' ? e.nodeJ : e.nodeI) : null; };
  for (const h of last.hingesFormed) {
    const n = nodeOf(h);
    if (n === null) continue;
    const ends: string[] = [];
    for (const [id, e] of elements) {
      if (e.type === 'truss') continue;
      if (e.nodeI === n) ends.push(`${id}:start`);
      if (e.nodeJ === n) ends.push(`${id}:end`);
    }
    const formedHere = last.hingesFormed.filter((x) => nodeOf(x) === n).length;
    if (ends.length > 1 && formedHere > 1 && ends.every((k) => released.has(k))) return n;
  }
  return null;
}

/**
 * The steps as frames the 3D view scrubs through (`time-history-view.svelte.ts`): the undeformed
 * structure, then the state after each step, cumulative, rotations included. "Time" is the step.
 */
export function pushoverFrames(res: PushoverResult): TimeHistoryResult3D {
  const ids = [...new Set(res.steps.flatMap((s) => s.results.displacements.map((d) => d.nodeId)))];
  const hist = new Map(ids.map((id) => [id, { nodeId: id, ux: [0], uy: [0], uz: [0], rx: [0], ry: [0], rz: [0] }]));
  for (const s of res.steps) {
    const by = new Map(s.results.displacements.map((d) => [d.nodeId, d]));
    for (const h of hist.values()) {
      const d = by.get(h.nodeId);
      const k = h.ux.length - 1;
      h.ux.push(h.ux[k]! + (d?.ux ?? 0)); h.uy.push(h.uy[k]! + (d?.uy ?? 0)); h.uz.push(h.uz[k]! + (d?.uz ?? 0));
      h.rx.push(h.rx[k]! + (d?.rx ?? 0)); h.ry.push(h.ry[k]! + (d?.ry ?? 0)); h.rz.push(h.rz[k]! + (d?.rz ?? 0));
    }
  }
  const nodeHistories = [...hist.values()];
  const last = res.steps.length;
  return {
    timeSteps: Array.from({ length: last + 1 }, (_, k) => k),
    nodeHistories,
    peakDisplacements: nodeHistories.map((h) => ({ nodeId: h.nodeId, ux: h.ux[last]!, uy: h.uy[last]!, uz: h.uz[last]! })),
    peakReactions: [],
    nSteps: last,
    method: 'pushover',
  };
}
