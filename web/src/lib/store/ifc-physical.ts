/**
 * The concrete the IFC export writes, from the physical frame (`store/physical-frame.ts`): each
 * member's body cut at its joints, each joint in the body of the member it is attributed to, each
 * slab net of the frame. And where the project says a column's body ends against the slab
 * (`exchange.ifcColumnTop`), the part of the joint above that height in the slab, or in the
 * deepest beam where no slab covers it.
 *
 * ── Why a column top is an option ──────────────────────────────────
 *
 * Programs that coordinate a structure with its architecture read the slab and the columns as
 * separate products and expect them not to overlap; which product the joint's top belongs to is a
 * convention of the receiving office, not a property of the concrete. The volume is the same
 * either way: only its owner changes.
 */
import { modelStore } from './model.svelte';
import {
  planDifference, planIntersection, planUnion,
  type PhysicalFrame, type PhysicalSolid, type PlanPolygon, type PrismLayer, type XY,
} from '../engine/physical/physical-frame';
import type { IfcPrismItem, V3 } from '../ifc/ifc-writer';

export type IfcColumnTop = 'slabTop' | 'slabSoffit' | 'axis';

const itemsOf = (layers: readonly PrismLayer[]): IfcPrismItem[] => layers.flatMap((l) => l.polygons.map((p) => ({
  z0: l.z0, depth: l.z1 - l.z0, outer: p.outer.map(([x, y]) => [x, y] as [number, number]),
  ...(p.holes.length ? { holes: p.holes.map((h) => h.map(([x, y]) => [x, y] as [number, number])) } : {}),
})));

/** Split layers at `z`: what lies below it and what lies above. */
function splitAt(layers: readonly PrismLayer[], z: number): { below: PrismLayer[]; above: PrismLayer[] } {
  const below: PrismLayer[] = [], above: PrismLayer[] = [];
  for (const l of layers) {
    if (l.z1 <= z + 1e-9) below.push(l);
    else if (l.z0 >= z - 1e-9) above.push(l);
    else { below.push({ ...l, z1: z }); above.push({ ...l, z0: z }); }
  }
  return { below, above };
}

/** A shell's outline in plan, as the slab is cast before the frame takes its part. */
function grossPlan(key: string): PlanPolygon | null {
  const m = modelStore.model;
  const sh = key.startsWith('q') ? m.quads.get(Number(key.slice(1))) : m.plates.get(Number(key.slice(1)));
  if (!sh) return null;
  const pts = sh.nodes.map((n) => m.nodes.get(n)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [p.x, p.y] as XY);
  if (pts.length < 3) return null;
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p[0] * q[1] - q[0] * p[1]; }
  return { outer: a < 0 ? [...pts].reverse() : pts, holes: [] };
}

export interface IfcPhysicalBodies {
  /** The cut segment of each member's reference line, by member. */
  segment: (elementId: number) => { a: V3; b: V3 } | null;
  /** The joint parts each member's body carries. */
  prisms: (elementId: number) => IfcPrismItem[];
  /** The net body of a slab shell, and the joint parts given to it by the column-top rule. */
  slab: (shellKey: string) => IfcPrismItem[] | null;
}

export function ifcPhysicalBodies(frame: PhysicalFrame, columnTop: IfcColumnTop = 'slabTop'): IfcPhysicalBodies {
  const toMember = new Map<number, PrismLayer[]>(), toSlab = new Map<string, PrismLayer[]>();
  const add = <K>(m: Map<K, PrismLayer[]>, k: K, ls: readonly PrismLayer[]) => { if (ls.length) m.set(k, [...(m.get(k) ?? []), ...ls]); };
  const slabs = [...frame.slab.values()].filter((s) => s.layers.length > 0);

  for (const j of frame.joint.values()) {
    const owner = j.owner.elementId!;
    const ownerIsColumn = frame.member.get(owner)?.kind === 'column';
    if (!ownerIsColumn || columnTop === 'slabTop') { add(toMember, owner, j.layers); continue; }
    const jointPlan = planUnion(j.layers.flatMap((l) => l.polygons));
    // The slabs this joint meets: their shells' outlines over the joint, and the lowest soffit among them.
    const meeting = slabs.map((s) => ({ s, plan: grossPlan(s.shellKey!), z0: Math.min(...s.layers.map((l) => l.z0)), z1: Math.max(...s.layers.map((l) => l.z1)) }))
      .filter((x) => x.plan && x.z1 > j.layers[0]!.z0 && x.z0 < j.layers[j.layers.length - 1]!.z1 && planIntersection([x.plan], jointPlan).length > 0);
    const nodeZ = modelStore.model.nodes.get(j.nodeId!)?.z ?? 0;
    const cut = columnTop === 'axis' ? nodeZ : meeting.length ? Math.min(...meeting.map((x) => x.z0)) : null;
    if (cut === null) { add(toMember, owner, j.layers); continue; }
    const { below, above } = splitAt(j.layers, cut);
    add(toMember, owner, below);
    // Above the cut: each slab takes what of it lies inside its outline and its thickness; the
    // deepest beam framing in takes the rest.
    let rest = above;
    for (const x of meeting) {
      const inSlab: PrismLayer[] = [], left: PrismLayer[] = [];
      for (const l of rest) {
        const lo = Math.max(l.z0, x.z0), hi = Math.min(l.z1, x.z1);
        if (hi - lo < 1e-9) { left.push(l); continue; }
        const inside = planIntersection(l.polygons, [x.plan!]);
        const outside = planDifference(l.polygons, [x.plan!]);
        if (inside.length) inSlab.push({ z0: lo, z1: hi, polygons: inside });
        if (outside.length) left.push({ z0: lo, z1: hi, polygons: outside });
        if (l.z0 < lo - 1e-9) left.push({ ...l, z1: lo });
        if (l.z1 > hi + 1e-9) left.push({ ...l, z0: hi });
      }
      add(toSlab, x.s.shellKey!, inSlab);
      rest = left;
    }
    const beam = deepestBeam(frame, j);
    add(toMember, beam ?? owner, rest);
  }

  return {
    segment: (id) => {
      const s = frame.member.get(id);
      if (!s?.axis || s.kind === 'member') return null;
      return { a: [s.axis.start.x, s.axis.start.y, s.axis.start.z], b: [s.axis.end.x, s.axis.end.y, s.axis.end.z] };
    },
    prisms: (id) => itemsOf(toMember.get(id) ?? []),
    slab: (key) => {
      const s = frame.slab.get(key);
      return s ? itemsOf([...s.layers, ...(toSlab.get(key) ?? [])]) : null;
    },
  };
}

function deepestBeam(frame: PhysicalFrame, j: PhysicalSolid): number | null {
  const beams = j.elementIds.map((id) => frame.member.get(id)).filter((s): s is PhysicalSolid => s?.kind === 'beam' && s.layers.length > 0);
  const depth = (s: PhysicalSolid) => s.layers[0]!.z1 - s.layers[0]!.z0;
  return beams.sort((a, b) => depth(b) - depth(a) || a.elementIds[0]! - b.elementIds[0]!)[0]?.elementIds[0] ?? null;
}
