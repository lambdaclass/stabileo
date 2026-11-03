import { describe, it, expect } from 'vitest';
import { timeHistoryRefusal, modalMechanismRefusal } from '../time-history-refusal';
import { teAt } from '../../../i18n/engine-text';

const engineText = 'TH-NONFINITE: Time history: the response is not finite (NaN or infinite) from step 12 (t = 0.024 s); no result is returned';

describe('timeHistoryRefusal', () => {
  it('reads the step and time of the non-finite refusal', () => {
    expect(timeHistoryRefusal(engineText)).toEqual({ key: 'pro.th.refusal.nonFinite', params: { step: 12, time: 0.024 } });
  });

  it('reads the refusal of non-finite peak reactions, which has no step', () => {
    const m = timeHistoryRefusal('TH-NONFINITE: Time history: the reactions at the peak response are not finite (NaN or infinite); no result is returned');
    expect(m).toEqual({ key: 'pro.th.refusal.nonFiniteReactions' });
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) expect(teAt(m!, locale), locale).not.toBe('pro.th.refusal.nonFiniteReactions');
  });

  it('leaves every other engine error to be shown as it is', () => {
    expect(timeHistoryRefusal('Ground acceleration history contains non-finite values')).toBeNull();
  });

  it('is translated in every offered language, with the step and time in it', () => {
    const m = timeHistoryRefusal(engineText)!;
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      const text = teAt(m, locale);
      expect(text, locale).not.toBe('pro.th.refusal.nonFinite');
      expect(text, locale).toContain('12');
      expect(text, locale).not.toContain('{');
    }
  });
});

describe('the refusals of a singular mass', () => {
  const cases = [
    ['TH-MASSLESS-MECHANISM: Time history: part of the model has neither mass nor stiffness in some direction (a massless mechanism), so its motion is undetermined; no result is returned', 'pro.th.refusal.masslessMechanism'],
    ['TH-MASS-SINGULAR: Time history: the mass matrix is singular in a direction that combines several DOFs, so the state at t = 0 cannot be computed; no result is returned', 'pro.th.refusal.massSingular'],
  ] as const;
  for (const [text, key] of cases) {
    it(`maps ${key} and translates it in every offered language`, () => {
      const m = timeHistoryRefusal(text);
      expect(m).toEqual({ key });
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) expect(teAt(m!, locale), locale).not.toBe(key);
    });
  }
});

describe('modalMechanismRefusal', () => {
  const engineText = 'MODAL-MECHANISM: Modal analysis: the structure is a mechanism: 2 mode(s) with zero or negative frequency (ω² ≤ 1e-10 rad²/s²); one (ω² = -3.100e-12) moves node 7 along ux without deforming, so a release, hinge or missing support lets part of the mass move freely. No modes are returned.';

  it('reads the count, the node and the direction', () => {
    expect(modalMechanismRefusal(engineText)).toEqual({ key: 'advanced.modalMechanism', params: { count: 2, node: 7, dof: 'ux' } });
  });

  it('is translated in every offered language, with the node in it', () => {
    const m = modalMechanismRefusal(engineText)!;
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      const text = teAt(m, locale);
      expect(text, locale).toContain('7');
      expect(text, locale).toContain('ux');
      expect(text, locale).not.toContain('{');
    }
  });

  it('leaves every other engine error alone', () => {
    expect(modalMechanismRefusal('Eigenvalue decomposition failed')).toBeNull();
  });
});
