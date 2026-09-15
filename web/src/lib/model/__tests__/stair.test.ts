/**
 * The stair flight: geometry, the step weight, and the conversion of a slab.
 *
 * The numbers here are checked by hand against the way a stair is dimensioned
 * on paper, because the two things most likely to be wrong in this module are
 * arithmetic a reader would never see: one tread too many in the run, and the
 * step weight spread over the wrong area.
 */
import { describe, it, expect } from 'vitest';
import {
  flightGeometry, treadCount, treadForRun, blondel, checkStairSpec,
  stepWeightPerInclinedArea, planToInclined, flightCorners, runDirection,
  tiltQuadToFlight, quadRunLength, buildFlight,
  BLONDEL_MIN, BLONDEL_MAX, type StairSpec, type Vec3,
} from '../stair';

/* A single straight flight of a 2.80 m storey. The waist is 25 cm because the
   flight spans its whole 5.05 m slope in one go — a thinner one is what the
   slenderness check below exists to catch, and it is checked separately. */
const SPEC: StairSpec = { riser: 0.175, tread: 0.28, steps: 16, waist: 0.25 };

describe('flight geometry', () => {
  it('has one tread fewer than it has risers', () => {
    // The last riser arrives at the landing, which is not a tread of this
    // flight. Sixteen risers, fifteen treads — get this wrong and the run is
    // 28 cm long, which is a whole step into the room above.
    expect(treadCount(16)).toBe(15);
    const g = flightGeometry(SPEC);
    expect(g.rise).toBeCloseTo(16 * 0.175, 12);     // 2.80 m — a standard storey
    expect(g.run).toBeCloseTo(15 * 0.28, 12);       // 4.20 m
  });

  it('reports the slope the waist actually spans, not the run', () => {
    const g = flightGeometry(SPEC);
    expect(g.slope).toBeCloseTo(Math.hypot(2.8, 4.2), 12);
    expect(g.slope).toBeGreaterThan(g.run);
    expect(g.angleDeg).toBeCloseTo((Math.atan2(2.8, 4.2) * 180) / Math.PI, 10);
    expect(g.angleDeg).toBeCloseTo(33.69, 1);
  });

  it('derives the tread a fixed run implies', () => {
    expect(treadForRun(4.2, 16)).toBeCloseTo(0.28, 12);
    // A flight of one riser has no tread, and must not divide by zero.
    expect(treadForRun(4.2, 1)).toBe(0);
  });
});

describe('comfort checks', () => {
  it('passes a stair that is comfortable to climb', () => {
    const b = blondel(SPEC);
    expect(b).toBeCloseTo(0.63, 12);
    expect(b).toBeGreaterThanOrEqual(BLONDEL_MIN);
    expect(b).toBeLessThanOrEqual(BLONDEL_MAX);
    expect(checkStairSpec(SPEC).warnings).toEqual([]);
    expect(checkStairSpec(SPEC).errors).toEqual([]);
  });

  it('warns rather than refuses when the stride is off', () => {
    // 20 cm riser and 22 cm tread: 2r + t = 0.62, inside Blondel, and still a
    // ladder. Both single-dimension rules have to fire on their own.
    const steep: StairSpec = { ...SPEC, riser: 0.20, tread: 0.22 };
    const r = checkStairSpec(steep);
    expect(r.errors).toEqual([]);
    const keys = r.warnings.map((w) => w.key);
    expect(keys).toContain('stair.warnRiser');
    expect(keys).toContain('stair.warnTread');
  });

  it('flags a waist too slender for its own span', () => {
    const thin: StairSpec = { ...SPEC, waist: 0.06 };
    expect(checkStairSpec(thin).warnings.map((w) => w.key)).toContain('stair.warnWaist');
  });

  it('refuses a geometry that cannot exist, and says which part', () => {
    const bad = checkStairSpec({ riser: 0, tread: -1, steps: 1, waist: 0 });
    expect(bad.errors.map((e) => e.key).sort()).toEqual(
      ['stair.errRiser', 'stair.errSteps', 'stair.errTread', 'stair.errWaist'],
    );
    // With the geometry impossible, no comfort opinion is offered on it.
    expect(bad.warnings).toEqual([]);
  });
});

