import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fixtureLoadCases, loadFixture, type JSONModel } from '../load-fixture';
import { defaultCombinations, defaultLoadCases } from '../../model/default-loads';
import { generateCombinations } from '../../codes/cirsoc101/combinations';
import { expandCombinations, presentSymbols } from '../../engine/loads/combination-cases';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore, uiStore } from '../../store';

const DIR = 'src/lib/templates/fixtures';
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => ({
  name: f.replace(/\.json$/, ''),
  json: JSON.parse(readFileSync(join(DIR, f), 'utf8')) as JSONModel,
}));

const missingCases = (cases: ReadonlyArray<{ id: number }>, combos: ReadonlyArray<{ name?: unknown; factors?: ReadonlyArray<{ caseId: number }> }>) => {
  const ids = new Set(cases.map((c) => c.id));
  return combos.flatMap((c) => (c.factors ?? []).filter((f) => !ids.has(f.caseId)).map((f) => `${String(c.name)} → case ${f.caseId}`));
};

const emptyFixture = (over: Partial<JSONModel>): JSONModel => ({
  name: 'probe', materials: [], sections: [], nodes: [], elements: [], supports: [], loads: [],
  plates: [], quads: [], constraints: [], loadCases: [], combinations: [], ...over,
});

const startMode = uiStore.analysisMode;

beforeAll(async () => {
  await initSolver();
});

afterEach(() => {
  modelStore.clear();
  uiStore.analysisMode = startMode;
});

describe('an example leaves no combination naming a case it does not have', () => {
  it.each(fixtures)('$name', ({ json }) => {
    const { loadCases, combinations } = fixtureLoadCases(json, { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(missingCases(loadCases, combinations)).toEqual([]);
    expect(combinations.length, 'an example with cases keeps combinations to solve').toBeGreaterThan(0);
    const loaded = new Set(json.loads.map((l) => (l.data.caseId as number | undefined) ?? 1));
    const combined = new Set(combinations.flatMap((c) => (c.factors ?? []).filter((f) => f.factor !== 0).map((f) => f.caseId)));
    if (loaded.size > 1) expect([...loaded].filter((id) => !combined.has(id)), 'a loaded case in no combination').toEqual([]);
  });
});

describe('the 3D shed', () => {
  it('opens in Basic 3D with the CIRSOC 101-2025 combinations of its own D, Lr and W, and nothing else', async () => {
    uiStore.analysisMode = '3d';
    await modelStore.loadExample('3d-nave-industrial');
    const { loadCases, combinations } = modelStore.model;
    expect(loadCases.map((c) => [c.id, c.type])).toEqual([[1, 'D'], [2, 'Lr'], [3, 'W']]);
    expect(missingCases(loadCases, combinations)).toEqual([]);
    const expected = expandCombinations(generateCombinations({ present: presentSymbols(loadCases) }), loadCases);
    expect(combinations.map((c) => [c.name, c.factors])).toEqual(expected.map((c) => [c.name, c.factors]));
    expect(combinations.some((c) => /\bE\b/.test(c.name))).toBe(false);
    expect(combinations.map((c) => c.origin?.code)).toEqual(combinations.map(() => 'cirsoc101-2025-basis'));
  });
});

describe('the stadium canopy', () => {
  it('carries the CIRSOC 101-2025 combinations of its loaded cases, D and Lr', () => {
    const { json } = fixtures.find((f) => f.name === 'stadium-canopy')!;
    const loaded = new Set(json.loads.map((l) => (l.data.caseId as number | undefined) ?? 1));
    const cases = json.loadCases.filter((c) => loaded.has(c.id));
    expect(cases.map((c) => c.type)).toEqual(['D', 'Lr']);
    const expected = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    expect(json.combinations.map((c) => [c.name, c.factors])).toEqual(expected.map((c) => [c.name, c.factors]));
  });
});

describe('a fixture that brings its own cases', () => {
  it('gets the CIRSOC 101-2025 combinations of its cases when a default names a case it lacks', async () => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const cases = [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }];
    loadFixture(emptyFixture({ loadCases: cases }), modelStore.fixtureApi() as never);
    const expected = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    expect(modelStore.model.combinations.map((c) => [c.name, c.factors])).toEqual(expected.map((c) => [c.name, c.factors]));
    expect(missingCases(modelStore.model.loadCases, modelStore.model.combinations)).toEqual([]);
    const next = modelStore.addCombination('mine', [{ caseId: 1, factor: 1 }]);
    expect(next).toBe(expected.length + 1);
  });

  it('gets them too when a default would take one of its cases under another type, and every case is combined', () => {
    const cases = [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'Lr', name: 'Lr' }, { id: 3, type: 'W', name: 'W' }];
    const { combinations, rebuilt } = fixtureLoadCases(emptyFixture({ loadCases: cases }), { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(rebuilt).toBe(true);
    const expected = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    expect(combinations.map((c) => [c.name, c.factors])).toEqual(expected.map((c) => [c.name, c.factors]));
    for (const c of cases) expect(combinations.some((k) => k.factors.some((f) => f.caseId === c.id && f.factor !== 0)), c.type).toBe(true);
  });

  it('is refused, before anything is loaded, when its own combination names a case it lacks', () => {
    modelStore.clear();
    const json = emptyFixture({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }],
      loadCases: [{ id: 1, type: 'D', name: 'D' }],
      combinations: [{ id: 1, name: '1.2 D + 1.0 E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 4, factor: 1 }] }],
    });
    expect(() => loadFixture(json, modelStore.fixtureApi() as never)).toThrow(/"1\.2 D \+ 1\.0 E" names a load case the model does not have/);
    expect(modelStore.nodes.size).toBe(0);
    expect(modelStore.model.combinations).toEqual(defaultCombinations());
  });

  it('gets them when it loads a case no default combines', () => {
    const cases = [...defaultLoadCases(), { id: 5, type: 'S', name: 'Snow' }];
    const loads = [1, 5].map((caseId) => ({ type: 'nodal3d', data: { nodeId: 1, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0, caseId } }));
    const { combinations, rebuilt } = fixtureLoadCases(emptyFixture({ loadCases: cases, loads }), { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(rebuilt).toBe(true);
    expect(combinations.some((c) => c.factors.some((f) => f.caseId === 5 && f.factor !== 0))).toBe(true);
    expect(missingCases(cases, combinations)).toEqual([]);
  });

  it('is refused when its own combination has no factor list or a null factor', () => {
    const cases = [{ id: 1, type: 'D', name: 'D' }];
    for (const combination of [{ id: 1, name: 'none' }, { id: 1, name: 'null', factors: [null] }]) {
      const json = emptyFixture({ loadCases: cases, combinations: [combination as never] });
      expect(() => fixtureLoadCases(json, { loadCases: defaultLoadCases(), combinations: defaultCombinations() }), combination.name).toThrow(/names a load case/);
    }
  });

  it('without cases of its own keeps the four defaults', () => {
    const { combinations } = fixtureLoadCases(emptyFixture({}), { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(combinations).toEqual(defaultCombinations());
  });
});
