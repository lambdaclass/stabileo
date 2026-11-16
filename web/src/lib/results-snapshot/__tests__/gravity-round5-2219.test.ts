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
const regression = it;

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
  for (const x of [cut - 5e-11, cut, cut + 5e-11, 6]) {
    expect(evaluateDiagramAt(ef, 'torsion', x / 6)).toBeCloseTo(ef.mxStart + (x > cut ? 1 : 0), 12);
  }
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
    if (process.env.STABILEO_GRAVITY_MAIN_WITNESS === '1') console.info(JSON.stringify({ spatial, nonlinear, a, diagnostics: r.diagnostics, structuredDiagnostics: r.structuredDiagnostics, elementForces: ef }));
    for (const kind of ['shearY', 'shearZ'] as const) for (const x of [a - 5e-11, a, Math.min(3, a + 5e-11), 3]) {
      const expected = x > a ? 0 : -1;
      expect(compute_diagram_value_at_3d(JSON.stringify({ elementForces: ef, kind, t: x / 3 }))).toBeCloseTo(expected, 10);
      expect(evaluateDiagramAt(ef, kind, x / 3)).toBeCloseTo(expected, 10);
    }
  } else {
    const r: AnalysisResults = nonlinear ? JSON.parse(solve_pdelta_2d(JSON.stringify(input), 100, 1e-10)).results : solve_2d(input);
    const ef = r.elementForces[0]!;
    if (process.env.STABILEO_GRAVITY_MAIN_WITNESS === '1') console.info(JSON.stringify({ spatial, nonlinear, a, diagnostics: r.diagnostics, structuredDiagnostics: r.structuredDiagnostics, elementForces: ef }));
    for (const x of [a - 5e-11, a, Math.min(3, a + 5e-11), 3]) {
      const expected = x > a ? 0 : -1;
      expect(compute_diagram_value_at(JSON.stringify({ elementForces: ef, kind: 'shear', t: x / 3 }))).toBeCloseTo(expected, 10);
      expect(computeDiagramValueAt('shear', x / 3, ef)).toBeCloseTo(expected, 10);
    }
  }
});

for (const operation of ['copy', 'inPlace'] as const) for (const angle of [0, 45]) for (const mirror of [false, true]) for (const count of [1, 2]) for (const nonlinear of [false, true]) regression(`known wrong result: #2219 transformed projected member response ${operation} angle=${angle} mirror=${mirror} count=${count} nonlinear=${nonlinear}`, async () => {
  const { modelStore } = await import('../../store/model.svelte');
  await import('../../store/index');
  const { transformInPlace } = await import('../../model/edit/transform-in-place');
  const { copyTransformed } = await import('../../model/edit/transformed-copy');
  const { rotation, reflection, compose, translation } = await import('../../model/edit/affine');
  const { subdivideForAnalysis } = await import('../../model/edit/analysis-subdivision');
  const { buildSolverLoads3D } = await import('../../engine/solver-service');
  modelStore.clear();
  const ni = modelStore.addNode(0, 0, 0), nj = modelStore.addNode(6, 0, 0), id = modelStore.addElement(ni, nj);
  modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId: id, frame: 'projected', qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 0, 0], y: [1, 1, 1], z: [0, 0, 0] } } });
  const turn = rotation([0, 0, 0], [0, 0, 1], angle);
  const T = compose(translation([10, 10, 0]), mirror ? compose(reflection([0, 0, 0], [1, 0, 0]), turn) : turn);
  const set = { elements: [id], nodes: [] };
  const to = operation === 'inPlace' ? (transformInPlace(set, T), id) : copyTransformed(set, [T], { withLoads: true }).elements[0]!;
  const e = modelStore.elements.get(to)!;
  const source = { ...modelStore.model, elements: new Map([[to, e]]), nodes: new Map([e.nodeI, e.nodeJ].map(id => [id, modelStore.nodes.get(id)!])), loads: modelStore.loads.filter(l => l.type === 'distributed3d' && l.data.elementId === to) };
  const subdivided = subdivideForAnalysis(source, count);
  const ids = subdivided.segments.get(to)!;
  const input = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];
  input.nodes = Object.fromEntries([...subdivided.model.nodes].map(([id, n]) => [id, { id, x: n.x, y: n.y, z: n.z ?? 0 }]));
  input.elements = Object.fromEntries([...subdivided.model.elements].map(([id, e]) => [id, { ...input.elements['1'], id, nodeI: e.nodeI, nodeJ: e.nodeJ, localYx: e.localYx, localYy: e.localYy, localYz: e.localYz, rollAngle: e.rollAngle, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]));
  Object.assign(input.materials['1'], { e: 1000, nu: 0 });
  Object.assign(input.sections['1'], { a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
  for (const k of ['cw', 'asY', 'asZ']) delete input.sections['1'][k];
  input.supports = { [e.nodeI]: { nodeId: e.nodeI, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } };
  input.loads = buildSolverLoads3D(subdivided.model, subdivided.model.loads, false, false);
  for (const r of [nonlinear ? JSON.parse(solve_pdelta_3d(JSON.stringify(input), 100, 1e-10)).results : solve_3d(input)] as AnalysisResults3D[]) {
    for (const [k, id] of ids.entries()) {
      const ef = r.elementForces.find(f => f.elementId === id)!;
      expect(ef.memberMoments).toHaveLength(1);
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const x = k * 6 / count + t * ef.length;
        expect(evaluateDiagramAt(ef, 'momentY', t)).toBeCloseTo(-(6 - x), 10);
        for (const kind of ['shearY', 'shearZ', 'momentZ', 'torsion', 'axial'] as const) expect(evaluateDiagramAt(ef, kind, t)).toBeCloseTo(0, 10);
      }
    }
    expect(r.displacements.find(d => d.nodeId === e.nodeJ)!.uz).toBeCloseTo(-(6 ** 3) / (3 * 1000), 12);
  }
});
