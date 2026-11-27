import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { remapSpanInterval } from '../../member-span-loads';
import { columns } from './wind-integration-fixture';

for (const reverse of [false, true]) it.skip(`known wrong result: #2222 gallery wind meets a declared landing with reversed carrier ${reverse}`, () => {
  const model = columns([0, 5.8, 8.6]);
  model.nodes.set(100, { id: 100, x: 1.9, y: 8.5, z: 7.2 });
  const carrier = [...model.elements.values()].find(e => model.nodes.get(e.nodeI)!.z === 5.8)!;
  if (reverse) [carrier.nodeI, carrier.nodeJ] = [carrier.nodeJ, carrier.nodeI];
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  planWind({
    model, tributaryWidth: 1,
    wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1,
      kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+y'], directions: { x: false, y: true }, bothSenses: false, caseSet: 'case1' },
  } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  const rows = sink.distributed.filter(d => d.elementId === carrier.id && d.caseIndex === 0);
  const start = model.nodes.get(carrier.nodeI)!.z!;
  const cut = Math.abs(7.2 - start), length = 8.6 - 5.8;
  expect(rows.some(d => d.b === cut)).toBe(true);
  expect(rows.some(d => d.a === cut)).toBe(true);
  for (const row of rows) {
    for (const [lo, hi] of [[0, cut], [cut, length]] as const) {
      expect(() => remapSpanInterval(carrier.id, row.a ?? 0, row.b ?? length, lo, hi, hi - lo)).not.toThrow();
    }
  }
});
