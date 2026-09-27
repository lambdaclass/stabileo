/**
 * Signed member stresses: M·c/I on a rectangle, the unit-resultant combination equal to a direct
 * solve on an angle, and the bounding rectangle when a section has no geometry.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, buildSectionGeometry, analyzeSectionBending } from '../wasm-solver';
import { sectionStressModel, memberStationStresses } from '../member-stresses';

beforeAll(async () => { await initSolver(); });

const ef = (n: number, my: number, mz: number) => ({
  elementId: 3, length: 4,
  nStart: n, nEnd: n, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  myStart: my, myEnd: my, mzStart: mz, mzEnd: mz,
  distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
}) as never;

describe('member stresses', () => {
  it('a rectangle: N/A ± M·c/I, tension and compression at every station', () => {
    const g = buildSectionGeometry({ kind: 'rect', b: 0.2, h: 0.4 }).geometry;
    const m = sectionStressModel({ a: 0.08, iz: 1, canonical: { kind: 'geometry-backed', geometry: g } })!;
    expect(m.basis).toBe('geometry');
    const iy = (0.2 * 0.4 ** 3) / 12;
    const rows = memberStationStresses(ef(100, 50, 0), m, 3);
    expect(rows.map((r) => r.x)).toEqual([0, 2, 4]);
    for (const r of rows) {
      expect(r.sigmaMax).toBeCloseTo((100 / 0.08 + (50 * 0.2) / iy) / 1000, 9);
      expect(r.sigmaMin).toBeCloseTo((100 / 0.08 - (50 * 0.2) / iy) / 1000, 9);
    }
  });

  it('an angle: the three unit solves combine to the direct solve', () => {
    const g = buildSectionGeometry({ kind: 'angle', h: 0.1, b: 0.1, t: 0.01 }).geometry;
    const m = sectionStressModel({ a: 0.0019, iz: 1, canonical: { kind: 'geometry-backed', geometry: g } })!;
    const direct = analyzeSectionBending({ geometry: g, n: -30, my: 2, mz: -1.5, forcesAreLocal: true });
    const r = m(-30, 2, -1.5);
    expect(r.max).toBeCloseTo(direct.max.sigma / 1000, 9);
    expect(r.min).toBeCloseTo(direct.min.sigma / 1000, 9);
  });

  it('no geometry: the bounding rectangle when b and h are stated, nothing otherwise', () => {
    const m = sectionStressModel({ a: 0.08, iy: (0.2 * 0.4 ** 3) / 12, iz: (0.4 * 0.2 ** 3) / 12, b: 0.2, h: 0.4 })!;
    expect(m.basis).toBe('bounds');
    const r = m(0, 0, 10);
    expect(r.max).toBeCloseTo((10 * 0.1) / ((0.4 * 0.2 ** 3) / 12) / 1000, 9);
    expect(sectionStressModel({ a: 0.08, iz: 1e-4 })).toBeNull();
  });
});
