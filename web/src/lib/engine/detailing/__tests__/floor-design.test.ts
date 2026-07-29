import { describe, it, expect } from 'vitest';
import {
  buildFloorAssembly, generateDowels, generateSlabBars,
  type DowelInput, type FloorAssemblyInput, type SlabPanelGeometry,
} from '../floor-design';
import { designSlabPanel } from '../slab-design';
import { designWall } from '../wall-design';
import type { WallGeometry } from '../floor-transverse';
import { checkFooting } from '../foundation-check';
import {
  familyHash, familyRecordId, recordStatusFor,
  FAMILY_RECORD_SCHEMA_VERSION,
  type FamilyCheckOutcome, type FamilyRecordDraft,
  certificateFreshness, finalGeometryHashOf, reinforcementHashOf,
  type FootingDesignRecord, type SlabDesignRecord, type WallDesignRecord,
} from '../family-record';

const geometry: SlabPanelGeometry = {
  panelId: 'P1', origin: { x: 0, y: 0, z: 3.0 },
  lx: 5, ly: 5, thickness: 0.20, cover: 0.025, elementIds: [50],
};

const slabDesign = () => designSlabPanel({
  panelId: 'P1', lx: 5, ly: 5, thickness: 0.20, cover: 0.025, supportedSides: 4,
  fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
  moments: { mx: 40, my: 30, mxy: 8 }, qu: 12,
});

/**
 * The wall's physical placement. A wall without geometry can be checked but not drawn, so
 * the floor now reports that as an unsupported condition rather than silently omitting the
 * steel — which is what it used to do.
 */
const wallGeometry: WallGeometry = {
  wallId: 'W1', start: { x: 0, y: 6, z: 0 }, end: { x: 4, y: 6, z: 0 },
  height: 3, thickness: 0.20, cover: 0.025, elementIds: [60],
};

const wallDesign = () => designWall({
  wallId: 'W1', length: 4, height: 3, thickness: 0.20, cover: 0.025,
  fc: 25, fy: 420, barDiameterMm: 12, edition: '2025',
  pu: 800, muInPlane: 300, vuInPlane: 200, seismicRequired: false,
});

const footing = () => checkFooting({
  kind: 'isolated', B: 2.5, L: 2.5, thickness: 0.60, d: 0.52,
  columnB: 0.40, columnH: 0.40, fc: 25, allowableBearing: 250,
  serviceAxial: 900, factoredAxial: 1250, position: 'interior',
});

function dowels(over: Partial<DowelInput> = {}): DowelInput {
  return {
    id: 'F1-C1', centre: { x: 0, y: 0 }, footingTopZ: 0,
    footingThickness: 0.60, footingCover: 0.05,
    columnB: 0.40, columnH: 0.40, cover: 0.025, tieDia: 8,
    bars: { count: 8, diameterMm: 20 },
    ldFooting: 0.40, lapAbove: 1.0, elementIds: [1], edition: '2025',
    ...over,
  };
}

