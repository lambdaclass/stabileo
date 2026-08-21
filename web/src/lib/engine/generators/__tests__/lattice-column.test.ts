/**
 * Lattice column geometry.
 *
 * The counts are the interesting part — `4·divisions + 1` — because they are what a user
 * reads off the preview before pressing Generate, and a preview that disagrees with what
 * lands in the model is worse than no preview.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LATTICE_COLUMN_PARAMS, generateLatticeColumn,
  validateLatticeColumnParams, type LatticeColumnParams,
} from '../lattice-column';

const P = (over: Partial<LatticeColumnParams> = {}): LatticeColumnParams =>
  ({ ...DEFAULT_LATTICE_COLUMN_PARAMS, ...over });

describe('generateLatticeColumn — counts', () => {
  it.each([1, 2, 6, 12])('with %i divisions emits 4n+1 members', (divisions) => {
    const t = generateLatticeColumn(P({ divisions }));
    expect(t.counts.chord).toBe(2 * divisions);
    expect(t.counts.post).toBe(divisions + 1);
    expect(t.counts.diagonal).toBe(divisions);
    expect(t.members).toHaveLength(4 * divisions + 1);
    expect(t.nodes).toHaveLength(2 * (divisions + 1));
  });

  it('tallies exactly what it emitted', () => {
    const t = generateLatticeColumn(P());
    expect(Object.values(t.counts).reduce((s, n) => s + n, 0)).toBe(t.members.length);
  });
});

describe('generateLatticeColumn — geometry', () => {
  it('is exactly as tall and as wide as asked', () => {
    const t = generateLatticeColumn(P({ heightM: 8, widthM: 0.6 }));
    const zs = t.nodes.map((n) => n.z);
    const xs = t.nodes.map((n) => n.x);
    expect(Math.min(...zs)).toBeCloseTo(0, 12);
    expect(Math.max(...zs)).toBeCloseTo(8, 12);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 12);
  });

  it('divides the height evenly', () => {
    const divisions = 6;
    const t = generateLatticeColumn(P({ heightM: 8, divisions }));
    // Read the left chord's own nodes rather than a rounded set of distinct elevations:
    // rounding to compare would inject an error larger than the one being measured.
    const levels = t.nodes.slice(0, divisions + 1).map((n) => n.z);
    expect(levels).toHaveLength(divisions + 1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeCloseTo(8 / divisions, 9);
    }
    // And the right chord sits at exactly the same elevations.
    for (let i = 0; i <= divisions; i++) {
      expect(t.nodes[divisions + 1 + i].z).toBe(levels[i]);
    }
  });

  it('stands in the XZ plane at y = 0, straddling x = 0', () => {
    const t = generateLatticeColumn(P({ widthM: 0.6 }));
    for (const n of t.nodes) expect(n.y).toBe(0);
    expect(t.nodes.reduce((s, n) => s + n.x, 0)).toBeCloseTo(0, 12);
  });

  it('has no zero-length member and no orphan node', () => {
    const t = generateLatticeColumn(P());
    const used = new Set<number>();
    for (const m of t.members) {
      used.add(m.a); used.add(m.b);
      const a = t.nodes[m.a];
      const b = t.nodes[m.b];
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1e-6);
    }
    expect(used.size).toBe(t.nodes.length);
  });

  it('reports a total length equal to the sum of its members', () => {
    const t = generateLatticeColumn(P());
    const sum = t.members.reduce((s, m) => {
      const a = t.nodes[m.a];
      const b = t.nodes[m.b];
      return s + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }, 0);
    expect(t.totalLengthM).toBeCloseTo(sum, 9);
  });

  it('places a batten at every panel point, ends included', () => {
    const divisions = 6;
    const t = generateLatticeColumn(P({ heightM: 8, divisions }));
    const postLevels = t.members
      .filter((m) => m.role === 'post')
      .map((m) => Math.round(t.nodes[m.a].z * 1e9) / 1e9)
      .sort((a, b) => a - b);
    expect(postLevels).toHaveLength(divisions + 1);
    expect(postLevels[0]).toBeCloseTo(0, 9);
    expect(postLevels[postLevels.length - 1]).toBeCloseTo(8, 9);
  });
});

describe('generateLatticeColumn — lacing', () => {
  it('zig-zags by default, alternating panel to panel', () => {
    const t = generateLatticeColumn(P({ divisions: 6, lacing: 'zigzag' }));
    const leans = t.members
      .filter((m) => m.role === 'diagonal')
      .map((m) => Math.sign(t.nodes[m.b].x - t.nodes[m.a].x));
    for (let i = 1; i < leans.length; i++) expect(leans[i]).toBe(-leans[i - 1]);
    expect(t.assumptions).toContain('generator.assume.lacingZigzag');
  });

  it('leans every diagonal the same way when asked to', () => {
    const t = generateLatticeColumn(P({ divisions: 6, lacing: 'parallel' }));
    const leans = new Set(t.members
      .filter((m) => m.role === 'diagonal')
      .map((m) => Math.sign(t.nodes[m.b].x - t.nodes[m.a].x)));
    expect(leans.size).toBe(1);
    expect(t.assumptions).toContain('generator.assume.lacingParallel');
  });
});

describe('generateLatticeColumn — supports', () => {
  it('lands both chords on the ground, pinned by default', () => {
    const t = generateLatticeColumn(P());
    expect(t.supports).toHaveLength(2);
    for (const s of t.supports) {
      expect(t.nodes[s.node].z).toBeCloseTo(0, 12);
      expect(s.type).toBe('pinned');
    }
    expect(t.assumptions).toContain('generator.assume.baseChordsPinned');
  });

  it('fixes them when the base is declared fixed, and says so', () => {
    const t = generateLatticeColumn(P({ fixedBase: true }));
    for (const s of t.supports) expect(s.type).toBe('fixed');
    expect(t.assumptions).toContain('generator.assume.baseFixed');
  });
});

describe('node ordering — chord by chord, bottom to top', () => {
  /**
   * Asserted by POSITION rather than through an index helper.
   *
   * An earlier version exported `latticeTopNodes(divisions)` and this test called it, which
   * made the test agree with the helper rather than with the geometry — both could drift
   * together. The ordering is still a documented property of the generator, so it is checked
   * against where the nodes actually are.
   */
  it.each([1, 2, 6, 12])('puts each chord head last in its own run, for %i divisions', (divisions) => {
    const t = generateLatticeColumn(P({ heightM: 8, divisions }));
    const left = t.nodes.slice(0, divisions + 1);
    const right = t.nodes.slice(divisions + 1, 2 * (divisions + 1));

    expect(left[divisions].z).toBeCloseTo(8, 12);
    expect(right[divisions].z).toBeCloseTo(8, 12);
    expect(left[divisions].x).not.toBeCloseTo(right[divisions].x, 6);
    // And each run climbs, so "last" really is the head.
    for (const run of [left, right]) {
      for (let i = 1; i < run.length; i++) expect(run[i].z).toBeGreaterThan(run[i - 1].z);
    }
  });

  it('appends the cap after both chords, on the axis', () => {
    const t = generateLatticeColumn(P({ divisions: 4, heightM: 8, capTop: true }));
    const cap = t.nodes[t.nodes.length - 1];
    expect(cap.x).toBeCloseTo(0, 12);
    expect(cap.z).toBeCloseTo(8, 12);
  });
});

describe('validateLatticeColumnParams', () => {
  it('accepts the defaults', () => {
    expect(validateLatticeColumnParams(DEFAULT_LATTICE_COLUMN_PARAMS)).toEqual([]);
  });

  it('refuses a column with no height, no width or no divisions', () => {
    expect(validateLatticeColumnParams(P({ heightM: 0 })).length).toBe(1);
    expect(validateLatticeColumnParams(P({ widthM: 0 })).length).toBe(1);
    expect(validateLatticeColumnParams(P({ divisions: 0 })).length).toBe(1);
    expect(validateLatticeColumnParams(P({ divisions: 2.5 })).length).toBe(1);
  });

  it('stops the generator rather than producing something degenerate', () => {
    expect(() => generateLatticeColumn(P({ widthM: 0 }))).toThrow(/invalid parameters/);
  });
});
