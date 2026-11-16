import { CompleteDemandSet, memberDemandScope } from '../complete-demand-set';
import type { ElementStationResult } from '../station-design-forces';
import witness from '../../../../../docs/results-changes/2173-round8-coverage-witness.json';
import { appendFileSync } from 'node:fs';
import { inventoryAnalysis } from './helpers/inventory-analysis';
import '../design/adapters/cirsoc201-adapter';
import { verificationStore } from '../../store/verification.svelte';
import { applySpanContexts } from '../design/design-spans';
import { buildAllMemberContexts } from '../design/member-context';
import { afterEach, expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { completeMemberDemands } from '../member-demand-gate';
import { completeResultDemands } from '../result-demand-gate';
import { autoVerifyFromResults } from '../auto-verify';
import { checkSteelMember, computeStationDemands, setCompactStationTransfer } from '../verification-service';
import { runOtherCode, certifyOtherCode } from '../design/other-codes/run';
import type { MemberContext, OtherCode } from '../design/other-codes/types';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';

const rawTuple = (comboId: number, t: number, spatial = true) => ({ comboId, comboName: `C${comboId}`, stationT: t, stationX: 4 * t,
  forces: { t, x: 4 * t, n: 0, my: spatial ? 20 : 0, mz: spatial ? 0 : 20, vy: 0, vz: 0, torsion: 0 } });
const section = profileToSectionFull(profileByName('IPE 300')!);
const material = { fy: 250, fu: 400, e: 200000 };
const code: OtherCode = { id: 'ec3', family: 'steel', labelKey: '', coverageKey: '',
  member: ctx => ({ data: { elementId: ctx.elementId } }), forces: (_, d) => ({ moment: Math.max(d.my, d.mz) }),
  run: ({ forces }) => forces.map(f => ({ elementId: (f as { elementId: number }).elementId, ratio: (f as { moment: number }).moment / 100 })),
  read: r => ({ ratio: Number(r.ratio), pass: Number(r.ratio) <= 1, governing: 'flexure', unevaluated: [] }) };

afterEach(() => { setCompactStationTransfer(true); verificationStore.clear(); });

const analyses = new Map<string, ReturnType<typeof computeStationDemands> & { raw: ReturnType<typeof inventoryAnalysis> }>();

function fixture(spatial: boolean, nonlinear = false, compact = true) {
  const model = {
    elements: new Map([1, 2].map(id => [id, { id, type: 'frame' as const, nodeI: id, nodeJ: id + 1, sectionId: 1, materialId: 1 }])),
    nodes: new Map([1, 2, 3].map(id => [id, { id, x: 4 * (id - 1), y: 0, z: 0 }])),
    sections: new Map([[1, { id: 1, name: 'RC', rotation: 0, b: 0.4, h: 0.4, a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.001 }]]),
    materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2, rho: 25 }]]), supports: new Map(),
  };
  const key = `${spatial}|${nonlinear}|${compact}`;
  let source = analyses.get(key);
  if (!source) {
    setCompactStationTransfer(compact);
    const perCombo = new Map([1, 2].map(id => [id, inventoryAnalysis(model, spatial, nonlinear, id)]));
    const raw = perCombo.get(1)!;
    source = { ...computeStationDemands(perCombo, [1, 2].map(id => ({ id, name: `C${id}`, factors: [] })), model), raw };
    analyses.set(key, source);
  }
  const raw = source.raw;
  const members = [1, 2].map(elementId => ({ elementId, demands: [], expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1],
    tuples: source!.stations.get(elementId)!.comboResults.flatMap(c => c.stations.filter(f => [0, 0.5, 1].includes(f.t) || c.comboId === 2 && f.t === 0.2)
      .map(forces => ({ comboId: c.comboId, comboName: c.comboName, stationT: forces.t, stationX: forces.x, forces }))) }));
  const complete = ConcurrentDemand.fromCompleteTuples(completeMemberDemands(members));
  const rows = complete.values.map(r => ({ elementId: r.elementId, demand: r.demand }));
  const check = (entry: string, selected: typeof rows) => {
    const ids = [...new Set(selected.map(r => r.elementId))];
    const contexts = ids.map(elementId => ({ ...members[elementId - 1]!, kind: 'beam', L: 4, Lb: 4,
      demands: [{ category: 'My+', value: 20, absValue: 20, comboId: 1, comboName: 'C1', stationT: 0, stationX: 0, forces: rawTuple(1, 0, spatial).forces }],
      tuples: selected.filter(r => r.elementId === elementId).map(r => r.demand),
    })) as unknown as MemberContext[];
    const data = new Map(ids.map(elementId => [elementId, { elementId, length: 4, demands: [], concurrent: selected.filter(r => r.elementId === elementId).map(r => r.demand) }]));
    if (entry === 'cached-store') {
      verificationStore.clear();
      verificationStore._setReinforcementProvider(() => ({ bottom: { count: 4, diameter: 16 },
        top: { count: 4, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } }));
      const fullData = new Map([1, 2].map(elementId => [elementId, { elementId, length: 4, demands: [],
        concurrent: rows.filter(r => r.elementId === elementId).map(r => r.demand) }]));
      const cached = buildAllMemberContexts(model, { demands: fullData });
      verificationStore.setDemandData(cached);
      const initial = verificationStore.providedFor(1);
      expect(initial).not.toBeNull();
      expect(initial!.strengthCheckCount).toBeGreaterThan(0);
      for (const [id, ctx] of cached) {
        if (!data.has(id)) cached.delete(id);
        else ctx.demands = data.get(id);
      }
      return verificationStore.providedFor(1)?.overallStatus;
    }
    if (entry === 'fromTuples') return ConcurrentDemand.fromTuples(selected.map(r => r.demand)).length;
    if (entry === 'verifyConcurrentElement') return verifyConcurrentElement(selected.map(r => ({ elementId: r.elementId, elementType: 'beam', b: 0.4, h: 0.4,
      fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: r.demand.section(spatial ? 'My' : 'Mz') }))).overallStatus;
    if (entry === 'checkSteelMember') {
      return [1, 2].map(elementId => checkSteelMember(elementId, { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 20, Vu: 0, diagram: [], concurrent: selected.map(r => r.demand) }, section, material, { L: 4, Lb: 4 })!.overallStatus);
    }
    if (entry === 'foreign-cert') return certifyOtherCode({ ...code, certify: { name: 'certify_rc_members',
      bound: () => ({ n: 0, my: 0, mz: 0, vStrong: 0 }) } }, contexts,
    (_, elementId) => ({ elementId, axial: 0, shearY: 0, shearZ: 0, torsion: 0, momentY: 0, momentZ: 0 }),
    async (_, args) => {
      const data = JSON.parse(args[0] as string) as { members: { elementId: number }[]; demands: { forces: { moment: number } }[] };
      return data.members.map((m, index) => ({ elementId: m.elementId, certified: true,
        utilizationLower: data.demands[index]!.forces.moment / 100, utilizationUpper: data.demands[index]!.forces.moment / 100 }));
    }).then(certificates => [...certificates.values()].map(c => c.status === 'uncertified' ? null : c.upper));
    if (entry === 'foreign') return runOtherCode(code, contexts).rows.map(r => r.status === 'checked' && r.reading.ratio);
    if (entry === 'auto') return autoVerifyFromResults(raw as never, model, null, undefined, data).concrete.map(r => r.overallStatus);
    if (entry === 'cached-member') return completeMemberDemands(contexts).values.length;
    return completeResultDemands(raw as never, ids, data).values.length;
  };
  return { rows, complete, check, source, model };
}

