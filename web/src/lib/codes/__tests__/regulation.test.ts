import { describe, it, expect } from 'vitest';
import { msg } from '../message';
import { teAt } from '../../i18n/engine-text';
import {
  REGULATIONS, assertSameEdition, assumed, clause, collectAssumptions, derived,
  editionsOf, findRegulation, formatClause, fromCode, fromProject, needsAttention,
} from '../regulation';
import {
  CAPABILITY_KEYS, emptyMatrix, explainUnsupported, facets, gatingGaps, offers,
  summariseMatrix, supports, type CapabilityMatrix,
} from '../capability';
import {
  CODE_SETTINGS_VERSION, DAGG_ASSUMED_MM, DAGG_SHOTCRETE_MAX_MM, defaultCodeSettings,
  editionChangeNotice, migrateCodeSettings, resolveMaxAggregateSize,
  serialiseCodeSettings, validateMaxAggregateSize,
} from '../project-code-settings';

describe('regulation registry', () => {
  it('knows CIRSOC 201 in both editions and defaults nothing', () => {
    expect(editionsOf('cirsoc-201').sort()).toEqual(['2005', '2025']);
  });

  it('records the legal instrument for the 2025 editions', () => {
    const r = findRegulation('cirsoc-201', '2025');
    expect(r?.inForce?.instrument).toContain('11/2026');
    expect(r?.inForce?.effectiveFrom).toBe('2026-01-22');
  });

  it('makes no legal claim about the 2005 edition', () => {
    // Resolución 11/2026 does not explicitly derogate prior editions, so the app must
    // not assert that it did.
    expect(findRegulation('cirsoc-201', '2005')?.inForce).toBeNull();
  });

  it('records INPRES-CIRSOC 103 Parte II as the 2005 edition that was supplied', () => {
    // An earlier audit assumed 2021. The supplied document says Edición Julio 2005.
    expect(editionsOf('inpres-cirsoc-103-ii')).toEqual(['2005']);
  });

  it('has a converted text for every regulation that claims one', () => {
    for (const r of REGULATIONS) {
      if (r.textAvailable) expect(r.textKey, `${r.name} ${r.edition}`).toBeTruthy();
      else expect(r.textKey).toBeUndefined();
    }
  });
});

describe('clause references', () => {
  it('formats articles with a section sign and tables without one', () => {
    expect(formatClause(clause('cirsoc-201', '2025', '25.2.1'))).toBe('CIRSOC 201 2025 §25.2.1');
    expect(formatClause(clause('cirsoc-101', '2025', 'Tabla 4.1'))).toBe('CIRSOC 101 2025 Tabla 4.1');
  });

  it('accepts a rule set citing one edition per regulation', () => {
    expect(() => assertSameEdition([
      clause('cirsoc-201', '2025', '25.2.1'),
      clause('cirsoc-201', '2025', '25.2.3'),
      clause('cirsoc-101', '2025', '2.3.2'),
    ], 'spacing rules')).not.toThrow();
  });

  it('throws when one regulation is cited in two editions', () => {
    // This is the whole reason the guard exists: 2005 chapter 12 and 2025 chapter 25
    // cover the same subject under different numbers, and a certificate citing both
    // would be an incorrect engineering document, not a typo.
    expect(() => assertSameEdition([
      clause('cirsoc-201', '2025', '25.2.1'),
      clause('cirsoc-201', '2005', '12.2'),
    ], 'spacing rules')).toThrow(/mix cirsoc-201 editions 2025 and 2005/);
  });
});

describe('provenanced values', () => {
  it('marks only assumed values as needing attention', () => {
    expect(needsAttention(fromCode(0.85, []))).toBe(false);
    expect(needsAttention(fromProject(25))).toBe(false);
    expect(needsAttention(derived(1.2, []))).toBe(false);
    expect(needsAttention(assumed(20, msg('test.noProjectData')))).toBe(true);
  });

  it('collects assumption messages for the report block', () => {
    expect(collectAssumptions([
      fromCode(1, []), assumed(20, msg('test.daggNotStated')),
      assumed(1, msg('test.kztNotSurveyed')),
    ]).map((m) => m.key)).toEqual(['test.daggNotStated', 'test.kztNotSurveyed']);
  });
});

