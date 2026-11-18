import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { repeatedSolve3D } from '../repeated-solve-3d';
import * as wasm from '../wasm-solver';
import { LoadSession3D } from '../../wasm/dedaliano_engine.js';
import { modelStore, uiStore } from '../../store';
import type { SolverInput3D, SolverLoad3D } from '../types-3d';

beforeAll(wasm.initSolver);
afterEach(() => { vi.restoreAllMocks(); wasm.setPreparedLoadSessionsEnabled(true); modelStore.clear(); });

function beam(): SolverInput3D {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4, iy: 2e-4, j: 1e-5 }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 2, py: 4, pz: -10 } }],
  };
}
const output = (value: unknown) => JSON.stringify(value, (key, v) => key === 'timings' ? undefined : v instanceof Map ? [...v] : v);
const failure = (run: () => unknown) => { try { run(); } catch (e) { return String(e); } throw new Error('Expected refusal'); };

it('reuses one preparation for changed loads with identical complete results and diagnostics', () => {
  const repeated = repeatedSolve3D(), input = beam();
  const solve = vi.spyOn(LoadSession3D.prototype, 'solve'), free = vi.spyOn(LoadSession3D.prototype, 'free');
  try {
    for (const p of [-20, 10, 0]) {
      input.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: 2, py: 4, pz: p } }];
      expect(output(repeated.solve(input))).toBe(output(wasm.solve3D(input)));
    }
    const loads: SolverLoad3D[] = [
      { type: 'distributed', data: { elementId: 1, qYI: 2, qYJ: 5, qZI: -3, qZJ: -1, a: 1, b: 5 } },
      { type: 'thermal', data: { elementId: 1, dtUniform: 10, dtGradientY: 5, dtGradientZ: 3 } },
      { type: 'nodal', data: { nodeId: 2, fx: 3, fy: 0, fz: -1, mx: 0, my: 0, mz: 0, axialOf: { elementId: 1, end: 'j', p: 3 } } },
    ];
    for (const load of loads) {
      input.loads = [load];
      expect(output(repeated.solve(input))).toBe(output(wasm.solve3D(input)));
    }
    expect(solve).toHaveBeenCalledTimes(6);
  } finally { repeated.free(); }
  repeated.free();
  expect(free).toHaveBeenCalledOnce();
  expect(() => repeated.solve(input)).toThrow('freed');
});

it('falls back for changed geometry, stiffness, releases, supports, settlement and constraints', () => {
  const original = beam(), repeated = repeatedSolve3D();
  const solve = vi.spyOn(LoadSession3D.prototype, 'solve');
  try {
    repeated.solve(original);
    const edits: Array<(input: SolverInput3D) => void> = [
      i => { i.nodes.get(2)!.x = 5; },
      i => { i.materials.get(1)!.e *= 0.7; },
      i => { i.sections.get(1)!.iy *= 0.5; },
      i => { i.elements.get(1)!.releaseMyEnd = true; },
      i => { i.supports.get(1)!.dz = -0.001; },
      i => { i.supports.set(2, { nodeId: 2, rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false }); },
      i => { i.constraints = [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [1] }]; },
    ];
    for (const edit of edits) {
      const input = structuredClone(original);
      edit(input);
      expect(output(repeated.solve(input))).toBe(output(wasm.solve3D(input)));
    }
    expect(solve).toHaveBeenCalledOnce();
    original.sections.get(1)!.iy *= 0.8;
    expect(output(repeated.solve(original))).toBe(output(wasm.solve3D(original)));
    expect(solve).toHaveBeenCalledOnce();
    const unsupported = { ...original, leftHand: true };
    expect(failure(() => repeated.solve(unsupported))).toBe(failure(() => wasm.solve3D(unsupported)));
  } finally { repeated.free(); }
});

it('preserves per-load refusals and can still solve a valid load afterwards', () => {
  const repeated = repeatedSolve3D(), input = beam();
  try {
    repeated.solve(input);
    for (const nodeId of [999, NaN]) {
      const invalid: SolverInput3D = { ...input, loads: [{ type: 'nodal', data: { nodeId, fx: 0, fy: 0, fz: 1, mx: 0, my: 0, mz: 0 } }] };
      expect(failure(() => repeated.solve(invalid))).toBe(failure(() => wasm.solve3D(invalid)));
    }
    expect(output(repeated.solve(input))).toBe(output(wasm.solve3D(input)));
  } finally { repeated.free(); }
});

it('preserves first-solve structural refusals without retaining a failed preparation', () => {
  for (const edit of [
    (i: SolverInput3D) => { i.materials.get(1)!.e = 0; },
    (i: SolverInput3D) => { i.nodes.get(2)!.x = NaN; },
    (i: SolverInput3D) => { i.supports.clear(); },
  ]) {
    const input = beam(), repeated = repeatedSolve3D();
    edit(input);
    try { expect(failure(() => repeated.solve(input))).toBe(failure(() => wasm.solve3D(input))); }
    finally { repeated.free(); }
  }
});

it('retains complete nonlinear combinations and frees the preparation on success or refusal', async () => {
  uiStore.analysisMode = 'pro';
  await modelStore.loadExample('3d-nave-industrial');
  wasm.setPreparedLoadSessionsEnabled(false);
  const reference = modelStore.solveCombinations3D(true, false, true);
  expect(reference && typeof reference === 'object').toBe(true);
  wasm.setPreparedLoadSessionsEnabled(true);
  const solve = vi.spyOn(LoadSession3D.prototype, 'solve'), free = vi.spyOn(LoadSession3D.prototype, 'free');
  expect(output(modelStore.solveCombinations3D(true, false, true))).toBe(output(reference));
  expect(solve).toHaveBeenCalledTimes(10);
  expect(free).toHaveBeenCalledOnce();
  solve.mockImplementationOnce(() => { throw 'load refused'; });
  expect(modelStore.solveCombinations3D(true, false, true)).toContain('load refused');
  expect(free).toHaveBeenCalledTimes(2);
}, 30000);

it('retains lifting-support states across opposite load cases and a settled combination', () => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b, 'frame'); modelStore.addElement(b, c, 'frame');
  modelStore.addSupport(a, 'fixed3d', undefined, { dz: -0.001 });
  const support = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false } });
  modelStore.updateSupport(support, { uplift: true });
  const [down, up] = modelStore.model.loadCases;
  modelStore.addNodalLoad3D(c, 0, 0, -10, 0, 0, 0, down!.id);
  modelStore.addNodalLoad3D(c, 0, 0, 10, 0, 0, 0, up!.id);
  modelStore.model.combinations = [{ id: 1, name: 'reverse', factors: [{ caseId: down!.id, factor: -1 }] }];
  wasm.setPreparedLoadSessionsEnabled(false);
  const reference = modelStore.solveCombinations3D(false, false, true);
  if (!reference || typeof reference === 'string') throw new Error(String(reference));
  expect(reference.perCase.get(up!.id)!.nonlinear!.lifted).toContain(b);
  wasm.setPreparedLoadSessionsEnabled(true);
  expect(output(modelStore.solveCombinations3D(false, false, true))).toBe(output(reference));
});
