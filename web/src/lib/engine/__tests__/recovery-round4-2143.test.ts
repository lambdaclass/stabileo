import { beforeAll, expect, it } from 'vitest';
import { computeDeformedShape, computeDisplacementAt } from '../diagrams';
import { initSolver, recoverMember, solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { memberLocalCurve } from '../member-deflection';
import type { AnalysisResults, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(b), 1e-12));
const hover = computeDisplacementAt;
const shape = computeDeformedShape;

for (const gas of [undefined, 20_000]) for (const memberLoad of [false, true]) {
  it(`#2143 planar Timoshenko adapters gas=${gas} memberLoad=${memberLoad}`, () => {
    const L = 5, EI = 20_000, P = 1;
    const v = (x: number) => P * x * x * (3 * L - x) / (6 * EI) + (gas ? P * x / gas : 0);
    const r = (x: number) => P * x * (2 * L - x) / (2 * EI);
    const points = memberLoad ? [{ a: L, p: P }] : [];
    const mid = hover(0.5, 0, 0, L, 0, 0, 0, 0, 0, v(L), r(L), L, false, false, EI, 0, 0, points, [], gas);
    close(mid.ry, r(L / 2));
    close(mid.uz, v(L / 2));
    const drawn = shape(0, 0, L, 0, 0, 0, 0, 0, v(L), r(L), 1, L, false, false, EI, 0, 0, points, [], gas);
    for (let k = 0; k <= 20; k++) {
      const x = L * k / 20;
      const d = hover(k / 20, 0, 0, L, 0, 0, 0, 0, 0, v(L), r(L), L, false, false, EI, 0, 0, points, [], gas);
      close(d.uz, v(x)); close(d.ry, r(x)); close(drawn[k]!.y, v(x));
    }
  });
}

