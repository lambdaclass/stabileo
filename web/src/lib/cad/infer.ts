// Real-DXF inference helpers (PR [14] Layer 2).
//
// Promotes the intelligence previously trapped in
// scripts/build-cad-dxf-examples.ts into shipped, user-confirmable code.
// Everything here is deterministic and pure. NONE of it runs automatically:
// the wizard exposes each step as an explicit, off-by-default toggle, and
// every inferred action returns a count so the caller can record it in the
// provenance/assumptions (honesty rule — never silently invent structure).
//
//   cropDoc                         — keep only entities inside a plan window
//   densestPlanWindow               — propose a crop window (densest cluster)
//   cluster                         — 1-D value clustering (grid-line finder)
//   panelsFromBeamGrid              — infer slab panels from an orthogonal
//                                     beam/column grid (INVENTS slabs — opt-in)
//   snapPanelCornersToColumns       — weld inferred panel corners to columns
//   pruneBeamsDisconnectedFromColumns — drop annotation strokes on beam layers
//   pruneFloating                   — drop generated members not reachable
//                                     from a support (single connected graph)

import type { ArchPlan, ArchSlab, CadDocument, CadPt } from './types';
import type { ModelSnapshot } from '../store/history.svelte';

export interface PlanWindow {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Keep only the entities fully inside `win` (raw DXF units, pre unit-scale).
 *  A plan window isolates the structural plan from sections/elevations/
 *  schedules that share the same modelspace. */
export function cropDoc(doc: CadDocument, win: PlanWindow): CadDocument {
  // Normalize reversed bounds (x0>x1 / y0>y1) so a window typed in either order
  // crops the same region — the preview overlay already normalizes, and without
  // this an inverted window silently extracts nothing (→ cad.nothingClassified).
  const lx = Math.min(win.x0, win.x1), hx = Math.max(win.x0, win.x1);
  const ly = Math.min(win.y0, win.y1), hy = Math.max(win.y0, win.y1);
  const inside = (p: CadPt) => p.x >= lx && p.x <= hx && p.y >= ly && p.y <= hy;
  const entities = doc.entities.filter((e) => {
    switch (e.kind) {
      case 'line': return inside(e.a) && inside(e.b);
      case 'polyline': return e.pts.every(inside);
      case 'arc': case 'circle': return inside(e.center);
      case 'insert': return inside(e.at);
      case 'text': return inside(e.at);
    }
  });
  // Recompute the bbox of the cropped set so previews/unit hints stay correct.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    const pts: CadPt[] =
      e.kind === 'line' ? [e.a, e.b]
      : e.kind === 'polyline' ? e.pts
      : e.kind === 'arc' || e.kind === 'circle'
        ? [{ x: e.center.x - e.r, y: e.center.y - e.r }, { x: e.center.x + e.r, y: e.center.y + e.r }]
      : e.kind === 'insert' ? (e.bbox
          ? [{ x: e.bbox.minX, y: e.bbox.minY }, { x: e.bbox.maxX, y: e.bbox.maxY }]
          : [e.at])
      : [e.at];
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const bbox = entities.length ? { minX, minY, maxX, maxY } : null;
  return { ...doc, entities, bbox };
}

/** Cluster scalar values within `tol`; returns sorted cluster centres. */
export function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

/**
 * Propose a plan window by finding the densest rectangular cluster of entity
 * anchor points. Real modelspaces hold the plan plus sections/elevations far
 * to the side; the plan is the densest blob. Returns null when there is not
 * enough geometry to be meaningful (caller keeps the full extent).
 *
 * Strategy: histogram entity centres on a coarse grid, take the modal cell,
 * then grow the window to include every centre within `reach` of the kept set
 * (single linkage). Deterministic.
 */
export function densestPlanWindow(doc: CadDocument, opts?: { reach?: number }): PlanWindow | null {
  const centres: CadPt[] = [];
  for (const e of doc.entities) {
    switch (e.kind) {
      case 'line': centres.push({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }); break;
      case 'polyline': {
        let x = 0, y = 0;
        for (const p of e.pts) { x += p.x; y += p.y; }
        centres.push({ x: x / e.pts.length, y: y / e.pts.length });
        break;
      }
      case 'arc': case 'circle': centres.push({ ...e.center }); break;
      case 'insert': centres.push({ ...e.at }); break;
      case 'text': centres.push({ ...e.at }); break;
    }
  }
  if (centres.length < 8 || !doc.bbox) return null;

  const reach = opts?.reach ?? Math.max(doc.bbox.maxX - doc.bbox.minX, doc.bbox.maxY - doc.bbox.minY) / 20;
  // Coarse histogram → modal cell as the seed.
  const cell = reach * 2;
  const key = (p: CadPt) => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
  const buckets = new Map<string, CadPt[]>();
  for (const c of centres) {
    const k = key(c);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c);
  }
  let seed: CadPt[] | null = null;
  for (const arr of buckets.values()) if (!seed || arr.length > seed.length) seed = arr;
  if (!seed) return null;

