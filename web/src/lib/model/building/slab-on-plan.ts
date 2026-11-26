import { modelStore } from '../../store/model.svelte';
import { createPlate } from '../../store/physical-plates';
import type { Level } from '../grid';
import { PHYSICAL_GROUP_KIND } from '../physical/types';
import { nextName } from './declare';
import { beamsAtLevel, nodeFinder, type P2 } from './draw-on-plan';

function wallsAtLevel(z: number): Array<{ A: P2; B: P2; width: number }> {
  const out: Array<{ A: P2; B: P2; width: number }> = [];
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== PHYSICAL_GROUP_KIND || (g.data as { kind?: string } | undefined)?.kind !== 'wall') continue;
    const ids = new Set<number>(g.members.nodes ?? []);
    for (const q of g.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) ids.add(n);
    for (const q of g.members.plates ?? []) for (const n of modelStore.plates.get(q)?.nodes ?? []) ids.add(n);
    const pts = [...ids].map((i) => modelStore.nodes.get(i)).filter((n) => n && Math.abs((n.z ?? 0) - z) < 1e-6).map((n) => ({ x: n!.x, y: n!.y }));
    let best: [P2, P2] | null = null, far = 0;
    for (const p of pts) for (const q of pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > far) { far = d; best = [p, q]; } }
    const t = (g.data as { surface?: { thickness?: number } } | undefined)?.surface?.thickness ?? 0.2;
    if (best && far > 0.05) out.push({ A: best[0], B: best[1], width: t });
  }
  return out;
}

export type EdgeSupport = 'beam' | 'wall' | 'free';
export interface SlabEdge { a: P2; b: P2; support: EdgeSupport; line?: { a: P2; b: P2 } }

/** How much of the edge `a`→`b` runs inside the band of width `w` about the line `A`→`B`, as intervals of the edge's [0, 1]. */
function along(a: P2, b: P2, A: P2, B: P2, w: number): [number, number] | null {
  const L = Math.hypot(b.x - a.x, b.y - a.y), M = Math.hypot(B.x - A.x, B.y - A.y);
  if (L < 1e-9 || M < 1e-9) return null;
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, s = { x: (B.x - A.x) / M, y: (B.y - A.y) / M };
  if (Math.abs(t.x * s.y - t.y * s.x) > Math.sin((3 * Math.PI) / 180)) return null;
  const off = (p: P2) => Math.abs((p.x - A.x) * -s.y + (p.y - A.y) * s.x);
  const band = w / 2 + 0.02;
  if (off(a) > band || off(b) > band) return null;
  const u = (p: P2) => ((p.x - a.x) * t.x + (p.y - a.y) * t.y) / L;
  const lo = Math.max(0, Math.min(u(A), u(B))), hi = Math.min(1, Math.max(u(A), u(B)));
  return hi - lo > 1e-6 ? [lo, hi] : null;
}

/** Whether the intervals cover [0, 1] to within a few centimetres of an edge `L` long. */
function covers(spans: Array<[number, number]>, L: number): boolean {
  const gap = 0.05 / Math.max(L, 1e-9);
  let reach = 0;
  for (const [lo, hi] of [...spans].sort((p, q) => p[0] - q[0])) { if (lo > reach + gap) return false; reach = Math.max(reach, hi); }
  return reach >= 1 - gap;
}

/**
 * Each side of a slab drawn on level `z`: carried along its whole length by beams (their bands as
 * drawn), by walls, or free. A beam's side also gives the line through its nodes, where the slab's
 * edge goes so its mesh shares the beam's nodes.
 */
export function slabFraming(corners: readonly P2[], z: number): SlabEdge[] {
  const beams = beamsAtLevel(z), walls = wallsAtLevel(z);
  return corners.map((a, k) => {
    const b = corners[(k + 1) % corners.length]!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const onBeams = beams.map((bm) => ({ bm, span: along(a, b, bm.A, bm.B, bm.width) })).filter((x) => x.span);
    if (onBeams.length && covers(onBeams.map((x) => x.span!), L)) {
      const bm = onBeams[0]!.bm;
      return { a, b, support: 'beam' as const, line: { a: bm.a, b: bm.b } };
    }
    const onWalls = walls.map((w) => along(a, b, w.A, w.B, w.width)).filter((s): s is [number, number] => s !== null);
    if (onWalls.length && covers(onWalls, L)) return { a, b, support: 'wall' as const };
    return { a, b, support: 'free' as const };
  });
}

function meet(p: { a: P2; b: P2 }, q: { a: P2; b: P2 }): P2 | null {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / den;
  return { x: p.a.x + r.x * t, y: p.a.y + r.y * t };
}

export interface SlabOnPlan { corners: P2[]; level: Level; thickness: number; materialId: number; typology?: string }
export interface SlabPlaced { created: number; groupId?: number; edges: SlabEdge[]; refused?: 'size' | 'shape' }

/**
 * A slab drawn on the plan as a rectangle, on its level: a side carried by a beam is moved onto the
 * beam's line through its nodes, so the slab's mesh takes the beam's nodes; a free side stays where
 * it was drawn. Declared one physical slab with the support of each side.
 */
export function placeSlabOnPlan(d: SlabOnPlan): SlabPlaced {
  const z = d.level.z;
  const edges = slabFraming(d.corners, z);
  const xs = d.corners.map((p) => p.x), ys = d.corners.map((p) => p.y);
  if (Math.max(...xs) - Math.min(...xs) < 0.1 || Math.max(...ys) - Math.min(...ys) < 0.1 || d.thickness < 0.01) return { created: 0, edges, refused: 'size' };
  const lines = edges.map((e) => e.line ?? { a: e.a, b: e.b });
  const corners = lines.map((l, k) => meet(lines[(k + lines.length - 1) % lines.length]!, l) ?? d.corners[k]!);
  const out: SlabPlaced = { created: 0, edges };
  modelStore.batch(() => {
    const nodeAt = nodeFinder();
    const outline = corners.map((p) => nodeAt(p.x, p.y, z));
    if (new Set(outline).size < 3) { out.refused = 'shape'; return; }
    const r = createPlate({ outline, materialId: d.materialId, thickness: d.thickness, name: nextName('L')() });
    if ('problem' in r) { out.refused = 'shape'; return; }
    const g = modelStore.model.groups.get(r.id);
    modelStore.setGroupData(r.id, {
      ...(g?.data ?? {}), kind: 'slab', levelFrom: d.level.id, levelTo: d.level.id,
      ...(d.typology ? { typology: d.typology } : {}), edges: edges.map((e) => e.support),
    });
    out.groupId = r.id;
    out.created = 1;
  });
  return out;
}
