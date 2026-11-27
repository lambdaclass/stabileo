import { render } from 'svelte/server';
import AdoptedReinforcementNotice from '../../../components/AdoptedReinforcementNotice.svelte';
import { modelFeatures } from '../../provenance/model-features';
import { t } from '../../i18n';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { allDictFor, allShippedLocales } from '../../i18n/locales/all';
import en from '../../i18n/locales/en';
import { writeIfc } from '../../ifc/ifc-writer';
import { publishCombinations3D } from '../active-results';
import type { ModelSnapshot } from '../history.svelte';
import { exportProjectIfc, projectIfcInput } from '../ifc-export';
import { modelStore, resultsStore, uiStore } from '../index';
import { memoriaInput } from '../memoria-inputs';
import { deflectionChecks } from '../serviceability';
import saved from './fixtures/adopted-frame.json';

beforeAll(async () => { await initSolver(); });
afterEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = '3d';
});

function snapshot(): ModelSnapshot {
  return structuredClone(saved) as unknown as ModelSnapshot;
}

async function reopen(project: ModelSnapshot, parallel = false) {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  modelStore.restore(project);
  const solved = parallel
    ? await modelStore.solveCombinations3DParallel(false, false, true)
    : modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw Error(String(solved));
  publishCombinations3D(solved);
  return deflectionChecks([4]).rows.get(4)!;
}

const sheets = __PUBLIC_FEATURES__.proRcSheets;

it.each([
  ['linear', false], ['linear', true], ['pdelta', false], ['pdelta', true],
] as const)('uses the build profile for beam, report and IFC after %s solve (parallel %s)', async (method, parallel) => {
  const project = snapshot();
  project.analysis = { ...project.analysis, perCombination: method };
  const row = await reopen(project, parallel);
  const tr = (key: string) => en[key] ?? key;
  const report = memoriaInput(tr, 'en');
  const ifc = projectIfcInput(tr, 'en', 'adopted-frame');
  expect(row.measured).toBeCloseTo(0.001487202417418934, 14);
  expect.soft(row.check.deltaTotal).toBeCloseTo(sheets ? 0.021355272855737597 : 0.004461607252256802, 13);
  expect.soft(!!row.cracked).toBe(!!sheets);
  expect.soft(report.elements.filter(el => el.id.startsWith('rc-'))).toHaveLength(sheets ? 6 : 0);
  expect.soft(report.quantities.rebar.length > 0).toBe(!!sheets);
  expect.soft(ifc.bars).toHaveLength(sheets ? 213 : 0);
  expect.soft(writeIfc(ifc).match(/=IFCREINFORCINGBAR\(/g) ?? []).toHaveLength(sheets ? 213 : 0);
  expect.soft(ifc.members.some(member => member.props?.ReinforcementSheet)).toBe(!!sheets);
  expect.soft(Object.hasOwn(ifc.buildingProps ?? {}, 'ReinforcementMassKg')).toBe(!!sheets);
});

it('keeps the designed beam answer when an adoption is absent or ignored', async () => {
  const project = snapshot();
  const member = project.elements.find(([id]) => id === 4)![1];
  member.reinforcement = { regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }] } };
  const withSheets = (await reopen(project)).check.deltaTotal;
  delete project.designData!.rcSheets;
  const memberOnly = await reopen(project);
  expect(memberOnly.cracked).toBeDefined();
  expect(memberOnly.check.deltaTotal).toBeGreaterThan(memberOnly.measured * 3);
  if (sheets) expect(withSheets).toBeCloseTo(0.021355272855737597, 13);
  else expect(withSheets).toBe(memberOnly.check.deltaTotal);
});

it('supplies the ignored reinforcement notice in every dictionary', () => {
  const key = 'project.adoptedReinforcementIgnored';
  const translations = allShippedLocales().map(locale => allDictFor(locale)[key]);
  for (const value of translations) expect(value?.trim()).toBeTruthy();
  expect(new Set(translations).size).toBe(translations.length);
});

it('shows one project notice before solving and retains even stale adopted bars across a save', () => {
  const project = snapshot();
  const data = project.designData!;
  const stored = data.rcSheets!;
  stored.adoptedLogic = 1;
  const notice = () => render(AdoptedReinforcementNotice).body;
  modelStore.restore(project);
  expect(modelStore.snapshot().designData?.rcSheets?.adopted).toEqual(stored.adopted);
  expect(notice().split(t('project.adoptedReinforcementIgnored')).length - 1).toBe(sheets ? 0 : 1);
  expect(modelFeatures({ designData: data }).has('ignoredAdoptedReinforcement')).toBe(!sheets);
  stored.adopted = {};
  modelStore.restore(project);
  expect(notice()).not.toContain('role="status"');
  expect(modelFeatures({ designData: data }).has('ignoredAdoptedReinforcement')).toBe(false);
  modelStore.clear();
  expect(notice()).not.toContain('role="status"');
});

