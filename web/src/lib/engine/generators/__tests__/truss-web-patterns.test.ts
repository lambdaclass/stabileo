import { describe, it, expect } from 'vitest';
import {
  generateTruss, DEFAULT_TRUSS_PARAMS, WEB_PATTERNS, subdivisionApplies,
  type TrussParams, type Topology,
} from '../truss-topology';

const P = (o: Partial<TrussParams>): TrussParams => ({ ...DEFAULT_TRUSS_PARAMS, ...o });

/** Diagonals as `{outerZ, innerZ}` — the chord heights at the outer and inner end of each. */
function diagonals(t: Topology, span: number) {
  const mid = span / 2;
  return t.members.filter((m) => m.role === 'diagonal').map((m) => {
    const a = t.nodes[m.a], b = t.nodes[m.b];
    // "Outer" is the end further from midspan. That is the frame the Pratt/Howe distinction
    // is stated in, and it works on both halves without special-casing which one we are on.
    const [outer, inner] = Math.abs(a.x - mid) > Math.abs(b.x - mid) ? [a, b] : [b, a];
    return { outerZ: outer.z, innerZ: inner.z, outerX: outer.x, innerX: inner.x };
  });
}

describe('Pratt and Howe lean the way their names say', () => {
  const span = 12;

  /*
   * The property, derived rather than remembered — see the `WEB_PATTERNS` header.
   *
   * Cut a panel in the left half; the left free body carries the upward reaction, so the
   * diagonal's vertical component on it must be downward, which happens when the diagonal is
   * in tension AND runs from the top chord down toward midspan. Pratt is the tension web, so
   * a Pratt diagonal DESCENDS toward the centre.
   */
  it('every Pratt diagonal descends toward midspan', () => {
    const t = generateTruss(P({ kind: 'pratt', spanM: span, depthM: 1.4, panelsPerHalf: 4, webPattern: 'pratt' }));
    const ds = diagonals(t, span);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(d.innerZ).toBeLessThan(d.outerZ);
  });

  it('every Howe diagonal rises toward midspan', () => {
    const t = generateTruss(P({ kind: 'pratt', spanM: span, depthM: 1.4, panelsPerHalf: 4, webPattern: 'howe' }));
    for (const d of diagonals(t, span)) expect(d.innerZ).toBeGreaterThan(d.outerZ);
  });

  /*
   * This is the test the old suite was missing. It compared the two patterns to each other
   * and checked both were symmetric — both true of a swapped pair — so the generator built
   * every Pratt truss as a Howe and nothing failed.
   */
  it('the two are exact opposites, not merely different', () => {
    const pratt = diagonals(generateTruss(P({ kind: 'pratt', spanM: span, panelsPerHalf: 4, webPattern: 'pratt' })), span);
    const howe = diagonals(generateTruss(P({ kind: 'pratt', spanM: span, panelsPerHalf: 4, webPattern: 'howe' })), span);
    expect(pratt).toHaveLength(howe.length);
    for (let i = 0; i < pratt.length; i++) {
      expect(pratt[i].innerZ).toBeCloseTo(howe[i].outerZ, 9);
      expect(pratt[i].outerZ).toBeCloseTo(howe[i].innerZ, 9);
    }
  });

  it('holds on a pitched truss too, where the chords are not level', () => {
    const t = generateTruss(P({ kind: 'trapezoidal', spanM: span, riseM: 1.5, endDepthM: 0.6, panelsPerHalf: 4, webPattern: 'pratt' }));
    for (const d of diagonals(t, span)) expect(d.innerZ).toBeLessThan(d.outerZ);
  });
});

