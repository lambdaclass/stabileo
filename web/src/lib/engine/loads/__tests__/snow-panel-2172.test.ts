import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { assertSnowRemeshInvariant, remeshSnowRoof, snowDistributedResultant } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData } from '../load-plan';

const regression = it;

function dome(angle: number) {
  const rim = [[0, 0, 3], [8, 0, 3], [8, 8, 3], [0, 8, 3]], crown = [4, 4, 5];
  return transform(mesh(rim.map((p, k) => [p, rim[(k + 1) % rim.length]!, crown])), angle, 0);
}

for (const angle of [0, 0.37, Math.PI / 2]) for (const mode of ['projected', 'width', 'panels'] as const) {
  regression(`#2172 faceted dome physical panels ${mode} ${angle}`, () => {
    const model = dome(angle);
    const expected = 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
    const generate = (m: LoadModelData) => {
      const layout = mode === 'projected' ? undefined : gravityLayout(m, { mode, tributaryWidth: 1, loadEveryPanel: true });
      const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofKind: 'dome' }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      const eave = m.elements.get(1)!, a = m.nodes.get(eave.nodeI)!, b = m.nodes.get(eave.nodeJ)!;
      const station = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 2);
      expect(pressure(out.cases[0]!.distributed.filter(d => d.elementId === 1).map(d => ({ ...d, b: d.b ?? Math.hypot(b.x - a.x, b.y - a.y) })), 1, station)).toBeCloseTo(expected * (mode === 'panels' ? station : 1), 10);
      if (mode === 'panels') expect(layout!.panels.find(p => p.z === 3)!.roof).toBe(true);
      return out;
    };
    const refinedRafter = remeshSnowRoof(model, new Map([[2, 8]])).model;
    for (const witness of [model, refinedRafter]) {
      if (mode === 'panels') expect(gravityLayout(witness, { mode, tributaryWidth: 1, loadEveryPanel: true }).pieces).toHaveLength(8);
      generate(witness);
    }
    for (const id of model.elements.keys()) assertSnowRemeshInvariant(model, new Map([[id, 8]]), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 3])), generate);
    assertSnowRemeshInvariant(model, new Map([...model.elements.keys()].map(id => [id, 2 + id % 4])), generate);
  });
}

for (const angle of [0, 0.37]) regression(`#2172 complete explicit-panel planner retains dome snow ${angle}`, () => {
  const model = remeshSnowRoof(dome(angle), new Map([[2, 8]])).model;
  const out = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode: 'panels', loadEveryPanel: true }, tributaryWidth: 1, snow: { ...snow, roofKind: 'dome', enabled: true, source: 'site' } });
  expect(out.outcome).toBe('READY');
  const index = out.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.balancedShaped');
  const expected = 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
  expect(pressure(out.distributed.filter(d => d.caseIndex === index), 1, 1)).toBeCloseTo(expected, 10);
});

for (const angle of [0, 0.37]) for (const separation of [0.049, 0.051, 3]) {
  it(`#2172 physical upper panel preserves the coverage boundary ${angle} ${separation}`, () => {
    const ring = (z: number) => [[0, 0, z], [8, 0, z], [8, 8, z], [0, 8, z]];
    const model = transform(mesh([ring(3), ring(3 + separation)]), angle, 0);
    const generate = (m: LoadModelData) => {
      const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
      expect(layout.panels).toHaveLength(2);
      const lower = layout.panels.find(p => Math.abs(p.z - 3) < 1e-12)!;
      expect(lower.roof).toBe(!(separation > 0.05));
      expect(layout.panels.find(p => p !== lower)!.roof).toBe(true);
      const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      return out;
    };
    assertSnowRemeshInvariant(model, new Map([[1, 3], [5, 5]]), generate);
  });
}

it('#2172 physical panel widths retain full precision under thirds', () => {
  const model = remeshSnowRoof(dome(0), new Map([[1, 3]])).model;
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  const first = layout.pieces.find(p => p.elementId === 1)!;
  expect(first.wI).toBe(0);
  expect(first.wJ).toBeCloseTo(8 / 3, 12);
});

it('#2172 shaped pressure times triangular width retains physical force and moment', () => {
  const model = dome(0), layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  layout.panels.forEach(p => { p.roof = true; });
  layout.pieces.forEach(p => { p.roof = true; });
  const out = snowLoadCases({ model, layout, snow: { ...snow, roofKind: 'dome' }, tributaryWidth: 1 })!;
  expect(out.result.refused).toBeUndefined();
  const p = 2 * 0.7 * (70 - Math.atan(2 / Math.hypot(4, 4)) * 180 / Math.PI) / 65;
  const [force, moment] = snowDistributedResultant(model, out.cases[3]!.distributed, new Set([1]), [0, 0], [1, 0]);
  expect(force).toBeCloseTo(-8 * p, 10);
  expect(moment).toBeCloseTo(-80 * p / 3, 10);
});

for (const angle of [0, 0.37]) it(`#2172 default overlapping roof tributaries retain their warning ${angle}`, () => {
  const model = dome(angle);
  for (const m of [model, remeshSnowRoof(model, new Map([[2, 8]])).model]) {
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 1 });
    expect(layout.notes.some(n => n.key === 'loadPlan.gravity.headroomUnclearRoof')).toBe(true);
  }
});
