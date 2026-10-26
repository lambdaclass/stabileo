/**
 * The footings of an imported building, placed under what they carry once the model is in.
 *
 * A pad goes to the foot of the column standing in its plan (the nearest to its centre, where the
 * column's foot is at the pad's top within a few decimetres), a strip to the foot of the wall it
 * runs under. Each keeps its plan rectangle and rotation, its thickness and founding level, and its
 * offset from the node it carries as the eccentricity the design checks it with. The soil is the
 * project's: a file states none.
 */
import { modelStore } from '../store/model.svelte';
import { physicalGroups } from '../store/physical';
import type { IfcFootingRead } from './ifc-mapper';

export interface FootingsPlaced { placed: number; skipped: string[]; straps?: number }

/** The feet the footings can carry: the lowest node of each column, and the bottom nodes of each wall. */
function feet(): { columns: Array<{ node: number; element: number; x: number; y: number; z: number }>; walls: Array<{ node: number; x: number; y: number; z: number }> } {
  const m = modelStore.model;
  const columns: Array<{ node: number; element: number; x: number; y: number; z: number }> = [];
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 1e-6 || Math.abs((b.z ?? 0) - (a.z ?? 0)) < 1e-6) continue;
    const [lo, id] = (a.z ?? 0) < (b.z ?? 0) ? [a, e.nodeI] : [b, e.nodeJ];
    columns.push({ node: id, element: e.id, x: lo.x, y: lo.y, z: lo.z ?? 0 });
  }
  const walls: Array<{ node: number; x: number; y: number; z: number }> = [];
  for (const q of m.quads.values()) {
    const ps = q.nodes.map((n) => ({ n, p: m.nodes.get(n) })).filter((x): x is { n: number; p: NonNullable<typeof x.p> } => !!x.p);
    const zs = ps.map((x) => x.p.z ?? 0), lo = Math.min(...zs);
    if (Math.max(...zs) - lo < 1e-6) continue;
    for (const x of ps) if (Math.abs((x.p.z ?? 0) - lo) < 1e-6) walls.push({ node: x.n, x: x.p.x, y: x.p.y, z: lo });
  }
  return { columns, walls };
}

/** Where a wall's head shares nodes with a floor: that height over the footing's top, m. */
function proppedHeight(groupId: number, zTop: number): number | undefined {
  const m = modelStore.model;
  const g = physicalGroups().find((x) => x.id === groupId);
  if (!g) return undefined;
  const nodes = new Set((g.members.quads ?? []).flatMap((q) => m.quads.get(q)?.nodes ?? []));
  const zs = [...nodes].map((n) => m.nodes.get(n)?.z ?? 0);
  if (!zs.length) return undefined;
  const top = Math.max(...zs);
  const head = [...nodes].filter((n) => Math.abs((m.nodes.get(n)?.z ?? 0) - top) < 1e-6);
  const floorAt = [...m.quads.values()].some((q) => {
    const qz = q.nodes.map((n) => m.nodes.get(n)?.z ?? 0);
    return Math.max(...qz) - Math.min(...qz) < 1e-6 && q.nodes.some((n) => head.includes(n));
  });
  return floorAt && top - zTop > 0.5 ? top - zTop : undefined;
}

/** The physical wall whose shells hold a node. */
function wallGroupOf(node: number): number | undefined {
  const m = modelStore.model;
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'wall') continue;
    if ((g.members.quads ?? []).some((q) => m.quads.get(q)?.nodes.includes(node)) || (g.members.plates ?? []).some((p) => m.plates.get(p)?.nodes.includes(node))) return g.id;
  }
  return undefined;
}

export function placeFootings(footings: readonly IfcFootingRead[]): FootingsPlaced {
  const out: FootingsPlaced = { placed: 0, skipped: [] };
  if (!footings.length) return out;
  const { columns, walls } = feet();
  const taken = new Set<number>();
  for (const f of footings) {
    const t = (f.angle * Math.PI) / 180, u = { x: Math.cos(t), y: Math.sin(t) }, v = { x: -u.y, y: u.x };
    const local = (p: { x: number; y: number }) => {
      const dx = p.x - f.centre.x, dy = p.y - f.centre.y;
      return { b: dx * u.x + dy * u.y, l: dx * v.x + dy * v.y };
    };
    const inside = (p: { x: number; y: number }) => { const q = local(p); return Math.abs(q.b) <= f.length / 2 + 0.05 && Math.abs(q.l) <= f.width / 2 + 0.05; };
    const pool = f.kind === 'pad' ? columns : [...walls, ...columns.map((c) => ({ node: c.node, x: c.x, y: c.y, z: c.z }))];
    const near = pool
      .filter((c) => !taken.has(c.node) && inside(c) && Math.abs(c.z - f.zTop) < 0.35)
      .sort((p, q) => Math.hypot(p.x - f.centre.x, p.y - f.centre.y) - Math.hypot(q.x - f.centre.x, q.y - f.centre.y))[0];
    if (!near) { out.skipped.push(f.name); continue; }
    taken.add(near.node);
    // A strip carries every foot of its wall that stands on it, and says which wall that is.
    const others = f.kind === 'strip'
      ? pool.filter((c) => c.node !== near.node && !taken.has(c.node) && inside(c) && Math.abs(c.z - f.zTop) < 0.35).map((c) => c.node)
      : [];
    for (const n of others) taken.add(n);
    const wallGroup = f.kind === 'strip' ? wallGroupOf(near.node) : undefined;
    // A wall whose head is in a floor is propped there: the strip's offset across is that couple's.
    const prop = wallGroup !== undefined ? proppedHeight(wallGroup, f.zTop) : undefined;
    // The footing's centre from the node it carries, along its own axes.
    const e = local({ x: near.x, y: near.y });
    const id = modelStore.addFooting(near.node, f.name);
    modelStore.updateFooting(id, {
      kind: f.kind === 'pad' ? 'isolated' : 'strip',
      B: f.length, L: f.width, thickness: f.zTop - f.zBottom, rotationDeg: f.angle,
      eccentricityB: -e.b, eccentricityL: -e.l, foundingElevation: f.zBottom,
      ...('element' in near ? { columnElementId: (near as { element: number }).element } : {}),
      ...([...new Set(others)].length ? { supportedNodeIds: [...new Set(others)] } : {}),
      ...(wallGroup !== undefined ? { wallGroupId: wallGroup } : {}),
      ...(prop !== undefined ? { balanced: { by: 'structure', height: prop } } : {}),
    } as never);
    out.placed++;
  }
  out.straps = linkStraps();
  return out;
}

