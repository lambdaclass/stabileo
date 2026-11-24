/**
 * Generated service combinations reach the service envelope, and stay out of design's list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { addCompositeCases, addGeneratedCombinations, combinationExists, SERVICE_ENVELOPE_NAME, templateCombinationSpecs } from '../generated-combinations';
import { expandCombinations, presentSymbols } from '../../engine/loads/combination-cases';
import { generateCombinations } from '../../codes/cirsoc101/combinations';
import { generateServiceCombinations } from '../../codes/cirsoc101/service-combinations';
import { activeComboIds } from '../../engine/result-scopes';

function model() {
  modelStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  modelStore.addLoadCase('Dead', 'D');
  modelStore.addLoadCase('Live', 'L');
  return modelStore.model.loadCases.filter((c) => c.type === 'D' || c.type === 'L');
}

describe('adding generated combinations', () => {
  beforeEach(() => { modelStore.setResultScopes(null); });

  it('files the service ones in the SLS envelope and keeps them out of the active list', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const strength = expandCombinations(generateCombinations({ present }), cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations([...strength, ...service]); });
    const scopes = modelStore.resultScopes!;
    const sls = scopes.envelopes!.find((e) => e.name === SERVICE_ENVELOPE_NAME)!;
    expect(sls.purpose).toBe('service');
    const byName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
    expect(sls.comboIds.map((id) => byName.get(id))).toEqual(service.map((c) => c.name));
    const active = new Set(activeComboIds(scopes, modelStore.combinations));
    for (const id of sls.comboIds) expect(active.has(id)).toBe(false);
    expect(active.size).toBe(strength.length);
  });

  it('adds strength combinations alone without stating any list', () => {
    const cases = model();
    const strength = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    modelStore.batch(() => { addGeneratedCombinations(strength); });
    expect(modelStore.resultScopes).toBeUndefined();
  });
});

describe('generating again once a list is stated', () => {
  beforeEach(() => { modelStore.setResultScopes(null); });

  it('puts later strength combinations in the design’s list', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const strength = expandCombinations(generateCombinations({ present }), cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations([...strength, ...service]); });
    // Replace existing, then strength only: the list must not be left empty.
    modelStore.batch(() => {
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      addGeneratedCombinations(strength);
    });
    const active = activeComboIds(modelStore.resultScopes, modelStore.combinations);
    expect(active.length).toBe(strength.length);
  });

  it('undo gives the SLS envelope back its earlier combinations', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations(service); });
    const before = JSON.stringify(modelStore.resultScopes);
    addGeneratedCombinations(service); // outside a batch, as the Auto-loads dialog calls it
    historyStore.undo();
    expect(JSON.stringify(modelStore.resultScopes)).toBe(before);
  });
});

describe('snow patterns from an earlier generation', () => {
  it('are grouped as alternatives when the loads are generated again', () => {
    modelStore.clear();
    for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
    // An older project: the three patterns exist, with no group.
    const ids = ['Balanced', 'Unbalanced +X', 'Unbalanced −X'].map((n) => modelStore.addLoadCase(n, 'S'));
    const again = ['Balanced', 'Unbalanced +X', 'Unbalanced −X'].map((n) => modelStore.ensureLoadCase(n, 'S', { alternatives: 'snow-roof' }));
    expect(again).toEqual(ids);
    const cases = modelStore.model.loadCases;
    modelStore.addLoadCase('Dead', 'D');
    const out = expandCombinations(
      [{ id: 's', label: '1.2 D + 1.6 S', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'S', factor: 1.6 }] }] as never,
      modelStore.model.loadCases,
    );
    expect(cases.filter((c) => c.type === 'S').every((c) => c.alternatives === 'snow-roof')).toBe(true);
    expect(out).toHaveLength(3);
  });
});

describe('which wind cases can be reversed by sign', () => {
  it('horizontal forces only: yes; loads on the members (roof suction): no', async () => {
    const { windCaseReversible } = await import('../wind-reversal');
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4), c = modelStore.addNode(6, 0, 5);
    const col = modelStore.addElement(a, b, 'frame'), raf = modelStore.addElement(b, c, 'frame');
    void col;
    const lateral = modelStore.addLoadCase('Lateral', 'W');
    modelStore.addNodalLoad3D(b, 5, 0, 0, 0, 0, 0, lateral);
    const roof = modelStore.addLoadCase('Roof +X', 'W');
    modelStore.addDistributedLoad3D(raf, 0, 0, 0.8, 0.8, undefined, undefined, roof);
    const up = modelStore.addLoadCase('Uplift', 'W');
    modelStore.addNodalLoad3D(c, 0, 0, 3, 0, 0, 0, up);
    const model = modelStore.model;
    expect(windCaseReversible(model, lateral)).toBe(true);
    expect(windCaseReversible(model, roof)).toBe(false);
    expect(windCaseReversible(model, up)).toBe(false);
  });
});

describe('wind on the members, by the direction it acts in', () => {
  it('a horizontal member load reverses; a vertical component, or a load on the roof, does not', async () => {
    const { windCaseReversible } = await import('../wind-reversal');
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4), c = modelStore.addNode(6, 0, 4);
    const col = modelStore.addElement(a, b, 'frame'), beam = modelStore.addElement(b, c, 'frame');
    // Façade wind on the column: both its local transverse axes are horizontal.
    const facade = modelStore.addLoadCase('Façade +X', 'W');
    modelStore.addDistributedLoad3D(col, 0.7, 0.7, 0.4, 0.4, undefined, undefined, facade);
    modelStore.addPointLoadOnElement3D(col, 2, 0.5, 0.2, facade);
    // On the horizontal beam local z is vertical: that is roof suction or pressure.
    const roof = modelStore.addLoadCase('Roof', 'W');
    modelStore.addDistributedLoad3D(beam, 0, 0, 0.8, 0.8, undefined, undefined, roof);
    // Local y of a beam along X is horizontal: a lateral line load on it reverses.
    const side = modelStore.addLoadCase('Side', 'W');
    modelStore.addDistributedLoad3D(beam, 0.5, 0.5, 0, 0, undefined, undefined, side);
    const model = modelStore.model;
    expect(windCaseReversible(model, facade)).toBe(true);
    expect(windCaseReversible(model, roof)).toBe(false);
    expect(windCaseReversible(model, side)).toBe(true);
  });
});

/**
 * The loads tab writes its templates as the generator does: each combination says which code and
 * rule wrote it and what for. It wrote them without, so its service combinations were read by
 * design under "all", and "replace generated loads" never took back what it wrote.
 */