describe('capability matrix', () => {
  function matrixWith(overrides: Partial<Record<string, unknown>>): CapabilityMatrix {
    return Object.freeze({ ...emptyMatrix(), ...overrides }) as CapabilityMatrix;
  }

  it('starts with every capability off', () => {
    const m = emptyMatrix() as CapabilityMatrix;
    for (const k of CAPABILITY_KEYS) {
      expect(supports(m, k, 'verify'), k).toBe(false);
      expect(supports(m, k, 'generate'), k).toBe(false);
    }
  });

  it('does not offer a feature whose generate facet is false', () => {
    // The exact over-claim this model replaces: the verifier can rate a curtailment,
    // so `verify` is true, but the app cannot produce one, so the button must not render.
    const m = matrixWith({
      curtailment: { facets: facets({ verify: true }), refs: [] },
    });
    expect(offers(m, 'curtailment', ['verify'])).toBe(true);
    expect(offers(m, 'curtailment', ['generate', 'document'])).toBe(false);
  });

  it('always explains a refusal', () => {
    const m = matrixWith({
      jointShear: {
        facets: facets({}),
        refs: [clause('cirsoc-201', '2025', '15.4')],
        limitation: 'Joint free-body equilibrium not yet validated.',
        missingSolverOutput: 'per-joint equilibrium forces',
      },
    });
    const why = explainUnsupported(m, 'jointShear', ['verify']);
    expect(why?.missingFacets).toEqual(['verify']);
    expect(why?.limitation).toBeTruthy();
    expect(why?.missingSolverOutput).toBe('per-joint equilibrium forces');
  });

  it('returns null when the capability is in fact offered', () => {
    const m = matrixWith({ beamFlexure: { facets: facets({ verify: true }), refs: [] } });
    expect(explainUnsupported(m, 'beamFlexure', ['verify'])).toBeNull();
  });

  it('reports a gated unsupported capability as blocking completeness', () => {
    const m = matrixWith({
      slabsTwoWay: { facets: facets({ gate: true }), refs: [] },
      beamTorsion: { facets: facets({}), refs: [] }, // unsupported but ungated
    });
    expect(gatingGaps(m, ['slabsTwoWay', 'beamTorsion'])).toEqual(['slabsTwoWay']);
  });

  it('summarises deterministically', () => {
    const a = summariseMatrix(emptyMatrix() as CapabilityMatrix);
    const b = summariseMatrix(emptyMatrix() as CapabilityMatrix);
    expect(a).toBe(b);
    expect(a).toContain('beamFlexure:-----');
  });
});

