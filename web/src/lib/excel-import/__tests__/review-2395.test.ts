import * as XLSX from 'xlsx';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore, uiStore } from '../../store';
import { buildSolverInput2D, buildSolverInput3D } from '../../engine/solver-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { modelSheets } from '../../export/workbook-model';
import { projectWorkbookSheets } from '../../export/project-workbook';
import { t, tp } from '../../i18n';
import { applyWorkbook, importExcelFile, type ImportOutcome } from '../apply';
import { parseWorkbook } from '../parse';
import { AXES_SHEET, SHEETS } from '../schema';

const plane = { Nodes: [['id', 'x', 'z'], [1, 0, 0], [2, 4, 3]] };
const space = { Nodes: [['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, 4, 2, 3]] };
const geometries = [['2d', plane], ['3d', space], ['pro', space]] as const;
const member = {
  Materials: [['id', 'name', 'E [MPa]', 'nu'], [1, 'Material', 200000, 0.3]],
  Sections: [['id', 'name'], [1, 'IPE 300']],
  Members: [['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1]],
  Loads: [['type', 'case', 'node', 'fz'], ['nodal3d', 1, 2, -3]],
};
const originalMode = uiStore.analysisMode;
const originalSelfWeight = uiStore.includeSelfWeight;

afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.analysisMode = originalMode;
  uiStore.includeSelfWeight = originalSelfWeight;
});

async function importFile(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'biff8' = 'xlsx') {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const filename = bookType === 'xlsx' ? 'model.xlsx' : 'model.xls';
  return importExcelFile(new File([XLSX.write(book, { type: 'array', bookType })], filename));
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

function responses(input: NonNullable<ReturnType<typeof buildSolverInput3D>>) {
  const linear = solve3D(input);
  const pDelta = solvePDelta3D(input);
  expect(linear.displacements).toHaveLength(2);
  expect(pDelta.converged).toBe(true);
  expect(pDelta.results.displacements).toHaveLength(2);
  return [linear, pDelta.results].map(({ displacements, reactions, elementForces }) => ({ displacements, reactions, elementForces }));
}

const divZero = { t: 'e', v: 0x07 };
const nullError = { t: 'e', v: 0x00 };

it('#2395 XLSX spring stiffness errors block model replacement', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  for (const [mode, nodes] of geometries) {
    const workbook = (kx: unknown) => ({
      ...nodes, Supports: [['node', 'type', 'kx [kN/m]'], [], [1, mode === '2d' ? 'spring' : 'spring3d', kx]],
    });
    for (const bookType of ['xlsx', 'biff8'] as const) {
      const before = priorModel(mode);
      for (const cell of [divZero, { ...divZero, f: '1/0' }, nullError]) {
        expectRefusal(await importFile(workbook(cell), bookType), before, { sheet: 'Supports', row: 3, column: 'C' });
      }
      for (const [cell, stiffness] of [['', undefined], [0, 0], [{ t: 'n', v: 7, f: '3+4' }, 7]] as const) {
        const outcome = await importFile(workbook(cell), bookType);
        expect(outcome?.problems).toEqual([]);
        expect(outcome?.loaded.nodes).toBe(2);
        expect([...modelStore.supports.values()][0]?.kx).toBe(stiffness);
      }
    }
  }
});

it('#2395 XLSX rejects error cells anywhere on an imported sheet', async () => {
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
const entries = [
  ['arrays', applyWorkbook],
  ['XLSX', importFile],
  ['XLS', (book: Record<string, unknown[][]>) => importFile(book, 'biff8')],
] as const;
for (const [entry, install] of entries) {
  it(`#2395 ${entry} refuses restraint flags inconsistent with the support type`, async () => {
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

  it(`#2395 ${entry} preserves a complete spatial restraint override`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    const workbook = (type: string, ...mask: unknown[]) => ({
      ...space, Supports: [['node', 'type', ...flags, 'kry [kN·m/rad]'], [1, type, ...mask]],
    });
    for (const mode of ['3d', 'pro'] as const) {
      for (const type of ['custom3d', 'rollerZ']) {
        const before = priorModel(mode);
        for (const mask of [[1, 1, 1, 1, 0], [1, 1, 1, 1, 0, '']]) {
          expectRefusal(await install(workbook(type, ...mask)), before, { sheet: 'Supports', row: 2, column: 'type' });
        }
        const book = { ...workbook(type, 1, 1, 1, 1, 0, 1, 7), ...member };
        const complete = await install(book);
        expect(complete?.problems).toEqual([]);
        expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({
          type, dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true }, kry: 7,
        })]);
        const input = buildSolverInput3D(modelStore.model, false)!;
        expect(input.supports.get(1)).toMatchObject({
          rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true, kry: 7,
        });
        const [supports] = modelSheets(modelStore.model, input, name => name === 'Supports');
        const roundTrip = await install({ ...book, Supports: supports!.rows });
        expect(roundTrip?.problems).toEqual([]);
        const reimported = buildSolverInput3D(modelStore.model, false)!;
        expect(reimported.supports).toEqual(input.supports);
        expect(responses(reimported)).toEqual(responses(input));
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

  it(`#2395 ${entry} rejects a unit suffix on a dimensionless SelfWeight factor`, async () => {
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

const declared = { Axes: [['up', 'right', 'hand'], ['+Z', '+X', 'right']] };

for (const [entry, install] of entries) {
  for (const [mode, nodes] of geometries) {
    it(`#2395 ${entry} ${mode} requires complete recognized coordinate units`, async () => {
      for (const framed of [false, true]) {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(framed ? 'development' : 'production'));
        for (const [index, axis] of nodes.Nodes[0]!.entries()) {
          if (typeof axis !== 'string' || axis === 'id') continue;
          const workbook = (header: string, coordinate: number) => {
            const rows = nodes.Nodes.map(row => [...row]);
            rows[0]![index] = header;
            rows[2]![index] = coordinate;
            return { ...(framed ? declared : {}), Nodes: rows };
          };
          const before = priorModel(mode);
          for (const suffix of [' [mm', ' []', ' [ ]', ' [[mm]', ' [mm] note', ' [mm] [m]', ' [s]']) {
            const book = workbook(axis + suffix, 4000);
            const problem = { sheet: 'Nodes', row: 1, column: axis, blocking: true };
            expectRefusal(await install(book), before, problem);
            expect(parseWorkbook(book).problems).toEqual([expect.objectContaining(problem)]);
          }
          for (const [header, coordinate] of [[axis, 4], [axis + ' [m]', 4], [' ' + axis.toUpperCase() + ' [ mm ] ', 4000]] as const) {
            const book = workbook(header, coordinate);
            const outcome = await install(book);
            const modelAxis = mode === '2d' && axis === 'z' ? 'y' : axis;
            expect(outcome?.problems).toEqual([]);
            expect(outcome?.loaded.nodes).toBe(2);
            expect(outcome?.model.nodes[1]).toMatchObject({ [modelAxis]: 4 });
          }
        }
      }
    });

    it(`#2395 ${entry} ${mode} refuses populated fields belonging to another load type`, async () => {
      for (const framed of [false, true]) {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(framed ? 'development' : 'production'));
        const valid = [
          { type: 'nodal', node: 2, fz: -3 },
          ...(mode === '2d' ? [] : [
            { type: 'nodal3d', node: 2, fz: -3 },
            { type: 'distributed3d', member: 1, qi: -3, qzi: -2, ...(framed ? { qxi: -1 } : {}) },
          ]),
          { type: 'distributed', member: 1, qi: -3, dir: 'global', ...(framed ? { angle: 12 } : {}) },
          { type: 'pointOnElement', member: 1, p: -3, a: 2, dir: 'local', ...(framed ? { angle: 12, px: -1 } : {}) },
          { type: 'thermal', member: 1, dt: 3, dtg: 0 },
        ];
        const headers = ['type', 'case', ...new Set(valid.flatMap(row => Object.keys(row).filter(key => key !== 'type')))];
        const workbook = (rows: Array<Record<string, unknown>>) => ({
          ...nodes, ...member, ...(framed ? declared : {}),
          Loads: [headers, ...rows.map(row => headers.map(key => key === 'case' ? 1 : row[key] ?? ''))],
        });
        for (const row of valid) {
          const column = row.type.startsWith('nodal') ? 'p' : row.type === 'pointOnElement' ? 'dt' : 'node';
          const before = priorModel(mode);
          for (const value of [-7, 0, false]) {
            const book = workbook([{ ...row, [column]: value }]);
            const message = framed && value === false && column !== 'node'
              ? t('xls.err.notANumber') : tp('xls.err.populatedColumn', { k: column });
            const problem = { sheet: 'Loads', row: 2, column, blocking: true, message };
            expectRefusal(await install(book), before, problem);
            expect(parseWorkbook(book).problems).toEqual([problem]);
          }
        }
        const outcome = await install(workbook(valid));
        expect(outcome?.problems).toEqual([]);
        expect(outcome?.loaded).toEqual({ nodes: 2, elements: 1, sections: 2 });
        expect(outcome?.model.loads).toMatchObject([
          { type: 'nodal', data: { nodeId: 2, fz: -3 } },
          ...(mode === '2d' ? [] : [
            { type: 'nodal3d', data: { nodeId: 2, fz: -3 } },
            { type: 'distributed3d', data: { elementId: 1, qYI: -3, qZI: -2, ...(framed ? { qXI: -1 } : {}) } },
          ]),
          { type: 'distributed', data: { elementId: 1, qI: -3, isGlobal: true, ...(framed ? { angle: 12 } : {}) } },
          { type: 'pointOnElement', data: { elementId: 1, p: -3, a: 2, ...(framed ? { angle: 12, px: -1 } : {}) } },
          { type: 'thermal', data: { elementId: 1, dtUniform: 3, dtGradient: 0 } },
        ]);
        expect(modelStore.loads.map(load => load.type)).toEqual(valid.map(row => row.type));
      }
    });
  }

  for (const mode of ['3d', 'pro'] as const) {
    for (const [axes, mask] of [
      [null, [1, 0, 1, 1, 0, 1]],
      [{ up: '+Y', right: '+X', hand: 'left' }, [1, 1, 0, 1, 1, 0]],
    ] as const) {
      it(`#2395 ${entry} ${mode} round trips unsolved restraints with ${axes ? 'permuted' : 'default'} axes`, async () => {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
        for (const type of ['custom3d', 'rollerZ']) {
          priorModel(mode);
          const original = await install({
            ...space, ...member,
            Supports: [['node', 'type', ...flags, 'ky [kN/m]', 'kry [kN·m/rad]'], [1, type, 1, 0, 1, 1, 0, 1, 7, 7]],
          });
          expect(original?.problems).toEqual([]);
          expect(original?.loaded).toEqual({ nodes: 2, elements: 1, sections: 2 });
          const input = buildSolverInput3D(modelStore.model, false)!;
          const model = { ...modelStore.model, analysisMode: mode };
          const sheets = projectWorkbookSheets({
            model,
            solved: null, axes, projectName: 'Spatial restraint round trip', tr: key => key,
            meta: { exported: '', commit: '' }, results: { sources: [], stations: 2, statics: null },
            include: { results: false, sheets: new Set(['Nodes', 'Members', 'Materials', 'Sections', 'Supports', 'LoadData']) },
          });
          const book = Object.fromEntries(sheets.map(sheet => [sheet.name, sheet.rows]));
          const flagsIn = ([header, support]: unknown[][]) => flags.map(flag => support![header!.indexOf(flag)]);
          expect(flagsIn(book.Supports!)).toEqual(mask);
          const solvedSupportSheet = modelSheets(model, input, name => name === 'Supports', axes).find(sheet => sheet.name === 'Supports')!;
          expect(flagsIn(solvedSupportSheet.rows)).toEqual(mask);

          const support = [...model.supports.values()][0]!;
          const localModel = { ...model, supports: new Map([[support.id, { ...support, dofFrame: 'local' as const }]]) };
          const localSheets = modelSheets(localModel, null, name => name === 'Supports', axes);
          const localSupports = localSheets.find(sheet => sheet.name === 'Supports')!.rows;
          expect(flagsIn(localSupports)).toEqual(['', '', '', '', '', '']);
          expectRefusal(await install({ ...book, Supports: localSupports }), modelStore.snapshot(), {
            sheet: 'Supports', row: 2, column: 'type',
          });

          const outcome = await install(book);
          expect(outcome?.problems).toEqual([]);
          expect(outcome?.loaded).toEqual(original?.loaded);
          expect(outcome?.model.supports).toEqual(original?.model.supports);
          const reimported = buildSolverInput3D(modelStore.model, false)!;
          expect(reimported.supports).toEqual(input.supports);
          expect(responses(reimported)).toEqual(responses(input));
        }
      });
    }
  }
}

const cyclicAxes = { up: '+Y', right: '+Z', hand: 'right' } as const;

function planeResponses(input: NonNullable<ReturnType<typeof buildSolverInput2D>>) {
  const linear = solve(input);
  const pDelta = solvePDelta(input);
  expect(linear.displacements).toHaveLength(2);
  expect(pDelta.converged).toBe(true);
  expect(pDelta.results.displacements).toHaveLength(2);
  return [linear, pDelta.results].map(({ displacements, reactions, elementForces }) => ({ displacements, reactions, elementForces }));
}

for (const [entry, install] of entries) {
  it(`#2395 ${entry} exports planar restraint triplets in workbook axes`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    priorModel('2d');
    const original = await install({
      ...plane, ...member,
      Loads: [['type', 'case', 'node', 'fx [kN]'], ['nodal', 1, 1, -3]],
      Supports: [['node', 'type'], [1, 'rollerX'], [2, 'fixed']],
    });
    expect(original?.problems).toEqual([]);
    const model = { ...modelStore.model, analysisMode: '2d' };
    const roller = [...model.supports.values()].find(support => support.type === 'rollerX')!;
    const mask = { tx: false, ty: true, tz: true, rx: true, ry: false, rz: true };
    const explicit = { ...roller, dofRestraints: mask };
    const input = buildSolverInput2D(model, false)!;
    const solved = buildSolverInput3D(model, false)!;
    const answer = planeResponses(input);
    const want = (name: string) => ['Nodes', 'Supports'].includes(name);
    for (const [axes, expected, sparse] of [
      [null, [0, 1, 1, 1, 0, 1], [0, 1, '', '', 0, 1]],
      [cyclicAxes, [1, 1, 0, 0, 1, 1], [1, '', 0, 0, 1, '']],
    ] as const) {
      const restraintCells = (rows: unknown[][]) => flags.map(flag => rows[1]![rows[0]!.indexOf(flag)]);
      const partial = { ...mask };
      Reflect.deleteProperty(partial, 'tz');
      Reflect.deleteProperty(partial, 'rx');
      for (const [support, analysis, cells] of [
        [roller, solved, expected],
        [explicit, null, expected],
        [explicit, solved, expected],
        [{ ...explicit, dofRestraints: partial }, solved, sparse],
      ] as const) {
        const sheets = modelSheets({ ...model, supports: new Map(model.supports).set(roller.id, support) }, analysis, want, axes);
        const book = Object.fromEntries(sheets.map(sheet => [sheet.name, sheet.rows]));
        expect(restraintCells(book.Supports!)).toEqual(cells);
        const reimport = await install({
          ...member, ...book,
          Loads: [['type', 'case', 'node', axes ? 'fz [kN]' : 'fx [kN]'], ['nodal', 1, 1, -3]],
        });
        expect(reimport?.problems).toEqual([]);
        expect(reimport?.model.supports).toEqual(original?.model.supports);
        expect(planeResponses(buildSolverInput2D(modelStore.model, false)!)).toEqual(answer);
      }
    }
  });

  for (const [mode, nodes] of geometries) {
    it(`#2395 ${entry} ${mode} requires a complete kr unit suffix`, async () => {
      for (const featureMode of ['production', 'development'] as const) {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(featureMode));
        const book = (header: string, value: number) => ({
          ...nodes, Supports: [['node', 'type', header], [1, 'spring', value]],
        });
        const before = priorModel(mode);
        const problem = { sheet: 'Supports', row: 1, column: 'kr', blocking: true };
        for (const suffix of [' [N·m/rad', ' []', ' [ ]', ' [[N·m/rad]', ' [N·m/rad] text', ' [N·m/rad] [kN·m/rad]', ' [m]']) {
          const workbook = book('kr' + suffix, 7000);
          expectRefusal(await install(workbook), before, problem);
          expect(parseWorkbook(workbook).problems).toEqual([expect.objectContaining(problem)]);
        }
        for (const [header, value] of [['kr', 7], ['kr [kN·m/rad]', 7], [' KR [ N·m/rad ] ', 7000]] as const) {
          const outcome = await install(book(header, value));
          expect(outcome?.problems).toEqual([]);
          expect(outcome?.loaded.nodes).toBe(2);
          expect(outcome?.model.supports).toEqual([{ id: 1, nodeId: 1, type: 'spring', kz: 7 }]);
        }
      }
    });

    it(`#2395 ${entry} ${mode} requires headers on a populated Loads sheet`, async () => {
      for (const featureMode of ['production', 'development'] as const) {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(featureMode));
        const before = priorModel(mode);
        const book = (Loads: unknown[][]) => ({ ...nodes, ...member, Loads });
        for (const [rows, missing] of [
          [[['nodal', 1, 2, -3]], ['type', 'case']],
          [[['nodal', 1, 2, -3], ['nodal', 1, 1, -4]], ['type', 'case']],
          [[['type', 'node', 'fz']], ['case']],
          [[['type', 'node', 'fz'], ['nodal', 2, -3]], ['case']],
        ] as const) {
          const workbook = book(rows.map(row => [...row]));
          const expected = missing.map(column => expect.objectContaining({ sheet: 'Loads', row: 1, column, blocking: true }));
          const outcome = await install(workbook);
          expect(outcome?.problems, JSON.stringify(outcome?.loaded)).toEqual(expected);
          expect(outcome?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
          expect(modelStore.snapshot()).toEqual(before);
          expect(parseWorkbook(workbook).problems).toEqual(expected);
        }
        const header = ['type', 'case', 'node', 'fz [kN]'];
        for (const rows of [[], [['', '', '', '']], [header], [header, ['', '', '', '']]]) {
          const outcome = await install(book(rows));
          expect(outcome?.problems).toEqual([]);
          expect(outcome?.loaded.nodes).toBe(2);
          expect(outcome?.model.loads).toEqual([]);
        }
        const outcome = await install(book([header, ['nodal', 1, 2, -3]]));
        expect(outcome?.problems).toEqual([]);
        expect(outcome?.loaded.nodes).toBe(2);
        expect(outcome?.model.loads).toMatchObject([{ type: 'nodal', data: { caseId: 1, nodeId: 2, fz: -3 } }]);
      }
    });
  }
}

it('#2395 recognized populated sheets require their declared headers', () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
  for (const { name, columns } of SHEETS) {
    const required = columns.filter(column => column.required).map(column => column.key.toLowerCase());
    const result = parseWorkbook({ [name]: [[42]] });
    expect(result.problems, name).toEqual(required.map(column => expect.objectContaining({
      sheet: name, row: 1, column, blocking: true,
    })));
  }
});
