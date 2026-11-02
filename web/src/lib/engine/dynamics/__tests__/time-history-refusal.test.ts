import { describe, it, expect } from 'vitest';
import { timeHistoryRefusal } from '../time-history-refusal';
import { teAt } from '../../../i18n/engine-text';

const engineText = 'TH-NONFINITE: Time history: the response is not finite (NaN or infinite) from step 12 (t = 0.024 s); no result is returned';

describe('timeHistoryRefusal', () => {
  it('reads the step and time of the non-finite refusal', () => {
    expect(timeHistoryRefusal(engineText)).toEqual({ key: 'pro.th.refusal.nonFinite', params: { step: 12, time: 0.024 } });
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
