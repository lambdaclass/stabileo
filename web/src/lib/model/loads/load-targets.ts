/**
 * What a load goes on: the one choice every load form asks for, answered the same way for all.
 *
 *   · the selection;
 *   · the ids typed (a list: `1, 4, 7-12`);
 *   · a group of the model;
 *   · a range of coordinates on a global axis, every node in it, or every member whose two ends are;
 *   · every member of a section;
 *   · every member of a kind: columns (vertical), beams (level), inclined, truss members.
 *
 * Pure: the caller passes the model and the selection, and writes the loads in one undo step.
 */
import type { ModelGroup } from '../../store/model.svelte';

export type TargetEntity = 'nodes' | 'members' | 'quads' | 'plates';
export type MemberKindFilter = 'column' | 'beam' | 'inclined' | 'truss';

export type TargetSpec =
  | { by: 'selection' }
  | { by: 'ids'; text: string }
  | { by: 'group'; groupId: number }
  | { by: 'range'; axis: 'X' | 'Y' | 'Z'; min: number; max: number }
  | { by: 'section'; sectionId: number }
  | { by: 'kind'; kind: MemberKindFilter };

export interface TargetModel {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type?: string }>;
  quads?: ReadonlyMap<number, { id: number; nodes: number[] }>;
  plates?: ReadonlyMap<number, { id: number; nodes: number[] }>;
  groups?: ReadonlyMap<number, Pick<ModelGroup, 'members'>>;
}

export interface TargetSelection { nodes: Iterable<number>; elements: Iterable<number>; quads?: Iterable<number>; plates?: Iterable<number> }

/** Ids in `1, 4, 7-12` form; the ones the model does not have are left out. */
export function parseIdList(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (hi - lo > 100000) continue;
      for (let k = lo; k <= hi; k++) out.push(k);
    } else if (/^\d+$/.test(part)) out.push(Number(part));
  }
  return [...new Set(out)];
}

/** Within 1 mm of the range's ends a coordinate is in it. */
const TOL = 1e-3;
/** A member within about 10° of the vertical is a column, within about 10° of level a beam. */
const VERTICAL_COS = 0.985, LEVEL_SIN = 0.174;

const coord = (p: { x: number; y: number; z?: number }, axis: 'X' | 'Y' | 'Z') => (axis === 'X' ? p.x : axis === 'Y' ? p.y : (p.z ?? 0));

/** The member's kind by its direction, or its element type for a truss member. */
export function memberKindOf(m: TargetModel, id: number): MemberKindFilter | null {
  const e = m.elements.get(id);
  if (!e) return null;
  if (e.type === 'truss') return 'truss';
  const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
  if (!(L > 0)) return null;
  const vz = Math.abs(((b.z ?? 0) - (a.z ?? 0)) / L);
  return vz >= VERTICAL_COS ? 'column' : vz <= LEVEL_SIN ? 'beam' : 'inclined';
}

/** The entities of `kind` the spec names, in id order. */
export function resolveTargets(entity: TargetEntity, spec: TargetSpec, m: TargetModel, sel: TargetSelection): number[] {
  const shells = entity === 'plates' ? m.plates : m.quads;
  const has = (id: number) => (entity === 'nodes' ? m.nodes.has(id) : entity === 'members' ? m.elements.has(id) : !!shells?.has(id));
  const sorted = (ids: Iterable<number>) => [...new Set(ids)].filter(has).sort((a, b) => a - b);
  switch (spec.by) {
    case 'selection':
      return sorted(entity === 'nodes' ? sel.nodes : entity === 'members' ? sel.elements : entity === 'plates' ? (sel.plates ?? []) : (sel.quads ?? []));
    case 'ids':
      return sorted(parseIdList(spec.text));
    case 'group': {
      const g = m.groups?.get(spec.groupId)?.members;
      if (!g) return [];
      if (entity === 'nodes') return sorted(g.nodes ?? []);
      if (entity === 'members') return sorted(g.elements ?? []);
      return sorted((entity === 'plates' ? g.plates : g.quads) ?? []);
    }
    case 'range': {
      const lo = Math.min(spec.min, spec.max) - TOL, hi = Math.max(spec.min, spec.max) + TOL;
      const inside = (id: number) => { const p = m.nodes.get(id); return !!p && coord(p, spec.axis) >= lo && coord(p, spec.axis) <= hi; };
      if (entity === 'nodes') return sorted([...m.nodes.keys()].filter(inside));
      if (entity === 'members') return sorted([...m.elements.values()].filter((e) => inside(e.nodeI) && inside(e.nodeJ)).map((e) => e.id));
      return sorted([...(shells?.values() ?? [])].filter((q) => q.nodes.every(inside)).map((q) => q.id));
    }
    case 'section':
      return entity === 'members' ? sorted([...m.elements.values()].filter((e) => e.sectionId === spec.sectionId).map((e) => e.id)) : [];
    case 'kind':
      return entity === 'members' ? sorted([...m.elements.keys()].filter((id) => memberKindOf(m, id) === spec.kind)) : [];
  }
}
