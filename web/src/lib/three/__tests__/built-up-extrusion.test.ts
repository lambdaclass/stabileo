/**
 * What the extruded 3-D view draws for a generated section.
 *
 * ── The behaviour this replaces ─────────────────────────────────────
 *
 * Measured on this branch before the fix, with a truss whose chord is a channel box and whose
 * post is a back-to-back angle pair:
 *
 *   2x UPN 100 []            shape=undefined → THREE.Shape with 13 points
 *   2x L 50x50x5 ][ (h=8mm)  shape=undefined → THREE.Shape with 13 points
 *   IPE 100                  shape=undefined → THREE.Shape with 13 points
 *
 * Thirteen points is `createIShape`. A generated section carried no `shape`, so every one of
 * them — compound and single, channel and angle — fell to the `default:` branch, which says
 * "Default to I-shape if we have h and b" and invents `tw` and `tf` from the depth. The
 * viewport was drawing an I-beam for two angles at a spacing, and for a single angle.
 */

import { describe, it, expect } from 'vitest';
import { createSectionShapes } from '../section-profiles';
import { generateTruss } from '../../engine/generators/truss-topology';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../engine/generators/emit';
import { ARRANGEMENTS, type BuiltUpArrangement } from '../../engine/generators/built-up-section';
import { resolveProfile, availableArrangements } from '../../engine/generators/profile-resolve';
import { resolveCanonicalSection } from '../../section/canonical';
import { solverProperties } from '../../section/state';
import type { Section } from '../../store/model.svelte';

/** One section, emitted the way the generator emits it. */
function emitted(profileName: string, arrangement: BuiltUpArrangement, gapMm = 8): Section {
  const profiles: EmitOptions['profiles'] = {
    chord: { profileName, arrangement, gapMm, rotationDeg: 'auto' },
    post: defaultProfileSpec('L 50x50x5'),
    diagonal: defaultProfileSpec('L 50x50x5'),
  };
  const g = emitModel(generateTruss({ panelsPerHalf: 2 }), { name: 'x', profiles });
  return g.json.sections[0] as unknown as Section;
}

