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
for (const axis of ['x', 'y', 'z'] as const) for (const [a, b] of [[-1e-14, 1e-14], [1 - 1e-14, 1 + 1e-14], [-1e-14, 0], [1, 1 + 1e-14], [0.5, 0.5], [0.5, 0.5 + Number.EPSILON / 2], [0, 256 * Number.EPSILON], [1 - 256 * Number.EPSILON, 1]]) {
  it(`known wrong result: #2219 WASM refuses unsafe moment support ${axis} [${a},${b}]`, () => {
    for (const solve of solves) expect(() => solve(fixture(a!, b!, axis))).toThrow(/distributed moment span/);
  });
}
const allowance = 64 * Number.EPSILON;
for (const [a, b] of [[0, 1], [0.25, 0.75], [0.5, 0.5 + 1e-10], [-allowance, 0.5], [0.5, 1 + allowance], [0, 1e-10], [1 - 1e-9, 1]]) {
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

for (const axis of ['x', 'y', 'z'] as const) {
  it(`known wrong result: #2219 round10 WASM refuses subgeometry quadratic ${axis} support`, () => {
    for (const [length, a, b] of [[1, 0.5, 0.5 + Number.EPSILON / 2], [1, 0, 1e-10 - 1e-26], [1, 0.5, 0.5 + 5e-11], [10, 0, 5e-10], [100, 0, 5e-9]]) {
      const s = fixture(a!, b!, axis), h = b! - a!;
      s.nodes[2].x = length;
      s.loads[0].data.moments[axis] = [1 / h, -0.5 / h, 1 / h];
      for (const solve of solves) expect(() => solve(s)).toThrow(/1e-10/);
    }
  });
  it(`known wrong result: #2219 round10 WASM retains local quadratic ${axis} extrema`, async () => {
    const { compute_diagrams_3d } = await import('../../wasm/dedaliano_engine.js');
    for (const [length, a, b] of [[1, 0, 1e-10], [1, 0, 1e-10 + 1e-26], [1, 0.5, 0.5 + 1e-10], [1, 0.5, 0.5 + 1e-8], [1, 0.25, 0.75], [10, 0, 1e-9], [100, 0, 1e-8]]) {
      const s = fixture(a!, b!, axis), h = b! - a!;
      s.nodes[2].x = length;
      s.loads[0].data.moments[axis] = [1 / h, -0.5 / h, 1 / h];
      for (const solve of solves) {
        const result = solve(s), ef = result.elementForces[0]!;
        const ds = JSON.parse(compute_diagrams_3d(JSON.stringify(result)));
        const d = axis === 'x' ? ds.torsion[0] : axis === 'y' ? ds.momentY[0] : ds.momentZ[0];
        const base = axis === 'x' ? ef.mxStart : axis === 'y' ? ef.myStart + ef.vzStart * a! : ef.mzStart - ef.vyStart * a!;
        const peak = Math.sqrt(3) / 18;
        expect(Math.abs(d.maxValue - base - peak)).toBeLessThan(1e-14);
        expect(Math.abs(d.minValue - base + peak)).toBeLessThan(1e-14);
      }
    }
  });
}

for (const [entry, solve] of solves.entries()) it(`known wrong result: #2219 round11 zero moments match absent moments entry=${entry}`, () => {
  for (const [a, b] of [[0, 5e-11], [0, 1e-10], [0, 2e-10], [0.25, 0.75]]) {
    const zero = fixture(a!, b!, 'x');
    zero.loads[0].data.moments.x = [0, -0, 0];
    zero.loads[0].data.qZI = zero.loads[0].data.qZJ = -0.001 / (b! - a!);
    const absent = structuredClone(zero);
    delete absent.loads[0].data.moments;
    const expected = solve(absent), actual = solve(zero);
    expect(actual).toEqual(expected);
    const ef = actual.elementForces[0]!;
    expect(ef.memberMoments ?? []).toEqual([]);
    expect(evaluateDiagramAt(ef, 'shearZ', 0)).toBeCloseTo(0.001, 10);
    expect(evaluateDiagramAt(ef, 'momentY', 0)).toBeCloseTo(-0.001 * (a! + b!) / 2, 10);
    for (const x of [0, a!, a! + (b!-a!)/4, (a!+b!)/2, b!, 1]) {
      const u = Math.max(0,Math.min(x-a!,b!-a!));
      expect(evaluateDiagramAt(ef,'shearZ',x)).toBeCloseTo(0.001*(1-u/(b!-a!)),10);
      expect(evaluateDiagramAt(ef,'momentY',x)).toBeCloseTo(-0.001*(a!+b!)/2+0.001*x-0.001/(b!-a!)*(u*(x-a!)-u*u/2),10);
      expect(evaluateDiagramAt(ef,'torsion',x)).toBeCloseTo(0,10);
    }
    const deflection = -0.001*((b!**3-a!**3)-(b!**4-a!**4)/4)/(6*1000*(b!-a!));
    expect(actual.displacements.find(d=>d.nodeId===2)!.uz).toBeCloseTo(deflection,10);
  }
});

for (const [entry, solve] of solves.entries()) it.skip(`known wrong result: #2219 round16 zero-resultant quadratic torque entry=${entry}`, async () => {
  const { compute_diagrams_3d } = await import('../../wasm/dedaliano_engine.js');
  const s = fixture(0, 1, 'x');
  s.supports[2] = { nodeId: 2, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  s.loads[0].data.moments.x = [1, -0.5, 1];
  const result = solve(s), ef = result.elementForces[0]!;
  expect(Math.abs(ef.mxStart)).toBeLessThan(1e-10);
  expect(Math.abs(ef.mxEnd)).toBeLessThan(1e-10);
  expect(ef.memberMoments).toHaveLength(1);
  for (const x of [0, (3 - Math.sqrt(3)) / 6, 0.25, 0.5, 0.75, (3 + Math.sqrt(3)) / 6, 1]) {
    expect(Math.abs(evaluateDiagramAt(ef, 'torsion', x) - (x - 3*x*x + 2*x*x*x))).toBeLessThan(1e-10);
  }
  const d = JSON.parse(compute_diagrams_3d(JSON.stringify(result))).torsion[0];
  expect(Math.abs(d.maxValue - Math.sqrt(3)/18)).toBeLessThan(1e-10);
  expect(Math.abs(d.minValue + Math.sqrt(3)/18)).toBeLessThan(1e-10);
});
