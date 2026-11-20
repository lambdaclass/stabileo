import { expect, it } from 'vitest';
import { computeDiagram3D, computeGlobalMax3D, evaluateDiagramAt, type Diagram3DKind } from '../diagrams-3d';
import type { ElementForces3D } from '../types-3d';


function empty(): ElementForces3D {
  return {
    elementId: 1, length: 1, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  };
}

function parabola(a: number, kind: Exclude<Diagram3DKind, 'torsion'>): ElementForces3D {
  const forces = empty();
  const start = 1 - a * a;
  const uniform = (q: number) => [{ a: 0, b: 1, qI: q, qJ: q }];
  const linear = (q: number) => [{ a: 0, b: 1, qI: 2 * a * q, qJ: 2 * (a - 1) * q }];
  switch (kind) {
    case 'momentZ': return { ...forces, mzStart: start, vyStart: -2 * a, distributedLoadsY: uniform(2) };
    case 'momentY': return { ...forces, myStart: start, vzStart: 2 * a, distributedLoadsZ: uniform(-2) };
    case 'shearY': return { ...forces, vyStart: start, distributedLoadsY: linear(1) };
    case 'shearZ': return { ...forces, vzStart: start, distributedLoadsZ: linear(1) };
    case 'axial': return { ...forces, nStart: start, distributedLoadsX: linear(-1) };
  }
}

it('#2273 combined member extrema include the interior governing station', () => {
  for (const kind of ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial'] as const) {
    for (const method of ['abs', 'srss'] as const) {
      const forces = { ...empty(), combined: { method, parts: [parabola(0.21, kind), parabola(0.66, kind)] } };
      const expected = (1 - 0.225 ** 2) * (method === 'abs' ? 2 : Math.sqrt(2));
      const diagram = computeDiagram3D(forces, kind);
      expect(diagram.maxValue).toBeCloseTo(expected, 12);
      expect(diagram.points.some(p => Math.abs(p.t - 0.435) < 1e-10)).toBe(true);
      expect(computeGlobalMax3D([forces], kind)).toBeCloseTo(expected, 12);
      const piece = { ...empty(), length: 10, pieces: [{ x0: 0, x1: 10, sectionId: 1, forces }] };
      expect(computeDiagram3D(piece, kind).maxValue).toBeCloseTo(expected, 12);
    }
  }
});

it('#2273 combination minima include sign changes and one-sided jump limits', () => {
  for (const method of ['abs', 'srss'] as const) {
    const torsion = { ...empty(), mxStart: -0.435, mxEnd: 1 - 0.435 };
    expect(computeDiagram3D({ ...empty(), combined: { method, parts: [torsion] } }, 'torsion').minValue).toBeCloseTo(0, 12);
    const a = 0.435;
    const shear = { ...empty(), distributedLoadsZ: [{ a: 0, b: 1, qI: 2, qJ: 2 }], pointLoadsZ: [{ a, p: -1 }] };
    const combined = { ...empty(), combined: { method, parts: [shear] } };
    expect(computeDiagram3D(combined, 'shearZ').points.filter(point => point.t === a).map(point => point.value)).toEqual([2 * a, Math.abs(2 * a - 1)]);
  }
  const first = { ...empty(), distributedLoadsY: [{ a: 0, b: 1, qI: 0, qJ: -6 }] };
  const second = { ...empty(), mzStart: 1, vyStart: 6, distributedLoadsY: [{ a: 0, b: 1, qI: -24, qJ: 24 }] };
  const expected = 2 ** 0.2 / (1 + 2 * 2 ** 0.2);
  const cubic = computeDiagram3D({ ...empty(), combined: { method: 'srss', parts: [first, second] } }, 'momentZ');
  expect(cubic.minValue).toBeCloseTo(Math.hypot(expected ** 3, (1 - 2 * expected) ** 3), 12);
  expect(cubic.points.some(p => Math.abs(p.t - expected) < 1e-10)).toBe(true);
});

it('a monotone combination peaks at its end', () => {
  const forces = { ...empty(), mxStart: 1, mxEnd: 2 };
  expect(computeDiagram3D({ ...empty(), combined: { method: 'abs', parts: [forces] } }, 'torsion').maxValue).toBe(2);
});

it('#2273 ABS includes the governing station when a constituent uses full-span intensities', () => {
  const parts = [0.21, 0.66].map(a => ({ ...parabola(a, 'momentY'), distributedLoadsZ: [], qZI: -2, qZJ: -2 }));
  const forces = { ...empty(), combined: { method: 'abs' as const, parts } };
  const expected = 2 * (1 - 0.225 ** 2);
  expect(computeDiagram3D(forces, 'momentY').maxAbsValue).toBeCloseTo(expected, 12);
});

