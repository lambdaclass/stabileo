import { expect, it } from 'vitest';
import { lineDemand, lineTransverseDemand, requiredArea } from '../design/beam-line-demand';
import type { MemberContext } from '../design/member-context';
import type { ElementStationResult } from '../station-design-forces';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2096' ? it : it.skip;
const material = { fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const force = (t: number, moment = 0, shear = 0, torsion = 0) => ({
  t, x: 4 * t, n: 0, my: moment, mz: moment, vy: shear, vz: shear, torsion,
});
function stations(moment: number, shear = 0, torsion = 0): ElementStationResult {
  return { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [
    { comboId: 1, comboName: 'A', stations: [0, 0.5, 1].map(t => force(t)) },
    { comboId: 2, comboName: 'B', stations: [0, 1].map(t => force(t, moment, shear, torsion)) },
  ] };
}
function member(input: ElementStationResult, axis: 'My' | 'Mz' = 'My', forward = true) {
  return { ctx: { stations: input, axes: { flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy', bFlex: 0.3, hFlex: 0.6 },
    material } as MemberContext, offset: 0, L: 4, forward };
}

knownWrong('known wrong result: #2096 round11 flexure evaluates every combination on the union grid', () => {
  const d = 0.6 - material.cover - material.stirrupDia / 1000 - 0.01;
  for (const axis of ['My', 'Mz'] as const) for (const forward of [true, false]) for (const moment of [100, -100]) {
    const input = stations(moment);
    for (const comboId of [undefined, 2]) {
      const actual = lineDemand([member(input, axis, forward)], comboId);
      expect(actual.map(p => p.x)).toEqual([0, 2, 4]);
      expect(actual).toEqual([0, 2, 4].map(x => ({ x, d,
        mPos: Math.max(0, moment), mNeg: Math.max(0, -moment),
        asBottom: requiredArea(Math.max(0, moment), 0.3, d, material.fc, material.fy),
        asTop: requiredArea(Math.max(0, -moment), 0.3, d, material.fc, material.fy),
      })));
    }
  }
});

knownWrong('known wrong result: #2096 round11 transverse evaluates every combination on the union grid', () => {
  for (const axis of ['My', 'Mz'] as const) for (const forward of [true, false]) {
    const input = stations(100, 200, 30);
    const reference = lineTransverseDemand([member({ ...input, comboResults: [input.comboResults[1]!] }, axis, forward)])[0]!;
    expect(reference.shear).toBeGreaterThan(0);
    expect(reference.torsion).toBeGreaterThan(0);
    for (const comboId of [undefined, 2]) {
      const actual = lineTransverseDemand([member(input, axis, forward)], comboId);
      expect(actual).toEqual([0, 2, 4].map(x => ({ ...reference, x })));
    }
  }
});
