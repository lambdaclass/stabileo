import { expect, it } from 'vitest';
import { classifyEnclosure, computeWindPressures, internalPressureCoefficient } from '../wind';
const wrong = process.env.RUN_KNOWN_WRONG === '2203' ? it : it.skip;
wrong('known wrong result: #2203 one open wall and three closed walls is partially enclosed', () => {
  const input = { a0: 90, ag: 100, a0i: 0, agi: 300, walls: [{ openings: 90, gross: 100 }, ...Array.from({ length: 3 }, () => ({ openings: 0, gross: 100 }))], roof: { openings: 0, gross: 200 } };
  const enclosure = classifyEnclosure(input);
  expect(enclosure).toBe('partiallyEnclosed');
  expect(internalPressureCoefficient(enclosure)).toBe(0.55);
  const out = computeWindPressures({ basicSpeed: 40, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building', enclosure, meanRoofHeight: 10, L: 20, B: 10, roofSlopeDeg: 20, rigid: true });
  expect(out.pressures.find(p => p.surface === 'leewardRoof' && p.gcpiSign === 1)?.pNm2).toBeCloseTo(-882.3821758771583, 8);
});
