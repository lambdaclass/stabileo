import type { Footing } from '../footing';
import type { ModelGroup, StructureModel } from '../../store/model.svelte';

type WallMesh = Pick<StructureModel, 'nodes' | 'quads' | 'plates'>;
type WallSupports = WallMesh & Pick<StructureModel, 'groups' | 'supports'>;

function wallCells(model: WallMesh, group: ModelGroup): number[][] {
  return [
    ...(group.members.quads ?? []).map(id => model.quads.get(id)?.nodes ?? []),
    ...(group.members.plates ?? []).map(id => model.plates.get(id)?.nodes ?? []),
  ];
}

function lowestNodes(model: WallMesh, cells: number[][]): Set<number> {
  const nodes = new Set(cells.flat().filter(id => model.nodes.has(id)));
  let bottom = Infinity;
  for (const id of nodes) bottom = Math.min(bottom, model.nodes.get(id)!.z ?? 0);
  for (const id of nodes) if (Math.abs((model.nodes.get(id)!.z ?? 0) - bottom) >= 1e-3) nodes.delete(id);
  return nodes;
}

export function wallBase(model: WallMesh, group: ModelGroup, outline: () => number[]): number[] {
  const cells = wallCells(model, group);
  return [...lowestNodes(model, cells.some(cell => cell.length) ? cells : [outline()])];
}

function baseEdges(model: WallMesh, group: ModelGroup) {
  const cells = wallCells(model, group);
  const base = lowestNodes(model, cells);
  const edges = new Map<number, Set<number>>();
  for (const cell of cells) for (let i = 0; i < cell.length; i++) {
    const a = cell[i]!, b = cell[(i + 1) % cell.length]!;
    if (!base.has(a) || !base.has(b) || a === b) continue;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  }
  return edges;
}

function intermediateSupports(edges: Map<number, Set<number>>, anchors: Set<number>, claims: Set<number>, supports: Set<number>): number[] {
  const extra = new Set<number>();
  for (const start of anchors) for (const next of edges.get(start) ?? []) {
    const run = new Set<number>();
    let previous = start, node = next;
    while (!claims.has(node) && !run.has(node)) {
      const neighbours = edges.get(node)!;
      if (neighbours.size !== 2) break;
      run.add(node);
      const [a, b] = neighbours;
      const following = a === previous ? b! : a!;
      previous = node;
      node = following;
    }
    if (node !== start && anchors.has(node)) for (const id of run) if (supports.has(id)) extra.add(id);
  }
  return [...extra];
}

export function wallStripAnchors(model: WallSupports & Pick<StructureModel, 'footings'>, wall: number, nodes: number[]): number[] {
  const group = model.groups.get(wall);
  if (!group || nodes.length <= 2) return nodes;
  const edges = baseEdges(model, group);
  const supported = new Set([...model.supports.values()].map(s => s.nodeId));
  const explicit = new Set([...model.footings.values()].flatMap(f => [f.nodeId, ...(f.supportedNodeIds ?? [])]));
  const anchors = nodes.filter((n, i) => !i || edges.get(n)?.size !== 2 || !supported.has(n) || explicit.has(n));
  const endpoints = new Set(anchors);
  const interior = intermediateSupports(edges, endpoints, endpoints, supported);
  return anchors.length + interior.length === nodes.length ? anchors : nodes;
}

export function resolveWallStrips(model: WallSupports, footings: Map<number, Footing>): Map<number, Footing> {
  const strips = [...footings.values()].filter(f => f.kind === 'strip' && f.wallGroupId !== undefined && f.supportedNodeIds?.length);
  if (!strips.length) return footings;
  const claims = new Set([...footings.values()].flatMap(f => [f.nodeId, ...(f.supportedNodeIds ?? [])]));
  const supported = new Set([...model.supports.values()].map(s => s.nodeId));
  const walls = new Map<number, ReturnType<typeof baseEdges>>();
  let resolved = footings;
  for (const f of strips) {
    const group = model.groups.get(f.wallGroupId!);
    if (!group) continue;
    if (!walls.has(group.id)) walls.set(group.id, baseEdges(model, group));
    const anchors = new Set([f.nodeId, ...f.supportedNodeIds!]);
    const extra = intermediateSupports(walls.get(group.id)!, anchors, claims, supported);
    if (!extra.length) continue;
    if (resolved === footings) resolved = new Map(footings);
    resolved.set(f.id, { ...f, supportedNodeIds: [...f.supportedNodeIds!, ...extra] });
  }
  return resolved;
}
