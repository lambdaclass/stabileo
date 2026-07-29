/**
 * Placement tolerance: the research result, and the distinction it forces.
 *
 * CIRSOC Table 26.6.2.1(a) prescribes tolerances for the effective depth and the cover. It
 * prescribes NONE for the transverse spacing between parallel bars. The 10 mm the detailing
 * engine has been using on clear spacing therefore has no clause behind it, and these tests
 * pin it as a visible project assumption rather than a code value.
 *
 * The separation matters because conflating the two vetoed arrangements the verifier had
 * already certified: a 28Ø12 column at 46.9 mm clear against a 40 mm requirement was refused
 * for being under 40 + 10.
 */
import { describe, it, expect } from 'vitest';
import {
  assessSpacing, prescribedTolerances, worstCaseEffectiveDepth,
  DEFAULT_PLACEMENT_POLICY, DEFAULT_SPACING_MARGIN_M, normaliseMargin,
} from '../placement';
import { teAt } from '../../../i18n/engine-text';

describe('Table 26.6.2.1(a) — what CIRSOC does prescribe', () => {
  it('gives ±10 mm on d at or below the 200 mm band', () => {
    expect(prescribedTolerances(0.180, 0.030, '2025').depth).toBeCloseTo(0.010, 9);
  });

  it('gives ±15 mm on d above it', () => {
    expect(prescribedTolerances(0.560, 0.030, '2025').depth).toBeCloseTo(0.015, 9);
  });

  it('takes the LESSER of the flat limit and a third of the cover', () => {
    // 30 mm cover: a third is 10 mm, below the 15 mm flat limit for a deep member.
    expect(prescribedTolerances(0.560, 0.030, '2025').cover).toBeCloseTo(0.010, 9);
    // 60 mm cover: a third is 20 mm, so the 15 mm flat limit governs.
    expect(prescribedTolerances(0.560, 0.060, '2025').cover).toBeCloseTo(0.015, 9);
  });

  it('holds the bottom face to the stricter 5 mm of footnote [1]', () => {
    expect(prescribedTolerances(0.560, 0.030, '2025').bottomCover).toBeCloseTo(0.005, 9);
  });

  it('cites the table', () => {
    const refs = prescribedTolerances(0.5, 0.03, '2025').refs.map((r) => r.clause);
    expect(refs).toContain('Tabla 26.6.2.1(a)');
  });

  it('re-verification uses the unfavourable end of the d band', () => {
    const { d } = worstCaseEffectiveDepth(0.560, 0.030, '2025');
    expect(d).toBeCloseTo(0.545, 9);
  });
});

describe('the default additional margin is ZERO', () => {
  const CODE = 0.040;

  it('is exactly 0 mm', () => {
    expect(DEFAULT_SPACING_MARGIN_M).toBe(0);
    expect(DEFAULT_PLACEMENT_POLICY.spacingAllowance).toBe(0);
  });

  it('makes the target equal the code minimum', () => {
    const a = assessSpacing({ codeMinimum: CODE, achievedNominalClear: CODE });
    expect(a.targetNominalClear).toBeCloseTo(CODE, 9);
  });

  it('lets a code-minimum layout be placement-robust', () => {
    // The regulatory minimum IS the construction requirement. Nothing further is implied,
    // and a cage drawn to it no longer fails its own check.
    const a = assessSpacing({ codeMinimum: CODE, achievedNominalClear: CODE });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
    expect(a.worstCasePlacedClear).toBeCloseTo(CODE, 9);
  });

  it('adds no caveat, because zero asserts nothing beyond the regulation', () => {
    const a = assessSpacing({ codeMinimum: CODE, achievedNominalClear: CODE });
    expect(a.allowanceIsAssumed).toBe(false);
    expect(a.assumption).toBeUndefined();
  });

  it('rejects a negative margin rather than loosening the code', () => {
    expect(normaliseMargin(-0.005)).toBe(0);
    expect(normaliseMargin(null)).toBe(0);
    expect(normaliseMargin(Number.NaN)).toBe(0);
    expect(normaliseMargin(0.005)).toBeCloseTo(0.005, 9);
  });
});

