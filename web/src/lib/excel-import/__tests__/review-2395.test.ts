import * as XLSX from 'xlsx';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore, uiStore } from '../../store';
import { buildSolverInput3D } from '../../engine/solver-service';
import { applyWorkbook, importExcelFile, type ImportOutcome } from '../apply';
import { parseWorkbook } from '../parse';
import { AXES_SHEET, SHEETS } from '../schema';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2395' ? it : it.skip;
const plane = { Nodes: [['id', 'x', 'z'], [1, 0, 0], [2, 4, 3]] };
const space = { Nodes: [['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, 4, 2, 3]] };
const geometries = [['2d', plane], ['3d', space], ['pro', space]] as const;
const originalMode = uiStore.analysisMode;
const originalSelfWeight = uiStore.includeSelfWeight;

afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.analysisMode = originalMode;
  uiStore.includeSelfWeight = originalSelfWeight;
});

async function importFile(sheets: Record<string, unknown[][]>) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return importExcelFile(new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'model.xlsx'));
}

function priorModel(mode: '2d' | '3d' | 'pro') {
  uiStore.analysisMode = mode;
  modelStore.clear();
  modelStore.addNode(17, 21);
  uiStore.includeSelfWeight = false;
  return modelStore.snapshot();
}

function expectRefusal(outcome: ImportOutcome | null, before: ReturnType<typeof priorModel>, problem: Record<string, unknown>) {
  const { loaded, model, problems } = outcome!;
  expect(problems, JSON.stringify({ loaded, supports: model.supports, analysis: model.analysis })).toEqual([
    expect.objectContaining({ ...problem, blocking: true }),
  ]);
  expect(loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
  expect(modelStore.snapshot()).toEqual(before);
  expect(uiStore.includeSelfWeight).toBe(false);
}

const divZero = { t: 'e', v: 0x07 };
const nullError = { t: 'e', v: 0x00 };

knownWrong('known wrong result: #2395 XLSX spring stiffness errors block model replacement', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  for (const [mode, nodes] of geometries) {
    const before = priorModel(mode);
    const workbook = (kx: unknown) => ({
      ...nodes, Supports: [['node', 'type', 'kx [kN/m]'], [], [1, mode === '2d' ? 'spring' : 'spring3d', kx]],
    });
    for (const cell of [divZero, { ...divZero, f: '1/0' }, nullError]) {
      expectRefusal(await importFile(workbook(cell)), before, { sheet: 'Supports', row: 3, column: 'C' });
    }
    for (const value of ['', 0, { t: 'n', v: 7, f: '3+4' }]) {
      const outcome = await importFile(workbook(value));
      expect(outcome?.problems).toEqual([]);
      expect(outcome?.loaded.nodes).toBe(2);
      expect([...modelStore.supports.values()][0]?.kx).toBe(value === '' ? undefined : typeof value === 'number' ? value : value.v);
    }
  }
});

knownWrong('known wrong result: #2395 XLSX rejects error cells anywhere on an imported sheet', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  for (const sheet of [...SHEETS.map(spec => spec.name), AXES_SHEET, 'LoadData', 'SelfWeight']) {
    const name = sheet === 'Nodes' ? sheet : ` ${sheet.toLowerCase()} `;
    const workbook = { ...plane, [name]: [...(sheet === 'Nodes' ? plane.Nodes : []), [], [divZero]] };
    expectRefusal(await importFile(workbook), priorModel('2d'), {
      sheet, row: sheet === 'Nodes' ? 5 : 2, column: 'A',
    });
  }
  const ordinary = await importFile({
    Nodes: [['id', 'x', 'z', 'name'], [1, 0, 0, '#DIV/0!']],
    Instrucciones: [[divZero]],
    Report: [[divZero]],
  });
  expect(ordinary?.problems).toEqual([]);
  expect(ordinary?.unknownSheets).toEqual(['Report']);
  expect(ordinary?.model.nodes).toEqual([{ id: 1, x: 0, y: 0, z: 0, name: '#DIV/0!' }]);
});

