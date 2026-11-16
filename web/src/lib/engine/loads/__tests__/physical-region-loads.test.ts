import { expect, it } from 'vitest';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { floorLoad } from '../floor-loads';
import { buildLoadPlan, levelsWithPlanArea } from '../load-plan';
import { roofLiveLoad } from '../../../codes/cirsoc101/roof-live';
import { regulations } from './snow-roof-plane-fixture';
import { assertRegionInvariant, expectResultant, loadResultant, floorResultant, rectangle, regionModel, regionVariant, type Resultant } from './physical-region-invariance';

const panel = rectangle();
const small = rectangle(0, 0, 4, 2);
const coverage = [
  ['zero', []],
  ['partial', [rectangle(0, 0, 1.76, 2)]],
  ['full', [small]],
  ['nested', [rectangle(0, 0, 2, 2), rectangle(0.5, 0.5, 1.5, 1.5)]],
  ['disjoint', [rectangle(0, 0, 1, 2), rectangle(3, 0, 4, 2)]],
  ['overlapping', [rectangle(0, 0, 2.5, 2), rectangle(1.5, 0, 4, 2)]],
] as const;

for (const [label, shells] of coverage) for (const symbol of ['D', 'L', 'Lr'] as const) for (const slab of ['twoWay', 'oneWay'] as const) {
  it(`${symbol} ${label} shell coverage conserves the physical region through ${slab}`, () => {
    const model = regionModel([small], shells.map(r => r.map(p => [...p])));
    const q = symbol === 'Lr' ? roofLiveLoad({ weight: 'heavy', atM2: 0, slopePercent: 0 }).lr : 1;
    assertRegionInvariant(model, m => {
      const layout = gravityLayout(m, { mode: 'panels', slab, spanAxis: 'x', tributaryWidth: 1, loadEveryPanel: true });
      const out = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 1, liveOf: () => 1 },
        ...(symbol === 'Lr' ? { roof: { dead: 1, use: 'maintenance', weight: 'heavy', slopePercent: 0 } as const } : {}) });
      expect([...layout.areaOf.values(), ...layout.roofAreaOf.values()].reduce((s, a) => s + a, 0) + layout.shellQuads.reduce((s, q) => s + q.area, 0)).toBeCloseTo(8, 8);
      return loadResultant(m, { distributed: out.distributed.filter(d => d.caseType === symbol), nodal: out.nodal.filter(n => n.caseType === symbol), surface: out.surface.filter(s => s.caseType === symbol) });
    }, [8 * q, 16 * q, 8 * q]);
  });
}

for (const width of [0, 0.001, 0.049, 0.051, 0.199, 0.201, 4.76, 9.799, 9.801, 9.949, 9.951, 9.999, 10]) {
  it(`no coverage allowance or percentage threshold at shell width ${width}`, () => {
    const m = regionModel([panel], width ? [rectangle(0, 0, width, 6)] : []);
    assertRegionInvariant(m, model => {
      const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
      const out = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } });
      return loadResultant(model, out);
    }, [60, 300, 180]);
  });
}

const zones: Array<[string, number[][], number[][][], Resultant]> = [
  ['edge', rectangle(0, 0, 1, 6), [], [6, 3, 18]],
  ['corner', rectangle(0, 0, 1, 1), [], [1, 0.5, 0.5]],
  ['outside', rectangle(-2, -2, -1, -1), [], [0, 0, 0]],
  ['full', panel, [], [60, 300, 180]],
  ['holes', panel, [rectangle(1, 1, 3, 3), rectangle(2, 1, 4, 3), rectangle(1.5, 1.5, 2.5, 2.5)], [54, 285, 168]],
  ['reentrant', [[0, 0], [5, 0], [5, 2], [2, 2], [2, 6], [0, 6]], [], [18, 33, 42]],
];
for (const [name, outer, holes, expected] of zones) for (const distribution of ['twoWay', 'oneWay'] as const) for (const q of [1, -1]) {
  it(`floor ${name} zone preserves force and moments, ${distribution}, q=${q}`, () => {
    assertRegionInvariant(regionModel([panel]), (m, point) => {
      const beams = [...m.elements.values()].map(e => ({ ...e, type: 'frame' as const }));
      const out = floorLoad({ nodes: m.nodes, beams, q, distribution, spanAxis: 'x', zone: { outer: outer.map(point), holes: holes.map(h => h.map(point)) } });
      expect(out.skipped).toEqual({ trusses: 0, notHorizontal: 0, otherLevel: 0, open: 0, crossings: 0, zoneAcrossSpan: 0, unresolved: 0 });
      return floorResultant(m, out);
    }, expected.map(v => v * q) as Resultant);
  });
}

