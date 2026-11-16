import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, solve_2d, solve_pdelta_2d, compute_diagram_value_at, compute_diagram_value_at_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { computeDiagramValueAt } from '../../engine/diagrams';
import { collapseVariableResults } from '../../engine/variable-members';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { AnalysisResults } from '../../engine/types';

beforeAll(async () => { await initSolver(); });
const regression = it.skip;

for (const nonlinear of [false, true]) for (const a of [1.5, 6 - 5e-11]) regression(`known wrong result: #2219 WASM torque jump nonlinear=${nonlinear} a=${a}`, () => {
  const input = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];
  const e = { ...input.elements['1'], nodeI: 1, nodeJ: 2 };
  for (const k of ['releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd']) e[k] = false;
  const cut = 1.5;
  input.nodes = { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: cut, y: 0, z: 0 }, 3: { id: 3, x: 6, y: 0, z: 0 } };
  input.elements = { 1: e, 2: { ...e, id: 2, nodeI: 2, nodeJ: 3 } };
  input.supports = { 1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }, 3: { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } };
  input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 1, my: 0, mz: 0 } }];
  const result: AnalysisResults3D = nonlinear ? JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10)).results : solve_3d(input);
  const ef = collapseVariableResults(result, { members: new Map([[1, { parentId: 1, length: 6, innerNodes: [2], pieces: [{ id: 1, sectionId: 1, x0: 0, x1: cut, nodeI: 1, nodeJ: 2 }, { id: 2, sectionId: 1, x0: cut, x1: 6, nodeI: 2, nodeJ: 3 }] }]]), innerNodes: new Set([2]) }).elementForces[0]!;
  expect(ef.mxStart).toBeCloseTo(-(6 - cut) / 6, 10);
  const recovered = { ...ef, pieces: undefined, pointTorques: [{ a, p: 1 }] };
  for (const x of [0, a - 5e-11, a, Math.min(6, a + 5e-11), 6]) {
    const expected = ef.mxStart + (x > a ? 1 : 0);
    expect(compute_diagram_value_at_3d(JSON.stringify({ elementForces: recovered, kind: 'torsion', t: x / 6 }))).toBeCloseTo(expected, 12);
    expect(evaluateDiagramAt(recovered, 'torsion', x / 6)).toBeCloseTo(expected, 12);
  }
});

for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const a of [1.5, 3 - 5e-11]) regression(`known wrong result: #2219 WASM force jump spatial=${spatial} nonlinear=${nonlinear} a=${a}`, () => {
  const input = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];
  const e = { ...input.elements['1'], nodeI: 1, nodeJ: 2 };
  input.nodes = { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 3, y: 0, z: 0 } };
  input.elements = { 1: e };
  if (!spatial) for (const n of Object.values(input.nodes) as Record<string, unknown>[]) delete n.y;
  for (const k of ['releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd']) e[k] = false;
  input.supports = spatial ? { 1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } } : { 1: { id: 1, nodeId: 1, type: 'fixed' } };
  input.loads = spatial ? [{ type: 'pointOnElement', data: { elementId: 1, a, py: 1, pz: 1 } }] : [{ type: 'pointOnElement', data: { elementId: 1, a, p: 1 } }];
  if (spatial) {
    const r: AnalysisResults3D = nonlinear ? JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10)).results : solve_3d(input);
    const ef = r.elementForces[0]!;
    for (const kind of ['shearY', 'shearZ'] as const) for (const x of [a - 5e-11, a, Math.min(3, a + 5e-11), 3]) {
      const expected = x > a ? 0 : -1;
      expect(compute_diagram_value_at_3d(JSON.stringify({ elementForces: ef, kind, t: x / 3 }))).toBeCloseTo(expected, 10);
      expect(evaluateDiagramAt(ef, kind, x / 3)).toBeCloseTo(expected, 10);
    }
  } else {
    const r: AnalysisResults = nonlinear ? JSON.parse(solve_pdelta_2d(JSON.stringify(input), 100, 1e-10)).results : solve_2d(input);
    const ef = r.elementForces[0]!;
    for (const x of [a - 5e-11, a, Math.min(3, a + 5e-11), 3]) {
      const expected = x > a ? 0 : -1;
      expect(compute_diagram_value_at(JSON.stringify({ elementForces: ef, kind: 'shear', t: x / 3 }))).toBeCloseTo(expected, 10);
      expect(computeDiagramValueAt('shear', x / 3, ef)).toBeCloseTo(expected, 10);
    }
  }
});
