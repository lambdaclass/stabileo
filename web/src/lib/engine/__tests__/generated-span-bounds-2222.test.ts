import { beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { generate } from './helpers/random-models-2d';
import { runLegacyPlasticCollapse } from './legacy-plastic-helper';
import { buildSolverInput2D } from '../solver-service';
import { initSolver, solve } from '../wasm-solver';
import { memberGeom } from '../influence/unit-sweep';
import { uniformAlong } from '../influence/areas';
import { targetDisplacement } from '../influence/maxwell';
import { computeDiagramValueAt } from '../diagrams';
import { E, I, planeModel } from '../influence/__tests__/fixtures';

beforeAll(async () => { await initSolver(); uiStore.analysisMode = '2d'; });

it.skip('known wrong result: #2222 keeps a complete inclined influence load on its member #2222', () => {
  const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 1.25, 0.25]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
  const { L } = memberGeom(input, 1);
  const loads = uniformAlong(input, 1, 0, L, 1, { x: 0, z: -1 });
  const r = solve({ ...input, loads });
  expect(r.elementForces[0].distributedLoads).toHaveLength(1);
  expect(r.elementForces[0].distributedLoadsX).toHaveLength(1);
  expect(r.reactions[0].rz).toBeCloseTo(L, 12);
  expect(Math.abs(r.reactions[0].my)).toBeCloseTo(L * 1.25 / 2, 12);
});

it.skip('known wrong result: #2222 preserves all CI plastic mechanisms #2222', () => {
  const cases = [['beam', 11], ['beam', 17], ['beam', 22], ['beam', 30], ['beam', 42], ['beam', 45], ['frame', 7], ['frame', 16], ['frame', 27], ['frame', 39], ['gable', 1], ['gable', 8], ['gable', 14], ['gable', 37], ['gable', 48], ['arch', 22], ['arch', 46], ['mixed', 6], ['mixed', 13], ['mixed', 17], ['mixed', 23], ['mixed', 28], ['mixed', 29]] as const;
  for (const [family, seed] of cases) {
    modelStore.clear();
    generate(family, seed);
    const run = runLegacyPlasticCollapse()!;
    expect(run.result.unresolved).toBeUndefined();
    expect(run.result.isMechanism).toBe(true);
  }
});

it.skip('known wrong result: #2222 retains member shear, bending and deflection under rotations and mirrors #2222', () => {
  for (const [dx, dz] of [[1.25, 0.25], [1.25, -0.25], [-1.25, 0.25], [0, 2], [2, 0]]) {
    const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, dx, dz]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
    const { L, c, s } = memberGeom(input, 1);
    const dir = { x: -s, z: c };
    const loads = uniformAlong(input, 1, 0, L, 1, dir);
    const r = solve({ ...input, loads });
    const ef = r.elementForces[0];
    expect(ef.distributedLoads).toEqual([{ qI: 1, qJ: 1, a: 0, b: ef.length }]);
    for (const t of [0, 0.25, 0.75, 1]) {
      const x = t * L;
      expect(computeDiagramValueAt('shear', t, ef)).toBeCloseTo(-(L - x), 11);
      expect(computeDiagramValueAt('moment', t, ef)).toBeCloseTo(-((L - x) ** 2) / 2, 11);
    }
    const tip = r.displacements.find((d) => d.nodeId === 2)!;
    expect(-s * tip.ux + c * tip.uz).toBeCloseTo(L ** 4 / (8 * E * 1000 * I), 12);
    for (const t of [0.2, 0.5, 0.8]) {
      const x = t * L;
      const v = x ** 2 * (6 * L ** 2 - 4 * L * x + x ** 2) / (24 * E * 1000 * I);
      expect(targetDisplacement(input, 'uz', { kind: 'section', elementId: 1, t }, loads)).toBeCloseTo(c * v, 12);
      expect(targetDisplacement(input, 'ux', { kind: 'section', elementId: 1, t }, loads)).toBeCloseTo(-s * v, 12);
    }
  }
});