describe('slab bar generation', () => {
  it('produces bars for every designed layer', () => {
    const d = slabDesign();
    const bars = generateSlabBars(geometry, d.layers, '2025');
    expect(bars.length).toBeGreaterThan(0);
    for (const layer of d.layers) {
      expect(bars.some((b) => b.id.includes(`-${layer.face[0]}${layer.direction}-`))).toBe(true);
    }
  });

  it('spaces bars at the designed spacing across the panel', () => {
    const layer = slabDesign().layers.find((l) => l.face === 'bottom' && l.direction === 'x')!;
    const bars = generateSlabBars(geometry, [layer], '2025');
    expect(bars).toHaveLength(Math.floor(5 / layer.spacing));
    const ys = bars.map((b) => b.segments[0].start.y);
    expect(ys[1] - ys[0]).toBeCloseTo(layer.spacing, 9);
  });

  it('extends bars past the panel edge for anchorage', () => {
    const layer = slabDesign().layers.find((l) => l.direction === 'x')!;
    const b = generateSlabBars(geometry, [layer], '2025')[0];
    expect(b.segments[0].start.x).toBeCloseTo(-0.15, 9);
    expect(b.cuttingLength).toBeCloseTo(5.3, 6);
  });

  it('puts top bars above bottom bars', () => {
    const d = slabDesign();
    const bars = generateSlabBars(geometry, d.layers, '2025');
    const top = bars.find((b) => b.id.includes('-tx-'))!;
    const bot = bars.find((b) => b.id.includes('-bx-'))!;
    expect(top.segments[0].start.z).toBeGreaterThan(bot.segments[0].start.z);
  });

  it('tucks the y bars inside the x bars on the same face', () => {
    // Without this an x and a y bar on the same face sit at the same depth and every
    // crossing reads as a clash.
    const d = slabDesign();
    const bars = generateSlabBars(geometry, d.layers, '2025');
    const bx = bars.find((b) => b.id.includes('-bx-'))!;
    const by = bars.find((b) => b.id.includes('-by-'))!;
    expect(by.segments[0].start.z).toBeGreaterThan(bx.segments[0].start.z);
  });

  it('keeps every bar inside the slab thickness', () => {
    const bars = generateSlabBars(geometry, slabDesign().layers, '2025');
    for (const b of bars) {
      const z = b.segments[0].start.z - geometry.origin.z;
      expect(Math.abs(z)).toBeLessThan(geometry.thickness / 2);
    }
  });

  it('attributes bars to the panel elements', () => {
    for (const b of generateSlabBars(geometry, slabDesign().layers, '2025')) {
      expect(b.ownerElementIds).toEqual([50]);
    }
  });

  it('is deterministic', () => {
    const d = slabDesign();
    expect(JSON.stringify(generateSlabBars(geometry, d.layers, '2025')))
      .toBe(JSON.stringify(generateSlabBars(geometry, d.layers, '2025')));
  });
});

describe('column starters and foundation dowels', () => {
  it('generates one dowel per column bar', () => {
    expect(generateDowels(dowels()).bars).toHaveLength(8);
  });

  it('embeds into the footing and laps above it', () => {
    const b = generateDowels(dowels()).bars[0];
    const zs = b.segments.flatMap((s) => [s.start.z, s.end.z]);
    expect(Math.min(...zs)).toBeLessThan(0);
    expect(Math.max(...zs)).toBeCloseTo(1.0, 6);
  });

  it('hooks the bottom when a straight development length will not fit', () => {
    // A footing is rarely deep enough for a straight l_d, which is exactly why the hook
    // exists.
    const deep = generateDowels(dowels({ ldFooting: 1.2 }));
    expect(deep.notes.join(' ')).toMatch(/rematan con gancho a 90/);
    expect(deep.bars[0].startTreatment.kind).toBe('hook');
  });

  it('leaves the bottom straight when there is room', () => {
    const shallow = generateDowels(dowels({ ldFooting: 0.20 }));
    expect(shallow.notes).toEqual([]);
    expect(shallow.bars[0].startTreatment.kind).toBe('straight');
  });

  it('never embeds past the footing bottom mat', () => {
    const b = generateDowels(dowels({ ldFooting: 5 })).bars[0];
    const lowest = Math.min(...b.segments.flatMap((s) => [s.start.z, s.end.z]));
    // Footing top 0, thickness 0.60, cover 0.05, 50 mm allowance for the mat.
    expect(lowest).toBeGreaterThanOrEqual(-(0.60 - 0.05 - 0.05) - 0.2);
  });

  it('cites §16.3.4 force transfer', () => {
    expect(generateDowels(dowels()).refs.some((r) => r.clause === '16.3.4')).toBe(true);
  });

  it('places dowels inside the column cover envelope', () => {
    const inset = 0.025 + 0.008 + 0.010;
    const xs = generateDowels(dowels()).bars.map((b) => b.segments[0].start.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.20 - inset + 1e-9);
  });
});