  // Grow the window to nearby centres (single linkage within `reach`).
  let win: PlanWindow = {
    x0: Math.min(...seed.map((p) => p.x)), x1: Math.max(...seed.map((p) => p.x)),
    y0: Math.min(...seed.map((p) => p.y)), y1: Math.max(...seed.map((p) => p.y)),
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of centres) {
      const insideNow = c.x >= win.x0 && c.x <= win.x1 && c.y >= win.y0 && c.y <= win.y1;
      if (insideNow) continue;
      const near =
        c.x >= win.x0 - reach && c.x <= win.x1 + reach &&
        c.y >= win.y0 - reach && c.y <= win.y1 + reach;
      if (near) {
        win = {
          x0: Math.min(win.x0, c.x), x1: Math.max(win.x1, c.x),
          y0: Math.min(win.y0, c.y), y1: Math.max(win.y1, c.y),
        };
        grew = true;
      }
    }
  }
  // Pad slightly so boundary geometry is included.
  return { x0: win.x0 - reach / 2, x1: win.x1 + reach / 2, y0: win.y0 - reach / 2, y1: win.y1 + reach / 2 };
}

export interface BeamGridSlabs {
  slabs: ArchSlab[];
  xs: number[];
  ys: number[];
  dropped: number;
}

/**
 * Derive slab panels from an orthogonal beam grid: cells between adjacent
 * beam/column axis lines, kept only when at least `minEdges` of the 4 cell
 * edges are actually covered (≥50 %) by a beam. This INVENTS slabs that are
 * not drawn — the caller must make it opt-in and record it as an assumption.
 * Deterministic.
 */
