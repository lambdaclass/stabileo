import { expect, it, vi } from 'vitest';
import { extractGoverningDemands, verifyProvidedReinforcement, type ElementStationResult } from '../station-design-forces';
import { verifyConcurrentElement } from '../concurrent-verification';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { runUnifiedVerification, runCirsocDesign, computeStationDemands } from '../verification-service';
import { runOtherCode, certifyOtherCode, memberContexts } from '../design/other-codes/run';
import type { MemberContext, OtherCode, OtherCodeId } from '../design/other-codes/types';
import { ec2MemberDesign } from '../design/eurocode/ec2-member';
import { verifyElement, prepareElementVerification } from '../codes/argentina/cirsoc201';
import { ConcurrentDemand } from '../concurrent-demand';
import { EC2_RECOMMENDED } from '../design/eurocode/ec2-params';

const model = {
  elements: new Map([1, 2].map(id => [id, { id, type: 'frame', nodeI: 2 * id - 1, nodeJ: 2 * id, sectionId: 1, materialId: 1 }])),
  nodes: new Map<number, { id: number; x: number; y: number; z: number }>([1, 2].flatMap(id => [[2 * id - 1, { id: 2 * id - 1, x: 0, y: id - 1, z: 0 }], [2 * id, { id: 2 * id, x: 4, y: id - 1, z: 0 }]] as const)),
  sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'fixed' }]]),
} satisfies AutoVerifyModelData;
const combinations = [1, 2].map(id => ({ id, name: `C${id}`, factors: [] }));
function stations(elementId = 1): ElementStationResult {
  return { elementId, length: 4, stationTs: [0, 0.5, 1], comboResults: combinations.map(c => ({
    comboId: c.id, comboName: c.name, stations: [0, 0.5, 1].map(t => ({ t, x: 4 * t, n: 0, my: elementId === 2 && t === 0.5 ? 1000 : 20, mz: 0, vy: 0, vz: 1, torsion: 0 })),
  })) };
}
function raw() {
  return { displacements: [], reactions: [], elementForces: [1, 2].map(elementId => ({ elementId, length: 4,
    nStart: 0, nEnd: 0, myStart: 20, myEnd: 20, mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 1, vzEnd: 1, mxStart: 0, mxEnd: 0 })) } as never;
}
function context(): MemberContext {
  const d = extractGoverningDemands(stations());
  return { elementId: 1, element: model.elements.get(1), section: model.sections.get(1), material: model.materials.get(1),
    kind: 'beam', L: 4, Lb: 4, demands: d.demands, tuples: [...d.concurrent!],
    expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1] } as unknown as MemberContext;
}
function code(id: OtherCodeId): OtherCode {
  return { id, family: 'concrete', labelKey: '', coverageKey: '', member: vi.fn(() => ({ data: {} })),
    forces: (_, d) => ({ my: d.my }), run: vi.fn(({ forces }) => (forces as { elementId: number; my: number }[]).map(f => ({ elementId: f.elementId, ratio: f.my / 100 }))),
    read: r => ({ ratio: Number(r.ratio), pass: Number(r.ratio) <= 1, governing: 'flexure', unevaluated: [] }),
    certify: { name: 'certify_rc_members', bound: () => ({ n: 0, my: 0, mz: 0, vStrong: 0 }) } };
}
function refusal(run: () => unknown, diagnostic: Record<string, unknown>) {
  let caught: unknown;
  try { run(); } catch (e) { caught = e; }
  expect(caught).toMatchObject({ code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([expect.objectContaining(diagnostic)]) });
}

