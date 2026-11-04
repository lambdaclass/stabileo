/**
 * The figures of the influence-line document: the structure with the effect released (or the
 * unit action applied), and the line drawn as the deformed shape it is, positive against the
 * unit load.
 */
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import type { PlaneModel } from './plane-model';
import type { IlPoint, Dir } from '../influence/unit-sweep';
import { canonicalQuantity, familyOf, type IlTarget } from '../influence/quantities';
import type { InfluenceQuantity } from '../../store/model.svelte';
import { numText } from './format';

/** The line as deformed polylines over the members, its largest ordinate 12 % of the structure's size. */
export function lineShape(pm: PlaneModel, points: IlPoint[], dir: Dir): NonNullable<Sketch['deformed']> {
  const xs = [...pm.nodes.values()].map((n) => n.x), zs = [...pm.nodes.values()].map((n) => n.z);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1e-6);
  const peak = Math.max(...points.map((p) => Math.abs(p.value)), 1e-30);
  const k = (0.12 * size) / peak;
  const out: NonNullable<Sketch['deformed']> = [];
  let cur: { id: number; pts: Array<{ x: number; z: number }> } | null = null;
  for (const p of points) {
    if (!cur || cur.id !== p.elementId) {
      cur = { id: p.elementId, pts: [] };
      out.push({ points: cur.pts, color: 'deformed' });
    }
    cur.pts.push({ x: p.x - dir.x * p.value * k, z: p.y - dir.z * p.value * k });
  }
  return out;
}

/** Where the target is, in model coordinates. */
export function targetPoint(pm: PlaneModel, target: IlTarget): { x: number; z: number } {
  if (target.kind === 'node') {
    const n = pm.nodes.get(target.nodeId)!;
    return { x: n.x, z: n.z };
  }
  const m = pm.members.get(target.elementId)!;
  const a = pm.nodes.get(m.i)!, b = pm.nodes.get(m.j)!;
  return { x: a.x + target.t * (b.x - a.x), z: a.z + target.t * (b.z - a.z) };
}

/** A short cut across the member at the section. */
function cutAt(pm: PlaneModel, target: IlTarget & { kind: 'section' }, label: string): Sketch['cut'] {
  const m = pm.members.get(target.elementId)!;
  const p = targetPoint(pm, target);
  const xs = [...pm.nodes.values()].map((n) => n.x);
  const h = 0.06 * Math.max(Math.max(...xs) - Math.min(...xs), m.L);
  return { a: { x: p.x + m.s * h, z: p.z - m.c * h }, b: { x: p.x - m.s * h, z: p.z + m.c * h }, label };
}

/** The structure with the target marked: the section cut, or the node labelled. */
export function targetSketch(pm: PlaneModel, target: IlTarget, label: string): Sketch {
  const sk = sketchOf(pm);
  if (target.kind === 'section') return { ...sk, cut: cutAt(pm, target, label), dims: 'auto' };
  const p = targetPoint(pm, target);
  return { ...sk, labels: [{ x: p.x, z: p.z, text: label, color: 'accent', anchor: 'n' }], dims: 'auto' };
}

/**
 * Müller-Breslau's released structure with the line as its deformed shape: a hinge at the section
 * for M, the cut for V and N, the support taken away (its reaction drawn) for a reaction.
 */
export function releasedSketch(pm: PlaneModel, q: InfluenceQuantity, target: IlTarget, points: IlPoint[], dir: Dir): Sketch {
  const c = canonicalQuantity(q);
  const sk = sketchOf(pm);
  const deformed = lineShape(pm, points, dir);
  if (target.kind === 'section') {
    if (c === 'M') {
      const p = targetPoint(pm, target);
      const id = Math.max(...pm.nodes.keys()) + 1;
      const m = pm.members.get(target.elementId)!;
      const members = sk.members.filter((x) => x.id !== m.id);
      const inner = target.t > 1e-9 && target.t < 1 - 1e-9;
      const nodes = inner ? [...sk.nodes, { id, x: p.x, z: p.z }] : sk.nodes;
      const pieces = inner ? [{ id: m.id, i: m.i, j: id }, { id: -m.id, i: id, j: m.j }] : [{ id: m.id, i: m.i, j: m.j }];
      const at = inner ? id : target.t < 0.5 ? m.i : m.j;
      return { ...sk, nodes, members: [...members, ...pieces], hinges: [...(sk.hinges ?? []), { node: at, member: inner ? undefined : m.id }], deformed };
    }
    return { ...sk, cut: cutAt(pm, target, c), deformed };
  }
  const p = targetPoint(pm, target);
  const supports = (sk.supports ?? []).filter((s) => s.node !== target.nodeId);
  const r = c === 'Rz' ? { forces: [{ x: p.x, z: p.z, fx: 0, fz: 1, label: 'R_z', color: 'reaction' as const, dashed: true }] }
    : c === 'Rx' ? { forces: [{ x: p.x, z: p.z, fx: 1, fz: 0, label: 'R_x', color: 'reaction' as const, dashed: true }] }
      : { couples: [{ x: p.x, z: p.z, m: 1, label: 'M_y', color: 'reaction' as const, dashed: true }] };
  return { ...sk, supports: familyOf(q) === 'reaction' ? supports : sk.supports, ...r, deformed };
}

/** Maxwell: the unit force (or couple) at the target, and the deflected shape it gives, which is the line. */
export function maxwellSketch(pm: PlaneModel, q: InfluenceQuantity, target: IlTarget, points: IlPoint[], dir: Dir): Sketch {
  const c = canonicalQuantity(q);
  const p = targetPoint(pm, target);
  const sk = sketchOf(pm);
  const deformed = lineShape(pm, points, dir);
  if (c === 'ry') return { ...sk, couples: [{ x: p.x, z: p.z, m: 1, label: '1', color: 'load' }], deformed };
  return { ...sk, forces: [{ x: p.x, z: p.z, fx: c === 'ux' ? 1 : 0, fz: c === 'uz' ? 1 : 0, label: '1', color: 'load' }], deformed };
}

/** Labels of the largest and smallest ordinates, on the line. */
export function peakLabels(pm: PlaneModel, points: IlPoint[], dir: Dir): NonNullable<Sketch['labels']> {
  const shape = lineShape(pm, points, dir).flatMap((d) => d.points);
  let iMax = 0, iMin = 0;
  points.forEach((p, k) => { if (p.value > points[iMax].value) iMax = k; if (p.value < points[iMin].value) iMin = k; });
  const out: NonNullable<Sketch['labels']> = [];
  if (points[iMax].value > 1e-12) out.push({ ...shape[iMax], text: numText(points[iMax].value, 3), color: 'deformed', anchor: 'n' });
  if (points[iMin].value < -1e-12) out.push({ ...shape[iMin], text: numText(points[iMin].value, 3), color: 'deformed', anchor: 's' });
  return out;
}