it('#2252 SRSS finds the interior peak of the combined spatial response', () => {
  for (const explicit of [false, true]) {
    const parts = [4.2, 5.2].map(c => ({
      ...empty(), length: 10, myStart: 25 - c * c, vzStart: 2 * c, qZI: -2, qZJ: -2,
      distributedLoadsZ: explicit ? [{ a: 0, b: 10, qI: -2, qJ: -2 }] : [],
    }));
    const forces = { ...empty(), length: 10, combined: { method: 'srss' as const, parts } };
    const expected = Math.SQRT2 * (25 - 0.5 ** 2);
    expect.soft(computeDiagram3D(forces, 'momentY').maxAbsValue, `explicit loads: ${explicit}`).toBeCloseTo(expected, 12);
    expect.soft(computeDiagram3D(forces, 'momentY').points.some(p => Math.abs(p.t - 0.47) < 1e-10)).toBe(true);
  }
});

it('#2273 ABS includes an axial peak between consecutive point loads', () => {
  const pulse = { ...empty(), pointLoadsX: [{ a: 0.431, p: -2 }, { a: 0.432, p: 2 }] };
  const baseline = { ...empty(), nStart: 1, nEnd: 1 };
  const forces = { ...empty(), combined: { method: 'abs' as const, parts: [baseline, pulse] } };
  const diagram = computeDiagram3D(forces, 'axial');
  expect(diagram.maxAbsValue).toBe(3);
  expect(diagram.points.filter(p => p.t === 0.431).map(p => p.value)).toEqual([1, 3]);
});

it('marks a conservative bound when a magnitude constituent is itself a magnitude combination', () => {
  const first = parabola(0.21, 'momentY'), second = parabola(0.66, 'momentY');
  const inner = { ...empty(), combined: { method: 'srss' as const, parts: [first, second] } };
  const outer = { ...empty(), combined: { method: 'abs' as const, parts: [inner, first] } };
  const diagram = computeDiagram3D(outer, 'momentY');
  const dense = Array.from({ length: 1001 }, (_, k) => {
    const t = k / 1000;
    const a = 1 - (t - 0.21) ** 2, b = 1 - (t - 0.66) ** 2;
    return Math.hypot(a, b) + a;
  });
  expect(diagram.extrema).toBe('bounded');
  expect(diagram.maxAbsValue).toBeGreaterThanOrEqual(Math.max(...dense));
  expect(diagram.maxAbsValue).toBeCloseTo(1 + (1 - 0.225 ** 2) * Math.SQRT2, 12);
  expect(computeDiagram3D(inner, 'momentY').extrema).toBeUndefined();
});

it('refuses distinct axial cuts that share the same floating-point normalized station', () => {
  const length = 3, a = 1.75;
  const pulse = (b: number) => ({ ...empty(), length, pointLoadsX: [{ a, p: -2 }, { a: b, p: 2 }] });
  const b = a + Number.EPSILON;
  expect(b).toBeGreaterThan(a);
  expect(b / length).toBe(a / length);
  expect(() => computeDiagram3D(pulse(b), 'axial')).toThrow(/extrema/i);
  const separated = pulse(a + 2 * Number.EPSILON);
  expect(computeDiagram3D(separated, 'axial').maxAbsValue).toBe(2);
  expect(evaluateDiagramAt(separated, 'axial', a / length)).toBe(0);
  expect(evaluateDiagramAt(separated, 'axial', a / length, true)).toBe(2);
});

it('refuses aliased normalized jumps across magnitude constituents and retains separated ones', () => {
  const length = 3, a = 1.75;
  for (const method of ['abs', 'srss'] as const) {
    const combined = (b: number) => ({
      ...empty(), length,
      combined: { method, parts: [
        { ...empty(), length, nEnd: 1, pointLoadsX: [{ a, p: -1 }] },
        { ...empty(), length, nStart: 1, pointLoadsX: [{ a: b, p: 1 }] },
      ] },
    });
    expect(() => computeDiagram3D(combined(a + Number.EPSILON), 'axial')).toThrow(/extrema/i);
    expect(computeDiagram3D(combined(a + 2 * Number.EPSILON), 'axial').maxAbsValue).toBe(method === 'abs' ? 2 : Math.SQRT2);
    expect(computeDiagram3D(combined(a), 'axial').maxAbsValue).toBe(1);
  }
});
