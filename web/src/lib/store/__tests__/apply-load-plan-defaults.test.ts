import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { applyLoadPlan, loadStateForPlan } from '../apply-load-plan';
import { buildLoadPlan, describePlanDelta, type LoadPlanInput } from '../../engine/loads/load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../codes/roles';
import { defaultCombinations, defaultLoadCases, DEFAULT_CASE_NAME_KEYS } from '../../model/default-loads';
import { t } from '../../i18n';
import es from '../../i18n/locales/es';
import { loadsGeneratedWith } from '../../provenance/model-features';
import { RESULTS_VERSION } from '../../provenance/registry';
import { designData, patchDesignData } from '../design-data';

const nameOf = (key: string, params?: Record<string, string | number>) =>
  (es[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));
const applied = (reg: ProjectRegulations): ProjectRegulations => Object.fromEntries(Object.entries(reg).map(([k, v]) =>
  [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;

function newProjectFrame(): void {
  modelStore.clear();
  const at = new Map<string, number>();
  for (const z of [0, 3]) for (let i = 0; i <= 2; i++) at.set(`${i},${z}`, modelStore.addNode(5 * i, 0, z));
  for (let i = 0; i <= 2; i++) modelStore.addElement(at.get(`${i},0`)!, at.get(`${i},3`)!);
  for (let i = 0; i < 2; i++) modelStore.addElement(at.get(`${i},3`)!, at.get(`${i + 1},3`)!);
}
const planInput = (): LoadPlanInput => ({
  regulations: applied(defaultRegulations()),
  model: {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never, sections: modelStore.model.sections as never,
    materials: modelStore.model.materials as never, loadCases: modelStore.model.loadCases, quads: modelStore.model.quads as never,
  },
  dead: [{ labelKey: 'a', q: 1.5 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
});
const defaultComboNames = defaultCombinations().map((c) => c.name);

describe('the example cases and combinations of a new project, when the generator writes its own', () => {
  beforeEach(newProjectFrame);

  it('a new project starts with them', () => {
    expect(modelStore.model.loadCases.map((c) => c.name)).toEqual(defaultLoadCases((type) => t(DEFAULT_CASE_NAME_KEYS[type])).map((c) => c.name));
    expect(modelStore.model.combinations.map((c) => c.name)).toEqual(defaultComboNames);
  });

  it('go: no "1.4D" beside "1.4 D", no empty Wind or Earthquake, and the preview says so with the counts apply leaves', () => {
    const p = buildLoadPlan(planInput());
    const delta = describePlanDelta(p, loadStateForPlan(p, nameOf), { replaceExisting: true, bothSenses: { E: true } });
    expect(delta.warnings.map((w) => w.key)).toContain('loadPlan.warning.defaultsRemoved');
    expect(delta.removedCaseTypes).not.toContain('W');
    expect(delta.removedCaseTypes).not.toContain('E');
    applyLoadPlan(p, { clearExisting: true, bothSenses: true, nameOf });
    const names = modelStore.model.combinations.map((c) => c.name);
    for (const n of defaultComboNames) expect(names).not.toContain(n);
    expect(modelStore.model.loadCases.some((c) => c.id === 3 || c.id === 4)).toBe(false);
    expect(modelStore.model.combinations.length).toBe(delta.after.combinations);
    expect(modelStore.model.combinations.every((c) => c.factors.every((f) => modelStore.model.loadCases.some((lc) => lc.id === f.caseId)))).toBe(true);
  });

  it('an English-named default from a project saved before is just as untouched', () => {
    modelStore.updateLoadCase(3, 'Wind');
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.model.loadCases.some((c) => c.id === 3)).toBe(false);
  });

  it('records the results version the loads were generated with', () => {
    expect(loadsGeneratedWith(modelStore.snapshot() as never)).toBe(Infinity);
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    expect(loadsGeneratedWith(modelStore.snapshot() as never)).toBe(RESULTS_VERSION);
  });

  it('keeps the older version while loads generated before stay beside the new ones', () => {
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    patchDesignData({ loadBasis: { ...designData().loadBasis!, resultsVersion: RESULTS_VERSION - 1 } });
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: false, bothSenses: true, nameOf });
    expect(loadsGeneratedWith(modelStore.snapshot() as never)).toBe(RESULTS_VERSION - 1);
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    expect(loadsGeneratedWith(modelStore.snapshot() as never)).toBe(RESULTS_VERSION);
  });

  it('the dead-load case the plan writes into stays, with the generated loads in it', () => {
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    const dead = modelStore.model.loadCases.filter((c) => c.type === 'D');
    expect(dead.length).toBe(1);
    expect(modelStore.loads.some((l) => (l.data.caseId ?? 1) === dead[0]!.id)).toBe(true);
  });

  it('what the user touched stays: a renamed case, a case with a load, an edited combination', () => {
    modelStore.updateLoadCase(3, 'Viento propio');
    const nodeId = [...modelStore.nodes.keys()][3]!;
    modelStore.addNodalLoad3D(nodeId, 0, 0, -5, 0, 0, 0, 4);
    modelStore.updateCombination(1, { name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.25 }, { caseId: 2, factor: 1.6 }] });
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.model.loadCases.some((c) => c.id === 3 && c.name === 'Viento propio')).toBe(true);
    expect(modelStore.model.loadCases.some((c) => c.id === 4)).toBe(true);
    expect(modelStore.model.combinations.some((c) => c.id === 1)).toBe(true);
    expect(modelStore.model.combinations.some((c) => c.name === '1.4D')).toBe(false);
  });

  it('nothing goes when the plan writes no combinations', () => {
    applyLoadPlan(buildLoadPlan({ ...planInput(), generateCombinations: false }), { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.model.combinations.map((c) => c.name)).toEqual(expect.arrayContaining(defaultComboNames));
  });
});

