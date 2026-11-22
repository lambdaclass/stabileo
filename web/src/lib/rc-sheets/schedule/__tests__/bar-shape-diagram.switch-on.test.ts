/**
 * Objective 9 — the picture beside a schedule row.
 *
 * The assertions that matter are the refusals and the leg list. A shape that is drawn flat when
 * it is not flat is a bar no bender can make and a checker cannot tell from a real one; a leg
 * list built from the SAMPLED polyline reports a 90° bend as eight legs of three millimetres.
 * Both look right until somebody fabricates from them.
 */

import { describe, expect, it } from 'vitest';
import { rcShapeDiagram, rcShapeForMark, PLANARITY_TOLERANCE } from '../bar-shape-diagram';
import {
  buildStraightBarWithHooks, straightSegment, type BarPath,
} from '../../../codes/cirsoc201/bar-geometry';

const X = { x: 1, y: 0, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

/** A 6 m straight bar along +x. */
function straight(id = 's1'): BarPath {
  return {
    id, diameterMm: 20, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 6, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };
}

/** A bar with a 90° hook at one end — planar, in the x–z plane. */
const hooked = buildStraightBarWithHooks({
  id: 'h1', diameterMm: 20, role: 'longitudinal',
  start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 },
  axis: X, hookNormal: Z, endHook: 90, ownerElementIds: [1],
});

/** An L in the x–z plane, built from two straights. */
function ell(id = 'l1'): BarPath {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments: [
      straightSegment({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
      straightSegment({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }),
    ],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4.1, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };
}

describe('a straight bar is one leg', () => {
  const r = rcShapeDiagram(straight());

  it('is drawn, not refused', () => {
    expect(r.ok).toBe(true);
  });

  it('has one leg of its full length', () => {
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.legs).toHaveLength(1);
    expect(r.diagram.legs[0].lengthM).toBeCloseTo(6, 9);
    expect(r.diagram.straightM).toBeCloseTo(6, 9);
  });

  it('has no steel in bends, because it has no bends', () => {
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.bendsM).toBe(0);
  });
});

describe('a bent bar is drawn in the plane it is bent in', () => {
  const r = rcShapeDiagram(ell());

  /*
   * The legs come from `bar.segments`, not from the sampled polyline. The polyline subdivides
   * every arc into chords, and a leg list built from it would ask a bender to fabricate a 90°
   * bend as eight straight runs of three millimetres.
   */
  it('lists the straight runs, not the chords a sampling produced', () => {
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.legs.map((l) => +l.lengthM.toFixed(6))).toEqual([3, 1]);
  });

  /*
   * A bender cuts to the cutting length and bends to the legs. Padding the legs so the two add
   * up would produce a bar that is right on the schedule and long in the shop.
   */
  it('states the steel in the bends separately from the legs', () => {
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.straightM).toBeCloseTo(4, 9);
    expect(r.diagram.bendsM).toBeCloseTo(0.1, 9);
  });

  it('says which legs run across the diagram and which up it', () => {
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.legs.map((l) => l.horizontal)).toEqual([true, false]);
  });

  /*
   * The first axis is the LONGEST straight, so two marks of one shape are drawn at one angle.
   * Taking the first segment instead would rotate the diagram by whatever the generator
   * happened to emit first.
   */
  it('lays the longest straight along the diagram’s own x', () => {
    if (!r.ok) throw new Error('refused');
    const { min, max } = r.diagram.extent;
    expect(max.x - min.x).toBeCloseTo(3, 6);
    expect(max.y - min.y).toBeCloseTo(1, 6);
  });

  it('draws a hooked bar too, arcs and all', () => {
    const h = rcShapeDiagram(hooked);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    // The hook is an arc plus a tail, so the shaft is not the only leg.
    expect(h.diagram.legs.length).toBeGreaterThan(1);
    expect(h.diagram.bendsM).toBeGreaterThan(0);
  });
});