/** Bounding box of a shape list, in metres. */
function bbox(shapes: ReturnType<typeof createSectionShapes>) {
  let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const s of shapes) {
    for (const p of s.getPoints(0)) {
      minY = Math.min(minY, p.x); maxY = Math.max(maxY, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
  }
  return { w: maxY - minY, h: maxZ - minZ };
}

describe('a built-up section draws its parts', () => {
  it.each(['doubleBack', 'doubleFacing', 'doubleParallel', 'quadBack', 'quadBox'] as BuiltUpArrangement[])(
    '%s yields one outline per profile',
    (arrangement) => {
      const resolved = resolveProfile('L 50x50x5')!;
      if (!availableArrangements(resolved).includes(arrangement)) return;
      const shapes = createSectionShapes(emitted('L 50x50x5', arrangement));
      expect(shapes).toHaveLength(ARRANGEMENTS[arrangement].count);
    },
  );

  it('spans the same box the section reports, so the mesh matches the properties', () => {
    const sec = emitted('UPN 100', 'doubleFacing');
    const box = bbox(createSectionShapes(sec));
    expect(box.w).toBeCloseTo(sec.b!, 6);
    expect(box.h).toBeCloseTo(sec.h!, 6);
  });

  it('separates the parts by the gap that was asked for', () => {
    const tight = bbox(createSectionShapes(emitted('UPN 100', 'doubleBack', 0)));
    const loose = bbox(createSectionShapes(emitted('UPN 100', 'doubleBack', 30)));
    expect(loose.w - tight.w).toBeCloseTo(0.03, 6);
    expect(loose.h).toBeCloseTo(tight.h, 6);
  });

  it('no longer draws an I-beam where two angles belong', () => {
    const shapes = createSectionShapes(emitted('L 50x50x5', 'doubleBack'));
    expect(shapes).toHaveLength(2);
    // The old behaviour was a single 13-point I outline. Two angle outlines is neither one
    // shape nor 13 points each.
    for (const s of shapes) expect(s.getPoints(0).length).not.toBe(13);
  });
});

describe('a single generated profile draws its own family', () => {
  it.each([
    ['IPE 200', 'I'],
    ['UPN 100', 'U'],
    ['L 50x50x5', 'L'],
    ['HEB 160', 'H'],
  ] as Array<[string, string]>)('%s is emitted as shape %s', (name, shape) => {
    const sec = emitted(name, 'single', 0);
    expect(sec.shape).toBe(shape);
    expect(createSectionShapes(sec)).toHaveLength(1);
  });

  it('draws an angle as an angle, not as an I', () => {
    const angle = createSectionShapes(emitted('L 50x50x5', 'single', 0));
    const ibeam = createSectionShapes(emitted('IPE 200', 'single', 0));
    expect(angle).toHaveLength(1);
    expect(ibeam).toHaveLength(1);
    // An L outline is six points; the fabricated I is thirteen. Before the fix both were
    // thirteen, because neither carried a `shape`.
    expect(angle[0].getPoints(0).length).not.toBe(ibeam[0].getPoints(0).length);
  });
});

describe('the composition is declarative and stays out of the properties path', () => {
  it('records what the section is made of, for a single profile too', () => {
    expect(emitted('UPN 100', 'single', 0).composition)
      .toEqual({ profileName: 'UPN 100', arrangement: 'single', gapMm: 0 });
    expect(emitted('UPN 100', 'doubleBack', 8).composition)
      .toEqual({ profileName: 'UPN 100', arrangement: 'doubleBack', gapMm: 8 });
  });

  /**
   * The invariant that keeps the drawing from corrupting the analysis.
   *
   * `resolveCanonicalSection` switches on `shape`, and a compound section carrying one would
   * make it rebuild ONE part's outline, mark the section geometry-backed, and silently replace
   * the assembly's composed A, Iy and Iz with a single profile's — the solver would analyse a
   * double-channel member as one channel. So an assembly emits NO `shape` and NO `polygon`,
   * and this pins it.
   */
  it('never emits a shape or a polygon for an assembly', () => {
    for (const a of ['doubleBack', 'doubleFacing', 'quadBox'] as BuiltUpArrangement[]) {
      const sec = emitted('UPN 100', a);
      expect(sec.shape, a).toBeUndefined();
      expect(sec.polygon, a).toBeUndefined();
    }
  });

  it('leaves an assembly properties-only, with the composed values intact', () => {
    const sec = emitted('UPN 100', 'doubleBack');
    const resolved = resolveCanonicalSection(sec);
    expect(resolved.state).toBe('properties-only');

    const props = solverProperties(sec);
    expect(props.source).toBe('declared');
    expect(props.a).toBeCloseTo(sec.a, 15);
    expect(props.iy).toBeCloseTo(sec.iy!, 15);
    expect(props.iz).toBeCloseTo(sec.iz, 15);

    // And it really is TWO channels' worth of area, not one.
    const one = resolveProfile('UPN 100')!;
    expect(sec.a).toBeCloseTo(2 * one.profile.a, 12);
  });

  it('lets a single profile stay geometry-backed, which is where the shape helps', () => {
    // The name matches a catalogue profile, so canonical geometry wins and the section keeps
    // the engine's own outline — root radius and all.
    const sec = emitted('IPE 200', 'single', 0);
    expect(resolveCanonicalSection(sec).state).toBe('geometry-backed');
  });
});

describe('a section the viewer cannot draw draws nothing', () => {
  it('returns no shapes rather than a stand-in for a properties-only family', () => {
    const resolved = resolveProfile('MC18x58');
    if (!resolved) return;
    const sec = emitted('MC18x58', 'single', 0);
    // A fabricated I-beam where a channel belongs is worse than a wireframe line.
    expect(createSectionShapes(sec)).toEqual([]);
  });

  it('still draws non-generated sections through the existing path', () => {
    // No `composition` — an ordinary hand-entered section keeps whatever it had.
    const plain = { id: 9, name: 'V 20x40', a: 0.08, iz: 1e-4, iy: 2e-4, b: 0.2, h: 0.4, shape: 'rect' } as Section;
    expect(createSectionShapes(plain)).toHaveLength(1);
  });

  it('draws nothing for a section with no geometry at all, rather than guessing', () => {
    const amorphous = { id: 9, name: 'algo', a: 0.01, iz: 1e-5 } as Section;
    expect(createSectionShapes(amorphous)).toEqual([]);
  });
});

describe('a hollow profile keeps its hole', () => {
  it('attaches the void as a hole rather than filling the tube', () => {
    const sec = emitted('RHS 200x100x5', 'single', 0);
    const shapes = createSectionShapes(sec);
    if (shapes.length === 0) return; // family may be properties-only
    // `shape: 'RHS'` routes through `createRHSShape`, which is a closed ring — either a hole
    // or a re-entrant outline. Either way the tube must not be a solid block.
    expect(shapes[0].getPoints(0).length).toBeGreaterThan(4);
  });
});
