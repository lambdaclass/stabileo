import { expect, it } from 'vitest';
import { computeDiagram3D, computeGlobalMax3D, type Diagram3DKind } from '../diagrams-3d';
import type { ElementForces3D } from '../types-3d';
import { linearProfile } from '../linear-profile';

const empty = (): ElementForces3D => ({ elementId: 1, length: 1, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [] });
function parabola(a: number, kind: Diagram3DKind): ElementForces3D {
  const ef = empty(), start = 1 - a * a;
  const bending = [{ a: 0, b: 1, qI: kind === 'momentZ' ? 2 : -2, qJ: kind === 'momentZ' ? 2 : -2 }];
  const shear = [{ a: 0, b: 1, qI: 2 * a, qJ: 2 * a - 2 }];
  if (kind === 'momentZ') { ef.mzStart = start; ef.vyStart = -2 * a; ef.distributedLoadsY = bending; }
  if (kind === 'momentY') { ef.myStart = start; ef.vzStart = 2 * a; ef.distributedLoadsZ = bending; }
  if (kind === 'shearY') { ef.vyStart = start; ef.distributedLoadsY = shear; }
  if (kind === 'shearZ') { ef.vzStart = start; ef.distributedLoadsZ = shear; }
  if (kind === 'axial') { ef.nStart = start; ef.distributedLoadsX = [{ a: 0, b: 1, qI: -2 * a, qJ: 2 - 2 * a }]; }
  if (kind === 'torsion') { ef.mxStart = start; ef.memberMoments = [{ a: 0, b: 1, moments: { x: [2 * a, 2 * a - 1, 2 * a - 2], y: [0, 0, 0], z: [0, 0, 0] } }]; }
  return ef;
}

it.skip('known wrong result: #2219 combined functions include their own governing extrema', () => {
  for (const kind of ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'] as const) {
    for (const method of ['abs', 'srss'] as const) {
      const ef = { ...empty(), combined: { method, parts: [parabola(0.21, kind), parabola(0.66, kind)] } };
      const expected = (1 - 0.225 ** 2) * (method === 'abs' ? 2 : Math.sqrt(2));
      const d = computeDiagram3D(ef, kind);
      expect(d.maxValue).toBeCloseTo(expected, 12);
      expect(d.points.some(p => Math.abs(p.t - 0.435) < 1e-10)).toBe(true);
      expect(computeGlobalMax3D([ef], kind)).toBeCloseTo(expected, 12);
      const piece = { ...empty(), length: 10, pieces: [{ x0: 0, x1: 10, sectionId: 1, forces: ef }] };
      expect(computeDiagram3D(piece, kind).maxValue).toBeCloseTo(expected, 12);
    }
  }
});

it.skip('known wrong result: #2219 SRSS cubic components retain the quintic stationary point', () => {
  const first = empty(), second = empty();
  first.memberMoments = [{ a: 0, b: 1, moments: { x: [0, 0.75, 3], y: [0, 0, 0], z: [0, 0, 0] } }];
  second.mxStart = 1;
  second.memberMoments = [{ a: 0, b: 1, moments: { x: [-6, 0, -6], y: [0, 0, 0], z: [0, 0, 0] } }];
  const t = 2 ** 0.2 / (1 + 2 * 2 ** 0.2);
  const d = computeDiagram3D({ ...empty(), combined: { method: 'srss', parts: [first, second] } }, 'torsion');
  expect(d.minValue).toBeCloseTo(Math.hypot(t ** 3, (1 - 2 * t) ** 3), 12);
  expect(d.points.some(p => Math.abs(p.t - t) < 1e-10)).toBe(true);
});

it.skip('known wrong result: #2219 compensated profile residuals survive cancellation', () => {
  for (const sign of [-1, 1]) {
    for (const residual of [0.5, 1, 2]) {
      const pieces = [{ a: 0, b: 1, qa: sign * 2 ** 50, qb: sign * 2 ** 50 }, { a: 0, b: 1, qa: sign * (-(2 ** 50) + residual), qb: sign * (-(2 ** 50) + residual) }];
      for (const list of [pieces, [...pieces].reverse()]) expect(linearProfile(list)).toEqual([{ a: 0, b: 1, qa: sign * residual, qb: sign * residual }]);
    }
  }
});

it.skip('known wrong result: #2219 component sign changes and combination boundaries', () => {
  expect(linearProfile([{ a: 0, b: 1, qa: 2, qb: 2 }, { a: 0, b: 1, qa: -2, qb: -2 }])).toEqual([]);
  expect(linearProfile([{ a: 0, b: 1, qa: 1, qb: 2 }])).toEqual([{ a: 0, b: 1, qa: 1, qb: 2 }]);
  for (const method of ['abs', 'srss'] as const) {
    for (const root of [0, 0.435, 1]) {
      const p = { ...empty(), mxStart: -root, mxEnd: 1 - root };
      const d = computeDiagram3D({ ...empty(), combined: { method, parts: [p] } }, 'torsion');
      expect(d.minValue).toBeCloseTo(0, 12);
      expect(d.maxValue).toBeCloseTo(Math.max(root, 1 - root), 12);
    }
    expect(computeDiagram3D({ ...empty(), combined: { method, parts: [] } }, 'torsion').maxValue).toBe(0);
  }
});
