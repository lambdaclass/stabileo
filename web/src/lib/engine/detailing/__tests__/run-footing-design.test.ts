import { describe, it, expect } from 'vitest';
import {
  punchingPosition, runFootingDesign,
  type FootingColumn, type NodeReactions, type RunFootingDesignInput,
} from '../run-footing-design';
import { floorDesignReadiness } from '../run-floor-design';
import { newFooting, type Footing } from '../../../model/footing';
import {
  emptyGeotechnical, newSoilProfile,
  type ProjectGeotechnical, type SoilProfile,
} from '../../../model/geotechnical';

const profile = (over: Partial<SoilProfile> = {}): SoilProfile => ({
  ...newSoilProfile(1, 'Arena densa'),
  bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 },
  provenance: { source: 'report', reference: 'EG-2026-14' },
  ...over,
});

const geo = (p: SoilProfile = profile()): ProjectGeotechnical => ({
  ...emptyGeotechnical(), profiles: [p], defaultProfileId: p.id,
});

const footing = (over: Partial<Footing> = {}): Footing => ({
  ...newFooting(1, 10, 'Z1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }),
  B: 2.0, L: 2.0, thickness: 0.5, columnElementId: 3,
  ...over,
});

const column = (over: Partial<FootingColumn> = {}): FootingColumn => ({
  elementId: 3, b: 0.4, h: 0.4,
  bars: { count: 8, diameterMm: 20 }, tieDiaMm: 8,
  ...over,
});

/** A reaction set with both a strength combination and gravity cases. */
const reactions = (over: Partial<NodeReactions> = {}): NodeReactions => ({
  factored: [
    { combinationId: 1, combinationName: '1.2D + 1.6L', fz: -900, mx: 0, my: 0 },
    { combinationId: 2, combinationName: '1.4D', fz: -700, mx: 0, my: 0 },
  ],
  cases: [
    { caseId: 1, caseType: 'D', fz: -400, mx: 0, my: 0 },
    { caseId: 2, caseType: 'L', fz: -200, mx: 0, my: 0 },
  ],
  ...over,
});

/**
 * The upstream revisions the run is reading.
 *
 * Distinct values on purpose: a record that collapsed the three stages into one number could
 * report a certificate as stale without being able to say whether the loads, the analysis or
 * the regulation moved, and those have three different remedies.
 */
const REVISIONS = { analysis: 6, loads: 4, regulation: 2 };

const run = (over: Partial<RunFootingDesignInput> = {}) => runFootingDesign({
  footings: [footing()],
  geotechnical: geo(),
  nodes: new Map([[10, { x: 0, y: 0, z: -1.2 }]]),
  columns: new Map([[3, column()]]),
  reactions: new Map([[10, reactions()]]),
  fc: 25, fy: 420, edition: '2025', barDiameterMm: 16,
  revisions: REVISIONS, regulationIds: ['cirsoc-201'],
  ...over,
});

const keysOf = (msgs: { key: string }[]) => msgs.map((m) => m.key);

describe('runFootingDesign — the production path', () => {
  it('checks a complete footing and names its governing combination', () => {
    const r = run();
    const o = r.outcomes[0];
    expect(o.check).not.toBeNull();
    // The largest vertical governs, and the certificate has to be able to say which.
    expect(o.governingCombination).toBe('1.2D + 1.6L');
    expect(o.check!.bearing.qMax).toBeGreaterThan(0);
  });

  it('produces an assembly entry grouped by founding level', () => {
    const r = run();
    expect([...r.entriesByLevel.keys()]).toEqual([-1.2]);
    expect(r.entriesByLevel.get(-1.2)![0].id).toBe('F1');
  });

  it('generates dowels from the ACCEPTED column bars, with a real development length', () => {
    const dowels = run().entriesByLevel.get(-1.2)![0].dowels!;
    expect(dowels.bars).toEqual({ count: 8, diameterMm: 20 });
    // ld from `deriveDevelopment` (Table 25.4.2.3, conservative row), not a second formula.
    // Ø20, f'c 25, fy 420, unfavourable row: 420/(1.1·5)·20 = 1527 mm.
    expect(dowels.ldFooting).toBeCloseTo(1.527, 2);
    // §25.5.2.1 Class B — all starters lap at one station.
    expect(dowels.lapAbove).toBeCloseTo(1.3 * dowels.ldFooting, 6);
  });

  it('is deterministic under input reordering', () => {
    const two = [footing({ id: 1 }), footing({ id: 2, nodeId: 11 })];
    const nodes = new Map([[10, { x: 0, y: 0, z: -1.2 }], [11, { x: 5, y: 0, z: -1.2 }]]);
    const rx = new Map([[10, reactions()], [11, reactions()]]);
    const forward = runFootingDesign({
      footings: two, geotechnical: geo(), nodes, columns: new Map([[3, column()]]),
      reactions: rx, fc: 25, fy: 420, edition: '2025', barDiameterMm: 16,
      revisions: REVISIONS, regulationIds: ['cirsoc-201'],
    });
    const reversed = runFootingDesign({
      footings: [...two].reverse(), geotechnical: geo(), nodes,
      columns: new Map([[3, column()]]),
      reactions: rx, fc: 25, fy: 420, edition: '2025', barDiameterMm: 16,
      revisions: REVISIONS, regulationIds: ['cirsoc-201'],
    });
    expect(reversed.outcomes.map((o) => o.footingId)).toEqual(forward.outcomes.map((o) => o.footingId));
    expect(reversed.entriesByLevel.get(-1.2)!.map((e) => e.id))
      .toEqual(forward.entriesByLevel.get(-1.2)!.map((e) => e.id));
  });
});

describe('the gate — a footing cannot be verified without its inputs', () => {
  const notVerified = (over: Partial<RunFootingDesignInput>) => {
    const o = run(over).outcomes[0];
    expect(o.check, 'must not be checked').toBeNull();
    expect(o.entry).toBeNull();
    return keysOf(o.unsupported);
  };

  it('refuses an undimensioned footing', () => {
    expect(notVerified({ footings: [footing({ B: 0 })] }))
      .toContain('footing.issue.planDimension');
  });

  it('refuses a footing with no soil profile', () => {
    expect(notVerified({ footings: [footing({ soilProfileId: null })] }))
      .toContain('footing.run.noSoilProfile');
  });

  it('refuses a footing whose stratum states no bearing pressure', () => {
    // No regulation supplies one, so nothing may be assumed.
    expect(notVerified({ geotechnical: geo(profile({ bearing: { kind: 'unstated' } })) }))
      .toContain('footing.run.bearingUnstated');
  });

  it('refuses a footing with no reaction', () => {
    expect(notVerified({ reactions: new Map() })).toContain('footing.run.noReaction');
  });

  it('refuses to approximate a service reaction when there are no per-case results', () => {
    // Dividing the factored load by an assumed 1,4 would invent the load factor the project
    // already states somewhere else.
    const keys = notVerified({
      reactions: new Map([[10, { factored: reactions().factored }]]),
    });
    expect(keys).toContain('footing.run.noServiceCases');
  });

  it('refuses a rotated footing rather than mis-assigning its eccentricity', () => {
    expect(notVerified({ footings: [footing({ rotationDeg: 30 })] }))
      .toContain('footing.run.rotationNotResolved');
  });

  it('refuses a footing with no column, because its punching is unchecked', () => {
    const keys = notVerified({ footings: [footing({ columnElementId: undefined })] });
    expect(keys).toContain('footing.run.noColumn');
  });

  it('refuses a non-isolated kind instead of checking it as isolated', () => {
    expect(notVerified({ footings: [footing({ kind: 'mat' })] }))
      .toContain('footing.run.kindNotImplemented');
  });

  it('refuses a column that does not fit on its base', () => {
    expect(notVerified({
      footings: [footing({ B: 0.5, L: 0.5 })], columns: new Map([[3, column()]]),
    })).toContain('footing.run.columnDoesNotFit');
  });
});

describe('honest reporting of what a result does and does not cover', () => {
  it('records the service sum as an ASSUMPTION, since no service combination is modelled', () => {
    const o = run().outcomes[0];
    expect(keysOf(o.assumptions)).toContain('footing.assumption.serviceFromGravityCases');
  });

  it('carries the geotechnical provenance into the outcome', () => {
    const o = run({ geotechnical: geo(profile({
      provenance: { source: 'assumed', reference: 'comparable site' },
    })) }).outcomes[0];
    expect(keysOf(o.assumptions)).toContain('geotechnical.assumption.assumed');
  });

  it('states that the average mat depth is an assumption', () => {
    expect(keysOf(run().outcomes[0].assumptions))
      .toContain('footing.assumption.averageMatDepth');
  });

  it('checks gravity bearing but names the lateral cases it does NOT cover', () => {
    // The gravity result is real, so it stands; claiming it covers wind would not be. Both
    // halves are reported.
    const o = run({
      reactions: new Map([[10, reactions({
        cases: [
          { caseId: 1, caseType: 'D', fz: -400, mx: 0, my: 0 },
          { caseId: 2, caseType: 'L', fz: -200, mx: 0, my: 0 },
          { caseId: 3, caseType: 'W', fz: -80, mx: 40, my: 0 },
        ],
      })]]),
    }).outcomes[0];
    expect(o.check).not.toBeNull();
    expect(keysOf(o.unsupported)).toContain('footing.run.serviceLateralExcluded');
  });

  it('ignores a lateral case that carries nothing at this node', () => {
    const o = run({
      reactions: new Map([[10, reactions({
        cases: [
          { caseId: 1, caseType: 'D', fz: -400, mx: 0, my: 0 },
          { caseId: 2, caseType: 'L', fz: -200, mx: 0, my: 0 },
          { caseId: 3, caseType: 'W', fz: 0, mx: 0, my: 0 },
        ],
      })]]),
    }).outcomes[0];
    expect(keysOf(o.unsupported)).not.toContain('footing.run.serviceLateralExcluded');
  });

  it('keeps designing the rest of the set when one footing is unusable', () => {
    const r = runFootingDesign({
      footings: [footing({ id: 1, B: 0 }), footing({ id: 2, nodeId: 11 })],
      geotechnical: geo(),
      nodes: new Map([[10, { x: 0, y: 0, z: -1.2 }], [11, { x: 5, y: 0, z: -1.2 }]]),
      columns: new Map([[3, column()]]),
      reactions: new Map([[10, reactions()], [11, reactions()]]),
      fc: 25, fy: 420, edition: '2025', barDiameterMm: 16,
      revisions: REVISIONS, regulationIds: ['cirsoc-201'],
    });
    expect(r.outcomes.find((o) => o.footingId === 1)!.check).toBeNull();
    expect(r.outcomes.find((o) => o.footingId === 2)!.check).not.toBeNull();
  });
});

describe('punching position on a footing', () => {
  it('is interior when the footing extends past the column on all sides', () => {
    // Unlike a slab-column joint, where position is a property of the building, a pad
    // footing normally closes its own perimeter.
    expect(punchingPosition(footing(), { b: 0.4, h: 0.4 }, 0.43).position).toBe('interior');
  });

  it('becomes an edge case when eccentricity brings one face within d/2', () => {
    const f = footing({ B: 2.0, eccentricityB: 0.65 });
    const p = punchingPosition(f, { b: 0.4, h: 0.4 }, 0.43);
    expect(p.truncatedSides).toBe(1);
    expect(p.position).toBe('edge');
  });

  it('becomes a corner case when two ADJACENT faces are truncated', () => {
    // One face on each axis — the pattern §22.6.5.3 calls a corner.
    const f = footing({ B: 2.0, L: 2.0, eccentricityB: 0.65, eccentricityL: 0.65 });
    const p = punchingPosition(f, { b: 0.4, h: 0.4 }, 0.43);
    expect(p.truncatedSides).toBe(2);
    expect(p.position).toBe('corner');
  });

  it('refuses two OPPOSITE truncated faces rather than calling them a corner', () => {
    // A strip-like perimeter. §22.6.5.3 tabulates α_s for three cases and this is none of
    // them, so applying the corner α_s would be the wrong coefficient for this shape.
    const f = footing({ B: 1.0, L: 3.0 });
    const p = punchingPosition(f, { b: 0.4, h: 0.4 }, 0.62);
    expect(p.truncatedSides).toBe(2);
    expect(p.position).toBeNull();
    expect(p.pattern).toBe('oppositeFaces');
  });

  it('refuses a column that overruns the base entirely', () => {
    const p = punchingPosition(footing({ B: 0.5, L: 0.5 }), { b: 0.4, h: 0.4 }, 0.43);
    expect(p.position).toBeNull();
    expect(p.pattern).toBe('doesNotFit');
  });
});

describe('readiness accounts for footings, not only shells', () => {
  it('is ready for a project with footings and no shells', () => {
    // A bare frame on pad footings is an ordinary thing to design. Counting shells only
    // disabled the command for it entirely.
    const r = floorDesignReadiness({ shells: [], stresses: [], footings: [{ id: 1 }] });
    expect(r.ready).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it('is ready for footings even before a solve, because the gate is per footing', () => {
    // The unsolved case produces "no reaction" against each footing — specific and readable,
    // where a globally disabled button explains nothing.
    expect(floorDesignReadiness({ shells: [], stresses: [], footings: [{ id: 1 }] }).ready)
      .toBe(true);
  });

  it('still refuses a project with neither shells nor footings', () => {
    const r = floorDesignReadiness({ shells: [], stresses: [], footings: [] });
    expect(r.ready).toBe(false);
    expect(r.reasons.map((m) => m.key)).toContain('detailing.floorRun.noShells');
  });

  it('still reports an unsolved shell model as not solved', () => {
    const r = floorDesignReadiness({ shells: [{ id: 1 }], stresses: [], footings: [] });
    expect(r.ready).toBe(false);
    expect(r.reasons.map((m) => m.key)).toContain('detailing.floorRun.notSolved');
  });
});
