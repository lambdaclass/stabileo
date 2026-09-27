/**
 * What in a model is likely a mistake, found rather than guessed at:
 *
 *   · loose parts: pieces connected to nothing that holds them (no support reaches them through
 *     members, shells, connectors or constraints);
 *   · free shell edges: an edge of one shell only, on no member (the slab's border where a beam
 *     was meant to be, or a gap between two meshes);
 *   · crossings without a node: members that cross and share nothing (`cut-members.ts`);
 *   · repeated properties: materials or sections identical in value under different ids.
 *
 * Findings only; the fixes are the edit panel's (select them, intersect, merge).
 */
import { crossingPairs } from './cut-members';

interface HModel {
  nodes: ReadonlyMap<number, unknown>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; materialId: number; sectionId: number }>;
  quads: ReadonlyMap<number, { nodes: readonly number[] }>;
  plates: ReadonlyMap<number, { nodes: readonly number[] }>;
  supports: ReadonlyMap<number, { nodeId: number }>;
  connectors?: ReadonlyMap<number, { nodeI: number; nodeJ: number }>;
  constraints?: ReadonlyArray<Record<string, unknown>>;
  materials: ReadonlyMap<number, { id: number; name: string; e: number; nu: number; rho: number; fy?: number }>;
  sections: ReadonlyMap<number, { id: number; name: string; a: number; iy?: number; iz: number; j?: number; b?: number; h?: number }>;
}

export interface LoosePart { nodes: number[]; elements: number[] }

/** The pieces no support reaches. */
export function looseParts(m: HModel): LoosePart[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let y = x; while (parent.get(y) !== r) { const n = parent.get(y)!; parent.set(y, r); y = n; } return r; };
  const join = (a: number, b: number) => { if (!parent.has(a) || !parent.has(b)) return; parent.set(find(a), find(b)); };
  for (const id of m.nodes.keys()) parent.set(id, id);
  for (const e of m.elements.values()) join(e.nodeI, e.nodeJ);
  for (const s of [...m.quads.values(), ...m.plates.values()]) for (let k = 1; k < s.nodes.length; k++) join(s.nodes[0]!, s.nodes[k]!);
  for (const c of m.connectors?.values() ?? []) join(c.nodeI, c.nodeJ);
  for (const c of m.constraints ?? []) {
    const master = c.masterNode as number | undefined;
    const others = [c.slaveNode, ...((c.slaveNodes as number[] | undefined) ?? []), ...(((c.terms as Array<{ nodeId: number }> | undefined) ?? []).map((t) => t.nodeId))].filter((x): x is number => typeof x === 'number');
    const first = master ?? others[0];
    if (first !== undefined) for (const o of others) join(first, o);
  }
  const held = new Set([...m.supports.values()].map((s) => find(s.nodeId)).filter((r) => r !== undefined));
  const parts = new Map<number, LoosePart>();
  const used = new Set<number>();
  for (const e of m.elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const s of [...m.quads.values(), ...m.plates.values()]) for (const n of s.nodes) used.add(n);
  for (const id of m.nodes.keys()) {
    if (!used.has(id)) continue; // an orphan node is the orphan check's, not a part
    const r = find(id);
    if (held.has(r)) continue;
    const p = parts.get(r) ?? { nodes: [], elements: [] };
    p.nodes.push(id);
    parts.set(r, p);
  }
  for (const e of m.elements.values()) { const p = parts.get(find(e.nodeI)); if (p) p.elements.push(e.id); }
  return [...parts.values()];
}

/** Shell edges belonging to one shell and to no member, as node pairs. */
export function freeShellEdges(m: HModel): Array<[number, number]> {
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const count = new Map<string, number>();
  for (const s of [...m.quads.values(), ...m.plates.values()]) {
    for (let k = 0; k < s.nodes.length; k++) {
      const kk = key(s.nodes[k]!, s.nodes[(k + 1) % s.nodes.length]!);
      count.set(kk, (count.get(kk) ?? 0) + 1);
    }
  }
  const onMember = new Set([...m.elements.values()].map((e) => key(e.nodeI, e.nodeJ)));
  return [...count].filter(([k, n]) => n === 1 && !onMember.has(k)).map(([k]) => k.split('-').map(Number) as [number, number]);
}

/** Members that cross without a node. */
export const unconnectedCrossings = (elementIds: Iterable<number>) => crossingPairs(elementIds);

/** Materials, and sections, identical in value under different ids: each set, first id kept. */
export function repeatedProperties(m: HModel): { materials: number[][]; sections: number[][] } {
  const r = (v: number | undefined) => (v === undefined ? '' : v.toPrecision(9));
  const groups = <T extends { id: number }>(items: Iterable<T>, sig: (x: T) => string) => {
    const by = new Map<string, number[]>();
    for (const x of items) { const k = sig(x); by.set(k, [...(by.get(k) ?? []), x.id]); }
    return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b));
  };
  return {
    materials: groups(m.materials.values(), (x) => [x.e, x.nu, x.rho, x.fy].map(r).join('|')),
    sections: groups(m.sections.values(), (x) => [x.a, x.iy, x.iz, x.j, x.b, x.h].map(r).join('|')),
  };
}
