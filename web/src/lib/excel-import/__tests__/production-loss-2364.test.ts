import * as XLSX from 'xlsx';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore, uiStore } from '../../store';
import { applyWorkbook, importExcelFile } from '../apply';
import { parseWorkbook } from '../parse';

const regression = process.env.RUN_KNOWN_WRONG === '2364' ? it : it.skip;
const axes = { Axes: [['up', 'right', 'hand'], ['+Z', '+X', 'right']] };
const plane = { Nodes: [['id', 'x', 'z'], [1, 2, 3]] };
const space = { Nodes: [['id', 'x', 'y', 'z'], [1, 2, 3, 4]] };
const cases = { LoadCases: [['id', 'name', 'type'], [1, 'Dead', 'D']] };
const types = [
  { workspace: '2d', geometry: plane, loadType: 'nodal', support: 'fixed' },
  { workspace: '3d', geometry: space, loadType: 'nodal3d', support: 'fixed3d' },
  { workspace: 'pro', geometry: space, loadType: 'nodal3d', support: 'fixed3d' },
] as const;
const originalMode = uiStore.analysisMode;

beforeEach(() => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.analysisMode = originalMode;
});

function priorModel(workspace: typeof types[number]['workspace']) {
  uiStore.analysisMode = workspace;
  modelStore.clear();
  modelStore.addNode(17, 21);
  return modelStore.snapshot();
}

async function importFile(sheets: Record<string, unknown[][]>) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return importExcelFile(new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'model.xlsx'));
}

for (const [entry, install] of [['sheet arrays', applyWorkbook], ['XLSX file', importFile]] as const) {
  regression.each(types)(`known wrong result: #2364 ${entry} blocks malformed declared $workspace load components`, async ({ workspace, geometry, loadType }) => {
    const before = priorModel(workspace);
    const workbook = (header: string, value: unknown) => ({
      ...geometry, ...axes, ...cases,
      Loads: [['type', 'case', 'node', 'fx', header], [loadType, 1, 1, 2, value]],
    });
    for (const [header, invalid, row] of [['fz', 'bad', 2], ['fz [m]', -3, 1]] as const) {
      const sheets = workbook(header, invalid);
      const expected = [expect.objectContaining({ sheet: 'Loads', row, column: 'fz', blocking: true })];
      const out = await install(sheets);
      expect(out?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
      expect(out?.problems).toEqual(expected);
      expect(modelStore.snapshot()).toEqual(before);
      expect(parseWorkbook(sheets).problems).toEqual(expected);
    }
    for (const [value, expected] of [['', 0], [0, 0], [-3000, -3], [3000, 3]] as const) {
      const out = await install(workbook('fz [N]', value));
      expect(out?.problems).toEqual([]);
      expect(out?.loaded.nodes).toBe(1);
      expect(modelStore.loads).toEqual([{ type: loadType, data: expect.objectContaining({ fx: 2, fz: expected }) }]);
    }
  });

  regression.each(types)(`known wrong result: #2364 ${entry} rejects duplicate physical load headers for $workspace`, async ({ workspace, geometry, loadType }) => {
    const before = priorModel(workspace);
    const workbook = (...components: [string, number][]) => ({
      ...geometry, ...axes, ...cases,
      Loads: [['type', 'case', 'node', 'fz', ...components.map(([header]) => header)], [loadType, 1, 1, -3, ...components.map(([, value]) => value)]],
    });
    const duplicate = workbook(['fy', 5], [' FY [N] ', 0]);
    const out = await install(duplicate);
    expect(out?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
    expect(out?.problems).toEqual([expect.objectContaining({ sheet: 'Loads', row: 1, column: 'fy', blocking: true })]);
    expect(modelStore.snapshot()).toEqual(before);
    expect(parseWorkbook(duplicate).model.loads).toEqual([]);

    const fy = workspace === '2d' ? 0 : 5;
    const accepted = await install(workbook([' FY [N] ', fy * 1000]));
    expect(accepted?.problems).toEqual([]);
    expect(accepted?.loaded.nodes).toBe(1);
    expect(modelStore.loads).toEqual([{ type: loadType, data: expect.objectContaining({ fy, fz: -3 }) }]);
  });

  regression.each(types)(`known wrong result: #2364 ${entry} rejects duplicate prescribed rotation headers for $workspace`, async ({ workspace, geometry, support }) => {
    const before = priorModel(workspace);
    for (const declaration of [{}, axes]) {
      const duplicate = {
        ...geometry, ...declaration,
        Supports: [['node', 'type', 'dry [deg]', ' DRY [rad] '], [1, support, -180, 0]],
      };
      const out = await install(duplicate);
      expect(out?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
      expect(out?.problems).toEqual([expect.objectContaining({ sheet: 'Supports', row: 1, column: 'dry', blocking: true })]);
      expect(modelStore.snapshot()).toEqual(before);
      expect(parseWorkbook(duplicate).model.supports).toEqual([]);

      const accepted = await install({ ...geometry, ...declaration, Supports: [['node', 'type', 'dry [deg]'], [1, support, -180]] });
      expect(accepted?.problems).toEqual([]);
      expect(accepted?.loaded.nodes).toBe(1);
      expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({ dry: -Math.PI })]);
      priorModel(workspace);
    }
  });

  const loadSheets = [
    ['LoadData', [['load', 'case', 'type', 'node', 'member', 'shell', 'field', 'value', 'unit'], [1, 1, 'nodal', 1, '', '', 'fz', -3, 'kN']]],
    ['SelfWeight', [['source', 'case', 'direction', 'factor', 'scope'], ['case', 1, 'Z', -2, 'all']]],
  ] as const;
  for (const [sheet, data] of loadSheets) {
    regression.each(types)(`known wrong result: #2364 ${entry} refuses shadowed ${sheet} in $workspace`, async ({ workspace, geometry }) => {
      const before = priorModel(workspace);
      const rows = data.map(row => [...row]);
      const headerOnly = rows.slice(0, 1);
      const alias = ' ' + sheet.toLowerCase() + ' ';
      for (const sheets of [
        { [sheet]: headerOnly, [alias]: rows },
        { [alias]: headerOnly, [sheet]: rows },
        { [sheet]: rows, [alias]: headerOnly },
        { [sheet]: headerOnly, [alias]: headerOnly },
      ]) {
        const workbook = { ...geometry, ...cases, ...sheets };
        const out = await install(workbook);
        expect(out?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
        expect(out?.problems).toEqual([expect.objectContaining({ sheet, row: 1, blocking: true })]);
        expect(modelStore.snapshot()).toEqual(before);
        expect(parseWorkbook(workbook).model.nodes).toEqual([]);
      }

      const base = { ...geometry, ...cases };
      const disabled = await install({ ...base, [alias]: rows });
      expect(disabled?.loaded.nodes).toBe(0);
      expect(disabled?.problems).toEqual([expect.objectContaining({ sheet, row: 2 })]);
      expect(modelStore.snapshot()).toEqual(before);

      const accepted = await install({ ...base, [alias]: headerOnly });
      expect(accepted?.problems).toEqual([]);
      expect(accepted?.loaded.nodes).toBe(1);
    });
  }
}
