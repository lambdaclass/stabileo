import { describe, it, expect, beforeEach, onTestFinished } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../index';
import { applyLoadPlan, loadStateForPlan } from '../apply-load-plan';
import { buildLoadPlan, describePlanDelta, type LoadPlanInput } from '../../engine/loads/load-plan';
import { regulations, snow } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
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

it('#2499 restoring then applying refuses two ambiguous shell pressures', () => {
  modelStore.clear();
  const corners: Array<[number, number]> = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const addLayer = (z: number) => corners.map(([x, y]) => modelStore.addNode(x, y, z)) as [number, number, number, number];
  const lower = addLayer(3), upper = addLayer(3.02);
  const materialId = modelStore.model.materials.keys().next().value!;
  const first = modelStore.addQuad(lower, materialId, 0.1);
  const gravity = { mode: 'panels' } as const;
  const dead = [{ labelKey: 'a', q: 1 }];
  const valid = buildLoadPlan({ ...planInput(), gravity, dead });
  expect(valid.outcome).toBe('READY');
  expect(applyLoadPlan(valid, { clearExisting: true, bothSenses: true, nameOf })).toBeUndefined();
  expect(modelStore.model.loads).toContainEqual(expect.objectContaining({ type: 'surface3d', data: expect.objectContaining({ quadId: first, q: 1 }) }));
  const second = modelStore.addQuad(upper, materialId, 0.1);
  lower.forEach((masterNode, i) => modelStore.addConstraint({
    type: 'eccentricConnection', masterNode, slaveNode: upper[i]!, offsetZ: 0.02,
  }));
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const input = planInput();
  const model = { ...input.model, constraints: modelStore.model.constraints };
  const plan = buildLoadPlan({ ...input, model, gravity, dead });
  const before = modelStore.snapshot();
  expect(before.loads).toContainEqual(expect.objectContaining({
    type: 'surface3d', data: expect.objectContaining({ quadId: first, q: 1 }),
  }));
  const reason = { key: 'loadPlan.gravity.overlappingShells', params: { first, second } };
  expect(plan).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], surface: [], distributed: [], nodal: [] });
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf })).toEqual(reason);
  expect(modelStore.snapshot()).toEqual(before);
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

it('#2512 restored platforms with a second tie keep both pressures at a fixed master', () => {
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
  for (const slaveNode of [...lower.nodes.slice(0, 3), ...upper.nodes.slice(0, 3)]) modelStore.addConstraint({
    type: 'equalDOF', masterNode, slaveNode, dofs: [2],
  });
  modelStore.addConstraint({ type: 'equalDOF', masterNode: lower.nodes[3], slaveNode: upper.nodes[3], dofs: [2] });
  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const input = planInput();
  const model = { ...input.model, constraints: modelStore.model.constraints, supports: modelStore.supports };
  expect(model.supports.size).toBe(1);
  expect([...model.supports.values()][0]).toMatchObject({ nodeId: masterNode, dofRestraints: { tz: true } });
  expect(model.constraints).toEqual([
    ...[...lower.nodes.slice(0, 3), ...upper.nodes.slice(0, 3)].map(slaveNode => ({ type: 'equalDOF', masterNode, slaveNode, dofs: [2] })),
    { type: 'equalDOF', masterNode: lower.nodes[3], slaveNode: upper.nodes[3], dofs: [2] },
  ]);
  const plan = buildLoadPlan({ ...input, model, gravity: { mode: 'panels' }, dead: [{ labelKey: 'a', q: 1 }] });
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf })).toBeUndefined();
  const dead = modelStore.model.loadCases.find(c => c.type === 'D')!;
  expect(modelStore.model.loads.filter(load => load.type === 'surface3d' && load.data.caseId === dead.id))
    .toEqual([lower.quad, upper.quad].map(quadId => expect.objectContaining({ data: expect.objectContaining({ quadId, q: 1 }) })));
});

it.each(['D', 'S'] as const)('applied geometry-supported %s loads retain their bearing reactions', caseType => checkBearingReactions(caseType));
it('#2218 applied drift reaches three bearing lines', () => checkBearingReactions('S', true));

