/**
 * How far the deformed shape's scale goes for the model on screen: up to the scale that draws its
 * largest movement at a quarter of the structure's size, and never past 1000×. A structure that
 * already moves a lot under its loads gets a short slider instead of one that throws it off screen.
 */
import { modelStore, resultsStore, uiStore } from './index';
import { projectNode } from '../geometry/plane-projection';
import { maxDeformedDisplacement2D } from '../canvas/draw-deformed';
import { effectiveBendingInertia } from '../engine/solver-service';
import { deformedMemberCurves3D } from '../export/figure-3d';
import { projectNodeToScene, shouldProjectModelToXZ } from '../geometry/coordinate-system';

export const DEFORMED_SCALE_LIMIT = 1000;
export const DEFORMED_REACH = 0.25;

export function deformedScaleCeiling(span: number, dmax: number): number {
  if (!(dmax > 1e-12) || !(span > 0)) return DEFORMED_SCALE_LIMIT;
  return Math.max(1, Math.min(DEFORMED_SCALE_LIMIT, Math.floor((DEFORMED_REACH * span) / dmax)));
}

function spanOf(pts: Iterable<{ x: number; y: number; z?: number }>): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) {
    const z = p.z ?? 0;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return Number.isFinite(x0) ? Math.hypot(x1 - x0, y1 - y0, z1 - z0) : 0;
}

/** The slider's top for the results on screen: reads the stores, so a `$derived` over it follows them. */
export function deformedScaleMax(): number {
  if (uiStore.is3DWorkspace) {
    const r3d = resultsStore.results3D;
    if (!r3d) return DEFORMED_SCALE_LIMIT;
    const flat = shouldProjectModelToXZ({
      analysisMode: uiStore.analysisMode, viewportPresentation3D: uiStore.viewportPresentation3D,
      nodes: modelStore.nodes.values(), supports: modelStore.supports.values(), loads: modelStore.loads,
      plateCount: modelStore.plates.size, quadCount: modelStore.quads.size,
    });
    let dmax = deformedMemberCurves3D(r3d, flat).memberDisplacement;
    for (const d of r3d.displacements) dmax = Math.max(dmax, Math.hypot(d.ux, d.uy, d.uz));
    return deformedScaleCeiling(spanOf([...modelStore.nodes.values()].map((n) => projectNodeToScene(n, flat))), dmax);
  }
  const res = resultsStore.results;
  if (!res) return DEFORMED_SCALE_LIMIT;
  const plane = uiStore.drawPlane2D;
  const nodes = [...modelStore.nodes.values()].map((n) => projectNode(plane, n));
  const dmax = maxDeformedDisplacement2D(res, {
    getNode: (id: number) => { const n = modelStore.getNode(id); return n ? projectNode(plane, n) : undefined; },
    getElement: (id: number) => modelStore.elements.get(id),
    getMaterial: (id: number) => modelStore.materials.get(id),
    getSection: (id: number) => { const s = modelStore.sections.get(id); return s ? { iz: effectiveBendingInertia(s) } : undefined; },
  } as unknown as Parameters<typeof maxDeformedDisplacement2D>[1]);
  return deformedScaleCeiling(spanOf(nodes), dmax);
}

/** One step of the ◀ ▶ buttons from `scale`, kept within 1 and `max`. */
export function stepDeformedScale(scale: number, dir: 1 | -1, max: number): number {
  const step = dir < 0
    ? (scale <= 10 ? 1 : scale <= 100 ? 5 : 50)
    : (scale < 10 ? 1 : scale < 100 ? 5 : 50);
  return Math.max(1, Math.min(max, scale + dir * step));
}
