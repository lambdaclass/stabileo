/**
 * Read the physical elements off a model of bars and shells.
 *
 * A bar's role comes, in order, from what a person declared, from the generator that made it,
 * and last from its geometry, said as inferred. Collinear bars of one role that meet end to end
 * are one element: a beam continues through the columns that support it, and a column through
 * the floors it crosses. Coplanar shells that share an edge are one slab, or one wall per storey,
 * unless a bar runs along that edge: a beam closes a panel, a column ends a wall.
 * Pure: no store, no side effects.
 */
import type { Level } from '../grid';
import type { PhysicalDraft, PhysicalKind, PhysicalProvenance } from './types';

interface P3 { x: number; y: number; z?: number }

export interface RecognizeInput {
  nodes: ReadonlyMap<number, P3>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number }>;
  plates?: ReadonlyMap<number, { id: number; nodes: readonly number[]; thickness: number }>;
  quads?: ReadonlyMap<number, { id: number; nodes: readonly number[]; thickness: number }>;
  levels?: readonly Level[];
  /** Roles the generators recorded, by element id (`column`, `beam`, `rafter`, `purlin`, …). */
  generatorRoles?: ReadonlyMap<number, string>;
  /** Bars and shells already in a declared element: left as they are. */
  taken?: { elements: ReadonlySet<number>; plates: ReadonlySet<number>; quads: ReadonlySet<number> };
}

const TOL = 1e-6;
const z = (p: P3) => p.z ?? 0;

/** A generator's role, as the physical kind it is. */
export function kindOfRole(role: string): PhysicalKind {
  const r = role.toLowerCase();
  if (r.includes('column') || r.includes('post') || r.includes('pillar')) return 'column';
  if (r.includes('brace') || r.includes('diagonal') || r.includes('strut')) return 'brace';
  return 'beam';
}

/** A bar by its geometry: vertical a column, horizontal a beam, between them a brace. */
export function kindOfGeometry(a: P3, b: P3): PhysicalKind {
  const dz = Math.abs(z(b) - z(a));
  const h = Math.hypot(b.x - a.x, b.y - a.y);
  if (dz > h * 5.67) return 'column';      // within 10° of vertical
  if (dz < h * 0.0875) return 'beam';      // within 5° of horizontal
  return 'brace';
}

function unit(a: P3, b: P3): [number, number, number] {
  const d = [b.x - a.x, b.y - a.y, z(b) - z(a)] as [number, number, number];
  const l = Math.hypot(...d) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

/** The level an elevation sits at: the grid's own when one is within 2 cm, else `z:<m>`. */
export function levelAt(zv: number, levels: readonly Level[] = []): string {
  const hit = levels.find((l) => Math.abs(l.z - zv) < 0.02);
  return hit ? hit.id : `z:${(Math.round(zv * 1000) / 1000).toFixed(3)}`;
}

function unionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  return { find, union: (a: number, b: number) => { parent[find(a)] = find(b); } };
}

