// Lightweight 2D canvas preview of a CadDocument, color-coded by layer role.
// Pure drawing — no model coupling, no Three.js. Used inside the CAD wizard.

import type { CadDocument, CadEntity, LayerRole } from './types';

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

export function drawCadPreview(
  canvas: HTMLCanvasElement,
  doc: CadDocument,
  roleOf: (layer: string) => LayerRole,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#10101c';
  ctx.fillRect(0, 0, W, H);
  if (!doc.bbox) return;

  const pad = 16;
  const bw = doc.bbox.maxX - doc.bbox.minX || 1;
  const bh = doc.bbox.maxY - doc.bbox.minY || 1;
  const k = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
  // CAD y-up → canvas y-down, centered.
  const ox = (W - k * bw) / 2 - k * doc.bbox.minX;
  const oy = (H + k * bh) / 2 + k * doc.bbox.minY;
  const X = (x: number) => ox + k * x;
  const Y = (y: number) => oy - k * y;

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
    ctx.lineWidth = role === 'ignore' || role === 'grid' ? 0.6 : 1.4;
    ctx.setLineDash(role === 'grid' ? [6, 4] : []);

    for (const e of entities) {
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
        case 'insert': {
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
        }
        case 'text':
          ctx.beginPath();
          ctx.arc(X(e.at.x), Y(e.at.y), 1.5, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
  }
  ctx.setLineDash([]);
}
