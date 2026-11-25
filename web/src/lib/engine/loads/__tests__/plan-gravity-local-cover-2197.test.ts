import { expect, it } from 'vitest';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData } from '../load-plan';
import { mesh, transform, transformWithDyadicBasis } from './snow-surface-round2-fixture';
import { remeshSnowRoof } from './snow-remesh-invariance';
import { snow, regulations } from './snow-roof-plane-fixture';

const regression = it;
const rotatedCoverage = process.env.RUN_KNOWN_WRONG === '2564' ? it : it.skip;

type Mode = 'panels' | 'width';
function witness(mode: Mode, z = 4, angle = 0, split = 2, reverse = false, offset = 0, rotate = transform) {
  const lower = mode === 'panels' ? [[5, -1, z], [7, -1, z], [7, 1, z], [5, 1, z]] : [[5, 0, z], [7, 0, z]];
  const model = mesh([lower, [[0, offset, 3], [8, offset, 7]]]);
  const targets = new Set([...model.elements.keys()].slice(0, mode === 'panels' ? 4 : 1));
  const rafter = model.elements.size;
  if (reverse) {
    const e = model.elements.get(rafter)!;
    [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
  }
  const refined = remeshSnowRoof(model, new Map([[rafter, split]])).model;
  rotate(refined, angle, 0);
  return { model: refined, targets, area: mode === 'panels' ? 4 : 2 };
}

function checkLoads(model: LoadModelData, targets: Set<number>, mode: Mode, area: number, roof: boolean, checkSnow = false, loadEveryPanel = true) {
  const layout = gravityLayout(model, { mode, tributaryWidth: 1, loadEveryPanel });
  if (mode === 'panels') {
    expect(layout.panels).toHaveLength(1);
    expect(layout.panels[0]!.roof).toBe(roof);
    expect(layout.pieces.filter(p => targets.has(p.elementId)).every(p => p.roof === roof)).toBe(true);
  }
  for (const id of targets) expect(layout.roof.has(id)).toBe(roof);
  const collect = (map: Map<number, number>) => [...targets].reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
  expect(collect(layout.areaOf)).toBeCloseTo(roof ? 0 : area, 12);
  expect(collect(layout.roofAreaOf)).toBeCloseTo(roof ? area : 0, 12);
  const loads = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 2, liveOf: () => 2 }, roof: { dead: 3, use: 'occupancy', weight: 'light', slopePercent: 0, lo: 4, liveOf: () => 4 } });
  const resultant = (kind: string) => loads.distributed.filter(d => targets.has(d.elementId) && d.caseType === kind).reduce((sum, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return sum - (d.q + (d.qJ ?? d.q)) / 2 * ((d.b ?? Math.hypot(b.x - a.x, b.y - a.y)) - (d.a ?? 0));
  }, 0);
  expect(resultant('D')).toBeCloseTo(area * (roof ? 3 : 1), 12);
  expect(resultant('L')).toBeCloseTo(area * (roof ? 4 : 2), 12);
  if (!checkSnow) return;
  const generated = snowLoadCases({ model, layout, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
  expect(generated).not.toBeNull();
  expect(generated.result.refused).toBeUndefined();
  const lowerSnow = generated.cases.flatMap(c => c.distributed).filter(d => targets.has(d.elementId));
  if (roof) expect(lowerSnow.some(d => d.q < 0 || (d.qJ ?? 0) < 0)).toBe(true);
  else expect(lowerSnow).toHaveLength(0);
}

for (const mode of ['panels', 'width'] as const) for (const angle of [0, 0.37]) for (const reverse of [false, true]) {
  const knownWrong = mode === 'width' && angle === 0.37;
  const check = knownWrong ? rotatedCoverage : regression;
  check(`${knownWrong ? 'known wrong result: #2564 ' : ''}#2197 local upper rafter covers a separate lower ${mode} ${angle} ${reverse}`, () => {
    for (const split of [1, 2, 3, 8]) {
      const { model, targets, area } = witness(mode, 4, angle, split, reverse);
      checkLoads(model, targets, mode, area, false, true);
    }
  });
}

for (const reverse of [false, true]) {
  it(`#2197 local upper rafter covers a separate lower width with a dyadic rotation ${reverse}`, () => {
    for (const split of [1, 2, 3, 8]) {
      const rotate: typeof transform = (refined, angle) => {
        for (const node of refined.nodes.values()) {
          node.x = Math.round(node.x * 16) / 16;
          if (node.z !== 4) node.z = 3 + node.x / 2;
        }
        return transformWithDyadicBasis(refined, angle);
      };
      const { model, targets, area } = witness('width', 4, 0.37, split, reverse, 0, rotate);
      checkLoads(model, targets, 'width', area, false, true);
    }
  });
}

for (const mode of ['panels', 'width'] as const) for (const z of [5.949, 5.951]) {
  regression(`#2197 local vertical coverage boundary ${mode} ${z}`, () => {
    const { model, targets, area } = witness(mode, z);
    checkLoads(model, targets, mode, area, 6 <= z + 0.05);
  });
}

for (const mode of ['panels', 'width'] as const) for (const offset of [-0.049, -Number.EPSILON, 0, Number.EPSILON, 0.049, 0.051]) {
  regression(`#2197 local plan coverage boundary ${mode} ${offset}`, () => {
    const { model, targets, area } = witness(mode, 4, 0, 2, false, offset);
    checkLoads(model, targets, mode, area, offset !== 0);
  });
}

for (const mode of ['panels', 'width'] as const) regression(`#2197 full planner excludes snow on the covered lower ${mode}`, () => {
  const { model, targets, area } = witness(mode);
  const out = buildLoadPlan({ regulations: regulations(), model, dead: [{ labelKey: 'test', q: 1 }], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, gravity: { mode, loadEveryPanel: true }, tributaryWidth: 1, roof: { dead: 3, use: 'occupancy', occupancyKey: 'vivienda', slopeDeg: 0 }, snow: { ...snow, roofKind: 'mono', enabled: true, source: 'site' } });
  expect(out.outcome).toBe('BLOCKED');
  expect(out.blockedKeys.map(m => m.key)).toEqual(['loadPlan.blocked.concentratedRoof']);
  const snowCases = new Set(out.cases.flatMap((c, i) => c.type === 'S' ? [i] : []));
  expect(snowCases.size).toBeGreaterThan(0);
  expect(out.distributed.filter(d => d.caseIndex !== undefined && snowCases.has(d.caseIndex) && targets.has(d.elementId))).toHaveLength(0);
  const dead = out.distributed.filter(d => targets.has(d.elementId) && d.caseType === 'D');
  expect(dead.length).toBeGreaterThan(0);
  const force = dead.reduce((sum, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return sum - (d.q + (d.qJ ?? d.q)) / 2 * ((d.b ?? Math.hypot(b.x - a.x, b.y - a.y)) - (d.a ?? 0));
  }, 0);
  expect(force).toBeCloseTo(area, 12);
});

it('#2197 an uncovered lower panel retains its roof and snow loads', () => {
  const { model, targets, area } = witness('panels');
  for (const id of [...model.elements.keys()]) if (!targets.has(id)) model.elements.delete(id);
  checkLoads(model, targets, 'panels', area, true, true);
});

regression('#2197 exact connected rafter witness retains main coverage', () => {
  const { model, targets, area } = witness('panels');
  checkLoads(model, targets, 'panels', area, false, true);
});

for (const z of [3, 3.0009, 3.0011]) regression(`#2197 an external eave at the lower panel level still covers it ${z}`, () => {
  const { model, targets, area } = witness('panels', z);
  checkLoads(model, targets, 'panels', area, false);
});

for (const split of [1, 2, 8]) it(`#2197 a panel's own roof retains its eave snow ${split}`, () => {
  const model = mesh([[[0, -1, 3], [8, -1, 3], [8, 1, 3], [0, 1, 3]], [[0, 0, 3], [8, 0, 7]]]);
  const refined = remeshSnowRoof(model, new Map([[5, split]])).model;
  const layout = gravityLayout(refined, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.panels).toHaveLength(1);
  expect(layout.panels[0]!.roof).toBe(true);
  expect(layout.pieces.every(p => p.roof)).toBe(true);
});

for (const offset of [0.0009, 0.0011]) for (const axis of ['plan', 'height'] as const) regression(`#2197 own roof association boundary ${axis} ${offset}`, () => {
  const model = mesh([[[0, -1, 3], [8, -1, 3], [8, 1, 3], [0, 1, 3]], [[axis === 'plan' ? -offset : 0, 0, axis === 'height' ? 3 + offset : 3], [8, 0, 7]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.panels).toHaveLength(1);
  expect(layout.panels[0]!.roof).toBe(offset < 0.001);
});

regression('#2197 a run crossing outside a concave footprint is separate cover', () => {
  const model = mesh([[[0, -1, 3], [8, -1, 3], [8, 1, 3], [3, 1, 3], [3, -0.5, 3], [2, -0.5, 3], [2, 1, 3], [0, 1, 3]], [[0, 0.125, 3], [8, 0.125, 7]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.panels).toHaveLength(1);
  expect(layout.panels[0]!.roof).toBe(false);
});

for (const covered of [false, true]) it(`#2197 shell coverage uses the same local rafter height ${covered}`, () => {
  const { model, targets } = witness('panels');
  for (const id of [...model.elements.keys()]) if (targets.has(id) || !covered) model.elements.delete(id);
  model.quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4] }]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(layout.shellQuads).toHaveLength(1);
  expect(layout.roofQuads.has(1)).toBe(!covered);
  const area = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 2, liveOf: () => 2 }, roof: { dead: 3, use: 'occupancy', weight: 'light', slopePercent: 0, lo: 4, liveOf: () => 4 } });
  expect(area.surface.find(s => s.quadId === 1 && s.caseType === 'D')!.q).toBe(covered ? 1 : 3);
});

for (const mode of ['panels', 'width'] as const) it(`#2197 automatic panel detection retains local coverage ${mode}`, () => {
  const { model, targets, area } = witness(mode);
  checkLoads(model, targets, mode, area, false, true, false);
});