const cases = [false, true].flatMap(spatial => [false, true].flatMap(nonlinear => [false, true].flatMap(compact =>
  ['fromTuples', 'verifyConcurrentElement', 'checkSteelMember', 'foreign', 'foreign-cert', 'auto', 'cached-member', 'cached-result', 'cached-store'].flatMap(entry =>
    ['tuple', 'station', 'combination-only-station', 'combination', 'member'].map(removal => ({ spatial, nonlinear, compact, entry, removal }))))));

it.each(cases)('known wrong result: #2096 round8 $entry refuses $removal spatial=$spatial nonlinear=$nonlinear compact=$compact', async ({ spatial, nonlinear, compact, entry, removal }) => {
  const { rows, check, complete } = fixture(spatial, nonlinear, compact);
  const expected = await check(entry, rows);
  const reference = witness.completeVerdicts.find(r => r.spatial === spatial && r.nonlinear === nonlinear && r.compact === compact && r.entry === entry);
  expect(reference).toBeDefined();
  expect(expected).toEqual(reference!.verdict);
  const partial = rows.filter(r => {
    if (removal === 'member') return r.elementId !== 2;
    if (removal === 'combination') return r.demand.comboId !== 2;
    if (removal === 'station') return r.demand.stationT !== 0.5;
    return !(r.elementId === 2 && r.demand.comboId === 2 && r.demand.stationT === (removal === 'tuple' ? 1 : 0.2));
  });
  let error: unknown;
  let answer: unknown;
  try { answer = await check(entry, partial); } catch (caught) { error = caught; }
  if (process.env.INVENTORY_RECORD) appendFileSync(process.env.INVENTORY_RECORD, JSON.stringify({ spatial, nonlinear, compact, entry, removal,
    complete: expected, refused: error instanceof Error && 'code' in error && error.code === 'incomplete-concurrent-demand', partial: answer,
    hasInventory: complete.inventory !== undefined }) + '\n');
  expect.soft(error).toMatchObject({ code: 'incomplete-concurrent-demand' });
  expect(complete.inventory).toBeDefined();
  for (const row of partial) expect(row.demand.inventory).toBe(complete.inventory);
  expect(await check(entry, rows)).toEqual(expected);
});

