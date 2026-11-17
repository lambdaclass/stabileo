import { expect, it } from 'vitest';
import { checkShear } from '../../engine/codes/argentina/cirsoc201';
import { verifyElement } from '../../engine/__tests__/helpers/verify-element';
import { isMessage } from '../../codes/message';
import { verificationStepText } from '../engine-text';
import { OFFERED_LOCALES } from '../offered';
import { ALL_DICTS } from '../locales/all';

const regression = it;
for (const direction of ['primary', 'secondary'] as const) {
  regression(`known wrong result: #2198 shear distribution failure is localized ${direction}`, () => {
    const params = { b: 0.8, h: 0.3, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420 };
    const result = direction === 'primary' ? checkShear(params, 1, 0, { legs: 2, spacing: 0.05 })
      : verifyElement({ ...params, b: params.h, h: params.b, elementId: 1, elementType: 'beam', Nu: 0, Mu: 0, Vu: 0, VuSecondary: 1 }).shearSecondary!;
    const message = result.steps.find(isMessage);
    expect(message).toEqual({ key: 'codes.cirsoc201.shear.legsInsufficient', params: {
      direction: { key: `codes.cirsoc201.shear.${direction}` }, legs: 2, requiredLegs: 4,
    } });
    if (!isMessage(message)) throw new Error('missing distribution explanation');
    for (const locale of OFFERED_LOCALES) {
      const text = verificationStepText(message, locale);
      expect(text).toContain('2');
      expect(text).toContain('4');
      expect(text).not.toMatch(/codes\.cirsoc201|\{|\}/);
      expect(text).not.toContain(`Ramas ${direction}`);
    }
    for (const [locale, dict] of Object.entries(ALL_DICTS)) {
      const template = dict[message.key];
      const label = dict[`codes.cirsoc201.shear.${direction}`];
      expect(template, locale).toContain('{requiredLegs}');
      expect(template, locale).toContain('{legs}');
      expect(label, locale).toBeTruthy();
      expect(label, locale).not.toMatch(/^(primary|secondary)$/);
      expect(template, locale).toContain('9.7.6.2.2');
    }
  });
}