async function checkBearingReactions(caseType: 'D' | 'S', connectedBays = false) {
  const mode = uiStore.analysisMode;
  onTestFinished(() => { uiStore.analysisMode = mode; });
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const ring = (x0: number, x1: number, width: number, z0: number, z1: number) => {
    const nodes = [
      modelStore.addNode(x0, 0, z0), modelStore.addNode(x1, 0, z0),
      modelStore.addNode(x1, width, z1), modelStore.addNode(x0, width, z1),
    ] as [number, number, number, number];
    for (const id of nodes) modelStore.addSupport(id, 'fixed3d');
    return nodes;
  };
  const framed = (nodes: [number, number, number, number], y: number, z: number) => {
    const mid = modelStore.addNode(modelStore.nodes.get(nodes[0])!.x, y, z);
    const cycle = [...nodes, mid];
    for (const [index, id] of cycle.entries()) modelStore.addElement(id, cycle[(index + 1) % cycle.length]!);
  };
  const gravity = caseType === 'D' ? { mode: 'panels' } as const
    : { mode: 'panels', slab: 'oneWay', spanAxis: 'x' } as const;
  const lower = caseType === 'D' ? ring(0, 10, 6, 3, 3) : ring(0, 7.5, 4, 3, 3);
  const middle = connectedBays ? [0, 4].map(y => {
    const id = modelStore.addNode(1, y, 3);
    modelStore.addSupport(id, 'fixed3d');
    return id;
  }) : [];
  if (connectedBays) {
    framed([lower[0], middle[0]!, middle[1]!, lower[3]], 2, 3);
    modelStore.addElement(middle[0]!, lower[1]);
    modelStore.addElement(lower[1], lower[2]);
    modelStore.addElement(lower[2], middle[1]!);
  } else {
    framed(lower, caseType === 'D' ? 3 : 2, 3);
  }
  const upper = caseType === 'D' ? ring(0, 10, 6, 3, 6) : ring(-7.5, 0, 4, 5, 5);
  if (caseType === 'D') {
    const material = modelStore.model.materials.keys().next().value!;
    modelStore.addQuad(upper, material, 0.15);
  } else {
    framed(upper, 2, 5);
  }

  if (caseType === 'D') modelStore.addElement(lower[2], upper[2], 'truss');
  else modelStore.addElement(lower[0], upper[1], 'truss');

  modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
  const input = planInput();
  const plan = buildLoadPlan({
    ...input, gravity, regulations: regulations(), model: { ...input.model, supports: modelStore.supports },
    dead: caseType === 'D' ? [{ labelKey: 'a', q: 1 }] : [],
    snow: caseType === 'S' ? { ...snow, roofKind: 'mono', enabled: true, slippery: false, source: 'site' } : undefined,
  });
  expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf })).toBeUndefined();
  const loadCase = modelStore.model.loadCases.find(entry => entry.type === caseType)!;
  const combination = modelStore.addCombination('Bearing reactions', [{ caseId: loadCase.id, factor: 1 }]);
  const ps = caseType === 'S' ? plan.cases.find(entry => entry.type === 'S')!.nameParams?.ps as number : 0;
  for (const result of [modelStore.solve3D(false, false, true), await modelStore.solve3DAsync(false, false, true)]) {
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions.length).toBe(8 + middle.length);
  }
  expect(modelStore.singleSolveInput3D(false, false, true)).toBeTruthy();
  expect(modelStore.buildSolverInput3D()).toBeTruthy();
  for (const perCombination of ['linear', 'pdelta'] as const) {
    modelStore.setAnalysis({ perCombination });
    for (const bundle of [
      modelStore.solveCombinations3D(false, false, true),
      await modelStore.solveCombinations3DParallel(false, false, true),
    ]) {
      if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
      const { reactions } = bundle.perCombo.get(combination)!;
      const force = (ids: number[]) => reactions.filter(row => ids.includes(row.nodeId)).reduce((sum, row) => sum + row.fz, 0);
      if (caseType === 'D') {
        expect(force(lower)).toBeCloseTo(60, 8);
        expect(force(upper)).toBeCloseTo(10 * Math.sqrt(45), 8);
      } else if (connectedBays) {
        expect(force([lower[0], lower[3]])).toBeCloseTo(2 * ps + 1.5633453333333334, 8);
        expect(force(middle)).toBeCloseTo(15 * ps + 1.476509181184, 8);
        expect(force([lower[1], lower[2]])).toBeCloseTo(13 * ps + 0.00968777348266666, 8);
        expect(force(upper)).toBeCloseTo(30 * ps, 8);
      } else {
        expect(force([lower[0], lower[3]])).toBeCloseTo(15 * ps + 3.049542288 - 1.549167482304 / 7.5, 8);
        expect(force([lower[1], lower[2]])).toBeCloseTo(15 * ps + 1.549167482304 / 7.5, 8);
        expect(force(upper)).toBeCloseTo(30 * ps, 8);
      }
    }
  }
}
