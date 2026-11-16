import { describe, expect, it } from 'vitest';
import { computeDeformedShape, computeDisplacementAt } from '../diagrams';
import { computeDeformedShape as engineShape, solve, solvePDelta, solve3D, solvePDelta3D, recoverMember } from '../wasm-solver';
import { memberLocalCurve } from '../member-deflection';
import baseline from '../../../../../docs/results-changes/2143-no-couple-shapes.json';
import { solverBendingForces2D, flipElementForces2D, transverseSign } from '../transverse-sign-2d';
import type { SolverInput, ElementForces } from '../types';
import type { SolverInput3D } from '../types-3d';

type Dist = { qI: number; qJ: number; a: number; b: number };
type Point = { a: number; p: number; my?: number };
const L = 5, EI = 20_000;

function oracle(points: Point[], dist: Dist[], hinges: [boolean, boolean], ends = [0, 0, 0, 0]) {
  const factorial = [1, 1, 2, 6, 24, 120];
  const terms = (x: number, derivative: number) => {
    const ramp = (a: number, power: number) => x <= a ? 0 : (x - a) ** (power - derivative) / factorial[power - derivative]!;
    let y = 0;
    for (const p of points) {
      y += p.p * ramp(p.a, 3);
      if (derivative <= 2) y -= (p.my ?? 0) * ramp(p.a, 2);
    }
    for (const d of dist) {
      const slope = (d.qJ - d.qI) / (d.b - d.a);
      y += d.qI * ramp(d.a, 4) + slope * ramp(d.a, 5) - d.qJ * ramp(d.b, 4) - slope * ramp(d.b, 5);
    }
    return y / EI;
  };
  const row = (x: number, d: number) => [0, 1, 2, 3].map(k => k < d ? 0 : x ** (k - d) * factorial[k]! / factorial[k - d]!);
  const conditions = [[0, 0, ends[0]!], [0, hinges[0] ? 2 : 1, hinges[0] ? 0 : ends[1]!],
    [L, 0, ends[2]!], [L, hinges[1] ? 2 : 1, hinges[1] ? 0 : ends[3]!]];
  const a = conditions.map(([x, d, y]) => [...row(x!, d!), y! - terms(x!, d!)]);
  for (let k = 0; k < 4; k++) {
    const pivot = k + a.slice(k).map(r => Math.abs(r[k]!)).indexOf(Math.max(...a.slice(k).map(r => Math.abs(r[k]!))));
    [a[k], a[pivot]] = [a[pivot]!, a[k]!];
    const divisor = a[k]![k]!;
    for (let j = k; j < 5; j++) a[k]![j] = a[k]![j]! / divisor;
    for (let i = 0; i < 4; i++) if (i !== k) {
      const factor = a[i]![k]!;
      for (let j = k; j < 5; j++) a[i]![j] = a[i]![j]! - factor * a[k]![j]!;
    }
  }
  return (x: number, d = 0) => terms(x, d) + row(x, d).reduce((s, v, k) => s + v * a[k]![4]!, 0);
}

const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2e-13);
const dist: Dist[] = [{ qI: -3, qJ: 2, a: 0.7, b: 4.1 }];

function input(points: Point[], distributed: Dist[], hinges: [boolean, boolean]) {
  return {
    nodeIx: 0, nodeIy: 0, nodeJx: L, nodeJy: 0, uIx: 0, uIy: 0, rIz: 0, uJx: 0, uJy: 0, rJz: 0,
    length: L, scale: 1, hingeStart: hinges[0], hingeEnd: hinges[1], ei: EI,
    loadPoints: points.map(p => [p.a, p.p]), loadCouples: points.filter(p => p.my).map(p => [p.a, p.my]),
    distLoads: distributed.map(d => [d.qI, d.qJ, d.a, d.b]),
  };
}

