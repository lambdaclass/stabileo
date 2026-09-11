/**
 * Objective 7 — the concrete on a sheet, its cover, and its dimensions.
 *
 * The interesting assertions are the ones that would have passed before this module existed
 * and shouldn't have: that a column drawn in a beam elevation is a rectangle and not a line,
 * that a section outline stands where the bars stand, and that a member the model cannot
 * describe is reported rather than replaced by a plausible box.
 */

import { describe, expect, it } from 'vitest';
import {
  memberCorners, memberSilhouette, memberOutlines, memberAtStation, sectionOutline,
  insetOutline, extentOf, elevationDimensions, sectionDimensions, drawnCover,
  sheetGeometryNotes, toSectionPlane, MAX_DIMENSIONED_MEMBERS,
} from '../sheet-geometry';
import { ELEVATION_X, ELEVATION_Y, project, type Pt2 } from '../drawings';
import type { MemberGeometry } from '../scene-model';

/** A 6 m beam along +x at z = 3, 300 wide × 600 deep. */
const BEAM: MemberGeometry = {
  elementId: 50, kind: 'beam',
  start: { x: 0, y: 0, z: 3 }, end: { x: 6, y: 0, z: 3 },
  width: 0.3, depth: 0.6,
};

/** A 3 m column at x = 6, 400 × 400. */
const COLUMN: MemberGeometry = {
  elementId: 60, kind: 'column',
  start: { x: 6, y: 0, z: 0 }, end: { x: 6, y: 0, z: 3 },
  width: 0.4, depth: 0.4,
};

const round = (p: Pt2) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) });

describe('a member’s concrete, as the sheet sees it', () => {
  it('gives a prism eight corners', () => {
    expect(memberCorners(BEAM)).toHaveLength(8);
  });

  /*
   * The whole reason the silhouette is a hull. Under `ELEVATION_X` a beam's outline is length
   * by depth and a COLUMN's — its axis is the sheet's up — is width by length. A formula that
   * offset the axis perpendicular to itself would draw the column as a line, and it would have
   * looked correct on every beam.
   */
  it('draws a beam as its length by its depth', () => {
    const box = extentOf(memberSilhouette(BEAM, ELEVATION_X).map((p) => project(p, ELEVATION_X)));
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(6);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(0.6);
  });

  it('draws a column as its width by its length, in the same elevation', () => {
    const box = extentOf(memberSilhouette(COLUMN, ELEVATION_X).map((p) => project(p, ELEVATION_X)));
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(0.4);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(3);
  });

  it('returns model points, so the caller projects them once', () => {
    for (const p of memberSilhouette(BEAM, ELEVATION_X)) {
      expect(p).toHaveProperty('z');
    }
  });

  it('is deterministic — two builds of one sheet carry one drawing', () => {
    expect(memberSilhouette(BEAM, ELEVATION_X)).toEqual(memberSilhouette(BEAM, ELEVATION_X));
  });
});

describe('members the sheet cannot draw are reported, not replaced', () => {
  it('outlines the members named, in the order named', () => {
    const r = memberOutlines([60, 50], [BEAM, COLUMN], ELEVATION_X);
    expect(r.outlines.map((o) => o.elementId)).toEqual([60, 50]);
    expect(r.refused).toEqual([]);
  });

  /*
   * `membersFromModel` refuses a member with no rectangle rather than inventing a square of the
   * right area. That refusal only means something if the sheet says a member is missing.
   */
  it('refuses a member whose geometry was never supplied, and names it', () => {
    const r = memberOutlines([50, 99], [BEAM], ELEVATION_X);
    expect(r.outlines.map((o) => o.elementId)).toEqual([50]);
    expect(r.refused).toEqual([{ elementId: 99, reason: 'noGeometry' }]);
  });

  it('turns the refusals into a note that names the members', () => {
    const notes = sheetGeometryNotes([{ elementId: 99, reason: 'noGeometry' }], []);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('99');
    expect(notes[0]).toContain('SIN CONTORNO');
  });

  it('says nothing when there is nothing to say', () => {
    expect(sheetGeometryNotes([], [])).toEqual([]);
  });
});

