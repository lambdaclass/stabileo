import { beforeAll, expect, it, vi } from 'vitest';
import { splitSpanLoad } from '../member-span-loads';
import type { SolverLoad } from '../types';
import { initSolver } from '../wasm-solver';
import * as solver from '../wasm-solver';
import { buildSolverInput2D } from '../solver-service';
import { planeModel } from '../influence/__tests__/fixtures';
import { targetDisplacement } from '../influence/maxwell';
import { plasticCollapse2D } from '../plastic-collapse';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

const next = (x: number, direction: bigint) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + direction);
  return view.getFloat64(0);
};

function integrals(loads: SolverLoad[], length: number, about: number): [number, number] {
  let force = 0, moment = 0;
  for (const l of loads) {
    if (l.type === 'pointOnElement') {
      const p = l.data.p + (l.data.px ?? 0);
      force += p;
      moment += p * (l.data.a - about) + (l.data.my ?? 0);
    } else if (l.type === 'distributed' || l.type === 'axialDistributed') {
      const a = l.data.a ?? 0, b = l.data.b ?? length, w = b - a;
      const left = l.data.qI * w / 2, right = l.data.qJ * w / 2;
      force += left + right;
      moment += left * ((a - about) + w / 3) + right * ((a - about) + 2 * w / 3);
    }
  }
  return [force, moment];
}

for (const type of ['distributed', 'axialDistributed'] as const) {
  it.skip(`known wrong result: #2222 ${type} preserves force and first moment when remapped endpoints collapse`, () => {
    const length = 2 - 2 ** -51, a = 1.5 - 2 ** -52, b = 1.5, width = b - a;
    for (const [qI, qJ] of [[2 ** 52, 2 ** 52], [0, 2 ** 53], [-6 / width / width, 6 / width / width]]) {
      const load = { type, data: { elementId: 1, a, b, qI, qJ } };
      const moved = splitSpanLoad(load, 2, [{ id: 4, start: 0, end: 2, length }]);
      const points = moved.filter(l => l.type === 'pointOnElement');
      expect(points.length).toBeGreaterThan(0);
      for (const l of points) {
        expect(l.data.elementId).toBe(4);
        expect(l.data.a).toBeGreaterThan(1);
        expect(l.data.a).toBeLessThan(2);
      }
      const at = points[0].data.a;
      const expected = integrals([load], 2, at), actual = integrals(moved, length, at);
      expect(actual[0]).toBeCloseTo(expected[0], 12);
      expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(1e-12 * Math.abs(expected[1]));
    }
  });

  it.skip(`known wrong result: #2222 ${type} remapping preserves integrals on both sides of collapse`, () => {
    for (const childLength of [next(2, -1n), 2, next(2, 1n)]) {
      for (const [a, b] of [[1.5 - 2 ** -52, 1.5], [1.5 - 2 ** -51, 1.5], [0, 2], [0.25, 1.75], [0, 2 ** -52], [2 - 2 ** -52, 2]]) {
        for (const ratio of [0, 1, -1]) {
          const width = b - a, qI = ratio === -1 ? -6 / width / width : 1 / width, qJ = ratio === -1 ? -qI : qI * ratio;
          const load = { type, data: { elementId: 1, a, b, qI, qJ } };
          const moved = splitSpanLoad(load, 2, [{ id: 4, start: 0, end: 2, length: childLength }]);
          const actual = integrals(moved, childLength, a), expected = integrals([load], 2, a);
          expect(actual[0]).toBeCloseTo(expected[0], 12);
          expect(actual[1]).toBeCloseTo(expected[1], 12);
          for (const l of moved) if (l.type === 'pointOnElement') {
            expect(l.data.a).toBeGreaterThan(0);
            expect(l.data.a).toBeLessThan(childLength);
          }
        }
      }
    }
    const load = { type, data: { elementId: 1, a: 1, b: 1, qI: 7, qJ: 7 } };
    expect(splitSpanLoad(load, 2, [{ id: 4, start: 0, end: 2, length: 2 }])).toEqual([]);
    const ordinary = { type, data: { elementId: 1, a: 0.25, b: 1.75, qI: 2, qJ: 4 } };
    expect(splitSpanLoad(ordinary, 2, [{ id: 4, start: 0, end: 2, length: 2 }])).toEqual([{ ...ordinary, data: { ...ordinary.data, elementId: 4 } }]);
  });
}