for (const t of [0, 0.5, 1]) it(`known wrong result: #2096 refuses missing declared station ${t}`, () => {
  const input = stations();
  for (const s of input.comboResults[1]!.stations) s.my = s.t === t ? 2000 : 20;
  expect(extractGoverningDemands(input).demands.find(d => d.category === 'My+')?.value).toBe(2000);
  input.comboResults[1]!.stations = input.comboResults[1]!.stations.filter(s => s.t !== t);
  refusal(() => extractGoverningDemands(input), { code: 'missing-station', elementId: 1, comboId: 2, stationT: t });
});
for (const entry of ['auto', 'unified', 'design'] as const) it(`known wrong result: #2096 ${entry} refuses a missing raw member even with complete stations`, () => {
  const data = new Map([1, 2].map(id => [id, extractGoverningDemands(stations(id))]));
  const results = raw() as unknown as { elementForces: unknown[] };
  results.elementForces.pop();
  refusal(() => ({ auto: () => autoVerifyFromResults(results as never, model, null, undefined, data),
    unified: () => runUnifiedVerification(results as never, model, null, data),
    design: () => runCirsocDesign(results as never, model, data, new Map(), null) })[entry](), { code: 'missing-member', elementId: 2 });
});
for (const id of ['aci318', 'ec2', 'aisc360', 'ec3', 'aisiS100'] as const) {
  for (const missing of ['combination', 'station', 'empty', 'undefined', 'combined'] as const) {
    it(`known wrong result: #2096 ${id} refuses ${missing} before calling a checker`, async () => {
      const ctx = context(), adapter = code(id);
      ctx.tuples = missing === 'undefined' ? undefined : missing === 'empty' ? [] : ctx.tuples!.filter(t =>
        missing === 'combination' ? t.comboId !== 2 : missing === 'combined' ? t.comboId !== 2 && t.stationT !== 0.5 : !(t.comboId === 2 && t.stationT === 0.5));
      const diagnostic = missing === 'station' ? { code: 'missing-station', elementId: 1, comboId: 2, stationT: 0.5 } : { code: 'missing-combination', comboId: 2 };
      refusal(() => runOtherCode(adapter, [ctx]), diagnostic);
      expect(adapter.member).not.toHaveBeenCalled();
      const call = vi.fn();
      await expect(certifyOtherCode(adapter, [ctx], () => null, call)).rejects.toMatchObject({ code: 'incomplete-concurrent-demand' });
      expect(call).not.toHaveBeenCalled();
    });
  }
  it(`${id} complete zero and nonzero demands retain their answer`, () => {
    const adapter = code(id), ctx = context();
    expect(runOtherCode(adapter, [ctx]).rows[0]).toMatchObject({ status: 'checked', reading: { ratio: 0.2, pass: true } });
    ctx.tuples = ctx.tuples!.map(t => ({ ...t, stationT: t.forces.t, stationX: t.forces.x, forces: { ...t.forces, my: 0 } }));
    ctx.demands = ctx.demands.map(d => ({ ...d, forces: { ...d.forces, my: 0 } }));
    expect(runOtherCode(adapter, [ctx]).rows[0]).toMatchObject({ status: 'checked', reading: { ratio: 0, pass: true } });
  });
}
it('known wrong result: #2096 EC2 peak design refuses a missing declared combination', () => {
  const ctx = context();
  refusal(() => ec2MemberDesign({ kind: 'beam', b: 0.4, h: 0.4, L: 4, demands: ctx.demands,
    tuples: ctx.tuples!.filter(t => t.comboId !== 2), expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1],
    cover: 0.025, linkDia: 8, barDia: 16, fck: 30, fyk: 420, params: EC2_RECOMMENDED } as never), { code: 'missing-combination', comboId: 2 });
});
it('known wrong result: #2096 missing active combination has a typed and identified refusal', () => {
  for (const run of [() => computeStationDemands(new Map([[1, raw()]]), combinations, model),
    () => memberContexts(model as never, new Map([[1, raw()]]), combinations)]) {
    refusal(run, { code: 'missing-combination', comboId: 2, comboName: 'C2' });
  }
});

