/**
 * Influence lines of a displacement or a rotation, by Maxwell's reciprocity: the ordinate at s,
 * the target's displacement under a unit load at s, equals the displacement at s along the load
 * under a unit force (or couple) at the target. One solve gives the whole line.
 *
 * A section inside a frame member becomes a node of a copy of the input, so the unit action is a
 * nodal one and every member is free of span loads: its deflected shape is then the Hermite cubic
 * of its end displacements, exact. A section on a truss bar is read between its end nodes, along
 * which the bar stays straight.
 */
import { solve } from '../wasm-solver';
import { computeDisplacementAt } from '../diagrams';
import type { AnalysisResults, SolverInput, SolverLoad } from '../types';
import type { InfluenceQuantity } from '../../store/model.svelte';
import { canonicalQuantity, type IlTarget } from './quantities';
import { memberGeom, samplesOn, type Dir, type IlPoint } from './unit-sweep';

export class MaxwellRefusal extends Error {
  constructor(public readonly key: string) { super(key); }
}

interface Split { solver: SolverInput; node: number; pieces?: { first: number; second: number; t: number; original: number } }

/** The input with the section as a node (a copy), and that node's id. */
export function withSectionNode(solver: SolverInput, target: IlTarget): Split {
  if (target.kind === 'node') return { solver, node: target.nodeId };
  const { e, ni, nj } = memberGeom(solver, target.elementId);
  if (target.t <= 1e-9) return { solver, node: e.nodeI };
  if (target.t >= 1 - 1e-9) return { solver, node: e.nodeJ };
  const node = Math.max(...solver.nodes.keys()) + 1;
  const first = Math.max(...solver.elements.keys()) + 1;
  const second = first + 1;
  const nodes = new Map(solver.nodes);
  nodes.set(node, { id: node, x: ni.x + target.t * (nj.x - ni.x), z: ni.z + target.t * (nj.z - ni.z) });
  const elements = new Map(solver.elements);
  elements.delete(e.id);
  elements.set(first, { ...e, id: first, nodeJ: node, hingeEnd: false });
  elements.set(second, { ...e, id: second, nodeI: node, hingeStart: false });
  return { solver: { ...solver, nodes, elements }, node, pieces: { first, second, t: target.t, original: e.id } };
}

function unitAction(q: InfluenceQuantity, node: number): SolverLoad {
  const c = canonicalQuantity(q);
  return { type: 'nodal', data: { nodeId: node, fx: c === 'ux' ? 1 : 0, fz: c === 'uz' ? 1 : 0, my: c === 'ry' ? 1 : 0 } };
}

/** Why a target has no displacement line here, or null. */
export function maxwellRefusal(solver: SolverInput, q: InfluenceQuantity, target: IlTarget): string | null {
  if (canonicalQuantity(q) !== 'ry') return null;
  if (target.kind === 'node') {
    const ends = [...solver.elements.values()].filter((m) => m.nodeI === target.nodeId || m.nodeJ === target.nodeId);
    const turns = ends.some((m) => m.type === 'frame' && !(m.nodeI === target.nodeId ? m.hingeStart : m.hingeEnd));
    const held = [...solver.supports.values()].some((s) => s.nodeId === target.nodeId && (s.type === 'fixed' || (s.type === 'spring' && (s.kz ?? 0) > 0)));
    return turns || held ? null : 'course.influence.err.rotationNoStiffness';
  }
  const e = solver.elements.get(target.elementId);
  if (!e) return null;
  if (e.type === 'truss') return 'course.influence.err.rotationOnTruss';
  if ((target.t <= 1e-9 && e.hingeStart) || (target.t >= 1 - 1e-9 && e.hingeEnd)) return 'course.influence.err.rotationAtHinge';
  return null;
}

/** Displacement (ux, uz) at t along a member of `solver` from one solve. */
export function displacementAlong(solver: SolverInput, res: AnalysisResults, elementId: number, t: number): { ux: number; uz: number } {
  const { e, ni, nj, L } = memberGeom(solver, elementId);
  const d = (id: number) => res.displacements.find((x) => x.nodeId === id) ?? { ux: 0, uz: 0, ry: 0 };
  const di = d(e.nodeI), dj = d(e.nodeJ);
  if (e.type === 'truss') return { ux: (1 - t) * di.ux + t * dj.ux, uz: (1 - t) * di.uz + t * dj.uz };
  return computeDisplacementAt(t, ni.x, ni.z, nj.x, nj.z, di.ux, di.uz, di.ry, dj.ux, dj.uz, dj.ry, L, e.hingeStart, e.hingeEnd);
}

