import { expect, it } from 'vitest';
import { CompleteDemandSet, memberDemandScope } from '../complete-demand-set';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { completeMemberDemands } from '../member-demand-gate';
import { completeResultDemands } from '../result-demand-gate';
import { autoVerifyFromResults } from '../auto-verify';
import { checkSteelMember } from '../verification-service';
import { runOtherCode } from '../design/other-codes/run';
import type { MemberContext, OtherCode } from '../design/other-codes/types';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';

const rawTuple = (comboId: number, t: number, spatial = true) => ({ comboId, comboName: `C${comboId}`,
  forces: { t, x: 4 * t, n: 0, my: spatial ? 20 : 0, mz: spatial ? 0 : 20, vy: 0, vz: 0, torsion: 0 } });
const section = profileToSectionFull(profileByName('IPE 300')!);
const material = { fy: 250, fu: 400, e: 200000 };
const code: OtherCode = { id: 'ec3', family: 'steel', labelKey: '', coverageKey: '',
  member: () => ({ data: {} }), forces: (_, d) => ({ moment: Math.max(d.my, d.mz) }),
  run: ({ forces }) => forces.map(f => ({ elementId: (f as { elementId: number }).elementId, ratio: (f as { moment: number }).moment / 100 })),
  read: r => ({ ratio: Number(r.ratio), pass: Number(r.ratio) <= 1, governing: 'flexure', unevaluated: [] }) };

function fixture(spatial: boolean) {
  const members = [1, 2].map(elementId => ({ elementId, demands: [], expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1],
    tuples: [1, 2].flatMap(c => (c === 1 ? [0, 0.5, 1] : [0, 0.25, 0.5, 1]).map(t => rawTuple(c, t, spatial))) }));
  const complete = ConcurrentDemand.fromCompleteTuples(completeMemberDemands(members));
  const rows = complete.values.map(r => ({ elementId: r.elementId, demand: r.demand }));
  const model = {
    elements: new Map([1, 2].map(id => [id, { id, type: 'frame', nodeI: 2 * id - 1, nodeJ: 2 * id, sectionId: 1, materialId: 1 }])),
    nodes: new Map([1, 2].flatMap(id => [[2 * id - 1, { id: 2 * id - 1, x: 0, y: id, z: 0 }], [2 * id, { id: 2 * id, x: 4, y: id, z: 0 }]] as const)),
    sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4 }]]),
    materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000 }]]), supports: new Map(),
  };
  const raw = { displacements: [], reactions: [], elementForces: [1, 2].map(elementId => ({ elementId, length: 4,
    nStart: 0, nEnd: 0, myStart: spatial ? 20 : 0, myEnd: spatial ? 20 : 0, mzStart: spatial ? 0 : 20, mzEnd: spatial ? 0 : 20,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
  })) };
  const check = (entry: string, selected: typeof rows) => {
    const ids = [...new Set(selected.map(r => r.elementId))];
    const contexts = ids.map(elementId => ({ ...members[elementId - 1]!, kind: 'beam', L: 4, Lb: 4,
      demands: [{ category: 'My+', value: 20, absValue: 20, comboId: 1, comboName: 'C1', stationT: 0, stationX: 0, forces: rawTuple(1, 0, spatial).forces }],
      tuples: selected.filter(r => r.elementId === elementId).map(r => r.demand),
    })) as unknown as MemberContext[];
    const data = new Map(ids.map(elementId => [elementId, { elementId, length: 4, demands: [], concurrent: selected.filter(r => r.elementId === elementId).map(r => r.demand) }]));
    if (entry === 'fromTuples') return ConcurrentDemand.fromTuples(selected.map(r => r.demand)).length;
    if (entry === 'verifyConcurrentElement') return verifyConcurrentElement(selected.map(r => ({ elementId: r.elementId, elementType: 'beam', b: 0.4, h: 0.4,
      fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: r.demand.section(spatial ? 'My' : 'Mz') }))).overallStatus;
    if (entry === 'checkSteelMember') {
      completeMemberDemands(contexts);
      return contexts.map(c => checkSteelMember(c.elementId, { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 20, Vu: 0, diagram: [], concurrent: c.tuples as ConcurrentDemand[] }, section, material, { L: 4, Lb: 4 })!.overallStatus);
    }
    if (entry === 'foreign') return runOtherCode(code, contexts).rows.map(r => r.status === 'checked' && r.reading.ratio);
    if (entry === 'auto') return autoVerifyFromResults(raw as never, model, null, undefined, data).concrete.map(r => r.overallStatus);
    if (entry === 'cached-member') return completeMemberDemands(contexts).values.length;
    return completeResultDemands(raw as never, ids, data).values.length;
  };
  return { rows, complete, check };
}

const cases = [false, true].flatMap(spatial => ['fromTuples', 'verifyConcurrentElement', 'checkSteelMember', 'foreign', 'auto', 'cached-member', 'cached-result'].flatMap(entry =>
  ['tuple', 'station', 'combination-only-station', 'combination', 'member'].map(removal => ({ spatial, entry, removal }))));

it.skip.each(cases)('known wrong result: #2096 round8 $entry refuses $removal spatial=$spatial', ({ spatial, entry, removal }) => {
  const { rows, check } = fixture(spatial);
  const expected = check(entry, rows);
  const partial = rows.filter(r => {
    if (removal === 'member') return r.elementId !== 2;
    if (removal === 'combination') return r.demand.comboId !== 2;
    if (removal === 'station') return r.demand.stationT !== 0.5;
    return !(r.elementId === 2 && r.demand.comboId === 2 && r.demand.stationT === (removal === 'tuple' ? 1 : 0.25));
  });
  expect(() => check(entry, partial)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
  expect(check(entry, rows)).toEqual(expected);
});

it.skip('known wrong result: #2096 round8 unscoped API tuples cannot establish completeness', () => {
  expect(() => ConcurrentDemand.fromTuples([rawTuple(1, 0), rawTuple(2, 0)])).toThrow(/missing-scope/);
  expect(() => ConcurrentDemand.fromTuples([])).toThrow(/missing-scope/);
  expect(() => checkSteelMember(1, { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 0, Vu: 0, diagram: [], tuples: [
    { N: 0, MStrong: 20, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 1, comboName: 'C1', t: 0 },
  ] }, section, material, { L: 4, Lb: 4 })).toThrow(/missing-scope/);
});

it.skip('known wrong result: #2096 round8 every derived set and demand shares one frozen inventory', () => {
  const { complete, rows } = fixture(true);
  const inventory = (complete as unknown as { inventory: object }).inventory;
  expect(inventory).toBeDefined();
  expect(Object.isFrozen(inventory)).toBe(true);
  for (const group of complete.partition(r => r.elementId).values()) expect((group as unknown as { inventory: object }).inventory).toBe(inventory);
  const mapped = complete.map(r => ({ demand: r.demand.withAxial(0) }));
  expect((mapped as unknown as { inventory: object }).inventory).toBe(inventory);
  for (const r of [...rows, ...mapped.values]) expect((r.demand as unknown as { inventory: object }).inventory).toBe(inventory);
  const declared = { combinationIds: [1, 2], stationTs: [] };
  const converted = ConcurrentDemand.fromTuples([rawTuple(1, 0), rawTuple(2, 1)], declared);
  expect(converted[0]!.coverage).toBe(converted[1]!.coverage);
  expect(() => ConcurrentDemand.fromTuples(converted.filter(d => d.comboId !== 2))).toThrow(/missing-combination/);
});