for (const distribution of ['twoWay', 'oneWay'] as const) for (const perPlanArea of [false, true]) for (const leftHand of [false, true]) {
  it(`inclined floor conserves vertical moments, ${distribution}, projected=${perPlanArea}, leftHand=${leftHand}`, () => {
    const sloped = panel.map(([x, y]) => [x!, y!, 3 + x! / 5]);
    const zone = rectangle(0, 0, 1, 6);
    const areaScale = perPlanArea ? 1 : Math.hypot(1, 1 / 5);
    assertRegionInvariant(regionModel([sloped]), (m, point) => {
      const out = floorLoad({ nodes: m.nodes, beams: [...m.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q: 1, distribution, spanAxis: 'x', perPlanArea, leftHand, zone: { outer: zone.map(point) } });
      return floorResultant(m, out, leftHand);
    }, [6 * areaScale, 3 * areaScale, 18 * areaScale]);
  });
}

for (const shape of ['concave', 'disjoint', 'nested'] as const) for (const distribution of ['twoWay', 'oneWay'] as const) {
  it(`${shape} panels and shells share physical area and moments, ${distribution}`, () => {
    const rings = shape === 'concave' ? [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 6], [0, 6]]]
      : shape === 'disjoint' ? [rectangle(0, 0, 4, 2), rectangle(10, 0, 14, 2)] : [panel, rectangle(1, 1, 3, 3)];
    const expected: Resultant = shape === 'concave' ? [28, 108, 52] : shape === 'disjoint' ? [16, 112, 16] : [60, 300, 180];
    assertRegionInvariant(regionModel(rings, [rectangle(0, 0, 1.76, 2)]), m => {
      const layout = gravityLayout(m, { mode: 'panels', slab: distribution, spanAxis: 'x', tributaryWidth: 1, loadEveryPanel: true });
      return loadResultant(m, planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
    }, expected);
  });
}

