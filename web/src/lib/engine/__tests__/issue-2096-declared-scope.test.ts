import { checkDeclaredSteelMember } from './helpers/declared-demands';
import { declaredTestDemands } from './helpers/declared-demands';
import { expect, it, vi } from 'vitest';
import { lineDemand, lineTransverseDemand } from '../design/beam-line-demand';
import { resolveSectionState } from '../../section/state';
import { isVariableMember } from '../../section/variable';
import type { Section } from '../../store/model.svelte';
import { autoVerifyFromResults } from '../auto-verify';
import { CompleteDemandSet } from '../complete-demand-set';
import { completeMemberDemands } from '../member-demand-gate';
import { completeResultDemands } from '../result-demand-gate';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { checkVariableSteelMember, steelGoverningRatio, runSteelVerification, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import { ec2MemberDesign } from '../design/eurocode/ec2-member';
import { EC2_RECOMMENDED } from '../design/eurocode/ec2-params';
import { runOtherCode, certifyOtherCode } from '../design/other-codes/run';
import type { MemberContext, OtherCode } from '../design/other-codes/types';
import type { AnalysisResults3D } from '../types-3d';

const section = profileToSectionFull(profileByName('IPE 300')!);
const steel = { fy: 250, fu: 400, e: 200000 };
const lengths = { L: 4, Lb: 4 };
const sections = new Map([[1, { ...section, id: 1 }]]);
const force = (t: number) => ({ t, x: 4 * t, n: -300, my: t === 0.5 ? 60 : 0, mz: 0, vy: 0, vz: 20, torsion: 0 });
function stations(elementId = 1, comboIds = [1, 2]): ElementStationResult {
  return { elementId, length: 4, stationTs: [0, 1], comboResults: comboIds.map(comboId => ({
    comboId, comboName: `C${comboId}`, stations: (comboId === 1 ? [0, 0.5, 1] : [0, 1]).map(force),
  })) };
}
const variable = (input: ElementStationResult) => checkVariableSteelMember(1, { sectionId: 1 }, sections as never, steel, input, lengths)!;

for (const extra of [0, 0.5, 1]) it(`known wrong result: #2096 round4 variable steel consumes verified station ${extra}`, () => {
  const input = stations();
  input.stationTs = [0.25, 0.75];
  input.comboResults[0]!.stations = [0.25, extra, 0.75].map(force);
  input.comboResults[1]!.stations = [0.25, 0.75].map(force);
  const actual = variable(input);
  const controls = input.comboResults.flatMap(c => c.stations.map(s => checkDeclaredSteelMember(1, {
    Nc: 300, Nt: 0, MuStrong: Math.abs(s.my), MuWeak: 0, Vu: 20, VuStrong: 20, VuWeak: 0, diagram: [],
    concurrent: declaredTestDemands([{ comboId: c.comboId, comboName: c.comboName, forces: s }]),
  }, section, steel, lengths)!));
  expect(steelGoverningRatio(actual)).toBe(Math.max(...controls.map(steelGoverningRatio)));
  expect(actual.governingCombos!.interaction!.comboId).toBe(1);
});
it('known wrong result: #2096 round4 variable steel accepts C1 endpoints and midpoint with C2 endpoints', () => {
  const actual = variable(stations());
  expect(steelGoverningRatio(actual)).toBeGreaterThan(0);
  expect(actual.governingCombos!.interaction).toMatchObject({ comboId: 1, t: 0.5 });
});
it('round4 variable steel common-grid control retains its answer', () => {
  const input = stations();
  input.comboResults[1]!.stations = [0, 0.5, 1].map(force);
  const actual = variable(input);
  expect(steelGoverningRatio(actual)).toBeGreaterThan(0);
  expect(actual.governingCombos!.interaction).toMatchObject({ comboId: 1, t: 0.5 });
});
for (const t of [0, 0.5, 1]) it(`round4 variable steel refuses a missing declared station ${t} before checking`, () => {
  const input = stations();
  input.stationTs = [0, 0.5, 1];
  input.comboResults[1]!.stations = [0, 0.5, 1].filter(s => s !== t).map(force);
  expect(() => variable(input)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand',
    diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'missing-station', comboId: 2, stationT: t })]) }));
});
function members() {
  return [1, 2].map(elementId => {
    const d = extractGoverningDemands(stations(elementId, [elementId]));
    return { elementId, demands: d.demands, tuples: d.concurrent!, expectedCombinationIds: [elementId], stationTs: [0, 1] };
  });
}
function raw(): AnalysisResults3D {
  return { displacements: [], reactions: [], elementForces: [1, 2].map(elementId => ({ elementId, length: 4,
    nStart: -300, nEnd: -300, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0,
    vzStart: 20, vzEnd: 20, mxStart: 0, mxEnd: 0 })) } as unknown as AnalysisResults3D;
}
it('known wrong result: #2096 round4 member gate validates each declared combination member inventory', () => {
  const input = members();
  expect(completeMemberDemands(input).values.map(r => [r.elementId, r.comboId, r.stationT])).toEqual(
    input.flatMap(m => m.tuples.map(d => [m.elementId, d.comboId, d.stationT])));
});
it('known wrong result: #2096 round4 result gate preserves per-member combination inventories', () => {
  const demands = new Map([1, 2].map(id => [id, extractGoverningDemands(stations(id, [id]))]));
  expect(completeResultDemands(raw(), [1, 2], demands).values.map(r => [r.elementId, r.comboId])).toEqual(
    members().flatMap(m => m.tuples.map(d => [m.elementId, d.comboId])));
});
for (const id of ['aci318', 'ec2', 'aisc360', 'ec3', 'aisiS100'] as const) for (const entry of ['check', 'certify'] as const) {
  it(`known wrong result: #2096 round4 ${id} ${entry} consumes disjoint declared member scopes`, async () => {
    const contexts = members().map(m => ({ ...m, kind: 'beam', L: 4, Lb: 4 } as unknown as MemberContext));
    const code: OtherCode = { id, family: 'concrete', labelKey: '', coverageKey: '', member: ctx => ({ data: { elementId: ctx.elementId } }),
      forces: (_, d) => ({ my: d.my }), run: ({ forces }) => forces.map(f => ({ elementId: (f as { elementId: number }).elementId, ratio: 0 })),
      read: () => ({ ratio: 0, pass: true, governing: 'flexure', unevaluated: [] }),
      certify: { name: 'certify_rc_members', bound: () => ({ n: 0, my: 0, mz: 0, vStrong: 0 }) } };
    if (entry === 'check') expect(runOtherCode(code, contexts).rows.map(r => [r.elementId, r.status])).toEqual([[1, 'checked'], [2, 'checked']]);
    else {
      const call = vi.fn(async (_name: string, args: unknown[]) => {
        const { members } = JSON.parse(args[0] as string) as { members: { elementId: number }[] };
        return members.map(m => ({ elementId: m.elementId, certified: true, utilizationLower: 0, utilizationUpper: 0 }));
      });
      const certificates = await certifyOtherCode(code, contexts, () => ({} as never), call);
      expect([...certificates.keys()]).toEqual([1, 2]);
      expect([...certificates.values()].every(c => c.status === 'ok')).toBe(true);
      expect(call).toHaveBeenCalled();
    }
  });
}
it('round4 common member-combination scope still answers and refuses omitted declared cells', () => {
  const input = members().map(m => ({ ...m, ...(() => {
    const d = extractGoverningDemands(stations(m.elementId));
    return { demands: d.demands, tuples: d.concurrent!, expectedCombinationIds: [1, 2] };
  })() }));
  expect(completeMemberDemands(input).values).toHaveLength(10);
  for (const comboId of [1, 2]) for (const elementId of [1, 2]) {
    const partial = input.map(m => m.elementId === elementId ? { ...m, tuples: m.tuples.filter(d => d.comboId !== comboId) } : m);
    expect(() => completeMemberDemands(partial)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
  }
});

function beamMember(input: ElementStationResult) {
  return { ctx: { stations: input, axes: { flexure: 'My', shear: 'Vz', bFlex: 0.3, hFlex: 0.6 },
    material: { fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 } }, offset: 0, L: 4, forward: true } as never;
}
for (const entry of ['flexure', 'transverse'] as const) {
  const run = (input: ElementStationResult, comboId?: number) => entry === 'flexure'
    ? lineDemand([beamMember(input)], comboId) : lineTransverseDemand([beamMember(input)], comboId);
  it(`known wrong result: #2096 round4 beam line ${entry} groups verified tuples by actual station`, () => {
    const input = stations();
    for (const c of input.comboResults) for (const s of c.stations) { s.n = 0; s.torsion = s.t === 0.5 ? 6 : 0; }
    const actual = run(input);
    expect(actual.map(p => p.x)).toEqual([0, 2, 4]);
    const c1 = run({ ...input, stationTs: [0, 0.5, 1], comboResults: [input.comboResults[0]!] });
    expect(actual).toEqual(c1);
    expect(run(input, 2).map(p => p.x)).toEqual([0, 2, 4]);
  });
  for (const t of [0, 0.5, 1]) it(`known wrong result: #2096 round4 beam line ${entry} refuses missing declared station ${t} before filtering`, () => {
    const input = stations();
    input.stationTs = [0, 0.5, 1];
    input.comboResults[1]!.stations = [0, 0.5, 1].filter(s => s !== t).map(force);
    expect(() => run(input, 1)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
  });
  it(`round4 beam line ${entry} common-grid control answers unchanged`, () => {
    const input = stations();
    input.comboResults[1]!.stations = [0, 0.5, 1].map(force);
    input.stationTs = [0, 0.5, 1];
    expect(run(input)).toEqual(run({ ...input, comboResults: [input.comboResults[0]!] }));
  });
}

for (const entry of ['variable', 'flexure', 'transverse'] as const) it(`known wrong result: #2096 round4 ${entry} validates declared scope once before station iteration`, () => {
  const input = stations();
  input.comboResults[1]!.stations = [0, 0.5, 1].map(force);
  const gate = vi.spyOn(CompleteDemandSet, 'require');
  try {
    const actual = entry === 'variable' ? variable(input) : entry === 'flexure'
      ? lineDemand([beamMember(input)]) : lineTransverseDemand([beamMember(input)]);
    expect(actual).toBeTruthy();
    expect(gate).toHaveBeenCalledTimes(1);
  } finally { gate.mockRestore(); }
});

function steelModel() {
  const ends = ['IPE 300', 'IPE 200'].map((name, i) => {
    const section = { ...profileToSectionFull(profileByName(name)!), name, id: i + 1 } as Section;
    section.canonical = resolveSectionState(section);
    return [i + 1, section] as const;
  });
  return { elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, variableSection: { sectionJ: 2 } }]]),
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]),
    sections: new Map(ends),
    materials: new Map([[1, { id: 1, name: 'steel', ...steel, nu: 0.3 }]]),
    supports: new Map() };
}
it('known wrong result: #2096 round4 steel model entry consumes the same verified variable station set', () => {
  const input = stations();
  const result = { ...raw(), elementForces: raw().elementForces.filter(e => e.elementId === 1) };
  const model = steelModel();
  expect(isVariableMember(model.sections, model.elements.get(1)!)).toBe(true);
  const expected = checkVariableSteelMember(1, model.elements.get(1)!, model.sections as never, steel, input, lengths);
  expect(runSteelVerification(result, model, new Map([[1, extractGoverningDemands(input)]]), new Map([[1, input]])))
    .toEqual([expected]);
});
for (const t of [0, 0.5, 1]) it(`round4 steel model entry refuses missing declared station ${t}`, () => {
  const input = stations();
  const demands = extractGoverningDemands(input);
  input.stationTs = [0, 0.5, 1];
  input.comboResults[1]!.stations = [0, 0.5, 1].filter(s => s !== t).map(force);
  const result = { ...raw(), elementForces: raw().elementForces.filter(e => e.elementId === 1) };
  expect(() => runSteelVerification(result, steelModel(), new Map([[1, demands]]), new Map([[1, input]])))
    .toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
});
for (const entry of ['auto', 'unified', 'design'] as const) it(`known wrong result: #2096 round4 ${entry} iterates only members declared in each combination`, () => {
  const model = { elements: new Map([1, 2].map(id => [id, { id, type: 'frame', nodeI: id * 2 - 1, nodeJ: id * 2, sectionId: 1, materialId: 1 }])),
    nodes: new Map<number, { id: number; x: number; y: number; z: number }>([1, 2].flatMap(id => [[id * 2 - 1, { id: id * 2 - 1, x: 0, y: id, z: 0 }], [id * 2, { id: id * 2, x: 4, y: id, z: 0 }]] as const)),
    sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4 }]]),
    materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
    supports: new Map() };
  const demands = new Map([1, 2].map(id => [id, extractGoverningDemands(stations(id, [id]))]));
  const run = (ids: number[]) => {
    const scoped = { ...model, elements: new Map(ids.map(id => [id, model.elements.get(id)!])) };
    const results = { ...raw(), elementForces: raw().elementForces.filter(e => ids.includes(e.elementId)) };
    return entry === 'auto' ? autoVerifyFromResults(results, scoped, null, undefined, demands).concrete
      : entry === 'unified' ? runUnifiedVerification(results, scoped, null, demands)
        : runCirsocDesign(results, scoped, demands, new Map(), null).concrete;
  };
  expect(run([1, 2])).toEqual([...run([1]), ...run([2])]);
});