describe("the loads tab's templates say who wrote them", () => {
  it('strength and service from CIRSOC 101, the project rules as the project', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const strength = templateCombinationSpecs('lrfd', present, []);
    const service = templateCombinationSpecs('service', present, []);
    expect(strength.length).toBeGreaterThan(0);
    expect(strength.every((c) => c.origin?.code === 'cirsoc101-2025-basis' && c.origin.purpose === 'strength')).toBe(true);
    expect(service.every((c) => c.origin?.purpose === 'service')).toBe(true);
    const project = templateCombinationSpecs('project', present, [{ id: 'r1', purpose: 'strength', terms: [{ symbol: 'D', factor: 1.4 }] }]);
    expect(project[0]?.origin).toMatchObject({ code: 'project', rule: project[0]!.id });

    // Added as the tab adds them, the service ones stay out of design's "all".
    modelStore.setResultScopes(null);
    const ids = addGeneratedCombinations(expandCombinations([...strength, ...service], cases));
    modelStore.setResultScopes(null);
    const serviceIds = ids.filter((id) => modelStore.combinations.find((c) => c.id === id)!.origin?.purpose === 'service');
    expect(serviceIds.length).toBeGreaterThan(0);
    expect(activeComboIds(undefined, modelStore.combinations).some((id) => serviceIds.includes(id))).toBe(false);
  });
});

it('#2297 applied project rules preserve the net case in composite and notional variants', async () => {
  const { issue2297Factors } = await import('../../engine/__tests__/combination-factor-fixture');
  const { withNotionalVariants } = await import('../../engine/loads/notional-combinations');
  const { initSolver } = await import('../../engine/wasm-solver');
  await initSolver();
  const cases = model();
  const dead = cases.find(c => c.type === 'D')!;
  const notional = modelStore.addLoadCase('Notional X', '');
  modelStore.updateLoadCaseFields(notional, { notional: { sourceCaseId: dead.id, ratio: 0.5, dir: '+X' } });
  const specs = templateCombinationSpecs('project', presentSymbols(cases), [{
    id: 'test', purpose: 'strength', terms: issue2297Factors.map(factor => ({ symbol: 'D', factor })),
  }]);
  const expanded = expandCombinations(specs, cases);
  expect(expanded).toHaveLength(1);
  const unit = [{ caseId: dead.id, factor: 1 }];
  expect.soft(combinationExists(unit, [{ factors: expanded[0]!.factors }])).toBe(true);
  const variants = withNotionalVariants(expanded, modelStore.loadCases);
  expect.soft(variants).toHaveLength(2);
  expect.soft(variants[1]?.factors.find(f => f.caseId === notional)?.factor).toBe(1);
  const [composite] = addCompositeCases(expanded);
  expect.soft(modelStore.loadCases.find(c => c.id === composite)?.includes).toStrictEqual(unit);
});