export function panelsFromBeamGrid(
  beams: ArchPlan['beams'],
  columns: ArchPlan['columns'],
  axisTol = 0.1,
  clusterTol = 0.3,
  minEdges = 2,
): BeamGridSlabs {
  const hor = beams.filter((b) => Math.abs(b.a.y - b.b.y) <= axisTol);
  const ver = beams.filter((b) => Math.abs(b.a.x - b.b.x) <= axisTol);
  // Grid lines pinned to COLUMN centres first (the true axes — panel corners
  // must weld to column nodes); beam-line clusters only add lines not already
  // near a column line (mixed face/centerline clusters land a few cm off).
  const colXs = cluster(columns.map((c) => c.at.x), clusterTol);
  const colYs = cluster(columns.map((c) => c.at.y), clusterTol);
  const merge = (primary: number[], secondary: number[]) => {
    const out = [...primary];
    for (const v of secondary) {
      if (!out.some((p) => Math.abs(p - v) <= clusterTol + 0.05)) out.push(v);
    }
    return out.sort((a, b) => a - b);
  };
  const ys = merge(colYs, cluster(hor.map((b) => (b.a.y + b.b.y) / 2), clusterTol));
  const xs = merge(colXs, cluster(ver.map((b) => (b.a.x + b.b.x) / 2), clusterTol));

  const covered = (lineVal: number, from: number, to: number, beamsOnAxis: typeof beams, horizontal: boolean): number => {
    let cov = 0;
    for (const bm of beamsOnAxis) {
      const v = horizontal ? (bm.a.y + bm.b.y) / 2 : (bm.a.x + bm.b.x) / 2;
      if (Math.abs(v - lineVal) > clusterTol) continue;
      const lo = horizontal ? Math.min(bm.a.x, bm.b.x) : Math.min(bm.a.y, bm.b.y);
      const hi = horizontal ? Math.max(bm.a.x, bm.b.x) : Math.max(bm.a.y, bm.b.y);
      cov += Math.max(0, Math.min(hi, to) - Math.max(lo, from));
    }
    return to - from > 1e-9 ? cov / (to - from) : 0;
  };

  const slabs: ArchSlab[] = [];
  let dropped = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      const edges = [
        covered(y0, x0, x1, hor, true) >= 0.5,
        covered(y1, x0, x1, hor, true) >= 0.5,
        covered(x0, y0, y1, ver, false) >= 0.5,
        covered(x1, y0, y1, ver, false) >= 0.5,
      ].filter(Boolean).length;
      if (edges >= minEdges) {
        slabs.push({
          outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
          isQuad: true,
          isRectilinear: true,
        });
      } else {
        dropped++;
      }
    }
  }
  return { slabs, xs, ys, dropped };
}

/**
 * Snap slab-panel corners to the nearest column centre within `r` so panel
 * corner nodes weld to column nodes even on irregular (stepped) column lines.
 * Adjacent panels share grid intersections, so a shared corner snaps to the
 * same column and stays shared. Mutates the slab outlines in place; returns
 * the number of corners moved.
 */
export function snapPanelCornersToColumns(slabs: ArchSlab[], columns: ArchPlan['columns'], r = 0.25): number {
  let snapped = 0;
  for (const s of slabs) {
    for (const p of s.outline) {
      let best: CadPt | null = null;
      let bestD = r;
      for (const c of columns) {
        const d = Math.hypot(c.at.x - p.x, c.at.y - p.y);
        if (d < bestD) { bestD = d; best = c.at; }
      }
      if (best && bestD > 1e-9) { p.x = best.x; p.y = best.y; snapped++; }
    }
  }
  return snapped;
}

/**
 * Drop beam fragments not connected (directly or through other beams) to any
 * column. Real structural CADs carry annotation strokes / leader lines on beam
 * layers; once extracted they would float and make the model singular. Beams
 * connect by shared endpoints or T-joints (endpoint on another beam's
 * interior); anchors are column footprints (endpoint or interior). Mutates
 * `plan.beams` in place; returns the number of fragments dropped.
 */
export function pruneBeamsDisconnectedFromColumns(plan: ArchPlan, tol: number): number {
  const beams = plan.beams;
  const n = beams.length;
  if (n === 0) return 0;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };

  const near = (p: CadPt, q: CadPt) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  const touches = (p: CadPt, b: { a: CadPt; b: CadPt }) => {
    if (near(p, b.a) || near(p, b.b)) return true;
    const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) return false;
    const t = ((p.x - b.a.x) * dx + (p.y - b.a.y) * dy) / L2;
    if (t < 0 || t > 1) return false;
    const px = b.a.x + t * dx, py = b.a.y + t * dy;
    return Math.hypot(px - p.x, py - p.y) <= tol;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (touches(beams[i].a, beams[j]) || touches(beams[i].b, beams[j]) ||
          touches(beams[j].a, beams[i]) || touches(beams[j].b, beams[i])) {
        union(i, j);
      }
    }
  }

  const touchesColumn = (c: { at: CadPt; b?: number; h?: number }, bm: { a: CadPt; b: CadPt }) => {
    const r = Math.max(c.b ?? 0.3, c.h ?? 0.3) / 2 + tol;
    const dx = bm.b.x - bm.a.x, dy = bm.b.y - bm.a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) return near(c.at, bm.a);
    let t = ((c.at.x - bm.a.x) * dx + (c.at.y - bm.a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = bm.a.x + t * dx, py = bm.a.y + t * dy;
    return Math.hypot(px - c.at.x, py - c.at.y) <= r;
  };
  const anchored = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (plan.columns.some((c) => touchesColumn(c, beams[i]))) anchored.add(find(i));
  }
  const kept = beams.filter((_, i) => anchored.has(find(i)));
  const dropped = n - kept.length;
  plan.beams = kept;
  return dropped;
}