describe('the section outline stands where the bars stand', () => {
  /*
   * The defect this replaces. The store passed `±0.15 × ±0.30` centred on (0, 0), and
   * `drawSection` places every bar at its ABSOLUTE position from the projection's origin — so
   * on any member away from the origin the concrete was drawn beside the steel, not round it.
   */
  it('is the member’s real rectangle, in the absolute section basis the bars use', () => {
    const outline = sectionOutline(BEAM, 3, ELEVATION_X);
    expect(outline).not.toBeNull();
    const box = extentOf(outline!);
    // 300 wide across the sheet's third axis, 600 deep, centred on the axis at z = 3.
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(0.3);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(0.6);
    expect(+((box.max.y + box.min.y) / 2).toFixed(6)).toBe(3);
  });

  it('a beam 4 m up gives a section 4 m up, not one centred on zero', () => {
    const high = { ...BEAM, start: { x: 0, y: 0, z: 7 }, end: { x: 6, y: 0, z: 7 } };
    const box = extentOf(sectionOutline(high, 3, ELEVATION_X)!);
    expect(+((box.max.y + box.min.y) / 2).toFixed(6)).toBe(7);
  });

  it('refuses a station past the member’s end rather than extrapolating', () => {
    expect(sectionOutline(BEAM, 9, ELEVATION_X)).toBeNull();
  });

  /*
   * The case that caught the first implementation. A column's axis lies in the sheet's UP
   * direction, so a beam elevation's cut plane runs ALONG it: the cut is longitudinal and the
   * outline is a 400 × 3000 slice, not the 400 × 400 base. Translating the section frame to
   * the station returned a flat line with no height at all — and would have looked perfectly
   * correct on every beam on the sheet.
   */
  it('cuts a column lengthwise, because that is what the plane does to it', () => {
    const box = extentOf(sectionOutline(COLUMN, 6, ELEVATION_X)!);
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(0.4);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(3);
  });

  /*
   * A cut exactly at a member's end face is a cut through that member, and it gives that end's
   * real section. Excluding the ends is how a section at a support comes out empty — which is
   * the station a reviewer asks for most.
   */
  it('cuts at an end face and gives that end’s section', () => {
    const box = extentOf(sectionOutline(BEAM, 6, ELEVATION_X)!);
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(0.3);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(0.6);
  });

  /* A projection down another axis cuts the same member from the other side. */
  it('cuts across the beam’s own length in the perpendicular elevation', () => {
    const outline = sectionOutline(BEAM, 0, ELEVATION_Y);
    // The beam runs along +x and `ELEVATION_Y` measures stations along +y, so the plane runs
    // the beam's whole length: a longitudinal slice, 6000 by its 600 depth.
    const box = extentOf(outline!);
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(6);
    expect(+(box.max.y - box.min.y).toFixed(6)).toBe(0.6);
  });

  it('places the outline in the same basis `drawSection` places bars in', () => {
    // `drawSection` computes `u` as (p − origin)·(right × up) and `v` as project(p).y.
    const p = { x: 3, y: 0.15, z: 3.2 };
    expect(round(toSectionPlane(p, ELEVATION_X))).toEqual({ x: -0.15, y: 3.2 });
  });
});

describe('which member a cut passes through', () => {
  it('is the one whose concrete spans the station', () => {
    expect(memberAtStation([50, 60], [BEAM, COLUMN], 3, ELEVATION_X)?.elementId).toBe(50);
    expect(memberAtStation([50, 60], [BEAM, COLUMN], 6, ELEVATION_X)?.elementId).toBe(50);
  });

  /*
   * `null` is a real answer. Falling back to the first member would draw a section of something
   * the cut never touched and label it with the station it missed.
   */
  it('is nothing when the cut misses every member', () => {
    expect(memberAtStation([50, 60], [BEAM, COLUMN], 20, ELEVATION_X)).toBeNull();
  });
});