it('#2297 a unit candidate differs from large cancelling composite paths', async () => {
  const { initSolver, combineResults, combineResults3D } = await import('../../engine/wasm-solver');
  await initSolver();
  const unit = [{ caseId: 1, factor: 1 }];
  const cases = [1, 2, 3, 4].map(id => ({ id, includes: id === 1 ? [] : unit }));
  const large = 2 ** 54;
  const factors = [large, 1, -large].map((factor, i) => ({ caseId: i + 2, factor }));
  const empty = { displacements: [], elementForces: [] };
  const planar = { ...empty, reactions: [{ nodeId: 1, rx: -1, rz: 0, my: 0 }] };
  const spatial = { ...empty, reactions: [{ nodeId: 1, fx: -1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }] };
  const planarCases = new Map(cases.map(({ id }) => [id, planar]));
  const spatialCases = new Map(cases.map(({ id }) => [id, spatial]));
  expect(combineResults(unit, planarCases)?.reactions[0]?.rx).toBe(-1);
  expect(combineResults(factors, planarCases)?.reactions[0]?.rx).toBe(0);
  expect(combineResults3D(unit, spatialCases, new Map())?.reactions[0]?.fx).toBe(-1);
  expect(combineResults3D(factors, spatialCases, new Map())?.reactions[0]?.fx).toBe(0);
  expect(combinationExists(unit, [{ factors }])).toBe(false);
});

it('#2297 duplicate detection preserves factor values, term order and combination method', () => {
  const cases = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const factors = cases.map(({ id: caseId }, i) => ({ caseId, factor: [2 ** 54, 1, -(2 ** 54)][i]! }));
  const unit = [{ caseId: 2, factor: 1 }];
  const nearlyUnit = [{ caseId: 2, factor: 1 + Number.EPSILON }];
  const zero = { caseId: 1, factor: 0 };
  const tiny = { caseId: 1, factor: Number.MIN_VALUE };
  const magnitude = { factors: unit, method: 'abs' } as const;
  expect(combinationExists(unit, [{ factors: [zero, ...unit] }])).toBe(true);
  expect(combinationExists(factors, [{ factors }])).toBe(true);
  expect.soft(combinationExists(unit, [{ factors: nearlyUnit }])).toBe(false);
  expect.soft(combinationExists(unit, [{ factors: [tiny, ...unit] }])).toBe(false);
  expect.soft(combinationExists(factors, [{ factors: [factors[0]!, factors[2]!, factors[1]!] }])).toBe(false);
  expect.soft(combinationExists(unit, [magnitude])).toBe(false);
});

it.each(['direct', 'composite roots', 'composite inclusions'] as const)(
  '#2297 reports overflowing existing %s without blocking duplicate matching',
  async mode => {
    const { initSolver } = await import('../../engine/wasm-solver');
    await initSolver();
    const dead = model().find(c => c.type === 'D')!.id;
    const terms = (caseId: number, ...weights: number[]) => weights.map(factor => ({ caseId, factor }));
    const unit = terms(dead, 1);
    const max = Number.MAX_VALUE;
    const invalid = terms(dead, max, max);
    const representable = terms(dead, max / 2, max / 2);
    const candidate = terms(dead, max);
    const wrapper = (name: string, includes: typeof unit) => {
      const id = modelStore.addLoadCase(name, '', { generated: true });
      expect(modelStore.updateLoadCaseFields(id, { includes })).toBe(true);
      return terms(id, 1);
    };
    const bad = { name: 'Overflowing combination', factors: mode === 'composite inclusions' ? wrapper('Overflowing wrapper', invalid) : invalid };
    const good = { name: 'Representable combination', factors: mode === 'direct' ? representable : wrapper('Representable wrapper', representable) };
    const compositeModel = mode === 'direct' ? undefined : modelStore.model;
    const reported: Array<[string, string]> = [];
    const report = (combo: { name?: string }, error: Error) => reported.push([combo.name ?? '', error.message]);
    const exists = (factors: typeof unit, combinations: Array<typeof bad>) =>
      combinationExists(factors, combinations, compositeModel, report);

    expect.soft(exists(candidate, [bad, good])).toBe(true);
    expect.soft(exists(candidate, [good, bad])).toBe(true);
    expect(exists(unit, [bad])).toBe(false);
    expect(reported).toEqual(Array.from({ length: 3 }, () => [bad.name, expect.stringMatching(/net factor/)]));
    expect(() => exists(invalid, [])).toThrow(/net factor/);
  },
);
