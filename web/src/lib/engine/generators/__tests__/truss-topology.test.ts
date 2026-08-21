/**
 * Truss geometry, checked against the shape it claims to be.
 *
 * The assertions are properties rather than transcribed coordinates: symmetry about
 * midspan, the arc passing through its own springings and crown, the slope agreeing with
 * the rise and the run, counts following from the panel count. A test that pinned literal
 * node positions would pass just as happily on a truss that is silently asymmetric.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRUSS_PARAMS, TRUSS_KINDS, ARCH_CURVES, MAX_PANELS_PER_HALF,
  generateTruss, validateTrussParams,
  type Topology, type TrussKind, type TrussParams,
} from '../truss-topology';

const P = (over: Partial<TrussParams> = {}): TrussParams => ({ ...DEFAULT_TRUSS_PARAMS, ...over });

/** Every member's length, so a zero-length member cannot hide inside a total. */
function lengths(t: Topology): number[] {
  return t.members.map((m) => {
    const a = t.nodes[m.a];
    const b = t.nodes[m.b];
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  });
}

/** The set of member endpoint coordinate pairs, rounded, for symmetry comparisons. */
function memberKeys(t: Topology, mapX: (x: number) => number): Set<string> {
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return new Set(t.members.map((m) => {
    const a = t.nodes[m.a];
    const b = t.nodes[m.b];
    const pa: [number, number] = [r(mapX(a.x)), r(a.z)];
    const pb: [number, number] = [r(mapX(b.x)), r(b.z)];
    // Order-independent, so a member stored i→j matches its mirror stored j→i.
    const [p, q] = pa[0] < pb[0] || (pa[0] === pb[0] && pa[1] <= pb[1]) ? [pa, pb] : [pb, pa];
    return `${m.role}|${p[0]},${p[1]}|${q[0]},${q[1]}`;
  }));
}

