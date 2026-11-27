/**
 * What a load goes on: the one choice every load form asks for, answered the same way for all.
 *
 *   · everything of the kind (the self-weight of the whole model);
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
import type { SelfWeightLoad } from '../../engine/analysis-settings';
import { resolveSelfWeightScope, selfWeightScopeRefusal } from '../../engine/self-weight';

export type TargetEntity = 'nodes' | 'members' | 'quads' | 'plates';
export type MemberKindFilter = 'column' | 'beam' | 'inclined' | 'truss';

export type TargetSpec =
  | { by: 'all' }
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

/**
 * Ids in `1, 4, 7-12` form; the ones the model does not have are left out. A range's dash (or en
 * dash) is read with the spaces around it first: split on spaces before, `7 - 12` was 7 and 12 and
 * `7 -12` was 7 alone. A dash with no id before it is not a negative id.
 */
export function parseIdList(text: string, invalid?: (part: string) => void): number[] {
  const out: number[] = [];
  for (const token of text.split(/[,;]|(?<![-–\s])\s+(?![-–\s])/)) {
    const part = token.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (!Number.isSafeInteger(hi) || hi - lo > 100000) { invalid?.(part); continue; }
      for (let k = lo; k <= hi; k++) out.push(k);
      continue;
    }
    const id = /^\d+$/.test(part) ? Number(part) : NaN;
    if (Number.isSafeInteger(id)) out.push(id);
    else invalid?.(part);
  }
  return [...new Set(out)];
}

/** What "apply to" offers for an entity; `chain` (the selection as one physical member) for member loads that take it. */
export function targetModes(entity: TargetEntity, allowChain: boolean): Array<TargetSpec['by'] | 'chain'> {
  return entity === 'members'
    ? ['selection', 'ids', 'group', 'range', 'section', 'kind', ...(allowChain ? ['chain' as const] : [])]
    : ['selection', 'ids', 'group', 'range'];
}

/**
 * The choice kept when the kind of load changes: the same one when the new kind offers it, the
 * selection otherwise. Left as it was, a 'section' kept for a nodal load showed a blank select
 * while the loads went to the selection.
 */
export function keepTargetMode<B extends string>(by: B, modes: readonly string[]): B | 'selection' {
  return modes.includes(by) ? by : 'selection';
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
    case 'all':
      return sorted(entity === 'nodes' ? m.nodes.keys() : entity === 'members' ? m.elements.keys() : (shells?.keys() ?? []));
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

/**
 * Whether a group is offered for `entity`: it holds some (a floor-load definition never is).
 * `withShells`: the self-weight, which weighs a group's shells with its members
 * (`engine/self-weight.ts` `selfWeightScope`), so a group of slabs alone is offered too.
 */
export function groupOffered(g: Pick<ModelGroup, 'kind' | 'members'>, entity: TargetEntity, withShells = false): boolean {
  if (g.kind === 'floorLoad') return false;
  const shells = (g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0);
  if (entity === 'nodes') return (g.members.nodes?.length ?? 0) > 0;
  if (entity === 'members') return (g.members.elements?.length ?? 0) > 0 || (withShells && shells > 0);
  return shells > 0;
}

/**
 * What the self-weight weighs on a target, as `selfWeightScope` reads the rule written for it: on
 * the whole model or a group, the members and the shells; on any other target, the members alone.
 */
export function selfWeightReach(spec: TargetSpec, m: TargetModel, sel: TargetSelection): { members: number; slabs: number } {
  const members = resolveTargets('members', spec, m, sel).length;
  if (spec.by !== 'all' && spec.by !== 'group') return { members, slabs: 0 };
  return { members, slabs: resolveTargets('quads', spec, m, sel).length + resolveTargets('plates', spec, m, sel).length };
}

export function selfWeightTarget(
  spec: TargetSpec, model: TargetModel, selection: TargetSelection,
): Pick<SelfWeightLoad, 'elements' | 'groupId'> | { error: string } {
  let invalidPart: string | undefined;
  const target = spec.by === 'all' ? {}
    : spec.by === 'group' ? { groupId: spec.groupId }
    : { elements: spec.by === 'ids' ? parseIdList(spec.text, part => { invalidPart ??= part; })
      : spec.by === 'selection' ? [...new Set(selection.elements)]
      : resolveTargets('members', spec, model, selection) };
  if (invalidPart !== undefined) return { error: selfWeightScopeRefusal({ invalidMemberId: invalidPart }) };
  const scope = resolveSelfWeightScope(model, target);
  return 'members' in scope ? target : { error: selfWeightScopeRefusal(scope) };
}
