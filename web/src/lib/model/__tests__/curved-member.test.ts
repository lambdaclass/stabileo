/*
 * A curved member has to be a CURVE, and it has to be honest about not being
 * one.
 *
 * The solver has straight frame elements and no curved beam, so an arc is
 * materialised as a chain of them — which is what every commercial package
 * does, and which is only defensible if two things hold: the points sit on the
 * real arc rather than on chords between sampled ends, and the error that
 * remains is stated in the units the model is drawn in.
 */
import { describe, it, expect } from 'vitest';
import { arcThroughThree, arcPoints, chordError, segmentsForTolerance, buildArc } from '../curved-member';

const P = (x: number, y: number, z = 0) => ({ x, y, z });

/** A half-circle of radius 5 in the XY plane, from (−5,0) up over (0,5) to (5,0). */
const HALF = { start: P(-5, 0), through: P(0, 5), end: P(5, 0) };

describe('the arc through three points', () => {
  it('finds the circle a draughtsman would', () => {
    const g = arcThroughThree(HALF.start, HALF.through, HALF.end)!;
    expect(g.radius).toBeCloseTo(5, 9);
    expect(g.centre.x).toBeCloseTo(0, 9);
    expect(g.centre.y).toBeCloseTo(0, 9);
    expect(g.sweep).toBeCloseTo(Math.PI, 9);
    expect(g.length).toBeCloseTo(Math.PI * 5, 9);
  });

  it('goes the way round that passes through the middle point', () => {
    /* The same two ends, with the middle point BELOW: the same circle, and the
       other half of it. Without this the arc would be ambiguous, which is the
       reason three points are asked for instead of two and a radius. */
    const up = arcThroughThree(P(-5, 0), P(0, 5), P(5, 0))!;
    const down = arcThroughThree(P(-5, 0), P(0, -5), P(5, 0))!;
    expect(up.radius).toBeCloseTo(down.radius, 9);
    expect(up.sweep).toBeCloseTo(Math.PI, 6);
    expect(down.sweep).toBeCloseTo(Math.PI, 6);
    expect(arcPoints({ ...HALF, segments: 2 })[1].y, 'through the top').toBeCloseTo(5, 6);
    expect(arcPoints({ start: P(-5, 0), through: P(0, -5), end: P(5, 0), segments: 2 })[1].y,
      'through the bottom').toBeCloseTo(-5, 6);
  });

  it('refuses three points in a line, because that is a straight member', () => {
    expect(arcThroughThree(P(0, 0), P(1, 0), P(2, 0))).toBeNull();
  });

  it('works out of the XY plane — an arch is not always drawn flat', () => {
    const g = arcThroughThree(P(0, 0, -5), P(0, 5, 0), P(0, 0, 5))!;
    expect(g.radius).toBeCloseTo(5, 9);
    expect(g.sweep).toBeCloseTo(Math.PI, 9);
  });
});

