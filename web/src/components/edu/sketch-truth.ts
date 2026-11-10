import type { AnalysisResults } from '../../lib/engine/types';
import type { Element, Material, Node, Section } from '../../lib/store/model.svelte';
import { computeDisplacementAt } from '../../lib/engine/diagrams';
import { effectiveBendingInertia } from '../../lib/engine/solver-service';
import { get2DDisplayDisplacementVertical } from '../../lib/geometry/coordinate-system';
import { diagramValueAsShown } from './exercise-spec';
import type { DiagramSketchQuestion } from './exercise-spec';

export const SKETCH_STATIONS = 41;

export interface SketchModel {
  nodes: ReadonlyMap<number, Node>;
  elements: ReadonlyMap<number, Element>;
  materials: ReadonlyMap<number, Material>;
  sections: ReadonlyMap<number, Section>;
}

const DIAGRAM_KIND = { N: 'axial', V: 'shear', M: 'moment' } as const;

/** The real diagram a sketch question asks for, sampled along its member; the deflection in mm, as the viewport draws it. */
export function sketchTruth(q: DiagramSketchQuestion, results: AnalysisResults | null, model: SketchModel): number[] | null {
  const ef = results?.elementForces?.[q.elementIndex ?? 0];
  if (!results || !ef) return null;
  const at = (k: number) => k / (SKETCH_STATIONS - 1);
  const which = q.diagram;
  if (which !== 'D') {
    return Array.from({ length: SKETCH_STATIONS }, (_, k) => diagramValueAsShown(DIAGRAM_KIND[which], at(k), ef as never));
  }
  const elem = model.elements.get(ef.elementId);
  if (!elem) return null;
  const ni = model.nodes.get(elem.nodeI);
  const nj = model.nodes.get(elem.nodeJ);
  const di = results.displacements.find((d) => d.nodeId === elem.nodeI);
  const dj = results.displacements.find((d) => d.nodeId === elem.nodeJ);
  if (!ni || !nj || !di || !dj) return null;
  const mat = model.materials.get(elem.materialId);
  const sec = model.sections.get(elem.sectionId);
  const EI = mat && sec ? mat.e * 1000 * effectiveBendingInertia(sec) : undefined;
  return Array.from({ length: SKETCH_STATIONS }, (_, k) => {
    const disp = computeDisplacementAt(
      at(k),
      ni.x, ni.y, nj.x, nj.y,
      di.ux, di.uz, di.ry,
      dj.ux, dj.uz, dj.ry,
      ef.length, ef.hingeStart, ef.hingeEnd,
      EI, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads,
    );
    return get2DDisplayDisplacementVertical(disp) * 1000;
  });
}
