import { expect, it } from 'vitest';
import { classifyEnclosure, computeWindPressures, internalPressureCoefficient } from '../wind';
it('#2203 one open wall and three closed walls is partially enclosed', () => {
  const input = { a0: 90, ag: 100, a0i: 0, agi: 300, walls: [{ openings: 90, gross: 100 }, ...Array.from({ length: 3 }, () => ({ openings: 0, gross: 100 }))], roof: { openings: 0, gross: 200 } };
  const enclosure = classifyEnclosure(input);
  expect(enclosure).toBe('partiallyEnclosed');
  expect(internalPressureCoefficient(enclosure)).toBe(0.55);
  const out = computeWindPressures({ basicSpeed: 40, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building', enclosure, meanRoofHeight: 10, L: 20, B: 10, roofSlopeDeg: 20, rigid: true });
  expect(out.pressures.find(p => p.surface === 'leewardRoof' && p.gcpiSign === 1)?.pNm2).toBeCloseTo(-882.3821758771583, 8);
});

const wall = (openings: number, gross = 100) => ({ openings, gross });
const classify = (openings: number[], roof = wall(0, 100)) => classifyEnclosure({ walls: openings.map(n => wall(n)), roof });
it('Art. 1.2 open requires every wall on or above its own 80 percent boundary', () => {
  expect(classify([80, 80, 80, 80])).toBe('open');
  expect(classify([79.999, 80, 80, 80])).toBe('partiallyOpen');
  expect(classify([80.001, 80.001, 80.001, 80.001])).toBe('open');
  expect(classify([0, 0, 0, 0])).toBe('enclosed');
});
it('Art. 1.2 enclosed area limits include equality for every wall', () => {
  for (const gross of [30, 100]) {
    const limit = Math.min(0.01 * gross, 0.4);
    const input = (n: number) => ({ walls: [wall(n, gross), wall(0, gross)], roof: wall(0, gross) });
    expect(classifyEnclosure(input(limit - 0.0001))).toBe('enclosed');
    expect(classifyEnclosure(input(limit))).toBe('enclosed');
    expect(classifyEnclosure(input(limit + 0.0001))).toBe('partiallyEnclosed');
  }
});
it('Art. 1.2 dominance is strict and the rest-envelope ratio includes equality', () => {
  for (const [n, expected] of [[10.999, 'partiallyOpen'], [11, 'partiallyOpen'], [11.001, 'partiallyEnclosed']] as const) {
    expect(classifyEnclosure({ walls: [wall(n), wall(0, 25)], roof: wall(10, 25) })).toBe(expected);
  }
  for (const [rest, expected] of [[9.999, 'partiallyEnclosed'], [10, 'partiallyEnclosed'], [10.001, 'partiallyOpen']] as const) {
    expect(classifyEnclosure({ walls: [wall(30), wall(0, 25)], roof: wall(rest, 25) })).toBe(expected);
  }
  expect(classify([0, 0, 90, 0])).toBe('partiallyEnclosed');
  expect(classify([5, 5, 5, 5])).toBe('partiallyOpen');
});
it('incomplete or physically impossible opening records refuse with a reason', () => {
  const invalid = [
    { walls: [], roof: wall(0) },
    { walls: [wall(0)], roof: wall(0) },
    { walls: [wall(0), wall(0)], roof: undefined },
    ...[-1, 101, NaN, Infinity].map(n => ({ walls: [wall(n), wall(0)], roof: wall(0) })),
    { walls: [wall(0, 0), wall(0)], roof: wall(0) },
    { a0: 90, ag: 100, a0i: 0, agi: 300 },
  ];
  for (const input of invalid) expect(() => classifyEnclosure(input as never)).toThrow(/wind.enclosure./);
});

it('#2203 all-open walls cannot silently enter the closed-building pressure procedure', () => {
  const enclosure = classify([80, 80, 80, 80]);
  const out = computeWindPressures({ basicSpeed: 40, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building', enclosure, meanRoofHeight: 10, L: 20, B: 10, roofSlopeDeg: 20, rigid: true });
  expect(out.pressures).toEqual([]);
  expect(out.unsupported.map(m => m.key)).toEqual(['loads.cirsoc102.unsupported.openBuildingProcedure']);
  expect(out.factors.gcpi.value).toBe(0);
});
