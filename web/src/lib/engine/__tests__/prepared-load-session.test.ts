import { afterEach, expect, it, vi } from 'vitest';
import { prepareLoadSession2D, prepareLoadSession3D, solve, solve3D, setPreparedLoadSessionsEnabled } from '../wasm-solver';
import { LoadSession2D, LoadSession3D } from '../../wasm/dedaliano_engine.js';
import { solveMovingLoads, solveMovingLoadsAsync } from '../moving-loads';
import { buildPath3D, sweepMovingLoad3D } from '../moving-loads-3d';
import type { SolverInput, SolverLoad } from '../types';
import type { SolverInput3D, SolverLoad3D } from '../types-3d';
const beam2 = (): SolverInput => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]), loads: [],
});
const beam3 = (): SolverInput3D => ({
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4, iy: 2e-4, j: 1e-5 }]]),
  supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: [],
});
const numeric = (r: any) => ({ displacements: r.displacements, reactions: r.reactions, forces: r.elementForces, constraints: r.constraintForces });
afterEach(() => { vi.restoreAllMocks(); setPreparedLoadSessionsEnabled(true); });
it('2D load-only solves match independent solves and validate each new RHS', () => {
  const input = beam2(), session = prepareLoadSession2D(input);
  try {
    for (const p of [10, -20, 0, 50]) {
      const loads: SolverLoad[] = [{ type: 'nodal', data: { nodeId: 2, fx: 2, fz: p, my: 3 } }];
      expect(numeric(session.solve(loads))).toEqual(numeric(solve({ ...input, loads })));
    }
    expect(() => session.solve([{ type: 'nodal', data: { nodeId: 2, fx: NaN, fz: 0, my: 0 } }])).toThrow();
    expect(numeric(session.solve([]))).toEqual(numeric(solve(input)));
  } finally { session.free(); }
  session.free(); expect(() => session.solve([])).toThrow('freed');
});
it('3D prepared and constrained sessions match ordinary solves', () => {
  for (const constrained of [false, true]) {
    const input = beam3();
    if (constrained) input.constraints = [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [1] }];
    const session = prepareLoadSession3D(input);
    try {
      for (const p of [10, -20, 0]) {
        const loads: SolverLoad3D[] = [{ type: 'pointOnElement', data: { elementId: 1, a: 2, py: 0, pz: p } }];
        expect(numeric(session.solve(loads))).toEqual(numeric(solve3D({ ...input, loads })));
      }
    } finally { session.free(); }
  }
});
it('retains complete 2D sweep results for an asymmetric train', () => {
  const config = { train: { name: 'T', axles: [{ offset: 0, weight: 20 }, { offset: 1, weight: 10 }] }, step: 0.5 };
  setPreparedLoadSessionsEnabled(false); const reference = solveMovingLoads(beam2(), config);
  setPreparedLoadSessionsEnabled(true); expect(solveMovingLoads(beam2(), config)).toEqual(reference);
});
it('retains the 3D critical-station envelope', async () => {
  const input = beam3(), path = buildPath3D(input, [1])!;
  const train = { name: 'T', axles: [{ offset: 0, weight: 20 }, { offset: 1, weight: 10 }] };
  setPreparedLoadSessionsEnabled(false); const reference = await sweepMovingLoad3D(input, path, train, { step: 0.5 });
  setPreparedLoadSessionsEnabled(true); expect(await sweepMovingLoad3D(input, path, train, { step: 0.5 })).toEqual(reference);
});
it('frees native sessions on cancellation and progress callback failures', async () => {
  const free2 = vi.spyOn(LoadSession2D.prototype, 'free');
  const free3 = vi.spyOn(LoadSession3D.prototype, 'free');
  const train = { name: 'T', axles: [{ offset: 0, weight: 20 }] };
  const controller = new AbortController();
  await solveMovingLoadsAsync(beam2(), { train, step: 0.5 }, () => controller.abort(), controller.signal);
  expect(free2).toHaveBeenCalledTimes(1);
  const input = beam3(), path = buildPath3D(input, [1])!;
  await expect(sweepMovingLoad3D(input, path, train, { onProgress() { throw new Error('stop'); } })).rejects.toThrow('stop');
  expect(free3).toHaveBeenCalledTimes(1);
});
it('2D constrained sessions retain constraint forces and prescribed coupling', () => {
  const input = beam2();
  input.constraints = [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }];
  const session = prepareLoadSession2D(input);
  try {
    for (const fx of [10, -20]) {
      const loads: SolverLoad[] = [{ type: 'nodal', data: { nodeId: 2, fx, fz: -5, my: 2 } }];
      expect(numeric(session.solve(loads))).toEqual(numeric(solve({ ...input, loads })));
    }
  } finally { session.free(); }
});