describe('generateTruss — structural sanity, every kind', () => {
  it.each(TRUSS_KINDS)('%s produces a connected, non-degenerate truss', (kind) => {
    const t = generateTruss(P({ kind }));
    expect(t.nodes.length).toBeGreaterThan(1);
    expect(t.members.length).toBeGreaterThan(0);

    // No zero-length members. One would be a coincident node pair the solver would
    // report as a singular system, which is an unhelpful way to learn about a bug here.
    for (const L of lengths(t)) expect(L).toBeGreaterThan(1e-6);

    // Every node is used by at least one member: an orphan node is a floating DOF.
    const used = new Set<number>();
    for (const m of t.members) { used.add(m.a); used.add(m.b); }
    expect(used.size).toBe(t.nodes.length);

    // Every member index is in range.
    for (const m of t.members) {
      expect(m.a).toBeGreaterThanOrEqual(0);
      expect(m.b).toBeLessThan(t.nodes.length);
      expect(m.a).not.toBe(m.b);
    }

    // The total length is the sum of the parts, not an independently drifting number.
    expect(t.totalLengthM).toBeCloseTo(lengths(t).reduce((s, x) => s + x, 0), 9);
  });

  it.each(TRUSS_KINDS)('%s spans exactly what was asked for', (kind) => {
    const t = generateTruss(P({ kind, spanM: 14 }));
    const xs = t.nodes.map((n) => n.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(14, 9);
  });

  it.each(TRUSS_KINDS)('%s is simply supported at the two ends', (kind) => {
    const t = generateTruss(P({ kind, spanM: 14 }));
    expect(t.supports).toHaveLength(2);
    const sx = t.supports.map((s) => t.nodes[s.node].x).sort((a, b) => a - b);
    expect(sx[0]).toBeCloseTo(0, 9);
    expect(sx[1]).toBeCloseTo(14, 9);
    // One pinned and one roller — two pins would lock the thermal expansion of a truss
    // against itself and report axial force that a real bearing would not carry.
    expect(t.supports.filter((s) => s.type === 'pinned')).toHaveLength(1);
    expect(t.supports.filter((s) => s.type === 'rollerX')).toHaveLength(1);
  });

  it('generates every kind in the XZ plane at y = 0', () => {
    for (const kind of TRUSS_KINDS) {
      for (const n of generateTruss(P({ kind })).nodes) expect(n.y).toBe(0);
    }
  });
});

describe('generateTruss — member counts follow from the panel count', () => {
  /**
   * A latticed truss with `n` panels per half has `2n` panels, so:
   *   chords    2 · 2n     (top and bottom)
   *   posts     2n + 1     (one per station)
   *   diagonals 2n         (one per panel)
   */
  it.each([
    ['trapezoidal', 3], ['trapezoidal', 5], ['trapezoidal', 8],
    ['parallelChord', 4], ['pratt', 5], ['arch', 6],
  ] as Array<[TrussKind, number]>)('%s with %i panels per half', (kind, panelsPerHalf) => {
    const t = generateTruss(P({ kind, panelsPerHalf }));
    const panels = panelsPerHalf * 2;
    expect(t.counts.chord).toBe(2 * panels);
    expect(t.counts.post).toBe(panels + 1);
    expect(t.counts.diagonal).toBe(panels);
    expect(t.members).toHaveLength(4 * panels + 1);
  });

  it('drops the end post when the chords meet at the bearing', () => {
    // endDepth = 0 puts the two chords at the same point at each support, so the post
    // there would be a zero-length member.
    const t = generateTruss(P({ kind: 'trapezoidal', endDepthM: 0, riseM: 1.2, panelsPerHalf: 4 }));
    expect(t.counts.post).toBe(8 + 1 - 2);
    for (const L of lengths(t)) expect(L).toBeGreaterThan(1e-6);
  });

  it('a rolled portal is two rafters and nothing else', () => {
    const t = generateTruss(P({ kind: 'rolledPortal', spanM: 10, riseM: 1.5 }));
    expect(t.counts.rafter).toBe(2);
    expect(t.counts.chord).toBe(0);
    expect(t.counts.diagonal).toBe(0);
    expect(t.members).toHaveLength(2);
    expect(t.nodes).toHaveLength(3);
  });
});

describe('generateTruss — symmetry', () => {
  it.each(['trapezoidal', 'parallelChord', 'pratt', 'arch'] as TrussKind[])(
    '%s is its own mirror image about midspan',
    (kind) => {
      const span = 12;
      const t = generateTruss(P({ kind, spanM: span, panelsPerHalf: 5 }));
      const asIs = memberKeys(t, (x) => x);
      const mirrored = memberKeys(t, (x) => span - x);
      expect([...mirrored].sort()).toEqual([...asIs].sort());
    },
  );

  it('the web pattern flips with `webPattern` and stays symmetric either way', () => {
    const span = 12;
    const pratt = generateTruss(P({ spanM: span, webPattern: 'pratt' }));
    const howe = generateTruss(P({ spanM: span, webPattern: 'howe' }));
    // Same counts, different members: the diagonals lean the other way.
    expect(howe.counts).toEqual(pratt.counts);
    expect([...memberKeys(howe, (x) => x)].sort())
      .not.toEqual([...memberKeys(pratt, (x) => x)].sort());
    // Both remain symmetric.
    expect([...memberKeys(howe, (x) => span - x)].sort())
      .toEqual([...memberKeys(howe, (x) => x)].sort());
  });
});

describe('generateTruss — the shapes are the shapes they are named after', () => {
  it('a Pratt truss has parallel, level chords at the stated depth', () => {
    const t = generateTruss(P({ kind: 'pratt', depthM: 1.4, panelsPerHalf: 4 }));
    const zs = new Set(t.nodes.map((n) => Math.round(n.z * 1e9) / 1e9));
    expect([...zs].sort((a, b) => a - b)).toEqual([0, 1.4]);
    expect(t.slopePercent).toBeNull();
  });

  it('a parallel-chord truss keeps a constant depth while it climbs', () => {
    const t = generateTruss(P({ kind: 'parallelChord', depthM: 0.9, riseM: 1.1, panelsPerHalf: 5 }));
    const half = t.nodes.length / 2;
    for (let i = 0; i < half; i++) {
      expect(t.nodes[half + i].z - t.nodes[i].z).toBeCloseTo(0.9, 9);
      expect(t.nodes[half + i].x).toBeCloseTo(t.nodes[i].x, 9);
    }
    // And it does climb: the ridge is `riseM` above the eaves.
    expect(Math.max(...t.nodes.map((n) => n.z)) - t.nodes[half].z).toBeCloseTo(1.1, 9);
  });

  it('a trapezoid has a straight bottom chord and a pitched top one', () => {
    const t = generateTruss(P({ kind: 'trapezoidal', endDepthM: 0.6, riseM: 1, panelsPerHalf: 5 }));
    const half = t.nodes.length / 2;
    for (let i = 0; i < half; i++) expect(t.nodes[i].z).toBe(0);
    expect(t.nodes[half].z).toBeCloseTo(0.6, 9);
    expect(Math.max(...t.nodes.map((n) => n.z))).toBeCloseTo(1.6, 9);
  });

  it('the plateau flattens the ridge over exactly the length asked for', () => {
    const span = 10;
    const plateauM = 3;
    const t = generateTruss(P({ kind: 'trapezoidal', spanM: span, plateauM, riseM: 1, panelsPerHalf: 10 }));
    const half = t.nodes.length / 2;
    const top = t.nodes.slice(half);
    const peak = Math.max(...top.map((n) => n.z));
    const flat = top.filter((n) => Math.abs(n.z - peak) < 1e-9);
    const width = Math.max(...flat.map((n) => n.x)) - Math.min(...flat.map((n) => n.x));
    expect(width).toBeCloseTo(plateauM, 6);
    // With the ridge flattened the approach has to be STEEPER for the same rise: the
    // climb is spent over a shorter run, so the first top node off the bearing already
    // sits higher than it would on a pointed truss of the same span and rise.
    const pointed = generateTruss(P({ kind: 'trapezoidal', spanM: span, plateauM: 0, riseM: 1, panelsPerHalf: 10 }));
    expect(t.nodes[half + 1].z).toBeGreaterThan(pointed.nodes[half + 1].z);
  });

  it('the arch passes through its springings and its crown, on a circle', () => {
    const span = 12;
    const rise = 2;
    const endDepth = 0.6;
    const t = generateTruss(P({ kind: 'arch', spanM: span, riseM: rise, endDepthM: endDepth, panelsPerHalf: 6 }));
    const half = t.nodes.length / 2;
    const top = t.nodes.slice(half);
    expect(top[0].z).toBeCloseTo(endDepth, 9);
    expect(top[top.length - 1].z).toBeCloseTo(endDepth, 9);
    expect(Math.max(...top.map((n) => n.z))).toBeCloseTo(endDepth + rise, 9);

    // Every top node sits on the circle of radius R centred below the crown. Checked
    // against the closed form rather than against the generator's own arithmetic.
    const R = (span * span / 4 + rise * rise) / (2 * rise);
    for (const n of top) {
      const dx = n.x - span / 2;
      const dz = n.z - endDepth + (R - rise);
      expect(Math.hypot(dx, dz)).toBeCloseTo(R, 6);
    }
  });

  it.each(ARCH_CURVES)('the %s arch curve produces a distinct shape', (archCurve) => {
    const t = generateTruss(P({ kind: 'arch', archCurve, riseM: 2, panelsPerHalf: 6 }));
    const zs = t.nodes.map((n) => n.z);
    // Whatever the variant, it must actually curve — a flat set of elevations would mean
    // the curve type was ignored.
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.5);
  });

  it('the concave arch hangs its bottom chord below the bearings', () => {
    const t = generateTruss(P({ kind: 'arch', archCurve: 'concave', riseM: 2, panelsPerHalf: 6 }));
    expect(Math.min(...t.nodes.map((n) => n.z))).toBeLessThan(-0.5);
  });
});

