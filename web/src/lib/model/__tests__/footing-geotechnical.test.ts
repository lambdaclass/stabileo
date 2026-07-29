import { describe, it, expect } from 'vitest';
import {
  NEW_FOOTING_THICKNESS_M, footingEffectiveDepth, migrateFootings, newFooting,
  validateFooting, type Footing,
} from '../footing';
import {
  emptyGeotechnical, findProfile, geotechnicalAssumptions, migrateGeotechnical,
  newSoilProfile, validateSoilProfile, type SoilProfile,
} from '../geotechnical';

const baseFooting = (over: Partial<Footing> = {}): Footing => ({
  ...newFooting(1, 10, 'Z1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 3 }),
  B: 1.8,
  L: 2.2,
  ...over,
});

describe('the footing entity', () => {
  it('starts UNDIMENSIONED, so it cannot pass a check nobody made', () => {
    const f = newFooting(7, 10, 'Z7', { cover: 0.05, foundingElevation: 0, soilProfileId: null });
    // The whole posture of the entity: a plausible default size would silently pass a
    // bearing check the engineer never performed.
    expect(f.B).toBe(0);
    expect(f.L).toBe(0);
    expect(f.thickness).toBe(NEW_FOOTING_THICKNESS_M);
    expect(validateFooting(f).filter((i) => i.severity === 'blocking')).not.toHaveLength(0);
  });

  it('accepts a dimensioned isolated footing with no blocking issues', () => {
    expect(validateFooting(baseFooting()).filter((i) => i.severity === 'blocking'))
      .toHaveLength(0);
  });

  it('refuses cover that consumes the section', () => {
    // Without this, `d` reaches zero, every shear utilisation becomes Infinity, and the
    // result reads as a failure whose cause is unrecoverable from the numbers.
    const issues = validateFooting(baseFooting({ thickness: 0.4, cover: 0.2 }));
    expect(issues.some((i) =>
      i.severity === 'blocking' && i.message.key === 'footing.issue.coverExceedsThickness',
    )).toBe(true);
  });

  it('refuses an eccentricity that puts the column off the base', () => {
    const issues = validateFooting(baseFooting({ B: 1.8, eccentricityB: 0.9 }));
    expect(issues.some((i) => i.message.key === 'footing.issue.eccentricityOutside')).toBe(true);
  });

  it('allows an eccentricity that is merely large — it is a real design device', () => {
    // A footing beside a property line is deliberately eccentric. Refusing it would
    // refuse a correct design.
    const issues = validateFooting(baseFooting({ B: 1.8, eccentricityB: 0.5 }));
    expect(issues.filter((i) => i.severity === 'blocking')).toHaveLength(0);
  });

  it('refuses a pedestal larger than its own footing', () => {
    const issues = validateFooting(baseFooting({ pedestal: { B: 2.5, L: 0.4, height: 0.5 } }));
    expect(issues.some((i) =>
      i.message.key === 'footing.issue.pedestalLargerThanFooting')).toBe(true);
  });

  it('reports a non-isolated kind as ADVISORY, not as a geometry error', () => {
    // A mat is a modelled intent the engine cannot check yet. It has to be visible as an
    // unsupported capability — not as a dimensioning mistake, and not silently checked as
    // though it were isolated.
    const issues = validateFooting(baseFooting({ kind: 'mat' }));
    expect(issues.filter((i) => i.severity === 'blocking')).toHaveLength(0);
    expect(issues.some((i) =>
      i.severity === 'advisory' && i.message.key === 'footing.issue.kindUnsupported')).toBe(true);
  });

  it('derives an effective depth that never goes negative', () => {
    expect(footingEffectiveDepth(baseFooting({ thickness: 0.6, cover: 0.05 }), 16))
      .toBeCloseTo(0.534, 3);
    // A footing thinner than its own cover is invalid, but the arithmetic must not hand a
    // negative `d` to a shear check that would then report a nonsense utilisation.
    expect(footingEffectiveDepth(baseFooting({ thickness: 0.04, cover: 0.05 }), 16)).toBe(0);
  });
});

describe('footing migration', () => {
  it('drops a footing with no usable node instead of repairing it', () => {
    // Inventing a node would MOVE someone's foundation. Dropping it with a notice is the
    // only honest option.
    const m = migrateFootings([[1, { id: 1, B: 1, L: 1 }]], { cover: 0.05 });
    expect(m.footings.size).toBe(0);
    expect(m.notices.map((n) => n.key)).toContain('footing.migration.droppedNoNode');
  });

  it('reads [id, value] pairs and fills absent numbers with stated fallbacks', () => {
    const m = migrateFootings([[4, { id: 4, nodeId: 9, B: 2 }]], { cover: 0.03 });
    const f = m.footings.get(4)!;
    expect(f.B).toBe(2);
    expect(f.L).toBe(0);
    expect(f.cover).toBe(0.03);
    expect(f.thickness).toBe(NEW_FOOTING_THICKNESS_M);
    expect(f.revision).toBe(1);
  });

  it('falls back to isolated for an unknown kind rather than carrying it', () => {
    const m = migrateFootings(
      [[1, { id: 1, nodeId: 2, kind: 'raft-on-piles-with-jacuzzi' }]], { cover: 0.05 },
    );
    expect(m.footings.get(1)!.kind).toBe('isolated');
  });

  it('returns nothing for a project that predates footings', () => {
    expect(migrateFootings(undefined, { cover: 0.05 }).footings.size).toBe(0);
  });
});

describe('project geotechnical data', () => {
  it('a new stratum has its resistance UNSTATED', () => {
    // Naming a stratum is not knowing its capacity. Seeding 200 kPa would put an invented
    // number behind a name the engineer chose, which reads as theirs.
    const p = newSoilProfile(1, 'Limo arcilloso');
    expect(p.bearing.kind).toBe('unstated');
    expect(p.provenance.source).toBe('unstated');
  });

  it('reports unstated bearing as BLOCKING', () => {
    const issues = validateSoilProfile(newSoilProfile(1, 'S1'));
    expect(issues.some((i) =>
      i.severity === 'blocking' && i.message.key === 'geotechnical.issue.bearingUnstated',
    )).toBe(true);
  });

  it('separates "not stated" from a stated zero', () => {
    // Zero would sail through a `!= null` guard and divide into a utilisation of Infinity.
    const p: SoilProfile = {
      ...newSoilProfile(1, 'S1'),
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 0 },
    };
    expect(validateSoilProfile(p).some((i) =>
      i.message.key === 'geotechnical.issue.bearingNotPositive')).toBe(true);
  });

  it('treats an ASSUMED bearing pressure as advisory, not blocking', () => {
    // Assuming a pressure pending the soil report is ordinary practice. Refusing to design
    // until the report arrives would make the tool useless in the phase that needs it.
    const p: SoilProfile = {
      ...newSoilProfile(1, 'S1'),
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 220 },
      provenance: { source: 'assumed', reference: 'pending study, comparable site' },
    };
    expect(validateSoilProfile(p).filter((i) => i.severity === 'blocking')).toHaveLength(0);
    expect(geotechnicalAssumptions(p).map((a) => a.key))
      .toContain('geotechnical.assumption.assumed');
  });

  it('flags an assumption with no stated basis', () => {
    const p: SoilProfile = {
      ...newSoilProfile(1, 'S1'),
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 220 },
      provenance: { source: 'assumed', reference: '   ' },
    };
    expect(validateSoilProfile(p).some((i) =>
      i.message.key === 'geotechnical.issue.assumedWithoutBasis')).toBe(true);
  });

  it('says groundwater is RECORDED rather than acted on', () => {
    // Storing it silently would imply a buoyancy check that does not exist.
    const p: SoilProfile = { ...newSoilProfile(1, 'S1'), groundwaterDepthM: 2.5 };
    expect(geotechnicalAssumptions(p).map((a) => a.key))
      .toContain('geotechnical.assumption.groundwaterRecordedOnly');
  });

  it('leaves an unused subgrade modulus alone', () => {
    // Null is the ordinary state for a project that never runs Winkler, and must not block
    // an isolated-footing check that never reads it.
    const p: SoilProfile = {
      ...newSoilProfile(1, 'S1'),
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 200 },
      provenance: { source: 'report', reference: 'EG-2026-14' },
    };
    expect(p.subgradeModulusKNm3).toBeNull();
    expect(validateSoilProfile(p).filter((i) => i.severity === 'blocking')).toHaveLength(0);
  });
});

