import { expect, it } from 'vitest';
import { computeDiagram3D, computeGlobalMax3D, type Diagram3DKind } from '../diagrams-3d';
import type { ElementForces3D } from '../types-3d';

const wrong2273 = process.env.RUN_KNOWN_WRONG === '2273' ? it : it.skip;

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

wrong2273('known wrong result: #2273 combined member extrema include the interior governing station', () => {
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

wrong2273('known wrong result: #2273 combination minima include sign changes and one-sided jump limits', () => {
  for (const method of ['abs', 'srss'] as const) {
    const torsion = { ...empty(), mxStart: -0.435, mxEnd: 1 - 0.435 };
    expect(computeDiagram3D({ ...empty(), combined: { method, parts: [torsion] } }, 'torsion').minValue).toBeCloseTo(0, 12);
    const a = 0.435;
    const shear = { ...empty(), distributedLoadsZ: [{ a: 0, b: 1, qI: 2, qJ: 2 }], pointLoadsZ: [{ a, p: -1 }] };
    const combined = { ...empty(), combined: { method, parts: [shear] } };
    expect(computeDiagram3D(combined, 'shearZ').points.filter(point => point.t === a).map(point => point.value)).toEqual([2 * a, Math.abs(2 * a - 1)]);
  }
});

it('a monotone combination peaks at its end', () => {
  const forces = { ...empty(), mxStart: 1, mxEnd: 2 };
  expect(computeDiagram3D({ ...empty(), combined: { method: 'abs', parts: [forces] } }, 'torsion').maxValue).toBe(2);
});