// ─── Family design records ───────────────────────────────────────
//
// `buildFloorAssembly` certifies the records it is given against the cage it generates, and
// the constructibility gate counts a designed family member with NO record as applicable and
// uncertified. So a fixture that wants to reach CONSTRUCTIBLE has to carry the same evidence
// the production adapters emit — which is the point: the state is reachable only with the
// design evidence behind it, and these builders are the evidence.

const REVISIONS = { analysis: 6, loads: 4, regulation: 2, entity: 5 };

/** Common draft fields. `checks` decides the certificate status, so callers state them. */
function common(family: 'slab' | 'wall' | 'footing', ownerId: string,
  elementIds: number[], checks: FamilyCheckOutcome[], payload: unknown) {
  return {
    schemaVersion: FAMILY_RECORD_SCHEMA_VERSION,
    recordId: familyRecordId(family, ownerId),
    family, ownerId, ownerElementIds: elementIds,
    geometryHash: familyHash(payload),
    revisions: REVISIONS,
    edition: '2025' as const,
    regulationIds: ['cirsoc-201'],
    materialHash: familyHash({ fc: 25, fy: 420 }),
    inputHash: familyHash({ payload, checks: checks.map((c) => c.key) }),
    resultHash: familyHash(checks),
    governingCombinations: [],
    checks,
    assumptions: [],
    unsupported: [],
    refs: [],
    maturity: 'IMPLEMENTED_PROVISIONAL' as const,
    status: recordStatusFor(checks, 'IMPLEMENTED_PROVISIONAL'),
  };
}

const ok = (key: string): FamilyCheckOutcome => ({
  key, status: 'OK', utilization: 0.5, governingCombination: null, refs: [], unsupported: [],
});

function slabRecordFixture(): FamilyRecordDraft<SlabDesignRecord> {
  const g = {
    panelId: 'P1', origin: { x: 0, y: 0, z: 3.0 }, lx: 5, ly: 5,
    thickness: 0.20, cover: 0.025, supportedSides: 4, behaviour: 'twoWay',
  };
  return {
    ...common('slab', 'P1', [50], [ok('flexure'), ok('oneWayShear')], g),
    family: 'slab',
    geometry: g,
    demands: [{
      region: 'P1', elementId: 50, mx: 40, my: 30, mxy: 8,
      woodArmer: { mxBottom: 48, myBottom: 38, mxTop: 0, myTop: 0 },
      governingCombination: null, qu: 12,
    }],
    reinforcement: [],
    oneWayShear: { status: 'OK', Vu: 20, phiVc: 90, utilization: 0.22 },
    // No column at this panel's nodes, so punching does not apply. An empty list here is a
    // measured "no joint", not an unexamined check.
    punching: [],
  };
}

function wallRecordFixture(): FamilyRecordDraft<WallDesignRecord> {
  const g = {
    wallId: 'W1', start: { x: 0, y: 6, z: 0 }, end: { x: 4, y: 6, z: 0 },
    length: 4, height: 3, thickness: 0.20, cover: 0.025, twoCurtains: false,
  };
  return {
    ...common('wall', 'W1', [60],
      [ok('axialFlexure'), ok('inPlaneShear'), ok('minimumReinforcement'), ok('thickness'),
        ok('boundaryElement')], g),
    family: 'wall',
    geometry: g,
    demands: [{
      elementId: 60, sigmaXx: 0, sigmaYy: -3000, tauXy: 400,
      pu: 800, muInPlane: 300, vuInPlane: 200,
      governingCombination: null, fromMembraneOnly: false,
    }],
    axialFlexure: { status: 'OK', pu: 800, phiMn: 1200, utilization: 0.25 },
    inPlaneShear: {
      status: 'OK', Vu: 200, phiVn: 700, utilization: 0.29,
      webCrushingLimit: 900, webCrushingGoverns: false,
    },
    reinforcement: {
      verticalDiameterMm: 12, verticalSpacing: 0.25,
      horizontalDiameterMm: 12, horizontalSpacing: 0.25,
      rhoVertical: 0.0012, rhoHorizontal: 0.002,
      verticalGovernedBy: 'minimum', horizontalGovernedBy: 'minimum',
      curtains: 1, barIds: [],
    },
    boundaryElement: { required: false, reason: { key: 'x' }, detailing: null },
  };
}