for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
  it.skip(`known wrong result: #2222 remapped collapsed load reaches ${mode} with its force and couple`, () => {
    const input: any = structuredClone(model);
    const length = 2 - 2 ** -51;
    input.nodes['2'].x = length;
    input.nodes['3'].x = 4;
    const a = 1.5 - 2 ** -52, b = 1.5;
    input.loads = splitSpanLoad({ type: 'distributed', data: { elementId: 1, a, b, qI: 2 ** 52, qJ: 2 ** 52 } }, 2, [{ id: 1, start: 0, end: 2, length }]);
    const run = (i: any) => mode === 'linear' ? wasm.solve_2d(i)
      : mode === 'session' ? (() => { const s = new wasm.LoadSession2D({ ...i, loads: [] }); try { return s.solve(i.loads); } finally { s.free(); } })()
      : mode === 'fiber' ? JSON.parse(wasm.solve_fiber_nonlinear_2d(JSON.stringify({ solver: i, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results
      : mode === 'pdelta' ? JSON.parse(wasm.solve_pdelta_2d(JSON.stringify(i), 20, 1e-9)).linearResults
      : JSON.parse(wasm.solve_corotational_2d(JSON.stringify(i), 40, 1e-9, 1)).results;
    const result = run(input);
    const ref = run({ ...input, loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 1.5, p: 1, my: -(b - a) / 2 } }] });
    if (mode !== 'corotational') expect(result.equilibrium.appliedForceSum[1]).toBe(1);
    for (const r of result.reactions) {
      const expected = ref.reactions.find((v: any) => v.nodeId === r.nodeId);
      expect(r.rz).toBeCloseTo(expected.rz, 12);
      expect(r.my).toBeCloseTo(expected.my, 12);
    }
    expect(result.displacements[1].uz).toBeCloseTo(ref.displacements[1].uz, 12);
  });
}

for (const dim of [2, 3]) for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
  it.skip(`known wrong result: #2222 ${dim}D ${mode} accepts balanced cancelling nodal forces`, () => {
    const base: any = structuredClone(model);
    base.loads = [];
    if (dim === 3) {
      for (const n of Object.values(base.nodes) as any[]) n.y = 0;
      for (const s of Object.values(base.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
      for (const s of Object.values(base.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    }
    for (const axis of dim === 2 ? ['x', 'z'] : ['x', 'y', 'z']) for (const cancel of [true, false]) {
      const loads = (cancel ? [[1, 1e16], [3, 1], [1, -1e16]] : [[3, 1]]).map(([nodeId, force]) => ({ type: 'nodal', data: dim === 2 ? { nodeId, fx: 0, fz: 0, my: 0, ['f' + axis]: force } : { nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, ['f' + axis]: force } }));
      const input = { ...base, loads };
      const session = mode === 'session' ? new wasm[`LoadSession${dim}D`](base) : undefined;
      try {
        const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
          : mode === 'session' ? session.solve(loads)
          : mode === 'fiber' ? JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results
          : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).linearResults
          : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-9, 1)).results;
        const k = dim === 2 ? axis === 'x' ? 0 : 1 : ['x', 'y', 'z'].indexOf(axis);
        if (mode !== 'corotational') {
          expect(result.equilibrium.appliedForceSum[k]).toBe(1);
          expect(result.equilibrium.equilibriumOk).toBe(true);
        }
        expect(result.reactions.find((r: any) => r.nodeId === 3)[dim === 2 ? axis === 'x' ? 'rx' : 'rz' : 'f' + axis]).toBe(-1);
      } finally { session?.free(); }
    }
  });
}