describe('maximum aggregate size (CIRSOC 201-2025 §25.2 / §26.4)', () => {
  it('uses project data when stated, with project provenance', () => {
    const v = resolveMaxAggregateSize({ maxAggregateSizeMm: 25, shotcrete: false });
    expect(v.value).toBe(25);
    expect(v.origin).toBe('project');
    expect(needsAttention(v)).toBe(false);
  });

  it('never presents the fallback as a regulatory default', () => {
    const v = resolveMaxAggregateSize({ maxAggregateSizeMm: null, shotcrete: false });
    expect(v.value).toBe(DAGG_ASSUMED_MM);
    expect(v.origin).toBe('assumed');
    expect(needsAttention(v)).toBe(true);
    expect(v.assumption?.key).toBe('codes.aggregate.assumed');
    expect(teAt(v.assumption!, 'es')).toMatch(/NO es un valor por defecto reglamentario/);
    expect(teAt(v.assumption!, 'en')).toMatch(/NOT a regulatory default/);
  });

  it('accepts a value that satisfies all three §26.4.2.1(a)(5) limits', () => {
    const r = validateMaxAggregateSize(20, {
      leastFormDimensionMm: 200, slabThicknessMm: 120, minClearSpacingMm: 30,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects d_agg above 1/5 of the least form dimension', () => {
    const r = validateMaxAggregateSize(25, { leastFormDimensionMm: 100 });
    expect(r.ok).toBe(false);
    expect(r.problems[0].message.key).toBe('codes.aggregate.formDimension');
    expect(teAt(r.problems[0].message, 'es')).toMatch(/1\/5 de la menor separación/);
    expect(teAt(r.problems[0].message, 'en')).toMatch(/1\/5 of the narrowest dimension/);
    expect(r.problems[0].refs[0].clause).toBe('26.4.2.1(a)(5)');
  });

  it('rejects d_agg above 1/3 of the slab thickness', () => {
    expect(validateMaxAggregateSize(40, { slabThicknessMm: 100 }).ok).toBe(false);
  });

  it('rejects d_agg above 3/4 of the specified minimum clear spacing', () => {
    // §26.4.2.1(a)(5)(iii) is §25.2.1 seen from the other side: spacing >= (4/3)dagg.
    const r = validateMaxAggregateSize(25, { minClearSpacingMm: 30 });
    expect(r.ok).toBe(false);
    expect(r.problems[0].refs.map((x) => x.clause)).toContain('25.2.1');
  });

  it('is exactly consistent with the §25.2.1 spacing rule at the boundary', () => {
    // spacing = (4/3) * 24 = 32 mm -> dagg = 24 is admissible, 24.1 is not.
    expect(validateMaxAggregateSize(24, { minClearSpacingMm: 32 }).ok).toBe(true);
    expect(validateMaxAggregateSize(24.1, { minClearSpacingMm: 32 }).ok).toBe(false);
  });

  it('caps shotcrete at 13 mm', () => {
    expect(validateMaxAggregateSize(20, {}, true).ok).toBe(false);
    expect(validateMaxAggregateSize(DAGG_SHOTCRETE_MAX_MM, {}, true).ok).toBe(true);
  });

  it('rejects out-of-range values without cascading bogus problems', () => {
    const r = validateMaxAggregateSize(500, { leastFormDimensionMm: 100 });
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(1);
  });
});

describe('project code settings migration', () => {
  it('defaults new projects to the edition in force', () => {
    const s = defaultCodeSettings();
    expect(s.concreteEdition).toBe('2025');
    expect(s.version).toBe(CODE_SETTINGS_VERSION);
  });

  it('migrates a project with no code settings to 2005, not to the 2025 default', () => {
    // Those results were produced by a verifier implementing 2005 rules. Re-stamping
    // them as 2025 would misrepresent what they were checked against.
    const { settings, notices } = migrateCodeSettings(undefined);
    expect(settings.concreteEdition).toBe('2005');
    expect(notices.map((n) => n.key)).toContain('codes.migration.legacyProject');
  });

  it('preserves a stated edition and aggregate size', () => {
    const { settings } = migrateCodeSettings({
      version: 1, concreteEdition: '2025', loadEdition: '2025', windEdition: '2025',
      jurisdiction: { name: 'CABA', basis: 'adopted' },
      concrete: { maxAggregateSizeMm: 19, shotcrete: false },
    });
    expect(settings.concrete.maxAggregateSizeMm).toBe(19);
    expect(settings.jurisdiction.basis).toBe('adopted');
  });

  it('warns when a migrated project has no aggregate size', () => {
    const { notices } = migrateCodeSettings({ version: 1, concrete: { maxAggregateSizeMm: null } });
    expect(notices.find((n) => n.key === 'codes.migration.aggregateAssumed')?.severity).toBe('warning');
  });

  it('rejects a garbage edition rather than trusting it', () => {
    const { settings } = migrateCodeSettings({ concreteEdition: '1999' });
    expect(settings.concreteEdition).toBe('2025');
  });

  it('round-trips through JSON unchanged', () => {
    const original = defaultCodeSettings();
    original.concrete.maxAggregateSizeMm = 25;
    original.jurisdiction = { name: 'Provincia de Buenos Aires', basis: 'adopted', instrument: 'Ley 1234' };
    const { settings } = migrateCodeSettings(serialiseCodeSettings(original));
    expect(settings).toEqual(original);
  });

  it('warns when the user moves a project between editions', () => {
    expect(editionChangeNotice('2005', '2005')).toBeNull();
    expect(editionChangeNotice('2005', '2025')?.severity).toBe('warning');
  });
});