function model(dimension: 2 | 3, EI: number, plane: 'Y' | 'Z', gas?: number) {
  const E = 200_000_000, L = 5, q = -EI * 1e-4;
  return {
    nodes: dimension === 2 ? new Map([[0, { id: 0, x: 0, z: 0 }], [1, { id: 1, x: L, z: 0 }]]) : new Map([[0, { id: 0, x: 0, y: 0, z: 0 }], [1, { id: 1, x: L, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: E / 1000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: EI / E, iz: EI / E, j: 0.0001, ...(gas ? { asY: gas * 2.6 / E, asZ: gas * 2.6 / E } : {}) }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1 }]]),
    supports: new Map([[0, dimension === 2 ? { id: 0, nodeId: 0, type: 'fixed' } : { nodeId: 0, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'distributed', data: dimension === 2 ? { elementId: 1, qI: q, qJ: q } : { elementId: 1, qYI: plane === 'Y' ? q : 0, qYJ: plane === 'Y' ? q : 0, qZI: plane === 'Z' ? q : 0, qZJ: plane === 'Z' ? q : 0 } }],
  };
}

for (const nonlinear of [false, true]) {
  it(`#2143 planar solved shear curve nonlinear=${nonlinear}`, () => {
    const L = 5, EI = 20_000, gas = 20_000, q = -EI * 1e-4;
    const input = model(2, EI, 'Y', gas) as unknown as SolverInput;
    const result: AnalysisResults = nonlinear ? solvePDelta(input, 20, 1e-10).results : solve(input);
    const [a, b] = [result.displacements.find(d => d.nodeId === 0)!, result.displacements.find(d => d.nodeId === 1)!];
    const ef = result.elementForces[0]!;
    for (let k = 1; k < 20; k++) {
      const x = L * k / 20;
      const d = hover(k / 20, 0, 0, L, 0, a.ux, a.uz, a.ry, b.ux, b.uz, b.ry, L, false, false, EI, q, q, [], ef.distributedLoads, gas);
      close(d.uz, q * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EI) + q * x * (2 * L - x) / (2 * gas));
      close(d.ry, q * x * (3 * L * L - 3 * L * x + x * x) / (6 * EI));
    }
  });
  for (const plane of ['Y', 'Z'] as const) for (const EI of [5e-7, 1e-6, 1.000001e-6]) {
    it(`#2143 spatial positive EI=${EI} plane=${plane} nonlinear=${nonlinear}`, () => {
      const input = model(3, EI, plane) as unknown as SolverInput3D;
      const result: AnalysisResults3D = nonlinear ? solvePDelta3D(input, 20, 1e-10).results : solve3D(input);
      const a = result.displacements.find(d => d.nodeId === 0)!, b = result.displacements.find(d => d.nodeId === 1)!;
      const c = memberLocalCurve({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, a, b, result.elementForces[0], { EIy: EI, EIz: EI })!;
      const values = plane === 'Y' ? c.v : c.w, q = -EI * 1e-4;
      c.xi.forEach((t, k) => { const x = t * 5; close(values[k]!, q * x * x * (150 - 20 * x + x * x) / (24 * EI)); });
    });
  }
}

for (const ei of [undefined, -1e-7, 0, NaN, Infinity]) for (const plane of ['Y', 'Z'] as const) {
  it(`spatial loaded recovery refuses EI=${ei} plane=${plane}`, () => {
    const d = { nodeId: 0, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
    const ef = { length: 5, [plane === 'Y' ? 'pointLoadsY' : 'pointLoadsZ']: [{ a: 2, p: 1 }] };
    expect(() => memberLocalCurve({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, d, d, ef as never, ei === undefined ? undefined : { EIy: ei, EIz: ei })).toThrow();
  });
}

for (const ei of [5e-7, 1e-6, 1.000001e-6]) {
  it(`planar cutoff remains EI=${ei}`, () => {
    const run = () => recoverMember({ length: 5, ei, vI: 0, rI: 0, vJ: 0, rJ: 0, hingeStart: false, hingeEnd: false, points: [{ a: 2, p: ei }], dist: [], positions: [0.5] });
    if (ei <= 1e-6) expect(run).toThrow(); else expect(Number.isFinite(run()[0]!.v)).toBe(true);
  });
}

it('spatial recovery accepts a small positive EI directly and through a variable-member piece', () => {
  const EI = 1e-12, q = -EI * 1e-4;
  const d = { nodeId: 0, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
  const ei = { EIy: EI, EIz: EI };
  const forces = { length: 5, distributedLoadsY: [{ qI: q, qJ: q, a: 0, b: 5 }] };
  const start = { x: 0, y: 0, z: 0 }, end = { x: 5, y: 0, z: 0 };
  const direct = memberLocalCurve(start, end, d, d, forces as never, ei)!;
  const pieces = { ...forces, pieces: [{ x0: 0, x1: 5, dI: d, dJ: d, ei, forces }] };
  const piecewise = memberLocalCurve(start, end, d, d, pieces as never, ei)!;
  const expected = q * 5 ** 4 / (384 * EI);
  close(direct.v[10]!, expected); close(piecewise.v[10]!, expected);
  expect(piecewise).toEqual(direct);
});

for (const q of [-1.000001e-10, -1e-10, -9.99999e-11, 0]) {
  it(`legacy scalar loads reach the same curve without dropping small loads q=${q}`, () => {
    const EI = 20_000, L = 5;
    const hoverValue = hover(0.5, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, false, false, EI, q, q).uz;
    const drawn = shape(0, 0, L, 0, 0, 0, 0, 0, 0, 0, 1, L, false, false, EI, q, q);
    const expected = q * L ** 4 / (384 * EI);
    close(hoverValue, expected); close(drawn[10]!.y, expected);
  });
}

for (const q of [-1e-10, -9.99999e-11]) {
  it(`small scalar loads still require bending stiffness q=${q}`, () => {
    expect(() => hover(0.5, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, false, false, undefined, q, q)).toThrow();
    expect(() => shape(0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 1, 5, false, false, undefined, q, q)).toThrow();
  });
}
