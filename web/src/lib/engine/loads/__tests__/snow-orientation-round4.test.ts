import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { ridgeRoofs } from './snow-surface-round3-fixture';
import { snow, pressure, regulations } from './snow-roof-plane-fixture';
import { snowLoadCases } from '../snow-loads';
import { roofSurfaceModel } from '../snow-roof-surfaces';
import { gravityLayout } from '../plan-gravity';
import { buildLoadPlan } from '../load-plan';
import { roofSnow } from '../../../codes/cirsoc104/snow';

const knownWrong = it.skip;

function continuousRoofs() {
  const rings: number[][][] = [];
  for (const perpendicular of [false, true]) for (const x of [0, 2, 4]) for (const side of [0, 1]) {
    const point = (a: number, b: number, z: number) => perpendicular ? [20 + b, 20 + a, z] : [a, b, z];
    const y0 = side * 4, y1 = y0 + 4, z0 = side ? 5 : 3, z1 = side ? 3 : 5;
    rings.push([point(x, y0, z0), point(x + 2, y0, z0), point(x + 2, y1, z1), point(x, y1, z1)]);
  }
  return mesh(rings);
}

for (const mode of ['width', 'panels'] as const) for (const boundary of ['actual', 'below', 'at', 'above'] as const) {
  knownWrong(`known wrong result: #2095 round4 partial exemptions follow each roof and tributary ${mode} ${boundary}`, () => {
    const model = continuousRoofs(), sf = roofSurfaceModel(model);
    const limit = 21 / sf.planes[0]!.W + 0.5;
    const roofSlopeDeg = boundary === 'actual' ? undefined : limit + (boundary === 'below' ? -0.001 : boundary === 'above' ? 0.001 : 0);
    const out = snowLoadCases({ model, snow: { ...snow, partial: true, roofSlopeDeg }, layout: gravityLayout(model, { mode, tributaryWidth: 1 }), tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    for (const perpendicular of [false, true]) {
      const members = [...model.elements.values()].filter(e => {
        const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
        return a.z === 3 && b.z === 3 && (a.x >= 20) === perpendicular;
      });
      expect(members).toHaveLength(6);
      const along = perpendicular ? 'Y' : 'X', across = perpendicular ? 'X' : 'Y';
      for (const axis of [along, across]) {
        const patterns = out.cases.filter(c => c.pattern && c.nameParams.axis === axis);
        expect(patterns.length).toBeGreaterThan(0);
        const ratios = members.flatMap(e => patterns.map(c => pressure(c.distributed, e.id, 1) / pressure(out.cases[0]!.distributed, e.id, 1)));
        if (axis === across && (boundary === 'actual' || boundary === 'above')) {
          for (const ratio of ratios) expect(ratio).toBeCloseTo(1, 9);
        } else {
          expect(Math.min(...ratios)).toBeCloseTo(0.5, 9);
          expect(Math.max(...ratios)).toBeCloseTo(1, 9);
        }
      }
    }
  });
}

for (const mode of ['projected', 'width', 'panels'] as const) for (const selected of [false, true]) {
  knownWrong(`known wrong result: #2095 round4 crosswind facets stay balanced and real ridge shares average ${mode} ${selected}`, () => {
    const model = ridgeRoofs('perpendicular'), sf = roofSurfaceModel(model);
    const horizontal = [...model.elements.values()].filter(e => model.nodes.get(e.nodeI)!.z === model.nodes.get(e.nodeJ)!.z);
    const roof = selected ? horizontal.filter(e => model.nodes.get(e.nodeI)!.x >= 20).map(e => e.id) : undefined;
    const out = snowLoadCases({ model, snow: { ...snow, roof }, layout: mode === 'projected' ? undefined : gravityLayout(model, { mode, tributaryWidth: 1 }), tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    const cases = out.cases.filter(c => c.nameKey === 'snow.case.unbalanced');
    expect(cases).toHaveLength(4);
    for (const c of cases) for (const e of horizontal.filter(e => !roof || roof.includes(e.id))) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const dir = c.nameParams.dir as string, axis = dir.endsWith('X') ? 0 : 1, sense = dir.startsWith('+') ? 1 : -1;
      const planes = sf.memberPlanes(e.id);
      expect(planes).toHaveLength(a.z === 5 ? 2 : 1);
      const local = planes.map(p => {
        const r = roofSnow({ ...snow, roof: { kind: 'gable', slippery: true, slopeDeg: p.slope, W: p.W } });
        const side = -p.gradient[axis]! * sense;
        return { balanced: r.ps, expected: side === 0 ? r.ps : side > 0 ? r.unbalanced!.leeward : r.unbalanced!.windward };
      });
      const station = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const balanced = pressure(out.cases[0]!.distributed, e.id, station);
      expect(balanced).toBeGreaterThan(0);
      expect(pressure(c.distributed, e.id, station) / balanced).toBeCloseTo(local.reduce((s, r) => s + r.expected, 0) / local.reduce((s, r) => s + r.balanced, 0), 9);
    }
  });
}

for (const mode of ['width', 'panels'] as const) {
  knownWrong(`known wrong result: #2095 round4 load planner keeps perpendicular crosswind roof balanced ${mode}`, () => {
    const model = ridgeRoofs('perpendicular');
    const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
    expect(plan.outcome).toBe('READY');
    const balanced = plan.cases.findIndex(c => c.type === 'S' && c.nameKey === 'snow.case.balanced');
    const crosswind = plan.cases.findIndex(c => c.type === 'S' && c.nameParams?.dir === '+X');
    expect(crosswind).toBeGreaterThan(balanced);
    const eave = [...model.elements.values()].find(e => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return a.x < 20 && a.z === 3 && b.z === 3;
    })!;
    expect(pressure(plan.distributed.filter(d => d.caseIndex === balanced), eave.id, 3)).toBeGreaterThan(0);
    expect(pressure(plan.distributed.filter(d => d.caseIndex === crosswind), eave.id, 3)).toBeCloseTo(pressure(plan.distributed.filter(d => d.caseIndex === balanced), eave.id, 3), 9);
  });
}

for (const angle of [0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const mode of ['width', 'panels'] as const) {
  it(`round4 partial and unbalanced complete loads survive rotation ${mode} ${angle} ${mirror}`, () => {
    const model = continuousRoofs(), moved = transform(continuousRoofs(), angle, 1, mirror);
    const layout = gravityLayout(model, { mode, tributaryWidth: 1 }), movedLayout = structuredClone(layout);
    for (const p of movedLayout.panels) {
      p.z += 11;
      p.polygon = p.polygon.map(([x, y]) => [mirror * x * Math.cos(angle) - y * Math.sin(angle) + 137, mirror * x * Math.sin(angle) + y * Math.cos(angle) - 91]);
    }
    const a = snowLoadCases({ model, snow: { ...snow, partial: true }, layout, tributaryWidth: 1 })!;
    const b = snowLoadCases({ model: moved, snow: { ...snow, partial: true }, layout: movedLayout, tributaryWidth: 1 })!;
    expect(a.result.refused).toBeUndefined();
    expect(b.result.refused).toBeUndefined();
    expect(b.cases).toHaveLength(a.cases.length);
    for (const [i, c] of a.cases.entries()) {
      expect(b.cases[i]!.distributed).toHaveLength(c.distributed.length);
      for (const [j, d] of c.distributed.entries()) {
        const actual = b.cases[i]!.distributed[j]!;
        expect(actual.elementId).toBe(d.elementId);
        for (const k of ['q', 'qJ', 'a', 'b'] as const) expect(actual[k] ?? 0).toBeCloseTo(d[k] ?? 0, 9);
      }
    }
  });
}

knownWrong('known wrong result: #2095 round4 load planner retains partial cases along both ridges', () => {
  const model = continuousRoofs();
  const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, partial: true, enabled: true, source: 'site' } });
  expect(plan.outcome).toBe('READY');
  for (const axis of ['X', 'Y']) expect(plan.cases.filter(c => c.type === 'S' && c.pattern && c.nameParams?.axis === axis).length).toBeGreaterThan(0);
});