function check(points: Point[], distributed: Dist[], hinges: [boolean, boolean]) {
  const expected = oracle(points, distributed, hinges);
  const stations = [...Array.from({ length: 21 }, (_, k) => k / 20), ...points.flatMap(p => [p.a / L - 1e-8, p.a / L, p.a / L + 1e-8])].filter(t => t >= 0 && t <= 1);
  const recovered = recoverMember({ length: L, ei: EI, vI: 0, rI: 0, vJ: 0, rJ: 0,
    hingeStart: hinges[0], hingeEnd: hinges[1], points, dist: distributed, positions: stations });
  recovered.forEach((sample, k) => { close(sample.v, expected(stations[k]! * L)); close(sample.rotation, expected(stations[k]! * L, 1)); });
  const shape = computeDeformedShape(0, 0, L, 0, 0, 0, 0, 0, 0, 0, 1, L, ...hinges, EI, 0, 0, points, distributed);
  const wasm = engineShape(input(points, distributed, hinges)) as { x: number; y: number }[];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const hover = computeDisplacementAt(t, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, ...hinges, EI, 0, 0, points, distributed);
    close(hover.uz, expected(t * L));
    close(shape[i]!.y, expected(t * L));
    close(wasm[i]!.y, expected(t * L));
  }
}

describe('interior couples #2143', () => {
  it('#2143 fixed-fixed witness at x=1', () => {
    const points = [{ a: 2, p: 0, my: 6 }];
    close(oracle(points, [], [false, false])(1), -3.6e-6);
    check(points, [], [false, false]);
  });
  for (const a of [0.000005, 1, 2.5, 4, 4.999995]) for (const sign of [-1, 1]) {
    for (const hinges of [[false, false], [true, false], [false, true], [true, true]] as [boolean, boolean][]) {
      for (const mixed of [false, true]) {
        it(`#2143 a=${a} sign=${sign} hinges=${hinges} mixed=${mixed}`, () => {
          check([{ a, p: mixed ? -2 : 0, my: sign * 6 }, ...(mixed ? [{ a: 3.2, p: 4 }] : [])], mixed ? dist : [], hinges);
        });
      }
    }
  }
  for (const a of [0, L]) it(`fixed endpoint couple has no interior particular solution a=${a}`, () => check([{ a, p: 0, my: 6 }], [], [false, false]));
  for (const hinges of [[false, false], [true, false], [false, true], [true, true]] as [boolean, boolean][]) {
    it(`without couples retains the closed-form answer hinges=${hinges}`, () => check([{ a: 2.1, p: -4 }], [], hinges));
  }
});

function model(dimension: 2 | 3, a: number, split: boolean, plane: 'Y' | 'Z' = 'Y') {
  const nodes = new Map([[0, { id: 0, x: 0, y: 0, z: 0 }], [1, { id: 1, x: L, y: 0, z: 0 }]]);
  const elem = (id: number, nodeI: number, nodeJ: number) => ({ id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1 });
  const elements = new Map([[1, elem(1, 0, 1)]]);
  const support = (id: number) => dimension === 2 ? { id, nodeId: id, type: 'fixed' } : { nodeId: id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  const supports = new Map([[0, support(0)], [1, support(1)]]);
  if (split) {
    nodes.set(2, { id: 2, x: a, y: 0, z: 0 });
    elements.set(1, elem(1, 0, 2));
    elements.set(2, elem(2, 2, 1));
  } else {
    nodes.set(2, { id: 2, x: 0, y: 0, z: 1 });
    elements.set(2, elem(2, 0, 2));
  }
  const loads = split ? [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: plane === 'Z' ? -6 : 0, mz: plane === 'Y' ? 6 : 0 } }]
    : [{ type: 'pointOnElement', data: { elementId: 1, a, p: 0, my: 6 } }];
  return { nodes: dimension === 2 ? new Map([...nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z }])) : nodes, elements, materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 0.0001, iz: 0.0001, j: 0.0001 }]]), supports, loads };
}

