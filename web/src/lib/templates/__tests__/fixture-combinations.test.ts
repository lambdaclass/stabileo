import { describe, it, expect, beforeAll } from 'vitest';
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

beforeAll(async () => {
  await initSolver();
});

describe('an example leaves no combination naming a case it does not have', () => {
  it.each(fixtures)('$name', ({ json }) => {
    const { loadCases, combinations } = fixtureLoadCases(json, { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(missingCases(loadCases, combinations)).toEqual([]);
    expect(combinations.length, 'an example with cases keeps combinations to solve').toBeGreaterThan(0);
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
  it('drops the default combinations that name a case it lacks, and keeps the rest', async () => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    loadFixture(emptyFixture({ loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }] }), modelStore.fixtureApi() as never);
    expect(modelStore.model.combinations.map((c) => c.id)).toEqual([1, 2]);
    expect(missingCases(modelStore.model.loadCases, modelStore.model.combinations)).toEqual([]);
  });

  it('drops the default combinations whose case it has under another type', () => {
    const json = emptyFixture({ loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'Lr', name: 'Lr' }, { id: 3, type: 'W', name: 'W' }] });
    const { combinations } = fixtureLoadCases(json, { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(combinations.map((c) => c.name)).toEqual(['1.4D']);
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

  it('without cases of its own keeps the four defaults', () => {
    const { combinations } = fixtureLoadCases(emptyFixture({}), { loadCases: defaultLoadCases(), combinations: defaultCombinations() });
    expect(combinations).toEqual(defaultCombinations());
  });
});
