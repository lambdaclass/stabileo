import type { JSONModel } from '../src/lib/templates/load-fixture';

type Node = JSONModel['nodes'][number];
type Quad = JSONModel['quads'][number];

export const CAD_END_WALLS_ASSUMPTION = 'End-wall shells share the slab and beam nodes at each floor. The base edge is fixed, including at its new mesh nodes.';

export function conformCadEndWalls(fixture: {
  nodes: Node[];
  quads: Quad[];
  supports: Array<{ id: number; nodeId: number; type: string }>;
  loads: ReadonlyArray<{ data: object }>;
}): void {
  const nodes = new Map(fixture.nodes.map(node => [node.id, node]));
  const slabIds = new Set<number>();
  const walls: Quad[] = [];
  for (const quad of fixture.quads) {
    if (quad.nodes.every(id => nodes.get(id)!.z === nodes.get(quad.nodes[0]!)!.z)) {
      for (const id of quad.nodes) slabIds.add(id);
    } else walls.push(quad);
  }
  const slabNodes = [...slabIds].map(id => nodes.get(id)!);
  const loaded = new Set(fixture.loads.flatMap(({ data }) => 'quadId' in data ? [data.quadId] : []));
  const fixed = new Set(fixture.supports.filter(s => s.type === 'fixed3d').map(s => s.nodeId));
  let nextNode = Math.max(...nodes.keys()) + 1;
  let nextSupport = Math.max(...fixture.supports.map(s => s.id)) + 1;
  let nextQuad = Math.max(...fixture.quads.map(q => q.id)) + 1;
  const added: Quad[] = [];
  for (const quad of walls) {
    const [a, b, c, d] = quad.nodes.map(id => nodes.get(id)!) as [Node, Node, Node, Node];
    if (a.x !== b.x || a.x !== c.x || a.x !== d.x || a.y !== d.y || b.y !== c.y
      || a.y === b.y || a.z !== b.z || c.z !== d.z || a.z >= c.z || loaded.has(quad.id)) {
      throw new Error(`Unexpected end-wall geometry or load on quad ${quad.id}`);
    }
    const direction = Math.sign(b.y - a.y);
    const stations = (z: number) => slabNodes.filter(n => n.x === a.x && n.z === z
      && direction * (n.y - a.y) > 0 && direction * (b.y - n.y) > 0)
      .sort((u, v) => direction * (u.y - v.y));
    const upper = stations(c.z);
    const lower = stations(a.z);
    if (a.z === 0 && !lower.length) {
      if (!fixed.has(a.id) || !fixed.has(b.id)) throw new Error(`Unexpected end-wall base at quad ${quad.id}`);
      for (const node of upper) {
        const base = { id: nextNode++, x: node.x, y: node.y, z: a.z };
        fixture.nodes.push(base);
        fixture.supports.push({ id: nextSupport++, nodeId: base.id, type: 'fixed3d' });
        lower.push(base);
      }
    }
    if (upper.length !== lower.length || upper.some((node, i) => node.y !== lower[i]!.y)) {
      throw new Error(`Unmatched floor stations at end-wall quad ${quad.id}`);
    }
    if (!upper.length) continue;
    const bottom = [a, ...lower, b];
    const top = [d, ...upper, c];
    for (let i = 0; i < bottom.length - 1; i++) {
      const ids = [bottom[i]!.id, bottom[i + 1]!.id, top[i + 1]!.id, top[i]!.id];
      if (i === 0) quad.nodes = ids;
      else added.push({ ...quad, id: nextQuad++, nodes: ids });
    }
  }
  fixture.quads.push(...added);
}
