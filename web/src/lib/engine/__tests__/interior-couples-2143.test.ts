import { describe, expect, it } from 'vitest';
import { computeDeformedShape, computeDisplacementAt } from '../diagrams';
import { computeDeformedShape as engineShape, solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { memberLocalCurve } from '../member-deflection';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';

type Dist = { qI: number; qJ: number; a: number; b: number };
type Point = { a: number; p: number; my?: number };
const L = 5, EI = 20_000;
const knownWrong = it.skipIf(!process.env.RUN_KNOWN_WRONG_2143);

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
  knownWrong('known wrong result: #2143 fixed-fixed witness at x=1', () => {
    const points = [{ a: 2, p: 0, my: 6 }];
    close(oracle(points, [], [false, false])(1), -3.6e-6);
    check(points, [], [false, false]);
  });
  for (const a of [0.000005, 1, 2.5, 4, 4.999995]) for (const sign of [-1, 1]) {
    for (const hinges of [[false, false], [true, false], [false, true], [true, true]] as [boolean, boolean][]) {
      for (const mixed of [false, true]) {
        knownWrong(`known wrong result: #2143 a=${a} sign=${sign} hinges=${hinges} mixed=${mixed}`, () => {
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
  knownWrong(`known wrong result: #2143 real 2D ${nonlinear ? 'PDelta' : 'linear'} result`, () => {
    const m = model(2, 2, false) as unknown as SolverInput;
    const result = nonlinear ? solvePDelta(m, 20, 1e-10).results : solve(m);
    const ef = result.elementForces.find((f: { elementId: number }) => f.elementId === 1)!;
    expect(ef.pointLoads[0]!.my).toBe(6);
    const expected = oracle([{ a: 2, p: 0, my: 6 }], [], [false, false]);
    for (let k = 0; k <= 20; k++) {
      close(computeDisplacementAt(k / 20, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, false, false, EI, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads).uz, expected(k * L / 20));
    }
  });
  for (const plane of ['Y', 'Z'] as const) for (const a of [1, 2, 4]) {
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
