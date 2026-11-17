import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, solve_corotational_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/reaction-recovery-3d.json', import.meta.url), 'utf8'));

it.skip('known wrong result: #2219 WASM corotational couple diagrams follow a large twist', () => {
  const s = structuredClone(fixture);
  Object.assign(s.elements['1'], { localYx: 0, localYy: 1, localYz: 0 });
  const torque = s.materials['1'].e * 1000 / (2 * (1 + s.materials['1'].nu)) * s.sections['1'].j / 3;
  for (const sign of [-1, 0, 1]) {
    s.loads = [{ type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, fz: 0, mx: sign * torque, my: 0, mz: 0 } }, { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 0, 0], y: [0.001, 0.001, 0.001], z: [0, 0, 0] } } }];
    const r = JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 8, false)).results as AnalysisResults3D;
    const ef = r.elementForces[0]!;
    for (const [kind, end] of [['momentY', ef.myEnd], ['momentZ', ef.mzEnd], ['torsion', ef.mxEnd]] as const) expect(Math.abs(evaluateDiagramAt(ef, kind, 1) - end)).toBeLessThan(1e-8);
  }
});

it.skip('known wrong result: #2219 WASM released torque keeps balanced loading and refuses a resultant', () => {
  const s = structuredClone(fixture);
  s.nodes['2'] = { id: 2, x: 6, y: 0, z: 0 };
  s.elements['2'] = { ...s.elements['1'], id: 2, nodeI: 1, nodeJ: 2 };
  s.supports['2'] = { ...s.supports['0'], nodeId: 2 };
  Object.assign(s.elements['1'], { releaseTStart: true, releaseTEnd: true });
  for (const x of [[1, 0, -1], [0, 0, 0], [1, 1, 1], [-1, -1, -1], [1e-30, 1e-30, 1e-30]]) {
    s.loads = [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x, y: [0, 0, 0], z: [0, 0, 0] } } }];
    for (const solve of [() => solve_3d(s), () => JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results, () => JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 4, false)).results]) {
      if (x[0]! + 4 * x[1]! + x[2]! === 0) {
        const ef = (solve() as AnalysisResults3D).elementForces[0]!;
        expect(ef.mxStart).toBe(0);
        expect(ef.mxEnd).toBe(0);
        expect(evaluateDiagramAt(ef, 'torsion', 0.5)).toBeCloseTo(0.75 * x[0]!, 12);
      } else expect(solve).toThrow(/both ends released/);
    }
  }
});