it('known wrong result: #2096 round8 unscoped API tuples cannot establish completeness', () => {
  expect(() => ConcurrentDemand.fromTuples([rawTuple(1, 0), rawTuple(2, 0)])).toThrow(/missing-scope/);
  expect(() => ConcurrentDemand.fromTuples([])).toThrow(/missing-scope/);
  const unscoped = { ...rawTuple(1, 0), stationT: 0, stationX: 0 };
  expect(() => verifyConcurrentElement([{ elementId: 1, demand: { source: unscoped } }] as never)).toThrow(/missing-scope/);
  expect(() => checkSteelMember(1, { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 0, Vu: 0, diagram: [], concurrent: [unscoped] } as never,
    section, material, { L: 4, Lb: 4 })).toThrow(/missing-scope/);
  expect(() => checkSteelMember(1, { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 0, Vu: 0, diagram: [], tuples: [
    { N: 0, MStrong: 20, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 1, comboName: 'C1', t: 0 },
  ] }, section, material, { L: 4, Lb: 4 })).toThrow(/missing-scope/);
});

it('known wrong result: #2096 round8 every derived set and demand shares one frozen inventory', () => {
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

for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`round8 the station producer shares one inventory spatial=${spatial} nonlinear=${nonlinear} compact=${compact}`, () => {
    const { source } = fixture(spatial, nonlinear, compact);
    const tuples = [...source.demands.values()].flatMap(d => d.concurrent!);
    const inventory = tuples[0]!.inventory;
    expect(inventory).toBeDefined();
    for (const d of tuples) expect(d.inventory).toBe(inventory);
    for (const s of source.stations.values()) expect(s.inventory).toBe(inventory);
  });
}

