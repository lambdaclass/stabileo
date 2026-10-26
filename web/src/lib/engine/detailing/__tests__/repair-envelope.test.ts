/**
 * The repair ladder bounded by the section: a move that leaves the concrete, gives up lever arm
 * the design verified or presses a bar into another one is not a candidate, and a clash with no
 * valid move stays where it was and comes back unresolved with its cause.
 *
 * The members are built here with the numbers the production envelope reads (width, height,
 * cover, stirrup), and every expected limit is computed independently from them below rather
 * than read back off the envelope.
 */
import { describe, expect, it } from 'vitest';
import { buildStraightBarWithHooks, samplePath, straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { buildRepairEnvelope, type EnvelopeMember } from '../repair-envelope';
import { coordinateFloor, repairConflicts, type FloorCoordinationInput } from '../coordinate-floor';
import { detectCollisions } from '../collision';

const need25 = () => 0.025;

/** A 30×50 beam along +x, 4 m, axis at z = 0; cover 25 mm to an 8 mm stirrup. */
const BEAM: EnvelopeMember = {
  elementId: 1, kind: 'beam', start: { x: 0, y: 0, z: 0 }, end: { x: 4, y: 0, z: 0 },
  b: 0.3, h: 0.5, cover: 0.025, stirrupDiaMm: 8,
};
/** A 40×30 column from z = 0 to 3 at the origin: b = 0,40 along x, h = 0,30 along y. */
const COLUMN: EnvelopeMember = {
  elementId: 9, kind: 'column', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 3 },
  b: 0.4, h: 0.3, cover: 0.03, stirrupDiaMm: 10,
};
/**
 * Where the centre of a bar of `dia` mm can be against a straight leg, half-extent from the
 * axis: the face less the cover, the whole stirrup and half the bar.
 */
const faceRoom = (half: number, m: EnvelopeMember, dia: number) => half - m.cover - m.stirrupDiaMm / 1000 - dia / 2000;

function bar(id: string, y: number, z: number, opts: Partial<BarPath> = {}): BarPath {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments: [straightSegment({ x: 0.2, y, z }, { x: 3.8, y, z })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 3.6, ownerElementIds: [1], source: 'generated', locked: false, refs: [], ...opts,
  };
}
const yOf = (b: BarPath) => b.segments[0].start.y;

