/**
 * The engine's adaptively refined mesh (`adapt_mesh_3d`, its `mesh`) as an edit of the model
 * it was solved from. The engine refines what the solver was given; the model holds more
 * (load cases, groups, named supports), so the edit is planned here against the model and
 * refused when the two no longer say the same.
 */
import type { Support } from '../../store/model.svelte';

export interface RefinedMesh {
  nodes: Array<{ id: number; x: number; y: number; z: number; between?: [number, number] }>;
  shells: Array<{ family: string; parent: number; id: number; nodes: number[]; weights: number[][] }>;
  frames: Array<{ parent: number; nodes: number[]; at: number[] }>;
  supports: Array<{ nodeId: number; restrained: boolean[]; plain: boolean }>;
  constraints: Array<Array<{ nodeId: number; dof: number; coefficient: number }>>;
}

/**
 * `nothing`: the mesh was not refined. `stale`: the model is not the one solved. `physicalPlate`:
 * a shell to split belongs to a plate meshed from its outline, whose mesh is its own to make.
 * `member`: a member to split is curved, of variable section, or shares its edge with another
 * member. `support`: a new node on a
 * supported edge whose ends are held differently, in a way one support cannot say.
 */
export type RefinedMeshRefusal = 'nothing' | 'stale' | 'physicalPlate' | 'member' | 'support';

type Shell = { id: number; nodes: readonly number[]; curved?: boolean };
type Point = { x: number; y: number; z?: number };

export interface RefinableModel {
  nodes: ReadonlyMap<number, Point>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; variableSection?: unknown; arc?: unknown }>;
  quads: ReadonlyMap<number, Shell>;
  plates: ReadonlyMap<number, Shell>;
  supports: ReadonlyMap<number, Support>;
  groups: ReadonlyMap<number, { members: { quads?: number[]; plates?: number[] }; data?: Record<string, unknown> }>;
  constraints: readonly unknown[];
}

export interface RefinedMeshPlan {
  /** The nodes to add, by the engine's id, parents before children. */
  nodes: RefinedMesh['nodes'];
  /** Each shell to split, with what stands in its place. */
  shells: Array<{ kind: 'quad' | 'plate'; id: number; children: Array<{ nodes: number[]; weights: number[][] }> }>;
  frames: RefinedMesh['frames'];
  /** The support of each new node that takes one, by the engine's id of the node. */
  supports: Array<{ nodeId: number; fields: Omit<Support, 'id' | 'nodeId'> }>;
  constraints: RefinedMesh['constraints'];
}

const SPRINGS = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'] as const;

/** A support another node can take as it is: nothing lumped at its node, nothing tied to a member. */
function copyable(s: Support): boolean {
  return SPRINGS.every((k) => !s[k]) && !s.curves && !s.uplift && s.dofLocalElementId === undefined;
}

function fieldsOf(s: Support): Omit<Support, 'id' | 'nodeId'> {
  const { id: _id, nodeId: _node, ...fields } = s;
  return fields;
}

const sameNodes = (a: readonly number[] | undefined, b: readonly number[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((n, i) => n === b[i]);

/** A value as text that does not depend on the order its keys were written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function planRefinedMesh(model: RefinableModel, wire: Record<string, any>, mesh: RefinedMesh): RefinedMeshPlan | { refused: RefinedMeshRefusal } {
  if (mesh.shells.length === 0) return { refused: 'nothing' };
  if (canonical(model.constraints) !== canonical(wire.constraints ?? [])) return { refused: 'stale' };
  const added = new Set(mesh.nodes.map((n) => n.id));
  const known = (id: number) => added.has(id) || model.nodes.has(id);
  const asSolved = (id: number) => {
    const here = model.nodes.get(id), there = wire.nodes?.[id];
    return !!here && !!there && here.x === there.x && here.y === there.y && (here.z ?? 0) === there.z;
  };

  const physical = { quads: new Set<number>(), plates: new Set<number>() };
  for (const g of model.groups.values()) {
    if (g.data?.surface === undefined) continue;
    for (const id of g.members.quads ?? []) physical.quads.add(id);
    for (const id of g.members.plates ?? []) physical.plates.add(id);
  }

  const shells = new Map<string, RefinedMeshPlan['shells'][number]>();
  for (const s of mesh.shells) {
    const kind = s.family === 'plate' ? 'plate' : s.family === 'quad' || s.family === 'curvedShell' ? 'quad' : null;
    if (kind === null) return { refused: 'stale' };
    const key = `${kind}${s.parent}`;
    let entry = shells.get(key);
    if (!entry) {
      const declared = (kind === 'plate' ? model.plates : model.quads).get(s.parent);
      const solved = (s.family === 'plate' ? wire.plates : s.family === 'quad' ? wire.quads : wire.curvedShells)?.[s.parent];
      if (!declared || !sameNodes(declared.nodes, solved?.nodes) || !declared.nodes.every(asSolved)
        || (kind === 'quad' && !!declared.curved !== (s.family === 'curvedShell'))) return { refused: 'stale' };
      if ((kind === 'plate' ? physical.plates : physical.quads).has(s.parent)) return { refused: 'physicalPlate' };
      entry = { kind, id: s.parent, children: [] };
      shells.set(key, entry);
    }
    if (s.weights.length !== s.nodes.length || !s.nodes.every(known)) return { refused: 'stale' };
    entry.children.push({ nodes: s.nodes, weights: s.weights });
  }

  const onMembers = new Set<number>();
  for (const f of mesh.frames) {
    const declared = model.elements.get(f.parent), solved = wire.elements?.[f.parent];
    if (!declared || !solved || declared.nodeI !== solved.nodeI || declared.nodeJ !== solved.nodeJ || !f.nodes.every((n) => added.has(n))) return { refused: 'stale' };
    if (declared.variableSection || declared.arc || f.nodes.some((n) => onMembers.has(n))) return { refused: 'member' };
    for (const n of f.nodes) onMembers.add(n);
  }

  const held = new Map<number, Omit<Support, 'id' | 'nodeId'>>();
  for (const s of model.supports.values()) if (copyable(s)) held.set(s.nodeId, fieldsOf(s));
  const between = new Map(mesh.nodes.map((n) => [n.id, n.between]));
  const supports: RefinedMeshPlan['supports'] = [];
  for (const s of [...mesh.supports].sort((a, b) => a.nodeId - b.nodeId)) {
    const ends = between.get(s.nodeId);
    const [a, b] = ends ? [held.get(ends[0]), held.get(ends[1])] : [];
    let fields: Omit<Support, 'id' | 'nodeId'>;
    if (a && b && canonical(a) === canonical(b)) fields = a;
    else if (s.plain && s.restrained.length === 6) {
      const [tx, ty, tz, rx, ry, rz] = s.restrained as [boolean, boolean, boolean, boolean, boolean, boolean];
      fields = { type: 'custom3d', dofRestraints: { tx, ty, tz, rx, ry, rz } };
    } else return { refused: 'support' };
    held.set(s.nodeId, fields);
    supports.push({ nodeId: s.nodeId, fields });
  }

  if (!mesh.constraints.every((terms) => terms.every((term) => known(term.nodeId)))) return { refused: 'stale' };
  return { nodes: mesh.nodes, shells: [...shells.values()], frames: mesh.frames, supports, constraints: mesh.constraints };
}

/** A load's value at each corner of a part of the shell it was given on. */
export function cornerValues(weights: readonly (readonly number[])[], values: readonly number[]): number[] {
  return weights.map((row) => row.reduce((sum, w, i) => sum + w * (values[i] ?? 0), 0));
}
