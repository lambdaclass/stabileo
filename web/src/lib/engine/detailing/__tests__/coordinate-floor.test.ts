import { describe, it, expect } from 'vitest';
import {
  coordinateFloor, provisionalKeys, repairConflicts,
  type FloorCoordinationInput, type MemberBars,
} from '../coordinate-floor';
import { straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { DEFAULT_TOLERANCES } from '../collision';
import { assessConstructibility } from '../constructibility';
import { clause } from '../../../codes/regulation';
import { noFloorFamilies } from '../family-record';

function bar(id: string, y: number, opts: Partial<BarPath> = {}): BarPath {
  return {
    id, diameterMm: 20, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y, z: 0 }, { x: 4, y, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
    ...opts,
  };
}

const need25 = () => 0.025;

describe('bounded repair ladder', () => {
  it('reports no conflicts and does nothing when the cage already fits', () => {
    const r = repairConflicts([bar('a', 0), bar('b', 0.3)], need25);
    expect(r.conflicts).toEqual([]);
    expect(r.attempts).toEqual([]);
    expect(r.trace).toEqual(['Sin conflictos.']);
  });

  it('clears a clearance shortfall by nudging the movable bar', () => {
    const r = repairConflicts([bar('a', 0), bar('b', 0.040)], need25);
    expect(r.conflicts).toEqual([]);
    expect(r.attempts[0].cleared).toBeGreaterThan(0);
    // The moved bar really moved.
    expect(r.bars.find((b) => b.id === 'b')!.segments[0].start.y).toBeGreaterThan(0.040);
  });

  it('never moves a locked bar', () => {
    // The user pinned it; silently relocating pinned work is the fastest way to lose
    // their trust.
    const r = repairConflicts([bar('a', 0, { locked: true }), bar('b', 0.040)], need25);
    expect(r.bars.find((b) => b.id === 'a')!.segments[0].start.y).toBeCloseTo(0, 12);
  });

  it('gives up honestly when both bars in a pair are locked', () => {
    const r = repairConflicts(
      [bar('a', 0, { locked: true }), bar('b', 0.040, { locked: true })], need25);
    expect(r.conflicts).toHaveLength(1);
    expect(r.trace.join(' ')).toMatch(/no resueltos tras la escalera acotada/);
  });

  it('is bounded — it stops after the ladder rather than looping', () => {
    const r = repairConflicts(
      [bar('a', 0, { locked: true }), bar('b', 0.040, { locked: true })], need25);
    expect(r.attempts.length).toBeLessThanOrEqual(2);
  });

  it('does not mutate the caller\'s bars', () => {
    const original = bar('b', 0.040);
    repairConflicts([bar('a', 0), original], need25);
    expect(original.segments[0].start.y).toBeCloseTo(0.040, 12);
  });

  it('respects the supplied clearance rule', () => {
    // 55 mm apart gives a 35 mm surface gap at the zero default: fine against 25 mm
    // required, short against 40 mm.
    expect(repairConflicts([bar('a', 0), bar('b', 0.055)], () => 0.025).attempts).toEqual([]);
    expect(repairConflicts([bar('a', 0), bar('b', 0.055)], () => 0.040).attempts.length)
      .toBeGreaterThan(0);
  });

  it('honours a tighter placement tolerance', () => {
    const bars = [bar('a', 0), bar('b', 0.048)];
    const strict = repairConflicts(bars, need25, { ...DEFAULT_TOLERANCES, placement: 0.010 });
    const loose = repairConflicts(bars, need25, { ...DEFAULT_TOLERANCES, placement: 0 });
    expect(strict.attempts.length).toBeGreaterThan(0);
    expect(loose.attempts).toEqual([]);
  });
});

// ─── Pipeline ────────────────────────────────────────────────────

const refs = [clause('cirsoc-201', '2025', '9.7.3')];

function member(elementId: number, bars: BarPath[], over: Partial<MemberBars> = {}): MemberBars {
  return { elementId, bars, unsupported: [], maturity: 'VALIDATED', refs, trace: [], ...over };
}

function input(over: Partial<FloorCoordinationInput> = {}): FloorCoordinationInput {
  return {
    assemblyId: 'L1-B', label: 'Eje B', kind: 'beamLine', elementIds: [1, 2],
    members: [member(1, [bar('m1-a', 0)]), member(2, [bar('m2-a', 0.3)])],
    joints: [],
    edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 5,
    cover: 0.025, tieDia: 8, maxAggregateSizeMm: 20,
    membersVerified: true, coordinated: true,
    // The twelve-condition gate. Without it the coordinator caps at COORDINATED, which is
    // the correct default — CONSTRUCTIBLE is a claim about buildability and a caller that
    // has produced no evidence for it does not get to make it.
    constructibility: assessConstructibility({
      completeEnvelope: true, searchTruncated: false,
      applicableMembers: 2, assignedMembers: 2,
      selectedTransitions: 0, materialisedTransitions: 0, unmaterialisedTransitions: 0,
      requiredTransversePieces: 0, materialisedTransversePieces: 0,
      prohibitedConflicts: 0, reverifiedMembers: 2, certificateHashMatches: 2,
      spacingNotCodeLegal: 0, spacingNotPlacementRobust: 0,
      unsupportedRules: 0, staleAssemblies: 0,
      familyRequirements: noFloorFamilies(),
    }),
    ...over,
  };
}

describe('the detailing pipeline', () => {
  it('produces a constructible assembly from clean input', () => {
    const r = coordinateFloor(input());
    expect(r.assembly.state).toBe('CONSTRUCTIBLE');
    expect(r.assembly.bars).toHaveLength(2);
    expect(r.assembly.marks.length).toBeGreaterThan(0);
    expect(r.assembly.conflicts).toEqual([]);
  });

  it('increments the revision rather than resetting it', () => {
    expect(coordinateFloor(input({ previousRevision: 6 })).assembly.detailingRevision).toBe(7);
    expect(coordinateFloor(input()).assembly.detailingRevision).toBe(1);
  });

  it('stamps the edition, verifier and demand revision', () => {
    const a = coordinateFloor(input()).assembly;
    expect(a.provenance.edition).toBe('2025');
    expect(a.provenance.verifierId).toBe('cirsoc201.provided.v2.2025');
    expect(a.demandRevision).toBe(5);
  });

  it('keeps a locked bar and drops its regenerated replacement', () => {
    const lockedBar = bar('m1-a', 0.9, { locked: true });
    const r = coordinateFloor(input({ lockedBars: [lockedBar] }));
    const kept = r.assembly.bars.find((b) => b.id === 'm1-a')!;
    expect(kept.locked).toBe(true);
    expect(kept.segments[0].start.y).toBeCloseTo(0.9, 9);
    // Not duplicated.
    expect(r.assembly.bars.filter((b) => b.id === 'm1-a')).toHaveLength(1);
    expect(r.trace.join(' ')).toMatch(/fijada\(s\) por el usuario se conservan/);
  });

  it('records a member that produced no bars, and carries on', () => {
    const r = coordinateFloor(input({
      members: [member(1, []), member(2, [bar('m2-a', 0.3)])],
    }));
    expect(r.assembly.unsupported.some((u) => u.key === 'memberNoBars')).toBe(true);
    // The rest of the assembly still produced output.
    expect(r.assembly.bars).toHaveLength(1);
  });

  it('propagates a generator\'s unsupported condition to the assembly', () => {
    const r = coordinateFloor(input({
      members: [member(1, [bar('m1-a', 0)], { unsupported: ['torsión no verificada'] }),
        member(2, [bar('m2-a', 0.3)])],
    }));
    const u = r.assembly.unsupported.find((x) => x.key === 'generation')!;
    expect(u.message).toBe('torsión no verificada');
    expect(u.scope.elementIds).toEqual([1]);
  });

  it('blocks CONSTRUCTIBLE while an unsupported condition remains', () => {
    const r = coordinateFloor(input({
      members: [member(1, [bar('m1-a', 0)], { unsupported: ['torsión'] }),
        member(2, [bar('m2-a', 0.3)])],
    }));
    expect(r.assembly.state).toBe('COORDINATED');
  });

  it('drops to VERIFIED when the coordinator did not converge', () => {
    expect(coordinateFloor(input({ coordinated: false })).assembly.state).toBe('VERIFIED');
  });

  it('stays DRAFT while any member fails its own checks', () => {
    expect(coordinateFloor(input({ membersVerified: false })).assembly.state).toBe('DRAFT');
  });

  it('repairs a clash and reaches CONSTRUCTIBLE', () => {
    const r = coordinateFloor(input({
      members: [member(1, [bar('m1-a', 0)]), member(2, [bar('m2-a', 0.040)])],
    }));
    expect(r.repair.attempts.length).toBeGreaterThan(0);
    expect(r.assembly.conflicts).toEqual([]);
    expect(r.assembly.state).toBe('CONSTRUCTIBLE');
  });

  it('reports an unresolvable clash without losing the rest of the floor', () => {
    const r = coordinateFloor(input({
      members: [
        member(1, [bar('m1-a', 0, { locked: true })]),
        member(2, [bar('m2-a', 0.040, { locked: true })]),
      ],
      lockedBars: [bar('m1-a', 0, { locked: true }), bar('m2-a', 0.040, { locked: true })],
    }));
    expect(r.assembly.conflicts.length).toBeGreaterThan(0);
    expect(r.assembly.state).toBe('COORDINATED');
    // Losing a whole floor's output to one clash in one corner helps nobody.
    expect(r.assembly.bars.length).toBeGreaterThan(0);
    expect(r.assembly.marks.length).toBeGreaterThan(0);
  });

  it('takes the worst maturity across members and joints', () => {
    const r = coordinateFloor(input({
      members: [member(1, [bar('m1-a', 0)], { maturity: 'VALIDATED' }),
        member(2, [bar('m2-a', 0.3)], { maturity: 'IMPLEMENTED_PROVISIONAL' })],
    }));
    expect(r.assembly.maturity).toBe('IMPLEMENTED_PROVISIONAL');
  });

  it('coordinates joints and records their layers', () => {
    const r = coordinateFloor(input({
      joints: [{
        id: 'J1', nodeId: 10, elementIds: [1, 2], columnAbove: true,
        columnB: 0.4, columnH: 0.4,
        beams: [
          { elementId: 1, direction: { x: 1, y: 0 }, depth: 0.6, topDiameterMm: 20, continuous: true },
          { elementId: 2, direction: { x: 0, y: 1 }, depth: 0.5, topDiameterMm: 16, continuous: true },
        ],
        jointShearMaturity: 'IMPLEMENTED_PROVISIONAL', jointShearKey: 'js:J1',
      }],
    }));
    expect(r.assembly.joints).toHaveLength(1);
    const j = r.assembly.joints[0];
    expect(j.kind).toBe('corner');
    expect(new Set(j.beamLayers.map((l) => l.layer)).size).toBe(2);
    expect(j.maturity).toBe('IMPLEMENTED_PROVISIONAL');
    expect(r.assembly.maturity).toBe('IMPLEMENTED_PROVISIONAL');
  });

  it('routes an unresolved conflict to its joint for navigation', () => {
    const r = coordinateFloor(input({
      members: [
        member(1, [bar('m1-a', 0, { locked: true })]),
        member(2, [bar('m2-a', 0.040, { locked: true, ownerElementIds: [2] })]),
      ],
      lockedBars: [
        bar('m1-a', 0, { locked: true }),
        bar('m2-a', 0.040, { locked: true, ownerElementIds: [2] }),
      ],
      joints: [{
        id: 'J1', nodeId: 10, elementIds: [1, 2], columnAbove: true,
        columnB: 0.4, columnH: 0.4,
        beams: [{ elementId: 1, direction: { x: 1, y: 0 }, depth: 0.6, topDiameterMm: 20, continuous: true }],
      }],
    }));
    expect(r.assembly.joints[0].unresolved.length).toBeGreaterThan(0);
  });

  it('prefixes column marks differently from beam marks', () => {
    expect(coordinateFloor(input()).assembly.marks[0].mark).toMatch(/^B/);
    expect(coordinateFloor(input({ kind: 'columnStack' })).assembly.marks[0].mark).toMatch(/^C/);
  });

  it('lists the provisional keys a reviewer must acknowledge', () => {
    const r = coordinateFloor(input({
      members: [member(1, [bar('m1-a', 0)], { maturity: 'IMPLEMENTED_PROVISIONAL' }),
        member(2, [bar('m2-a', 0.3)])],
      joints: [{
        id: 'J1', nodeId: 10, elementIds: [1], columnAbove: true,
        columnB: 0.4, columnH: 0.4,
        beams: [{ elementId: 1, direction: { x: 1, y: 0 }, depth: 0.6, topDiameterMm: 20, continuous: true }],
        jointShearMaturity: 'IMPLEMENTED_PROVISIONAL',
      }],
    }));
    expect(provisionalKeys(r.assembly)).toEqual(['assembly', 'jointShear:J1']);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(coordinateFloor(input())))
      .toBe(JSON.stringify(coordinateFloor(input())));
  });

  it('never throws on a degenerate assembly', () => {
    expect(() => coordinateFloor(input({ members: [], elementIds: [] }))).not.toThrow();
    const r = coordinateFloor(input({ members: [], elementIds: [] }));
    expect(r.assembly.state).toBe('VERIFIED');
  });
});
