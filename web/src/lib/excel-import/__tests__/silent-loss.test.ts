import * as XLSX from 'xlsx';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore, uiStore } from '../../store';
import { modelSheets } from '../../export/workbook-model';
import { buildSolverInput2D, buildSolverInput3D } from '../../engine/solver-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { applyWorkbook, importExcelFile, type ImportOutcome } from '../apply';
import { parseWorkbook } from '../parse';
import { SHEETS, headerFor } from '../schema';

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
  it(`#2370 ${entry} refuses shadowed Loads before reading model rows`, async () => {
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

  it(`#2370 ${entry} blocks duplicate coordinate headers before inferring the dimension`, async () => {
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

  it(`#2370 ${entry} blocks incompatible coordinate units before inferring the dimension`, async () => {
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

  it(`#2370 ${entry} refuses duplicate gravity factors`, async () => {
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

  it(`#2370 ${entry} refuses unsupported member point load fields and direction`, async () => {
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

  it(`#2370 ${entry} refuses member point couples the active workbook convention cannot represent`, async () => {
    for (const build of ['production', 'development']) {
      vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(build));
      const before = priorModel('2d');
      const workbook = (...moments: unknown[]) => ({
        ...plane, ...member, ...axes,
        Loads: [['type', 'case', 'member', 'p', 'a', 'mx', 'my', 'mz'], ['pointOnElement', 1, 1, -7, 2, ...moments]],
      });
      for (const sign of [-1, 1]) {
        expectRefusal(await install(workbook(sign, 0, 0)), before, 'Loads', 'mx');
        expectRefusal(await install(workbook(0, 0, sign)), before, 'Loads', 'mz');
        if (build === 'production') expectRefusal(await install(workbook(0, sign, 0)), before, 'Loads', 'my');
      }
      const my = build === 'production' ? 0 : 7;
      const out = await install(workbook(0, my, ''));
      expect(out?.problems).toEqual([]);
      expect(modelStore.loads).toEqual([{ type: 'pointOnElement', data: expect.objectContaining({ p: -7, a: 2, ...(my ? { my } : {}) }) }]);
    }
  });

  it(`#2370 ${entry} refuses incompatible plane nodal couples`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    const workbook = (type: string, mx: unknown, my: unknown, mz: unknown) => ({
      ...(type === 'nodal' ? plane : space),
      Loads: [['type', 'case', 'node', 'fz', 'mx', 'my', 'mz'], [type, 1, 2, -3, mx, my, mz]],
    });
    for (const mode of ['2d', '3d', 'pro'] as const) {
      const before = priorModel(mode);
      for (const [mx, my, column] of [[2, 0, 'mx'], [0, -2, 'my'], [-2, 0, 'mx'], [0, 2, 'my']] as const) {
        expectRefusal(await install(workbook('nodal', mx, my, 7)), before, 'Loads', column);
      }
      for (const [mx, mz, column] of [[2, 0, 'mx'], [0, -2, 'mz'], [-2, 0, 'mx'], [0, 2, 'mz']] as const) {
        expectRefusal(await install({ ...axes, ...workbook('nodal', mx, 7, mz) }), before, 'Loads', column);
      }
      for (const zero of [0, '']) {
        for (const book of [workbook('nodal', zero, zero, 7), { ...axes, ...workbook('nodal', zero, 7, zero) }]) {
          const out = await install(book);
          expect(out?.problems).toEqual([]);
          expect(modelStore.loads).toEqual([{ type: 'nodal', data: expect.objectContaining({ fz: -3, my: 7 }) }]);
        }
      }
    }
    priorModel('3d');
    expect((await install(workbook('nodal3d', 2, -2, 7)))?.problems).toEqual([]);
    expect(modelStore.loads).toEqual([{ type: 'nodal3d', data: expect.objectContaining({ mx: 2, my: -2, mz: 7 }) }]);
  });

  it(`#2383 ${entry} round trips planar springs in rotational units and keeps legacy files readable`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    priorModel('2d');
    modelStore.clear();
    const node = modelStore.addNode(2, 3);
    modelStore.addSupport(node, 'spring', { kx: 13, ky: 17, kz: 7 });
    const exported = Object.fromEntries(modelSheets({ ...modelStore.model, analysisMode: '2d' }, null).map(s => [s.name, s.rows]));
    const [headers, row] = exported.Supports!;
    expect(row?.[headers!.indexOf('kr [kN·m/rad]')]).toBe(7);
    expect(row?.[headers!.indexOf('kz [kN/m]')]).toBe('');
    const spring = expect.objectContaining({ type: 'spring', kx: 13, ky: 17, kz: 7 });
    const roundTrip = await install(exported);
    expect(roundTrip?.problems).toEqual([]);
    expect(roundTrip?.loaded.nodes).toBe(1);
    expect([...modelStore.supports.values()]).toEqual([spring]);

    const legacy = {
      Nodes: [['id', 'x [m]', 'y [m]', 'z [m]'], [1, 2, 3, 0]],
      Supports: [['node', 'type', 'kx [kN/m]', 'ky [kN/m]', 'kz [kN/m]'], [1, 'spring', 13, 17, 7]],
    };
    expect((await install(legacy))?.problems).toEqual([]);
    expect([...modelStore.supports.values()]).toEqual([spring]);

    const before = priorModel('2d');
    const both = { ...plane, Supports: [['node', 'type', 'kz [kN/m]', 'kr [kN·m/rad]'], [1, 'spring', 0, 7]] };
    expectRefusal(await install(both), before, 'Supports', 'kr');
    const invalid = (unit: string, type: string) => ({
      ...plane, Supports: [['node', 'type', `kr [${unit}]`], [1, type, 7]],
    });
    expectRefusal(await install(invalid('kN/m', 'spring')), before, 'Supports', 'kr');
    expectRefusal(await install(invalid('kN·m/rad', 'spring3d')), before, 'Supports', 'kr');
    expectRefusal(await install({ ...axes, ...invalid('kN·m/rad', 'spring') }), before, 'Supports', 'kr');

    for (const [unit, stiffness, canonical] of [['N·m/rad', 7000, 7], ['kN·m/rad', 0, 0]] as const) {
      const rotationalOnly = { ...plane, Supports: [['node', 'type', `kr [${unit}]`], [1, 'spring', stiffness]] };
      expect((await install(rotationalOnly))?.problems).toEqual([]);
      expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({ kz: canonical })]);
    }

    const spatial = {
      ...space,
      Supports: [['node', 'type', 'kz [kN/m]', 'kry [kN·m/rad]'], [1, 'spring3d', 17, 7]],
    };
    priorModel('3d');
    expect((await install(spatial))?.problems).toEqual([]);
    expect([...modelStore.supports.values()]).toEqual([expect.objectContaining({ kz: 17, kry: 7 })]);
  });
}

it('#2383 the imported spring gives the same linear and P-Delta answers through both WASM solvers', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
  priorModel('2d');
  const original = applyWorkbook({
    ...plane, ...member,
    Supports: [['node', 'type', 'kz [kN/m]'], [1, 'fixed', ''], [2, 'spring', 7]],
    Loads: [['type', 'case', 'node', 'fx', 'fz', 'mz'], ['nodal', 1, 2, 2, -3, 7]],
  });
  expect(original.problems).toEqual([]);
  expect(original.loaded).toEqual({ nodes: 2, elements: 1, sections: 2 });
  const responses = () => {
    const planeInput = buildSolverInput2D(modelStore.model, false)!;
    const spaceInput = buildSolverInput3D(modelStore.model, false)!;
    const planeLinear = solve(planeInput);
    const spaceLinear = solve3D(spaceInput);
    expect(planeLinear.displacements.length).toBeGreaterThan(0);
    expect(spaceLinear.displacements.length).toBeGreaterThan(0);
    const planePDelta = solvePDelta(planeInput);
    const spacePDelta = solvePDelta3D(spaceInput);
    expect(planePDelta.converged).toBe(true);
    expect(spacePDelta.converged).toBe(true);
    return [planeLinear, spaceLinear, planePDelta, spacePDelta].map(r => ({
      displacements: r.displacements, reactions: r.reactions, elementForces: r.elementForces,
    }));
  };
  const expected = responses();
  const exported = Object.fromEntries(modelSheets({ ...modelStore.model, analysisMode: '2d' }, null).map(s => [s.name, s.rows]));
  expect(exported.Supports![2]![exported.Supports![0]!.indexOf('kr [kN·m/rad]')]).toBe(7);
  for (const install of [applyWorkbook, importFile]) {
    const out = await install(exported);
    expect(out?.problems).toEqual([]);
    expect(out?.loaded).toEqual(original.loaded);
    expect(responses()).toEqual(expected);
  }
});

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
  it(`#2370 ${sheet} blocks duplicate headers`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    expect(parseWorkbook(replace(rows)).problems).toEqual([]);
    const duplicate = replace([[...header!, ` ${String(header![0]).toUpperCase()} `], ...body]);
    expect(parseWorkbook(duplicate).problems)
      .toContainEqual(expect.objectContaining({ sheet, row: 1, blocking: true }));
    for (const install of [applyWorkbook, importFile]) {
      const before = priorModel('2d');
      expectRefusal(await install(duplicate), before, sheet);
    }
  });

  it(`#2370 ${sheet} blocks unknown populated columns`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    expect(parseWorkbook(replace(rows)).problems).toEqual([]);
    const extra = (value: unknown) => [[...header!, 'extra field'], ...body.map((row, index) =>
      index === 0 ? [...header!.map((_, c) => row[c]), value] : row)];
    if (sheet !== 'LoadData') {
      expect(parseWorkbook(replace(extra(' '))).problems).toEqual([]);
    }
    for (const value of [0, false, 'data']) {
      expect(parseWorkbook(replace(extra(value))).problems)
        .toContainEqual(expect.objectContaining({ sheet, column: 'extra field', blocking: true }));
    }
    const unnamed = [header!, ...body.map((row, index) => index === 0 ? [...header!.map((_, c) => row[c]), 0] : row)];
    expect(parseWorkbook(replace(unnamed)).problems)
      .toContainEqual(expect.objectContaining({ sheet, blocking: true }));
    for (const install of [applyWorkbook, importFile]) {
      const before = priorModel('2d');
      expectRefusal(await install(replace(extra(0))), before, sheet, 'extra field');
      expectRefusal(await install(replace(unnamed)), before, sheet);
    }
  });

  it(`#2370 ${sheet} refuses normalized aliases before opening any sheet`, () => {
    const workbook = { ...base, [sheet]: [header!], [` ${sheet.toLowerCase()} `]: rows };
    Object.defineProperty(workbook, sheet, { get() { throw new Error('read before sheet name validation'); } });
    expect(parseWorkbook(workbook).problems)
      .toEqual([expect.objectContaining({ sheet, row: 1, blocking: true })]);
  });
}

