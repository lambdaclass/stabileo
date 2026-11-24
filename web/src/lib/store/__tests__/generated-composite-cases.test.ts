/**
 * Combinations the generator writes as composite cases ("create as composite cases",
 * `addCompositeCases`): each case is the generator's, as its combination is. "Replace" took the
 * combinations back and left their cases, still solved and listed; and a second run did not see
 * them, since the combination it wrote takes one case at 1 and the run compared that with the
 * cases' own factors: every combination came out again, as a second set of cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { historyStore } from '../history.svelte';
import { applyLoadPlan } from '../apply-load-plan';
import { addCompositeCases, combinationExists } from '../generated-combinations';
import { buildLoadPlan, type LoadPlanInput } from '../../engine/loads/load-plan';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { defaultRegulations, type ProjectRegulations } from '../../codes/roles';
import es from '../../i18n/locales/es';

const nameOf = (key: string, params?: Record<string, string | number>) =>
  (es[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));

const applied = (reg: ProjectRegulations): ProjectRegulations => Object.fromEntries(Object.entries(reg).map(([k, v]) =>
  [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;

/** One storey of 2 × 1 bays of 5 m at z = 3. */
function frame(): void {
  modelStore.clear(); historyStore.clear();
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const at = new Map<string, number>();
  for (const z of [0, 3]) for (let j = 0; j <= 1; j++) for (let i = 0; i <= 2; i++) at.set(`${i},${j},${z}`, modelStore.addNode(5 * i, 5 * j, z));
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= 2; i++) modelStore.addElement(at.get(`${i},${j},0`)!, at.get(`${i},${j},3`)!);
  for (let j = 0; j <= 1; j++) for (let i = 0; i < 2; i++) modelStore.addElement(at.get(`${i},${j},3`)!, at.get(`${i + 1},${j},3`)!);
  for (let i = 0; i <= 2; i++) modelStore.addElement(at.get(`${i},0,3`)!, at.get(`${i},1,3`)!);
}

const planInput = (): LoadPlanInput => ({
  regulations: applied(defaultRegulations()),
  model: {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never,
    sections: modelStore.model.sections as never, materials: modelStore.model.materials as never,
    loadCases: modelStore.model.loadCases, quads: modelStore.model.quads as never,
  },
  dead: [{ labelKey: 'a', q: 1.5 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
  generateCombinations: true,
});

describe('combinations generated as composite cases', () => {
  beforeEach(() => { frame(); });

  it('are taken back with their combinations by "replace", and seen by a second run', () => {
    const plan = buildLoadPlan(planInput());
    expect(plan.outcome).toBe('READY');
    // The generator's cases, without combinations: they come as composite cases below.
    applyLoadPlan({ ...plan, combinations: [] }, { clearExisting: false, bothSenses: true, nameOf });
    const plain = modelStore.model.loadCases.map((c) => ({ id: c.id, type: c.type, name: c.name }));
    const list = expandCombinations(plan.combinations, plain);
    expect(list.length).toBeGreaterThan(0);
    const made = addCompositeCases(list);
    expect(made).toHaveLength(list.length);
    for (const id of made) expect(modelStore.model.loadCases.find((c) => c.id === id)!.generated).toBe(true);

    // A second run sees every one of them, as the combination its case is.
    for (const c of list) expect(combinationExists(c.factors, modelStore.combinations, modelStore.model)).toBe(true);
    // And not one with other factors.
    const other = list[0]!.factors.map((f) => ({ ...f, factor: f.factor * 2 }));
    expect(combinationExists(other, modelStore.combinations, modelStore.model)).toBe(false);

    // "Replace": the combinations go, and the cases with them; none taken by nothing is left.
    applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf });
    const ids = new Set(modelStore.model.loadCases.map((c) => c.id));
    for (const id of made) expect(ids.has(id)).toBe(false);
    expect(modelStore.model.loadCases.some((c) => c.generated)).toBe(false);
    for (const c of modelStore.combinations) for (const f of c.factors) expect(ids.has(f.caseId)).toBe(true);
  });

  it('matches only an unmodified unit wrapper for a composite candidate', () => {
    const dead = modelStore.addLoadCase('Dead', 'D');
    const factors = [{ caseId: dead, factor: 1 }];
    const [wrapper] = addCompositeCases([{ name: 'Unit', factors, purpose: 'strength', specId: 'unit' }]);
    const existing = modelStore.combinations;
    expect(combinationExists(factors, existing, modelStore.model)).toBe(true);
    expect(combinationExists(factors, existing)).toBe(false);
    expect(combinationExists(factors, [{ factors }], modelStore.model)).toBe(false);
    for (const factor of [1 - Number.EPSILON, 1 + Number.EPSILON]) {
      expect(combinationExists(factors, [{ factors: [{ caseId: wrapper!, factor }] }], modelStore.model)).toBe(false);
    }
    const node = modelStore.nodes.keys().next().value!;
    modelStore.addNodalLoad3D(node, 1, 0, 0, 0, 0, 0, wrapper!);
    expect(combinationExists(factors, existing, modelStore.model)).toBe(false);
  });

  it('a generated case something else takes stays, and a case of the user\'s is never taken back', () => {
    const D = modelStore.addLoadCase('D', 'D'), L = modelStore.addLoadCase('L', 'L');
    const mine = modelStore.addLoadCase('Mine', '');
    modelStore.updateLoadCaseFields(mine, { includes: [{ caseId: D, factor: 1 }] });
    const [kept, gone] = addCompositeCases([
      { name: '1.2 D + 1.6 L', factors: [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }], purpose: 'strength', specId: '2', origin: { code: 'cirsoc101-2025' } as never },
      { name: '1.4 D', factors: [{ caseId: D, factor: 1.4 }], purpose: 'strength', specId: '1', origin: { code: 'cirsoc101-2025' } as never },
    ]);
    // A combination of the user's takes the first one in.
    modelStore.addCombination('mine', [{ caseId: kept!, factor: 1 }, { caseId: L, factor: 0.5 }]);
    const plan = buildLoadPlan(planInput());
    applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf });
    const ids = new Set(modelStore.model.loadCases.map((c) => c.id));
    expect(ids.has(kept!)).toBe(true);
    expect(ids.has(gone!)).toBe(false);
    expect(ids.has(mine)).toBe(true);
  });
});