describe('generateTruss — slope is derived, never asserted', () => {
  it('reports rise over half-span as a percentage', () => {
    expect(generateTruss(P({ spanM: 10, riseM: 1 })).slopePercent).toBeCloseTo(20, 9);
    expect(generateTruss(P({ spanM: 20, riseM: 1 })).slopePercent).toBeCloseTo(10, 9);
    expect(generateTruss(P({ spanM: 10, riseM: 2 })).slopePercent).toBeCloseTo(40, 9);
  });

  it('a monopitch measures its slope over the whole span, not half of it', () => {
    expect(generateTruss(P({ spanM: 10, riseM: 1, halfTruss: true })).slopePercent).toBeCloseTo(10, 9);
  });

  it('with a plateau, reports the slope the rafters actually have', () => {
    // The plateau flattens the central 3 m, so the 1 m rise is spent over 5 − 1.5 = 3.5 m
    // of run: 28.57 %, not the 20 % a plain rise-over-half-span would claim.
    const t = generateTruss(P({ kind: 'trapezoidal', spanM: 10, riseM: 1, plateauM: 3, panelsPerHalf: 10 }));
    expect(t.slopePercent).toBeCloseTo((1 / 3.5) * 100, 9);

    // And that is the number the purlins roll to: the steepest chord segment IS the
    // reported slope, so the model and the preview cannot disagree.
    const half = t.nodes.length / 2;
    const top = t.nodes.slice(half).sort((a, b) => a.x - b.x);
    let steepest = 0;
    for (let i = 1; i < top.length; i++) {
      const run = top[i].x - top[i - 1].x;
      if (run < 1e-9) continue;
      steepest = Math.max(steepest, ((top[i].z - top[i - 1].z) / run) * 100);
    }
    expect(steepest).toBeCloseTo(t.slopePercent!, 6);
  });

  it('reports no slope where the top chord is level', () => {
    expect(generateTruss(P({ kind: 'pratt' })).slopePercent).toBeNull();
    expect(generateTruss(P({ kind: 'trapezoidal', riseM: 0, endDepthM: 1 })).slopePercent).toBeNull();
  });

  it('reports no slope for an arch, because a curve does not have one', () => {
    // A curved chord's slope varies from the springing to the crown, so a single percentage
    // is not a property it has. The preview would show it as fact.
    expect(generateTruss(P({ kind: 'arch', riseM: 2 })).slopePercent).toBeNull();
    expect(generateTruss(P({ kind: 'arch', riseM: 2, archCurve: 'parallelChord' })).slopePercent).toBeNull();
  });
});

