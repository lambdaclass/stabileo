// Generated-model preview (PR [14] Layer 1).
//
// Renders the RcDraftResult snapshot — the model that will actually be applied
// — as a lightweight isometric wireframe, so the user verifies geometry (and
// SEES obvious failure states: floating members, orphan nodes, missing slabs)
// at step 4 instead of after Apply. Pure 2D canvas; no Three.js, no model
// coupling. The categorization is split out (draftPreviewStats) so it can be
// unit-tested without a canvas.

import type { ModelSnapshot } from '../store/history.svelte';

interface PNode { id: number; x: number; y: number; z: number }

const VERTICAL_DZ = 1e-6;

export interface DraftPreviewStats {
  nodes: number;
  /** Vertical frame members (dz ≠ 0) — columns. */
  columns: number;
  /** Non-vertical frame members — beams. */
  beams: number;
  /** Quads with all 4 nodes at one z — slab panels. */
  slabQuads: number;
  /** Quads spanning two z levels — wall panels. */
  wallQuads: number;
  supports: number;
  /** Nodes referenced by no element/quad/support — render as failure dots. */
  orphans: number;
  /** Distinct z levels present (floor count incl. base). */
  levels: number;
}

function nodeMap(snap: ModelSnapshot): Map<number, PNode> {
  const m = new Map<number, PNode>();
  for (const [, n] of snap.nodes) m.set(n.id, { id: n.id, x: n.x, y: n.y, z: n.z ?? 0 });
  return m;
}

/** Categorize snapshot geometry for the preview (canvas-free, testable). */
export function draftPreviewStats(snap: ModelSnapshot): DraftPreviewStats {
  const nodes = nodeMap(snap);
  let columns = 0, beams = 0, slabQuads = 0, wallQuads = 0;
  for (const [, e] of snap.elements) {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    if (!a || !b) continue;
    if (Math.abs(a.z - b.z) > VERTICAL_DZ) columns++; else beams++;
  }
  for (const [, q] of snap.quads ?? []) {
    const zs = q.nodes.map((id) => nodes.get(id)?.z ?? 0);
    const flat = Math.max(...zs) - Math.min(...zs) <= VERTICAL_DZ;
    if (flat) slabQuads++; else wallQuads++;
  }
  const used = new Set<number>();
  for (const [, e] of snap.elements) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const [, q] of snap.quads ?? []) for (const n of q.nodes) used.add(n);
  for (const [, s] of snap.supports) used.add(s.nodeId);
  const orphans = [...nodes.values()].filter((n) => !used.has(n.id)).length;
  const levels = new Set([...nodes.values()].map((n) => Math.round(n.z * 1000) / 1000)).size;
  return {
    nodes: nodes.size, columns, beams, slabQuads, wallQuads,
    supports: snap.supports.length, orphans, levels,
  };
}

const COLORS = {
  column: '#e94560',
  beam: '#4ecdc4',
  slab: 'rgba(106,159,224,0.18)',
  slabEdge: '#6a9fe0',
  wall: 'rgba(240,165,0,0.20)',
  wallEdge: '#f0a500',
  support: '#9fe0b0',
  orphan: '#ff5d5d',
  bg: '#10101c',
};

/**
 * Draw the snapshot as an isometric wireframe. Optionally highlights orphan/
 * floating nodes in red so failure states are visually obvious. Returns the
 * same stats as draftPreviewStats for the caller to display.
 */
export function drawDraftPreview(
  canvas: HTMLCanvasElement,
  snap: ModelSnapshot,
  opts?: { highlightFailures?: boolean },
): DraftPreviewStats {
  const stats = draftPreviewStats(snap);
  const ctx = canvas.getContext('2d');
  if (!ctx) return stats;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const nodes = nodeMap(snap);
  if (nodes.size === 0) return stats;

  // Isometric projection: x right-down, y right-up, z up.
  const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
  const iso = (n: PNode) => ({ ix: (n.x - n.y) * COS, iy: (n.x + n.y) * SIN - n.z });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes.values()) {
    const p = iso(n);
    if (p.ix < minX) minX = p.ix;
    if (p.iy < minY) minY = p.iy;
    if (p.ix > maxX) maxX = p.ix;
    if (p.iy > maxY) maxY = p.iy;
  }
  const pad = 18;
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const k = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
  const ox = (W - k * bw) / 2 - k * minX;
  const oy = (H - k * bh) / 2 - k * minY;
  const SX = (p: { ix: number }) => ox + k * p.ix;
  const SY = (p: { iy: number }) => oy + k * p.iy;
  const P = (id: number) => { const n = nodes.get(id); return n ? iso(n) : null; };

  // Quads first (filled), then frames, then markers.
  ctx.lineWidth = 0.8;
  for (const [, q] of snap.quads ?? []) {
    const ps = q.nodes.map(P);
    if (ps.some((p) => !p)) continue;
    const zs = q.nodes.map((id) => nodes.get(id)!.z);
    const flat = Math.max(...zs) - Math.min(...zs) <= VERTICAL_DZ;
    ctx.beginPath();
    ctx.moveTo(SX(ps[0]!), SY(ps[0]!));
    for (let i = 1; i < ps.length; i++) ctx.lineTo(SX(ps[i]!), SY(ps[i]!));
    ctx.closePath();
    ctx.fillStyle = flat ? COLORS.slab : COLORS.wall;
    ctx.strokeStyle = flat ? COLORS.slabEdge : COLORS.wallEdge;
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineWidth = 1.4;
  for (const [, e] of snap.elements) {
    const a = P(e.nodeI), b = P(e.nodeJ);
    if (!a || !b) continue;
    const na = nodes.get(e.nodeI)!, nb = nodes.get(e.nodeJ)!;
    ctx.strokeStyle = Math.abs(na.z - nb.z) > VERTICAL_DZ ? COLORS.column : COLORS.beam;
    ctx.beginPath();
    ctx.moveTo(SX(a), SY(a));
    ctx.lineTo(SX(b), SY(b));
    ctx.stroke();
  }

  // Supports — small squares at base nodes.
  ctx.fillStyle = COLORS.support;
  for (const [, s] of snap.supports) {
    const p = P(s.nodeId);
    if (!p) continue;
    ctx.fillRect(SX(p) - 2.5, SY(p) - 2.5, 5, 5);
  }

  // Failure highlight: orphan / disconnected nodes in red.
  if (opts?.highlightFailures && stats.orphans > 0) {
    const used = new Set<number>();
    for (const [, e] of snap.elements) { used.add(e.nodeI); used.add(e.nodeJ); }
    for (const [, q] of snap.quads ?? []) for (const n of q.nodes) used.add(n);
    for (const [, s] of snap.supports) used.add(s.nodeId);
    ctx.fillStyle = COLORS.orphan;
    for (const n of nodes.values()) {
      if (used.has(n.id)) continue;
      const p = iso(n);
      ctx.beginPath();
      ctx.arc(SX(p), SY(p), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return stats;
}
