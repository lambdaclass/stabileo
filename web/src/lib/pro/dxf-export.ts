/**
 * PRO's DXF, from the stores to a file: the model as it stands and the results of the chosen set
 * (`pro/export-results.ts`), written by `dxf/writer.ts`.
 */
import { modelStore, resultsStore, uiStore } from '../store';
import { t } from '../i18n';
import { downloadText } from '../store/file';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';
import { writeDxf, type DxfContents, type DxfProjection } from '../dxf/writer';
import type { DxfUnit } from '../dxf/types';
import { resultSet, type ResultSetKey } from './export-results';

export interface ProDxfRequest {
  contents: DxfContents;
  projection: DxfProjection;
  units: DxfUnit;
  set: ResultSetKey;
  /** Diagram size, relative to the default (1). */
  diagramFactor: number;
}

export function proDxf(req: ProDxfRequest): string {
  const flat = shouldProjectModelToXZ({
    analysisMode: uiStore.analysisMode, viewportPresentation3D: uiStore.viewportPresentation3D,
    nodes: modelStore.nodes.values(), supports: modelStore.supports.values(), loads: modelStore.loads,
    plateCount: modelStore.plates.size, quadCount: modelStore.quads.size,
  });
  const set = resultSet(req.set);
  return writeDxf({
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    plates: modelStore.plates, quads: modelStore.quads, sections: modelStore.sections, materials: modelStore.materials,
    loads: modelStore.loads, loadCases: modelStore.model.loadCases, flat, analysis: modelStore.analysis,
  }, {
    projection: req.projection, units: req.units, contents: req.contents,
    results: set.results, resultsName: set.name,
    diagramSize: 0.08 * req.diagramFactor,
    leftHand: uiStore.axisConvention3D === 'leftHand',
    towardLocalAxes: resultsStore.drawPositiveTowardLocalAxes,
  }, t);
}

export function downloadProDxf(req: ProDxfRequest): void {
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
  downloadText(proDxf(req), `${safeName}.dxf`, 'application/dxf');
}
