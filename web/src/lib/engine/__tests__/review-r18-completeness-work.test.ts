import { afterEach, expect, it, vi } from 'vitest';
import { CompleteDemandSet, IncompleteConcurrentDemandError, memberDemandScope } from '../complete-demand-set';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';
import * as stationBuffer from '../station-buffer';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4, a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
} satisfies AutoVerifyModelData;
const force: ElementForces3D = { elementId: 1, length: 6, nStart: 0, nEnd: 0,
  myStart: 20, myEnd: 20, mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0,
  vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
  distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
const raw: AnalysisResults3D = { elementForces: [force], displacements: [], reactions: [] };
const active = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, factors: [] }));
afterEach(() => { vi.restoreAllMocks(); setCompactStationTransfer(true); });

for (const count of [32, 64]) {
  it(`known wrong result: #2080 tuple coverage reads ${count} combination IDs linearly`, () => {
    let reads = 0;
    const tuples = active(count).map(c => ({ get comboId() { reads++; return c.id; } }));
    const required = active(count).map(c => ({ comboId: c.id }));
    expect(hasCompleteTuples(tuples, required)).toBe(true);
    expect(reads).toBeLessThanOrEqual(4 * count);
  });

  it(`known wrong result: #2080 auto coverage refuses a missing combination after linear work for ${count} tuples`, () => {
    const combinations = active(count);
    const data = computeStationDemands(new Map(combinations.map(c => [c.id, raw])), combinations, model).demands;
    const demand = data.get(1)!;
    let reads = 0;
    const concurrent = demand.concurrent!.map(d => new Proxy(d, {
      get(target, key) { if (key === 'comboId') reads++; return Reflect.get(target, key, target); },
    }));
    data.set(1, { ...demand, expectedCombinationIds: [...combinations.map(c => c.id), count + 1], concurrent });
    expect(() => autoVerifyFromResults(raw, model, null, undefined, data)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
    expect(reads).toBeLessThanOrEqual(4 * concurrent.length);
  });

  it.skip(`known wrong result: #2080 station transfer indexes ${count} combinations once per member`, () => {
    const decode = stationBuffer.decodeStationBuffer;
    let reads = 0;
    vi.spyOn(stationBuffer, 'decodeStationBuffer').mockImplementation((buffer, names) => decode(buffer, names).map(esr => ({ ...esr,
      comboResults: esr.comboResults.map(c => ({ ...c, get comboId() { reads++; return c.comboId; } })),
    })));
    const combinations = active(count);
    const data = computeStationDemands(new Map(combinations.map(c => [c.id, raw])), combinations, model);
    expect(reads).toBeLessThanOrEqual(4 * count);
    expect(data.stations.get(1)!.comboResults.map(c => c.comboId)).toEqual(combinations.map(c => c.id));
    expect(new Set(data.demands.get(1)!.concurrent!.map(d => d.comboId))).toEqual(new Set(combinations.map(c => c.id)));
  });
}

it('tuple coverage retains empty, missing, duplicate, extra and complete combination decisions', () => {
  expect(hasCompleteTuples([{ comboId: NaN }], [{ comboId: NaN }])).toBe(false);
  expect(hasCompleteTuples(undefined, [])).toBe(false);
  expect(hasCompleteTuples([], [])).toBe(false);
  expect(hasCompleteTuples([], [{ comboId: 1 }])).toBe(false);
  expect(hasCompleteTuples([{ comboId: 1 }], [])).toBe(true);
  expect(hasCompleteTuples([{ comboId: 1 }], [{ comboId: 1 }])).toBe(true);
  expect(hasCompleteTuples([{ comboId: 1 }], [{ comboId: 1 }, { comboId: 2 }])).toBe(false);
  expect(hasCompleteTuples([{ comboId: 2 }], [{ comboId: 1 }, { comboId: 2 }])).toBe(false);
  expect(hasCompleteTuples([{ comboId: 1 }, { comboId: 1 }], [{ comboId: 1 }, { comboId: 1 }])).toBe(true);
  expect(hasCompleteTuples([{ comboId: 1 }, { comboId: 2 }], [{ comboId: 1 }])).toBe(true);
});

function hasCompleteTuples(tuples: readonly { comboId: number }[] | undefined, required: readonly { comboId: number }[]): boolean {
  const rows = (tuples ?? []).map(d => ({ elementId: 0, get comboId() { return d.comboId; }, stationT: 0 }));
  const combinations = [...new Set([...required.map(d => d.comboId), ...(tuples ?? []).map(d => d.comboId)])].map(comboId => ({ comboId }));
  try {
    CompleteDemandSet.require(memberDemandScope([{ elementId: 0, combinationIds: combinations.map(c => c.comboId), stationTs: [0] }]), rows);
    return true;
  } catch (error) {
    if (!(error instanceof IncompleteConcurrentDemandError)) throw error;
    return false;
  }
}

for (const compact of [false, true]) {
  it.skip(`known wrong result: #2080 a transfer with no designed members has no required grid (compact=${compact})`, () => {
    setCompactStationTransfer(compact);
    const inactive = {
      ...model,
      elements: new Map([...model.elements].map(([id, element]) => [id, { ...element, behaviour: 'inactive' as const }])),
    };
    const data = computeStationDemands(new Map([[1, raw]]), active(1), inactive);
    expect(data.stations.size).toBe(0);
    expect(data.demands.size).toBe(0);
  });
}
