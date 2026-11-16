import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { assertSnowRemeshInvariant, remeshSnowRoof } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData } from '../load-plan';

const regression = process.env.RUN_KNOWN_WRONG === '2172' ? it : it.skip;

function dome(angle: number) {
  const rim = [[0, 0, 3], [8, 0, 3], [8, 8, 3], [0, 8, 3]], crown = [4, 4, 5];
  return transform(mesh(rim.map((p, k) => [p, rim[(k + 1) % rim.length]!, crown])), angle, 0);
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['projected', 'width', 'panels'] as const) {
  regression(`known wrong result: #2172 faceted dome physical panels ${mode} ${angle}`, () => {
    const model = dome(angle);
    const expected = 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
    const generate = (m: LoadModelData) => {
      const layout = mode === 'projected' ? undefined : gravityLayout(m, { mode, tributaryWidth: 1, loadEveryPanel: true });
      if (mode === 'panels') {
        expect(layout!.pieces).toHaveLength(8);
        expect(layout!.panels.find(p => p.z === 3)!.roof).toBe(true);
      }
      const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofKind: 'dome' }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      expect(pressure(out.cases[0]!.distributed, 1, 1)).toBeCloseTo(expected, 10);
      return out;
    };
    generate(model);
    generate(remeshSnowRoof(model, new Map([[2, 8]])).model);
    for (const id of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[id, 8]]), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 3])), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 2 + id % 4])), generate);
  });
}

for (const angle of [0, 0.37]) regression(`known wrong result: #2172 complete explicit-panel planner retains dome snow ${angle}`, () => {
  const model = remeshSnowRoof(dome(angle), new Map([[2, 8]])).model;
  const out = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode: 'panels', loadEveryPanel: true }, tributaryWidth: 1, snow: { ...snow, roofKind: 'dome', enabled: true, source: 'site' } });
  expect(out.outcome).toBe('READY');
  const index = out.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.balancedShaped');
  const expected = 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
  expect(pressure(out.distributed.filter(d => d.caseIndex === index), 1, 1)).toBeCloseTo(expected, 10);
});