describe('loads', () => {
  it('spreads the steps over the inclined area, not the plan', () => {
    const g = flightGeometry(SPEC);
    const q = stepWeightPerInclinedArea(SPEC, 25); // reinforced concrete, kN/m³
    // Mean step height is riser/2 over the plan; on the slope it is that
    // times cos α. 25 · 0.0875 · cos(33.69°) ≈ 1.82 kN/m².
    expect(q).toBeCloseTo(25 * 0.0875 * Math.cos(g.angleRad), 12);
    expect(q).toBeCloseTo(1.820, 3);
    // And it is genuinely smaller than the plan figure — the bug this guards
    // is applying the plan value to an inclined element, which over-loads it.
    expect(q).toBeLessThan(25 * 0.0875);
  });

  it('turns a code live load given per m² of plan into one on the slope', () => {
    const g = flightGeometry(SPEC);
    // Resultants must agree: q_plan over the plan area equals q_incl over the
    // inclined area, which is the whole content of the cosine.
    const planArea = g.run * 1.2;
    const inclArea = g.slope * 1.2;
    const qPlan = 3.0;
    expect(planToInclined(qPlan, g.angleRad) * inclArea).toBeCloseTo(qPlan * planArea, 10);
  });

  it('leaves the waist out — the solver already weighs it', () => {
    // Doubling the waist must not change the step load by one newton.
    expect(stepWeightPerInclinedArea({ ...SPEC, waist: 0.30 }, 25))
      .toBeCloseTo(stepWeightPerInclinedArea(SPEC, 25), 12);
  });
});

describe('corners from a bottom edge', () => {
  const a: Vec3 = { x: 0, y: 0, z: 0 };
  const b: Vec3 = { x: 0, y: 1.2, z: 0 };

  it('runs horizontally, perpendicular to the edge, and rises the full height', () => {
    const c = flightCorners(a, b, SPEC)!;
    const g = flightGeometry(SPEC);
    expect(c[0]).toEqual(a);
    expect(c[1]).toEqual(b);
    // Edge along +Y, rotated +90° about Z → −X.
    expect(c[2].x).toBeCloseTo(-g.run, 12);
    expect(c[2].y).toBeCloseTo(1.2, 12);
    expect(c[2].z).toBeCloseTo(g.rise, 12);
    expect(c[3].z).toBeCloseTo(g.rise, 12);
    // The width is preserved: it is the same stair at the top.
    expect(Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)).toBeCloseTo(1.2, 12);
  });

  it('flips to the other side on request', () => {
    const c = flightCorners(a, b, SPEC, true)!;
    expect(c[2].x).toBeCloseTo(flightGeometry(SPEC).run, 12);
    expect(runDirection(a, b, true)!.x).toBeCloseTo(1, 12);
    expect(runDirection(a, b, true)!.y).toBeCloseTo(0, 12);
    expect(runDirection(a, b, false)!.x).toBeCloseTo(-1, 12);
    expect(runDirection(a, b, false)!.y).toBeCloseTo(0, 12);
  });

  it('refuses an edge with no horizontal length', () => {
    // Two nodes one above the other define no direction to run in.
    expect(flightCorners(a, { x: 0, y: 0, z: 3 }, SPEC)).toBeNull();
    expect(runDirection(a, { x: 0, y: 0, z: 3 })).toBeNull();
  });
});

