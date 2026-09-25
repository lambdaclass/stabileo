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
  color: string = '#7fd4cc',
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
 * The plastic hinges formed up to a step of the collapse analysis, over the
 * moment diagram the Viewport draws for that step's accumulated state.
 *
 * Every hinge formed so far is marked, numbered in the order it formed; those
 * of the current step are drawn brighter, so stepping through reads as the
 * hinges appearing one event at a time. A yielded truss bar is marked with a
 * square rather than a circle: it is an axial yield, not a hinge.
 */
export function drawPlasticHinges(
  result: PlasticResult,
  stepIndex: number,
  dc: DrawContext,
  _zoom: number,
): void {
  const { ctx, worldToScreen, nodes, elements } = dc;
  if (!result.steps[stepIndex]) return;
  const upTo = result.hinges
    .map((h, order) => ({ h, order }))
    .filter(({ h }) => h.step <= stepIndex);
  for (const { h, order } of upTo) {
    const elem = elements.get(h.elementId);
    if (!elem) continue;
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;
    const pos = h.position ?? (h.end === 'start' ? 0 : 1);
    const s = worldToScreen(ni.x + (nj.x - ni.x) * pos, ni.y + (nj.y - ni.y) * pos);
    const current = h.step === stepIndex;
    const axial = (h as { kind?: string }).kind === 'axial';
    const r = current ? 9 : 7.5;
    ctx.beginPath();
    if (axial) ctx.rect(s.x - r, s.y - r, 2 * r, 2 * r);
    else ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = current ? 'rgba(233, 69, 96, 0.95)' : 'rgba(150, 60, 75, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = current ? 2 : 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${current ? 10 : 9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(order + 1), s.x, s.y);
  }
}
