import { expect, it } from 'vitest';
import { stepsEs as es, stepsEn as en, stepsPt as pt } from '../locales/steps';
import de from '../locales/steps/de';
import fr from '../locales/steps/fr';
import tr from '../locales/steps/tr';
import hu from '../locales/steps/hu';

it.each(Object.entries({ es, en, pt, de, fr, tr, hu }))(
  'known wrong result: #2099 — %s balances member-on-joint forces with the opposite support reaction',
  (_locale, dictionary) => {
    expect(dictionary['steps.trusses.compat.endsLeadTruss']).toContain('R = −ΣF_k − P');
  },
);
