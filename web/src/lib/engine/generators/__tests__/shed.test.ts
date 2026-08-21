/**
 * The shed, checked as an assembly rather than as a shape.
 *
 * The shape is already tested — the truss and the column have their own suites. What is new
 * here is the JOINING: that a truss bearing and a column head become one node, that turning
 * a feature on adds exactly the members it should and touches nothing else, and that the
 * footprint the preview reports is the footprint the building has.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SHED_PARAMS, MAX_SHED_FRAMES, generateShed, validateShedParams, type ShedParams } from '../shed';
import type { MemberRole } from '../member-roles';

const P = (over: Partial<ShedParams> = {}): ShedParams => ({
  ...DEFAULT_SHED_PARAMS,
  ...over,
  column: { ...DEFAULT_SHED_PARAMS.column, ...over.column },
  truss: { ...DEFAULT_SHED_PARAMS.truss, ...over.truss },
});

/** Every node referenced by a member, so an orphan cannot hide. */
function usedNodes(t: ReturnType<typeof generateShed>): Set<number> {
  const s = new Set<number>();
  for (const m of t.members) { s.add(m.a); s.add(m.b); }
  return s;
}

describe('generateShed — the bare frame', () => {
  const bare = generateShed(P({
    columnKind: 'solid', roof: false, purlins: false, longitudinalBeams: false,
    spanM: 10, bayM: 5, frames: 6, clearHeightM: 6,
  }));

  it('is two columns per frame and nothing else', () => {
    expect(bare.counts.column).toBe(12);
    expect(bare.members).toHaveLength(12);
    expect(bare.nodes).toHaveLength(24);
  });

  it('reports the footprint the bays actually cover', () => {
    // Five bays between six frames, ten metres across: 250 m².
    expect(bare.areaM2).toBeCloseTo(250, 9);
    expect(bare.frames).toBe(6);
  });

  it('stands every column on its own support', () => {
    expect(bare.supports).toHaveLength(12);
    for (const s of bare.supports) expect(bare.nodes[s.node].z).toBeCloseTo(0, 9);
  });

  it('spaces the frames along Y and the columns along X', () => {
    const ys = [...new Set(bare.nodes.map((n) => Math.round(n.y * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(ys).toEqual([0, 5, 10, 15, 20, 25]);
    const xs = [...new Set(bare.nodes.map((n) => Math.round(n.x * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 10]);
  });

  it('says the columns are solid', () => {
    expect(bare.assumptions).toContain('generator.assume.solidColumns');
    expect(bare.assumptions).toContain('generator.assume.noRoofStructure');
  });
});

describe('generateShed — features add what they say and nothing else', () => {
  const base = P({ columnKind: 'solid', roof: false, purlins: false, longitudinalBeams: false });
  const bare = generateShed(base);

  it('ties the heads bay by bay on both sides, and across each frame when there is no truss', () => {
    const withBeams = generateShed({ ...base, longitudinalBeams: true });
    // Five bays x two sides, plus one head beam per frame — the head beam is what makes
    // the two columns a portal when no truss spans between them.
    expect(withBeams.counts.beam).toBe(10 + 6);
    expect(withBeams.members).toHaveLength(bare.members.length + 16);
    // No new nodes: every beam lands on a head that already exists.
    expect(withBeams.nodes).toHaveLength(bare.nodes.length);
    expect(withBeams.assumptions).toContain('generator.assume.headBeamMakesPortal');
  });

  it('drops the head beam once a truss spans between the heads', () => {
    const roofed = generateShed({ ...base, roof: true, longitudinalBeams: true });
    // Only the eave beams remain: the truss bottom chord is the transverse tie, and a
    // beam beside it would be a second load path drawn over the first.
    expect(roofed.counts.beam).toBe(10);
    expect(roofed.assumptions).not.toContain('generator.assume.headBeamMakesPortal');
  });

  it('runs every eave beam along Y at the clear height', () => {
    const withBeams = generateShed({ ...base, roof: true, longitudinalBeams: true });
    for (const m of withBeams.members.filter((x) => x.role === 'beam')) {
      const a = withBeams.nodes[m.a];
      const b = withBeams.nodes[m.b];
      expect(a.z).toBeCloseTo(6, 9);
      expect(b.z).toBeCloseTo(6, 9);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(Math.abs(b.y - a.y)).toBeCloseTo(5, 9);
    }
  });

  it('the roof adds a truss per frame and no free-floating nodes', () => {
    const roofed = generateShed({ ...base, roof: true });
    expect(roofed.counts.chord).toBeGreaterThan(0);
    expect(roofed.counts.diagonal).toBeGreaterThan(0);
    expect(usedNodes(roofed).size).toBe(roofed.nodes.length);
  });

  it('purlins need a roof to sit on', () => {
    const noRoof = generateShed({ ...base, roof: false, purlins: true });
    expect(noRoof.counts.purlin).toBe(0);
  });
});

describe('generateShed — the joint is a joint, not two nodes at one place', () => {
  it('merges each truss bearing into the column head it lands on', () => {
    const shed = generateShed(P({ columnKind: 'solid', roof: true, purlins: false, frames: 2 }));
    // The head carries the column, the truss bottom chord, and — with a pitched truss —
    // the end post. Three members at one point means one node, not three.
    const head = shed.nodes.findIndex((n) =>
      Math.abs(n.x) < 1e-9 && Math.abs(n.y) < 1e-9 && Math.abs(n.z - 6) < 1e-9);
    expect(head).toBeGreaterThanOrEqual(0);
    const touching = shed.members.filter((m) => m.a === head || m.b === head);
    expect(touching.length).toBeGreaterThanOrEqual(3);
    expect(touching.some((m) => m.role === 'column')).toBe(true);
    expect(touching.some((m) => m.role === 'chord')).toBe(true);
  });

  it('leaves no two nodes at the same place', () => {
    const shed = generateShed(P({ roof: true, purlins: true, longitudinalBeams: true }));
    const keys = shed.nodes.map((n) =>
      `${Math.round(n.x * 1e4)},${Math.round(n.y * 1e4)},${Math.round(n.z * 1e4)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaves no duplicated member and no zero-length member', () => {
    const shed = generateShed(P({ roof: true, purlins: true, longitudinalBeams: true }));
    const keys = shed.members.map((m) => (m.a < m.b ? `${m.a}-${m.b}` : `${m.b}-${m.a}`));
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of shed.members) {
      const a = shed.nodes[m.a];
      const b = shed.nodes[m.b];
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeGreaterThan(1e-6);
    }
  });

  it('gives a latticed column a cap so the truss has somewhere to land', () => {
    const shed = generateShed(P({ columnKind: 'lattice', roof: true, purlins: false, frames: 2 }));
    const cap = shed.nodes.findIndex((n) =>
      Math.abs(n.x) < 1e-9 && Math.abs(n.y) < 1e-9 && Math.abs(n.z - 6) < 1e-9);
    expect(cap).toBeGreaterThanOrEqual(0);
    const touching = shed.members.filter((m) => m.a === cap || m.b === cap);
    // Two cap members to the chord heads, plus the truss bearing.
    expect(touching.filter((m) => m.role === 'post').length).toBeGreaterThanOrEqual(2);
    expect(touching.some((m) => m.role === 'chord')).toBe(true);
    expect(shed.assumptions).toContain('generator.assume.columnCapSharesReaction');
  });

  it('supports every latticed chord foot exactly once', () => {
    const shed = generateShed(P({ columnKind: 'lattice', frames: 3 }));
    // Two chords, two columns, three frames.
    expect(shed.supports).toHaveLength(12);
    expect(new Set(shed.supports.map((s) => s.node)).size).toBe(12);
    for (const s of shed.supports) expect(shed.nodes[s.node].z).toBeCloseTo(0, 9);
  });
});

describe('generateShed — purlins', () => {
  const shed = generateShed(P({
    columnKind: 'solid', roof: true, purlins: true, frames: 6,
    truss: { ...DEFAULT_SHED_PARAMS.truss, panelsPerHalf: 5 },
  }));

  it('runs one line per top-chord station, per bay', () => {
    // Eleven stations across a ten-panel truss, five bays.
    expect(shed.counts.purlin).toBe(11 * 5);
  });

  it('runs every purlin along Y, at constant x and z', () => {
    for (const m of shed.members.filter((x) => x.role === 'purlin')) {
      const a = shed.nodes[m.a];
      const b = shed.nodes[m.b];
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.z).toBeCloseTo(b.z, 9);
      expect(Math.abs(b.y - a.y)).toBeCloseTo(5, 9);
    }
  });

  it('rolls each purlin to the local pitch, and lays the ridge one level', () => {
    const purlins = shed.members.filter((m) => m.role === 'purlin');
    const rolls = purlins.map((m) => m.rollAngleDeg ?? 0);
    // A 20 % pitch is atan(0.2) = 11.31°, one slope each way.
    expect(Math.max(...rolls)).toBeCloseTo(11.3099, 3);
    expect(Math.min(...rolls)).toBeCloseTo(-11.3099, 3);
    // The apex purlin sits between two opposing slopes and comes out level.
    expect(rolls.some((r) => Math.abs(r) < 1e-9)).toBe(true);
    expect(shed.assumptions).toContain('generator.assume.purlinsRolledToPitch');
  });

  it('lays no purlin on a level roof', () => {
    const flat = generateShed(P({
      columnKind: 'solid', roof: true, purlins: true, frames: 3,
      truss: { ...DEFAULT_SHED_PARAMS.truss, kind: 'pratt' },
    }));
    for (const m of flat.members.filter((x) => x.role === 'purlin')) {
      expect(m.rollAngleDeg ?? 0).toBe(0);
    }
  });
});

describe('generateShed — provenance claims only what the building has', () => {
  it('does not claim a roller: the truss supports are not in the shed', () => {
    const shed = generateShed(P({ roof: true, purlins: true, frames: 3 }));
    expect(shed.assumptions).not.toContain('generator.assume.supportsSimple');
    expect(shed.supports.every((s) => s.type !== 'rollerX')).toBe(true);
    // The truss's own assumptions still hold for its members and must survive.
    expect(shed.assumptions).toContain('generator.assume.chordsContinuous');
    expect(shed.assumptions).toContain('generator.assume.webPinned');
  });

  it('still records the base fixity the shed actually stands on', () => {
    const fixed = generateShed(P({ columnKind: 'lattice', fixedBase: true, frames: 2 }));
    expect(fixed.assumptions).toContain('generator.assume.baseFixed');
    const pinned = generateShed(P({
      columnKind: 'lattice', fixedBase: false, frames: 2,
      column: { ...DEFAULT_SHED_PARAMS.column, fixedBase: false },
    }));
    expect(pinned.assumptions).toContain('generator.assume.baseChordsPinned');
  });
});

describe('generateShed — every truss kind assembles', () => {
  it.each(['trapezoidal', 'parallelChord', 'pratt', 'arch'] as const)('%s', (kind) => {
    const shed = generateShed(P({
      roof: true, purlins: true, longitudinalBeams: true, frames: 3,
      truss: { ...DEFAULT_SHED_PARAMS.truss, kind, riseM: 2 },
    }));
    expect(usedNodes(shed).size).toBe(shed.nodes.length);
    expect(shed.counts.purlin).toBeGreaterThan(0);
    expect(shed.totalLengthM).toBeGreaterThan(0);
    expect(Object.values(shed.counts).reduce((s, n) => s + n, 0)).toBe(shed.members.length);
  });

  it('a monopitch shed climbs one way and still ties its purlins', () => {
    const shed = generateShed(P({
      roof: true, purlins: true, frames: 3,
      truss: { ...DEFAULT_SHED_PARAMS.truss, halfTruss: true, panelsPerHalf: 5 },
    }));
    const rolls = shed.members
      .filter((m) => m.role === 'purlin')
      .map((m) => m.rollAngleDeg ?? 0);
    // Every purlin on the same slope: one sign, one magnitude.
    expect(new Set(rolls.map((r) => Math.round(r * 1e6))).size).toBe(1);
    expect(Math.abs(rolls[0])).toBeGreaterThan(0);
  });
});

describe('generateShed — totals are consistent', () => {
  it('sums the member lengths it reports', () => {
    const shed = generateShed(P({ roof: true, purlins: true, longitudinalBeams: true }));
    const sum = shed.members.reduce((s, m) => {
      const a = shed.nodes[m.a];
      const b = shed.nodes[m.b];
      return s + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }, 0);
    expect(shed.totalLengthM).toBeCloseTo(sum, 6);
  });

  it('tallies every role it placed and no role it did not', () => {
    const shed = generateShed(P({ roof: true, purlins: true, longitudinalBeams: true }));
    const placed = new Set<MemberRole>(shed.members.map((m) => m.role));
    for (const [role, n] of Object.entries(shed.counts)) {
      if (n > 0) expect(placed.has(role as MemberRole)).toBe(true);
    }
    expect(Object.values(shed.counts).reduce((s, n) => s + n, 0)).toBe(shed.members.length);
  });

  it('grows monotonically as features are switched on', () => {
    const a = generateShed(P({ columnKind: 'solid', roof: false, purlins: false, longitudinalBeams: false }));
    const b = generateShed(P({ columnKind: 'lattice', roof: false, purlins: false, longitudinalBeams: false }));
    const c = generateShed(P({ columnKind: 'lattice', roof: false, purlins: false, longitudinalBeams: true }));
    const d = generateShed(P({ columnKind: 'lattice', roof: true, purlins: false, longitudinalBeams: true }));
    const e = generateShed(P({ columnKind: 'lattice', roof: true, purlins: true, longitudinalBeams: true }));
    const counts = [a, b, c, d, e].map((s) => s.members.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });
});

describe('validateShedParams', () => {
  it('accepts the defaults', () => {
    expect(validateShedParams(DEFAULT_SHED_PARAMS)).toEqual([]);
  });

  it('needs at least two frames to be a building', () => {
    expect(validateShedParams(P({ frames: 1 })).map((x) => x.key))
      .toContain('generator.problem.framesAtLeastTwo');
  });

  it('refuses a frame count the tab could not survive building', () => {
    expect(validateShedParams(P({ frames: MAX_SHED_FRAMES + 1 })).map((x) => x.key))
      .toContain('generator.problem.tooManyFrames');
    expect(validateShedParams(P({ frames: MAX_SHED_FRAMES }))).toEqual([]);
  });

  it('carries the truss\'s own problems up rather than swallowing them', () => {
    const problems = validateShedParams(P({
      roof: true, truss: { ...DEFAULT_SHED_PARAMS.truss, kind: 'arch', riseM: 0 },
    }));
    expect(problems.map((x) => x.key)).toContain('generator.problem.archNeedsRise');
  });

  it('ignores the truss\'s problems when there is no roof to build', () => {
    const problems = validateShedParams(P({
      roof: false, truss: { ...DEFAULT_SHED_PARAMS.truss, kind: 'arch', riseM: 0 },
    }));
    expect(problems).toEqual([]);
  });

  it('stops the generator rather than producing a degenerate building', () => {
    expect(() => generateShed(P({ frames: 1 }))).toThrow(/invalid parameters/);
    expect(() => generateShed(P({ bayM: 0 }))).toThrow(/invalid parameters/);
  });
});