function memberWithExtraGoverningCase() {
  const input = members()[1]!;
  const extra = { ...input.demands[0]!, comboId: 2, comboName: 'C2', stationT: 0.5, stationX: 2, forces: force(0.5) };
  return { ...input, demands: [extra], kind: 'beam' as const, L: 4, Lb: 4 };
}
for (const id of ['aci318', 'ec2', 'aisc360', 'ec3', 'aisiS100'] as const) it(`round4 ${id} retains a supplied governing case beyond the common grid`, async () => {
  const ctx = memberWithExtraGoverningCase();
  const code: OtherCode = { id, family: 'concrete', labelKey: '', coverageKey: '', member: ctx => ({ data: { elementId: ctx.elementId } }),
    forces: (_, d) => ({ my: d.my }), run: ({ forces }) => forces.map(f => ({ elementId: (f as { elementId: number }).elementId, ratio: (f as { my: number }).my / 100 })),
    read: r => ({ ratio: Number(r.ratio), pass: Number(r.ratio) <= 1, governing: 'flexure', unevaluated: [] }),
    certify: { name: 'certify_rc_members', bound: () => ({ n: 0, my: 0, mz: 0, vStrong: 0 }) } };
  expect(runOtherCode(code, [ctx as unknown as MemberContext]).rows[0]).toMatchObject({ status: 'checked', reading: { ratio: force(0.5).my / 100 } });
  const call = vi.fn(async (_name: string, _args: unknown[]) => []);
  await certifyOtherCode(code, [ctx as unknown as MemberContext], () => ({} as never), call);
  const evaluated = call.mock.calls.map(args => JSON.parse(args[1][0] as string).demands[0].forces.my);
  expect(evaluated).toEqual([force(0.5).my, 0, 0]);
});
it('round4 EC2 peak design retains a supplied governing case beyond the common grid', () => {
  const ctx = memberWithExtraGoverningCase();
  const input = { ...ctx, b: 0.4, h: 0.4, cover: 0.025, linkDia: 8, barDia: 16, fck: 30, fyk: 420, params: EC2_RECOMMENDED };
  const actual = ec2MemberDesign(input);
  expect(actual).toEqual(ec2MemberDesign({ ...input, tuples: [...ctx.demands, ...ctx.tuples] }));
});