it('round8 declared zero forces and snapshotted declarations remain complete', () => {
  const declared = { combinationIds: [1, 2], stationTs: [0, 1] };
  const tuples = [1, 2].flatMap(c => [0, 1].map(t => ({ ...rawTuple(c, t), forces: { ...rawTuple(c, t).forces, my: 0, mz: 0 } })));
  const ds = ConcurrentDemand.fromTuples(tuples, declared);
  declared.combinationIds.pop(); declared.stationTs.pop();
  expect(ds.every(d => d.my === 0 && d.mz === 0)).toBe(true);
  expect(ConcurrentDemand.fromTuples(ds)).toHaveLength(4);
  expect(() => ConcurrentDemand.fromTuples(ds.filter(d => d.comboId !== 2))).toThrow(/missing-combination/);
  expect(Object.isFrozen(ds[0]!.inventory.scope.combinations[0]!.members[0]!.stationTs)).toBe(true);
  expect(() => completeMemberDemands([{ elementId: 1, demands: [], tuples: tuples.map(t => ({ ...t, stationT: t.forces.t, stationX: t.forces.x })) }])).toThrow(/missing-scope/);
  expect(() => verifyConcurrentElement([])).toThrow(/missing-scope/);
});

it('round8 complete declared API demands retain the exact main verdict', () => {
  const tuples = witness.main.tuples;
  const demands = ConcurrentDemand.fromTuples(tuples.map(t => ({ ...t, elementId: 1 })), { combinationIds: tuples.map(t => t.comboId), stationTs: [0] });
  const result = verifyConcurrentElement(demands.map(d => ({ elementId: 1, elementType: 'beam', b: 0.4, h: 0.4,
    fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: d.section('My') })));
  expect({ status: result.overallStatus, AsReq: result.flexure.AsReq, ratio: result.flexure.ratio,
    Mu: result.Mu, diagnostics: result.diagnostics, checks: result.concurrentChecks?.length }).toEqual(witness.main.complete);
  expect(demands[0]!.inventory).toBeDefined();
  expect(() => ConcurrentDemand.fromTuples(demands.filter(d => d.comboId !== 2))).toThrow(/missing-combination/);
});

it('round8 a cached tuple array cannot lose or replace a cell in place', () => {
  const { rows, check } = fixture(true);
  check('cached-store', rows);
  const tuples = verificationStore.contexts.get(1)!.demands!.concurrent!;
  const before = verificationStore.providedFor(1);
  expect(Object.isFrozen(tuples)).toBe(true);
  expect(() => (tuples as ConcurrentDemand[]).splice(0, 1, tuples[1]!)).toThrow(TypeError);
  expect(verificationStore.providedFor(1)).toBe(before);
  const ctx = verificationStore.contexts.get(1)!;
  ctx.demands = { ...ctx.demands!, concurrent: tuples.map(d => d.withAxial(d.n)) };
  expect(verificationStore.providedFor(1)).not.toBe(before);
});

it('round8 multiple raw members require a declared inventory and explicit member views retain it', () => {
  const stations = [1, 2].map(elementId => ({ elementId, length: 4, stationTs: [0, 1], comboResults: [1, 2].map(comboId => ({
    comboId, comboName: `C${comboId}`, stations: [0, 1].map(t => rawTuple(comboId, t).forces),
  })) }));
  const inventory = ConcurrentDemand.inventoryForStations(stations);
  const tuples = stations.flatMap(s => s.comboResults.flatMap(c => c.stations.map(forces => ({ elementId: s.elementId,
    comboId: c.comboId, comboName: c.comboName, forces }))));
  expect(() => ConcurrentDemand.fromTuples(tuples, { combinationIds: [1, 2], stationTs: [0, 1] })).toThrow(/member inventory/);
  const all = ConcurrentDemand.fromTuples(tuples, { combinationIds: [], stationTs: [], inventory });
  expect(all).toHaveLength(8);
  for (const demand of all) expect(demand.inventory).toBe(inventory);
  const member = all.filter(d => d.elementId === 1);
  expect(() => ConcurrentDemand.fromTuples(member)).toThrow(/missing-member/);
  expect(ConcurrentDemand.fromMemberTuples(member, 1)).toHaveLength(4);
  const steel = { Nc: 0, Nt: 0, MuStrong: 20, MuWeak: 0, Vu: 0, diagram: [], concurrent: member, memberId: 1 };
  expect(checkSteelMember(1, steel, section, material, { L: 4, Lb: 4 })).not.toBeNull();
  expect(() => checkSteelMember(1, { ...steel, memberId: 2 }, section, material, { L: 4, Lb: 4 })).toThrow(/missing-scope/);
  expect(() => checkSteelMember(1, { ...steel, concurrent: member.filter(d => d.comboId !== 2) }, section, material, { L: 4, Lb: 4 })).toThrow(/missing-combination/);
  expect(() => ConcurrentDemand.fromMemberTuples(member.filter(d => d.comboId !== 2), 1)).toThrow(/missing-combination/);
});

