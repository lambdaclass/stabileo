// Lightweight 2D canvas preview of a CadDocument, color-coded by layer role.
// Pure drawing — no model coupling, no Three.js. Used inside the CAD wizard.
//
// PR [14] QA polish: the preview is now pan/zoom-able, can overlay the crop
// window (dimming geometry outside it), and can highlight a single layer so the
// user can verify exactly which raw DXF layer maps to which role and what
// geometry it contributes. The view math lives in pure helpers (fitView,
// zoomAround, panView, screenToWorld, cropScreenRect) so it is unit-testable.

import type { ArchPlan, CadDocument, CadEntity, CadPt, LayerRole } from './types';

export const ROLE_COLORS: Record<LayerRole, string> = {
  column: '#e94560',
  beam: '#4ecdc4',
  wall: '#f0a500',
  slab: '#6a9fe0',
  opening: '#b06ae0',
  grid: '#666666',
  text: '#999999',
  ignore: '#3a3a4a',
};

/** Affine world→screen transform: sx = x·scale + offsetX, sy = −y·scale + offsetY
 *  (the −y flips CAD y-up into canvas y-down). */
export interface PreviewView {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface CropRect { x0: number; x1: number; y0: number; y1: number }

export interface BBoxLike { minX: number; minY: number; maxX: number; maxY: number }

/** Fit a bbox into a WxH canvas with uniform scale and centering (the classic
 *  "zoom to extents"). Returns the neutral/default view. */
export function fitView(bbox: BBoxLike, W: number, H: number, pad = 16): PreviewView {
  const bw = bbox.maxX - bbox.minX || 1;
  const bh = bbox.maxY - bbox.minY || 1;
  const scale = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
  const offsetX = (W - scale * bw) / 2 - scale * bbox.minX;
  const offsetY = (H + scale * bh) / 2 + scale * bbox.minY;
  return { scale, offsetX, offsetY };
}

/** Zoom by `factor` about screen point (sx, sy), keeping that point fixed. */
export function zoomAround(view: PreviewView, sx: number, sy: number, factor: number): PreviewView {
  const wx = (sx - view.offsetX) / view.scale;
  const wy = -(sy - view.offsetY) / view.scale;
  const scale = view.scale * factor;
  return { scale, offsetX: sx - wx * scale, offsetY: sy + wy * scale };
}

/** Translate the view by a screen-space delta (drag-to-pan). */
export function panView(view: PreviewView, dxScreen: number, dyScreen: number): PreviewView {
  return { scale: view.scale, offsetX: view.offsetX + dxScreen, offsetY: view.offsetY + dyScreen };
}

/** Invert the transform: screen px → world coordinates. */
export function screenToWorld(view: PreviewView, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.offsetX) / view.scale, y: -(sy - view.offsetY) / view.scale };
}

/** The crop window in screen pixels (normalized: positive width/height). */
export function cropScreenRect(
  view: PreviewView, crop: CropRect,
): { left: number; top: number; width: number; height: number } {
  const X = (x: number) => x * view.scale + view.offsetX;
  const Y = (y: number) => -y * view.scale + view.offsetY;
  const xs = [X(crop.x0), X(crop.x1)];
  const ys = [Y(crop.y0), Y(crop.y1)];
  const left = Math.min(xs[0], xs[1]);
  const right = Math.max(xs[0], xs[1]);
  const top = Math.min(ys[0], ys[1]);
  const bottom = Math.max(ys[0], ys[1]);
  return { left, top, width: right - left, height: bottom - top };
}

export interface DrawCadPreviewOptions {
  /** Explicit view; when omitted the doc is fit-to-extents. */
  view?: PreviewView | null;
  /** Draw the crop window overlay and dim everything outside it. */
  crop?: CropRect | null;
  /** Emphasize one raw DXF layer; every other layer is dimmed. */
  highlightLayer?: string | null;
}