for (const entry of ['direct', 'prepared'] as const) for (const t of [0, 0.5, 1]) {
  it(`known wrong result: #2096 ${entry} cannot check a partial declared station set at ${t}`, () => {
    const input = stations();
    for (const s of input.comboResults[1]!.stations) s.my = s.t === t ? 2000 : 20;
    input.comboResults[1]!.stations = input.comboResults[1]!.stations.filter(s => s.t !== t);
    refusal(() => {
      const d = ConcurrentDemand.fromStations(input)[0]!.section('My');
      const i = { elementId: 1, elementType: 'beam' as const, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: d };
      return entry === 'direct' ? verifyElement(i) : prepareElementVerification(i)();
    }, { code: 'missing-station', elementId: 1, comboId: 2, stationT: t });
  });
}
for (const entry of ['auto', 'unified', 'design'] as const) for (const t of [0, 0.5, 1]) {
  it(`known wrong result: #2096 ${entry} detects tuples removed after extraction at ${t}`, () => {
    const data = new Map([1, 2].map(id => [id, extractGoverningDemands(stations(id))]));
    const d = data.get(2)!;
    data.set(2, { ...d, concurrent: d.concurrent!.filter(s => !(s.comboId === 2 && s.stationT === t)) });
    refusal(() => ({ auto: () => autoVerifyFromResults(raw(), model, null, undefined, data),
      unified: () => runUnifiedVerification(raw(), model, null, data),
      design: () => runCirsocDesign(raw(), model, data, new Map(), null) })[entry](), { code: 'missing-station', elementId: 2, comboId: 2, stationT: t });
  });
}

it('known wrong result: #2096 aggregation refuses a subset of previously complete inputs', () => {
  const inputs = ConcurrentDemand.fromStations(stations()).filter(d => !(d.comboId === 2 && d.stationT === 0.5)).map(d => ({
    elementId: 1, elementType: 'beam' as const, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, demand: d.section('My'),
  }));
  refusal(() => verifyConcurrentElement(inputs), { code: 'missing-station', elementId: 1, comboId: 2, stationT: 0.5 });
});

it('known wrong result: #2096 converting a partial complete set cannot erase its requested scope', () => {
  const tuples = ConcurrentDemand.fromStations(stations()).filter(d => d.comboId !== 2);
  refusal(() => ConcurrentDemand.fromTuples(tuples), { code: 'missing-combination', comboId: 2 });
});
it('known wrong result: #2096 extraction refuses an entirely omitted declared combination', () => {
  const input = { ...stations(), expectedCombinationIds: [1, 2] };
  input.comboResults.pop();
  refusal(() => extractGoverningDemands(input), { code: 'missing-combination', comboId: 2 });
});
for (const t of [0, 0.5, 1]) it(`known wrong result: #2096 supplied reinforcement refuses missing station ${t}`, () => {
  const s = stations();
  const d = extractGoverningDemands(s);
  for (const c of s.comboResults) c.stations = c.stations.filter(p => p.t !== t);
  refusal(() => verifyProvidedReinforcement(1, 'beam', { bottom: { count: 4, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } }, d, {},
    { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }, s), { code: 'missing-station', elementId: 1, comboId: 1, stationT: t });
});
for (const missing of ['station', 'empty', 'undefined', 'combined'] as const) it(`known wrong result: #2096 EC2 peak design refuses ${missing}`, () => {
  const ctx = context();
  const tuples = missing === 'undefined' ? undefined : missing === 'empty' ? [] : ctx.tuples!.filter(t =>
    missing === 'combined' ? t.comboId !== 2 && t.stationT !== 0.5 : t.stationT !== 0.5);
  refusal(() => ec2MemberDesign({ kind: 'beam', b: 0.4, h: 0.4, L: 4, demands: ctx.demands, tuples,
    expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1], cover: 0.025, linkDia: 8, barDia: 16, fck: 30, fyk: 420, params: EC2_RECOMMENDED }),
    missing === 'empty' || missing === 'undefined' ? { code: 'missing-combination', comboId: 1 } : { code: 'missing-station', comboId: 1, stationT: 0.5 });
});
it('known wrong result: #2096 another member demand record cannot fill a missing member cell', () => {
  const d = extractGoverningDemands(stations());
  refusal(() => autoVerifyFromResults(raw(), model, null, undefined, new Map([[1, d], [2, d]])), { code: 'missing-member', elementId: 2 });
});
it('known wrong result: #2096 station coverage uses the actual force location', () => {
  const ctx = context();
  ctx.tuples = ctx.tuples!.map(d => ({ ...d, stationT: d.stationT, stationX: d.stationX,
    forces: { ...d.forces, t: d.forces.t === 1 ? 0.5 : d.forces.t } }));
  refusal(() => runOtherCode(code('ec3'), [ctx]), { code: 'missing-station', elementId: 1, comboId: 1, stationT: 1 });
});