const flags = ['restrainedUx', 'restrainedUy', 'restrainedUz', 'restrainedRx', 'restrainedRy', 'restrainedRz'];
for (const [entry, install] of [['arrays', applyWorkbook], ['XLSX', importFile]] as const) {
  knownWrong(`known wrong result: #2395 ${entry} refuses restraint flags inconsistent with the support type`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    for (const [mode, nodes] of geometries) {
      const workbook = (column: string, flag: unknown) => ({
        ...nodes, Supports: [['node', 'type', column], [1, 'fixed', flag]],
      });
      const before = priorModel(mode);
      for (const column of [...flags.slice(5), ...flags.slice(0, 5)]) {
        for (const value of [0, false, 'no', 2, 'maybe']) {
          const book = workbook(column, value);
          const problem = { sheet: 'Supports', row: 2, column: column.toLowerCase(), blocking: true };
          expectRefusal(await install(book), before, problem);
          expect(parseWorkbook(book).problems).toEqual([expect.objectContaining(problem)]);
        }
      }
      for (const value of ['', 1, true, 'yes']) {
        const outcome = await install(workbook('restrainedRz', value));
        expect(outcome?.problems).toEqual([]);
        expect([...modelStore.supports.values()]).toEqual([{ id: 1, nodeId: 1, type: 'fixed' }]);
      }
    }
    const embedded = await install({
      Nodes: [['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, 4, 3, 0]],
      Supports: [['node', 'type', ...flags], [1, 'pinned', 1, 1, 1, 1, 0, 1]],
    });
    expect(embedded?.problems).toEqual([]);
    expect(embedded?.model.supports).toEqual([{ id: 1, nodeId: 1, type: 'pinned' }]);
  });

  knownWrong(`known wrong result: #2395 ${entry} preserves a complete spatial restraint override`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    const workbook = (type: string, ...mask: unknown[]) => ({
      ...space, Supports: [['node', 'type', ...flags, 'kry [kN·m/rad]'], [1, type, ...mask]],
    });
    for (const mode of ['3d', 'pro'] as const) {
      const before = priorModel(mode);
      for (const type of ['custom3d', 'rollerZ']) {
        for (const mask of [[1, 1, 1, 1, 0], [1, 1, 1, 1, 0, '']]) {
          expectRefusal(await install(workbook(type, ...mask)), before, { sheet: 'Supports', row: 2, column: 'type' });
        }
        const complete = await install(workbook(type, 1, 1, 1, 1, 0, 1, 7));
        expect(complete?.problems).toEqual([]);
        expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({
          type, dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true }, kry: 7,
        })]);
        expect(buildSolverInput3D(modelStore.model, false)?.supports.get(1)).toMatchObject({
          rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true, kry: 7,
        });
        expect(priorModel(mode)).toEqual(before);
      }
    }
    const before = priorModel('2d');
    expectRefusal(await install({ ...workbook('custom3d', 1, 1, 1, 1, 0, 1), ...plane }), before, {
      sheet: 'Supports', row: 2, column: 'type',
    });

    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    priorModel('3d');
    const framed = await install({
      ...workbook('custom3d', 1, 0, 0, 0, 0, 1),
      Axes: [['up', 'right', 'hand'], ['+Y', '+X', 'right']],
    });
    expect(framed?.problems).toEqual([]);
    expect(framed?.model.supports).toEqual([expect.objectContaining({
      dofRestraints: { tx: true, ty: false, tz: false, rx: false, ry: true, rz: false },
    })]);
  });

  knownWrong(`known wrong result: #2395 ${entry} rejects a unit suffix on a dimensionless SelfWeight factor`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    for (const [mode, nodes] of geometries) {
      const before = priorModel(mode);
      const workbook = (header: string, factor: number, source = 'case') => ({
        ...nodes, SelfWeight: [['source', 'case', 'direction', header, 'scope'], [source, source === 'case' ? 1 : '', 'Z', factor, 'all']],
      });
      for (const [header, value, source] of [['factor [%]', 10, 'case'], ['factor [1]', 0, 'case'], ['FACTOR [ ]', -1, 'single'], ['factor [%', -1, 'single']] as const) {
        const book = workbook(header, value, source);
        const problem = { sheet: 'SelfWeight', row: 1, column: 'factor', blocking: true };
        expectRefusal(await install(book), before, problem);
        expect(parseWorkbook(book).problems).toEqual([expect.objectContaining(problem)]);
      }
      for (const value of [10, 0, -2]) {
        const outcome = await install(workbook(' FACTOR ', value));
        expect(outcome?.problems).toEqual([]);
        expect(outcome?.model.analysis?.selfWeight).toEqual([{ caseId: 1, direction: 'Z', factor: value }]);
        expect(outcome?.loaded.nodes).toBe(2);
      }
      const standalone = await install(workbook('factor', -1, 'single'));
      expect(standalone?.problems).toEqual([]);
      expect(standalone?.model.analysis?.standaloneSelfWeight).toBe('gravity');
      expect(uiStore.includeSelfWeight).toBe(true);
    }
  });
}
