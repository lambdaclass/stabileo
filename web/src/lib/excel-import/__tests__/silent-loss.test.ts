import * as XLSX from 'xlsx';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore, uiStore } from '../../store';
import { modelSheets } from '../../export/workbook-model';
import { applyWorkbook, importExcelFile, type ImportOutcome } from '../apply';
import { parseWorkbook } from '../parse';
import { SHEETS, headerFor } from '../schema';

const issue2370 = process.env.RUN_KNOWN_WRONG === '2370' ? it : it.skip;
const issue2383 = process.env.RUN_KNOWN_WRONG === '2383' ? it : it.skip;

const plane = { Nodes: [['id', 'x', 'z'], [1, 0, 0], [2, 4, 3]] };
const space = { Nodes: [['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, 4, 2, 3]] };
const axes = { Axes: [['up', 'right', 'hand'], ['+Z', '+X', 'right']] };
const member = {
  Materials: [['id', 'name', 'E [MPa]', 'nu'], [1, 'Material', 200000, 0.3]],
  Sections: [['id', 'name', 'b [m]', 'h [m]'], [1, 'Section', 0.2, 0.4]],
  Members: [['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1]],
};
const originalMode = uiStore.analysisMode;

afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.analysisMode = originalMode;
});

async function importFile(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return importExcelFile(new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'model.xlsx'));
}

function priorModel(mode: '2d' | '3d' | 'pro') {
  uiStore.analysisMode = mode;
  modelStore.clear();
  modelStore.addNode(17, 21);
  return modelStore.snapshot();
}

function expectRefusal(outcome: ImportOutcome | null, before: ReturnType<typeof priorModel>, sheet: string, column?: string) {
  expect(outcome?.problems, JSON.stringify(outcome?.model)).toContainEqual(expect.objectContaining({
    sheet, blocking: true, ...(column ? { column } : {}),
  }));
  expect(outcome?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
  expect(modelStore.snapshot()).toEqual(before);
}

for (const [entry, install] of [['arrays', applyWorkbook], ['XLSX', importFile]] as const) {
  issue2370(`known wrong result: #2370 ${entry} refuses shadowed Loads before reading model rows`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    for (const [mode, geometry, type] of [['2d', plane, 'nodal'], ['3d', space, 'nodal3d'], ['pro', space, 'nodal3d']] as const) {
      const before = priorModel(mode);
      const header = ['type', 'case', 'node', 'fz'];
      const row = [type, 1, 2, -3];
      const alias = { ' loads ': [header, row] };
      const workbook = { ...geometry, ...member, Loads: [header], ...alias };
      expectRefusal(await install(workbook), before, 'Loads');
      expect(parseWorkbook(workbook).model.nodes).toEqual([]);
      const accepted = await install({ ...geometry, ...member, ...alias });
      expect(accepted?.problems).toEqual([]);
      expect(modelStore.loads).toEqual([{ type, data: expect.objectContaining({ fz: -3 }) }]);
    }
  });

  issue2370(`known wrong result: #2370 ${entry} blocks duplicate coordinate headers before inferring the dimension`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    for (const mode of ['3d', 'pro'] as const) {
      for (const declaration of [{}, axes]) {
        const before = priorModel(mode);
        const workbook = { ...declaration, Nodes: [['id', 'x [m]', 'y [m]', 'z [m]', ' Y [m] '], [1, 4, 2, 3, '']] };
        expectRefusal(await install(workbook), before, 'Nodes', 'y');
        expect(parseWorkbook(workbook).model.nodes).toEqual([]);
        const accepted = await install({ ...declaration, Nodes: [['id', 'x [m]', 'y [m]', 'z [m]'], [1, 4, 2, 3]] });
        expect(accepted?.problems).toEqual([]);
        expect(accepted?.model.nodes).toEqual([{ id: 1, x: 4, y: 2, z: 3 }]);
      }
    }
  });

  issue2370(`known wrong result: #2370 ${entry} blocks incompatible coordinate units before inferring the dimension`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    for (const mode of ['3d', '2d', 'pro'] as const) {
      for (const declaration of [axes, {}]) {
        const before = priorModel(mode);
        const coordinate = mode === '2d' ? '' : 2000;
        const workbook = (unit: string) => ({ ...declaration, Nodes: [['id', 'x [m]', `y [${unit}]`, 'z [m]'], [1, 4, coordinate, 3]] });
        expectRefusal(await install(workbook('s')), before, 'Nodes', 'y');
        expect(parseWorkbook(workbook('s')).model.nodes).toEqual([]);
        const accepted = await install(workbook('mm'));
        expect(accepted?.problems).toEqual([]);
        expect(accepted?.model.nodes).toEqual([{ id: 1, x: 4, y: mode === '2d' ? 3 : 2, z: mode === '2d' ? 0 : 3 }]);
      }
    }
  });

  issue2370(`known wrong result: #2370 ${entry} refuses duplicate gravity factors`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    for (const [mode, geometry] of [['2d', plane], ['3d', space], ['pro', space]] as const) {
      const before = priorModel(mode);
      const header = ['source', 'case', 'direction', 'factor', 'scope'];
      const row = ['case', 1, 'Z', -2, 'all'];
      const workbook = { ...geometry, SelfWeight: [[...header, ' FACTOR '], [...row, 0]] };
      expectRefusal(await install(workbook), before, 'SelfWeight', 'factor');
      const accepted = await install({ ...geometry, SelfWeight: [header, row] });
      expect(accepted?.problems).toEqual([]);
      expect(accepted?.model.analysis?.selfWeight).toEqual([{ caseId: 1, direction: 'Z', factor: -2 }]);
    }
  });

  issue2370(`known wrong result: #2370 ${entry} refuses unsupported member point load fields and direction`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    for (const [mode, geometry] of [['2d', plane], ['3d', space], ['pro', space]] as const) {
      for (const declaration of [{}, axes]) {
        const before = priorModel(mode);
        const header = ['type', 'case', 'member', 'p', 'a', 'dir', 'angle', 'px'];
        const row = ['pointOnElement', 1, 1, -7, 2];
        const workbook = (...fields: unknown[]) => ({
          ...geometry, ...member, ...declaration, Loads: [header, [...row, ...fields]],
        });
        for (const [dir, angle, px, columns] of [
          ['global', 23, 5, ['dir', 'angle', 'px']],
          ['global', '', '', ['dir']],
          ['projected', '', '', ['dir']],
          ['local', 0, '', ['angle']],
          ['', '', 0, ['px']],
        ] as const) {
          const out = await install(workbook(dir, angle, px));
          for (const column of columns) expectRefusal(out, before, 'Loads', column);
        }
        const accepted = await install(workbook(' LOCAL ', '', ''));
        expect(accepted?.problems.some(p => p.blocking)).toBe(false);
        expect(modelStore.loads).toEqual([{ type: 'pointOnElement', data: expect.objectContaining({ p: -7, a: 2 }) }]);
      }
    }
  });

  issue2370(`known wrong result: #2370 ${entry} refuses incompatible plane nodal couples`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    const before = priorModel('2d');
    const workbook = (type: string, mx: unknown, my: unknown, mz: unknown) => ({
      ...(type === 'nodal' ? plane : space),
      Loads: [['type', 'case', 'node', 'fz', 'mx', 'my', 'mz'], [type, 1, 2, -3, mx, my, mz]],
    });
    for (const [mx, my, column] of [[2, 0, 'mx'], [0, -2, 'my'], [-2, 0, 'mx'], [0, 2, 'my']] as const) {
      expectRefusal(await install(workbook('nodal', mx, my, 7)), before, 'Loads', column);
    }
    for (const zero of [0, '']) {
      const out = await install(workbook('nodal', zero, zero, 7));
      expect(out?.problems).toEqual([]);
      expect(modelStore.loads).toEqual([{ type: 'nodal', data: expect.objectContaining({ fz: -3, my: 7 }) }]);
    }
    priorModel('3d');
    expect((await install(workbook('nodal3d', 2, -2, 7)))?.problems).toEqual([]);
    expect(modelStore.loads).toEqual([{ type: 'nodal3d', data: expect.objectContaining({ mx: 2, my: -2, mz: 7 }) }]);
  });

  issue2383(`known wrong result: #2383 ${entry} round trips planar springs in rotational units and keeps legacy files readable`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    priorModel('2d');
    modelStore.clear();
    const node = modelStore.addNode(2, 3);
    modelStore.addSupport(node, 'spring', { kx: 13, ky: 17, kz: 7 });
    const exported = Object.fromEntries(modelSheets({ ...modelStore.model, analysisMode: '2d' }, null).map(s => [s.name, s.rows]));
    const [headers, row] = exported.Supports!;
    expect(row?.[headers!.indexOf('kry [kN·m/rad]')]).toBe(7);
    expect(row?.[headers!.indexOf('kz [kN/m]')]).toBe('');
    const spring = expect.objectContaining({ type: 'spring', kx: 13, ky: 17, kz: 7 });
    const roundTrip = await install(exported);
    expect(roundTrip?.loaded.nodes).toBe(1);
    expect([...modelStore.supports.values()]).toEqual([spring]);

    const legacy = {
      Nodes: [['id', 'x [m]', 'y [m]', 'z [m]'], [1, 2, 3, 0]],
      Supports: [['node', 'type', 'kx [kN/m]', 'ky [kN/m]', 'kz [kN/m]'], [1, 'spring', 13, 17, 7]],
    };
    expect((await install(legacy))?.problems).toEqual([]);
    expect([...modelStore.supports.values()]).toEqual([spring]);

    const spatial = {
      ...space,
      Supports: [['node', 'type', 'kz [kN/m]', 'kry [kN·m/rad]'], [1, 'spring3d', 17, 7]],
    };
    priorModel('3d');
    expect((await install(spatial))?.problems).toEqual([]);
    expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({ kz: 17, kry: 7 })]);
  });
}

