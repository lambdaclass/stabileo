/**
 * The 3D section-stress entry points hand the engine a section it can parse.
 *
 * Both sent the model's `Section` as is, and a section without `shape` (the
 * space truss's `IPN 300` and `L 80x80x8`, sections defined by their
 * properties) came back as "Parse error: missing field `shape`": a throw that
 * froze the section-analysis panel. They now send the resolved geometry the TS
 * fallback reads, so engine and fallback describe one section.
 */
import { describe, it, expect } from 'vitest';
import { analyzeSectionStress3D, analyzeSectionStressFromForces } from '../section-stress-3d';
import { isWasmReady } from '../wasm-solver';
import type { ElementForces3D } from '../types-3d';
import type { Section } from '../../store/model.svelte';

const ef: ElementForces3D = {
  elementId: 1, length: 4,
  nStart: -120, nEnd: -120,
  vyStart: 3, vyEnd: 3, vzStart: 12, vzEnd: -12,
  mxStart: 0.4, mxEnd: 0.4,
  myStart: -8, myEnd: 8, mzStart: 1.5, mzEnd: -1.5,
  hingeStart: false, hingeEnd: false,
  qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [],
  qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [],
} as unknown as ElementForces3D;

// The space-truss fixture's sections: properties, a name, no `shape`.
const SECTIONS: Section[] = [
  { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-05, iz: 4.51e-06, j: 1e-07, b: 0.125, h: 0.3 } as Section,
  { id: 2, name: 'L 80x80x8', a: 0.00123, iy: 8e-07, iz: 8e-07, j: 1e-07, b: 0.08, h: 0.08 } as Section,
  // Nothing but the properties the solver needs.
  { id: 3, name: 'Amorphous', a: 0.005, iy: 8e-05, iz: 2e-05 } as Section,
];

describe('3D section stress across the WASM boundary, sections without a shape', () => {
  it('the engine is the one answering', () => {
    expect(isWasmReady()).toBe(true);
  });

  for (const sec of SECTIONS) {
    it(`${sec.name}: analyzeSectionStress3D answers, with the section's own properties`, () => {
      const r = analyzeSectionStress3D(ef, sec, 250, 0.5);
      expect(r.resolved.a).toBeCloseTo(sec.a, 12);
      expect(r.resolved.iy).toBeCloseTo(sec.iy!, 14);
      expect(r.resolved.iz).toBeCloseTo(sec.iz, 14);
      // σ at the centroid is N/A (MPa): kN / m² / 1000.
      const atCentroid = analyzeSectionStress3D(ef, sec, 250, 0.5, 0, 0);
      expect(atCentroid.sigmaAtFiber).toBeCloseTo(-120 / sec.a / 1000, 3);
      expect(r.distributionY.length).toBeGreaterThan(2);
      expect(Number.isFinite(r.failure?.ratioVM ?? 0)).toBe(true);
    });

    it(`${sec.name}: analyzeSectionStressFromForces answers`, () => {
      const r = analyzeSectionStressFromForces(-50, 2, 10, 0.2, 5, 1, sec, 250, 0.05, 0.01);
      expect(Number.isFinite(r.sigmaAtFiber)).toBe(true);
      expect(r.resolved.a).toBeCloseTo(sec.a, 12);
    });
  }
});