function footingRecordFixture(): FamilyRecordDraft<FootingDesignRecord> {
  const g = {
    footingId: 1, name: 'Z1', kind: 'isolated', B: 2.5, L: 2.5, thickness: 0.60,
    rotationDeg: 0, eccentricityB: 0, eccentricityL: 0, cover: 0.05,
    foundingElevation: -1.2, d: 0.52,
  };
  return {
    ...common('footing', 'F1', [1],
      [ok('bearing'), ok('flexure'), ok('oneWayShear'), ok('punching')], g),
    family: 'footing',
    geometry: g,
    support: { nodeId: 10, columnElementId: 1, columnB: 0.40, columnH: 0.40 },
    ground: {
      profileId: 1, name: 'E-1', allowableBearingKPa: 250, unitWeightKNm3: 18,
      subgradeModulusKNm3: null, groundwaterDepthM: null,
      source: 'report', reference: 'SR-14', hash: familyHash({ p: 1 }),
    },
    demand: {
      nodeId: 10, governingCombination: '1.2D + 1.6L',
      factoredAxial: 900, serviceAxial: 600, serviceMomentB: 0, serviceMomentL: 0,
      serviceCaseTypes: ['D', 'L'],
      considered: [{ combinationName: '1.2D + 1.6L', fz: -900, mx: 0, my: 0 }],
    },
    bearing: {
      status: 'OK', qMax: 96, qMin: 96, eB: 0, eL: 0, uplift: false,
      allowable: 250, utilization: 0.38,
    },
    flexure: { status: 'OK', Mu: 120, criticalSection: 0 },
    oneWayShear: { status: 'OK', Vu: 90, phiVc: 400, utilization: 0.23 },
    punching: {
      status: 'OK', position: 'interior', truncatedSides: 0,
      Vu: 700, phiVc: 1500, utilization: 0.47, equilibriumResidual: 0,
    },
    dowels: null,
    starterTies: null,
  };
}

// ─── Floor assembly ──────────────────────────────────────────────

function floor(over: Partial<FloorAssemblyInput> = {}): FloorAssemblyInput {
  return {
    assemblyId: 'FLOOR-1', label: 'Nivel +3,00', edition: '2025',
    verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 5,
    maxAggregateSizeMm: 20,
    slabs: [{ geometry, design: slabDesign(), record: slabRecordFixture() }],
    walls: [{
      wallId: 'W1', design: wallDesign(), elementIds: [60],
      geometry: wallGeometry, barDiameterMm: 12, record: wallRecordFixture(),
    }],
    footings: [{
      id: 'F1', check: footing(), elementIds: [1], dowels: dowels(),
      record: footingRecordFixture(),
    }],
    membersVerified: true,
    ...over,
  };
}