describe('the repair envelope', () => {
  const env = buildRepairEnvelope([BEAM, COLUMN]);
  const bottom = -faceRoom(0.25, BEAM, 16);

  it('holds a beam bar inside its width and height, cover, stirrup and radius', () => {
    const room = faceRoom(0.15, BEAM, 16);
    const b = bar('b', 0, bottom + 0.05);
    expect(env.reject(b, { x: 0, y: room - 0.001, z: 0 })).toBeNull();
    const out = env.reject(b, { x: 0, y: room + 0.004, z: 0 });
    expect(out?.reason).toBe('outsideSection');
    expect(out?.element).toBe(1);
    expect(out?.by).toBeCloseTo(0.004, 6);
  });

  it.each([0, 1, 2])('checks span %i of a continuous run whose ends both lie in wider columns', narrow => {
    const nodes = [0, 2, 8, 10];
    const beams = nodes.slice(0, -1).map((x, i): EnvelopeMember => ({ ...BEAM, elementId: i + 1,
      start: { x, y: 0, z: 0 }, end: { x: nodes[i + 1], y: 0, z: 0 }, b: i === narrow ? 0.2 : 0.5 }));
    const columns = nodes.map((x, i): EnvelopeMember => ({ ...COLUMN, elementId: i + 10, b: 0.6, h: 0.6,
      start: { x, y: 0, z: -1 }, end: { x, y: 0, z: 0 } }));
    const bounds = buildRepairEnvelope([...beams, ...columns]);
    for (const reverse of [false, true]) {
      const ends = [{ x: -0.1, y: 0.02, z: 0.1 }, { x: 10.1, y: 0.02, z: 0.1 }];
      if (reverse) ends.reverse();
      const continuous = bar('continuous', 0.02, 0.1, { ownerElementIds: [1, 2, 3],
        segments: [straightSegment(ends[0], ends[1])] });
      // Endpoints and (for outer narrow spans) the run's midpoint remain inside
      // the wider concrete. The narrow span independently limits y to 59 mm.
      expect(bounds.reject(continuous, { x: 0, y: 0.03, z: 0 })).toBeNull();
      expect(bounds.reject(continuous, { x: 0, y: 0.06, z: 0 })).toMatchObject({
        reason: 'outsideSection', element: narrow + 1, by: expect.closeTo(0.021, 6),
      });
    }
  });

  it('judges the hook, not only the run: a move the straight survives can push the tail out', () => {
    // A Ø8 bar with a 90° hook turning across the beam at x = 3,6, inside the span.
    const hooked = buildStraightBarWithHooks({
      id: 'h', diameterMm: 8, role: 'longitudinal', start: { x: 0.4, y: -0.06, z: bottom }, end: { x: 3.6, y: -0.06, z: bottom },
      axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 1, z: 0 }, endHook: 90, ownerElementIds: [1],
    });
    const tail = Math.max(...samplePath(hooked, 0.001).map((p) => p.y));
    const room = faceRoom(0.15, BEAM, 8);
    expect(tail).toBeLessThan(room);
    const push = room - tail + 0.005;
    // The run ends up at -0,06 + push, well inside; the tail 5 mm past the leg.
    expect(-0.06 + push).toBeLessThan(room - 0.05);
    const r = env.reject(hooked, { x: 0, y: push, z: 0 });
    expect(r?.reason).toBe('outsideSection');
    expect(r!.by).toBeGreaterThan(0.004);
    expect(r!.by).toBeLessThan(0.006);
  });

  it('refuses any move of a flexural bar toward the member interior, however small', () => {
    const b = bar('b', 0, bottom);
    expect(env.reject(b, { x: 0, y: 0, z: 0.002 })).toEqual({ reason: 'depthReduced', bar: 'b', element: 1, by: 0.002 });
    expect(env.reject(bar('t', 0, -bottom), { x: 0, y: 0, z: -0.001 })?.reason).toBe('depthReduced');
    // Lateral moves keep the lever arm.
    expect(env.reject(b, { x: 0, y: 0.02, z: 0 })).toBeNull();
    // The admissible part of a push with an upward component is its lateral part.
    const d = env.admissible(b, { x: 0, y: 0.6, z: 0.8 });
    expect([d.x, d.y, d.z]).toEqual([0, 0.6, 0]);
    expect(env.admissible(b, { x: 0, y: 0.6, z: -0.8 })).toEqual({ x: 0, y: 0.6, z: -0.8 });
  });

  it('holds a column bar by b along x and h along y, and keeps its lever arm on both axes', () => {
    const rx = faceRoom(0.2, COLUMN, 20), ry = faceRoom(0.15, COLUMN, 20);
    const v = (x: number, y: number): BarPath => ({
      ...bar('v', 0, 0), diameterMm: 20, ownerElementIds: [9],
      segments: [straightSegment({ x, y, z: 0.1 }, { x, y, z: 2.9 })],
    });
    // A mid-face bar on the x face can slide along it, not inward, not out.
    expect(env.reject(v(rx, 0), { x: 0, y: 0.03, z: 0 })).toBeNull();
    expect(env.reject(v(rx, 0), { x: -0.003, y: 0, z: 0 })?.reason).toBe('depthReduced');
    expect(env.reject(v(rx, 0), { x: 0.003, y: 0, z: 0 })?.reason).toBe('outsideSection');
    // h is along y: a bar at ry fits, one at ry + 3 mm does not.
    expect(env.reject(v(0, ry - 0.003), { x: 0, y: 0.003, z: 0 })).toBeNull();
    expect(env.reject(v(0, ry - 0.003), { x: 0, y: 0.006, z: 0 })?.reason).toBe('outsideSection');
  });

  it('lets a bar the ladder received outside stay there, and not get further out', () => {
    const room = faceRoom(0.15, BEAM, 16);
    const b = bar('b', room + 0.01, bottom + 0.05);
    expect(env.reject(b, { x: 0, y: -0.002, z: 0 })).toBeNull();
    expect(env.reject(b, { x: 0, y: 0.002, z: 0 })?.reason).toBe('outsideSection');
  });
});

