import { beforeAll, beforeEach, expect, it } from 'vitest';
import { t } from '../../i18n';
import { initSolver, input2DToWireObject, input3DToWireObject } from '../../engine/wasm-solver';
import { tallyRoles } from '../../engine/generators/member-roles';
import { solve_2d, solve_3d, solve_pdelta_2d, solve_pdelta_3d, solve_staged_2d } from '../../wasm/dedaliano_engine.js';
import { applyPlacedMesh } from '../../model/edit/mesh-apply';
import type { MeshOutput } from '../../model/edit/mesher';
import { applyGeneratedModel } from '../generator-apply';
import { modelStore } from '..';
import { addShellOnCorners } from '../draw-state.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => modelStore.clear());

function quadCorners(height: number) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(1, 0, 0);
  const c = modelStore.addNode(1, 1, height);
  const d = modelStore.addNode(0, 1, 0);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(d, 'fixed3d');
  modelStore.addNodalLoad3D(c, 0, 0, -1, 0, 0, 0);
  return { a, b, c, d };
}

function drawQuad(height: number, curved?: boolean) {
  const corners = quadCorners(height);
  const { a, b, c, d } = corners;
  expect(addShellOnCorners([a, b, c, d], 1, 0.32, curved)).toEqual({ key: 'q1' });
  return corners;
}

const warpedRefusal = () => t('knownIssue.SH-WARPED-MITC4') + ' (#1057)';

it('#2535 uses node IDs for warp containment in the linear WASM export', () => {
  drawQuad(0.1);
  const wire = input3DToWireObject(modelStore.buildSolverInput3D()!);
  wire.nodes = Object.fromEntries(Object.values(wire.nodes).map(node => [`corner-${node.id}`, node]));
  expect(() => solve_3d(wire)).toThrow(/SH-WARPED-MITC4/);
});

it('#2535 uses node IDs for warp containment in the nonlinear WASM export', () => {
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

it('#2535 a drawn quad is never omitted by Basic 3D analysis', async () => {
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

it('#2535 a restored quad is never omitted by a projected 2D analysis', async () => {
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
    expect(result.structuredDiagnostics?.some(d => d.phase === 'SH-WARPED-MITC4') ?? false).toBe(false);
  }
});

function planeWire() {
  const a = modelStore.addNode(0, 0);
  const b = modelStore.addNode(1, 0);
  modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed');
  modelStore.addNodalLoad(b, 0, -1);
  return input2DToWireObject(modelStore.buildSolverInput()!);
}

function planeWireWithQuad() {
  const wire = planeWire();
  expect(solve_2d({ ...wire, quads: {} }).displacements).toHaveLength(2);
  return { ...wire, quads: { 1: { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.32 } } };
}

it('#2535 the linear 2D WASM export refuses a quad carried in the wire input', () => {
  expect(() => solve_2d(planeWireWithQuad())).toThrow(/Shell elements require 3D analysis/);
});

it('#2535 the nonlinear 2D WASM export refuses a quad carried in the wire input', () => {
  expect(() => solve_pdelta_2d(JSON.stringify(planeWireWithQuad()), 20, 1e-4)).toThrow(/Shell elements require 3D analysis/);
});

it.each([
  ['linear', (wire: ReturnType<typeof planeWire>) => solve_2d(wire)],
  ['P-Delta', (wire: ReturnType<typeof planeWire>) => JSON.parse(solve_pdelta_2d(JSON.stringify(wire), 20, 1e-4))],
  ['staged', (wire: ReturnType<typeof planeWire>) => JSON.parse(solve_staged_2d(JSON.stringify({
    ...wire,
    stages: [{ name: 'Load the beam', elementsAdded: [1], supportsAdded: [1], loadIndices: [0] }],
  })))],
] as const)('#2535 %s WASM accepts empty legacy shell lists only', (_analysis, solvePlane) => {
  const wire = planeWire();
  const expected = solvePlane(wire);
  for (const field of ['plates', 'quads', 'quad9s', 'curvedShells', 'solidShells']) {
    expect(solvePlane({ ...wire, [field]: [] })).toEqual(expected);
    expect(() => solvePlane({ ...wire, [field]: [{ id: 1 }] })).toThrow(/Shell elements require 3D analysis/);
  }
});

it('#2535 sends applied mesh cells through the same PRO warp check', () => {
  const { a, b, c, d } = quadCorners(0.1);
  const mesh: MeshOutput = {
    points: [[0, 0, 0], [1, 0, 0], [1, 1, 0.1], [0, 1, 0]],
    cells: [[0, 1, 2, 3]],
    structured: true,
    boundary: new Set([0, 1, 2, 3]),
    plane: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  };
  const nodes = [a, b, c, d];
  const applied = applyPlacedMesh(mesh, { materialId: 1, thickness: 0.32, splitBeams: false }, {
    newNodes: new Map(), nodeIds: nodes, cells: [{ nodes }],
  });
  expect(applied.quads).toEqual([1]);
  expect(modelStore.solve3D(false, false, true)).toBe(warpedRefusal());
});

it('#2535 sends generated quad data through the same PRO warp check', () => {
  const { a, b, c, d } = quadCorners(0.1);
  const snapshot = modelStore.snapshot();
  applyGeneratedModel({
    json: {
      name: 'Warped quad', nodes: snapshot.nodes.map(([id, n]) => ({ id, x: n.x, y: n.y, z: n.z ?? 0 })),
      materials: [{ id: 1, name: 'Fixture material', e: 29_000, nu: 0.22 }],
      sections: [], elements: [], supports: [
        { id: 1, nodeId: a, type: 'fixed3d' }, { id: 2, nodeId: d, type: 'fixed3d' },
      ],
      loads: [{ type: 'nodal3d', data: { id: 1, nodeId: c, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0, caseId: 1 } }],
      plates: [], quads: [{ id: 1, nodes: [a, b, c, d], materialId: 1, thickness: 0.32 }],
      constraints: [], loadCases: [{ id: 1, type: 'D', name: 'Dead' }], combinations: [],
    },
    counts: tallyRoles([]), totalLengthM: 0, slopePercent: null, assumptions: [], sections: {},
  }, { source: 'generator-structure', params: {}, atIso: '2026-11-24T00:00:00Z' });
  expect(modelStore.model.quads.size).toBe(1);
  expect(modelStore.solve3D(false, false, true)).toBe(warpedRefusal());
});

it('#2535 contains the same drawn quad in the nonlinear store paths', async () => {
  const { a, b } = drawQuad(0.1);
  const member = modelStore.addElement(a, b, 'truss');
  modelStore.updateElement(member, { behaviour: 'tensionOnly' });
  expect(modelStore.solve3D(false, false, true)).toBe(warpedRefusal());
  expect(await modelStore.solve3DAsync(false, false, true)).toBe(warpedRefusal());
});
