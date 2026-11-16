import { afterEach, expect, it } from 'vitest';
import { inventoryAnalysis } from './helpers/inventory-analysis';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';
import { lineDemand, lineTransverseDemand, requiredArea } from '../design/beam-line-demand';
import type { MemberContext } from '../design/member-context';
import type { ElementStationResult } from '../station-design-forces';

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

it('known wrong result: #2096 round11 flexure evaluates every combination on the union grid', () => {
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

it('known wrong result: #2096 round11 transverse evaluates every combination on the union grid', () => {
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

for (const axis of ['My', 'Mz'] as const) for (const forward of [true, false]) {
  it(`known wrong result: #2096 round11 interpolates signed fields between each combination's own knots ${axis} forward=${forward}`, () => {
    const input = stations(0);
    input.comboResults[0]!.stations = [0, 0.125, 0.375, 0.75, 1].map(t => force(t));
    input.comboResults[1]!.stations = [force(0, 100, 200, 30), force(0.25, -100, -200, -30), force(1, 200, 400, 60)];
    const ts = [0, 0.125, 0.25, 0.375, 0.75, 1];
    const moments = [100, 0, -100, -50, 100, 200];
    const dense: ElementStationResult = { ...input, stationTs: ts, comboResults: input.comboResults.map(c => ({ ...c,
      stations: ts.map((t, i) => c.comboId === 1 ? force(t) : force(t, moments[i]!, 2 * moments[i]!, 0.3 * moments[i]!)),
    })) };
    const actual = lineDemand([member(input, axis, forward)]);
    const expectedMoments = moments.map(v => ({ mPos: Math.max(0, v), mNeg: Math.max(0, -v) }));
    if (!forward) expectedMoments.reverse();
    expect(actual.map(({ mPos, mNeg }) => ({ mPos, mNeg }))).toEqual(expectedMoments);
    for (const comboId of [undefined, 1, 2]) {
      expect(lineDemand([member(input, axis, forward)], comboId)).toEqual(lineDemand([member(dense, axis, forward)], comboId));
      expect(lineTransverseDemand([member(input, axis, forward)], comboId)).toEqual(lineTransverseDemand([member(dense, axis, forward)], comboId));
    }
    input.comboResults.reverse();
    for (const c of input.comboResults) c.stations.reverse();
    expect(lineDemand([member(input, axis, forward)])).toEqual(actual);
    expect(lineTransverseDemand([member(input, axis, forward)])).toEqual(lineTransverseDemand([member(dense, axis, forward)]));
  });
}

for (const entry of ['flexure', 'transverse'] as const) {
  const run = (input: ElementStationResult, comboId?: number) => entry === 'flexure'
    ? lineDemand([member(input)], comboId) : lineTransverseDemand([member(input)], comboId);
  for (const edge of ['left', 'right'] as const) {
    it(`known wrong result: #2096 round11 ${entry} refuses extrapolation beyond the ${edge} field boundary before filtering`, () => {
      const input = stations(100, 200, 30);
      input.stationTs = [];
      input.comboResults[1]!.stations = (edge === 'left' ? [0.25, 1] : [0, 0.75]).map(t => force(t, 100, 200, 30));
      for (const comboId of [undefined, 1, 2]) expect(() => run(input, comboId)).toThrow(expect.objectContaining({
        code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([expect.objectContaining({
          code: 'missing-station', comboId: 2, stationT: edge === 'left' ? 0 : 1,
        })]),
      }));
    });
    it(`round11 ${entry} accepts exact and interior stations at the ${edge} field boundary`, () => {
      const input = stations(100, 200, 30);
      input.stationTs = [];
      input.comboResults[0]!.stations = (edge === 'left' ? [0, Number.EPSILON, 1] : [0, 1 - Number.EPSILON, 1]).map(t => force(t));
      expect(run(input)).toHaveLength(3);
      const reference = run({ ...input, comboResults: [input.comboResults[1]!] })[0]!;
      for (const point of run(input)) expect(point).toEqual({ ...reference, x: point.x });
    });
  }
  for (const span of [0.5e-9, 1e-9, 2e-9]) {
    it(`round11 ${entry} respects the interpolation span boundary ${span}`, () => {
      const input = stations(100, 200, 30);
      input.stationTs = [];
      input.comboResults[0]!.stations = [0, span / 2, span].map(t => force(t));
      input.comboResults[1]!.stations = [0, span].map(t => force(t, 100, 200, 30));
      if (span <= 1e-9) expect(() => run(input)).toThrow(/unambiguous interpolation bracket/);
      else expect(run(input)).toEqual([0, span / 2, span].map(t => ({ ...run({ ...input, comboResults: [input.comboResults[1]!] })[0]!, x: 4 * t })));
    });
  }
  it(`known wrong result: #2096 round11 ${entry} refuses ambiguous interpolation across one-sided station values`, () => {
    const input = stations(100, 200, 30);
    input.comboResults[1]!.stations.push(force(0, -100, -200, -30));
    expect(() => run(input)).toThrow(/unambiguous interpolation bracket/);
    input.comboResults[0]!.stations = [0, 1].map(t => force(t));
    expect(run(input)).toHaveLength(2);
  });
  it(`round11 ${entry} preserves zero and common-grid inputs and validates coverage before selection`, () => {
    const input = stations(0);
    const reference = run({ ...input, comboResults: [input.comboResults[0]!] });
    for (const comboId of [undefined, 1, 2]) expect(run(input, comboId)).toEqual(reference);
    input.comboResults[1]!.stations = [0, 0.5, 1].map(t => force(t));
    input.stationTs = [0, 0.5, 1];
    expect(run(input)).toEqual(reference);
    input.comboResults[1]!.stations.splice(1, 1);
    expect(() => run(input, 1)).toThrow(/missing-station/);
  });
}

afterEach(() => setCompactStationTransfer(true));
for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2096 round11 WASM fields reach both union sweeps spatial=${spatial} nonlinear=${nonlinear} compact=${compact}`, () => {
    const model = {
      elements: new Map([1, 2].map(id => [id, { id, type: 'frame' as const, nodeI: id, nodeJ: id + 1, sectionId: 1, materialId: 1 }])),
      nodes: new Map([1, 2, 3].map(id => [id, { id, x: 4 * (id - 1), y: 0, z: 0 }])),
      sections: new Map([[1, { id: 1, name: 'RC', rotation: 0, b: 0.4, h: 0.4, a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2, rho: 25 }]]), supports: new Map(),
    };
    setCompactStationTransfer(compact);
    const raw = new Map([1, 2].map(id => {
      const result = inventoryAnalysis(model, spatial, nonlinear, id);
      return [id, spatial ? result : { ...result, elementForces: result.elementForces.map(ef => ({ ...ef, myStart: -ef.myStart, myEnd: -ef.myEnd })) }];
    }));
    const source = computeStationDemands(raw, [1, 2].map(id => ({ id, name: `C${id}`, factors: [] })), model).stations.get(1)!;
    const input: ElementStationResult = { elementId: 1, length: 4, stationTs: [0, 1],
      expectedCombinationIds: [1, 2], comboResults: source.comboResults.map(c => ({ comboId: c.comboId, comboName: c.comboName,
        transverseLoading: c.transverseLoading, stations: c.stations.filter(f => (c.comboId === 1 ? [0, 0.5, 1] : [0, 1]).includes(f.t)),
      })) };
    expect(input.comboResults.map(c => c.stations.length)).toEqual([3, 2]);
    const dense: ElementStationResult = { ...input, stationTs: [0, 0.5, 1], comboResults: source.comboResults.map(c => ({
      comboId: c.comboId, comboName: c.comboName, transverseLoading: c.transverseLoading, stations: c.stations.filter(f => [0, 0.5, 1].includes(f.t)),
    })) };
    const actual = lineDemand([member(input)]);
    const reference = lineDemand([member(dense)]);
    expect(actual.map(p => p.x)).toEqual([0, 2, 4]);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i]!.mPos).toBeCloseTo(reference[i]!.mPos, 10);
      expect(actual[i]!.mNeg).toBeCloseTo(reference[i]!.mNeg, 10);
    }
    const applied = 10 * 2;
    expect(actual[1]!.mPos + actual[1]!.mNeg).toBeCloseTo(applied * (4 - 2) + applied * (8 - 2), 10);
    const transverse = lineTransverseDemand([member(input)]);
    const expected = lineTransverseDemand([member(dense)]);
    for (let i = 0; i < transverse.length; i++) {
      expect(transverse[i]!.shear).toBeCloseTo(expected[i]!.shear, 10);
      expect(transverse[i]!.torsion).toBeCloseTo(expected[i]!.torsion, 10);
    }
  });
}
