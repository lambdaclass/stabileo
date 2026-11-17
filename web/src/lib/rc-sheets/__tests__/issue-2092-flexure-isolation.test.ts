import { expect, it } from 'vitest';
import { checkFlexure } from '../../engine/codes/argentina/cirsoc201';

const params = { fc: 30, fy: 420, b: 0.3, h: 0.8, cover: 0.025, stirrupDia: 8 };

it('known wrong result: #2092 sheet minimum policy cannot alter canonical engine flexure answers', () => {
  for (const edition of ['2005', '2025'] as const) {
    for (const moment of [0, 25, 216.265, 309.248, 10000]) {
      for (const flange of [undefined, { bf: 1.2, hf: 0.12 }]) {
        const options = { edition, ...(flange ? { flange } : {}) };
        const canonical = checkFlexure(params, moment, 0, options);
        const sheetFlag = checkFlexure(params, moment, 0, { ...options, ...{ minimumExemption: true } });
        expect({ AsReq: sheetFlag.AsReq, bars: sheetFlag.bars, status: sheetFlag.status, phiMn: sheetFlag.phiMn }).toEqual({ AsReq: canonical.AsReq, bars: canonical.bars, status: canonical.status, phiMn: canonical.phiMn });
      }
    }
  }
});
