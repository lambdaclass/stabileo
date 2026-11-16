import { canonical, plain } from './cases.mjs';

export function gravityDensityCases(wasm) {
  const material = { id: 1, e: 1000, nu: 0, rho: 1 };
  const section = { id: 1, a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 };
  const base = { materials: { 1: material }, sections: { 1: section } };
  const spatial = { ...base,
    nodes: { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 100, y: 0, z: 0 } },
    elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
    supports: { 1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } },
    loads: [
      { type: 'distributed', data: { elementId: 1, a: 1, b: 2, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [3 / 16, -1 / 16, 3 / 16], y: [0, 0, 0], z: [0, 0, 0] } } },
      { type: 'distributed', data: { elementId: 1, a: 2, b: 3, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [-1 / 48, -1 / 48, -1 / 48], y: [0, 0, 0], z: [0, 0, 0] } } },
    ],
  };
  const plane = { ...base,
    nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 100, z: 0 } },
    elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
    supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
    loads: [{ type: 'distributed', data: { elementId: 1, a: 1, b: 2, qI: 1, qJ: -1 } }],
  };
  const cases = [];
  for (const nonlinear of [false, true]) {
    const result3 = plain(nonlinear ? wasm.solve_pdelta_3d(JSON.stringify(spatial), 100, 1e-10) : wasm.solve_3d(spatial));
    const result2 = plain(nonlinear ? wasm.solve_pdelta_2d(JSON.stringify(plane), 100, 1e-10) : wasm.solve_2d(plane));
    const results3 = nonlinear ? result3.results : result3, results2 = nonlinear ? result2.results : result2;
    cases.push({ name: `spatial/${nonlinear}`, result: results3, diagrams: JSON.parse(wasm.compute_diagrams_3d(JSON.stringify(results3))) });
    cases.push({ name: `plane/${nonlinear}`, result: results2, diagrams: JSON.parse(wasm.compute_diagrams_2d(JSON.stringify({ input: plane, results: results2 }))) });
  }
  return { text: canonical(cases), cases };
}