describe('the repair ladder bounded by the section', () => {
  const env = buildRepairEnvelope([BEAM]);
  const room = faceRoom(0.15, BEAM, 16);
  const z = -faceRoom(0.25, BEAM, 16);

  it('repairs a clash that has room, with the bar that has room, and the repaired bar stays inside', () => {
    // b against the side leg, a 30 mm in: 14 mm clear between two Ø16 against 25. a, further in,
    // tries first and moves inward, which fits (b, away from a, would go through the cover).
    const bars = [bar('a', room - 0.03, z), bar('b', room, z)];
    const r = repairConflicts(bars, need25, undefined, undefined, { envelope: env });
    expect(r.conflicts).toEqual([]);
    expect(r.unresolved).toEqual([]);
    expect(r.bars.find((x) => x.id === 'b')).toEqual(bars[1]);
    const a = r.bars.find((x) => x.id === 'a')!;
    // Moved across by the shortfall plus the first rung's margin, and nothing vertical.
    expect(yOf(a)).toBeCloseTo(room - 0.03 - 0.013, 6);
    expect(a.segments[0].start.z).toBe(z);
    expect(r.moved).toEqual([{ id: 'a', offset: { x: 0, y: expect.closeTo(-0.013, 6), z: 0 } }]);
    for (const x of r.bars) for (const p of samplePath(x, 0.001)) expect(Math.abs(p.y)).toBeLessThanOrEqual(room + 1e-9);
    expect(detectCollisions(r.bars, { requiredClearFor: need25 }).conflicts).toEqual([]);
  });

  it('leaves a clash with no valid move where it was, and returns it with every move tried and why', () => {
    // As above, with c 45 mm further in: a moved inward 13 mm now presses into c.
    const bars = [bar('a', room - 0.03, z), bar('b', room, z), bar('c', room - 0.075, z)];
    const before = detectCollisions(bars, { requiredClearFor: need25 }).conflicts;
    expect(before.map((c) => [c.barA, c.barB])).toEqual([['a', 'b']]);
    const r = repairConflicts(bars, need25, undefined, undefined, { envelope: env });
    expect(r.bars).toEqual(bars);
    expect(r.moved).toEqual([]);
    expect(r.conflicts).toEqual(before);
    expect(r.attempts).toEqual([{ rung: 'separación mínima', cleared: 0, remaining: 1 }]);
    expect(r.unresolved).toHaveLength(1);
    const u = r.unresolved[0];
    expect([u.barA, u.barB, u.shortfall]).toEqual(['a', 'b', 0.011]);
    expect(u.candidates.map((c) => [c.rung, c.moved, c.rejected?.reason, c.rejected?.with, c.rejected?.element]))
      .toEqual([
        // Equal bars, so the one further in (lower y) tries first: the order is by place.
        ['separación mínima', 'a', 'clearance', 'c', undefined],
        ['separación mínima', 'b', 'outsideSection', undefined, 1],
      ]);
    // By how much: a would stand 32 mm from c (16 mm clear, 9 short); b 13 mm past its room.
    expect(u.candidates[0].rejected!.by).toBeCloseTo(0.009, 6);
    expect(u.candidates[1].rejected!.by).toBeCloseTo(0.013, 6);
  });

  it('the same clash without the bound is "repaired" through the cover, which is what it used to do', () => {
    const bars = [bar('a', room - 0.03, z), bar('b', room, z), bar('c', room - 0.075, z)];
    const r = repairConflicts(bars, need25);
    expect(r.conflicts).toEqual([]);
    expect(yOf(r.bars.find((x) => x.id === 'b')!)).toBeCloseTo(room + 0.013, 6);
  });

  it('a coordinated assembly records the unresolved clash as an open condition and is not constructible', () => {
    const bars = [bar('a', room - 0.03, z), bar('b', room, z), bar('c', room - 0.075, z)];
    const input: FloorCoordinationInput = {
      assemblyId: 'L1', label: 'L1', kind: 'beamLine', elementIds: [1],
      members: [{ elementId: 1, bars, unsupported: [], maturity: 'VALIDATED', refs: [], trace: [] }],
      joints: [], edition: '2025', verifierId: 'test', demandRevision: 1,
      cover: 0.025, tieDia: 8, maxAggregateSizeMm: 19, membersVerified: true, coordinated: true,
      repairEnvelope: env,
    };
    const r = coordinateFloor(input);
    expect(r.assembly.bars.map(yOf)).toEqual(bars.map(yOf));
    const open = r.assembly.unsupported.filter((u) => u.key === 'detailing.clash.unresolved');
    expect(open).toHaveLength(1);
    expect(open[0].scope.elementIds).toEqual([1]);
    // The pipeline's own rule: 4/3 of a 19 mm aggregate, 25,3 mm clear, so 11,3 mm short and b's
    // push 13,3 mm (shortfall plus the 2 mm margin) past its room.
    expect(open[0].params).toEqual({
      bar: 'a', barB: 'b', element: 1, shortfall: 11.3, tried: 2, rungs: 1,
      outside: 1, outsideBy: 13.3, depth: 0, depthBy: 0, clearance: 1,
    });
    expect(r.assembly.state).not.toBe('CONSTRUCTIBLE');
    expect((r.assembly.stateBlockers ?? []).join(' ')).toContain('detailing.clash.unresolved');
  });

  it('the bar that gives way and the order clashes are taken in do not depend on the ids', () => {
    // Two clashes in one layer-less row: x | y 30 mm apart, and z 30 mm from y on the other side.
    // The same geometry under two namings whose text order is reversed; the bars laid must be the
    // same, read back by place. With the second id of each pair giving way they were not.
    const ys = [-0.03, 0, 0.03];
    const lay = (names: string[]) => {
      const r = repairConflicts(ys.map((y, i) => bar(names[i]!, y, z)), need25, undefined, undefined, { envelope: env });
      return {
        at: names.map((n) => r.bars.find((x) => x.id === n)!).map((x) => +yOf(x).toFixed(6)),
        conflicts: r.conflicts.length,
      };
    };
    const one = lay(['e1-a', 'e2-b', 'e3-c']);
    const other = lay(['e9-c', 'e10-b', 'e11-a']); // 'e10' < 'e11' < 'e9' as text
    expect(other).toEqual(one);
    expect(one.conflicts).toBe(0);
  });
});