describe('geotechnical migration', () => {
  it('gives a project that predates foundations an EMPTY set, not a seeded stratum', () => {
    // Founding someone's footings on an invented stratum is worse than having none.
    expect(migrateGeotechnical(undefined).geotechnical).toEqual(emptyGeotechnical());
  });

  it('drops a non-finite stored pressure to unstated and says so', () => {
    const m = migrateGeotechnical({
      version: 1,
      profiles: [{ id: 1, name: 'S1', bearing: { kind: 'allowablePressure', allowableBearingKPa: null } }],
    });
    expect(m.geotechnical.profiles[0].bearing.kind).toBe('unstated');
    expect(m.notices.map((n) => n.key)).toContain('geotechnical.migration.bearingDropped');
  });

  it('repairs a default pointing at a profile that no longer exists', () => {
    const m = migrateGeotechnical({
      version: 1, defaultProfileId: 99,
      profiles: [{ id: 2, name: 'S2' }],
    });
    expect(m.geotechnical.defaultProfileId).toBe(2);
  });

  it('finds a profile by id and tolerates absent data', () => {
    const geo = migrateGeotechnical({ version: 1, profiles: [{ id: 5, name: 'S5' }] }).geotechnical;
    expect(findProfile(geo, 5)?.name).toBe('S5');
    expect(findProfile(geo, 6)).toBeUndefined();
    expect(findProfile(undefined, 5)).toBeUndefined();
    expect(findProfile(geo, null)).toBeUndefined();
  });
});