describe('the cover line', () => {
  const SQUARE: Pt2[] = [
    { x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 0.4 }, { x: 0, y: 0.4 },
  ];

  it('insets a rectangle by the cover on every face', () => {
    const inset = insetOutline(SQUARE, 0.025)!.map(round);
    expect(extentOf(inset)).toEqual({
      min: { x: 0.025, y: 0.025 }, max: { x: 0.375, y: 0.375 },
    });
  });

  it('insets a rectangle wound the other way exactly the same', () => {
    const inset = insetOutline([...SQUARE].reverse(), 0.025)!.map(round);
    expect(extentOf(inset)).toEqual({
      min: { x: 0.025, y: 0.025 }, max: { x: 0.375, y: 0.375 },
    });
  });

  /*
   * A rolled section inset by "shrink x and y" is not the cover line — it is a smaller
   * axis-aligned box crossing the concrete face at two corners. Offsetting each edge along its
   * own normal is right whatever the rotation.
   */
  it('follows a rotated rectangle round its own rotation', () => {
    const t = Math.PI / 6;
    const rot = (p: Pt2) => ({
      x: p.x * Math.cos(t) - p.y * Math.sin(t),
      y: p.x * Math.sin(t) + p.y * Math.cos(t),
    });
    const inset = insetOutline(SQUARE.map(rot), 0.05)!;
    // Every inset vertex sits exactly `by` in from its own corner along the diagonal, so the
    // side length shrinks by 2·by and the rotation is unchanged.
    const side = Math.hypot(inset[1].x - inset[0].x, inset[1].y - inset[0].y);
    expect(+side.toFixed(6)).toBe(0.3);
  });

  /* A 25 mm cover inside a 40 mm member has no inside, and an inverted polygon drawn as a
     cover line would show cover where there is none. */
  it('refuses to inset a member thinner than twice its cover', () => {
    const thin: Pt2[] = [
      { x: 0, y: 0 }, { x: 0.04, y: 0 }, { x: 0.04, y: 0.04 }, { x: 0, y: 0.04 },
    ];
    expect(insetOutline(thin, 0.025)).toBeNull();
  });

  it('has nothing to inset with no cover', () => {
    expect(insetOutline(SQUARE, 0)).toBeNull();
  });
});

describe('what the cover measures', () => {
  const outline = memberSilhouette(BEAM, ELEVATION_X).map((p) => project(p, ELEVATION_X));

  /*
   * Measured off the DRAWN geometry, not restated from the input. A drawing that cannot
   * disagree with its inputs has not checked anything.
   */
  it('is the clear gap from the face to the bar’s surface, not to its centreline', () => {
    const cov = drawnCover(outline, 50, [{
      diameterMm: 20, ownerElementIds: [50],
      // Centreline 40 mm below the top face at z = 3.3 → clear cover 40 − 10 = 30 mm.
      polyline: [{ x: 0.1, y: 0, z: 3.26 }, { x: 5.9, y: 0, z: 3.26 }],
    }], ELEVATION_X);
    expect(cov.top).toBeCloseTo(0.03, 6);
  });

  /*
   * A continuous bar runs on into the next span, and its cover THERE is that member's
   * dimension. Sampling the whole polyline would report the neighbouring member's face.
   */
  it('ignores the part of a continuous bar that has left this member', () => {
    const cov = drawnCover(outline, 50, [{
      diameterMm: 20, ownerElementIds: [50],
      polyline: [{ x: 3, y: 0, z: 3.26 }, { x: 12, y: 0, z: 9 }],
    }], ELEVATION_X);
    expect(cov.top).toBeCloseTo(0.03, 6);
  });

  it('reports nothing on a face no bar reaches', () => {
    expect(drawnCover(outline, 50, [], ELEVATION_X)).toEqual({ top: null, bottom: null });
  });
});

