import { expect, it } from 'vitest';
import { checkFlexure } from '../cirsoc201';

const params = { fc: 25, fy: 500, cover: 0.025, b: 0.25, h: 0.5, stirrupDia: 8 };

it.skip.each(['2005', '2025'] as const)('keeps the released beam minimum for forwarded sheet options in edition %s (known wrong result: #1928)', edition => {
  for (const moment of [-1, 0, 1, 262]) {
    const options = { edition, minimumExemption: true };
    const standard = checkFlexure(params, moment, 0, { edition });
    expect(checkFlexure(params, moment, 0, options)).toEqual(standard);
    expect(standard.AsReq).toBeGreaterThanOrEqual(standard.AsMin);
  }
});

it.skip('returns the published reinforcement fields for a doubly reinforced beam (known wrong result: #1928)', () => {
  const result = checkFlexure(params, 262, 0, { edition: '2025' });
  expect(result.isDoublyReinforced).toBe(true);
  expect(result).not.toHaveProperty('AsCompReq');
});