/**
 * The line along the members of `solver` (the original input), in the load direction `dir`, from
 * the unit action at the target. Throws MaxwellRefusal where the target has no such line.
 */
export function maxwellLine(solver: SolverInput, quantity: InfluenceQuantity, target: IlTarget, n: number, dir: Dir): IlPoint[] {
  const refusal = maxwellRefusal(solver, quantity, target);
  if (refusal) throw new MaxwellRefusal(refusal);
  const onTruss = target.kind === 'section' && solver.elements.get(target.elementId)?.type === 'truss';
  if (onTruss && target.kind === 'section') {
    const e = solver.elements.get(target.elementId)!;
    const lineI = maxwellLine(solver, quantity, { kind: 'node', nodeId: e.nodeI }, n, dir);
    const lineJ = maxwellLine(solver, quantity, { kind: 'node', nodeId: e.nodeJ }, n, dir);
    return lineI.map((p, k) => ({ ...p, value: (1 - target.t) * p.value + target.t * lineJ[k].value }));
  }
  const split = withSectionNode(solver, target);
  const res = solve({ ...split.solver, loads: [unitAction(quantity, split.node)] });
  const along = (id: number, t: number) => {
    const pc = split.pieces;
    if (!pc || id !== pc.original) return displacementAlong(split.solver, res, id, t);
    return t <= pc.t
      ? displacementAlong(split.solver, res, pc.first, t / pc.t)
      : displacementAlong(split.solver, res, pc.second, (t - pc.t) / (1 - pc.t));
  };
  const points: IlPoint[] = [];
  for (const e of solver.elements.values()) {
    const { ni, nj } = memberGeom(solver, e.id);
    const sectionT = target.kind === 'section' && target.elementId === e.id ? target.t : undefined;
    for (const t of samplesOn(n, sectionT)) {
      const u = along(e.id, t);
      points.push({ x: ni.x + t * (nj.x - ni.x), y: ni.z + t * (nj.z - ni.z), elementId: e.id, t, value: u.ux * dir.x + u.uz * dir.z });
    }
  }
  return points;
}

/** The target's own displacement under the loads of one solve on the split input (for checks). */
export function targetDisplacement(solver: SolverInput, quantity: InfluenceQuantity, target: IlTarget, loads: SolverLoad[]): number {
  const split = withSectionNode(solver, target);
  const pc = split.pieces;
  const cutAt = pc ? pc.t * memberGeom(solver, pc.original).L : 0;
  const L = pc ? memberGeom(solver, pc.original).L : 0;
  const moved = loads.flatMap((l): SolverLoad[] => {
    if (!pc || (l.type !== 'pointOnElement' && l.type !== 'distributed' && l.type !== 'axialDistributed') || l.data.elementId !== pc.original) return [l];
    if (l.type === 'pointOnElement') {
      return [l.data.a <= cutAt
        ? { type: 'pointOnElement', data: { ...l.data, elementId: pc.first } }
        : { type: 'pointOnElement', data: { ...l.data, elementId: pc.second, a: l.data.a - cutAt } }];
    }
    const a = l.data.a ?? 0, b = l.data.b ?? L;
    const qAt = (x: number) => l.data.qI + ((l.data.qJ - l.data.qI) * (x - a)) / Math.max(b - a, 1e-12);
    const out: SolverLoad[] = [];
    if (a < cutAt) {
      const e = Math.min(b, cutAt);
      out.push({ type: l.type, data: { elementId: pc.first, qI: l.data.qI, qJ: qAt(e), a, b: e } } as SolverLoad);
    }
    if (b > cutAt) {
      const s = Math.max(a, cutAt);
      out.push({ type: l.type, data: { elementId: pc.second, qI: qAt(s), qJ: l.data.qJ, a: s - cutAt, b: b - cutAt } } as SolverLoad);
    }
    return out;
  });
  const res = solve({ ...split.solver, loads: moved });
  const d = res.displacements.find((x) => x.nodeId === split.node);
  if (!d) return 0;
  const c = canonicalQuantity(quantity);
  return c === 'ux' ? d.ux : c === 'uz' ? d.uz : d.ry;
}