describe('generateTruss — the half truss', () => {
  it('climbs across the whole span with no mirror', () => {
    const t = generateTruss(P({ halfTruss: true, spanM: 10, riseM: 1, endDepthM: 0.6, panelsPerHalf: 5 }));
    const half = t.nodes.length / 2;
    const top = t.nodes.slice(half);
    // Monotonically rising: a mirrored shape would come back down.
    for (let i = 1; i < top.length; i++) expect(top[i].z).toBeGreaterThan(top[i - 1].z);
    expect(top[0].z).toBeCloseTo(0.6, 9);
    expect(top[top.length - 1].z).toBeCloseTo(1.6, 9);
  });

  it('reads `panelsPerHalf` as the whole panel count, since there are no halves', () => {
    const t = generateTruss(P({ halfTruss: true, panelsPerHalf: 5 }));
    expect(t.counts.chord).toBe(2 * 5);
    expect(t.counts.diagonal).toBe(5);
    expect(t.counts.post).toBe(6);
  });

  it('leans every diagonal the same way', () => {
    const t = generateTruss(P({ halfTruss: true, panelsPerHalf: 5 }));
    const rises = t.members
      .filter((m) => m.role === 'diagonal')
      .map((m) => Math.sign((t.nodes[m.b].z - t.nodes[m.a].z) * (t.nodes[m.b].x - t.nodes[m.a].x)));
    expect(new Set(rises).size).toBe(1);
  });
});