for (const nonlinear of [false, true]) {
  it(`#2143 real 2D ${nonlinear ? 'PDelta' : 'linear'} result`, () => {
    const m = model(2, 2, false) as unknown as SolverInput;
    const result = nonlinear ? solvePDelta(m, 20, 1e-10).results : solve(m);
    const ef = result.elementForces.find((f: { elementId: number }) => f.elementId === 1)!;
    expect(ef.pointLoads[0]!.my).toBe(6);
    const expected = oracle([{ a: 2, p: 0, my: 6 }], [], [false, false]);
    for (let k = 0; k <= 20; k++) {
      close(computeDisplacementAt(k / 20, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, false, false, EI, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads).uz, expected(k * L / 20));
    }
  });
  for (const plane of ['Y', 'Z'] as const) for (const a of [0.05, 1, 2, 4, 4.95]) {
    it(`3D split nodal couple ${plane} at ${a}, nonlinear=${nonlinear}`, () => {
      const m = model(3, a, true, plane) as unknown as SolverInput3D;
      const result = nonlinear ? solvePDelta3D(m, 20, 1e-10).results : solve3D(m);
      const expected = oracle([{ a, p: 0, my: 6 }], [], [false, false]);
      for (const ef of result.elementForces) {
        const e = m.elements.get(ef.elementId)!;
        const ni = m.nodes.get(e.nodeI)!, nj = m.nodes.get(e.nodeJ)!;
        const di = result.displacements.find((d: { nodeId: number }) => d.nodeId === e.nodeI)!;
        const dj = result.displacements.find((d: { nodeId: number }) => d.nodeId === e.nodeJ)!;
        const curve = memberLocalCurve(ni, nj, di, dj, ef, { EIy: EI, EIz: EI })!;
        curve.xi.forEach((xi, k) => {
          close((plane === 'Y' ? curve.v : curve.w)[k]!, expected(ni.x + xi * ef.length));
          close((plane === 'Y' ? curve.w : curve.v)[k]!, 0);
        });
      }
    });
  }
}

it('no-couple engine shapes remain exactly equal to the parent build at every station', () => {
  expect(baseline.parent).toBe('44966b6e75f72ce268ec87798d5cd880a6dba144');
  for (const c of baseline.cases) expect(engineShape(c.input)).toEqual(c.expected);
});

for (const angle of [Math.PI / 5, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  it(`couple displacement transforms back to world axes at angle ${angle}`, () => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const points = [{ a: 2, p: -3, my: 6 }];
    const expected = oracle(points, dist, [false, false]);
    const shape = computeDeformedShape(0, 0, L * c, L * s, 0, 0, 0, 0, 0, 0, 1, L, false, false, EI, 0, 0, points, dist);
    for (let k = 0; k <= 20; k++) {
      const x = L * k / 20, v = expected(x);
      const sample = computeDisplacementAt(k / 20, 0, 0, L * c, L * s, 0, 0, 0, 0, 0, 0, L, false, false, EI, 0, 0, points, dist);
      close(sample.ux, -s * v); close(sample.uz, c * v); close(sample.ry, expected(x, 1));
      close(shape[k]!.x, x * c - s * v); close(shape[k]!.y, x * s + c * v);
    }
  });
}

for (const ei of [1e-6 * (1 - 1e-6), 1e-6, 1e-6 * (1 + 1e-6)]) {
  it(`load-to-curvature boundary is preserved at EI=${ei}`, () => {
    const couple = 6 * ei / EI;
    const input = { length: L, ei, vI: 0, rI: 0, vJ: 0, rJ: 0, hingeStart: false, hingeEnd: false,
      points: [{ a: 2, p: 0, my: couple }], dist: [], positions: [-1, 0, 0.2, 1, 2] };
    if (ei <= 1e-6) {
      expect(() => recoverMember(input)).toThrow();
      return;
    }
    const out = recoverMember(input);
    const expected = oracle([{ a: 2, p: 0, my: couple }], [], [false, false])(1) * EI / ei;
    expect(Math.abs(out[2]!.v - expected)).toBeLessThanOrEqual(2e-13 * Math.max(1, Math.abs(expected)));
    for (const k of [0, 1, 3, 4]) expect(Math.abs(out[k]!.v)).toBeLessThanOrEqual(2e-13);
  });
}

