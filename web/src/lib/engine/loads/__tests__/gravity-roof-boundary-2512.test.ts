import { expect, it } from 'vitest';
import { buildLoadPlan } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { snowLoadCases } from '../snow-loads';
import { input } from './gravity-width-mass-fixture';
import { snow, pressure } from './snow-roof-plane-fixture';
import { asymmetric, transform } from './snow-surface-round2-fixture';

for (const mode of ['width', 'panels'] as const) {
  it(`#2512 a rotated roof preserves the actions on its own boundary in ${mode} mode`, () => {
    const gravity = { mode };
    const tributaryWidth = 1;
    const eaves = [8, 9];
    const roof = { use: 'maintenance', weight: 'heavy', dead: 3, slopeDeg: 0 } as const;
    const baseline = asymmetric();
    const rotated = transform(asymmetric(), 0.37, 0);
    const options = { ...gravity, tributaryWidth };
    const reference = planAreaLoads({
      layout: gravityLayout(baseline, options), tributaryWidth,
      floor: { dead: 1, lo: 2, liveOf: () => 2 },
      roof: { ...roof, slopePercent: 0 },
    });
    const layout = gravityLayout(rotated, options);
    const loads = planAreaLoads({
      layout, tributaryWidth,
      floor: { dead: 1, lo: 2, liveOf: () => 2 },
      roof: { ...roof, slopePercent: 0 },
    });
    const plan = buildLoadPlan(input(rotated, { gravity, tributaryWidth, snow: { ...snow, enabled: true, source: 'site' } }));
    const directSnow = snowLoadCases({ model: rotated, layout, snow, tributaryWidth })!;
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(directSnow.result.refused).toBeUndefined();
    const snowCase = plan.cases.findIndex(c => c.type === 'S');
    expect(snowCase).toBeGreaterThanOrEqual(0);
    for (const id of eaves) {
      expect(layout.roof.has(id)).toBe(true);
      const dead = loads.distributed.filter(load => load.caseType === 'D' && load.elementId === id);
      const referenceDead = reference.distributed.filter(load => load.caseType === 'D' && load.elementId === id);
      expect(dead).toHaveLength(referenceDead.length);
      expect(dead.length).toBeGreaterThan(0);
      for (const [index, load] of dead.entries()) {
        expect(load.q).toBeCloseTo(referenceDead[index]!.q, 9);
        expect(load.qJ ?? load.q).toBeCloseTo(referenceDead[index]!.qJ ?? referenceDead[index]!.q, 9);
      }
      const direct = pressure(directSnow.cases[0]!.distributed, id, 3.5);
      expect(direct).toBeGreaterThan(0);
      const planned = pressure(plan.distributed.filter(load => load.caseIndex === snowCase), id, 3.5);
      expect(planned).toBeCloseTo(direct, 9);
    }
  });
}
