// Drawing mode shapes (modal analysis) and buckling modes on the canvas

import type { PlasticResult } from '../engine/result-types';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  nodes: Map<number, { x: number; y: number }>;
  elements: Map<number, { nodeI: number; nodeJ: number }>;
}

/**
 * Draw a mode shape (modal or buckling).
 * Renders the deformed shape with animated sinusoidal scaling.
 */
export function drawModeShape(
  displacements: Array<{ nodeId: number; ux: number; uz: number; ry: number }>,
  dc: DrawContext,
  _zoom: number,
  scale: number,
  color: string = '#4ecdc4',
): void {
  const { ctx, worldToScreen, nodes, elements } = dc;

  // Build displacement lookup
  const dispMap = new Map<number, { ux: number; uz: number }>();
  for (const d of displacements) {
    dispMap.set(d.nodeId, { ux: d.ux, uz: d.uz });
  }

  // Draw deformed elements
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);

  for (const [, elem] of elements) {
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;

    const di = dispMap.get(elem.nodeI) ?? { ux: 0, uz: 0 };
    const dj = dispMap.get(elem.nodeJ) ?? { ux: 0, uz: 0 };

    // Interpolate with cubic shape functions for smooth curves
    const nPts = 20;
    ctx.beginPath();
    for (let k = 0; k <= nPts; k++) {
      const t = k / nPts;

      // Linear interpolation of base position
      const bx = ni.x + t * (nj.x - ni.x);
      const by = ni.y + t * (nj.y - ni.y);

      // Hermite interpolation of displacements for smoother curves
      const h1 = 1 - 3 * t * t + 2 * t * t * t;
      const h2 = 3 * t * t - 2 * t * t * t;

      const ux = h1 * di.ux + h2 * dj.ux;
      const uz = h1 * di.uz + h2 * dj.uz;

      const wx = bx + ux * scale;
      const wy = by + uz * scale;
      const s = worldToScreen(wx, wy);

      if (k === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  // Draw node positions
  ctx.fillStyle = color;
  for (const [nodeId, node] of nodes) {
    const d = dispMap.get(nodeId) ?? { ux: 0, uz: 0 };
    const wx = node.x + d.ux * scale;
    const wy = node.y + d.uz * scale;
    const s = worldToScreen(wx, wy);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw plastic hinges on the structure.
 */
export function drawPlasticHinges(
  result: PlasticResult,
  stepIndex: number,
  dc: DrawContext,
  zoom: number,
): void {
  const { ctx, worldToScreen, nodes, elements } = dc;
  const step = result.steps[stepIndex];
  if (!step) return;

  // Draw the deformed shape for this step
  const dispMap = new Map<number, { ux: number; uz: number }>();
  for (const d of step.results.displacements) {
    dispMap.set(d.nodeId, { ux: d.ux, uz: d.uz });
  }

  // Determine auto-scale from max displacement
  let maxDisp = 0;
  for (const d of step.results.displacements) {
    const mag = Math.sqrt(d.ux * d.ux + d.uz * d.uz);
    if (mag > maxDisp) maxDisp = mag;
  }
  const autoScale = maxDisp > 0 ? Math.min(50 / zoom / maxDisp, 200) : 1;

  // Draw elements
  ctx.strokeStyle = '#e9e944';
  ctx.lineWidth = 2;
  for (const [, elem] of elements) {
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;
    const di = dispMap.get(elem.nodeI) ?? { ux: 0, uz: 0 };
    const dj = dispMap.get(elem.nodeJ) ?? { ux: 0, uz: 0 };

    const si = worldToScreen(ni.x + di.ux * autoScale, ni.y + di.uz * autoScale);
    const sj = worldToScreen(nj.x + dj.ux * autoScale, nj.y + dj.uz * autoScale);
    ctx.beginPath();
    ctx.moveTo(si.x, si.y);
    ctx.lineTo(sj.x, sj.y);
    ctx.stroke();
  }

  // Draw hinge symbols at each formed hinge
  for (const hinge of step.hingesFormed) {
    const elem = elements.get(hinge.elementId);
    if (!elem) continue;
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;

    // Use position field for interior hinges, fall back to start/end
    const pos = hinge.position ?? (hinge.end === 'start' ? 0 : 1);
    const wx = ni.x + (nj.x - ni.x) * pos;
    const wy = ni.y + (nj.y - ni.y) * pos;
    const di = dispMap.get(elem.nodeI) ?? { ux: 0, uz: 0 };
    const dj = dispMap.get(elem.nodeJ) ?? { ux: 0, uz: 0 };
    const dux = di.ux + (dj.ux - di.ux) * pos;
    const duz = di.uz + (dj.uz - di.uz) * pos;
    const s = worldToScreen(wx + dux * autoScale, wy + duz * autoScale);

    // Draw hinge circle
    const r = 8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(233, 69, 96, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label with step number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${hinge.step + 1}`, s.x, s.y);
  }
}