for (const gas of [undefined, 20_000]) for (const a of [0, 0.000005, 2, 4.999995, L]) {
  it(`cantilever couple, point and uniform loads with gas=${gas} at ${a}`, () => {
    const C = 6, P = -2, q = 3;
    const flex = gas ? 1 / gas : 0;
    const expected = (x: number) => C * (x * x - Math.max(x - a, 0) ** 2) / (2 * EI)
      + P * (x * x * (3 * a - x) + Math.max(x - a, 0) ** 3) / (6 * EI) + flex * P * Math.min(x, a)
      + q * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EI) + flex * q * x * (2 * L - x) / 2;
    const rotation = (x: number) => C * Math.min(x, a) / EI + P * (x * (2 * a - x) + Math.max(x - a, 0) ** 2) / (2 * EI)
      + q * x * (3 * L * L - 3 * L * x + x * x) / (6 * EI);
    const samples = recoverMember({ length: L, ei: EI, gas, vI: 0, rI: 0, vJ: expected(L), rJ: rotation(L),
      hingeStart: false, hingeEnd: false, points: [{ a, p: P, my: C }], dist: [{ qI: q, qJ: q, a: 0, b: L }],
      positions: Array.from({ length: 21 }, (_, k) => k / 20) });
    samples.forEach((p, k) => { close(p.v, expected(k * L / 20)); close(p.rotation, rotation(k * L / 20)); });
  });
}

for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) {
  it(`drawn load records recover the same couple field for chord ${dx},${dz}`, () => {
    const solver = { elementId: 1, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0, length: L, qI: 0, qJ: 0, pointLoads: [{ a: 2, p: -3, my: 6 }], distributedLoads: dist } as ElementForces;
    const drawn = transverseSign(dx!, dz!) < 0 ? flipElementForces2D(solver) : solver;
    const loads = solverBendingForces2D(drawn, dx!, dz!);
    expect(loads).toEqual(solver);
    const expected = oracle(solver.pointLoads, dist, [false, false]);
    for (let k = 0; k <= 20; k++) {
      const v = expected(k * L / 20), c = dx! / L, s = dz! / L;
      const sample = computeDisplacementAt(k / 20, 0, 0, dx!, dz!, 0, 0, 0, 0, 0, 0, L, false, false, EI,
        loads.qI, loads.qJ, loads.pointLoads, loads.distributedLoads);
      close(sample.ux, -s * v); close(sample.uz, c * v); close(sample.ry, expected(k * L / 20, 1));
    }
  });
}

for (const hinges of [[false, false], [true, false], [false, true], [true, true]] as [boolean, boolean][]) {
  for (const distributed of [dist, [{ qI: -3, qJ: 2, a: 0, b: L }]]) {
    it(`no-couple distributed loads retain the exact beam solution hinges=${hinges} span=${distributed[0]!.a}`, () => {
      check([{ a: 2.1, p: -4 }], distributed, hinges);
    });
  }
}

for (const ei of [undefined, 0, 1e-6]) {
  for (const points of [[{ a: 2, p: 0, my: 6 }], [{ a: 2, p: -4 }]]) {
    it(`loaded recovery refuses missing or insufficient EI=${ei} through hover and shape`, () => {
      expect(() => computeDisplacementAt(0.2, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, false, false, ei, 0, 0, points)).toThrow();
      expect(() => computeDeformedShape(0, 0, L, 0, 0, 0, 0, 0, 0, 0, 1, L, false, false, ei, 0, 0, points)).toThrow();
      const axialOnly = recoverMember({ length: L, ei, vI: 0, rI: 0, vJ: 0, rJ: 0, hingeStart: false, hingeEnd: false,
        points: [{ a: 2, p: 0, px: 6 }], dist: [], positions: [0.2] });
      expect(axialOnly[0]!.v).toBe(0);
    });
  }
}
