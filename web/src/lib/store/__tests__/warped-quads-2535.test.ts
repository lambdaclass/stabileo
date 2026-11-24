import { beforeAll, beforeEach, expect, it } from 'vitest';
import { t } from '../../i18n';
import { initSolver, input2DToWireObject, input3DToWireObject } from '../../engine/wasm-solver';
import { knownIssueRefusal } from '../../engine/known-issues';
import { solve_2d, solve_3d, solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { modelStore } from '..';
import { addShellOnCorners } from '../draw-state.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => modelStore.clear());

function drawQuad(height: number, curved?: boolean) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(1, 0, 0);
  const c = modelStore.addNode(1, 1, height);
  const d = modelStore.addNode(0, 1, 0);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(d, 'fixed3d');
  modelStore.addNodalLoad3D(c, 0, 0, -1, 0, 0, 0);
  expect(addShellOnCorners([a, b, c, d], 1, 0.32, curved)).toEqual({ key: 'q1' });
  return { a, b, c, d };
}

const warpedRefusal = () => t('knownIssue.SH-WARPED-MITC4') + ' (#1057)';

it.fails('#2535 uses node IDs for warp containment in the linear WASM export', () => {
  drawQuad(0.1);
  const wire = input3DToWireObject(modelStore.buildSolverInput3D()!);
  wire.nodes = Object.fromEntries(Object.values(wire.nodes).map(node => [`corner-${node.id}`, node]));
  expect(() => solve_3d(wire)).toThrow(/SH-WARPED-MITC4/);
});

it.fails('#2535 uses node IDs for warp containment in the nonlinear WASM export', () => {
  drawQuad(0.1);
  const wire = input3DToWireObject(modelStore.buildSolverInput3D()!);
  wire.nodes = Object.fromEntries(Object.values(wire.nodes).map(node => [`corner-${node.id}`, node]));
  expect(() => solve_pdelta_3d(JSON.stringify(wire), 20, 1e-4)).toThrow(/SH-WARPED-MITC4/);
});

function frameWithDrawnQuad() {
  const { a, b, c, d } = drawQuad(0.1);
  modelStore.addElement(a, b);
  modelStore.addElement(a, c);
  modelStore.addElement(d, b);
}

it.fails('#2535 a drawn quad is never omitted by Basic 3D analysis', async () => {
  frameWithDrawnQuad();
  modelStore.addCombination('One case', [{ caseId: 1, factor: 1 }]);
  const outcomes = await Promise.all([
    modelStore.solve3D(),
    modelStore.solve3DAsync(),
    modelStore.solveCombinations3D(),
    modelStore.solveCombinations3DParallel(),
  ]);
  expect(outcomes).toEqual(Array.from({ length: 4 }, () => t('svc.shellsRequirePro3d')));
  expect(modelStore.singleSolveInput3D()).toBeNull();
});

it.fails('#2535 a restored quad is never omitted by a projected 2D analysis', async () => {
  frameWithDrawnQuad();
  modelStore.restore(modelStore.snapshot());
  modelStore.addCombination('One case', [{ caseId: 1, factor: 1 }]);
  const outcomes = await Promise.all([
    modelStore.solve(false, 'xz'),
    modelStore.solveAsync(false, 'xz'),
    modelStore.solveCombinations(false, 'xz'),
  ]);
  expect(outcomes).toEqual(Array.from({ length: 3 }, () => t('svc.shellsRequirePro3d')));
  expect(modelStore.buildSolverInput(false, 'xz')).toBeNull();
});

it('#2535 contains the drawn flat formulation in PRO through both store solves and restore', async () => {
  drawQuad(0.1);
  expect(modelStore.solve3D(false, false, true)).toBe(warpedRefusal());
  modelStore.restore(modelStore.snapshot());
  expect(await modelStore.solve3DAsync(false, false, true)).toBe(warpedRefusal());
});

it('#2535 still solves a planar quad and an explicitly curved quad', () => {
  for (const [height, curved] of [[0, undefined], [0.1, true]] as const) {
    modelStore.clear();
    const { c } = drawQuad(height, curved);
    const result = modelStore.solve3D(false, false, true);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.displacements.find(d => d.nodeId === c)?.uz).toBeLessThan(0);
    expect(knownIssueRefusal(result)).toBeNull();
  }
});

function planeWireWithQuad() {
  const a = modelStore.addNode(0, 0);
  const b = modelStore.addNode(1, 0);
  modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed');
  modelStore.addNodalLoad(b, 0, -1);
  const wire = input2DToWireObject(modelStore.buildSolverInput()!);
  expect(solve_2d({ ...wire, quads: {} }).displacements).toHaveLength(2);
  return { ...wire, quads: { 1: { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.32 } } };
}

it.fails('#2535 the linear 2D WASM export refuses a quad carried in the wire input', () => {
  expect(() => solve_2d(planeWireWithQuad())).toThrow(/Shell elements require 3D analysis/);
});

it.fails('#2535 the nonlinear 2D WASM export refuses a quad carried in the wire input', () => {
  expect(() => solve_pdelta_2d(JSON.stringify(planeWireWithQuad()), 20, 1e-4)).toThrow(/Shell elements require 3D analysis/);
});
