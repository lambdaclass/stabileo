import { expect, it } from 'vitest';
import { generateCombinations } from '../../../codes/cirsoc101/combinations';
import { buildLoadPlan } from '../load-plan';
import { expandCombinations } from '../combination-cases';
import { mesh } from './snow-surface-round2-fixture';
import { regulations, snow } from './snow-roof-plane-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2211' ? it : it.skip;

regression('known wrong result: #2211 native companion rules materialize flat-roof snow on a 20 degree roof', () => {
  const model = mesh([[[0, 0, 3], [10, 0, 3 + 10 * Math.tan(20 * Math.PI / 180)]]]);
  const specs = generateCombinations({ present: { L: true, Lr: false, S: true, R: false, W: false, E: false, F: false, H: false }, notActing: false });
  const plan = buildLoadPlan({ model, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    projectCombinations: specs, snow: { ...snow, enabled: true, source: 'site', roofKind: 'mono' } });
  expect(plan.outcome).toBe('READY');
  const cases = plan.cases.map((c, i) => ({ ...c, id: i + 1, name: c.nameKey }));
  const combo = expandCombinations(plan.combinations, cases).find(c => c.specId === '2-S')!;
  expect(combo).toBeDefined();
  const force = combo.factors.reduce((sum, f) => sum + plan.distributed.filter(d => d.caseType === 'S' && d.caseIndex === f.caseId - 1).reduce((v, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return v - f.factor * (d.q + (d.qJ ?? d.q)) / 2 * ((d.b ?? L) - (d.a ?? 0)) * Math.hypot(b.x - a.x, b.y - a.y) / L;
  }, 0), 0);
  expect(force).toBeCloseTo(3.5, 11);
});