for (const mode of ['width', 'panels'] as const) for (const [label, shells] of coverage) {
  it(`complete ${mode} planner uses physical area and seismic weight with ${label} shells`, () => {
    const m = regionModel([small], shells.map(r => r.map(p => [...p])));
    const plan = (model: typeof m) => buildLoadPlan({ regulations: regulations(), model, dead: [{ labelKey: 'test', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 1, applyLiveReduction: false,
      reductionElementKind: 'interiorBeam', floorsSupported: 1, generateCombinations: false, gravity: { mode, loadEveryPanel: true } });
    const base = plan(m);
    expect(base.outcome).toBe('READY');
    expect(base.levels[0]!.planAreaM2).toBeCloseTo(8, 8);
    expect(base.levels[0]!.superimposedKN).toBeCloseTo(8, 8);
    for (const variant of ['rotate', 'mirror', 'remesh', 'ids'] as const) {
      const changed = regionVariant(m, variant), p = plan(changed.model);
      expect(p.outcome).toBe('READY');
      for (const key of ['planAreaM2', 'superimposedKN', 'liveTotalKN', 'weightKN'] as const) expect(p.levels[0]![key]).toBeCloseTo(base.levels[0]![key], 8);
      if (mode === 'panels') expectResultant(changed.back(loadResultant(changed.model, { distributed: p.distributed.filter(d => d.caseType === 'D'), nodal: p.nodal.filter(d => d.caseType === 'D'), surface: p.surface.filter(d => d.caseType === 'D') })), [8, 16, 8]);
    }
  });
}

it('dummy levels and isolated nodes cannot create seismic loaded area', () => {
  const model = regionModel([panel]);
  model.nodes.set(20, { id: 20, x: -100, y: 100, z: 3 });
  for (let i = 0; i < 4; i++) model.nodes.set(30 + i, { id: 30 + i, x: i % 2 * 10, y: Math.floor(i / 2) * 6, z: 1.5 });
  expect(levelsWithPlanArea(model).map(l => l.planAreaM2)).toEqual([0, 60]);
});

for (const width of [0.49e-9, 0.51e-9, 0.999e-6, 1.001e-6]) for (const distribution of ['twoWay', 'oneWay'] as const) {
  it(`small physical zones survive line rounding, width=${width}, ${distribution}`, () => {
    const m = regionModel([panel]);
    const x0 = 9, x1 = x0 + width, q = 1e6;
    const zone = rectangle(x0, 0, x1, 6);
    const out = floorLoad({ nodes: m.nodes, beams: [...m.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q, distribution, spanAxis: 'x', zone: { outer: zone.map(p => [p[0]!, p[1]!, 3]) } });
    const f = 6 * (x1 - x0) * q;
    expectResultant(floorResultant(m, out), [f, f * (x0 + x1) / 2, f * 3]);
  });
}

it('a narrow physical zone retains its area and moments at large global coordinates', () => {
  const x0 = 500000, y0 = 6000000, width = 1e-7, q = 1e4;
  const m = regionModel([rectangle(x0, y0, x0 + 10, y0 + 6)]);
  const zone = rectangle(x0 + 9, y0, x0 + 9 + width, y0 + 6);
  const out = floorLoad({ nodes: m.nodes, beams: [...m.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q, distribution: 'twoWay', zone: { outer: zone.map(p => [p[0]!, p[1]!, 3]) } });
  const f = 6 * ((x0 + 9 + width) - (x0 + 9)) * q;
  expectResultant(floorResultant(m, out), [f, f * (x0 + 9 + width / 2), f * (y0 + 3)]);
});

for (const slab of ['twoWay', 'oneWay'] as const) it(`an uncovered roof fringe keeps physical force and moments, ${slab}`, () => {
  const m = regionModel([rectangle(0, 0, 6, 4), rectangle(0, 0, 6, 3, 4)]);
  const first = m.nodes.size + 1;
  m.nodes.set(first, { id: first, x: 0, y: 4, z: 4 }); m.nodes.set(first + 1, { id: first + 1, x: 6, y: 4, z: 4 });
  const id = m.elements.size + 1; m.elements.set(id, { id, nodeI: first, nodeJ: first + 1, type: 'truss', sectionId: 1, materialId: 1 });
  assertRegionInvariant(m, model => {
    const layout = gravityLayout(model, { mode: 'panels', slab, spanAxis: 'x', tributaryWidth: 3 });
    return loadResultant(model, planAreaLoads({ layout, tributaryWidth: 3, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
  }, [24, 72, 48]);
});

for (const symbol of ['D', 'L', 'Lr'] as const) for (const nested of [true, false]) it(`sloped shell ownership follows physical planes, ${symbol}, nested=${nested}`, () => {
  const m = regionModel([], [rectangle(0, 0, 4, 2), nested ? rectangle(1, 0.5, 2, 1.5) : rectangle(0, 0, 4, 2, 4)]);
  for (const n of m.nodes.values()) n.z = (n.z ?? 3) + n.x / 5;
  const q = symbol === 'Lr' ? roofLiveLoad({ weight: 'heavy', atM2: 0, slopePercent: 0 }).lr : 1;
  const scale = (symbol === 'Lr' || nested ? 1 : 2) * (symbol === 'D' ? Math.hypot(1, 1 / 5) : q);
  assertRegionInvariant(m, model => {
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 1, liveOf: () => 1 },
      ...(symbol === 'Lr' ? { roof: { dead: 1, use: 'maintenance', weight: 'heavy', slopePercent: 0 } as const } : {}) });
    return loadResultant(model, { distributed: out.distributed.filter(d => d.caseType === symbol), nodal: out.nodal.filter(d => d.caseType === symbol), surface: out.surface.filter(d => d.caseType === symbol) });
  }, [8 * scale, 16 * scale, 8 * scale]);
});

for (const symbol of ['D', 'L'] as const) it(`parallel roof surfaces at different heights retain both physical regions, ${symbol}`, () => {
  const m = regionModel([], [rectangle(0, 0, 4, 2), rectangle(3, 0, 7, 2)]);
  for (const [id, shell] of m.quads) for (const node of shell.nodes) {
    const n = m.nodes.get(node)!; n.z = (id === 1 ? 3 : 2.4) + n.x / 5;
  }
  const scale = symbol === 'D' ? Math.hypot(1, 1 / 5) : 1;
  assertRegionInvariant(m, model => {
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const out = planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 1, liveOf: () => 1 } });
    return loadResultant(model, { distributed: out.distributed.filter(d => d.caseType === symbol), nodal: out.nodal.filter(d => d.caseType === symbol), surface: out.surface.filter(d => d.caseType === symbol) });
  }, [16 * scale, 56 * scale, 16 * scale]);
});
