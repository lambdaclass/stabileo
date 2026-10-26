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

/**
 * The project's bottom-mat preferences, at the migration default.
 *
 * Ø16 both ways is what the private `DEFAULT_FOOTING_BAR_DIA_MM` constant used to supply, so
 * every existing expectation in this file is still being asserted against the same effective
 * depth it was written for.
 */
const MAT_PREFS = {
  bottomMatDiameterXmm: 16,
  bottomMatDiameterYmm: 16,
  bottomMatSpacingPolicy: 'AUTO_CODE_COMPLIANT',
  bottomMatLayerOrder: 'AUTO',
} as const;

const run = (over: Partial<RunFootingDesignInput> = {}) => runFootingDesign({
  footings: [footing()],
  geotechnical: geo(),
  nodes: new Map([[10, { x: 0, y: 0, z: -1.2 }]]),
  columns: new Map([[3, column()]]),
  reactions: new Map([[10, reactions()]]),
  fc: 25, fy: 420, edition: '2025', matPreferences: MAT_PREFS, maxAggregateSizeMm: 20,
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

  it('checks every combination, and the worst one governs even with less axial', () => {
    // 1.2D + 1.6L carries the most axial; 1.2D + W carries less, with a moment the punching
    // check now carries as eccentric shear (8.4.4.2). Only the largest vertical used to be
    // read, so the footing came out checked on gravity alone with the wind case never looked at.
    const r = run({ reactions: new Map([[10, reactions({
      factored: [
        { combinationId: 1, combinationName: '1.2D + 1.6L', fz: -900, mx: 0, my: 0 },
        { combinationId: 3, combinationName: '1.2D + W', fz: -800, mx: 0, my: 180 },
      ],
    })]]) });
    const o = r.outcomes[0];
    expect(o.governingCombination).toBe('1.2D + W');
    // The engine that checks isolated footings does not evaluate 8.4.4.2 yet: a significant
    // moment leaves the punching unverified, which is what governs here (the design stack's
    // TypeScript evaluation applies to slabs; see foundation-check.test.ts).
    expect(o.check!.punching!.momentTransfer.status).toBe('UNSUPPORTED_MOMENT_TRANSFER_NOT_EVALUATED');
    // Gravity alone still checks.
    const alone = run({ reactions: new Map([[10, reactions({
      factored: [{ combinationId: 1, combinationName: '1.2D + 1.6L', fz: -900, mx: 0, my: 0 }],
    })]]) }).outcomes[0];
    expect(alone.check!.status).not.toBe('UNSUPPORTED');
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
      reactions: rx, fc: 25, fy: 420, edition: '2025', matPreferences: MAT_PREFS, maxAggregateSizeMm: 20,
      revisions: REVISIONS, regulationIds: ['cirsoc-201'],
    });
    const reversed = runFootingDesign({
      footings: [...two].reverse(), geotechnical: geo(), nodes,
      columns: new Map([[3, column()]]),
      reactions: rx, fc: 25, fy: 420, edition: '2025', matPreferences: MAT_PREFS, maxAggregateSizeMm: 20,
      revisions: REVISIONS, regulationIds: ['cirsoc-201'],
    });
    expect(reversed.outcomes.map((o) => o.footingId)).toEqual(forward.outcomes.map((o) => o.footingId));
    expect(reversed.entriesByLevel.get(-1.2)!.map((e) => e.id))
      .toEqual(forward.entriesByLevel.get(-1.2)!.map((e) => e.id));
  });
});

/**
 * PR18-A: the production path now designs the bottom mat, and must be honest about what it
 * has NOT done. Every assertion here is about the seam between the two.
 */