it('#2220 applying a signed wind profile preserves both horizontal member-load endpoints', () => {
  newProjectFrame();
  const input = planInput();
  const plan = buildLoadPlan({ ...input, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: false, y: true }, senses: ['+y'], caseSet: 'case1', profile: [[0, -1.5], [3, 1.5]] } });
  expect(plan.outcome).toBe('READY');
  const wind = plan.distributed.filter(p => p.caseType === 'W');
  expect(wind).toHaveLength(3);
  expect(plan.nodal.filter(p => p.caseType === 'W')).toEqual([]);
  applyLoadPlan(plan, { clearExisting: true, bothSenses: false, nameOf });
  const windCase = modelStore.model.loadCases.find(c => c.type === 'W')!;
  const loads = modelStore.loads.filter(l => l.type === 'distributed3d' && l.data.caseId === windCase.id);
  expect(loads).toHaveLength(3);
  for (const p of wind) {
    const load = loads.find(l => l.type === 'distributed3d' && l.data.elementId === p.elementId)!;
    expect(load.type).toBe('distributed3d');
    if (load.type !== 'distributed3d') throw new Error('Expected a member pressure load');
    const member = input.model.elements.get(p.elementId)!, n = input.model.nodes.get(member.nodeI)!;
    const width = n.x === 5 ? 5 : 2.5;
    expect(load.data.qYI).toBeCloseTo(-1.5 * width, 10);
    expect(load.data.qYJ).toBeCloseTo(1.5 * width, 10);
    expect(load.data.frame).toBe('global');
  }
});

it('#2499 restoring then applying generates only the upper shell pressure', () => {
  modelStore.clear();
  const corners: Array<[number, number]> = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const addLayer = (z: number) => corners.map(([x, y]) => modelStore.addNode(x, y, z)) as [number, number, number, number];
  const lower = addLayer(3), upper = addLayer(3.02);
  const materialId = modelStore.model.materials.keys().next().value!;
  modelStore.addQuad(lower, materialId, 0.1);
  const second = modelStore.addQuad(upper, materialId, 0.1);
  lower.forEach((masterNode, i) => modelStore.addConstraint({
    type: 'eccentricConnection', masterNode, slaveNode: upper[i]!, offsetZ: 0.02,
  }));
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const input = planInput();
  const model = { ...input.model, constraints: modelStore.model.constraints };
  const plan = buildLoadPlan({ ...input, model, gravity: { mode: 'panels' }, dead: [{ labelKey: 'a', q: 1 }] });
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf })).toBeUndefined();
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: second, caseType: 'D', q: 1 }]);
  const dead = modelStore.model.loadCases.find(c => c.type === 'D')!;
  expect(modelStore.model.loads.filter(load => load.type === 'surface3d' && load.data.caseId === dead.id))
    .toEqual([expect.objectContaining({ data: expect.objectContaining({ quadId: second, q: 1 }) })]);
});

it('#2512 restored platforms sharing a fixed UZ master each retain their applied dead pressure', () => {
  modelStore.clear();
  const addPlatform = (z: number) => {
    const nodes = [
      modelStore.addNode(0, 0, z), modelStore.addNode(10, 0, z),
      modelStore.addNode(10, 6, z), modelStore.addNode(0, 6, z),
    ] as const;
    const materialId = modelStore.model.materials.keys().next().value!;
    return { nodes, quad: modelStore.addQuad([...nodes], materialId, 0.1) };
  };
  const lower = addPlatform(3), upper = addPlatform(6);
  const masterNode = modelStore.addNode(-1, -1, 0);
  modelStore.addSupport(masterNode, 'custom3d', undefined, {
    dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  });
  for (const slaveNode of [lower.nodes[0], upper.nodes[0]]) modelStore.addConstraint({
    type: 'equalDOF', masterNode, slaveNode, dofs: [2],
  });
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const input = planInput();
  const model = { ...input.model, constraints: modelStore.model.constraints };
  const plan = buildLoadPlan({ ...input, model, gravity: { mode: 'panels' }, dead: [{ labelKey: 'a', q: 1 }] });
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf })).toBeUndefined();
  const dead = modelStore.model.loadCases.find(c => c.type === 'D')!;
  expect(modelStore.model.loads.filter(load => load.type === 'surface3d' && load.data.caseId === dead.id))
    .toEqual([lower.quad, upper.quad].map(quadId => expect.objectContaining({ data: expect.objectContaining({ quadId, q: 1 }) })));
});
