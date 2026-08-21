/**
 * τ_max = k·V/A, and k belongs to the SECTION.
 *
 * Two colour maps each estimated peak shear with a constant. The 3D map used
 * 1.2, which is not a peak factor at all — it is `A/A_s` for a rectangle, the
 * shear-DEFLECTION coefficient. The 2D map used 1.5, which is the peak factor
 * for a solid rectangle and for nothing else. Every rolled profile carries
 * both `b` and `h`, so every I-beam in the catalogue got the rectangle's
 * answer while its web carried nearly all the shear over a fraction of the
 * gross area.
 *
 * The values below are the textbook shear form factors, written here rather
 * than read back from the implementation — a test that asks the code what it
 * computes cannot tell whether the code is right.
 */
import { describe, it, expect } from 'vitest';
import { shearPeakFactor } from '../section-stress';
import { computeSectionStress } from '../section-stress-3d';
import { computeElementStress } from '../../store/results.svelte';

const RECT = { id: 1, name: 'R', shape: 'rect', a: 0.15, iy: 3.125e-3, iz: 1.125e-3, j: 1e-3, h: 0.5, b: 0.3 } as never;
const IPE300 = { id: 2, name: 'IPE300', shape: 'I', a: 5.381e-3, iy: 8.356e-5, iz: 6.04e-6, j: 2.01e-7, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 } as never;
const CHS = { id: 3, name: 'CHS300x8', shape: 'CHS', a: 7.3387e-3, iy: 7.8275e-5, iz: 7.8275e-5, j: 1.5655e-4, h: 0.3, b: 0.3, t: 0.008 } as never;

describe('the shear form factor comes from the section', () => {
  it('a solid rectangle is exactly 3/2 — the one case the old constant had right', () => {
    expect(shearPeakFactor(RECT)).toBeCloseTo(1.5, 2);
  });

  it('a thin circular tube is 2, not 1.5', () => {
    // The classic thin-tube result. A real 8 mm wall on a 300 mm tube lands a
    // few per cent above the thin-wall ideal, hence the band.
    const k = shearPeakFactor(CHS);
    expect(k).toBeGreaterThan(1.95);
    expect(k).toBeLessThan(2.25);
  });

  it('an I-section is far above either constant, because the web carries it', () => {
    // A_web ≈ (h − 2·tf)·tw = 1.98e-3 m² against A = 5.381e-3, so the peak is
    // roughly A/A_web ≈ 2.7 times the mean — nowhere near 1.2 or 1.5.
    const k = shearPeakFactor(IPE300);
    expect(k).toBeGreaterThan(2.4);
    expect(k).toBeLessThan(3.1);
  });

  it('never silently returns the rectangle for a shape it could resolve', () => {
    // The regression that motivated this: every one of these used to be 1.5.
    expect(shearPeakFactor(IPE300)).not.toBeCloseTo(1.5, 1);
    expect(shearPeakFactor(CHS)).not.toBeCloseTo(1.5, 1);
  });
});

describe('both viewports now report the same peak shear', () => {
  const V = 100;                       // kN
  const ef = {
    elementId: 1, length: 4,
    nStart: 0, nEnd: 0, vStart: V, vEnd: V, mStart: 0, mEnd: 0,
    qI: 0, qJ: 0, pointLoads: [], distributedLoads: [],
  } as never;
  const mat = { id: 1, name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275 } as never;

  for (const [label, sec] of [['rect', RECT], ['IPE 300', IPE300], ['CHS 300x8', CHS]] as const) {
    it(`${label}: the 2D and 3D maps agree`, () => {
      const k = shearPeakFactor(sec);
      const A = (sec as unknown as { a: number }).a;

      // 2D path, in MPa.
      const twoD = computeElementStress(ef, sec, mat).tauStart ?? 0;
      // 3D path works in kPa; same forces, shear on one axis.
      const threeD = computeSectionStress(
        0, V, 0, 0, 0, 0, A,
        (sec as unknown as { iz: number }).iz, (sec as unknown as { iy: number }).iy,
        (sec as unknown as { h: number }).h, (sec as unknown as { b: number }).b,
        275_000, k,
      ).tauMax / 1000;

      expect(threeD).toBeCloseTo(twoD, 6);
      // And both are the section's own factor times the mean, not a constant.
      expect(twoD).toBeCloseTo(k * V / A / 1000, 6);
    });
  }
});
