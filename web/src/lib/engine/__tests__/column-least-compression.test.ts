import { describe, expect, it } from 'vitest';
import { autoVerifyFromResults } from '../auto-verify';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { verifyElement } from './helpers/verify-element';
import { maskDemands } from '../design/behaviour-demands';

const stations = (n: number, mz: number) => [0, 0.5, 1].map((t) => ({ t, x: 3 * t, n, vy: 10, vz: 0, my: 0, mz, torsion: 0 }));

/** A 30 × 50 column: gravity squeezes it with little moment, wind bends it with little squeeze. */
const esr: ElementStationResult = {
  elementId: 1, length: 3, stationTs: [0, 0.5, 1],
  comboResults: [
    { comboId: 1, comboName: '1.2D+1.6L', stations: stations(-1500, 40) },
    { comboId: 2, comboName: '1.2D+1.6W', stations: stations(-80, 150) },
  ],
};

const results = {
  elementForces: [{
    elementId: 1, length: 3, nStart: -1500, nEnd: -1500, vyStart: 10, vyEnd: 10, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 150, mzEnd: 150, hingeStart: false, hingeEnd: false,
    qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [], qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [],
  }],
} as never;

const model = {
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]]),
  sections: new Map([[1, { id: 1, name: 'RC 30x50', b: 0.30, h: 0.50, iz: 0.003125, iy: 0.001125 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fy: 30, e: 25_000_000 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'fixed' }]]),
} as never;

describe('an RC column is checked under its least compression as well as its largest (#1316)', () => {
  it('the demands carry the least compression any combination puts on the member', () => {
    expect(extractGoverningDemands(esr).leastCompression).toBe(80);
    const tensioned = { ...esr, comboResults: [...esr.comboResults, { comboId: 3, comboName: '0.9D+1.6W', stations: stations(20, 60) }] };
    expect(extractGoverningDemands(tensioned).leastCompression).toBeUndefined();
  });

  for (const windN of [80, 0, -20]) {
    it(`checks the wind's own signed axial force ${windN}, independently of the retired least-compression envelope`, () => {
      const own = { ...esr, comboResults: [esr.comboResults[0]!, { comboId: 2, comboName: 'wind', stations: stations(-windN, 150) }] };
      const demands = extractGoverningDemands(own);
      const masked = windN < 0 ? maskDemands(demands, 'compressionOnly') : demands;
      const signedN = Math.max(0, windN);
      const column = (d: typeof demands) => autoVerifyFromResults(results, model, null, undefined, new Map([[1, d]])).concrete[0]!;
      const checked = column(masked);
      const wind = checked.concurrentChecks!.filter(c => c.demand.comboId === 2);
      expect(wind).toHaveLength(3);
      for (const c of wind) {
        expect(c.verification.column!.Nu).toBe(signedN);
        expect(c.verification.column!.Mu).toBeGreaterThanOrEqual(150);
        expect(c.verification.column!.phiMn).toBeGreaterThanOrEqual(c.verification.column!.Mu);
      }
      const single = verifyElement({ elementId: 1, elementType: 'column', Mu: 150, Vu: 10, Nu: signedN,
        b: 0.5, h: 0.3, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 });
      expect(checked.column!.AsProv).toBeGreaterThanOrEqual(single.column!.AsProv);
      const { leastCompression: _, ...withoutLeast } = masked;
      const { stationDemands: _old, ...before } = checked;
      const { stationDemands: _new, ...after } = column(withoutLeast);
      expect(after).toEqual(before);
    });
  }
});
