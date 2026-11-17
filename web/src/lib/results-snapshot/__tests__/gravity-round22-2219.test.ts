import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_2d, solve_pdelta_2d, solve_corotational_2d, solve_3d, solve_pdelta_3d, solve_corotational_3d, compute_diagram_value_at_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { superposed } from '../../engine/combination-methods';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/reaction-recovery-3d.json', import.meta.url), 'utf8'));

it('known wrong result: #2219 WASM corotational couple diagrams follow a large twist', () => {
  const s = structuredClone(fixture);
  Object.assign(s.elements['1'], { localYx: 0, localYy: 1, localYz: 0 });
  const torque = s.materials['1'].e * 1000 / (2 * (1 + s.materials['1'].nu)) * s.sections['1'].j / 3;
  for (const sign of [-1, 0, 1]) {
    s.loads = [{ type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, fz: 0, mx: sign * torque, my: 0, mz: 0 } }, { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 0, 0], y: [0.001, 0.001, 0.001], z: [0, 0, 0] } } }];
    const r = JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 8)).results as AnalysisResults3D;
    const ef = r.elementForces[0]!;
    for (const [kind, end] of [['momentY', ef.myEnd], ['momentZ', ef.mzEnd], ['torsion', ef.mxEnd]] as const) expect(Math.abs(evaluateDiagramAt(ef, kind, 1) - end)).toBeLessThan(1e-8);
  }
});

it('known wrong result: #2219 WASM released torque keeps balanced loading and refuses a resultant', () => {
  const s = structuredClone(fixture);
  s.nodes['2'] = { id: 2, x: 6, y: 0, z: 0 };
  s.elements['2'] = { ...s.elements['1'], id: 2, nodeI: 1, nodeJ: 2 };
  s.supports['2'] = { ...s.supports['0'], nodeId: 2 };
  Object.assign(s.elements['1'], { releaseTStart: true, releaseTEnd: true });
  for (const x of [[1, 0, -1], [1, -0.5, 1], [0, 0, 0], [1, 1, 1], [-1, -1, -1], [1e-30, 1e-30, 1e-30], [1, 0, -1 + Number.EPSILON]]) {
    s.loads = [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x, y: [0, 0, 0], z: [0, 0, 0] } } }];
    for (const solve of [() => solve_3d(s), () => JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results, () => JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 4)).results]) {
      if (x[0]! + 4 * x[1]! + x[2]! === 0) {
        const ef = (solve() as AnalysisResults3D).elementForces[0]!;
        expect(ef.mxStart === 0).toBe(true);
        expect(ef.mxEnd === 0).toBe(true);
        expect(evaluateDiagramAt(ef, 'torsion', 0.5)).toBeCloseTo((x[1] === 0 ? 0.75 : 0) * x[0]!, 12);
        expect(evaluateDiagramAt(ef, 'torsion', 0.25)).toBeCloseTo((x[1] === 0 ? 9 / 16 : 9 / 32) * x[0]!, 12);
      } else expect(solve).toThrow(/both ends released/);
    }
  }
});

it('known wrong result: #2219 transverse point couples survive diagrams and combination factors', () => {
  const s = structuredClone(fixture);
  s.loads = [];
  const result = solve_3d(s) as AnalysisResults3D;
  result.elementForces[0]!.pointTorques = [{ a: 1.5, p: 2, y: 3, z: -4 }];
  for (const f of [-2, 0, 2]) {
    const ef = superposed([{ r: result, f }]).elementForces[0]!;
    for (const [kind, value] of [['torsion', 2], ['momentY', 3], ['momentZ', -4]] as const) {
      for (const t of [0.25, 0.75]) {
        const expected = t < 0.5 ? 0 : f * value;
        expect(evaluateDiagramAt(ef, kind, t)).toBeCloseTo(expected, 12);
        expect(compute_diagram_value_at_3d(JSON.stringify({ kind, t, elementForces: ef }))).toBeCloseTo(expected, 12);
      }
    }
  }
});

it('plane WASM solves refuse member couples and retain ordinary distributed loads', () => {
  const s = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/reaction-recovery-2d.json', import.meta.url), 'utf8'));
  s.loads = [{type:'distributed',data:{elementId:1,qI:-1,qJ:-1}}];
  for (const solve of [(s: unknown) => solve_2d(s), (s: unknown) => JSON.parse(solve_pdelta_2d(JSON.stringify(s),100,1e-10)).results, (s: unknown) => JSON.parse(solve_corotational_2d(JSON.stringify(s),100,1e-10,4)).results]) {
    const r = solve(s);
    expect(r.displacements.some((d: {uz:number})=>d.uz !== 0)).toBe(true);
    const bad = structuredClone(s);
    bad.loads[0].data.moments = {x:[1,0,-1],y:[0,0,0],z:[0,0,0]};
    expect(()=>solve(bad)).toThrow(/moment|couple|unknown field/i);
  }
});
