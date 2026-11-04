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
import { arcThroughThree, arcPoints, chordError, segmentsForTolerance, buildArc, arcMemberLocalY, migrateArcLocalAxes } from '../curved-member';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';

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

  it('rounds an odd count up to even when a node stands at the middle point, so the arc reaches it', () => {
    const crown = { x: 0, y: 5, z: 0 };
    let nextNode = 100, nextEl = 0;
    const links: Array<[number, number]> = [];
    const tags: number[] = [];
    buildArc({ ...HALF, segments: 7 }, {
      addNode: () => ++nextNode,
      addElement: (i, j) => { links.push([i, j]); return ++nextEl; },
      tag: (_id, tag) => tags.push(tag.spec.segments),
      nodeAt: (x, y, z) => (Math.hypot(x - crown.x, y - crown.y, z - crown.z) <= 1e-6 ? 2 : null),
    }, 1, 7, 9);
    expect(links).toHaveLength(8);
    expect(new Set(links.flat()).has(2)).toBe(true);
    // The tag records the count the members were built with, so re-meshing gives the same arc.
    expect(new Set(tags)).toEqual(new Set([8]));
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

/*
 * #418 (SP-15). Every member of an arc keeps the same section orientation relative to the curve.
 * The default rule alone turned the near-vertical members at an arch's springings by 90° (it
 * switches to a global-X reference within 2.56° of vertical), so outside the X–Z plane Iy and Iz
 * swapped on them.
 */
describe('the section orientation along the arc (#418)', () => {
  /** A vertical semicircular arch of radius 5 rotated `deg` about Z. */
  const arch = (deg: number) => {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    const p = (x: number, z: number) => P(x * c, x * s, z);
    return { start: p(-5, 0), through: p(0, 5), end: p(5, 0), normal: P(-s, c, 0) };
  };
  const axes = (pi: { x: number; y: number; z: number }, pj: { x: number; y: number; z: number }, ly?: { x: number; y: number; z: number }) =>
    computeLocalAxes3D({ id: 1, ...pi }, { id: 2, ...pj }, ly);

  for (const deg of [0, 30, 90, 137]) {
    it(`gives every member of an arch rotated ${deg}° local y along the plane normal`, () => {
      const a = arch(deg);
      const pts = arcPoints({ ...a, segments: 40 });
      for (let i = 0; i < 40; i++) {
        const ly = arcMemberLocalY(a, pts[i], pts[i + 1])!;
        const { ey } = axes(pts[i], pts[i + 1], ly);
        const along = ey[0] * a.normal.x + ey[1] * a.normal.y + ey[2] * a.normal.z;
        expect(Math.abs(along)).toBeGreaterThan(1 - 1e-12);
        expect(Math.sign(along)).toBe(1);
      }
    });
  }

  it('gives no local y to a member moved off the arc', () => {
    const a = arch(90);
    expect(arcMemberLocalY(a, P(0, -5, 0), P(1, -4.9, 0.5))).toBeNull();
    // In the plane but away from the circle.
    expect(arcMemberLocalY(a, P(0, 10, 0), P(0, 10, 3))).toBeNull();
    // Moved out of the plane entirely, still vertical.
    expect(arcMemberLocalY(a, P(10, 0, 0), P(10, 0, 3))).toBeNull();
  });

  it('does not migrate an X–Z arch, whose springing axes were only reversed', () => {
    const a = arch(0);
    const spec = { start: a.start, through: a.through, end: a.end, segments: 40 };
    const pts = arcPoints(spec);
    const nodes = new Map(pts.map((p, i) => [i + 1, p]));
    const els = new Map(pts.slice(0, -1).map((_, i) => [i + 1, { nodeI: i + 1, nodeJ: i + 2, arc: { spec } } as { nodeI: number; nodeJ: number; arc: { spec: typeof spec; axes?: 1 }; localYx?: number }]));
    expect(migrateArcLocalAxes(els, nodes)).toBe(0);
    expect([...els.values()].every((e) => e.localYx === undefined && e.arc.axes === 1)).toBe(true);
  });

  it('leaves a plan curve on the axes the default rule gives it', () => {
    const pts = arcPoints({ ...HALF, start: P(-5, 0, 3), through: P(0, 5, 3), end: P(5, 0, 3), segments: 12 });
    for (let i = 0; i < 12; i++) {
      const ly = arcMemberLocalY({ start: P(-5, 0, 3), through: P(0, 5, 3), end: P(5, 0, 3) }, pts[i], pts[i + 1])!;
      const d = axes(pts[i], pts[i + 1]).ez, e = axes(pts[i], pts[i + 1], ly).ez;
      expect(d[0] * e[0] + d[1] * e[1] + d[2] * e[2]).toBeGreaterThan(1 - 1e-12);
    }
  });

  it('sets local y on every member it builds', () => {
    const a = arch(90);
    const set = new Map<number, { x: number; y: number; z: number }>();
    let nextNode = 100, nextEl = 1;
    const made = buildArc({ ...a, segments: 8 }, {
      addNode: () => nextNode++,
      addElement: () => nextEl++,
      tag: () => {},
      setLocalY: (id, v) => set.set(id, v),
    }, 1);
    // 8 segments: no member is within 2.56° of vertical, so automatic axes are already right.
    expect(made.length).toBe(8);
    expect(set.size).toBe(0);
    set.clear(); nextNode = 100; nextEl = 1;
    const made40 = buildArc({ ...a, segments: 40 }, {
      addNode: () => nextNode++,
      addElement: () => nextEl++,
      tag: () => {},
      setLocalY: (id, v) => set.set(id, v),
    }, 1);
    // 40 segments: the two springing members are near vertical and get the plane normal.
    expect([...set.keys()]).toEqual([made40[0], made40[39]]);
    for (const v of set.values()) {
      expect(v.x * a.normal.x + v.y * a.normal.y + v.z * a.normal.z).toBeCloseTo(1, 12);
    }
  });

  it('sets nothing on a flat X–Y arc, which a flat model solves embedded in X–Z', () => {
    const set = new Map<number, unknown>();
    let k = 1;
    buildArc({ ...HALF, segments: 40 }, { addNode: () => 100 + k, addElement: () => k++, tag: () => {}, setLocalY: (id, v) => set.set(id, v) }, 1);
    expect(set.size).toBe(0);
  });

  it('migrates an arch saved without them, and leaves plan curves and stated axes alone', () => {
    const a = arch(90);
    const pts = arcPoints({ ...a, segments: 40 });
    const nodes = new Map(pts.map((p, i) => [i + 1, p]));
    const spec = { start: a.start, through: a.through, end: a.end, segments: 40 };
    const planSpecShape = spec;
    type M = { nodeI: number; nodeJ: number; arc?: { spec: typeof planSpecShape; axes?: 1 }; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number };
    const elements = new Map<number, M>(pts.slice(0, -1).map((_, i) => [i + 1, { nodeI: i + 1, nodeJ: i + 2, arc: { spec } }]));
    // One member whose orientation the engineer stated: kept.
    elements.get(1)!.rollAngle = 15;
    const changed = migrateArcLocalAxes(elements, nodes);
    // Only the near-vertical members at the springings had the wrong axes (first and last), and
    // the first one states its own roll.
    expect(changed).toBe(1);
    expect(elements.get(1)!.localYx).toBeUndefined();
    expect(elements.get(40)!.localYx).toBeDefined();
    expect(migrateArcLocalAxes(elements, nodes)).toBe(0);
    // Once migrated, a member set back to automatic axes stays so (undo, redo, reopening).
    const last = elements.get(40)!;
    last.localYx = last.localYy = last.localYz = undefined;
    expect(migrateArcLocalAxes(elements, nodes)).toBe(0);
    expect(last.localYx).toBeUndefined();
    // A member with a load in local axes is left as it is, so its load keeps its direction.
    const loaded = new Map<number, M>(pts.slice(0, -1).map((_, i) => [i + 1, { nodeI: i + 1, nodeJ: i + 2, arc: { spec } }]));
    expect(migrateArcLocalAxes(loaded, nodes, (id) => id === 40)).toBe(1);
    expect(loaded.get(40)!.localYx).toBeUndefined();
    expect(loaded.get(1)!.localYx).toBeDefined();
    // So is one with an end release (it is about a local axis).
    const released = new Map<number, M & { releaseI?: Record<string, unknown> }>(pts.slice(0, -1).map((_, i) => [i + 1, { nodeI: i + 1, nodeJ: i + 2, arc: { spec } }]));
    released.get(40)!.releaseI = { my: true };
    expect(migrateArcLocalAxes(released, nodes)).toBe(1);
    expect(released.get(40)!.localYx).toBeUndefined();
    // Members the arc tool built carry the mark and are not migrated.
    const built = new Map<number, M & { arc: { spec: typeof spec; axes?: 1 } }>([[1, { nodeI: 40, nodeJ: 41, arc: { spec, axes: 1 } }]]);
    expect(migrateArcLocalAxes(built, nodes)).toBe(0);

    const plan = arcPoints({ start: P(-5, 0, 3), through: P(0, 5, 3), end: P(5, 0, 3), segments: 12 });
    const planSpec = { start: P(-5, 0, 3), through: P(0, 5, 3), end: P(5, 0, 3), segments: 12 };
    const planNodes = new Map(plan.map((p, i) => [i + 1, p]));
    const planEls = new Map<number, M>(plan.slice(0, -1).map((_, i) => [i + 1, { nodeI: i + 1, nodeJ: i + 2, arc: { spec: planSpec } }]));
    expect(migrateArcLocalAxes(planEls, planNodes)).toBe(0);
  });
});