function drawEntity(
  ctx: CanvasRenderingContext2D, e: CadEntity,
  X: (x: number) => number, Y: (y: number) => number, k: number,
): void {
  switch (e.kind) {
    case 'line':
      ctx.beginPath();
      ctx.moveTo(X(e.a.x), Y(e.a.y));
      ctx.lineTo(X(e.b.x), Y(e.b.y));
      ctx.stroke();
      break;
    case 'polyline': {
      ctx.beginPath();
      ctx.moveTo(X(e.pts[0].x), Y(e.pts[0].y));
      for (let i = 1; i < e.pts.length; i++) ctx.lineTo(X(e.pts[i].x), Y(e.pts[i].y));
      if (e.closed) ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'arc':
      ctx.beginPath();
      // Canvas y-flip mirrors angles: sweep the same angular interval CW.
      ctx.arc(X(e.center.x), Y(e.center.y), e.r * k, -e.endAngle, -e.startAngle);
      ctx.stroke();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(X(e.center.x), Y(e.center.y), e.r * k, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'insert':
      if (e.bbox) {
        ctx.strokeRect(
          X(e.bbox.minX), Y(e.bbox.maxY),
          k * (e.bbox.maxX - e.bbox.minX), k * (e.bbox.maxY - e.bbox.minY),
        );
      } else {
        ctx.beginPath();
        ctx.arc(X(e.at.x), Y(e.at.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'text':
      ctx.beginPath();
      ctx.arc(X(e.at.x), Y(e.at.y), 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

export function drawCadPreview(
  canvas: HTMLCanvasElement,
  doc: CadDocument,
  roleOf: (layer: string) => LayerRole,
  opts: DrawCadPreviewOptions = {},
): PreviewView | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#10101c';
  ctx.fillRect(0, 0, W, H);
  if (!doc.bbox) return null;

  const view = opts.view ?? fitView(doc.bbox, W, H);
  const k = view.scale;
  const X = (x: number) => x * k + view.offsetX;
  const Y = (y: number) => -y * k + view.offsetY;
  const highlight = opts.highlightLayer ?? null;

  // Draw ignored/grid first so structural roles stay on top.
  const order: LayerRole[] = ['ignore', 'grid', 'text', 'slab', 'opening', 'wall', 'beam', 'column'];
  const byRole = new Map<LayerRole, CadEntity[]>();
  for (const e of doc.entities) {
    const role = roleOf(e.layer);
    const arr = byRole.get(role);
    if (arr) arr.push(e);
    else byRole.set(role, [e]);
  }

  for (const role of order) {
    const entities = byRole.get(role);
    if (!entities) continue;
    ctx.strokeStyle = ROLE_COLORS[role];
    ctx.fillStyle = ROLE_COLORS[role];
    const baseWidth = role === 'ignore' || role === 'grid' ? 0.6 : 1.4;
    ctx.lineWidth = baseWidth;
    ctx.setLineDash(role === 'grid' ? [6, 4] : []);
    for (const e of entities) {
      // When a layer is highlighted, everything else fades back.
      ctx.globalAlpha = highlight && e.layer !== highlight ? 0.16 : 1;
      drawEntity(ctx, e, X, Y, k);
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // Re-stroke the highlighted layer on top, thicker + haloed, so it is
  // unmistakable which raw DXF layer is selected and what it contributes.
  if (highlight) {
    for (const e of doc.entities) {
      if (e.layer !== highlight) continue;
      const role = roleOf(e.layer);
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 3.4;
      ctx.globalAlpha = 0.9;
      drawEntity(ctx, e, X, Y, k);
      ctx.strokeStyle = ROLE_COLORS[role];
      ctx.fillStyle = ROLE_COLORS[role];
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 1;
      drawEntity(ctx, e, X, Y, k);
    }
    ctx.globalAlpha = 1;
  }

  if (opts.crop) {
    const r = cropScreenRect(view, opts.crop);
    ctx.save();
    // Dim everything outside the crop window with four bands.
    ctx.fillStyle = 'rgba(8, 8, 16, 0.60)';
    ctx.fillRect(0, 0, W, Math.max(0, r.top));
    ctx.fillRect(0, r.top + r.height, W, H - (r.top + r.height));
    ctx.fillRect(0, r.top, Math.max(0, r.left), r.height);
    ctx.fillRect(r.left + r.width, r.top, W - (r.left + r.width), r.height);
    // Bright dashed crop rectangle.
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.left, r.top, r.width, r.height);
    ctx.setLineDash([]);
    ctx.restore();
  }

  return view;
}

// ── Semantic ("Extracted") preview ─────────────────────────────────
// Draws the ArchPlan that the CURRENT layer mapping produces — columns, beams,
// walls, slabs, openings, rooms — so the user sees the CONSEQUENCE of each role
// choice, not just the raw drawing. Geometry is in metres (unit already applied
// by extractArchPlan); it shares the PreviewView transform so pan/zoom/fit and
// per-layer highlight behave exactly like the raw view.

export interface SemanticPreviewStats {
  columns: number; beams: number; walls: number; slabs: number; openings: number; rooms: number;
}

const SEMANTIC_ROOM = '#7fe0d6';

/** Bounding box (metres) over all extracted plan geometry, or null when empty. */
export function planBBox(plan: ArchPlan): BBoxLike | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (p: CadPt) => {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  };
  for (const c of plan.columns) acc(c.at);
  for (const b of plan.beams) { acc(b.a); acc(b.b); }
  for (const w of plan.walls) { acc(w.a); acc(w.b); }
  for (const s of plan.slabs) for (const p of s.outline) acc(p);
  for (const o of plan.openings) for (const p of o.outline) acc(p);
  for (const r of plan.roomLabels) acc(r.at);
  for (const g of plan.gridLines) { acc(g.a); acc(g.b); }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function semanticPreviewStats(plan: ArchPlan): SemanticPreviewStats {
  return {
    columns: plan.columns.length, beams: plan.beams.length, walls: plan.walls.length,
    slabs: plan.slabs.length, openings: plan.openings.length, rooms: plan.roomLabels.length,
  };
}

export interface DrawSemanticOptions {
  view?: PreviewView | null;
  /** Emphasize contributions whose srcLayer matches; dim the rest. */
  highlightLayer?: string | null;
}

export function drawSemanticPreview(
  canvas: HTMLCanvasElement, plan: ArchPlan, opts: DrawSemanticOptions = {},
): SemanticPreviewStats {
  const stats = semanticPreviewStats(plan);
  const ctx = canvas.getContext('2d');
  if (!ctx) return stats;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#10101c';
  ctx.fillRect(0, 0, W, H);

  const bbox = planBBox(plan);
  if (!bbox) return stats;
  const view = opts.view ?? fitView(bbox, W, H);
  const k = view.scale;
  const X = (x: number) => x * k + view.offsetX;
  const Y = (y: number) => -y * k + view.offsetY;
  const hl = opts.highlightLayer ?? null;
  const alpha = (srcLayer?: string) => (hl && srcLayer !== hl ? 0.18 : 1);

  // Grid/axes (dashed, behind everything).
  ctx.strokeStyle = ROLE_COLORS.grid;
  ctx.lineWidth = 0.6;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = hl ? 0.12 : 0.6;
  for (const g of plan.gridLines) {
    ctx.beginPath(); ctx.moveTo(X(g.a.x), Y(g.a.y)); ctx.lineTo(X(g.b.x), Y(g.b.y)); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Slabs — filled translucent + edge.
  for (const s of plan.slabs) {
    if (s.outline.length < 3) continue;
    ctx.globalAlpha = alpha(s.srcLayer);
    ctx.beginPath();
    ctx.moveTo(X(s.outline[0].x), Y(s.outline[0].y));
    for (let i = 1; i < s.outline.length; i++) ctx.lineTo(X(s.outline[i].x), Y(s.outline[i].y));
    ctx.closePath();
    ctx.fillStyle = s.inferred ? 'rgba(106,159,224,0.10)' : 'rgba(106,159,224,0.22)';
    ctx.fill();
    ctx.strokeStyle = ROLE_COLORS.slab;
    ctx.lineWidth = 1.2;
    if (s.inferred) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Openings — dashed purple outline.
  ctx.strokeStyle = ROLE_COLORS.opening;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  for (const o of plan.openings) {
    if (o.outline.length < 3) continue;
    ctx.globalAlpha = hl ? 0.5 : 1;
    ctx.beginPath();
    ctx.moveTo(X(o.outline[0].x), Y(o.outline[0].y));
    for (let i = 1; i < o.outline.length; i++) ctx.lineTo(X(o.outline[i].x), Y(o.outline[i].y));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Walls — orange, thickness-aware.
  for (const w of plan.walls) {
    ctx.globalAlpha = alpha(w.srcLayer);
    ctx.strokeStyle = ROLE_COLORS.wall;
    ctx.lineWidth = Math.max(1.4, (w.thickness ?? 0) * k);
    ctx.beginPath(); ctx.moveTo(X(w.a.x), Y(w.a.y)); ctx.lineTo(X(w.b.x), Y(w.b.y)); ctx.stroke();
  }

  // Beams — teal, width-aware (so polygon-footprint beams read as bars).
  for (const b of plan.beams) {
    ctx.globalAlpha = alpha(b.srcLayer);
    ctx.strokeStyle = ROLE_COLORS.beam;
    ctx.lineWidth = Math.max(1.6, (b.width ?? 0) * k);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(b.a.x), Y(b.a.y)); ctx.lineTo(X(b.b.x), Y(b.b.y)); ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // Columns — red filled squares (sized from the section when known).
  for (const c of plan.columns) {
    ctx.globalAlpha = alpha(c.srcLayer);
    ctx.fillStyle = ROLE_COLORS.column;
    const bw = (c.b ?? 0) * k, bh = (c.h ?? 0) * k;
    if (bw > 2 && bh > 2) ctx.fillRect(X(c.at.x) - bw / 2, Y(c.at.y) - bh / 2, bw, bh);
    else { ctx.beginPath(); ctx.arc(X(c.at.x), Y(c.at.y), 3.2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // Rooms / load areas — small teal ring markers.
  ctx.strokeStyle = SEMANTIC_ROOM;
  ctx.lineWidth = 1.2;
  for (const r of plan.roomLabels) {
    ctx.globalAlpha = hl ? 0.45 : 0.9;
    ctx.beginPath(); ctx.arc(X(r.at.x), Y(r.at.y), 3.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return stats;
}