describe('the points the members are built on', () => {
  it('puts every one of them ON the arc, not on a chord between the ends', () => {
    const pts = arcPoints({ ...HALF, segments: 8 });
    expect(pts.length).toBe(9);
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y), 'every point is at the radius').toBeCloseTo(5, 9);
    }
  });

  it('lands exactly on the ends, so a member drawn to a node reaches it', () => {
    const pts = arcPoints({ ...HALF, segments: 7 });
    expect(pts[0]).toEqual(HALF.start);
    expect(pts[pts.length - 1]).toEqual(HALF.end);
  });

  it('spaces them evenly along the arc', () => {
    const pts = arcPoints({ ...HALF, segments: 6 });
    const d: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      d.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    }
    for (const x of d) expect(x).toBeCloseTo(d[0], 9);
  });

  it('draws a straight line when the three points are collinear', () => {
    const pts = arcPoints({ start: P(0, 0), through: P(1, 0), end: P(4, 0), segments: 4 });
    expect(pts.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('how wrong the chain still is, stated in metres', () => {
  it('measures the sagitta of one segment', () => {
    const g = arcThroughThree(HALF.start, HALF.through, HALF.end)!;
    /* Half a circle in 2 segments: each spans 90°, and the chord falls
       5·(1 − cos 45°) ≈ 1.464 m inside the arc. */
    expect(chordError(g, 2)).toBeCloseTo(5 * (1 - Math.cos(Math.PI / 4)), 9);
  });

  it('falls as the square of the segment count, which is why 12 is usually plenty', () => {
    const g = arcThroughThree(HALF.start, HALF.through, HALF.end)!;
    expect(chordError(g, 12) / chordError(g, 24)).toBeCloseTo(4, 1);
  });

  it('answers how many segments a tolerance needs', () => {
    const g = arcThroughThree(HALF.start, HALF.through, HALF.end)!;
    const n = segmentsForTolerance(g, 0.005);
    expect(chordError(g, n)).toBeLessThanOrEqual(0.005);
    expect(chordError(g, n - 1), 'and not one more than it needs').toBeGreaterThan(0.005);
  });

  it('stops at 64 rather than meshing a member into a thousand', () => {
    const g = arcThroughThree(HALF.start, HALF.through, HALF.end)!;
    expect(segmentsForTolerance(g, 1e-12)).toBe(64);
  });
});

describe('materialising the arc into members', () => {
  it('builds one member per segment, joined end to end', () => {
    let nextNode = 0, nextEl = 0;
    const nodes: Array<{ x: number; y: number; z: number }> = [];
    const links: Array<[number, number]> = [];
    const tags = new Map<number, unknown>();
    const made = buildArc({ ...HALF, segments: 5 }, {
      addNode: (x, y, z) => { nodes.push({ x, y, z }); return ++nextNode; },
      addElement: (i, j) => { links.push([i, j]); return ++nextEl; },
      tag: (id, t) => tags.set(id, t),
    }, 1);

    expect(made.length).toBe(5);
    expect(nodes.length, 'six points, six nodes').toBe(6);
    for (let i = 1; i < links.length; i++) {
      expect(links[i][0], 'each member starts where the last ended').toBe(links[i - 1][1]);
    }
  });

  it('reuses the nodes the curve springs from, rather than doubling them', () => {
    /* Two nodes in the same place analyse as two nodes: an arch that reuses
       neither is a structure cut where it looks joined, with no symptom. */
    let nextNode = 100, nextEl = 0;
    const links: Array<[number, number]> = [];
    const made: number[] = [];
    buildArc({ ...HALF, segments: 3 }, {
      addNode: () => ++nextNode,
      addElement: (i: number, j: number) => { links.push([i, j]); return ++nextEl; },
      tag: (id: number) => made.push(id),
    }, 1, 7, 9);
    expect(links[0][0], 'starts on the node it was told to').toBe(7);
    expect(links[links.length - 1][1], 'and ends on the other').toBe(9);
  });

  it('tags every member with the arc, so the curve stays one thing', () => {
    let n = 0, e = 0;
    const tags = new Map<number, { arcId: number }>();
    buildArc({ ...HALF, segments: 4 }, {
      addNode: () => ++n, addElement: () => ++e,
      tag: (id: number, t: { arcId: number }) => tags.set(id, t),
    }, 42);
    expect([...tags.values()].every((t) => t.arcId === 42)).toBe(true);
    expect(tags.size).toBe(4);
  });
});

describe('the crown of the arch, which is where a duplicate node appears', () => {
  it('reuses a node that is already at a generated point', () => {
    /*
     * The arc passes THROUGH the middle point by construction, so an even
     * segment count puts a generated point exactly on the node picked to
     * define it. Two nodes in one place analyse as two nodes: the arch would
     * be cut at its crown, the solve would succeed, and nothing would say so.
     */
    /* By distance, the way the caller does it: `-0` and a float a hair off
       are the same point, and a string key says they are not. */
    const crown = { x: 0, y: 5, z: 0 };
    let nextNode = 100, nextEl = 0;
    const links: Array<[number, number]> = [];
    buildArc({ ...HALF, segments: 8 }, {
      addNode: () => ++nextNode,
      addElement: (i, j) => { links.push([i, j]); return ++nextEl; },
      tag: () => {},
      nodeAt: (x, y, z) => (Math.hypot(x - crown.x, y - crown.y, z - crown.z) <= 1e-6 ? 2 : null),
    }, 1, 7, 9);

    const used = new Set(links.flat());
    expect(used.has(2), 'the crown node that already existed is the one used').toBe(true);
    /* Nine points: two ends given, one crown reused, six created. */
    expect(nextNode - 100).toBe(6);
  });

  it('creates its own points where nothing is there', () => {
    let nextNode = 0, nextEl = 0;
    buildArc({ ...HALF, segments: 8 }, {
      addNode: () => ++nextNode,
      addElement: () => ++nextEl,
      tag: () => {},
      nodeAt: () => null,
    }, 1, 7, 9);
    expect(nextNode, 'seven intermediate points, all new').toBe(7);
  });
});