/**
 * Strap beams: a pad whose foot a foundation beam leaves, followed along that beam (straight on,
 * piece by piece) to the footing it reaches (one whose node it meets, or under whose plan it
 * ends: a strip's wall), is declared tied by it to that footing, with the beam's section and the
 * node it reaches. The design then reads what lies along each (`strap-footing.ts`).
 */
function linkStraps(): number {
  const m = modelStore.model;
  const strapIds = new Set<number>();
  for (const g of physicalGroups()) if (g.physical.kind === 'beam' && (g.physical.typology === 'foundation' || g.physical.typology === 'strap')) for (const id of g.members.elements ?? []) strapIds.add(id);
  if (!strapIds.size) return 0;
  const byNode = new Map<number, number[]>();
  for (const id of strapIds) { const e = m.elements.get(id); if (!e) continue; for (const n of [e.nodeI, e.nodeJ]) byNode.set(n, [...(byNode.get(n) ?? []), id]); }
  const footings = [...m.footings.values()];
  const carried = (f: (typeof footings)[number]) => [f.nodeId, ...(f.supportedNodeIds ?? [])];
  const footingAt = new Map(footings.flatMap((f) => carried(f).map((n) => [n, f] as const)));
  /** The footing under a point in plan, its rectangle from its node, offset and rotation. */
  const under = (p: { x: number; y: number }, not: number) => footings.find((f) => {
    const n = m.nodes.get(f.nodeId);
    if (!n || f.id === not) return false;
    const t = (f.rotationDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const cx = n.x + f.eccentricityB * c - f.eccentricityL * s, cy = n.y + f.eccentricityB * s + f.eccentricityL * c;
    const u = (p.x - cx) * c + (p.y - cy) * s, v = -(p.x - cx) * s + (p.y - cy) * c;
    return Math.abs(u) <= f.B / 2 + 0.05 && Math.abs(v) <= f.L / 2 + 0.05;
  });
  let linked = 0;
  for (const f of footings) {
    if (f.kind !== 'isolated') continue;
    const straps: NonNullable<typeof f.straps> = [];
    for (const first of byNode.get(f.nodeId) ?? []) {
      let node = f.nodeId, el = first, dir: { x: number; y: number } | null = null;
      let reached: { footing: (typeof footings)[number]; node: number } | null = null;
      for (let k = 0; k < 200 && !reached; k++) {
        const e = m.elements.get(el)!, next = e.nodeI === node ? e.nodeJ : e.nodeI;
        const a = m.nodes.get(node)!, b = m.nodes.get(next)!;
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        if (dir && d.x * dir.x + d.y * dir.y < 0.98) break;
        dir = dir ?? d; node = next;
        const g = footingAt.get(node);
        if (g && g.id !== f.id) { reached = { footing: g, node }; break; }
        const on = (byNode.get(node) ?? []).filter((x) => x !== el);
        const ahead = on.filter((x) => {
          const o = m.elements.get(x)!, q = m.nodes.get(o.nodeI === node ? o.nodeJ : o.nodeI)!, p = m.nodes.get(node)!;
          const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          return ((q.x - p.x) / l) * dir!.x + ((q.y - p.y) / l) * dir!.y >= 0.98;
        });
        if (!ahead.length) {
          // The beam ends: on the footing under its end, at the node of it nearest that end.
          const p = m.nodes.get(node)!, g2 = under(p, f.id);
          if (g2) {
            const best = carried(g2).reduce((x, y) => {
              const qx = m.nodes.get(x), qy = m.nodes.get(y);
              return qx && qy && Math.hypot(qy.x - p.x, qy.y - p.y) < Math.hypot(qx.x - p.x, qx.y - p.y) ? y : x;
            });
            reached = { footing: g2, node: best };
          }
          break;
        }
        el = ahead[0]!;
      }
      if (!reached || straps.some((x) => x.toFootingId === reached!.footing.id && (x.nodeId ?? reached!.footing.nodeId) === reached!.node)) continue;
      const sec = m.sections.get(m.elements.get(first)!.sectionId);
      straps.push({ toFootingId: reached.footing.id, ...(reached.node !== reached.footing.nodeId ? { nodeId: reached.node } : {}), ...(sec?.b ? { b: sec.b } : {}), ...(sec?.h ? { h: sec.h } : {}) });
    }
    if (straps.length) { modelStore.updateFooting(f.id, { straps }); linked += straps.length; }
  }
  return linked;
}
