/**
 * The statics check against a real per-case solve.
 *
 * The solve adds self-weight to the permanent cases only. A check that added it to every case
 * reported, on every live and wind case, a residual exactly the structure's weight — a violation
 * of equilibrium that was the check's own arithmetic. These solve real models case by case and
 * require every row to balance.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { solveCombinations3D } from '../solver-service';
import * as wasmSolver from '../wasm-solver';
import { staticsCheck } from '../statics-check';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function md() {
  return {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  };
}

function checkPerCase(selfWeight: boolean) {
  const r = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations, selfWeight, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const reactionsByCase = new Map<number | null, any>([...r.perCase].map(([id, res]) => [id, res.reactions]));
  return staticsCheck({
    model: md() as never,
    reactionsByCase,
    includeSelfWeight: selfWeight,
    caseTypes: new Map(modelStore.model.loadCases.map((c) => [c.id, c.type])),
  });
}

describe('every case balances, self-weight on the permanent case only', () => {
  it('the QA frame: dead, live and wind', () => {
    modelStore.clear();
    modelStore.restore({
      nodes: qa8.nodes.map((n: any) => [n.id, n]) as never,
      materials: qa8.materials.map((m: any) => [m.id, m]) as never,
      sections: qa8.sections.map((s: any) => [s.id, s]) as never,
      elements: qa8.elements.map((e: any) => [e.id, e]) as never,
      supports: qa8.supports.map((s: any) => [s.id, s]) as never,
      loads: qa8.loads as never, loadCases: qa8.loadCases as never, combinations: qa8.combinations as never,
      nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
    } as never);
    for (const sw of [false, true]) {
      const rows = checkPerCase(sw);
      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row.worstRelative, `${row.caseName}, self-weight ${sw}`).toBeLessThan(1e-6);
        expect(row.uncovered).toEqual([]);
        expect(row.selfWeightIncluded).toBe(sw && row.caseId === 1);
      }
    }
  });

  it('a slab: surface load and shell self-weight, split to the corners as the solve splits them', () => {
    modelStore.clear();
    modelStore.restore({
      nodes: [
        [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
        [3, { id: 3, x: 5, y: 0, z: 0 }], [4, { id: 4, x: 5, y: 0, z: 3 }],
        [5, { id: 5, x: 5, y: 4, z: 0 }], [6, { id: 6, x: 5, y: 4, z: 3 }],
        [7, { id: 7, x: 0, y: 4, z: 0 }], [8, { id: 8, x: 0, y: 4, z: 3 }],
      ],
      materials: [[1, { id: 1, name: 'H-30', e: 30000, nu: 0.2, rho: 24 }]],
      sections: [[1, { id: 1, name: 'C', a: 0.09, iz: 6.75e-4, iy: 6.75e-4, j: 1.1e-3 }]],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
        [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1 }],
        [3, { id: 3, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1 }],
        [4, { id: 4, type: 'frame', nodeI: 7, nodeJ: 8, materialId: 1, sectionId: 1 }],
      ],
      supports: [1, 3, 5, 7].map((n, i) => [i + 1, { id: i + 1, nodeId: n, type: 'fixed3d' }]),
      loads: [],
      loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }],
      combinations: [{ id: 1, name: '1.2D+1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] }],
      nextId: { node: 20, material: 10, section: 10, element: 20, support: 10, load: 1 },
    } as never);
    const q = modelStore.addQuad([2, 4, 6, 8], 1, 0.15);
    modelStore.addSurfaceLoad3D(q, 1.5, 1);
    modelStore.addSurfaceLoad3D(q, 2, 2);
    // An off-centre point load, so the moment side is exercised too.
    modelStore.addNodalLoad3D(4, 3, 0, -10, 0, 0, 0, 2);
    for (const sw of [false, true]) {
      for (const row of checkPerCase(sw)) {
        expect(row.worstRelative, `${row.caseName}, self-weight ${sw}`).toBeLessThan(1e-6);
        expect(row.uncovered).toEqual([]);
      }
    }
  });
});