describe('generateTruss — element types are a stated choice', () => {
  it('makes chords continuous and the web pinned by default', () => {
    const t = generateTruss(P());
    for (const m of t.members) {
      expect(m.type).toBe(m.role === 'chord' ? 'frame' : 'truss');
    }
    expect(t.assumptions).toContain('generator.assume.chordsContinuous');
    expect(t.assumptions).toContain('generator.assume.webPinned');
  });

  it('honours the opposite choice, and says so', () => {
    const t = generateTruss(P({ chordContinuity: 'truss', webContinuity: 'frame' }));
    for (const m of t.members) {
      expect(m.type).toBe(m.role === 'chord' ? 'truss' : 'frame');
    }
    expect(t.assumptions).toContain('generator.assume.chordsPinned');
    expect(t.assumptions).toContain('generator.assume.webContinuous');
  });
});

describe('validateTrussParams — reports everything at once', () => {
  it('accepts the defaults', () => {
    expect(validateTrussParams(DEFAULT_TRUSS_PARAMS)).toEqual([]);
  });

  it('collects several problems rather than stopping at the first', () => {
    const problems = validateTrussParams(P({ spanM: -1, panelsPerHalf: 0, riseM: -2 }));
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.map((x) => x.field)).toContain('spanM');
    expect(problems.map((x) => x.field)).toContain('panelsPerHalf');
    expect(problems.map((x) => x.field)).toContain('riseM');
  });

  it('refuses an arch with no rise, which would be a straight line of infinite radius', () => {
    expect(validateTrussParams(P({ kind: 'arch', riseM: 0 })).map((x) => x.key))
      .toContain('generator.problem.archNeedsRise');
  });

  it('refuses a truss with no depth anywhere', () => {
    expect(validateTrussParams(P({ kind: 'trapezoidal', endDepthM: 0, riseM: 0 })).map((x) => x.key))
      .toContain('generator.problem.trussHasNoDepth');
  });

  it('refuses a plateau at least as long as the span', () => {
    expect(validateTrussParams(P({ kind: 'trapezoidal', spanM: 10, plateauM: 10 })).map((x) => x.key))
      .toContain('generator.problem.plateauExceedsSpan');
  });

  it('rejects NaN wherever it rejects a negative', () => {
    // `x < 0` is false for NaN, so a NaN depth or rise would pass a `< 0` check and sail
    // into the geometry. The guards are `!(x >= 0)` precisely so they catch it.
    const problems = validateTrussParams(P({ endDepthM: NaN, riseM: NaN, plateauM: NaN }));
    expect(problems.map((x) => x.key)).toContain('generator.problem.negative');
    expect(problems.map((x) => x.field))
      .toEqual(expect.arrayContaining(['endDepthM', 'riseM', 'plateauM']));
  });

  it('refuses a panel count the tab could not survive building', () => {
    expect(validateTrussParams(P({ panelsPerHalf: MAX_PANELS_PER_HALF + 1 })).map((x) => x.key))
      .toContain('generator.problem.tooManyPanels');
    expect(validateTrussParams(P({ panelsPerHalf: MAX_PANELS_PER_HALF }))).toEqual([]);
  });

  it('stops the generator rather than producing a degenerate truss', () => {
    expect(() => generateTruss(P({ spanM: 0 }))).toThrow(/invalid parameters/);
    expect(() => generateTruss(P({ panelsPerHalf: 0 }))).toThrow(/invalid parameters/);
  });
});

describe('generateTruss — every role it counts is a role it placed', () => {
  it.each(TRUSS_KINDS)('%s tallies exactly the members it emitted', (kind) => {
    const t = generateTruss(P({ kind }));
    const total = Object.values(t.counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(t.members.length);
  });
});
