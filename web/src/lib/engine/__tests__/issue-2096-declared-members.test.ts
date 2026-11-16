import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { DemandInventory } from '../complete-demand-set';

const regression = process.env.RUN_KNOWN_WRONG === '2096' ? it : it.skip;
const tuple = (elementId: number, comboId: number, t: number) => ({ elementId, comboId, comboName: `C${comboId}`,
  forces: { t, x: t, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0 } });

regression('known wrong result: #2096 round10 declared inventory preserves disjoint member combinations', () => {
  const inventory = DemandInventory.declare({ combinations: [
    { comboId: 1, members: [{ elementId: 1, stationTs: [0] }] },
    { comboId: 2, members: [{ elementId: 2, stationTs: [1] }] },
  ] });
  const source = [tuple(1, 1, 0), tuple(2, 2, 1)];
  for (const rows of [source, [...source].reverse()]) {
    const demands = ConcurrentDemand.fromTuples(rows, { inventory, combinationIds: [], stationTs: [] });
    expect(demands.map(d => [d.elementId, d.comboId, d.stationT])).toEqual(rows.map(r => [r.elementId, r.comboId, r.forces.t]));
    for (const demand of demands) expect(demand.inventory).toBe(inventory);
    expect(ConcurrentDemand.fromTuples(demands)).toHaveLength(2);
  }
});

regression('known wrong result: #2096 round10 declared inventory preserves stations within each member combination', () => {
  const inventory = DemandInventory.declare({ combinations: [
    { comboId: 1, members: [{ elementId: 1, stationTs: [0, 1] }, { elementId: 2, stationTs: [0, 0.5, 1] }] },
    { comboId: 2, members: [{ elementId: 2, stationTs: [0, 0.2, 1] }] },
  ] });
  const source = inventory.scope.combinations.flatMap(c => c.members.flatMap(m => m.stationTs.map(t => tuple(m.elementId, c.comboId, t))));
  const declared = { inventory, combinationIds: [], stationTs: [] };
  const demands = ConcurrentDemand.fromTuples(source, declared);
  expect(demands).toHaveLength(source.length);
  for (const demand of demands) expect(demand.inventory).toBe(inventory);
  for (const removed of source) {
    const partial = source.filter(r => r !== removed);
    expect(() => ConcurrentDemand.fromTuples(partial, declared)).toThrow(/missing-station/);
  }
  for (const comboId of [1, 2]) expect(() => ConcurrentDemand.fromTuples(source.filter(r => r.comboId !== comboId), declared)).toThrow(/missing-combination/);
  for (const elementId of [1, 2]) expect(() => ConcurrentDemand.fromTuples(source.filter(r => r.elementId !== elementId), declared)).toThrow(/missing-member/);
  const extra = ConcurrentDemand.fromTuples([...source, tuple(2, 2, 0.75)], declared);
  expect(extra).toHaveLength(source.length + 1);
  expect(() => ConcurrentDemand.fromTuples(extra.filter(d => d.stationT !== 0.75))).toThrow(/missing-station/);
  expect(() => ConcurrentDemand.fromTuples(source, { combinationIds: [], stationTs: [] })).toThrow(/member inventory/);
});
