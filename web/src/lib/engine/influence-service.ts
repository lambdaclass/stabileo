// Influence line computation — now handled by WASM.
// The Rust solver does the entire unit-load sweep in a tight loop,
// which is much faster than calling WASM per position from TS.

import { computeInfluenceLineWasm } from './wasm-solver';
import type { ModelData } from './solver-service';
import type { InfluenceQuantity, InfluenceLineResult } from '../store/model.svelte';
import { t } from '../i18n';

/**
 * Compute influence line: move unit load P=1 (downward) across elements.
 * Delegates to Rust/WASM for the full solve loop.
 */
export function computeInfluenceLine(
  model: ModelData,
  quantity: InfluenceQuantity,
  targetNodeId?: number,
  targetElementId?: number,
  targetPosition: number = 0.5,
  nPointsPerElement: number = 20,
): InfluenceLineResult | string {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('influence.needNodesElems');
  if (model.supports.size < 1) return t('influence.needSupport');

  // Build base solver input (no loads)
  const solver = {
    nodes: new Map(Array.from(model.nodes.entries()).map(([id, n]) => [id, { id: n.id, x: n.x, y: n.y }])),
    materials: new Map(Array.from(model.materials.entries()).map(([id, m]) => [id, { id: m.id, e: m.e, nu: m.nu }])),
    sections: new Map(Array.from(model.sections.entries()).map(([id, s]) => [id, { id: s.id, a: s.a, iz: (s as any).iy ?? s.iz }])),
    elements: new Map(Array.from(model.elements.entries()).map(([id, e]) => [id, {
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.materialId, sectionId: e.sectionId,
      hingeStart: e.hingeStart ?? false, hingeEnd: e.hingeEnd ?? false,
    }])),
    supports: new Map(Array.from(model.supports.entries()).map(([id, s]) => [id, { id: s.id, nodeId: s.nodeId, type: s.type as any, kx: s.kx, ky: s.ky, kz: s.kz, dx: s.dx, dy: s.dy, drz: s.drz }])),
    loads: [] as any[],
  };

  try {
    return computeInfluenceLineWasm({
      solver,
      quantity,
      targetNodeId,
      targetElementId,
      targetPosition,
      nPointsPerElement,
    });
  } catch (err: any) {
    return t('influence.calcError').replace('{n}', err.message);
  }
}