describe('converting a slab that is already drawn', () => {
  const slab: [Vec3, Vec3, Vec3, Vec3] = [
    { x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: 0 },
    { x: 4.2, y: 1.2, z: 0 }, { x: 4.2, y: 0, z: 0 },
  ];

  it('keeps the footprint and raises only the far edge', () => {
    const tilted = tiltQuadToFlight(slab, 0, 2.8);
    expect(tilted[0].z).toBe(0);
    expect(tilted[1].z).toBe(0);
    expect(tilted[2].z).toBeCloseTo(2.8, 12);
    expect(tilted[3].z).toBeCloseTo(2.8, 12);
    // Plan positions untouched — this is a tilt, not a re-proportioning.
    for (let i = 0; i < 4; i++) {
      expect(tilted[i].x).toBe(slab[i].x);
      expect(tilted[i].y).toBe(slab[i].y);
    }
    // And the original is not mutated.
    expect(slab[2].z).toBe(0);
  });

  it('raises the correct pair for any of the four edges', () => {
    for (const e of [0, 1, 2, 3] as const) {
      const t = tiltQuadToFlight(slab, e, 1);
      const raised = t.map((c, i) => (c.z > 0 ? i : -1)).filter((i) => i >= 0);
      expect(raised).toEqual([(e + 2) % 4, (e + 3) % 4].sort((x, y) => x - y));
    }
  });

  it('measures the run the slab already has, so the tread is derived', () => {
    expect(quadRunLength(slab, 0)).toBeCloseTo(4.2, 12);
    expect(treadForRun(quadRunLength(slab, 0), 16)).toBeCloseTo(0.28, 12);
  });
});

describe('building the flight into a model', () => {
  function host() {
    const nodes: Vec3[] = [];
    const quads: Array<[number, number, number, number]> = [];
    return {
      nodes, quads,
      findNode(x: number, y: number, z: number) {
        const i = nodes.findIndex((n) => Math.hypot(n.x - x, n.y - y, n.z - z) < 1e-9);
        return i >= 0 ? i + 1 : null;
      },
      addNode(x: number, y: number, z: number) { nodes.push({ x, y, z }); return nodes.length; },
      addQuad(n: [number, number, number, number]) { quads.push(n); return quads.length; },
    };
  }

  it('meshes along the run rather than laying one quad over the whole flight', () => {
    const h = host();
    const corners = flightCorners({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: 0 }, SPEC)!;
    const built = buildFlight(h, corners, 8);
    expect(built.quadIds.length).toBe(8);
    expect(h.nodes.length).toBe(18);           // 9 stations × 2 sides
    expect(built.nodeIds.length).toBe(18);
    // The strips climb monotonically: nothing doubles back.
    const zs = h.nodes.map((n) => n.z);
    expect(Math.min(...zs)).toBeCloseTo(0, 12);
    expect(Math.max(...zs)).toBeCloseTo(flightGeometry(SPEC).rise, 12);
  });

  it('welds onto nodes that are already there instead of stacking new ones', () => {
    // The case this exists for: a flight built off an existing landing edge.
    // Two coincident nodes analyse as a cut, and nothing in the viewport says so.
    const h = host();
    const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 1.2, z: 0 };
    h.addNode(a.x, a.y, a.z);
    h.addNode(b.x, b.y, b.z);
    const built = buildFlight(h, flightCorners(a, b, SPEC)!, 4);
    expect(built.bottomEdge).toEqual([1, 2]);   // reused, not re-created
    expect(h.nodes.length).toBe(10);            // 5 stations × 2, none duplicated
  });

  it('reports the edges, which is what a landing or a support is attached to', () => {
    const h = host();
    const corners = flightCorners({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: 0 }, SPEC)!;
    const built = buildFlight(h, corners, 3);
    for (const id of built.bottomEdge) expect(h.nodes[id - 1].z).toBeCloseTo(0, 12);
    for (const id of built.topEdge) expect(h.nodes[id - 1].z).toBeCloseTo(flightGeometry(SPEC).rise, 12);
  });

  it('never builds fewer than one quad, whatever it is asked for', () => {
    const h = host();
    const corners = flightCorners({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: 0 }, SPEC)!;
    expect(buildFlight(h, corners, 0).quadIds.length).toBe(1);
  });
});
