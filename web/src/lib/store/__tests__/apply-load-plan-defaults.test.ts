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