describe('a bar bent about two axes is refused, not flattened', () => {
  /*
   * A cranked bar that steps sideways as well as up has no plane containing it. Drawing it flat
   * would put a shape on the schedule that no bender can make and that a checker cannot tell
   * from a real one — the same reason `membersFromModel` refuses a section it cannot describe.
   */
  const cranked: BarPath = {
    id: 'c1', diameterMm: 16, role: 'longitudinal',
    segments: [
      straightSegment({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
      straightSegment({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }),
      // Out of the x–z plane: this is the second bending axis.
      straightSegment({ x: 3, y: 0, z: 1 }, { x: 3, y: 0.5, z: 1 }),
    ],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4.6, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };

  it('reports the reason rather than returning a shape', () => {
    const r = rcShapeDiagram(cranked);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('nonPlanar');
  });

  /*
   * And the tolerance is a millimetre, not zero: bending geometry is authored in millimetres
   * and `samplePath` works to five, so a gate at zero would refuse every real bar.
   */
  it('tolerates deviation below a millimetre as the noise it is', () => {
    const nearlyFlat: BarPath = {
      ...cranked,
      segments: [
        straightSegment({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
        straightSegment({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }),
        straightSegment(
          { x: 3, y: 0, z: 1 }, { x: 3, y: PLANARITY_TOLERANCE / 2, z: 1.5 }),
      ],
    };
    expect(rcShapeDiagram(nearlyFlat).ok).toBe(true);
  });

  it('refuses a bar with no length at all', () => {
    const nothing: BarPath = {
      ...straight('z'),
      segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })],
    };
    const r = rcShapeDiagram(nothing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('degenerate');
  });
});

describe('the diagram for a mark', () => {
  const bars = new Map([['l1', ell()], ['s1', straight()]]);
  const barOf = (id: string) => bars.get(id);

  it('is drawn from the first bar the mark names', () => {
    const r = rcShapeForMark(['l1', 's1'], barOf);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.diagram.legs).toHaveLength(2);
  });

  /* A mark that names a bar this assembly does not hold gets nothing, not a wrong shape. */
  it('is nothing when the mark names no bar we hold', () => {
    expect(rcShapeForMark(['ghost'], barOf)).toBeNull();
  });

  it('skips a missing id rather than giving up on the mark', () => {
    const r = rcShapeForMark(['ghost', 's1'], barOf);
    expect(r?.ok).toBe(true);
  });

  /* Two builds of one project must produce one schedule. `assignMarks` sorts before grouping,
     so `barIds[0]` is stable — and this pins that the diagram follows it. */
  it('is deterministic for one mark', () => {
    expect(rcShapeForMark(['l1'], barOf)).toEqual(rcShapeForMark(['l1'], barOf));
  });
});

/**
 * The drawn shape and the exported row are the SAME bar.
 *
 * The requirement is "verificar que la forma dibujada sea la misma que se exporta a la planilla"
 * and "no reemplazar la longitud real por una suma simplificada de cotas rectas". Both are
 * properties of one number — `cuttingLength`, which is `developedLength(segments)` — and both
 * fail silently: a schedule whose total was the sum of its own leg dimensions looks perfectly
 * consistent and orders short steel.
 */
describe('the length on the schedule is the developed length', () => {
  /*
   * `buildSchedule` reads `BarMark.cuttingLength`, `assignMarks` reads `BarPath.cuttingLength`,
   * and that is `developedLength(segments)` — every straight run plus every arc at r·θ. The
   * diagram's legs and bends are a decomposition OF it, so they add back up to it.
   */
  it('the legs and the bends add back up to the cutting length', () => {
    for (const b of [straight(), ell(), hooked]) {
      const r = rcShapeDiagram(b);
      expect(r.ok, b.id).toBe(true);
      if (!r.ok) continue;
      expect(r.diagram.straightM + r.diagram.bendsM).toBeCloseTo(b.cuttingLength, 9);
    }
  });

  /*
   * And the two are NOT the same number when the bar bends. This is the assertion that would
   * fail if somebody ever "simplified" the total to the sum of the drawn dimensions: on a
   * hooked bar the arcs are real steel and the leg list does not contain them.
   */
  it('the sum of the drawn legs is SHORTER than the cut length on a bent bar', () => {
    const r = rcShapeDiagram(hooked);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.straightM).toBeLessThan(hooked.cuttingLength);
    expect(r.diagram.bendsM).toBeGreaterThan(0);
  });

  it('and they ARE the same on a straight bar, which has no bends', () => {
    const r = rcShapeDiagram(straight());
    if (!r.ok) throw new Error('refused');
    expect(r.diagram.straightM).toBeCloseTo(straight().cuttingLength, 9);
    expect(r.diagram.bendsM).toBe(0);
  });

  /*
   * The mark a row is for and the bar the diagram is drawn from are the same object. A schedule
   * that drew mark B4 from a bar of mark B7 would be internally consistent and wrong, and
   * nothing on screen would show it.
   */
  it('the diagram for a mark is drawn from a bar that mark names', () => {
    const bars = new Map([['l1', ell()], ['s1', straight()]]);
    const r = rcShapeForMark(['l1'], (id) => bars.get(id));
    if (!r?.ok) throw new Error('refused');
    // `ell()` is the two-leg bar; `straight()` is one leg. Drawing the wrong one is visible here.
    expect(r.diagram.legs).toHaveLength(2);
    expect(r.diagram.straightM + r.diagram.bendsM).toBeCloseTo(ell().cuttingLength, 9);
  });
});
