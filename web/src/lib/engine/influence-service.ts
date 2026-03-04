// Influence line computation — pure function (no store dependency)
// Extracted from model.svelte.ts to reduce file size and improve testability.

import { solve as solveStructure } from './solver-js';
import type { SolverInput, SolverLoad } from './types';
import { computeDiagramValueAt } from './diagrams';
import type { ModelData } from './solver-service';
import type { InfluenceQuantity, InfluenceLineResult } from '../store/model.svelte';

/**
 * Compute influence line: move unit load P=1 (downward) across elements.
 * For each position, solves the full structure and extracts the target quantity.
 */
export function computeInfluenceLine(
  model: ModelData,
  quantity: InfluenceQuantity,
  targetNodeId?: number,
  targetElementId?: number,
  targetPosition: number = 0.5,
  nPointsPerElement: number = 20,
): InfluenceLineResult | string {
  if (model.nodes.size < 2 || model.elements.size < 1) return 'Necesita al menos 2 nodos y 1 elemento';
  if (model.supports.size < 1) return 'Necesita al menos 1 apoyo';

  // Build base solver input (no loads)
  const baseInput: SolverInput = {
    nodes: new Map(Array.from(model.nodes.entries()).map(([id, n]) => [id, { id: n.id, x: n.x, y: n.y }])),
    materials: new Map(Array.from(model.materials.entries()).map(([id, m]) => [id, { id: m.id, e: m.e, nu: m.nu }])),
    sections: new Map(Array.from(model.sections.entries()).map(([id, s]) => [id, { id: s.id, a: s.a, iz: (s as any).iy ?? s.iz }])),
    elements: new Map(Array.from(model.elements.entries()).map(([id, e]) => [id, {
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.materialId, sectionId: e.sectionId,
      hingeStart: e.hingeStart ?? false, hingeEnd: e.hingeEnd ?? false,
    }])),
    supports: new Map(Array.from(model.supports.entries()).map(([id, s]) => [id, { id: s.id, nodeId: s.nodeId, type: s.type as any, kx: s.kx, ky: s.ky, kz: s.kz, dx: s.dx, dy: s.dy, drz: s.drz }])),
    loads: [],
  };

  const points: InfluenceLineResult['points'] = [];

  // For each element, move unit load along it
  for (const [, elem] of model.elements) {
    const ni = model.nodes.get(elem.nodeI);
    const nj = model.nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;

    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) continue;

    for (let k = 0; k <= nPointsPerElement; k++) {
      const t = k / nPointsPerElement;
      const a = t * L;

      // World position of unit load
      const wx = ni.x + t * dx;
      const wy = ni.y + t * dy;

      // Unit load P=1 downward → perpendicular component in local coords
      const cosTheta = dx / L;
      const sinTheta = dy / L;
      const pPerp = -cosTheta; // -1 * cos(theta) for downward load projected perpendicular

      // Build loads: unit point load on this element
      const loads: SolverLoad[] = [];
      if (Math.abs(pPerp) > 1e-10) {
        loads.push({ type: 'pointOnElement', data: { elementId: elem.id, a, p: pPerp } });
      }
      // Axial component of unit downward load
      const pAxial = -sinTheta; // tangent component = -sin(theta)
      if (Math.abs(pAxial) > 1e-10) {
        // Apply as nodal forces split between I and J based on position
        const fI = pAxial * (1 - t);
        const fJ = pAxial * t;
        loads.push({ type: 'nodal', data: { nodeId: elem.nodeI, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } });
        loads.push({ type: 'nodal', data: { nodeId: elem.nodeJ, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } });
      }

      const input = { ...baseInput, loads };

      try {
        const result = solveStructure(input);
        let value = 0;

        if ((quantity === 'Ry' || quantity === 'Rx' || quantity === 'Mz') && targetNodeId !== undefined) {
          const reaction = result.reactions.find(r => r.nodeId === targetNodeId);
          if (reaction) {
            if (quantity === 'Ry') value = reaction.ry;
            else if (quantity === 'Rx') value = reaction.rx;
            else value = reaction.mz;
          }
        } else if ((quantity === 'V' || quantity === 'M') && targetElementId !== undefined) {
          const forces = result.elementForces.find(f => f.elementId === targetElementId);
          if (forces) {
            // Use computeDiagramValueAt which correctly handles point load discontinuities.
            // When the unit load falls on the same element as the measurement point,
            // V has a jump and M has a kink at the load position — simple interpolation
            // from vStart/mStart would miss this.
            const kind = quantity === 'V' ? 'shear' : 'moment';
            value = computeDiagramValueAt(kind, targetPosition, forces);
          }
        }

        points.push({ x: wx, y: wy, elementId: elem.id, t, value });
      } catch {
        points.push({ x: wx, y: wy, elementId: elem.id, t, value: 0 });
      }
    }
  }

  return {
    quantity,
    targetNodeId,
    targetElementId,
    targetPosition,
    points,
  };
}
