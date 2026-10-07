/**
 * "Replace generated loads" in a project saved before the generator marked what it wrote.
 *
 * Replace takes back only what carries the generator's mark (`generatedBy` on loads, an origin on
 * combinations). A project saved before the marks holds the generator's own loads and the code's
 * combinations unmarked, so regenerating with replace kept them and added the plan on top: every
 * dead and live load twice, every combination twice, and the preview said nothing (lossy false, no
 * warning). Now the preview names what it keeps in the cases it rewrites, and the user can ask for
 * it to go too; what was typed by hand stays unless asked. The preview is counted from the same
 * scope apply removes (`replaceScope`), so the two cannot disagree.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, type Load } from '../model.svelte';
import '../index';
import { applyLoadPlan, loadStateForPlan, replaceScope } from '../apply-load-plan';
import { buildLoadPlan, describePlanDelta, type LoadPlanInput } from '../../engine/loads/load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../codes/roles';
import es from '../../i18n/locales/es';

const nameOf = (key: string, params?: Record<string, string | number>) =>
  (es[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));
const applied = (reg: ProjectRegulations): ProjectRegulations => Object.fromEntries(Object.entries(reg).map(([k, v]) =>
  [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;

/** Two bays of 5 m at z = 3 on three columns. */
function frame(): void {
  modelStore.clear();
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
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

/** What an older version left: the same loads and combinations, without the marks. */
function forgetMarks(): void {
  modelStore.replaceLoads(modelStore.loads.map((l) => {
    const data = { ...l.data } as Record<string, unknown>;
    delete data.generatedBy;
    return { ...l, data } as unknown as Load;
  }));
  for (const c of modelStore.model.combinations) delete (c as { origin?: unknown }).origin;
}

const caseOf = (type: string) => modelStore.model.loadCases.find((c) => c.type === type)!.id;
const loadsIn = (caseId: number) => modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId).length;
const counts = () => ({ loads: modelStore.loads.length, combinations: modelStore.model.combinations.length });

function preview(alsoUnmarked: boolean) {
  const p = buildLoadPlan(planInput());
  return { p, delta: describePlanDelta(p, loadStateForPlan(p, nameOf), { replaceExisting: true, bothSenses: { E: true }, alsoUnmarked }) };
}

describe('replace in a project saved before the marks', () => {
  let original: { loads: number; combinations: number; dead: number };
  beforeEach(() => {
    frame();
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    forgetMarks();
    original = { ...counts(), dead: loadsIn(caseOf('D')) };
  });

  it('the preview says what it keeps and that the plan adds to it, and its counts are what apply leaves', () => {
    const { p, delta } = preview(false);
    expect(delta.unmarked).toMatchObject({ loads: original.loads, combinations: original.combinations });
    expect(delta.unmarked!.cases).toEqual(expect.arrayContaining(['D', 'L']));
    expect(delta.warnings.map((w) => w.key)).toContain('loadPlan.warning.unmarkedKept');
    expect(delta.dispositions.find((d) => d.caseType === 'D')?.lossy).toBe(true);
    applyLoadPlan(p, { clearExisting: true, bothSenses: true, nameOf });
    // Kept, and the plan on top: what the preview said, to the load.
    expect(loadsIn(caseOf('D'))).toBe(2 * original.dead);
    expect(modelStore.loads.filter((l) => l.type === 'distributed3d').length).toBe(delta.after.distributed);
    expect(modelStore.model.combinations.length).toBe(delta.after.combinations);
  });

  it('asked to, it removes them too, and nothing doubles', () => {
    const { p, delta } = preview(true);
    expect(delta.warnings.map((w) => w.key)).toContain('loadPlan.warning.unmarkedRemoved');
    expect(delta.dispositions.find((d) => d.caseType === 'D')?.lossy).toBe(false);
    expect(delta.after.distributed).toBe(delta.before.distributed);
    expect(delta.after.combinations).toBe(original.combinations);
    applyLoadPlan(p, { clearExisting: true, alsoUnmarked: true, bothSenses: true, nameOf });
    expect(counts()).toEqual({ loads: original.loads, combinations: original.combinations });
    expect(loadsIn(caseOf('D'))).toBe(original.dead);
    expect(modelStore.model.combinations.length).toBe(delta.after.combinations);
  });
});