export interface FloatingPruneResult {
  nodes: number;
  elements: number;
  quads: number;
  supports: number;
}

/**
 * Drop everything in the snapshot not reachable from the largest connected
 * component (shared-node connectivity over frame elements and quad edges).
 * Sloppy face-line stubs end up a few cm off-axis and weld to nothing; left
 * in, they make the model singular. Mutates the snapshot in place; returns the
 * counts removed so the caller can record them. A no-op on an already-connected
 * model.
 */
export function pruneFloating(snap: ModelSnapshot): FloatingPruneResult {
  if (snap.nodes.length === 0) return { nodes: 0, elements: 0, quads: 0, supports: 0 };
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const [, e] of snap.elements) link(e.nodeI, e.nodeJ);
  for (const [, q] of snap.quads ?? []) {
    for (let i = 0; i < 4; i++) link(q.nodes[i], q.nodes[(i + 1) % 4]);
  }
  const compOf = new Map<number, number>();
  let comp = 0;
  for (const [, n0] of snap.nodes) {
    if (compOf.has(n0.id)) continue;
    comp++;
    const stack = [n0.id];
    while (stack.length) {
      const n = stack.pop()!;
      if (compOf.has(n)) continue;
      compOf.set(n, comp);
      for (const m of adj.get(n) ?? []) if (!compOf.has(m)) stack.push(m);
    }
  }
  const sizes = new Map<number, number>();
  for (const c of compOf.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  // Keep a single connected component, but prefer the SUPPORTED structure: pick
  // the largest component that contains a support, so a dense-but-foundation-less
  // blob (annotation cluster) can't win a pure size race and strand the real,
  // grounded frame. Only when nothing is supported do we fall back to the
  // largest component overall. Staying single-component keeps the shipped
  // inference path from producing a disconnected model.
  const supportedComps = new Set<number>();
  for (const [, sup] of snap.supports) {
    const c = compOf.get(sup.nodeId);
    if (c !== undefined) supportedComps.add(c);
  }
  const rankBySize = (a: [number, number], b: [number, number]) => b[1] - a[1];
  const supportedRanked = [...sizes.entries()].filter(([c]) => supportedComps.has(c)).sort(rankBySize);
  const keep = supportedRanked.length > 0
    ? supportedRanked[0][0]
    : [...sizes.entries()].sort(rankBySize)[0][0];
  const reachable = new Set<number>([...compOf.entries()].filter(([, c]) => c === keep).map(([n]) => n));

  const beforeN = snap.nodes.length, beforeE = snap.elements.length;
  const beforeQ = (snap.quads ?? []).length, beforeS = snap.supports.length;
  snap.nodes = snap.nodes.filter(([, n]) => reachable.has(n.id));
  snap.elements = snap.elements.filter(([, e]) => reachable.has(e.nodeI) && reachable.has(e.nodeJ));
  snap.supports = snap.supports.filter(([, sup]) => reachable.has(sup.nodeId));
  snap.quads = (snap.quads ?? []).filter(([, q]) => q.nodes.every((n) => reachable.has(n)));
  const quadIds = new Set((snap.quads ?? []).map(([id]) => id));
  snap.loads = snap.loads.filter((l) => {
    const d = l.data as { quadId?: number };
    return d.quadId === undefined || quadIds.has(d.quadId);
  });
  return {
    nodes: beforeN - snap.nodes.length,
    elements: beforeE - snap.elements.length,
    quads: beforeQ - (snap.quads ?? []).length,
    supports: beforeS - snap.supports.length,
  };
}