describe('Warren', () => {
  const span = 12;
  const warren = () => generateTruss(P({ kind: 'pratt', spanM: span, depthM: 1.4, panelsPerHalf: 4, webPattern: 'warren' }));

  it('is offered', () => {
    expect(WEB_PATTERNS).toContain('warren');
  });

  /*
   * No verticals is the point of the pattern — it is what makes it lighter and its panel
   * points fewer. The two end posts are the exception, and they are load path, not pattern:
   * without them the bearing has nothing carrying the reaction up into the top chord.
   */
  it('has no interior posts — only the two at the bearings', () => {
    const t = warren();
    const posts = t.members.filter((m) => m.role === 'post');
    expect(posts).toHaveLength(2);
    const xs = posts.map((m) => t.nodes[m.a].x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 9);
    expect(xs[1]).toBeCloseTo(span, 9);
  });

  /*
   * Measured in GLOBAL x, not relative to midspan.
   *
   * Pratt and Howe are defined by which way a diagonal leans as it moves INWARD, so
   * `diagonals()` frames them that way and both halves read alike. A Warren has no inward
   * direction to speak of — it alternates on the panel index straight across the span — and
   * the midspan-relative frame flips sign at the centre, which reads as two neighbours
   * leaning the same way when they do not. My first version of this test used that frame and
   * failed on a correctly-built truss.
   */
  it('alternates every diagonal against its neighbour', () => {
    const t = warren();
    const ds = t.members.filter((m) => m.role === 'diagonal').map((m) => {
      const a = t.nodes[m.a], b = t.nodes[m.b];
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      return { x: l.x, lean: Math.sign(r.z - l.z) };
    }).sort((p, q) => p.x - q.x);
    expect(ds.length).toBeGreaterThan(3);
    for (let i = 1; i < ds.length; i++) expect(ds[i].lean).toBe(-ds[i - 1].lean);
  });

  it('every panel point is reached, so the web is connected', () => {
    const t = warren();
    const touched = new Set<number>();
    for (const m of t.members) { touched.add(m.a); touched.add(m.b); }
    expect(touched.size).toBe(t.nodes.length);
  });
});

describe('subdividing the diagonals', () => {
  const base = { kind: 'pratt' as const, spanM: 24, depthM: 2, panelsPerHalf: 4 };

  it('is only applicable where it means something', () => {
    expect(subdivisionApplies({ webPattern: 'pratt', panelsPerHalf: 4 })).toBe(true);
    // One panel per half: the new panel point would land on the existing midspan one.
    expect(subdivisionApplies({ webPattern: 'pratt', panelsPerHalf: 1 })).toBe(false);
  });

  it('is off by default', () => {
    expect(DEFAULT_TRUSS_PARAMS.subdivideDiagonals).toBe(false);
  });

  it('adds a post and a sub-diagonal per panel, and two nodes', () => {
    const plain = generateTruss(P({ ...base, subdivideDiagonals: false }));
    const sub = generateTruss(P({ ...base, subdivideDiagonals: true }));
    const panels = base.panelsPerHalf * 2;
    expect(sub.nodes.length - plain.nodes.length).toBe(2 * panels);
    const posts = (t: Topology) => t.members.filter((m) => m.role === 'post').length;
    expect(posts(sub) - posts(plain)).toBe(panels);
  });

  /*
   * The property that makes the difference between a subdivided truss and a picture of one:
   * the new nodes must be ON the members they subdivide, i.e. the main diagonal and the
   * bottom chord are SPLIT there. A member laid across another without a shared node
   * transfers nothing at the crossing, so the model would look subdivided and behave exactly
   * as it did before.
   */
  it('splits the members it subdivides instead of crossing them', () => {
    const sub = generateTruss(P({ ...base, subdivideDiagonals: true }));
    const degree = new Map<number, number>();
    for (const m of sub.members) {
      degree.set(m.a, (degree.get(m.a) ?? 0) + 1);
      degree.set(m.b, (degree.get(m.b) ?? 0) + 1);
    }
    // Every node carries at least two members. A degree-1 node is a member dangling in space,
    // and a degree-0 node is a point nothing reaches — both are what crossing would produce.
    for (let i = 0; i < sub.nodes.length; i++) {
      expect(degree.get(i) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves the truss alone when the pattern makes it inapplicable', () => {
    const off = generateTruss(P({ ...base, panelsPerHalf: 1, subdivideDiagonals: true }));
    const plain = generateTruss(P({ ...base, panelsPerHalf: 1, subdivideDiagonals: false }));
    expect(off.nodes.length).toBe(plain.nodes.length);
    expect(off.members.length).toBe(plain.members.length);
  });
});