describe('the dimensions a sheet carries', () => {
  const outlines = [
    { elementId: 50, points: memberSilhouette(BEAM, ELEVATION_X) },
    { elementId: 60, points: memberSilhouette(COLUMN, ELEVATION_X) },
  ];

  it('measures each member’s length across the sheet and its depth up it', () => {
    const { dimensions } = elevationDimensions({
      layer: 'D', outlines, bars: [], projection: ELEVATION_X,
    });
    const beam = dimensions.filter((d) => d.label === '6000' || d.label === '600');
    expect(beam.find((d) => d.axis === 'x')?.label).toBe('6000');
    expect(beam.find((d) => d.axis === 'y')?.label).toBe('600');
  });

  /*
   * The axis exists because both writers assumed horizontal. A depth emitted as an `x`
   * dimension is a zero-length line with the label stacked on it.
   */
  it('marks a depth as a `y` dimension, never as a degenerate `x` one', () => {
    const { dimensions } = elevationDimensions({
      layer: 'D', outlines: [outlines[0]], bars: [], projection: ELEVATION_X,
    });
    for (const d of dimensions) {
      if (d.axis === 'y') expect(d.from.x).toBe(d.to.x);
      else expect(d.from.y).toBe(d.to.y);
    }
  });

  it('names the specified cover beside the measured one when they disagree', () => {
    const { dimensions } = elevationDimensions({
      layer: 'D',
      outlines: [outlines[0]],
      bars: [{
        diameterMm: 20, ownerElementIds: [50],
        polyline: [{ x: 0.1, y: 0, z: 3.26 }, { x: 5.9, y: 0, z: 3.26 }],
      }],
      projection: ELEVATION_X,
      coverOf: () => 0.025,
    });
    // Measured 30, specified 25 — a sheet that printed only one of them would be either
    // repeating its input or hiding a disagreement.
    expect(dimensions.some((d) => d.label === 'r 30 (esp. 25)')).toBe(true);
  });

  /* Both faces, so nothing in the sheet can quietly disagree while the other face agrees. */
  it('states the cover once, on both faces, when measurement and design agree', () => {
    const { dimensions } = elevationDimensions({
      layer: 'D',
      outlines: [outlines[0]],
      bars: [
        // Faces at z = 2.7 and 3.3. Surfaces 25 mm inside each.
        {
          diameterMm: 20, ownerElementIds: [50],
          polyline: [{ x: 0.1, y: 0, z: 3.265 }, { x: 5.9, y: 0, z: 3.265 }],
        },
        {
          diameterMm: 20, ownerElementIds: [50],
          polyline: [{ x: 0.1, y: 0, z: 2.735 }, { x: 5.9, y: 0, z: 2.735 }],
        },
      ],
      projection: ELEVATION_X,
      coverOf: () => 0.025,
    });
    expect(dimensions.filter((d) => d.label === 'r 25')).toHaveLength(2);
    expect(dimensions.some((d) => d.label.includes('esp.'))).toBe(false);
  });

  /*
   * Bounded like the conflict notes, and for the same reason: past a dozen the witness lines
   * overlap the drawing under them. The OUTLINES are never bounded, and the remainder is named
   * rather than dropped.
   */
  it('dimensions at most a dozen members and reports the rest', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      elementId: i, points: memberSilhouette({ ...BEAM, elementId: i }, ELEVATION_X),
    }));
    const r = elevationDimensions({
      layer: 'D', outlines: many, bars: [], projection: ELEVATION_X,
    });
    expect(r.undimensioned).toHaveLength(15 - MAX_DIMENSIONED_MEMBERS);
    expect(sheetGeometryNotes([], r.undimensioned)[0]).toContain('ACOTACIÓN PARCIAL');
  });
});

describe('a section’s own dimensions', () => {
  const outline = sectionOutline(BEAM, 3, ELEVATION_X)!;

  it('states b and h, and draws the specified cover as a line', () => {
    const { dimensions, coverLine } = sectionDimensions({
      layer: 'D', outline, cover: 0.025,
    });
    expect(dimensions.find((d) => d.axis === 'x')?.label).toBe('300');
    expect(dimensions.find((d) => d.axis === 'y')?.label).toBe('600');
    expect(dimensions.some((d) => d.label === 'r 25')).toBe(true);
    expect(coverLine).not.toBeNull();
    const box = extentOf(coverLine!);
    expect(+(box.max.x - box.min.x).toFixed(6)).toBe(0.25);
  });

  it('draws no cover line when the design never stated one', () => {
    const { coverLine, dimensions } = sectionDimensions({ layer: 'D', outline });
    expect(coverLine).toBeNull();
    expect(dimensions.some((d) => d.label.startsWith('r '))).toBe(false);
  });
});
