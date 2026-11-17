import { expect, it } from 'vitest';
import { buildLoadPlan } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { defaultRegulations } from '../../../codes/roles';
import { rectangle, regionModel, regionVariant, type RegionModel } from './physical-region-invariance';

const regression = it;

function plan(model: RegionModel) {
  const regulations = defaultRegulations();
  for (const binding of Object.values(regulations)) if (binding.adapterId) Object.assign(binding, { configComplete: true, state: 'applied' });
  return buildLoadPlan({ model, regulations, dead: [{ labelKey: 'test', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false, gravity: { mode: 'panels', loadEveryPanel: true } });
}

function check(model: RegionModel, reason: string) {
  expect(() => gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true })).toThrow(reason);
  const out = plan(model);
  expect(out.outcome).toBe('BLOCKED');
  expect(out.blockedKeys).toContainEqual({ key: 'engine.failedWith', params: { message: expect.stringContaining(reason) } });
  for (const loads of [out.distributed, out.surface, out.nodal, out.combinations]) expect(loads).toEqual([]);
}

for (const variant of ['base', 'rotate', 'mirror', 'remesh', 'ids'] as const) {
  for (const warp of [-0.01, 0, 0.01]) regression(`known wrong result: #2219 nonplanar shell refusal ${warp} ${variant}`, () => {
    const ring = rectangle(0, 0, 6, 4);
    ring[3]![2]! += warp;
    const model = regionVariant(regionModel([], [ring]), variant).model;
    if (warp === 0) expect(plan(model).outcome).toBe('READY');
    else check(model, 'nonplanar shell');
  });

  for (const extent of [[-1, 2], [0.25, 0.75], [2, 3]]) regression(`known wrong result: #2219 member shell coverage refusal ${extent} ${variant}`, () => {
    const model = regionModel([], [rectangle(0, 0, 1, 1)]);
    model.nodes.set(5, { id: 5, x: extent[0]!, y: 0.5, z: 3 });
    model.nodes.set(6, { id: 6, x: extent[1]!, y: 0.5, z: 3 });
    model.elements.set(1, { id: 1, nodeI: 5, nodeJ: 6, sectionId: 1, materialId: 1 });
    const changed = regionVariant(model, variant).model;
    if (extent[0] === -1) check(changed, 'partial member shell coverage');
    else expect(plan(changed).outcome).toBe('READY');
  });
}

for (const slope of [0.49, 0.5, 0.51]) for (const variant of ['base', 'rotate', 'mirror', 'remesh'] as const) regression(`known wrong result: #2219 area-load slope boundary ${slope} ${variant}`, () => {
  const model = regionModel([]);
  model.nodes.set(1, { id: 1, x: 0, y: 0, z: 3 });
  model.nodes.set(2, { id: 2, x: Math.sqrt(1 - slope ** 2) * 2, y: 0, z: 3 + slope * 2 });
  model.elements.set(1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 });
  const changed = regionVariant(model, variant).model;
  if (slope === 0.5) check(changed, 'area-load slope boundary');
  else expect(plan(changed).outcome).toBe('READY');
});

for (const factor of [0.5, 2]) regression(`known wrong result: #2255 first-moment precision budget ${factor}`, () => {
  const length = Math.cbrt(5e-9 / (8 * Number.EPSILON * Math.SQRT2)) * factor;
  const model = regionModel([rectangle(0, 0, length, length)]);
  if (factor < 1) expect(plan(model).outcome).toBe('READY');
  else check(model, 'first-moment precision');
});

it('unused distant nodes do not change the supported carrier geometry', () => {
  const model = regionModel([rectangle(0, 0, 6, 4)]);
  model.nodes.set(100, { id: 100, x: 1e9, y: 1e9, z: 3 });
  expect(plan(model).outcome).toBe('READY');
});

for (const gap of [0.04, 0.06]) for (const variant of ['base', 'rotate', 'mirror', 'remesh'] as const) it(`shell coverage tolerance transitions ${gap} ${variant}`, () => {
  const model = regionModel([], [rectangle(0, 0, 1, 1)]);
  model.nodes.set(5, { id: 5, x: -0.2, y: -gap, z: 3 });
  model.nodes.set(6, { id: 6, x: 1.2, y: -gap, z: 3 });
  model.elements.set(1, { id: 1, nodeI: 5, nodeJ: 6, sectionId: 1, materialId: 1 });
  const changed = regionVariant(model, variant).model;
  if (gap < 0.05) check(changed, 'partial member shell coverage');
  else expect(plan(changed).outcome).toBe('READY');
});

it('shell coverage changes in height also refuse midpoint classification', () => {
  const model = regionModel([], [rectangle(0, 0, 1, 1)]);
  model.nodes.set(5, { id: 5, x: 0.25, y: 0.5, z: 2.9 });
  model.nodes.set(6, { id: 6, x: 0.75, y: 0.5, z: 3.1 });
  model.elements.set(1, { id: 1, nodeI: 5, nodeJ: 6, sectionId: 1, materialId: 1 });
  check(model, 'partial member shell coverage');
});