describe('the bottom-mat design on the production path', () => {
  it('designs both directions of a checked footing', () => {
    const o = run().outcomes[0];
    expect(o.mat).not.toBeNull();
    expect(o.mat!.status).toBe('DESIGNED');
    expect(o.mat!.x.barCount).toBeGreaterThan(0);
    expect(o.mat!.y.barCount).toBeGreaterThan(0);
  });

  it('reproduces `check.Mu` EXACTLY in direction X', () => {
    // Same cantilever, same distribution width, same trapezoid — direction X is the moment
    // `checkFooting` has always reported, and the record carries one number for it, not two.
    // If these ever diverge the project holds two answers about the same footing.
    const o = run().outcomes[0];
    expect(o.mat!.x.Mu).toBeCloseTo(o.check!.Mu, 12);
    expect(o.record.flexure!.Mu).toBeCloseTo(o.mat!.x.Mu, 12);
  });

  it('adds the direction Y demand the check never had', () => {
    // A square footing makes them equal, so the point is made on a rectangular one.
    const o = run({ footings: [footing({ B: 1.5, L: 3.0 })] }).outcomes[0];
    expect(o.mat!.y.Mu).not.toBeCloseTo(o.check!.Mu, 1);
    expect(o.mat!.y.Mu).toBeGreaterThan(0);
  });

  it('verifies flexure once the physical mat exists and reconciles (R, S)', () => {
    // PR18-A kept this UNSUPPORTED unconditionally and said why: there were no bars to verify
    // the demand against. There are now, so OK is a statement that can be true — and it is
    // reached by the GEOMETRY existing, not by a decision to stop reporting the limitation.
    const o = run({ footings: [footing({ B: 2.5, L: 2.5 })] }).outcomes[0];
    expect(o.record.flexure!.bottomMat!.status).toBe('DESIGNED');
    expect(o.matGeometry!.status).toBe('MODELED');
    expect(o.record.flexure!.status).toBe('OK');
    const flexureCheck = o.record.checks.find((c) => c.key === 'flexure')!;
    expect(flexureCheck.status).toBe('OK');
    // The blanket designed-not-modelled limitation is GONE, not merely demoted.
    expect(keysOf(flexureCheck.unsupported)).toEqual([]);
  });

  it('still refuses flexure when no layer order could be resolved', () => {
    // The narrow case the designed-not-modelled message now means: a complete design with no
    // physical arrangement to draw it at. A 0,20 m footing at Ø16 leaves d under §13.3.1.2's
    // 150 mm in both arrangements, so neither is admissible.
    const o = run({ footings: [footing({ thickness: 0.20 })] }).outcomes[0];
    expect(o.mat!.layerOrder.status).toBe('NOT_ESTABLISHED');
    expect(o.matGeometry!.status).toBe('NOT_MODELED');
    expect(keysOf(o.matGeometry!.notModeled)).toContain('footing.geometry.noLayerOrder');
    expect(o.record.flexure!.status).not.toBe('OK');
  });

  it('reports the DESIGN as modelling nothing, and top steel as NOT_EVALUATED (R)', () => {
    const o = run({ footings: [footing({ B: 2.5, L: 2.5 })] }).outcomes[0];
    // `designFootingMat` still models no geometry, and its own field still says so. That is
    // not a leftover: the statement is about that function, and the physical mat is produced
    // by a different one whose status is carried separately.
    expect(o.mat!.geometry).toBe('REQUIRED_NOT_MODELED');
    expect(o.mat!.topReinforcement).toBe('NOT_EVALUATED');
    // Top steel is reported on the footing as an unsupported CONDITION — visible, and blocking
    // issuance — rather than as a failed check that would drag the bottom mat down with it.
    expect(keysOf(o.unsupported))
      .toContain('footing.record.topReinforcementNotEvaluated');
    expect(o.record.checks.map((c) => c.key)).not.toContain('topReinforcement');
  });

  it('carries the physical mat on the assembly entry (S)', () => {
    // Asserted as the EXACT key set, the same gate PR18-A used to prove the absence, now
    // proving what replaced it: one new field and nothing else.
    const entry = run({ footings: [footing({ B: 2.5, L: 2.5 })] })
      .entriesByLevel.get(-1.2)![0];
    expect(Object.keys(entry).sort())
      .toEqual(['check', 'dowels', 'elementIds', 'id', 'matBars', 'record']);
    expect(entry.matBars.length).toBeGreaterThan(0);

    // The DESIGN's region shape is unchanged: it still carries numbers and no bar identities,
    // because bar identity belongs to the geometry layer and not to the schedule that asked
    // for it. A region that had grown a `barIds` field would mean the design had started
    // owning geometry.
    const region = run().outcomes[0].record.flexure!.bottomMat!.x.regions[0];
    expect(Object.keys(region).sort()).toEqual([
      'asProvided', 'asRequired', 'barCount', 'centreOffset', 'distributionShare',
      'governedBy', 'kind', 'layoutModel', 'policyRegionalMinimum', 'spacingCentre',
      'spacingClear', 'touchesEdge', 'width',
    ]);
  });

  it('states the two flexural depths and the separate punching depth', () => {
    const o = run().outcomes[0];
    const mat = o.mat!;
    // The punching check keeps the averaged two-layer depth it always used…
    expect(o.check!.punching!.critical.d).toBeCloseTo(mat.punchingD, 12);
    // …and it is NOT either flexural depth.
    expect(mat.punchingD).not.toBeCloseTo(mat.x.d, 4);
    expect(keysOf(o.assumptions)).toContain('footing.assumption.flexuralDepths');
  });

  it('keeps punching and shear bit-identical at the 16/16 default', () => {
    // The averaged depth is now taken at the mean of the two selected diameters, which is
    // exactly the previous single value whenever they are equal. A project on the default must
    // therefore see no change at all in the checks PR18-A did not touch.
    const o = run().outcomes[0];
    expect(o.check!.punching!.critical.d).toBeCloseTo(0.5 - 0.05 - 0.016, 12);
    expect(o.check!.oneWayShear!.Vu).toBeGreaterThan(0);
  });

  it('changes the material hash when a mat diameter changes', () => {
    // Editing the mat is editing the design inputs, so a stored certificate must not survive
    // it. The hash is what makes that automatic instead of remembered.
    const base = run().outcomes[0].record;
    const changed = run({
      matPreferences: { ...MAT_PREFS, bottomMatDiameterXmm: 20 },
    }).outcomes[0].record;
    expect(changed.materialHash).not.toBe(base.materialHash);
    expect(changed.inputHash).not.toBe(base.inputHash);
    expect(changed.resultHash).not.toBe(base.resultHash);
  });

  it('surfaces a mat design failure as a named condition on the footing', () => {
    // A footing too thin for its bars: §13.3.1.2's 150 mm least effective depth.
    const o = run({ footings: [footing({ thickness: 0.1 })] }).outcomes[0];
    if (o.mat) {
      expect(o.mat.status).not.toBe('DESIGNED');
      expect(keysOf(o.unsupported).some((k) => k.startsWith('footing.mat.'))).toBe(true);
    } else {
      // Rejected earlier by the geometry gate, which is also an acceptable refusal.
      expect(o.check).toBeNull();
    }
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

  it('takes a rotated footing through the general path, its moments turned with it', () => {
    const o = run({ footings: [footing({ rotationDeg: 30 })] }).outcomes[0]!;
    expect(o.general).toBeDefined();
    // (400 + 200 service + 25·0,5·4 weight) / 4 m².
    expect(o.check!.bearing.qMax).toBeCloseTo(162.5, 6);
    expect(o.entry!.matBars.length).toBeGreaterThan(0);
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
      fc: 25, fy: 420, edition: '2025', matPreferences: MAT_PREFS, maxAggregateSizeMm: 20,
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

describe('the general path inside the run', () => {
  const two = new Map([[10, { x: 0, y: 0, z: -1.2 }], [11, { x: 4, y: 0, z: -1.2 }]]);
  it('checks a combined footing under two columns and lays both mats', () => {
    const r = run({
      footings: [footing({ kind: 'combined', B: 6, L: 2, thickness: 0.6, eccentricityB: 2, supportedNodeIds: [11] })],
      nodes: two, columnAt: () => column({ elementId: 4 }),
      reactions: new Map([[10, reactions()], [11, reactions()]]),
    });
    const o = r.outcomes[0]!;
    expect(o.check).not.toBeNull();
    expect(o.general!.kind).toBe('combined');
    // Between the columns the top is in tension: the top mat exists.
    expect(o.general!.mats.topX).not.toBeNull();
    expect(o.record.checks.map((c) => c.key)).toEqual(['bearing', 'oneWayShear', 'punching', 'flexure', 'overturning']);
    expect(keysOf(o.unsupported)).toContain('footing.general.startersNotModeled');
    expect([...r.entriesByLevel.values()].flat()).toHaveLength(1);
  });

  it('takes an isolated footing whose base lifts in part to the rigid base', () => {
    const big = reactions({
      factored: [{ combinationId: 1, combinationName: '1.2D + W', fz: -600, mx: 0, my: 300 }],
      cases: [{ caseId: 1, caseType: 'D', fz: -600, mx: 0, my: 300 }],
    });
    const o = run({ footings: [footing({ B: 2.4, L: 2.4 })], reactions: new Map([[10, big]]) }).outcomes[0]!;
    expect(o.general).toBeDefined();
    const rigid = 'rigid' in o.general!.result ? o.general!.result.rigid : null;
    // e = 300 / (600 + 25·0,5·2,4²) = 0,446 m past B/6 = 0,40 m: 3·(1,2 − 0,446)/2,4 of the base bears.
    expect(rigid!.service.contact).toBeCloseTo((3 * (1.2 - 300 / 672)) / 2.4, 1);
    expect(o.check!.bearing.uplift).toBe(true);
  });

  it('checks a pile cap on its piles, with their capacity from the strata', () => {
    const p = profile({ strata: [{ name: 'Limo', thickness: 20, shaftFrictionKPa: 30, tipResistanceKPa: 2000 }] });
    const o = run({
      geotechnical: geo(p),
      footings: [footing({ kind: 'pileCap', B: 2.3, L: 2.3, thickness: 0.9, piles: { count: 4, diameter: 0.4, length: 12, spacing: 1.5 } })],
    }).outcomes[0]!;
    expect(o.general).toBeDefined();
    expect('cap' in o.general!.result).toBe(true);
    // 30·π·0,4·12 + 2000·π·0,2² = 452,4 + 251,3 kN per pile.
    expect(o.record.bearing!.allowable).toBeCloseTo(703.7, 1);
    expect(keysOf(o.assumptions)).toContain('footing.assumption.pileBearing');
  });

  it('still refuses a mat', () => {
    expect(keysOf(run({ footings: [footing({ kind: 'mat' })] }).outcomes[0]!.unsupported)).toContain('footing.run.kindNotImplemented');
  });
});

describe('runFootingDesign — a strap beam', () => {
  it('checks the eccentric footing centred, relieves its partner, and states the strap\'s demand', () => {
    const z1 = footing({ eccentricityB: 0.6, B: 2.4, L: 2.0, straps: [{ toFootingId: 2, b: 0.4, h: 0.6 }] });
    const z2 = footing({ id: 2, nodeId: 20, name: 'Z2', columnElementId: 4 });
    const r = run({
      footings: [z1, z2],
      nodes: new Map([[10, { x: 0, y: 0, z: -1.2 }], [20, { x: 5, y: 0, z: -1.2 }]]),
      columns: new Map([[3, column()], [4, column({ elementId: 4 })]]),
      reactions: new Map([[10, reactions()], [20, reactions()]]),
    });
    const [o1, o2] = r.outcomes;
    const all = JSON.stringify(r);
    expect(all).toContain('footing.assumption.strap"');
    expect(all).toContain('footing.assumption.strapOneWay');
    expect(all).toContain('footing.assumption.strapSteel');
    expect(all).toContain('footing.assumption.strapRelief');
    // Both are checked, the eccentric one centred.
    expect(o1!.check).not.toBeNull(); expect(o2!.check).not.toBeNull();
  });
});

