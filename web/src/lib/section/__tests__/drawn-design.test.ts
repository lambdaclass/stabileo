/**
 * Which drawn sections the steel checks read: exactly a welded I of three plates or one catalogue
 * profile. Everything else carries its scope, and no `shape` a check could take for an I.
 */
import { describe, it, expect } from 'vitest';
import { drawnDesignShape } from '../drawn-design';
import { starterParts } from '../drawn-starters';
import { catalogueOutline } from '../canonical';
import { analyzeDrawn } from '../drawn-properties';
import { assembleDrawn, bboxOf, momentsOf, type DrawnSection } from '../drawn';
import { toSectionFields } from '../section-choice';
import { steelProps } from '../../engine/design/other-codes/steel-props';
import { sectionRows } from '../../engine/steel/workflow-rows';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';

const sec = (id: Parameters<typeof starterParts>[0]): DrawnSection => ({ version: 1, parts: starterParts(id, catalogueOutline) });
const d = hasCanonicalGeometryExport() ? describe : describe.skip;

d('drawn sections for design', () => {
  it('a welded I of three plates is an I, with its plates as the thicknesses', () => {
    const r = drawnDesignShape(sec('weldedI'));
    expect(r).toEqual({ shape: { shape: 'I', h: 0.5, b: 0.25, tw: 0.008, tf: 0.016 } });
  });

  it('a single catalogue profile is that profile', () => {
    const r = drawnDesignShape({ version: 1, parts: [{ id: 1, shape: { kind: 'profile', name: 'IPE 300' }, at: [0, 0], rotationDeg: 0 }] });
    expect(r).toMatchObject({ shape: { shape: 'I', profileName: 'IPE 300', h: 0.3 } });
    expect('shape' in r && r.shape.tw).toBeCloseTo(0.0071, 12);
  });

  it('cover plates, a cut tee, two channels, a filled tube and a moved plate each have their scope', () => {
    expect(drawnDesignShape(sec('coverPlated'))).toEqual({ scope: 'coverPlated' });
    expect(drawnDesignShape(sec('cutTee'))).toEqual({ scope: 'cutProfile' });
    expect(drawnDesignShape(sec('doubleChannel'))).toEqual({ scope: 'severalProfiles' });
    const tube = sec('filledTube');
    tube.parts[1] = { ...tube.parts[1]!, materialId: 2, ratio: { e: 0.14, g: 0.14 } };
    expect(drawnDesignShape(tube)).toEqual({ scope: 'composite' });
    const offCentre = sec('weldedI');
    offCentre.parts[0] = { ...offCentre.parts[0]!, at: [0.01, offCentre.parts[0]!.at[1]] };
    expect(drawnDesignShape(offCentre)).toEqual({ scope: 'freeOutline' });
  });

  it('the choice writes the I only for the I, and the checks read the scope for the rest', () => {
    const choice = (drawn: DrawnSection) => {
      const p = analyzeDrawn(drawn, catalogueOutline).properties!;
      return toSectionFields({ kind: 'drawn', name: 'x', drawn, props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: 0.25, h: 0.5 } }, 0)!;
    };
    const welded = choice(sec('weldedI'));
    expect(welded).toMatchObject({ shape: 'I', tw: 0.008, tf: 0.016 });
    const plated = choice(sec('coverPlated'));
    expect(plated.shape).toBeUndefined();
    expect(plated.tw).toBeUndefined();
    expect(steelProps({ id: 1, ...plated } as never)).toEqual({ skip: 'otherCodes.skip.drawn.coverPlated' });
    const rows = sectionRows(
      { members: [{ elementId: 1, sectionName: 'x', family: { family: 'structuralSteel' } }] } as never,
      new Map([[1, plated as never]]), () => 1, { byId: () => null },
    );
    expect(rows[0]).toMatchObject({ origin: 'drawn', state: 'authorityBlocked', missing: [{ key: 'steel.rows.missing.drawn.coverPlated' }] });
  });

  it('a tee cut from an IPE 300 at mid-depth has half its area, and two channels sit back to back', () => {
    const full = analyzeDrawn({ version: 1, parts: [{ id: 1, shape: { kind: 'profile', name: 'IPE 300' }, at: [0, 0], rotationDeg: 0 }] }, catalogueOutline).properties!;
    const tee = analyzeDrawn(sec('cutTee'), catalogueOutline).properties!;
    expect(tee.a).toBeCloseTo(full.a / 2, 9);
    expect(tee.bbox[3] - tee.bbox[1]).toBeCloseTo(0.15, 9);
    const two = assembleDrawn(sec('doubleChannel'), catalogueOutline);
    expect(two.issues).toEqual([{ issue: { kind: 'loose', pieces: 2 }, severity: 'warning' }]);
    const [right, left] = two.parts;
    const rb = bboxOf(right!.outline), lb = bboxOf(left!.outline);
    expect(rb[0] - lb[2]).toBeCloseTo(0.01, 9);
    // Each web faces the gap: the centroid sits on the gap side of its own box.
    const cy = (o: typeof right) => { const m = momentsOf(o!.outline); return m.sy / m.a; };
    expect(cy(right)).toBeLessThan((rb[0] + rb[2]) / 2);
    expect(cy(left)).toBeGreaterThan((lb[0] + lb[2]) / 2);
  });
});
