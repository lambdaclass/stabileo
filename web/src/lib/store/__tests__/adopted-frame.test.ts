import { afterEach, beforeAll, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { allDictFor, allShippedLocales } from '../../i18n/locales/all';
import en from '../../i18n/locales/en';
import { writeIfc } from '../../ifc/ifc-writer';
import { publishCombinations3D } from '../active-results';
import type { ModelSnapshot } from '../history.svelte';
import { projectIfcInput } from '../ifc-export';
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

function reopen(project: ModelSnapshot) {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  modelStore.restore(project);
  const solved = modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw Error(String(solved));
  publishCombinations3D(solved);
  return deflectionChecks([4]).rows.get(4)!;
}

const sheets = __PUBLIC_FEATURES__.proRcSheets;

it.skip('known wrong result: adopted reinforcement — uses the build profile for the saved beam, report schedule and IFC bars', () => {
  const row = reopen(snapshot());
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

it.skip('known wrong result: adopted reinforcement — keeps the designed beam answer when an adoption is absent or ignored', () => {
  const project = snapshot();
  const member = project.elements.find(([id]) => id === 4)![1];
  member.reinforcement = { regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }] } } as typeof member.reinforcement;
  const withSheets = reopen(project).check.deltaTotal;
  delete project.designData!.rcSheets;
  const memberOnly = reopen(project);
  expect(memberOnly.cracked).toBeDefined();
  expect(memberOnly.check.deltaTotal).toBeGreaterThan(memberOnly.measured * 3);
  if (sheets) expect(withSheets).toBeCloseTo(0.021355272855737597, 13);
  else expect(withSheets).toBe(memberOnly.check.deltaTotal);
});

it.skip('known wrong result: adopted reinforcement — supplies the ignored reinforcement notice in every dictionary', () => {
  const key = 'project.adoptedReinforcementIgnored';
  const translations = allShippedLocales().map(locale => allDictFor(locale)[key]);
  for (const value of translations) expect(value?.trim()).toBeTruthy();
  expect(new Set(translations).size).toBe(translations.length);
});
