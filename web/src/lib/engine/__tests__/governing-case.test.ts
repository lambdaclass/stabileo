import { describe, expect, it } from 'vitest';
import { computeGoverning2D, computeGoverning3D, governingMagnitude2D, governingMagnitude3D } from '../governing-case';
import { computeDiagram3D } from '../diagrams-3d';
import { computeElementDiagram } from '../diagrams';
import type { AnalysisResults, ElementForces } from '../types';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

const ef3d = (o: Partial<ElementForces3D>): ElementForces3D => ({
  elementId: 1, length: 4, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false,
  releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [],
  qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [], ...o,
} as ElementForces3D);

const ef2d = (o: Partial<ElementForces>): ElementForces => ({
  elementId: 1, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0, length: 4, qI: 0, qJ: 0,
  pointLoads: [], distributedLoads: [], hingeStart: false, hingeEnd: false, ...o,
});

const simplySupported3D = (q: number): ElementForces3D => ef3d({
  vzStart: -q * 2, vzEnd: q * 2, qZI: q, qZJ: q, distributedLoadsZ: [{ qI: q, qJ: q, a: 0, b: 4 }],
});
const simplySupported2D = (q: number): ElementForces => ef2d({
  vStart: -q * 2, vEnd: q * 2, qI: q, qJ: q, distributedLoads: [{ qI: q, qJ: q, a: 0, b: 4 }],
});
const results3D = (forces: ElementForces3D[]) => ({ elementForces: forces }) as unknown as AnalysisResults3D;
const results2D = (forces: ElementForces[]) => ({ elementForces: forces }) as unknown as AnalysisResults;
const peakOf = (d: { maxValue: number; minValue: number }) => Math.max(Math.abs(d.maxValue), Math.abs(d.minValue));

describe('governing combination over the whole member', () => {
  it('3D: a midspan moment beyond both ends governs, with its value', () => {
    const loaded = simplySupported3D(-10);
    const midspan = peakOf(computeDiagram3D(loaded, 'momentY'));
    expect(midspan).toBeCloseTo(20, 9);
    expect(governingMagnitude3D(loaded, 'momentY')).toEqual({ value: midspan });
    const endHeavy = ef3d({ myStart: 12, myEnd: -12 });
    const g = computeGoverning3D(new Map([[1, results3D([endHeavy])], [2, results3D([loaded])]]), new Map([[1, 'ends'], [2, 'span']]));
    expect(g.get(1)?.momentY).toEqual({ comboId: 2, comboName: 'span', value: midspan });
  });
  it('2D: a midspan moment beyond both ends governs, with its value', () => {
    const loaded = simplySupported2D(-10);
    const midspan = peakOf(computeElementDiagram('moment', loaded, 0, 0, 0, 0));
    expect(midspan).toBeCloseTo(20, 9);
    expect(governingMagnitude2D(loaded, 'moment')).toBeCloseTo(midspan, 12);
    const endHeavy = ef2d({ mStart: 12, mEnd: -12 });
    const g = computeGoverning2D(new Map([[1, results2D([endHeavy])], [2, results2D([loaded])]]), new Map([[1, 'ends'], [2, 'span']]));
    expect(g.get(1)?.moment).toMatchObject({ comboId: 2, comboName: 'span' });
    expect(g.get(1)?.moment?.value).toBeCloseTo(midspan, 12);
  });
  it('NEGATIVE: end forces larger than the interior still govern', () => {
    const endHeavy = ef3d({ myStart: 30, myEnd: -30, vzStart: -15, vzEnd: -15 });
    const g = computeGoverning3D(new Map([[1, results3D([endHeavy])], [2, results3D([simplySupported3D(-10)])]]), new Map());
    expect(g.get(1)?.momentY).toMatchObject({ comboId: 1, value: 30 });
  });
  it('a member with no force of a kind has no governing combination for it', () => {
    const g = computeGoverning3D(new Map([[1, results3D([simplySupported3D(-10)])]]), new Map());
    expect(g.get(1)?.torsion).toBeUndefined();
    expect(g.get(1)?.momentZ).toBeUndefined();
  });
});

describe('governing shear uses the section inside each member end', () => {
  const length = 3;
  const pointLoads = [{ a: 0, p: -10 }, { a: 1, p: -5 }, { a: 2, p: 7 }, { a: length, p: 28 }];

  it('known wrong result: #2226 ranks planar combinations by inward shear', () => {
    const jumped = ef2d({ length, vStart: 10, vEnd: 30, pointLoads });
    const select = (shear: number) => computeGoverning2D(new Map([
      [1, results2D([jumped])],
      [2, results2D([ef2d({ length, vStart: shear, vEnd: shear })])],
    ]), new Map()).get(1)?.shear;
    expect.soft(governingMagnitude2D(jumped, 'shear')).toBe(5);
    expect.soft(select(4)).toMatchObject({ comboId: 1, value: 5 });
    expect(select(6)).toMatchObject({ comboId: 2, value: 6 });
  });

  it('known wrong result: #2226 ranks spatial combinations by inward shear', () => {
    const jumped = ef3d({ length, vzStart: 10, vzEnd: 30, pointLoadsZ: pointLoads });
    const select = (shear: number) => computeGoverning3D(new Map([
      [1, results3D([jumped])],
      [2, results3D([ef3d({ length, vzStart: shear, vzEnd: shear })])],
    ]), new Map()).get(1)?.shearZ;
    expect.soft(governingMagnitude3D(jumped, 'shearZ')).toEqual({ value: 5 });
    expect.soft(select(4)).toMatchObject({ comboId: 1, value: 5 });
    expect(select(6)).toMatchObject({ comboId: 2, value: 6 });
  });
});

it('#2273 withholds an exact governing claim if a possible winner has only a bound', () => {
  const pulse = (a: number, b: number) => ef3d({ pointLoadsX: [{ a, p: -10 }, { a: b, p: 10 }] });
  const magnitude = (parts: ElementForces3D[]) => ef3d({ combined: { method: 'abs', parts } });
  const first = pulse(0.5, 1.5), second = pulse(2, 3);
  const bounded = magnitude([magnitude([first]), second]);
  expect(computeDiagram3D(bounded, 'axial').extrema).toBe('bounded');
  const select = (n: number) => computeGoverning3D(
    new Map([[1, results3D([bounded])], [2, results3D([ef3d({ nStart: n, nEnd: n })])]]), new Map(),
  ).get(1)?.axial;
  expect.soft(select(15)).toBeUndefined();
  expect(select(21)).toMatchObject({ comboId: 2, value: 21 });
});