export function recognizePhysical(input: RecognizeInput): PhysicalDraft[] {
  const out: PhysicalDraft[] = [];
  const taken = input.taken;
  // ── Bars ──
  const bars = [...input.elements.values()]
    .filter((e) => !taken?.elements.has(e.id) && input.nodes.has(e.nodeI) && input.nodes.has(e.nodeJ))
    .sort((a, b) => a.id - b.id);
  const info = bars.map((e) => {
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const role = input.generatorRoles?.get(e.id);
    const kind = role ? kindOfRole(role) : kindOfGeometry(a, b);
    const provenance: PhysicalProvenance = role ? 'generator' : 'inferred';
    return { e, a, b, kind, provenance, dir: unit(a, b) };
  });
  const uf = unionFind(info.length);
  const byNode = new Map<number, number[]>();
  info.forEach((x, i) => {
    for (const n of [x.e.nodeI, x.e.nodeJ]) { const l = byNode.get(n); if (l) l.push(i); else byNode.set(n, [i]); }
  });
  for (const list of byNode.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = info[list[i]!]!, B = info[list[j]!]!;
        if (A.kind !== B.kind) continue;
        const dot = A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1] + A.dir[2] * B.dir[2];
        if (Math.abs(dot) > 0.9998) uf.union(list[i]!, list[j]!);   // within ~1.1°
      }
    }
  }
  const chains = new Map<number, number[]>();
  info.forEach((_, i) => { const r = uf.find(i); const c = chains.get(r); if (c) c.push(i); else chains.set(r, [i]); });
  for (const idx of chains.values()) {
    const xs = idx.map((i) => info[i]!);
    const zs = xs.flatMap((x) => [z(x.a), z(x.b)]);
    const kind = xs[0]!.kind;
    out.push({
      name: '', kind,
      provenance: xs.some((x) => x.provenance === 'generator') ? 'generator' : 'inferred',
      levelFrom: levelAt(Math.min(...zs), input.levels),
      levelTo: levelAt(Math.max(...zs), input.levels),
      elements: xs.map((x) => x.e.id).sort((a, b) => a - b),
      plates: [], quads: [],
    });
  }
  // ── Shells ──
  type Sh = { fam: 'plates' | 'quads'; id: number; nodes: readonly number[]; t: number };
  const shells: Sh[] = [
    ...[...(input.plates?.values() ?? [])].filter((s) => !taken?.plates.has(s.id)).map((s) => ({ fam: 'plates' as const, id: s.id, nodes: s.nodes, t: s.thickness })),
    ...[...(input.quads?.values() ?? [])].filter((s) => !taken?.quads.has(s.id)).map((s) => ({ fam: 'quads' as const, id: s.id, nodes: s.nodes, t: s.thickness })),
  ].filter((s) => s.nodes.every((n) => input.nodes.has(n)));
  const normal = (s: Sh): [number, number, number] => {
    const p = s.nodes.map((n) => input.nodes.get(n)!);
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!, b = p[(i + 1) % p.length]!;
      nx += (a.y - b.y) * (z(a) + z(b)); ny += (z(a) - z(b)) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const sInfo = shells.map((s) => {
    const n = normal(s);
    const p0 = input.nodes.get(s.nodes[0]!)!;
    const kind: PhysicalKind = Math.abs(n[2]) >= 0.85 ? 'slab' : Math.abs(n[2]) <= 0.15 ? 'wall' : 'slab';
    const ps = s.nodes.map((k) => input.nodes.get(k)!);
    return { s, n, kind, off: n[0] * p0.x + n[1] * p0.y + n[2] * z(p0), zmin: Math.min(...ps.map(z)), zmax: Math.max(...ps.map(z)) };
  });
  // Storey boundaries: the slabs' elevations. A wall is cut at each.
  const slabZ = [...new Set(sInfo.filter((x) => x.kind === 'slab').map((x) => Math.round(x.zmin * 1000) / 1000))].sort((a, b) => a - b);
  const storey = (zv: number) => { let s = -Infinity; for (const l of slabZ) if (l <= zv + TOL) s = l; return s; };
  /*
   * A bar along the edge two shells share is where one panel ends and the next begins: a beam
   * between two bays, a column between two walls. Joining across it made one slab of a whole
   * floor where the building tools make one per bay, and slab design then read the floor as a
   * single panel. Every bar counts here, a declared one too, because a boundary is geometry.
   */
  const barEdges = new Set<string>();
  for (const e of input.elements.values()) barEdges.add(e.nodeI < e.nodeJ ? `${e.nodeI}-${e.nodeJ}` : `${e.nodeJ}-${e.nodeI}`);
  const sharedEdgeIsBar = (a: readonly number[], b: readonly number[]): boolean => {
    for (let k = 0; k < a.length; k++) {
      const p = a[k]!, q = a[(k + 1) % a.length]!;
      if (!b.includes(p) || !b.includes(q)) continue;
      if (barEdges.has(p < q ? `${p}-${q}` : `${q}-${p}`)) return true;
    }
    return false;
  };
  const su = unionFind(sInfo.length);
  for (let i = 0; i < sInfo.length; i++) {
    for (let j = i + 1; j < sInfo.length; j++) {
      const A = sInfo[i]!, B = sInfo[j]!;
      if (A.kind !== B.kind || Math.abs(A.s.t - B.s.t) > TOL) continue;
      const dot = A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2];
      if (Math.abs(dot) < 0.999 || Math.abs(Math.abs(A.off) - Math.abs(B.off)) > 1e-3) continue;
      if (A.kind === 'wall' && storey(A.zmin) !== storey(B.zmin)) continue;
      if (A.s.nodes.filter((n) => B.s.nodes.includes(n)).length >= 2 && !sharedEdgeIsBar(A.s.nodes, B.s.nodes)) su.union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  sInfo.forEach((_, i) => { const r = su.find(i); const g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); });
  for (const idx of groups.values()) {
    const xs = idx.map((i) => sInfo[i]!);
    out.push({
      name: '', kind: xs[0]!.kind, provenance: 'inferred',
      levelFrom: levelAt(Math.min(...xs.map((x) => x.zmin)), input.levels),
      levelTo: levelAt(Math.max(...xs.map((x) => x.zmax)), input.levels),
      elements: [],
      plates: xs.filter((x) => x.s.fam === 'plates').map((x) => x.s.id).sort((a, b) => a - b),
      quads: xs.filter((x) => x.s.fam === 'quads').map((x) => x.s.id).sort((a, b) => a - b),
    });
  }
  return nameDrafts(out, input.levels);
}

/** C1, V1, D1, L1, M1 …: by kind, then by level, then by the lowest id, so names are stable. */
export function nameDrafts(drafts: PhysicalDraft[], levels: readonly Level[] = []): PhysicalDraft[] {
  const prefix: Record<string, string> = { column: 'C', beam: 'V', brace: 'D', slab: 'L', wall: 'M' };
  const zOf = (lv?: string) => {
    const l = levels.find((x) => x.id === lv);
    return l ? l.z : lv?.startsWith('z:') ? Number(lv.slice(2)) : 0;
  };
  const first = (d: PhysicalDraft) => Math.min(...d.elements, ...d.plates, ...d.quads);
  const counters = new Map<string, number>();
  return [...drafts]
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || zOf(a.levelFrom) - zOf(b.levelFrom) || first(a) - first(b))
    .map((d) => {
      const p = prefix[d.kind] ?? 'E';
      const n = (counters.get(p) ?? 0) + 1;
      counters.set(p, n);
      return { ...d, name: `${p}${n}` };
    });
}