it('#2565 refuses explicit workbook self-weight ID 1.5 before replay can make it integral', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
  const workbook = (id: number) => ({
    ...plane, ...member,
    Members: [member.Members[0]!, [id, 'frame', 1, 2, 1, 1]],
    SelfWeight: [
      ['source', 'case', 'direction', 'factor', 'scope', 'members'],
      ['case', 1, 'Z', -1, 'members', String(id)],
    ],
  });
  for (const install of [applyWorkbook, importFile]) {
    const before = priorModel('2d');
    const denied = await install(workbook(1.5));
    expect(denied?.problems).toContainEqual(expect.objectContaining({
      sheet: 'SelfWeight', column: 'members', message: expect.stringContaining('1.5'),
    }));
    expect(denied?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
    expect(modelStore.snapshot()).toEqual(before);

    const accepted = await install(workbook(9));
    expect(accepted?.problems).toEqual([]);
    expect(modelStore.analysis?.selfWeight?.[0]?.elements).toEqual([...modelStore.elements.keys()]);
  }
});

const reviewSelectorRegression = process.env.RUN_KNOWN_WRONG === '2565' ? it : it.skip;
const maxWorkbookMemberId = Number.MAX_SAFE_INTEGER;
const workbookSelectors = [
  ['a fractional ID', 1.5, '1.5'],
  ['a missing integer ID', 2, '2'],
  ['a missing ID mixed with a live ID', '1 2', '2'],
  ['a fractional token that rounds to a live ID', '1.00000000000000001', '1.00000000000000001'],
  ['a negative ID', '-1', '-1'],
  ['an ID just above the safe integer limit', '9007199254740992', '9007199254740992'],
  ['an unsafe integer that loses precision', '9007199254740993', '9007199254740993'],
] as const;

