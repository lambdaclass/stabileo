import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d, solve_corotational_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
function fixture(a: number, b: number, axis: 'x' | 'y' | 'z') {
  const s = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];
  Object.assign(s.materials['1'], { e: 1000, nu: 0 }); Object.assign(s.sections['1'], { a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
  for (const k of ['cw', 'asY', 'asZ']) delete s.sections['1'][k];
  for (const k of ['releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd']) s.elements['1'][k] = false;
  s.nodes = { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 1, y: 0, z: 0 } };
  s.elements = { 1: { ...s.elements['1'], nodeI: 1, nodeJ: 2 } };
  s.supports = { 1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } };
  const q = b > a ? 1 / (b - a) : 1;
  s.loads = [{ type: 'distributed', data: { elementId: 1, a, b, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0], [axis]: [q, q, q] } } }];
  return s;
}
const solves = [
  (s: ReturnType<typeof fixture>): AnalysisResults3D => solve_3d(s),
  (s: ReturnType<typeof fixture>): AnalysisResults3D => JSON.parse(solve_pdelta_3d(JSON.stringify(s), 100, 1e-10)).results,
  (s: ReturnType<typeof fixture>): AnalysisResults3D => JSON.parse(solve_corotational_3d(JSON.stringify(s), 100, 1e-10, 4)).results,
];
for (const axis of ['x', 'y', 'z'] as const) for (const [a, b] of [[-1e-14, 1e-14], [1 - 1e-14, 1 + 1e-14], [-1e-14, 0], [1, 1 + 1e-14], [0.5, 0.5]]) {
  it(`known wrong result: #2219 WASM refuses unsafe moment support ${axis} [${a},${b}]`, () => {
    for (const solve of solves) expect(() => solve(fixture(a!, b!, axis))).toThrow(/distributed moment span/);
  });
}
const allowance = 64 * Number.EPSILON;
for (const [a, b] of [[0, 1], [0.25, 0.75], [0.5, 0.5 + Number.EPSILON / 2], [-allowance, 0.5], [0.5, 1 + allowance], [0, 4 * allowance], [1 - 4 * allowance, 1]]) {
  it(`known wrong result: #2219 WASM uses canonical support in assembly and recovery [${a},${b}]`, () => {
    const ca = Math.max(0, a!), cb = Math.min(1, b!), q = 1 / (b! - a!), total = q * (cb - ca);
    for (const solve of solves) {
      const result = solve(fixture(a!, b!, 'x')), ef = result.elementForces[0]!;
      expect(ef.memberMoments![0]!.a).toBe(ca); expect(ef.memberMoments![0]!.b).toBe(cb);
      expect(ef.mxStart).toBeCloseTo(-total, 10);
      for (const x of [0, ca, ca + (cb - ca) / 4, ca + (cb - ca) / 2, cb, 1]) {
        expect(evaluateDiagramAt(ef, 'torsion', x)).toBeCloseTo(-total + q * Math.max(0, Math.min(x - ca, cb - ca)), 10);
        for (const kind of ['shearY', 'shearZ', 'momentY', 'momentZ'] as const) expect(evaluateDiagramAt(ef, kind, x)).toBeCloseTo(0, 10);
      }
      expect(result.displacements.find(d => d.nodeId === 2)!.rx).toBeCloseTo(total * (ca + cb) / (2 * 1000), 10);
    }
  });
}

for (const [a, b] of [[-allowance, 0.49], [0.51, 1 + allowance], [-allowance, 4 * allowance], [1 - 4 * allowance, 1 + allowance], [-allowance, allowance], [1 - allowance, 1 + allowance], [-allowance - allowance * Number.EPSILON, 0.5], [0.5, 1 + allowance + Number.EPSILON]]) {
  it(`known wrong result: #2219 WASM refuses endpoint rounding beyond span precision [${a},${b}]`, () => {
    for (const solve of solves) expect(() => solve(fixture(a!, b!, 'x'))).toThrow(/distributed moment span/);
  });
}
