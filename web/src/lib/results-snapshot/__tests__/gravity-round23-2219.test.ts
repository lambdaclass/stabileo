import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, solve_corotational_3d, compute_diagram_value_at_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });

it.skip('known wrong result: #2219 WASM shortening member torque diagrams match recovered end actions', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/reaction-recovery-3d.json', import.meta.url), 'utf8'));
  for (const strain of [-0.0001, 0, 0.0001]) {
    const s = structuredClone(fixture);
    s.supports['1'] = { nodeId: 1, rx: false, ry: true, rz: true, rrx: false, rry: true, rrz: true };
    const axial = s.materials['1'].e * 1000 * s.sections['1'].a * strain;
    s.loads = [{ type: 'nodal', data: { nodeId: 1, fx: axial, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }, { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [2, 2, 2], y: [0, 0, 0], z: [0, 0, 0] } } }];
    for (const result of [solve_3d(s), JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results, JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 4)).results] as AnalysisResults3D[]) {
      const ef = result.elementForces[0]!;
      expect(Math.abs(evaluateDiagramAt(ef, 'torsion', 1) - ef.mxEnd)).toBeLessThan(1e-10);
      expect(Math.abs(ef.mxEnd - ef.mxStart - 6)).toBeLessThan(1e-10);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const expected = ef.mxStart + 6 * t;
        expect(Math.abs(evaluateDiagramAt(ef, 'torsion', t) - expected)).toBeLessThan(1e-10);
        expect(Math.abs(compute_diagram_value_at_3d(JSON.stringify({ elementForces: ef, kind: 'torsion', t })) - expected)).toBeLessThan(1e-10);
      }
    }
  }
});
