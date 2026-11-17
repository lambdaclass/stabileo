import { expect, it } from 'vitest';
import { beamDemands, type DemandInput } from '../demands';
import { buildCriticalStations, extractForcesAtStation } from '../../engine/station-forces';
import type { ElementForces3D, AnalysisResults3D } from '../../engine/types-3d';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2092' ? it : it.skip;

function model(positions: number[], sign: number, rolled: boolean, reversed: boolean): DemandInput {
  const elements = new Map([[1, { id: 1, nodeI: reversed ? 2 : 1, nodeJ: reversed ? 1 : 2, sectionId: 1, rollAngle: rolled ? 90 : 0 }]]);
  const forces = positions.map((a, index) => ({
    elementId: 1, length: 1, nStart: -10 - index, nEnd: -10 - index,
    vyStart: rolled ? sign : 0, vyEnd: 0, vzStart: rolled ? 0 : -sign, vzEnd: 0,
    myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, tStart: 0, tEnd: 0,
    ...(rolled ? { pointLoadsY: [{ a, p: -sign / (1 - a) }] } : { pointLoadsZ: [{ a, p: sign / (1 - a) }] }),
  } as ElementForces3D));
  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 1, y: 0, z: 0 }]]);
  return {
    nodes, elements, sections: new Map([[1, { id: 1, b: 0.3, h: 0.6 }]]), supportNodes: new Set([1, 2]),
    shells: { nodes, quads: new Map(), plates: new Map() },
    groups: [{ id: 1, name: 'beam', kind: 'beam', elements: [1], quads: [], plates: [] }],
    sets: forces.map((f, i) => ({ name: `C${i}`, result: { elementForces: [f] } as AnalysisResults3D })),
  };
}

knownWrong('known wrong result: #2092 sheet envelopes retain every combination critical station without rounding', () => {
  for (const positions of [[0.37], [0.37123456], [0.37, 0.41], [0.37 - 1e-7, 0.37 + 1e-7]]) {
    for (const sign of [-1, 1]) for (const rolled of [false, true]) for (const reversed of [false, true]) {
      const input = model(positions, sign, rolled, reversed);
      const row = beamDemands(input)[0]!;
      const field = rolled ? 'mz' : 'my';
      const critical = [...new Set(input.sets.flatMap((set) => buildCriticalStations(set.result.elementForces[0]!).map((t) => reversed ? 1 - t : t)))];
      for (const x of critical) {
        const actual = row.env!.find((point) => Math.abs(point.x - x) < 1e-12);
        expect(actual, `missing station ${x}`).toBeDefined();
        const states = input.sets.map((set) => extractForcesAtStation(set.result.elementForces[0]!, reversed ? 1 - x : x));
        expect(actual!.pos).toBeCloseTo(Math.max(0, ...states.map((state) => state[field])), 12);
        expect(actual!.neg).toBeCloseTo(Math.max(0, ...states.map((state) => -state[field])), 12);
      }
    }
  }
});

it('#2092 sheet envelopes preserve an existing regular grid and its concurrent axial force', () => {
  const input = model([0.5], 1, false, false);
  const row = beamDemands(input)[0]!;
  expect(row.env).toHaveLength(33);
  expect(row.env!.find((p) => p.x === 0.5)).toMatchObject({ neg: 0.5, nNeg: 10 });
  expect(row.missing).toBeUndefined();
  input.sets[0]!.result = { elementForces: [] } as unknown as AnalysisResults3D;
  expect(beamDemands(input)[0]!.missing).toEqual(['C0']);
});
