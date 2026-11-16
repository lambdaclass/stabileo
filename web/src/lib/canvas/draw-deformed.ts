// Render deformed shape using Hermite cubic interpolation + particular solution

import type { AnalysisResults } from '../engine/types';
import { computeDeformedShape } from '../engine/diagrams';
import { canvasTheme } from './theme';
import { solverBendingForces2D } from '../engine/transverse-sign-2d';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number; materialId: number; sectionId: number; type?: string } | undefined;
  getMaterial: (id: number) => { e: number } | undefined;
  getSection: (id: number) => { iz: number } | undefined;
}

/** Sample the same curve for drawing and for export scaling, including member loads. */
function* deformedCurves(results: AnalysisResults, dc: DrawContext, scale: number) {
  // Build displacement lookup
  const dispMap = new Map<number, { ux: number; uz: number; ry: number }>();
  for (const d of results.displacements) {
    dispMap.set(d.nodeId, d);
  }

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

    /*
     * The member's loads are published in the drawn axes; the particular
     * solution is the solver's, so it gets them back in the solver's.
     */
    const recovery = solverBendingForces2D(ef, nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);
    /*
     * A truss member carries axial force only: no shear, no moment, so no curvature. It stays
     * straight between its displaced nodes, whatever the joints it meets turn by: drawn hinged at
     * both ends and without the bending of member loads (which go to its nodes).
     */
    const truss = elem.type === 'truss';
    const points = computeDeformedShape(
      nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
      dI.ux, dI.uz, dI.ry,
      dJ.ux, dJ.uz, dJ.ry,
      scale, ef.length,
      truss || ef.hingeStart, truss || ef.hingeEnd,
      truss ? undefined : EI,
      truss ? 0 : recovery.qI, truss ? 0 : recovery.qJ,
      truss ? [] : recovery.pointLoads,
      truss ? [] : recovery.distributedLoads,
    );

    yield { nodeI, nodeJ, points };
  }
}

/** Largest translation anywhere on the drawn members, including their interior. */
export function maxDeformedDisplacement2D(results: AnalysisResults, dc: DrawContext): number {
  let max = 0;
  for (const d of results.displacements) max = Math.max(max, Math.hypot(d.ux, d.uz));
  for (const { nodeI, nodeJ, points } of deformedCurves(results, dc, 1)) {
    if (points.length < 2) continue;
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1), p = points[i]!;
      max = Math.max(max, Math.hypot(p.x - nodeI.x - t * (nodeJ.x - nodeI.x), p.y - nodeI.y - t * (nodeJ.y - nodeI.y)));
    }
  }
  return max;
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

  const scale = userScale;
  ctx.strokeStyle = canvasTheme().deformed;
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  for (const { points } of deformedCurves(results, dc, scale)) {
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
  ctx.fillStyle = canvasTheme().deformedFill;
  for (const d of results.displacements) {
    const node = dc.getNode(d.nodeId);
    if (!node) continue;

    const defX = node.x + d.ux * scale;
    const defY = node.y + d.uz * scale;
    const s = dc.worldToScreen(defX, defY);

    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
