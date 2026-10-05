/**
 * Every section template reaches the canonical resolver as the outline it computed.
 *
 * The templates compute A, Iy and Iz in closed form and write a shape with its thicknesses; the
 * resolver rebuilds the outline from those for the stresses, the drawing and the extrusion. The
 * two have to describe one section. They did not for three of them: the lipped C lost its lips,
 * the inverted L came back as a centred tee, and the round bars had no geometry at all.
 */
import { describe, it, expect } from 'vitest';
import { SECTION_SHAPES, computeSectionProperties } from '../../data/section-shapes';
import { toSectionFields } from '../section-choice';
import { resolveCanonicalSection, isGeometryBacked } from '../canonical';
import { resolveSectionState } from '../state';
import { geometricShearAreas } from '../shear-areas';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import type { Section } from '../../store/model.svelte';

const describeCanonical = hasCanonicalGeometryExport() ? describe : describe.skip;
const rel = (got: number, exp: number) => Math.abs((got - exp) / exp);

function built(shapeType: (typeof SECTION_SHAPES)[number]['id'], params: Record<string, number>): Section {
  const props = computeSectionProperties(shapeType, params)!;
  const fields = toSectionFields({ kind: 'built', name: shapeType, shapeType, params, props, rotationDeg: 0 }, 0)!;
  return { id: 1, ...fields } as unknown as Section;
}

describeCanonical('section templates against their canonical outline', () => {
  for (const shape of SECTION_SHAPES) {
    it(`${shape.id} with its default dimensions`, () => {
      const params = Object.fromEntries(shape.params.map((p) => [p.id, p.defaultValue]));
      const s = built(shape.id, params);
      const r = resolveCanonicalSection(s);
      expect(isGeometryBacked(r), `${shape.id} has geometry`).toBe(true);
      if (!isGeometryBacked(r)) return;
      // The round outlines are polygons, a few parts in ten thousand short of the disc.
      expect(rel(r.properties.a, s.a)).toBeLessThan(2e-3);
      expect(rel(r.properties.iy, s.iy!)).toBeLessThan(2e-3);
      expect(rel(r.properties.iz, s.iz)).toBeLessThan(2e-3);
    });
  }

  it('a lipped C keeps its lips and the inverted L its offset web', () => {
    const c = built('C-custom', { h: 0.1, b: 0.05, tw: 0.002, tf: 0.002, c: 0.015, tl: 0.002 });
    const rc = resolveCanonicalSection(c);
    expect(isGeometryBacked(rc) && rel(rc.properties.a, 444e-6)).toBeLessThan(1e-9);

    const l = built('concrete-invL', { bw: 0.2, hw: 0.4, bf: 0.6, hf: 0.12 });
    const rl = resolveCanonicalSection(l);
    // The centroid sits toward the web, (0.2·0.4·0.1 + 0.6·0.12·0.3) / 0.152 from its outer face.
    expect(isGeometryBacked(rl) && rl.properties.yc).toBeCloseTo(0.0296 / 0.152, 9);
  });

  /*
   * The engine draws the circles as polygons, 0.07 % short of the disc's area and 0.14 % of its
   * inertia; a J labelled exact sat that far under πd⁴/32. The state takes the shapes' own
   * formulas, with the radii read off the polygon.
   */
  it('a round bar and a tube carry the closed-form A, I and J their J is labelled with', () => {
    const d = 0.3, t = 0.01, di = d - 2 * t;
    const bar = resolveSectionState(built('circular', { d }), { torsion: true });
    const tube = resolveSectionState(built('hollow-circular', { d, t }), { torsion: true });
    if (bar.kind !== 'geometry-backed' || tube.kind !== 'geometry-backed') throw new Error('not geometry-backed');
    expect(bar.jProvenance).toBe('exactAnalytical');
    expect(rel(bar.a, (Math.PI * d ** 2) / 4)).toBeLessThan(1e-12);
    expect(rel(bar.iy, (Math.PI * d ** 4) / 64)).toBeLessThan(1e-12);
    expect(rel(bar.j!, (Math.PI * d ** 4) / 32)).toBeLessThan(1e-12);
    expect(tube.jProvenance).toBe('exactAnalytical');
    expect(rel(tube.a, (Math.PI * (d ** 2 - di ** 2)) / 4)).toBeLessThan(1e-12);
    expect(rel(tube.iz, (Math.PI * (d ** 4 - di ** 4)) / 64)).toBeLessThan(1e-12);
    expect(rel(tube.j!, (Math.PI * (d ** 4 - di ** 4)) / 32)).toBeLessThan(1e-12);
  });

  it('a round bar shears with 0.9 A, a tube with A/2', () => {
    const bar = built('circular', { d: 0.3 });
    expect(geometricShearAreas(bar)!.asY / bar.a).toBeCloseTo(0.9, 9);
    const tube = built('hollow-circular', { d: 0.3, t: 0.01 });
    expect(geometricShearAreas(tube)!.asY / tube.a).toBeCloseTo(0.5, 9);
  });
});