it.skip('known wrong result: #2222 Maxwell section splitting preserves the narrow interior load', () => {
  const input = buildSolverInput2D(planeModel([[1, 2.1, 0], [2, 6.1, 0]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
  const length = 6.1 - 2.1, t = 2 / length, a = 1.5 - 2 ** -52, b = 1.5;
  const target = { kind: 'section' as const, elementId: 1, t };
  const spy = vi.spyOn(solver, 'solve');
  try {
    const actual = targetDisplacement(input, 'uz', target, [{ type: 'distributed', data: { elementId: 1, a, b, qI: 2 ** 52, qJ: 2 ** 52 } }]);
    const moved = spy.mock.calls.at(-1)![0];
    expect([...moved.elements.values()].some(e => {
      const i = moved.nodes.get(e.nodeI)!, j = moved.nodes.get(e.nodeJ)!;
      return j.x - i.x === 2 - 2 ** -51;
    })).toBe(true);
    const reference = targetDisplacement(input, 'uz', target, [{ type: 'pointOnElement', data: { elementId: 1, a: 1.5, p: 1, my: -(b - a) / 2 } }]);
    expect(actual).toBeCloseTo(reference, 12);
    expect(Math.abs(actual)).toBeGreaterThan(0);
  } finally { spy.mockRestore(); }
});

it.skip('known wrong result: #2222 plastic hinge splitting preserves the narrow interior load', () => {
  const input = buildSolverInput2D(planeModel([[1, 2.1, 0], [2, 6.1, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']]), false)!;
  const a = 1.5 - 2 ** -52, b = 1.5;
  input.loads = [{ type: 'distributed', data: { elementId: 1, a, b, qI: 2 ** 52, qJ: 2 ** 52 } }, { type: 'pointOnElement', data: { elementId: 1, a: 2, p: 1 } }];
  const spy = vi.spyOn(solver, 'analyzeKinematics');
  try {
    const result = plasticCollapse2D(input, { mp: () => 1, np: () => Infinity, samples: 2 });
    expect(result.isMechanism).toBe(true);
    const split = spy.mock.calls.map(c => c[0]).find(i => i.elements.size === 2)!;
    expect(split).toBeDefined();
    const first = [...split.elements.values()].find(e => e.nodeI === 1)!;
    const length = split.nodes.get(first.nodeJ)!.x - split.nodes.get(first.nodeI)!.x;
    const narrow = split.loads.filter(l => (l.type === 'distributed' || l.type === 'pointOnElement') && l.data.elementId === first.id && (l.type === 'distributed' || l.data.a < 1.75));
    expect(integrals(narrow, length, 0)[0]).toBe(1);
    expect(integrals(narrow, length, 0)[1]).toBeCloseTo(1.5, 12);
  } finally { spy.mockRestore(); }
});


it.skip('known wrong result: #2222 collapsed member loads refuse an unrepresentable interior station', () => {
  const load = { type: 'distributed' as const, data: { elementId: 1, a: 1.5 - 2 ** -52, b: 1.5, qI: 2 ** 52, qJ: 2 ** 52 } };
  expect(() => splitSpanLoad(load, 2, [{ id: 1, start: 0, end: 2, length: Number.MIN_VALUE }])).toThrow('no representable interior load station');
  const nearEnd = { ...load, data: { ...load.data, a: 1.75 - 2 ** -52, b: 1.75 } };
  const moved = splitSpanLoad(nearEnd, 2, [{ id: 1, start: 0, end: 2, length: 2 * Number.MIN_VALUE }]);
  expect(moved).toEqual([{ type: 'pointOnElement', data: { elementId: 1, a: Number.MIN_VALUE, p: 1, my: 1.75 } }]);
  for (const length of [0, -1, Infinity, NaN]) expect(() => splitSpanLoad(load, 2, [{ id: 1, start: 0, end: 2, length }])).toThrow('Invalid generated member load piece');
});


it.skip('known wrong result: #2222 subnormal positive widths retain a representable resultant', () => {
  for (const type of ['distributed', 'axialDistributed'] as const) {
    const load = { type, data: { elementId: 1, a: 0, b: Number.MIN_VALUE, qI: 2 ** 1000, qJ: 2 ** 1000 } };
    const moved = splitSpanLoad(load, 2, [{ id: 1, start: 0, end: 2, length: 1 }]);
    expect(moved).toHaveLength(1);
    expect(moved[0].type).toBe('pointOnElement');
    if (moved[0].type !== 'pointOnElement') throw new Error('Expected a concentrated load');
    expect(moved[0].data.a).toBe(Number.MIN_VALUE);
    expect(type === 'distributed' ? moved[0].data.p : moved[0].data.px).toBe((2 ** 1000) * Number.MIN_VALUE);
  }
});


it.skip('known wrong result: #2222 equivalent corrections refuse non-finite loads and unrepresentable axial pairs', () => {
  const axial = { type: 'axialDistributed' as const, data: { elementId: 1, a: 1, b: 2, qI: 4 * Number.MIN_VALUE, qJ: 4 * Number.MIN_VALUE } };
  expect(() => splitSpanLoad(axial, 2, [{ id: 1, start: 0, end: 2, length: 2 * Number.MIN_VALUE }])).toThrow('no representable axial load pair');
  const pair = splitSpanLoad(axial, 2, [{ id: 1, start: 0, end: 2, length: 3 * Number.MIN_VALUE }]).filter(l => l.type === 'pointOnElement');
  expect(pair).toHaveLength(3);
  for (const l of pair) {
    expect(l.data.a).toBeGreaterThan(0);
    expect(l.data.a).toBeLessThan(3 * Number.MIN_VALUE);
    expect(Number.isFinite(l.data.px)).toBe(true);
  }
  const infinitePair = { ...axial, data: { ...axial.data, qI: 1, qJ: 1 } };
  expect(() => splitSpanLoad(infinitePair, 2, [{ id: 1, start: 0, end: 2, length: 3 * Number.MIN_VALUE }])).toThrow('Non-finite generated axial load pair');
  const transverse = { type: 'distributed' as const, data: { elementId: 1, a: 0, b: 2, qI: Number.MAX_VALUE, qJ: Number.MAX_VALUE } };
  expect(() => splitSpanLoad(transverse, 2, [{ id: 1, start: 0, end: 2, length: 2 * Number.MIN_VALUE }])).toThrow('Non-finite generated member load resultant');
  const finite = { ...transverse, data: { ...transverse.data, qI: Number.MAX_VALUE / 4, qJ: Number.MAX_VALUE / 4 } };
  const moved = splitSpanLoad(finite, 2, [{ id: 1, start: 0, end: 2, length: 2 * Number.MIN_VALUE }]);
  expect(moved.some(l => l.type === 'pointOnElement' && l.data.p === Number.MAX_VALUE / 2)).toBe(true);
});