it.each([[], ['x'], ['y'], ['x', 'y']].map(axes => ({ axes: axes as ('x' | 'y')[] })))('exports sheet setting-out only in its build profile (axes $axes)', ({ axes: directions }) => {
  const project = snapshot();
  project.grid = { axes: directions.map(axis => ({ id: axis, name: axis, axis, at: 0 })), levels: [] };
  modelStore.restore(project);
  const input = projectIfcInput(key => key, 'en', 'columns');
  const columns = input.members.filter(member => member.kind === 'column');
  expect(columns).toHaveLength(3);
  for (const column of columns) {
    const properties = Object.fromEntries(Object.entries(column.props ?? {}).filter(([name]) => name.startsWith('FixedPoint')));
    expect.soft(properties).toEqual(sheets ? { FixedPoint: 'centre', FixedPointX: column.a[0], FixedPointY: column.a[1] } : {});
  }
  expect(input.members.filter(member => member.kind === 'beam')).toHaveLength(2);
  const step = exportProjectIfc(key => key, 'en', 'columns');
  expect.soft(step.match(/IFCPROPERTYSINGLEVALUE\('FixedPoint[XY]?'/g) ?? []).toHaveLength(sheets ? 9 : 0);
  expect.soft(step.includes('=IFCGRID(')).toBe(!!sheets && directions.length === 2);
});

it('identifies inactive placement rules before calculation, including legacy column points', () => {
  for (const [rules, active] of [
    [{ placement: { reference: 'slabTop' } }, true],
    [{ placement: { edges: true } }, true],
    [{ rcSheets: { fixedPoints: { '0,0': 'px' } } }, true],
    [{ placement: { columns: {} } }, false],
    [{ placement: { edges: false } }, false],
    [{}, false],
  ] as const) {
    const project = snapshot();
    project.designData = rules as ModelSnapshot['designData'];
    modelStore.restore(project);
    const expected = !sheets && active;
    expect(render(AdoptedReinforcementNotice).body.includes('data-testid="stored-placement-offsets"')).toBe(expected);
    expect([...modelFeatures({ designData: project.designData })].map(String).includes('inactivePlacementRules')).toBe(expected);
  }
});

it('keeps placement editing and specification navigation in the build that applies the rules', async () => {
  const { setColumnFixedPoint, setLevelReference, setEdgesFlush } = await import('../placement');
  const project = snapshot();
  project.designData = { version: 1, placement: { reference: 'axes' } };
  modelStore.restore(project);
  uiStore.specSection = 'members';
  uiStore.specSection = 'placement';
  expect.soft(uiStore.specSection).toBe(sheets ? 'placement' : 'members');
  setLevelReference('slabTop');
  setEdgesFlush(true);
  setColumnFixedPoint(null, 'px');
  const placement = modelStore.snapshot().designData?.placement;
  if (sheets) {
    expect(placement?.reference).toBe('slabTop');
    expect(placement?.edges).toBe(true);
    expect(Object.values(placement?.columns ?? {})).toContain('px');
  } else {
    expect(placement).toEqual(project.designData.placement);
    expect(modelStore.elements.get(4)?.offset).toBeUndefined();
  }
  uiStore.specSection = 'members';
});

it.skip.each(['deserializeProject', 'loadProject', 'loadFile'] as const)('known wrong result: #1928 saves inactive sheet options without interpreting them through %s', async opener => {
  const { deserializeProject, loadFile, loadProject, serializeProject } = await import('../file');
  const { designData, patchDesignData } = await import('../design-data');
  const options = { faces: true, criteria: { savedByLaterSheetEditor: 17 } };
  for (const legacy of [false, true]) {
    const file = JSON.parse(serializeProject());
    file.snapshot = snapshot();
    if (legacy) file.snapshot.designData.rcSheets = { ...file.snapshot.designData.rcSheets, ...options };
    else file.snapshot.designData.designOptions = options;
    const text = JSON.stringify(file);
    if (opener === 'deserializeProject') expect(deserializeProject(text)).toBe(true);
    else await (opener === 'loadFile' ? loadFile : loadProject)(new File([text], 'sheet-options.ded'));
    patchDesignData({ rebarGrade: 'saved across sheet profiles' });
    const persisted = JSON.parse(serializeProject()).snapshot.designData;
    expect.soft(persisted.designOptions).toEqual(sheets ? { faces: true } : options);
    expect.soft(designData().designOptions).toEqual(sheets ? { faces: true } : undefined);
    expect(persisted.rcSheets.adopted).toEqual(file.snapshot.designData.rcSheets.adopted);
    expect(persisted.rebarGrade).toBe('saved across sheet profiles');
  }
});
