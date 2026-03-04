// Render deformed shape using Hermite cubic interpolation + particular solution

import type { AnalysisResults } from '../engine/types';
import { computeDeformedShape } from '../engine/diagrams';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number; materialId: number; sectionId: number } | undefined;
  getMaterial: (id: number) => { e: number } | undefined;
  getSection: (id: number) => { iz: number } | undefined;
}

/**
 * Draw deformed shape with cubic Hermite interpolation + particular solution.
 * The particular solution accounts for intra-element deflection from loads
 * (distributed and point loads), which the Hermite interpolation from nodal
 * values alone would miss (e.g., fixed-fixed beam with UDL shows zero
 * deflection from nodal values only, but actually deflects at midspan).
 */
export function drawDeformed(
  results: AnalysisResults,
  dc: DrawContext,
  _zoom: number,
  userScale: number,
): void {
  const { ctx } = dc;

  // Build displacement lookup
  const dispMap = new Map<number, { ux: number; uy: number; rz: number }>();
  for (const d of results.displacements) {
    dispMap.set(d.nodeId, d);
  }

  const scale = userScale;

  ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;

  for (const ef of results.elementForces) {
    const elem = dc.getElement(ef.elementId);
    if (!elem) continue;

    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const dI = dispMap.get(elem.nodeI);
    const dJ = dispMap.get(elem.nodeJ);
    if (!dI || !dJ) continue;

    // Get EI for particular solution
    const mat = dc.getMaterial(elem.materialId);
    const sec = dc.getSection(elem.sectionId);
    const EI = (mat && sec) ? mat.e * 1000 * sec.iz : undefined; // kN·m²

    const points = computeDeformedShape(
      nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
      dI.ux, dI.uy, dI.rz,
      dJ.ux, dJ.uy, dJ.rz,
      scale, ef.length,
      ef.hingeStart, ef.hingeEnd,
      EI,
      ef.qI, ef.qJ,
      ef.pointLoads,
      ef.distributedLoads,
    );

    if (points.length < 2) continue;

    ctx.beginPath();
    const s0 = dc.worldToScreen(points[0].x, points[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < points.length; i++) {
      const s = dc.worldToScreen(points[i].x, points[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);

  // Draw displaced nodes
  ctx.fillStyle = 'rgba(255, 165, 0, 0.6)';
  for (const d of results.displacements) {
    const node = dc.getNode(d.nodeId);
    if (!node) continue;

    const defX = node.x + d.ux * scale;
    const defY = node.y + d.uy * scale;
    const s = dc.worldToScreen(defX, defY);

    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