describe('a positive project margin makes the target stricter', () => {
  const CODE = 0.040;
  const POLICY = { spacingAllowance: 0.010, stated: true };

  it('raises the target by exactly that amount', () => {
    const a = assessSpacing({
      codeMinimum: CODE, achievedNominalClear: CODE, policy: POLICY,
    });
    expect(a.targetNominalClear).toBeCloseTo(CODE + 0.010, 9);
  });

  it('leaves a code-minimum layout LEGAL but not robust', () => {
    // Structurally verified, and below the project's own target: the combination that must
    // keep the certificate and withhold CONSTRUCTIBLE.
    const a = assessSpacing({
      codeMinimum: CODE, achievedNominalClear: CODE, policy: POLICY,
    });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(false);
    expect(a.worstCasePlacedClear).toBeCloseTo(CODE - 0.010, 9);
  });

  it('at the raised target: legal AND robust', () => {
    const a = assessSpacing({
      codeMinimum: CODE, achievedNominalClear: CODE + 0.010, policy: POLICY,
    });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
  });
});

describe('code compliance and placement robustness stay separate answers', () => {
  const CODE = 0.040;

  it('below the minimum: neither', () => {
    const a = assessSpacing({ codeMinimum: CODE, achievedNominalClear: 0.035 });
    expect(a.codeLegal).toBe(false);
    expect(a.placementRobust).toBe(false);
  });

  it('the real 28Ø12 case is legal AND robust at the zero default', () => {
    // 46.9 mm against 40 mm required. Under the old hardcoded 10 mm it was refused a cage
    // outright; at the decided default it is simply what it always was — compliant.
    const a = assessSpacing({ codeMinimum: 0.040, achievedNominalClear: 0.0469 });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
  });

  it('…and becomes non-robust only if the PROJECT asks for more', () => {
    const a = assessSpacing({
      codeMinimum: 0.040, achievedNominalClear: 0.0469,
      policy: { spacingAllowance: 0.010, stated: true },
    });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(false);
  });

  it('reports all seven fields', () => {
    const a = assessSpacing({ codeMinimum: CODE, achievedNominalClear: 0.055 });
    expect(Object.keys(a)).toEqual(expect.arrayContaining([
      'codeMinimum', 'achievedNominalClear', 'placementAllowance',
      'worstCasePlacedClear', 'codeLegal', 'placementRobust', 'targetNominalClear',
    ]));
  });
});

describe('an ADDED margin is attributed; the zero default is not', () => {
  it('flags an unstated non-zero margin, and says CIRSOC does not set it', () => {
    const a = assessSpacing({
      codeMinimum: 0.040, achievedNominalClear: 0.040,
      policy: { spacingAllowance: 0.010, stated: false },
    });
    expect(a.allowanceIsAssumed).toBe(true);
    for (const locale of ['en', 'es']) {
      const text = teAt(a.assumption!, locale);
      expect(text).not.toBe(a.assumption!.key);
      expect(text).toMatch(/CIRSOC/);
    }
  });

  it('drops the flag once the project has stated a value', () => {
    const a = assessSpacing({
      codeMinimum: 0.040, achievedNominalClear: 0.040,
      policy: { spacingAllowance: 0.005, stated: true },
    });
    expect(a.allowanceIsAssumed).toBe(false);
    expect(a.assumption).toBeUndefined();
    expect(a.worstCasePlacedClear).toBeCloseTo(0.035, 9);
  });

  it('a stated allowance of zero makes legal and robust coincide', () => {
    const a = assessSpacing({
      codeMinimum: 0.040, achievedNominalClear: 0.040,
      policy: { spacingAllowance: 0, stated: true },
    });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
  });

  it('the default policy adds nothing and claims nothing', () => {
    expect(DEFAULT_PLACEMENT_POLICY.stated).toBe(false);
    expect(DEFAULT_PLACEMENT_POLICY.spacingAllowance).toBe(0);
  });
});