it('round8 station proof reuse compares all forces, loading and declared cells without borrowing mutable force objects', () => {
  const expected = [1, 2];
  const loading = { My: false, Mz: false };
  const input: ElementStationResult = { elementId: 1, length: 4, expectedCombinationIds: expected, stationTs: [0, 1],
    comboResults: [1, 2].map(comboId => ({ comboId, comboName: `C${comboId}`, transverseLoading: loading,
      stations: [0, 1].map(t => rawTuple(comboId, t).forces) })) };
  const first = ConcurrentDemand.completeStations(input);
  expect(ConcurrentDemand.completeStations(input)).toBe(first);
  const forces = input.comboResults[0]!.stations[0]!;
  for (const key of ['x', 'n', 'my', 'mz', 'vy', 'vz', 'torsion'] as const) {
    const before = ConcurrentDemand.completeStations(input);
    const original = forces[key];
    forces[key] = original + 1;
    const changed = ConcurrentDemand.completeStations(input);
    expect(changed).not.toBe(before);
    expect(changed.values[0]!.demand.forces[key]).toBe(original + 1);
    expect(before.values[0]!.tuple.forces[key]).toBe(original);
    expect(before.values[0]!.demand.forces[key]).toBe(original);
    forces[key] = original;
  }
  const beforeLoading = ConcurrentDemand.completeStations(input);
  loading.My = true;
  const afterLoading = ConcurrentDemand.completeStations(input);
  expect(afterLoading).not.toBe(beforeLoading);
  expect(afterLoading.values[0]!.demand.transverseLoading.My).toBe(true);
  expect(beforeLoading.values[0]!.demand.transverseLoading.My).toBe(false);
  forces.t = 0.5;
  expect(() => ConcurrentDemand.completeStations(input)).toThrow(/missing-station/);
  forces.t = 0;
  input.stationTs.push(0.5);
  expect(() => ConcurrentDemand.completeStations(input)).toThrow(/missing-station/);
  input.stationTs.pop();
  expected.push(3);
  expect(() => ConcurrentDemand.completeStations(input)).toThrow(/missing-combination/);
  expected.pop();
  input.comboResults.pop();
  expect(() => ConcurrentDemand.completeStations(input)).toThrow(/missing-combination/);
  expect(() => ConcurrentDemand.completeStations(input)).toThrow(/missing-combination/);
  let reads = 0;
  const changing: ElementStationResult = { elementId: 1, length: 4, stationTs: [0], comboResults: [{ comboId: 1, comboName: 'C1',
    stations: [{ ...rawTuple(1, 0).forces, get my() { reads++; return reads; } }],
  }] };
  const captured = ConcurrentDemand.fromStations(changing);
  expect(reads).toBe(1);
  expect(captured[0]!.my).toBe(1);
  const changed = ConcurrentDemand.fromStations(changing);
  expect(reads).toBe(2);
  expect(changed[0]!.my).toBe(2);
  expect(captured[0]!.my).toBe(1);
  reads = 0;
  const raw = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: changing.comboResults[0]!.stations[0]! }],
    { combinationIds: [1], stationTs: [0] });
  expect(reads).toBe(1);
  expect(raw[0]!.my).toBe(1);
});