function selectorWorkbook(geometry: typeof plane | typeof space, selector: string | number) {
  const memberFields = member.Members[1]!.slice(1);
  return {
    ...geometry, ...member,
    Members: [member.Members[0]!, [0, ...memberFields], member.Members[1]!, [maxWorkbookMemberId, ...memberFields]],
    SelfWeight: [
      ['source', 'case', 'direction', 'factor', 'scope', 'members'],
      ['case', 1, 'Z', -1, 'members', selector],
    ],
  };
}

for (const [label, selector, token] of workbookSelectors) {
  const problem = expect.objectContaining({
    sheet: 'SelfWeight', row: 2, column: 'members', blocking: true, message: expect.stringContaining(token),
  });

  reviewSelectorRegression(`known wrong result: #2565 workbook selector review: parsing blocks ${label}`, () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
    const parsed = parseWorkbook(selectorWorkbook(plane, selector));
    expect.soft(parsed.model.analysis?.selfWeight).toEqual([]);
    expect(parsed.problems).toEqual([problem]);
  });

  for (const [entry, install] of [['arrays', applyWorkbook], ['XLSX', importFile]] as const) {
    for (const [mode, geometry] of [['2d', plane], ['3d', space], ['pro', space]] as const) {
      reviewSelectorRegression(`known wrong result: #2565 workbook selector review: ${entry} ${mode} blocks ${label}`, async () => {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
        const before = priorModel(mode);
        const outcome = await install(selectorWorkbook(geometry, selector));
        expect.soft(outcome?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
        expect(outcome?.problems).toEqual([problem]);
        expect(modelStore.snapshot()).toEqual(before);
      });
    }
  }
}

for (const [entry, install] of [['arrays', applyWorkbook], ['XLSX', importFile]] as const) {
  for (const [mode, geometry] of [['2d', plane], ['3d', space], ['pro', space]] as const) {
    it(`#2565 workbook selector review: ${entry} ${mode} installs live IDs from zero through the safe integer limit`, async () => {
      vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('development'));
      priorModel(mode);
      const outcome = await install(selectorWorkbook(geometry, ` 0\t01  ${maxWorkbookMemberId} `));
      expect(outcome?.problems).toEqual([]);
      expect(outcome?.loaded).toMatchObject({ nodes: 2, elements: 3 });
      expect(outcome?.model.analysis?.selfWeight?.[0]?.elements).toEqual([0, 1, maxWorkbookMemberId]);
      expect(modelStore.analysis?.selfWeight?.[0]?.elements).toEqual([...modelStore.elements.keys()]);
    });
  }
}
