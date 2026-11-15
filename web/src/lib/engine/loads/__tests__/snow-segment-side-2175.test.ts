import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { pressure, regulations, snow } from './snow-roof-plane-fixture';
import { remeshSnowRoof } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases, type SnowCaseLoads } from '../snow-loads';
import { planSnow } from '../load-plan-snow';
import { buildLoadPlan, type LoadModelData, type PlanSink } from '../load-plan';

type Mode = 'projected' | 'width' | 'panels';
const knownWrong = process.env.RUN_KNOWN_WRONG === '2175' ? it : it.skip;

function flat(W: number, angle: number) {
  return transform(mesh([[[0, -W, 3], [16, -W, 3], [16, W, 3], [0, W, 3]]]), angle, 0);
}

function generate(model: LoadModelData, mode: Mode, selected: boolean) {
  const config = { ...snow, roofSlopeDeg: 20, ...(selected ? { roof: [...model.elements.keys()] } : {}) };
  const layout = mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 });
  if (mode === 'panels' && layout) {
    layout.panels = [{ polygon: [...model.nodes.values()].slice(0, 4).map(n => [n.x, n.y]), z: 3, roof: true }];
    layout.widthMembers = []; layout.points = [];
    layout.pieces = [...model.elements.values()].map(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y), wI: 1, wJ: 1 };
    });
  }
  const out = snowLoadCases({ model, layout, snow: config, tributaryWidth: 1 })!;
  expect(out).not.toBeNull();
  expect(out.result.refused).toBeUndefined();
  const sink: PlanSink = { cases: [], distributed: [], nodal: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  expect(planSnow({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, tributaryWidth: 1, snow: { ...config, enabled: true, source: 'site' } }, sink, layout)).toBe(true);
  for (const [k, c] of out.cases.entries()) {
    expect(sink.distributed.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.distributed);
    expect(sink.nodal.filter(d => d.caseIndex === k).map(({ caseIndex, caseType, ...d }) => d)).toEqual(c.nodal);
  }
  return out;
}

function resultant(model: LoadModelData, loads: SnowCaseLoads['distributed'], id: number, angle: number) {
  const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const y = a.y * Math.cos(angle) - a.x * Math.sin(angle);
  const dy = ((b.y - a.y) * Math.cos(angle) - (b.x - a.x) * Math.sin(angle)) / length;
  return loads.filter(d => d.elementId === id).reduce(([force, moment], d) => {
    const lo = d.a ?? 0, hi = d.b ?? length, span = hi - lo;
    const q0 = d.q, q1 = d.qJ ?? q0;
    const f = span * (q0 + q1) / 2;
    return [force! + f, moment! + (y + dy * lo) * f + dy * span * span * (q0 + 2 * q1) / 6];
  }, [0, 0]);
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37]) for (const selected of [false, true]) for (const W of [2, 6 - 1e-12, 6, 6 + 1e-12]) {
  knownWrong(`known wrong result: #2175 split at ridge preserves each half force and moment ${mode} ${angle} ${selected} ${W}`, () => {
    const { model, segments } = remeshSnowRoof(flat(W, angle), new Map([[2, 2], [4, 2]]));
    const out = generate(model, mode, selected), ps = 0.7 * (70 - 20) / (70 - 5);
    const windward = W <= 6 ? 0 : 0.3 * ps, leeward = W <= 6 ? 1.5 * ps : 1.2 * 1.5 * ps;
    expect(out.cases).toHaveLength(3);
    for (const s of segments.filter(s => s.source === 2 || s.source === 4)) {
      const positive = s.source === 2 ? s.from >= 0.5 : s.from < 0.5;
      for (const [k, p] of [ps, positive ? leeward : windward, positive ? windward : leeward].entries()) {
        const loads = out.cases[k]!.distributed;
        expect(pressure(loads, s.id, W / 2)).toBeCloseTo(p, 10);
        const [force, moment] = resultant(model, loads, s.id, angle);
        expect(force).toBeCloseTo(-p * W, 10);
        expect(moment).toBeCloseTo(-p * W * (positive ? W / 2 : -W / 2), 10);
      }
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const angle of [0, 0.37]) for (const selected of [false, true]) {
  it(`unsplit ridge crossing retains main uniform pressure #2176 ${mode} ${angle} ${selected}`, () => {
    const model = flat(2, angle), out = generate(model, mode, selected), ps = 0.7 * 50 / 65;
    for (const id of [2, 4]) for (const k of [1, 2]) {
      for (const x of [0.5, 1.5, 2.5, 3.5]) expect(pressure(out.cases[k]!.distributed, id, x)).toBeCloseTo(1.5 * ps / 2, 10);
      const [force, moment] = resultant(model, out.cases[k]!.distributed, id, angle);
      expect(force).toBeCloseTo(-1.5 * ps * 2, 10);
      expect(moment).toBeCloseTo(0, 10);
    }
  });
}

for (const mode of ['width', 'panels'] as const) {
  knownWrong(`known wrong result: #2175 complete planner split ridge sides ${mode}`, () => {
    const { model, segments } = remeshSnowRoof(flat(2, 0), new Map([[2, 2], [4, 2]]));
    const plan = buildLoadPlan({ regulations: regulations(), model, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, roofSlopeDeg: 20, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const k = plan.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.unbalanced');
    expect(k).toBeGreaterThanOrEqual(0);
    for (const s of segments.filter(s => s.source === 2 || s.source === 4)) {
      const p = (s.source === 2 ? s.from >= 0.5 : s.from < 0.5) ? 1.5 * 0.7 * 50 / 65 : 0;
      expect(pressure(plan.distributed.filter(d => d.caseIndex === k), s.id, 1)).toBeCloseTo(p, 10);
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const offset of [-0.01 - 1e-12, -0.01 + 1e-12, 0, 0.01 - 1e-12, 0.01 + 1e-12]) {
  knownWrong(`known wrong result: #2175 segment midpoint side boundary ${mode} ${offset}`, () => {
    const model = flat(2, 0);
    model.nodes.set(5, { id: 5, x: 16, y: offset - 0.1, z: 3 });
    model.nodes.set(6, { id: 6, x: 16, y: offset + 0.1, z: 3 });
    const edge = model.elements.get(2)!;
    model.elements.set(2, { ...edge, nodeJ: 5 });
    model.elements.set(5, { ...edge, id: 5, nodeI: 5, nodeJ: 6 });
    model.elements.set(6, { ...edge, id: 6, nodeI: 6 });
    const out = generate(model, mode, false), leeward = 1.5 * 0.7 * 50 / 65;
    const p = Math.abs(offset) < 0.01 ? leeward / 2 : offset > 0 ? leeward : 0;
    expect(pressure(out.cases[1]!.distributed, 5, 0.1)).toBeCloseTo(p, 10);
  });
}
