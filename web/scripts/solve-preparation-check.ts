import { solvableModel } from '../src/lib/engine/member-behaviour';
import type { ModelData } from '../src/lib/engine/solver-service';

export function checkSolvePreparation(): void {
  const visits = (count: number) => {
    let reads = 0;
    const model: ModelData = {
      nodes: new Map(Array.from({ length: count }, (_, id) => [id, { id, x: id, y: 0, z: 0 }])),
      elements: new Map(Array.from({ length: count - 1 }, (_, id) => [id, {
        id, type: 'frame' as const, nodeI: id, nodeJ: id + 1, materialId: 1, sectionId: 1,
      }])),
      supports: new Map(), materials: new Map(), sections: new Map(),
      loads: [{ type: 'nodal3d', data: {
        id: 1, get nodeId() { reads++; return 0; }, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0,
      } }],
    };
    if (solvableModel(model) !== model) throw new Error('Preparation changed a model with no loose nodes or variable members');
    return reads;
  };
  const small = visits(2), large = visits(64);
  if (small < 1 || small !== large) throw new Error(`Bundled preparation rescans loads as node count grows: ${small} vs ${large}`);
}
