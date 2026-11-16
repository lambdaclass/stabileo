import { expect, it } from 'vitest';
import { expectWindTips } from './wind-tip-assertions';
import { windHeightField } from '../wind-pressure-field';
import { otherStructureWind } from '../wind-other';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { mesh, remeshWind, variants, windProject, windResultants } from './wind-integration-fixture';

const regression = it.skipIf(process.env.RUN_KNOWN_WRONG !== '2220');

for (const rows of [[], [{ nodeId: 1, ux: 2, uy: 2 }]]) regression.each(['ux', 'uy'] as const)('known wrong result: #2220 requires every expected tip row for %s', component => {
  expect(() => expectWindTips(rows, [1, 2], component, 2, 12)).toThrow();
});
it('complete tip rows keep the numerical assertion active', () => {
  expectWindTips([{ nodeId: 1, ux: 2 }, { nodeId: 2, ux: 2 }], [1, 2], 'ux', 2, 12);
  expect(() => expectWindTips([{ nodeId: 1, ux: 3 }], [1], 'ux', 2, 12)).toThrow();
});

const sinkFor = (model: ReturnType<typeof mesh>, axis: 'x' | 'y', other = false) => {
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [axis === 'x' ? '+x' : '+y'], caseSet: 'case1', ...(other ? { structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 1, diagonal: false, width: 2 } } : { profile: [[0, 0], [4, 4]] }) } } as LoadPlanInput, levels, sink);
  return sink;
};

for (const axis of ['x', 'y'] as const) regression('known wrong result: #2220 reports varying pressure forces as nodal shares on ' + axis, () => {
  const source = mesh([[[-1, -1, 0], [-1, -1, 4]], [[1, 1, 0], [1, 1, 4]]]);
  const sink = sinkFor(source, axis);
  expect(sink.blockedKeys).toEqual([]);
  expect(sink.derivation.filter(m => m.key === 'loadPlan.derivation.windLevel')).toEqual([]);
  const rows = sink.derivation.filter(m => m.key === 'loadPlan.derivation.windNodalShare');
  expect(rows).toHaveLength(4);
  expect(rows.map(m => Number(m.params?.force)).sort((a, b) => a - b)).toEqual([2.7, 2.7, 5.3, 5.3]);
  expect(rows.every(m => !('net' in (m.params ?? {})) && !('z0' in (m.params ?? {})) && !('z1' in (m.params ?? {})) && 'node' in (m.params ?? {}))).toBe(true);
});

for (const variant of variants) for (const entry of ['field', 'other', 'planner'] as const) regression(`known wrong result: #2220 tower-to-mast declared width ${entry} ${variant}`, () => {
  const source = mesh([[[0, -1, 0], [0, -0.5, 2]], [[0, 1, 0], [0, 0.5, 2]], [[0, 0, 2], [0, 0, 4]]]);
  const { model } = remeshWind(source, variant), axis = variant === 'rotate' ? 'y' : 'x';
  if (entry === 'field') {
    const field = windHeightField({ model, axis, from: 0, to: 4, width: 2, pressure: () => 1 });
    let force = 0, first = 0;
    for (const [id, f] of [...field.loads, ...field.baseLoads]) { force += f; first += f * model.nodes.get(id)!.z!; }
    expect(force).toBeCloseTo(7, 10);
    expect(first).toBeCloseTo(44 / 3, 10);
  } else {
    const result = entry === 'other' ? otherStructureWind({ model, structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 1, diagonal: false, width: 2 }, project: windProject, directions: [axis === 'x' ? '+x' : '+y'], tributaryWidth: 2 }) : sinkFor(model, axis, true);
    expect('blockedKeys' in result ? result.blockedKeys : result.notes).toEqual([]);
    expect(result.cases.length).toBeGreaterThan(0);
    const loads = 'distributed' in result ? result.distributed.filter(p => p.caseIndex === 0) : result.cases[0]!.distributed.map(p => ({ ...p, q: p.qZ }));
    expect(loads.length).toBeGreaterThan(0);
    const expected = otherStructureWind({ model: mesh([[[0, 0, 0], [0, 0, 4]]]), structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 1, diagonal: false, width: 2 }, project: windProject, directions: [axis === 'x' ? '+x' : '+y'], tributaryWidth: 2 });
    const force = Math.abs(windResultants(model, loads)[axis === 'x' ? 0 : 1]!);
    const reference = Math.abs(windResultants(mesh([[[0, 0, 0], [0, 0, 4]]]), expected.cases[0]!.distributed.map(p => ({ ...p, q: p.qZ })))[axis === 'x' ? 0 : 1]!);
    expect(force).toBeCloseTo(reference * 7 / 8, 8);
  }
});

for (const span of [0.05 - 1e-7, 0.05, 0.05 + 1e-7]) for (const width of [undefined, 0, 2]) it(`band width boundary span=${span} declared=${width}`, () => {
  const model = mesh([[[0, -span / 2, 0], [0, -span / 4, 2]], [[0, span / 2, 0], [0, span / 4, 2]]]);
  const run = () => windHeightField({ model, axis: 'x', from: 0, to: 2, width, pressure: () => 1 });
  if (span <= 0.05 && width !== 2) expect(run).toThrow('wind.pressure.missingWidth');
  else {
    const field = run();
    expect([...field.loads.values(), ...field.baseLoads.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(span > 0.05 ? 1.5 * span : 4, 10);
  }
});

regression('known wrong result: #2220 evaluates physical pressure once per band station', () => {
  const samples = new Map<number, number>();
  const field = windHeightField({ model: mesh([0, 2].flatMap(x => [-1, 1].map(y => [[x, y, 0], [x, y, 4]]))), axis: 'x', from: 0, to: 4, pressure: z => { samples.set(z, (samples.get(z) ?? 0) + 1); return 1 + z ** 2; } });
  expect(field.members.length).toBeGreaterThan(0);
  expect(Math.max(...samples.values())).toBe(1);
  expect([...field.loads.values(), ...field.baseLoads.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(2 * (4 + 4 ** 3 / 3), 10);
});