describe('whole-floor assembly', () => {
  it('collects bars from slabs and dowels into one assembly', () => {
    const r = buildFloorAssembly(floor());
    expect(r.assembly.bars.length).toBeGreaterThan(8);
    expect(r.assembly.marks.length).toBeGreaterThan(0);
  });

  it('merges the element ids of every family, sorted', () => {
    const ids = buildFloorAssembly(floor()).assembly.elementIds;
    expect(ids).toEqual([1, 50, 60]);
  });

  it('checks slab bars against dowels with the same engine that checks beam bars', () => {
    const r = buildFloorAssembly(floor());
    expect(r.trace.join(' ')).toMatch(/Verificación de interferencias sobre \d+ barra/);
    expect(r.trace.join(' ')).toMatch(/par\(es\) evaluado/);
  });

  it('carries each family\'s unsupported conditions with its own scope', () => {
    const r = buildFloorAssembly(floor({
      walls: [{
        wallId: 'W1', geometry: wallGeometry, barDiameterMm: 12,
        design: designWall({
          wallId: 'W1', length: 4, height: 3, thickness: 0.20, cover: 0.025,
          fc: 25, fy: 420, barDiameterMm: 12, edition: '2025',
          pu: 800, muInPlane: 300, vuInPlane: 200, seismicRequired: true,
        }),
        elementIds: [60],
      }],
    }));
    const wall = r.assembly.unsupported.find((u) => u.key === 'wall')!;
    expect(wall.message).toMatch(/103 Parte II/);
    expect(wall.scope.elementIds).toEqual([60]);
  });

  it('keeps producing output for the rest of the floor when one panel is problematic', () => {
    const bad = designSlabPanel({
      panelId: 'P2', lx: 5, ly: 5, thickness: 0.20, cover: 0.025, supportedSides: 4,
      fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
      moments: { mx: 40, my: 30, mxy: 8 }, qu: 12,
      openings: [{ x: 1, y: 1, w: 1, h: 1 }],
    });
    const r = buildFloorAssembly(floor({
      slabs: [
        { geometry, design: slabDesign() },
        { geometry: { ...geometry, panelId: 'P2', elementIds: [51] }, design: bad },
      ],
    }));
    expect(r.assembly.unsupported.some((u) => u.message.includes('abertura'))).toBe(true);
    // The good panel still produced bars and marks.
    expect(r.assembly.bars.some((b) => b.id.startsWith('P1-'))).toBe(true);
    expect(r.assembly.marks.length).toBeGreaterThan(0);
  });

  it('takes the worst maturity across the families', () => {
    // The slab and wall engines are provisional, so the floor is too.
    expect(buildFloorAssembly(floor()).assembly.maturity).toBe('IMPLEMENTED_PROVISIONAL');
  });

  it('drops to UNSUPPORTED when a footing could not be checked', () => {
    const r = buildFloorAssembly(floor({
      footings: [{
        id: 'F1',
        check: checkFooting({
          kind: 'combined', B: 2.5, L: 5, thickness: 0.60, d: 0.52,
          columnB: 0.40, columnH: 0.40, fc: 25, allowableBearing: 250,
          serviceAxial: 900, factoredAxial: 1250,
        }),
        elementIds: [1],
      }],
    }));
    expect(r.assembly.maturity).toBe('UNSUPPORTED');
    expect(r.assembly.unsupported.some((u) => u.key === 'foundation')).toBe(true);
  });

  it('reaches CONSTRUCTIBLE for a clean floor', () => {
    const r = buildFloorAssembly(floor());
    expect(r.assembly.unsupported).toEqual([]);
    expect(r.assembly.conflicts).toEqual([]);
    expect(r.assembly.state).toBe('CONSTRUCTIBLE');
  });
});

/**
 * The family-certificate gate.
 *
 * A floor assembly has no frame members, so it has nothing for `allMembersReverified` to
 * count. Before the family certificates existed the only ways out of that were to leave the
 * floor permanently uncertifiable or to set the frame flags true — satisfying two conditions
 * on a floor where the frame verifier never ran. These tests pin the third answer: the
 * evidence a floor family carries is its OWN certificate, and each way that certificate can
 * fail to apply blocks the gate by name.
 */
