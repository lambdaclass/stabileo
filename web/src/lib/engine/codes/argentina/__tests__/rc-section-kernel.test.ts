import { describe, expect, it, vi } from 'vitest';
import { RcSectionGeometry } from '../../../../wasm/dedaliano_engine.js';
import { getRcSectionKernel, registerRcSectionKernel } from '../rc-section-kernel';
import { interactionCurve, prepareSection, sectionPoint, type Bar, type Materials, type Outline, type SectionPoint } from '../cirsoc201-section';
import { momentCapacityAtAxial, surfaceCut, refine } from '../cirsoc-flex-surface';

const bars: Bar[] = Array.from({ length: 16 }, (_, i) => ({
  x: 0.16 * Math.cos(i * Math.PI / 8), y: 0.16 * Math.sin(i * Math.PI / 8), area: 0.000314,
}));
const outlines: Outline[] = [
  { kind: 'rect', b: 0.4, h: 0.6 }, { kind: 'rect', b: 0.4, h: 0.6, hole: { b: 0.2, h: 0.2 } },
  { kind: 'tee', bf: 0.8, hf: 0.1, bw: 0.3, h: 0.6 },
  { kind: 'circle', D: 0.5 }, { kind: 'circle', D: 0.5, Dint: 0.2 },
];
function samePoint(actual: SectionPoint, expected: SectionPoint) {
  for (const key of Object.keys(expected) as (keyof SectionPoint)[]) {
    // Numerical integration retains the original 360-side circles and all code
    // tolerances. This allowance is only roundoff in unrounded numeric outputs.
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(expected[key])));
  }
}
function reference<T>(run: () => T): T {
  const constructor = getRcSectionKernel(); registerRcSectionKernel(null);
  try { return run(); } finally { registerRcSectionKernel(constructor); }
}
describe('prepared RC section kernel', () => {
  it('is enabled after production WASM initialization', () => {
    expect(getRcSectionKernel()).not.toBeNull();
  });
  for (const outline of outlines) it(`matches TS for ${JSON.stringify(outline)}`, () => {
    for (const confinement of ['ties', 'spiral'] as const) for (const deductDisplacedConcrete of [false, true]) {
      const mat: Materials = { fc: 42, fy: 420, confinement, deductDisplacedConcrete };
      const prepared = prepareSection(outline, bars, mat);
      try {
        for (const theta of [0, 0.21, Math.PI / 2, 2.57, -Math.PI / 2]) {
          for (const c of [0, 1e-10, 1e-5, 0.05, 0.2, 0.4, 1, 5]) {
            samePoint(prepared.point(theta, c), sectionPoint(outline, bars, mat, theta, c));
          }
          for (const point of prepared.curve(theta, 60)) samePoint(point, sectionPoint(outline, bars, mat, theta, point.c));
        }
      } finally { prepared.free(); }
    }
  });
  it('preserves contour states, biaxial capacity, axial cap and tension rejection', () => {
    const mat: Materials = { fc: 30, fy: 420 };
    for (const outline of [outlines[0], outlines[4]]) {
      const run = () => ({ contour: surfaceCut(outline, bars, mat, 300, { steps: 12, sx: -1 }),
        capacity: momentCapacityAtAxial(outline, bars, mat, 300, -100, 75),
        above: surfaceCut(outline, bars, mat, 1e9), below: surfaceCut(outline, bars, mat, -1e9) });
      const actual = run(), expected = reference(run);
      expect(actual.above).toEqual([]); expect(actual.below).toEqual([]);
      expect(actual.contour.length).toBe(expected.contour.length);
      actual.contour.forEach((point, i) => samePoint(point.state, expected.contour[i].state));
      expect(actual.capacity).not.toBeNull(); expect(expected.capacity).not.toBeNull();
      samePoint(actual.capacity!.state, expected.capacity!.state);
      expect(actual.capacity!.phiMn).toBeCloseTo(expected.capacity!.phiMn, 8);
    }
  }, 60_000); // Includes the deliberately slow, unprepared TS surface oracle.
  it('does not reuse stale outline/material/bar data between calculations', () => {
    const outline: Outline = { kind: 'rect', b: 0.4, h: 0.6 };
    const mat = { fc: 30, fy: 420 }; const edited = bars.map(b => ({ ...b }));
    const first = interactionCurve(outline, edited, mat, 0);
    outline.b = 0.5; mat.fc = 45; edited[0].area *= 2;
    const second = interactionCurve(outline, edited, mat, 0);
    expect(second).not.toEqual(first);
    second.forEach(p => samePoint(p, sectionPoint(outline, edited, mat, 0, p.c)));
  });
  it('releases prepared geometry if a refinement callback throws', () => {
    const freed = vi.spyOn(RcSectionGeometry.prototype, 'free');
    try {
      expect(() => refine(outlines[0], bars, { fc: 30, fy: 420 }, 0, 0.1, 0.2,
        () => { throw new Error('refinement failure'); })).toThrow('refinement failure');
      expect(freed).toHaveBeenCalledTimes(1);
    } finally { freed.mockRestore(); }
  });
  it('rejects malformed geometry and queries', () => {
    expect(() => new RcSectionGeometry(new Float64Array(8), new Uint32Array([0, 5, 4]), new Float64Array(), new Float64Array(5), true)).toThrow();
    const section = new RcSectionGeometry(new Float64Array(8), new Uint32Array([0, 4]), new Float64Array(), Float64Array.of(30000, 420, 200000, 0.003, 0.85), true);
    try { expect(() => section.evaluate(1, 0, Float64Array.of(NaN))).toThrow(); }
    finally { section.free(); }
  });
});
