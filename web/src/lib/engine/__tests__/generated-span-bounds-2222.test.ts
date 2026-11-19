import { beforeAll, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { generate } from './helpers/random-models-2d';
import { runLegacyPlasticCollapse } from './legacy-plastic-helper';
import { buildSolverInput2D } from '../solver-service';
import { initSolver, solve } from '../wasm-solver';
import * as wasm from '../wasm-solver';
import { memberGeom } from '../influence/unit-sweep';
import { uniformAlong } from '../influence/areas';
import { targetDisplacement } from '../influence/maxwell';
import { computeDiagramValueAt } from '../diagrams';
import { E, I, planeModel } from '../influence/__tests__/fixtures';

beforeAll(async () => { await initSolver(); uiStore.analysisMode = '2d'; });

it('keeps a complete inclined influence load on its member #2222', () => {
  const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 1.25, 0.25]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
  const { L } = memberGeom(input, 1);
  const loads = uniformAlong(input, 1, 0, L, 1, { x: 0, z: -1 });
  const r = solve({ ...input, loads });
  expect(r.elementForces[0].distributedLoads).toHaveLength(1);
  expect(r.elementForces[0].distributedLoadsX).toHaveLength(1);
  expect(r.reactions[0].rz).toBeCloseTo(L, 12);
  expect(Math.abs(r.reactions[0].my)).toBeCloseTo(L * 1.25 / 2, 12);
  const step = new DataView(new ArrayBuffer(8));
  step.setFloat64(0, L);
  const bits = step.getBigUint64(0);
  step.setBigUint64(0, bits + 1n);
  const outside = step.getFloat64(0);
  step.setBigUint64(0, bits - 1n);
  const inside = step.getFloat64(0);
  for (const [a, b] of [[-Number.MIN_VALUE, L], [0, outside], [L, 0]]) {
    expect(() => uniformAlong(input, 1, a, b, 1, { x: 0, z: -1 })).toThrow('invalid distributed load interval');
  }
  for (const [a, b] of [[0, 0], [L, L]]) {
    expect(() => uniformAlong(input, 1, a, b, 1, { x: 0, z: -1 })).toThrow(/Element 1.*interval.*geometry limit/);
  }
  for (const [a, b] of [[Number.MIN_VALUE, inside], [L / 4, 3 * L / 4]]) {
    const partial = uniformAlong(input, 1, a, b, 1, { x: 0, z: -1 });
    const result = solve({ ...input, loads: partial });
    expect(result.reactions[0].rz).toBeCloseTo(b - a, 12);
  }
});

it.each([
  ['beam', 11], ['beam', 17], ['beam', 22], ['beam', 30], ['beam', 42],
  ['beam', 45], ['frame', 7], ['frame', 16], ['frame', 27], ['frame', 39],
  ['gable', 1], ['gable', 8], ['gable', 14], ['gable', 37], ['gable', 48],
  ['arch', 22], ['arch', 46], ['mixed', 6], ['mixed', 13], ['mixed', 17],
  ['mixed', 23], ['mixed', 28], ['mixed', 29], ['beam', 4], ['cantilever', 13],
  ['cantilever', 20], ['cantilever', 22], ['cantilever', 23], ['cantilever', 26], ['cantilever', 42],
  ['cantilever', 46], ['cantilever', 47],
] as const)('preserves the %s seed %i plastic mechanism #2222', (family, seed) => {
  modelStore.withoutUndo(() => generate(family, seed));
  const run = runLegacyPlasticCollapse()!;
  expect(run.result.unresolved).toBeUndefined();
  expect(run.result.isMechanism).toBe(true);
});

it('retains member shear, bending and deflection under rotations and mirrors #2222', () => {
  const probe = vi.spyOn(wasm, 'solve');
  try {
    for (const [dx, dz] of [[1.25, 0.25], [1.25, -0.25], [-1.25, 0.25], [0, 2], [2, 0]]) {
      const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, dx, dz]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
      const { L, c, s } = memberGeom(input, 1);
      const dir = { x: -s, z: c };
      const q = c * c + s * s;
      const loads = uniformAlong(input, 1, 0, L, 1, dir);
      const r = solve({ ...input, loads });
      const ef = r.elementForces[0];
      expect(ef.distributedLoads).toEqual([{ qI: q, qJ: q, a: 0, b: ef.length }]);
      for (const t of [0, 0.25, 0.75, 1]) {
        const x = t * L;
        expect(computeDiagramValueAt('shear', t, ef)).toBeCloseTo(-q * (L - x), 11);
        expect(computeDiagramValueAt('moment', t, ef)).toBeCloseTo(-q * ((L - x) ** 2) / 2, 11);
      }
      const tip = r.displacements.find((d) => d.nodeId === 2)!;
      expect(-s * tip.ux + c * tip.uz).toBeCloseTo(q * L ** 4 / (8 * E * 1000 * I), 12);
      for (const t of [0.2, 0.5, 0.8]) {
        const x = t * L;
        const v = q * x ** 2 * (6 * L ** 2 - 4 * L * x + x ** 2) / (24 * E * 1000 * I);
        expect(targetDisplacement(input, 'uz', { kind: 'section', elementId: 1, t }, loads)).toBeCloseTo(c * v, 12);
        expect(targetDisplacement(input, 'ux', { kind: 'section', elementId: 1, t }, loads)).toBeCloseTo(-s * v, 12);
        const childInput = probe.mock.calls.at(-1)![0];
        const childResult = probe.mock.results.at(-1)!.value;
        expect(childResult.elementForces).toHaveLength(2);
        let cut = 0;
        for (const [k, child] of childResult.elementForces.entries()) {
          const geom = memberGeom(childInput, child.elementId);
          const end = k === childResult.elementForces.length - 1 ? L : cut + geom.L;
          const mappedQ = q * ((end - cut) / geom.L);
          expect(child.distributedLoads).toEqual([{ qI: mappedQ, qJ: mappedQ, a: 0, b: child.length }]);
          cut = end;
          const offset = geom.ni.x * c + geom.ni.z * s;
          for (const station of [0, 0.25, 0.75, 1]) {
            const at = offset + station * geom.L;
            expect(computeDiagramValueAt('shear', station, child)).toBeCloseTo(-q * (L - at), 11);
            expect(computeDiagramValueAt('moment', station, child)).toBeCloseTo(-q * (L - at) ** 2 / 2, 11);
          }
        }
      }
    }
  } finally { probe.mockRestore(); }
});