const template: Record<string, unknown[][]> = Object.fromEntries(SHEETS.map(s => [s.name, [s.columns.map(headerFor), ...s.examples]]));
const weight = [['source', 'case', 'direction', 'factor', 'scope'], ['case', 1, 'Z', -2, 'all']];
const loadData = [
  ['load', 'case', 'type', 'node', 'member', 'shell', 'field', 'value', 'unit'],
  [1, 1, 'nodal', 2, '', '', 'fx', 2, 'kN'],
  [1, 1, 'nodal', 2, '', '', 'fz', -3, 'kN'],
  [1, 1, 'nodal', 2, '', '', 'my', 0, 'kN·m'],
];

for (const [sheet, rows] of Object.entries({ ...template, ...axes, SelfWeight: weight, LoadData: loadData })) {
  const base = sheet === 'Axes' || sheet === 'LoadData' ? plane : template;
  const replace = (data: unknown[][]) => ({ ...base, [sheet]: data });
  const [header, ...body] = rows;
  issue2370(`known wrong result: #2370 ${sheet} blocks duplicate headers`, () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    expect(parseWorkbook(replace(rows)).problems).toEqual([]);
    expect(parseWorkbook(replace([[...header!, ` ${String(header![0]).toUpperCase()} `], ...body])).problems)
      .toContainEqual(expect.objectContaining({ sheet, row: 1, blocking: true }));
  });

  issue2370(`known wrong result: #2370 ${sheet} blocks unknown populated columns`, () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    expect(parseWorkbook(replace(rows)).problems).toEqual([]);
    for (const value of [0, false, 'data']) {
      const extra = [[...header!, 'extra field'], ...body.map((row, index) => index === 0 ? [...row, value] : row)];
      expect(parseWorkbook(replace(extra)).problems)
        .toContainEqual(expect.objectContaining({ sheet, column: 'extra field', blocking: true }));
    }
    const unnamed = [header!, ...body.map((row, index) => index === 0 ? [...row, 0] : row)];
    expect(parseWorkbook(replace(unnamed)).problems)
      .toContainEqual(expect.objectContaining({ sheet, blocking: true }));
  });
}