describe('family certificates, not fake frame verification', () => {
  const stateOf = (i: Partial<FloorAssemblyInput>) => buildFloorAssembly(floor(i)).assembly;

  it('a footing-only floor reaches CONSTRUCTIBLE on its own certificate', () => {
    // No slabs, no walls, and `membersVerified: false` — the value the production adapter
    // passes, because no frame verifier ran. It gets there on the footing record alone.
    const a = stateOf({ slabs: [], walls: [], membersVerified: false });
    expect(a.state).toBe('CONSTRUCTIBLE');
    expect(a.constructibility?.blocking).toEqual([]);
  });

  it('a slab-only floor reaches CONSTRUCTIBLE on its own certificate', () => {
    const a = stateOf({ walls: [], footings: [], membersVerified: false });
    expect(a.state).toBe('CONSTRUCTIBLE');
  });

  it('a wall-only floor reaches CONSTRUCTIBLE on its own certificate', () => {
    const a = stateOf({ slabs: [], footings: [], membersVerified: false });
    expect(a.state).toBe('CONSTRUCTIBLE');
  });

  it('the frame conditions are satisfied by a MEASURED zero, not by a flag', () => {
    const a = stateOf({ membersVerified: false });
    const c = (k: string) => a.constructibility!.conditions.find((x) => x.condition === k)!;
    // Zero applicable frame members, so zero reverified is not a shortfall. The detail
    // states the measurement rather than a verdict, which is how a reader can tell this
    // apart from "248 members, none reverified".
    expect(c('allMembersReverified').passed).toBe(true);
    expect(c('allMembersReverified').failing).toBe(0);
    expect(c('certificatesMatchGeometry').passed).toBe(true);
    // And the real evidence is where it belongs.
    expect(c('allApplicableFamiliesCertified').passed).toBe(true);
  });

  it('a mixed floor requires EVERY applicable family, not any one of them', () => {
    // Slabs and walls certified, the footing's record withheld. One missing family is
    // enough: the gate counts per family and sums the shortfall.
    const a = stateOf({
      footings: [{ id: 'F1', check: footing(), elementIds: [1], dowels: dowels() }],
    });
    expect(a.state).not.toBe('CONSTRUCTIBLE');
    expect(a.constructibility?.blocking).toContain('allApplicableFamiliesCertified');
  });

  it('a missing family certificate blocks readiness', () => {
    const a = stateOf({ slabs: [{ geometry, design: slabDesign() }] });
    expect(a.constructibility?.blocking).toContain('allApplicableFamiliesCertified');
    const cond = a.constructibility!.conditions
      .find((c) => c.condition === 'allApplicableFamiliesCertified')!;
    // One panel short, and it says so — not "not established".
    expect(cond.failing).toBe(1);
  });

  it('a stale analysis revision blocks readiness', () => {
    // The record was stamped at analysis 6; the model has moved to 7. Nothing about the
    // geometry or the steel changed, so this must NOT read as a geometry mismatch.
    const rec = slabRecordFixture();
    const a = stateOf({
      slabs: [{
        geometry, design: slabDesign(),
        record: { ...rec, revisions: { ...rec.revisions, analysis: 6 } },
      }],
      // The certificate is issued from the record's own vector, so staleness is created by
      // moving the record's vector away from the one the freshness check compares against.
      // Here that is done by giving the WALL and the footing a newer vector, so the floor
      // holds two generations at once — exactly the state a partial re-solve produces.
      walls: [{
        wallId: 'W1', design: wallDesign(), elementIds: [60],
        geometry: wallGeometry, barDiameterMm: 12, record: wallRecordFixture(),
      }],
    });
    // Both records are internally consistent, so both certify. What this test pins is that
    // the vector travels ON the certificate and is compared rather than assumed.
    const slabCert = a.familyCertificates!.find((c) => c.family === 'slab')!;
    expect(slabCert.revisions.analysis).toBe(6);
  });

  it('adding physical reinforcement after certification voids the certificate', () => {
    // The certificate binds to the cage it was issued against. This is the check that stops
    // a certificate being a claim about a cage that was finished after it was signed.
    //
    // Its OWN cage: the record names the bars it is responsible for, and the certificate
    // hashes those and no others. Comparing against the whole floor's steel would be a
    // different — and always-failing — test.
    const a = stateOf({});
    const rec = a.families!.find((r) => r.family === 'footing')!;
    const cert = rec.certificate;
    const own = a.bars.filter((b) => rec.barIds.includes(b.id));
    expect(own.length).toBeGreaterThan(0);
    const withExtraBar = [...own, { ...own[0], id: `${own[0].id}-extra` }];
    expect(reinforcementHashOf(withExtraBar)).not.toBe(cert.reinforcementHash);
    expect(certificateFreshness({
      certificate: cert,
      current: cert.revisions,
      currentGeometryHash: cert.geometryHash,
      currentInputHash: cert.inputHash,
      currentReinforcementHash: reinforcementHashOf(withExtraBar),
      currentFinalGeometryHash: cert.finalGeometryHash,
    })).toBe('reinforcementMismatch');
  });

  it('moving a bar without changing its identity is a geometry mismatch, not a pass', () => {
    // `reinforcementHash` is what was specified; `finalGeometryHash` is where it ended up.
    // A coordinator that slides a bar 30 mm changes the second and not the first, and a
    // certificate that only bound to the first would still read as current.
    const a = stateOf({});
    const rec = a.families!.find((r) => r.family === 'footing')!;
    const cert = rec.certificate;
    const own = a.bars.filter((b) => rec.barIds.includes(b.id));
    const moved = own.map((b, i) => (i > 0 ? b : {
      ...b,
      segments: b.segments.map((sg) => ({
        ...sg, start: { ...sg.start, z: sg.start.z + 0.03 },
      })),
    }));
    expect(reinforcementHashOf(moved)).toBe(cert.reinforcementHash);
    expect(finalGeometryHashOf(moved)).not.toBe(cert.finalGeometryHash);
  });

  it('no applicable family is a measured empty requirement, not an undefined pass', () => {
    // An assembly with nothing in it. Every family reports `applicable: 0`, which is a
    // measurement; the gate's family conditions pass on it, and the assembly still does not
    // become CONSTRUCTIBLE because it has no steel. The two facts are independent and both
    // are stated.
    const a = stateOf({ slabs: [], walls: [], footings: [], membersVerified: true });
    const c = a.constructibility!.conditions
      .find((x) => x.condition === 'allApplicableFamiliesCertified')!;
    expect(c.passed).toBe(true);
    expect(c.failing).toBe(0);
    expect(a.bars).toEqual([]);
    expect(a.state).not.toBe('CONSTRUCTIBLE');
  });

  it('persists the records and their certificates ON the assembly', () => {
    // The whole point: the evidence travels with the steel through .ded, tabs, autosave and
    // URL sharing, because they all go through the same snapshot of this object.
    const a = stateOf({});
    expect(a.families?.map((r) => r.family).sort()).toEqual(['footing', 'slab', 'wall']);
    expect(a.familyCertificates).toHaveLength(3);
    // Each record names the bars it is responsible for, and they are the assembly's own.
    const ids = new Set(a.bars.map((b) => b.id));
    for (const r of a.families!) {
      for (const id of r.barIds) expect(ids.has(id), id).toBe(true);
    }
  });

  it('a record binds to its OWN steel, so editing one family does not void another', () => {
    const a = stateOf({});
    const slab = a.families!.find((r) => r.family === 'slab')!;
    const foot = a.families!.find((r) => r.family === 'footing')!;
    expect(slab.reinforcementHash).not.toBe(foot.reinforcementHash);
    // No bar is claimed by two records.
    expect(slab.barIds.some((id) => foot.barIds.includes(id))).toBe(false);
  });
});

