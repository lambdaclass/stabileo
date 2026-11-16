import { expect, it } from 'vitest';
import { demandCoverage, type DemandCoverage } from '../complete-demand-set';
import { ConcurrentDemand } from '../concurrent-demand';
import { completeMemberDemands } from '../member-demand-gate';
import { completeResultDemands } from '../result-demand-gate';
import type { AnalysisResults3D } from '../types-3d';

const raw: AnalysisResults3D = { displacements: [], reactions: [], elementForces: [{
  elementId: 1, length: 1, nStart: 0, nEnd: 0, myStart: 1, myEnd: 1,
  mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
  releaseTStart: false, releaseTEnd: false, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
  distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
}] };

for (const source of ['stations', 'common', 'per-combination', 'cached'] as const) {
  for (const extra of [0, 0.5, 1]) {
    const common = [0, 0.5, 1].filter(t => t !== extra);
    const tuples = [1, 2].flatMap(comboId => (comboId === 1 ? [0, 0.5, 1] : common).map(t => ({
      elementId: 1, comboId, comboName: `C${comboId}`, forces: { t, x: t, n: 0, my: t === extra ? 2 : 1, mz: 0, vy: 0, vz: 0, torsion: 0 },
    })));
    const build = () => {
      if (source === 'stations') return ConcurrentDemand.fromStations({ elementId: 1, length: 1, stationTs: common,
        comboResults: [1, 2].map(comboId => ({ comboId, comboName: `C${comboId}`,
          stations: tuples.filter(t => t.comboId === comboId).map(t => t.forces) })) });
      const declared: DemandCoverage = { combinationIds: [1, 2], stationTs: source === 'per-combination' ? [] : common,
        combinationStations: source === 'per-combination' ? [1, 2].map(comboId => ({ comboId, stationTs: common })) : [] };
      if (source !== 'cached') return ConcurrentDemand.fromTuples(tuples, declared);
      const cached = demandCoverage(declared, tuples);
      const partial = tuples.filter(t => !(t.comboId === 1 && t.forces.t === extra));
      expect(() => ConcurrentDemand.fromTuples(partial.map(t => ({ ...t, coverage: cached })), declared))
        .toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'missing-station', comboId: 1, stationT: extra }),
        ]) }));
      return ConcurrentDemand.fromTuples(tuples.map(t => ({ ...t, coverage: cached })), declared);
    };
    for (const entry of ['result', 'member', 'tuple'] as const) {
      it(`known wrong result: #2096 round7 ${source} retains observed station ${extra} through ${entry}`, () => {
        const concurrent = build();
        const check = (rows: readonly ConcurrentDemand[]) => {
          if (entry === 'tuple') return ConcurrentDemand.fromTuples(rows);
          if (entry === 'member') return completeMemberDemands([{ elementId: 1, demands: [], tuples: rows, stationTs: common }]).values;
          return completeResultDemands(raw, [1], new Map([[1, { elementId: 1, length: 1, demands: [],
            expectedCombinationIds: [1, 2], stationTs: common, concurrent: rows }]])).values;
        };
        expect(check(concurrent)).toHaveLength(5);
        expect(concurrent.filter(d => d.comboId === 2).map(d => d.stationT)).toEqual(common);
        expect(concurrent.find(d => d.comboId === 1 && d.stationT === extra)!.my).toBe(2);
        const partial = concurrent.filter(d => !(d.comboId === 1 && d.stationT === extra));
        expect(() => check(partial)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand',
          diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'missing-station', comboId: 1, stationT: extra })]),
        }));
      });
    }
  }
}

it('observed stations without a common grid retain independent combination inventories', () => {
  const tuples = [1, 2].flatMap(comboId => (comboId === 1 ? [0, 0.5, 1] : [0, 1]).map(t => ({
    elementId: 1, comboId, comboName: `C${comboId}`, forces: { t, x: t, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 },
  })));
  const complete = ConcurrentDemand.fromTuples(tuples, { combinationIds: [1, 2], stationTs: [] });
  expect(ConcurrentDemand.fromTuples(complete)).toHaveLength(5);
  expect(() => ConcurrentDemand.fromTuples(complete.filter(d => !(d.comboId === 1 && d.stationT === 0.5))))
    .toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
});
