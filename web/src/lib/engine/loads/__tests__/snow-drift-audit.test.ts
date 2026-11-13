import { expect, it } from 'vitest';
import { auditRoof } from './snow-slope-audit-fixture';
import { gravityLayout } from '../plan-gravity';
import { buildLoadPlan } from '../load-plan';
import { planInput } from '../../../codes/__tests__/family-plan-helpers';
import { snowLoadCases } from '../snow-loads';

it.skip('known wrong result: #1929: CIRSOC 104 section 7.1 retains drift at a low step beside a pitched roof', () => {
  const model = auditRoof('gable', 20);
  for (const n of model.nodes.values()) {
    n.y /= 3;
    if ((n.z ?? 0) >= 3) n.z = 3 + ((n.z ?? 0) - 3) / 3;
  }
  let nid = 100, eid = 100;
  const upper = [[-6, 0], [0, 0], [0, 2], [-6, 2]].map(([x, y]) => {
    const id = nid++;
    model.nodes.set(id, { id, x: x!, y: y!, z: 3.45 });
    return id;
  });
  for (let i = 0; i < 4; i++) {
    const id = eid++;
    model.elements.set(id, { id, nodeI: upper[i]!, nodeJ: upper[(i + 1) % 4]!, sectionId: 1, materialId: 1 });
  }
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const snow = { pg: 1, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: true, partial: false };
  const plan = buildLoadPlan(planInput('cirsoc', { model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } }));
  expect(plan.outcome).toBe('READY');
  expect(plan.blockedKeys).toEqual([]);
  const out = snowLoadCases({ model, snow, tributaryWidth: 1, layout })!;
  const gamma = 0.426 * 1 + 2.2;
  const requiredBalanced = 1 * ((70 - 20) / 65);
  const hb = requiredBalanced / gamma;
  const hc = 0.45 - hb;
  const flatHb = 1 / gamma;
  expect(hc / hb).toBeGreaterThan(0.2);
  expect((0.45 - flatHb) / flatHb).toBeLessThan(0.2);
  const hd = 0.381;
  expect(hd).toBeGreaterThan(hc);
  const requiredWidth = Math.min(4 * hd * hd / hc, 8 * hc);
  expect(requiredWidth).toBeGreaterThan(0);
  const requiredPeak = requiredBalanced + Math.min(hd, hc) * gamma;
  expect(requiredPeak).toBeCloseTo(1.1817, 6);
  const pieces = layout.pieces.filter(p => p.panel === 0 && p.wI > 0);
  const pressures = out.cases.map(c => pieces.map(p => {
    const d = c.distributed.find(d => d.elementId === p.elementId && d.a === p.a && d.b === p.b);
    return d ? -d.q / p.wI : 0;
  }));
  console.info(JSON.stringify({ planOutcome: plan.outcome, warnings: plan.unsupportedKeys, requiredBalanced, hb, hc, requiredPeak, generatedBalanced: [Math.min(...pressures[0]!), Math.max(...pressures[0]!)], maximumAcrossCases: Math.max(...pressures.flat()), derivation: out.derivation }));
  expect(out.derivation.map(d => d.key)).toContain('snow.derivation.drift');
});
