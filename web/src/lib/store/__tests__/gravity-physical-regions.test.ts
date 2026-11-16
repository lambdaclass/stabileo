import { expect, it } from 'vitest';
import { modelStore, type Load } from '../model.svelte';
import '../index';
import { uiStore } from '../ui.svelte';
import { applyLoadPlan } from '../apply-load-plan';
import { addFloorLoadDef, addLoadZone, syncDefinedLoads } from '../defined-loads';
import { expandFloorLoad, zoneArea, type DefinitionModel } from '../../model/loads/floor-definitions';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { loadResultant, expectResultant } from '../../engine/loads/__tests__/physical-region-invariance';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { distributedGlobalEnds } from '../../engine/member-loads';

function bay(mode: '2d' | '3d' | 'pro') {
  uiStore.analysisMode = mode;
  modelStore.clear();
  const ring = [[0, 0], [10, 0], [10, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  ring.forEach((a, i) => modelStore.addElement(a, ring[(i + 1) % 4]!));
  return ring;
}

function resultant(loads: Load[]) {
  return loadResultant(modelStore.model, {
    distributed: loads.flatMap(l => {
      if (l.type !== 'distributed3d') return [];
      const e = modelStore.elements.get(l.data.elementId)!, a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      const axes = computeLocalAxes3D({ ...a, z: a.z ?? 0 }, { ...b, z: b.z ?? 0 }, undefined, 0, false);
      const global = distributedGlobalEnds(l.data, { ...axes, L: Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) }, uiStore.axisConvention3D === 'leftHand');
      return [{ elementId: e.id, q: global.gI[2], qJ: global.gJ[2], a: global.a, b: global.b }];
    }),
    nodal: loads.flatMap(l => l.type === 'nodal3d' ? [l.data] : []),
    surface: loads.flatMap(l => l.type === 'surface3d' ? [l.data] : []),
  });
}

for (const mode of ['2d', '3d', 'pro'] as const) {
  for (const overlap of [false, true]) it(`applying the gravity plan retains both moments in ${mode}, overlapping shells=${overlap}`, () => {
    bay(mode);
    const ids = [[0, 0], [4.76, 0], [4.76, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    modelStore.addQuad(ids as [number, number, number, number], 1, 0.1);
    if (overlap) {
      const second = [[2, 0], [8, 0], [8, 6], [2, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
      modelStore.addQuad(second as [number, number, number, number], 1, 0.1);
    }
    const p = buildLoadPlan({ regulations: regulations(), model: modelStore.model, dead: [{ labelKey: 'test', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 1,
      applyLiveReduction: false, reductionElementKind: 'interiorBeam', floorsSupported: 1, generateCombinations: false, gravity: { mode: 'panels', loadEveryPanel: true } });
    expect(p.outcome).toBe('READY');
    applyLoadPlan(p, { clearExisting: true, bothSenses: false, nameOf: k => k });
    const d = modelStore.model.loadCases.find(c => c.type === 'D')!.id;
    expectResultant(resultant(modelStore.loads.filter(l => l.data.caseId === d)), [60, 300, 180]);
    expect(modelStore.loads.some(l => l.type === 'nodal3d' && (l.data.mx !== 0 || l.data.my !== 0))).toBe(true);
    if (overlap) expect(modelStore.loads.some(l => l.type === 'surface3d' && l.data.region !== undefined)).toBe(true);
  });
  for (const distribution of ['twoWay', 'oneWay'] as const) for (const handed of ['rightHand', 'leftHand'] as const) {
    it(`floor definition retains zone moments through refresh in ${mode}, ${distribution}, ${handed}`, () => {
      bay(mode);
      uiStore.axisConvention3D = handed;
      const nodes = [[0, 0], [1, 0], [1, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
      const zoneId = addLoadZone('zone', nodes), caseId = modelStore.addLoadCase('L', 'L');
      const defId = addFloorLoadDef('zone load', { q: 1, caseId, target: { by: 'zone', zoneId }, distribution, spanAxis: 'x' });
      const expanded = expandFloorLoad(modelStore.model as unknown as DefinitionModel, defId, { leftHand: handed === 'leftHand' });
      expectResultant(resultant(expanded.loads), [6, 3, 18]);
      expectResultant(resultant(modelStore.loads.filter(l => l.data.caseId === caseId)), [6, 3, 18]);
      syncDefinedLoads();
      expectResultant(resultant(modelStore.loads.filter(l => l.data.caseId === caseId)), [6, 3, 18]);
    });
  }
}

it('zone area subtracts overlapping and nested holes only once', () => {
  const outer = bay('pro');
  const ring = (x0: number, x1: number, y0: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const h1 = addLoadZone('h1', ring(1, 3, 1, 3)), h2 = addLoadZone('h2', ring(2, 4, 1, 3)), h3 = addLoadZone('h3', ring(1.5, 2.5, 1.5, 2.5));
  const id = addLoadZone('outer', outer, [], [h1, h2, h3]);
  expect(zoneArea(modelStore.model as unknown as DefinitionModel, id)).toBe(54);
});

for (const mode of ['2d', '3d', 'pro'] as const) it(`slab floor definition uses the same exact zone geometry in ${mode}`, () => {
  const ring = bay(mode);
  modelStore.addQuad(ring as [number, number, number, number], 1, 0.1);
  const nodes = [[0, 0], [1, 0], [1, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const zoneId = addLoadZone('zone', nodes), caseId = modelStore.addLoadCase('L', 'L');
  addFloorLoadDef('slab zone', { q: 1, caseId, target: { by: 'zone', zoneId }, distribution: 'slab' });
  expectResultant(resultant(modelStore.loads.filter(l => l.data.caseId === caseId)), [6, 3, 18]);
});