describe('what the user typed in a project with the marks', () => {
  beforeEach(() => {
    frame();
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
  });

  it('a load typed into a generated case is kept by default and named in the preview', () => {
    const el = [...modelStore.elements.keys()].pop()!;
    const typed = modelStore.addDistributedLoad3D(el, 0, 0, -1, -1, undefined, undefined, caseOf('D'));
    const before = counts();
    const { p, delta } = preview(false);
    expect(delta.unmarked).toMatchObject({ loads: 1, combinations: 0, cases: ['D'] });
    applyLoadPlan(p, { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.loads.some((l) => l.data.id === typed)).toBe(true);
    expect(counts()).toEqual(before);
  });

  it("the user's own case of a regenerated action is not a case the plan writes into", () => {
    const mine = modelStore.addLoadCase('Mi permanente', 'D');
    const el = [...modelStore.elements.keys()].pop()!;
    modelStore.addDistributedLoad3D(el, 0, 0, -1, -1, undefined, undefined, mine);
    modelStore.addCombination('1,0 Mi permanente', [{ caseId: mine, factor: 1 }]);
    const p = buildLoadPlan(planInput());
    const s = replaceScope(p, modelStore.loads, modelStore.model.loadCases, modelStore.model.combinations, nameOf);
    expect(s.targets).not.toContain(mine);
    expect(s.unmarked).toEqual({ loads: [], combinations: [] });
    expect(describePlanDelta(p, loadStateForPlan(p, nameOf), { replaceExisting: true }).unmarked).toBeNull();
  });
});

/**
 * An edit by hand makes a generated load or a code combination the user's. Both kept their marks,
 * so the next "replace" deleted the edit with nothing said.
 */
describe("an edit by hand makes it the user's", () => {
  beforeEach(() => {
    frame();
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
  });
  const mark = (id: number) => (modelStore.loads.find((l) => l.data.id === id)!.data as { generatedBy?: string }).generatedBy;

  it('a load whose value is edited loses the mark; one moved to another case or "edited" to its own value keeps it', () => {
    const [a, b] = modelStore.loads.filter((l) => l.type === 'distributed3d').map((l) => l.data as unknown as { id: number; qZI: number });
    modelStore.updateLoad(b!.id, { qZI: b!.qZI });
    expect(mark(b!.id)).toBeDefined();
    modelStore.updateLoad(b!.id, { caseId: caseOf('L') });
    expect(mark(b!.id)).toBeDefined();
    modelStore.updateLoad(a!.id, { qZI: a!.qZI * 2 });
    expect(mark(a!.id)).toBeUndefined();
    // And replace keeps it.
    const p = buildLoadPlan(planInput());
    applyLoadPlan(p, { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.loads.some((l) => l.data.id === a!.id)).toBe(true);
  });

  it('a combination whose factors are edited stays, with its purpose; a renamed one is still the code\'s', () => {
    const [c1, c2] = modelStore.model.combinations;
    modelStore.updateCombination(c1!.id, { name: 'renamed' });
    modelStore.updateCombination(c2!.id, { factors: c2!.factors.map((f) => ({ ...f, factor: f.factor * 1.1 })) });
    expect(modelStore.model.combinations.find((c) => c.id === c1!.id)!.origin?.edited).toBeUndefined();
    const edited = modelStore.model.combinations.find((c) => c.id === c2!.id)!;
    expect(edited.origin).toMatchObject({ edited: true, purpose: c2!.origin!.purpose });
    applyLoadPlan(buildLoadPlan(planInput()), { clearExisting: true, bothSenses: true, nameOf });
    expect(modelStore.model.combinations.some((c) => c.id === c2!.id)).toBe(true);
    expect(modelStore.model.combinations.some((c) => c.id === c1!.id)).toBe(false);
  });
});
