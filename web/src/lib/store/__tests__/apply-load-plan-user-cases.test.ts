/**
 * Applying a load plan next to the user's own cases of the same action.
 *
 * With partial live loading the generated live load is an alternatives group (the full load and
 * its checkerboards), and the user's own live case stays outside it. The user's case must still
 * enter every combination of its action, whichever of the group's alternatives that combination
 * takes; likewise a user's temperature case beside the generated ±ΔT. And a group case must never
 * be filed into the user's case because the two happen to share a name, which in Spanish they do:
 * the generated live case is "Sobrecarga", and so is many a hand-made one.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan, LIVE_PATTERNS, THERMAL_SENSES, type LoadPlanInput } from '../../engine/loads/load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../codes/roles';
import es from '../../i18n/locales/es';

/** Case names as the Spanish app gives them. */
const nameOf = (key: string, params?: Record<string, string | number>) =>
  (es[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));

const applied = (reg: ProjectRegulations): ProjectRegulations => Object.fromEntries(Object.entries(reg).map(([k, v]) =>
  [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;

/** One storey of 3 × 2 bays of 5 m at z = 3, columns at every grid node, beams both ways. Returns a beam id. */
function frame(): number {
  modelStore.clear();
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const at = new Map<string, number>();
  for (const z of [0, 3]) for (let j = 0; j <= 2; j++) for (let i = 0; i <= 3; i++) at.set(`${i},${j},${z}`, modelStore.addNode(5 * i, 5 * j, z));
  for (let j = 0; j <= 2; j++) for (let i = 0; i <= 3; i++) modelStore.addElement(at.get(`${i},${j},0`)!, at.get(`${i},${j},3`)!);
  let beam = 0;
  for (let j = 0; j <= 2; j++) for (let i = 0; i < 3; i++) beam = modelStore.addElement(at.get(`${i},${j},3`)!, at.get(`${i + 1},${j},3`)!);
  for (let i = 0; i <= 3; i++) for (let j = 0; j < 2; j++) modelStore.addElement(at.get(`${i},${j},3`)!, at.get(`${i},${j + 1},3`)!);
  return beam;
}

function planInput(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: applied(defaultRegulations()),
    model: {
      nodes: modelStore.nodes as never, elements: modelStore.elements as never,
      sections: modelStore.model.sections as never, materials: modelStore.model.materials as never,
      loadCases: modelStore.model.loadCases, quads: modelStore.model.quads as never,
    },
    dead: [{ labelKey: 'a', q: 1.5 }], occupancyKey: 'vivienda', tributaryWidth: 3,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: true,
    generateCombinations: true, gravity: { mode: 'panels' },
    ...over,
  };
}

const casesIn = (comboId: number) => new Set(modelStore.model.combinations.find((c) => c.id === comboId)!.factors.map((f) => f.caseId));

describe("the user's own cases beside a generated alternatives group", () => {
  beforeEach(() => { frame(); });

  it('a user live case enters every live combination, whichever checkerboard it takes', () => {
    const beam = [...modelStore.elements.keys()].pop()!;
    const mine = modelStore.addLoadCase('Mis sobrecargas', 'L');
    modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, mine);
    const plan = buildLoadPlan(planInput({ patterns: 'checkerboard' }));
    expect(plan.outcome).toBe('READY');
    applyLoadPlan(plan, { clearExisting: false, bothSenses: true, nameOf });
    const group = new Set(modelStore.model.loadCases.filter((c) => c.alternatives === LIVE_PATTERNS).map((c) => c.id));
    expect(group.has(mine)).toBe(false);
    const withLive = modelStore.model.combinations.filter((c) => c.factors.some((f) => group.has(f.caseId)));
    expect(withLive.length).toBeGreaterThan(0);
    for (const c of withLive) {
      expect(casesIn(c.id).has(mine)).toBe(true);
      // At the factor the combination gives the live load.
      const groupFactor = c.factors.find((f) => group.has(f.caseId))!.factor;
      expect(c.factors.find((f) => f.caseId === mine)!.factor).toBe(groupFactor);
    }
  });

  it('a user temperature case enters every combination with either sense of the generated ΔT', () => {
    const beam = [...modelStore.elements.keys()].pop()!;
    const mine = modelStore.addLoadCase('Retracción losa', 'T');
    modelStore.addThermalLoad(beam, -15, 0, mine);
    const plan = buildLoadPlan(planInput({ patterns: 'none', thermal: { dtUniform: 20, dtGradient: 0 } }));
    expect(plan.outcome).toBe('READY');
    applyLoadPlan(plan, { clearExisting: false, bothSenses: true, nameOf });
    const senses = new Set(modelStore.model.loadCases.filter((c) => c.alternatives === THERMAL_SENSES).map((c) => c.id));
    expect(senses.size).toBe(2);
    expect(senses.has(mine)).toBe(false);
    const withT = modelStore.model.combinations.filter((c) => c.factors.some((f) => senses.has(f.caseId)));
    expect(withT.length).toBeGreaterThan(0);
    for (const c of withT) expect(casesIn(c.id).has(mine)).toBe(true);
  });
});

describe('a group case is not filed into a user case of the same name', () => {
  beforeEach(() => { frame(); });

  it('ensureLoadCase with a group creates its own case beside a user case called "Sobrecarga"', () => {
    const mine = modelStore.addLoadCase('Sobrecarga', 'L');
    const id = modelStore.ensureLoadCase('Sobrecarga', 'L', { existingId: null, alternatives: LIVE_PATTERNS, own: true });
    expect(id).not.toBe(mine);
    const user = modelStore.model.loadCases.find((c) => c.id === mine)!;
    expect(user.alternatives).toBeUndefined();
    const made = modelStore.model.loadCases.find((c) => c.id === id)!;
    expect(made.alternatives).toBe(LIVE_PATTERNS);
    expect(made.name).not.toBe('Sobrecarga');
    // A second apply finds the group's case again rather than making a third.
    expect(modelStore.ensureLoadCase('Sobrecarga', 'L', { existingId: null, alternatives: LIVE_PATTERNS, own: true })).toBe(id);
  });

  it('applying a checkerboard plan in Spanish leaves the user\'s "Sobrecarga" and "Temperatura" out of the groups, and in the combinations', () => {
    const beam = [...modelStore.elements.keys()].pop()!;
    const live = modelStore.addLoadCase('Sobrecarga', 'L');
    modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, live);
    const temp = modelStore.addLoadCase('Temperatura', 'T');
    modelStore.addThermalLoad(beam, 10, 0, temp);
    // The plan is built against a model whose only live case is the user's: no group case yet.
    const plan = buildLoadPlan(planInput({ patterns: 'checkerboard', thermal: { dtUniform: 20, dtGradient: 0 } }));
    applyLoadPlan(plan, { clearExisting: false, bothSenses: true, nameOf });
    const byId = new Map(modelStore.model.loadCases.map((c) => [c.id, c]));
    expect(byId.get(live)!.alternatives).toBeUndefined();
    expect(byId.get(temp)!.alternatives).toBeUndefined();
    expect(modelStore.model.loadCases.filter((c) => c.alternatives === LIVE_PATTERNS && !c.pattern)).toHaveLength(1);
    expect(modelStore.model.loadCases.filter((c) => c.alternatives === THERMAL_SENSES)).toHaveLength(2);
    // The user's loads stay where the user put them.
    expect(modelStore.loads.filter((l) => l.data.caseId === live)).toHaveLength(1);
    for (const c of modelStore.model.combinations) {
      const ids = casesIn(c.id);
      if (c.factors.some((f) => byId.get(f.caseId)?.alternatives === LIVE_PATTERNS)) expect(ids.has(live)).toBe(true);
      if (c.factors.some((f) => byId.get(f.caseId)?.alternatives === THERMAL_SENSES)) expect(ids.has(temp)).toBe(true);
    }
  });
});
