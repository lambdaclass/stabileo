import { expect, it } from 'vitest';
import { checkFlexure, checkSheetFlexure } from '../cirsoc201';

const params = { fc: 25, fy: 500, cover: 0.025, b: 0.25, h: 0.5, stirrupDia: 8 };

it.each(['2005', '2025'] as const)('keeps the released beam minimum for forwarded sheet options in edition %s', edition => {
  for (const moment of [-1, 0, 1, 262]) {
    const options = { edition, minimumExemption: true };
    const standard = checkFlexure(params, moment, 0, { edition });
    expect(checkFlexure(params, moment, 0, options)).toEqual(standard);
    expect(standard.AsReq).toBeGreaterThanOrEqual(standard.AsMin);
  }
});

it('returns the published reinforcement fields for a doubly reinforced beam', () => {
  const result = checkFlexure(params, 262, 0, { edition: '2025' });
  expect(result.isDoublyReinforced).toBe(true);
  expect(result).not.toHaveProperty('AsCompReq');
});

it('limits the optional minimum and compression requirement to the sheet designer', () => {
  const enabled = Boolean(__PUBLIC_FEATURES__.proRcSheets);
  for (const moment of [-1, 0, 1, 262]) {
    const standard = checkFlexure(params, moment);
    const sheet = checkSheetFlexure(params, moment, 0);
    if (!enabled) expect(sheet).toEqual(standard);
    else if (standard.AsFlexural < standard.AsMin) expect(sheet.AsReq).toBeLessThan(standard.AsReq);
    else expect(sheet.AsReq).toBe(standard.AsReq);
    expect(Object.hasOwn(sheet, 'AsCompReq')).toBe(enabled && moment === 262);
  }
});