it('round8 an opaque proof cannot convert a tuple whose station or combination changed after validation', () => {
  const tuple = rawTuple(1, 0);
  const coverage = { combinationIds: [1], stationTs: [0] };
  const complete = CompleteDemandSet.require(memberDemandScope([{ elementId: 1, ...coverage }]), [
    { elementId: 1, comboId: 1, stationT: 0, tuple, coverage },
  ]);
  expect(ConcurrentDemand.fromCompleteTuples(complete).values[0]!.demand.stationT).toBe(0);
  tuple.forces.t = 0.5;
  expect(() => ConcurrentDemand.fromCompleteTuples(complete)).toThrow(/missing-station/);
  tuple.forces.t = 0;
  tuple.comboId = 2;
  expect(() => ConcurrentDemand.fromCompleteTuples(complete)).toThrow(/missing-combination/);
});

it.each(['tuple', 'station', 'combination-only-station', 'combination', 'member'])('round8 opaque partitions cannot certify a removed %s', removal => {
  const { complete } = fixture(true);
  const keep = (r: typeof complete.values[number]) => {
    if (removal === 'member') return r.elementId !== 2;
    if (removal === 'combination') return r.comboId !== 2;
    if (removal === 'station') return r.stationT !== 0.5;
    return !(r.elementId === 2 && r.comboId === 2 && r.stationT === (removal === 'tuple' ? 1 : 0.2));
  };
  const partial = complete.partition(keep).get(true)!;
  expect(() => ConcurrentDemand.fromCompleteTuples(partial)).toThrow(/Incomplete concurrent demand/);
  const inputs = partial.map(r => ({ input: { elementId: r.elementId, elementType: 'beam' as const, b: 0.4, h: 0.4,
    fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: r.demand.section('My') } }));
  expect(() => verifyConcurrentElement(inputs)).toThrow(/Incomplete concurrent demand/);
  const member = complete.forMembers([1]);
  expect(member.inventory).toBe(complete.inventory);
  expect(ConcurrentDemand.fromCompleteTuples(member).values).toHaveLength(7);
});

it('round8 declared concrete views retain their required members in a mixed-material inventory', () => {
  const { rows, model } = fixture(true);
  const mixed = { ...model, elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, materialId: id }])),
    materials: new Map<number, { id: number; name: string; fc?: number; fy: number; e: number; nu: number; rho: number }>([...model.materials, [2, { id: 2, name: 'Acero A572', fy: 345, e: 200000, nu: 0.3, rho: 78.5 }]]) };
  const demands = new Map([1, 2].map(elementId => [elementId, { elementId, length: 4, demands: [],
    concurrent: rows.filter(r => r.elementId === elementId).map(r => r.demand) }]));
  const contexts = buildAllMemberContexts(mixed, { demands });
  expect([...contexts.keys()]).toEqual([1]);
  expect(contexts.get(1)!.demandMemberIds).toEqual([1]);
  expect(Object.isFrozen(contexts.get(1)!.demandMemberIds)).toBe(true);
  expect(() => applySpanContexts(contexts, mixed, [])).not.toThrow();
  verificationStore._setReinforcementProvider(() => ({ bottom: { count: 4, diameter: 16 },
    top: { count: 4, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } }));
  verificationStore.setDemandData(contexts);
  expect(verificationStore.providedFor(1)!.strengthCheckCount).toBeGreaterThan(0);
  expect(completeResultDemands(fixture(true).source.raw as never, [1], new Map([[1, demands.get(1)!]]), undefined, [1]).values).toHaveLength(7);
});

it('round8 span production validates charts even when the retained demand summary is complete', () => {
  const { source, model } = fixture(true);
  const contexts = buildAllMemberContexts(model, { demands: source.demands, stations: source.stations });
  expect(applySpanContexts(contexts, model, [])).toEqual([]);
  const ctx = contexts.get(1)!;
  ctx.stations = { ...ctx.stations!, comboResults: ctx.stations!.comboResults.filter(c => c.comboId !== 2) };
  expect(() => applySpanContexts(contexts, model, [])).toThrow(/missing-combination/);
});