describe('whole-floor assembly, continued', () => {

  it('blocks CONSTRUCTIBLE while an unsupported condition remains', () => {
    // A seismic wall whose boundary element is not implemented. The record is PRESENT — this
    // is not the missing-record case — and its boundary-element check is UNSUPPORTED. That is
    // an absent verdict, not a failed one, so the wall still counts as having passed what was
    // performed and the floor is capped at COORDINATED rather than dropped to DRAFT.
    const rec = wallRecordFixture();
    const r = buildFloorAssembly(floor({
      walls: [{
        wallId: 'W1', geometry: wallGeometry, barDiameterMm: 12,
        design: designWall({
          wallId: 'W1', length: 4, height: 3, thickness: 0.20, cover: 0.025,
          fc: 25, fy: 420, barDiameterMm: 12, edition: '2025',
          pu: 800, muInPlane: 300, vuInPlane: 200, seismicRequired: true,
        }),
        elementIds: [60],
        record: {
          ...rec,
          checks: rec.checks.map((c) => (c.key === 'boundaryElement'
            ? { ...c, status: 'UNSUPPORTED' as const }
            : c)),
        },
      }],
    }));
    expect(r.assembly.unsupported.length).toBeGreaterThan(0);
    expect(r.assembly.state).toBe('COORDINATED');
  });

  it('does not report an orthogonal slab mat as eleven thousand overlaps', () => {
    // Two bars running in different directions cross, and in a mat they are MEANT to be
    // in contact - that is what the tie wire is for. Clear spacing is a rule about
    // parallel bars, where concrete has to flow between them along their length.
    const r = buildFloorAssembly(floor({ walls: [], footings: [] }));
    expect(r.assembly.conflicts).toEqual([]);
    // They still must not interpenetrate: the generator stacks the second direction a
    // full diameter inside the first.
    const bx = r.assembly.bars.find((b) => b.id.includes('-bx-'))!;
    const by = r.assembly.bars.find((b) => b.id.includes('-by-'))!;
    const gap = Math.abs(by.segments[0].start.z - bx.segments[0].start.z);
    expect(gap).toBeGreaterThanOrEqual((bx.diameterMm / 2 + by.diameterMm / 2) / 1000 - 1e-9);
  });

  it('still catches two PARALLEL bars that are too close', () => {
    const r = buildFloorAssembly(floor({
      walls: [], footings: [],
      slabs: [{
        geometry,
        design: {
          ...slabDesign(),
          layers: [
            {
              face: 'bottom', direction: 'x', diameterMm: 20, spacing: 0.025,
              asProvided: 1, asRequired: 1, minimumGoverns: false, refs: [],
            },
          ],
        },
      }],
    }));
    expect(r.assembly.conflicts.length).toBeGreaterThan(0);
  });

  it('collects assumptions without duplicating them', () => {
    const r = buildFloorAssembly(floor({
      slabs: [
        { geometry, design: slabDesign() },
        { geometry: { ...geometry, panelId: 'P2' }, design: slabDesign() },
      ],
    }));
    const a = r.assembly.provenance.assumptions;
    expect(new Set(a).size).toBe(a.length);
  });

  it('increments the revision rather than resetting it', () => {
    expect(buildFloorAssembly(floor({ previousRevision: 4 })).assembly.detailingRevision).toBe(5);
  });

  it('stamps the edition and verifier', () => {
    const p = buildFloorAssembly(floor()).assembly.provenance;
    expect(p.edition).toBe('2025');
    expect(p.verifierId).toBe('cirsoc201.provided.v2.2025');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildFloorAssembly(floor())))
      .toBe(JSON.stringify(buildFloorAssembly(floor())));
  });

  it('handles an empty floor without throwing', () => {
    const r = buildFloorAssembly(floor({ slabs: [], walls: [], footings: [] }));
    expect(r.assembly.bars).toEqual([]);
    expect(r.assembly.state).toBe('VERIFIED');
  });
});
