import * as XLSX from 'xlsx';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { DEFAULT_AXES, type AxesChoice } from '../../axes/frame';
import { modelSheets, type WorkbookModel } from '../../export/workbook-model';
import { modelStore, uiStore } from '../../store';
import { applyWorkbook, importExcelFile } from '../apply';
import { parseWorkbook } from '../parse';

const Y_UP = { up: '+Y', right: '-X', hand: 'right' } as const;
const axes = (choice: AxesChoice) => [['up', 'right', 'hand'], [choice.up, choice.right, choice.hand]];
const nodes = { Nodes: [['id', 'x', 'z'], [1, 2, 3]] };
const cases = { LoadCases: [['id', 'name', 'type'], [1, 'Dead', 'D']] };
const longLoads = [
  ['load', 'case', 'type', 'node', 'member', 'shell', 'field', 'value', 'unit'],
  [1, 1, 'nodal', 1, '', '', 'fx', 0, 'kN'],
  [1, 1, 'nodal', 1, '', '', 'fz', -3, 'kN'],
  [1, 1, 'nodal', 1, '', '', 'my', 0, 'kN·m'],
];
const weight = [['source', 'case', 'direction', 'factor', 'scope'], ['case', 1, 'Z', -2, 'all']];

const originalMode = uiStore.analysisMode;
afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.analysisMode = originalMode;
});

it('known wrong result: #1986 a present workbook frame is declared exactly once', () => {
  for (const Axes of [[], [axes(DEFAULT_AXES)[0]!], [...axes(DEFAULT_AXES), axes(Y_UP)[1]!]]) {
    const parsed = parseWorkbook({ ...nodes, Axes });
    expect(parsed.problems.some(p => p.sheet === 'Axes')).toBe(true);
    expect(parsed.model.nodes).toEqual([]);
  }
  expect(parseWorkbook({ ...nodes, Axes: axes(DEFAULT_AXES), ' axes ': axes(Y_UP) }).model.nodes).toEqual([]);
  for (const sheets of [nodes, { ...nodes, Axes: [...axes(DEFAULT_AXES), [], []] }]) {
    const parsed = parseWorkbook(sheets);
    expect(parsed.problems).toEqual([]);
    expect(parsed.model.nodes).toEqual([{ id: 1, x: 2, y: 3, z: 0 }]);
  }
});

it('known wrong result: #1986 the disabled importer refuses before dropping canonical workbook loads', () => {
  modelStore.addNode(17, 21);
  for (const [sheet, rows] of [['LoadData', longLoads], ['SelfWeight', weight]] as const) {
    const workbook = { ...nodes, ...cases, [sheet]: rows };
    expect(parseWorkbook(workbook)).toMatchObject({ problems: [], counts: { [sheet === 'LoadData' ? 'Loads' : sheet]: 1 } });
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    try {
      const before = modelStore.snapshot();
      const outcome = applyWorkbook(workbook);
      expect(outcome.problems).toEqual([expect.objectContaining({ sheet, row: 2 })]);
      expect(outcome.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
      expect(modelStore.snapshot()).toEqual(before);
      expect(parseWorkbook({ ...nodes, [sheet]: rows.slice(0, 1) }).model.nodes).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  }
});

it('known wrong result: #1986 prescribed support rotations survive default and custom workbook frames', () => {
  for (const [analysisMode, support] of [
    ['2d', { id: 1, nodeId: 1, type: 'fixed', dry: -0.003 }],
    ['pro', { id: 1, nodeId: 1, type: 'fixed3d', drx: 0.001, dry: 0, drz: -0.002 }],
  ] as const) {
    const node = { id: 1, x: 2, y: 3, ...(analysisMode === 'pro' ? { z: 4 } : {}) };
    const model = {
      analysisMode, nodes: new Map([[1, node]]), supports: new Map([[1, support]]),
      elements: new Map(), materials: new Map(), sections: new Map(), loads: [], loadCases: [], combinations: [],
    } satisfies WorkbookModel;
    for (const choice of [DEFAULT_AXES, Y_UP]) {
      const sheets = Object.fromEntries(modelSheets(model, null, undefined, choice).map(s => [s.name, s.rows]));
      const parsed = parseWorkbook(sheets);
      expect(parsed.problems.filter(p => p.sheet === 'Supports' && p.row > 1)).toEqual([]);
      expect(parsed.model.supports).toEqual([support]);
      uiStore.analysisMode = analysisMode;
      expect(applyWorkbook(sheets).loaded.nodes).toBe(1);
      const applied = [...modelStore.supports.values()][0]!;
      expect([applied.drx, applied.dry, applied.drz]).toEqual([
        'drx' in support ? support.drx : undefined, support.dry, 'drz' in support ? support.drz : undefined,
      ]);
      if (choice === DEFAULT_AXES) {
        vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
        try {
          expect(parseWorkbook(sheets).model.supports).toEqual([support]);
        } finally {
          vi.unstubAllGlobals();
        }
      }
    }
  }
});

it('known wrong result: #1986 framed plane nodal rows reject each nonzero out-of-plane component', () => {
  for (const choice of [Y_UP, DEFAULT_AXES]) {
    const yUp = choice === Y_UP;
    const base = {
      Axes: axes(choice),
      Nodes: [['id', 'x', 'y', 'z'], yUp ? [1, 2, 3, ''] : [1, 2, '', 3]],
    };
    const columns = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'];
    const [permitted, rejected] = yUp ? [[0, 1, 5], [2, 3, 4]] : [[0, 2, 4], [1, 3, 5]];
    const values = columns.map((_, i) => permitted.includes(i) ? i + 1 : 0);
    const read = (type: string, row: number[]) =>
      parseWorkbook({ ...base, Loads: [['type', 'case', 'node', ...columns], [type, 1, 1, ...row]] });
    expect(read('nodal', values).model.loads).toEqual([
      { type: 'nodal', data: { id: 1, caseId: 1, nodeId: 1, fx: yUp ? -1 : 1, fy: 0, fz: yUp ? 2 : 3, my: yUp ? -6 : 5 } },
    ]);
    for (const i of rejected) for (const invalid of [-1, 1]) {
      const components = values.with(i, invalid);
      const parsed = read('nodal', components);
      expect(parsed.problems).toEqual([expect.objectContaining({ sheet: 'Loads', row: 2, column: columns[i], message: expect.stringContaining('nodal3d') })]);
      expect(parsed.model.loads).toEqual([]);
      expect(read('nodal3d', components).model.loads).toHaveLength(1);
    }
  }
});

it('known wrong result: #1986 declared flat support springs use the physical vertical and rotation columns', () => {
  for (const mode of ['production', 'development']) {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(mode));
    uiStore.analysisMode = '2d';
    const Supports = [['node', 'type', 'kx', 'kz', 'kry'], [1, 'spring', 11, 13, 17]];
    const workbook = { ...nodes, Axes: axes(DEFAULT_AXES), Supports };
    expect(parseWorkbook(workbook).model.supports).toEqual([{ id: 1, nodeId: 1, type: 'spring', kx: 11, ky: 13, kz: 17 }]);
    expect(applyWorkbook(workbook).loaded.nodes).toBe(1);
    expect([...modelStore.supports.values()][0]).toMatchObject({ kx: 11, ky: 13, kz: 17 });
    const legacy = parseWorkbook({ ...nodes, Supports: [['node', 'type', 'kx', 'ky', 'kz'], [1, 'spring', 11, 13, 17]] });
    expect(legacy.model.supports).toEqual([{ id: 1, nodeId: 1, type: 'spring', kx: 11, ky: 13, kz: 17 }]);
  }
});

it('known wrong result: #1986 incompatible flat support components block installation', () => {
  uiStore.analysisMode = '2d';
  modelStore.addNode(17, 21);
  const snapshot = modelStore.snapshot();
  for (const choice of [DEFAULT_AXES, Y_UP]) {
    const [depth, horizontal, vertical] = choice === Y_UP ? ['z', 'x', 'y'] : ['y', 'x', 'z'];
    const base = { Axes: axes(choice), Nodes: [['id', horizontal, vertical], [1, 2, 3]] };
    for (const column of ['d' + depth, 'k' + depth, 'dr' + horizontal, 'dr' + vertical, 'kr' + horizontal, 'kr' + vertical]) {
      for (const value of [-2, 2]) {
        const workbook = { ...base, Supports: [['node', 'type', column], [1, 'fixed', value]] };
        expect(parseWorkbook(workbook).problems).toEqual([expect.objectContaining({ sheet: 'Supports', row: 2, column })]);
        expect(applyWorkbook(workbook).loaded.nodes).toBe(0);
        expect(modelStore.snapshot()).toEqual(snapshot);
      }
      const zero = parseWorkbook({ ...base, Supports: [['node', 'type', column], [1, 'fixed', 0]] });
      expect(zero.problems).toEqual([]);
      expect(zero.model.supports).toEqual([{ id: 1, nodeId: 1, type: 'fixed' }]);
    }
    const spatial = parseWorkbook({
      ...base, Nodes: [['id', horizontal, vertical, depth], [1, 2, 3, 0]],
      Supports: [['node', 'type', 'd' + depth], [1, 'fixed3d', 2]],
    });
    expect(spatial.problems).toEqual([]);
    expect(spatial.model.supports[0]).toHaveProperty('dy', 2);
  }
});

it('known wrong result: #1986 blank LoadData cases resolve to a declared case or block installation', () => {
  const sheet = (id: number | '') => [longLoads[0]!, ...longLoads.slice(1).map(row => row.with(1, id))];
  const onlyTwo = { LoadCases: [['id', 'name', 'type'], [2, 'Live', 'L']] };
  const cantilever = { ...nodes, ...onlyTwo, LoadData: sheet('') };
  modelStore.addNode(17, 21);
  const snapshot = modelStore.snapshot();
  expect(parseWorkbook(cantilever).problems).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'LoadData', row: 2 })]));
  expect(applyWorkbook(cantilever).loaded.nodes).toBe(0);
  expect(modelStore.snapshot()).toEqual(snapshot);
  for (const [metadata, id, effective] of [[{}, '', 1], [cases, '', 1], [onlyTwo, 2, 2]] as const) {
    const parsed = parseWorkbook({ ...nodes, ...metadata, LoadData: sheet(id) });
    expect(parsed.problems).toEqual([]);
    expect(parsed.model.loads).toEqual([{ type: 'nodal', data: expect.objectContaining({ fz: -3 }) }]);
    expect(parsed.model.loads[0]!.data.caseId ?? 1).toBe(effective);
  }
});

it('known wrong result: #1986 standalone gravity can accompany only the legacy case weights', () => {
  const base = {
    ...nodes,
    LoadCases: [['id', 'name', 'type'], [1, 'Dead', 'D'], [2, 'Live', 'L'], [3, 'Also dead', 'D']],
  };
  const single = ['single', '', 'Z', -1, 'all'];
  const dead = ['case', 1, 'Z', -1, 'all'], otherDead = ['case', 3, 'Z', -1, 'all'];
  const workbook = (...rows: unknown[][]) => ({ ...base, SelfWeight: [weight[0]!, ...rows] });
  modelStore.addNode(17, 21);
  const snapshot = modelStore.snapshot();
  for (const mixed of [
    [single, ['case', 1, 'X', 2, 'all'], otherDead],
    [dead, single, ['case', 3, 'Z', 0, 'all']],
    [single, dead, otherDead, ['case', 2, 'Z', -1, 'all']],
    [single, dead, dead, otherDead],
    [single, dead],
  ]) {
    expect(parseWorkbook(workbook(...mixed)).problems).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'SelfWeight' })]));
    expect(applyWorkbook(workbook(...mixed)).loaded.nodes).toBe(0);
    expect(modelStore.snapshot()).toEqual(snapshot);
  }
  expect(parseWorkbook(workbook(otherDead, single, dead)).problems).toEqual([]);
  expect(parseWorkbook(workbook(['case', 1, 'X', 2, 'all'])).problems).toEqual([]);
});

it('#2364 a declared plane nodal row with a nonzero normal component cannot replace a model', () => {
  for (const [build, choice, workspace] of [
    ['production', DEFAULT_AXES, '2d'],
    ['production', DEFAULT_AXES, '3d'],
    ['production', DEFAULT_AXES, 'pro'],
    ['development', DEFAULT_AXES, '2d'],
    ['development', Y_UP, '2d'],
  ] as const) {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(build));
    uiStore.analysisMode = workspace;
    modelStore.clear();
    modelStore.addNode(17, 21);
    const before = modelStore.snapshot();
    const custom = choice === Y_UP;
    const columns = custom ? ['fx', 'fy', 'mz', 'fz', 'mx', 'my'] : ['fx', 'fz', 'my', 'fy', 'mx', 'mz'];
    const coordinates = custom ? ['id', 'x', 'y'] : ['id', 'x', 'z'];
    const workbook = (values: number[]) => ({
      Axes: axes(choice),
      Nodes: [coordinates, [1, 2, 3]],
      Loads: [['type', 'case', 'node', ...columns], ['nodal', 1, 1, ...values]],
    });
    const valid = [2, -3, 4, 0, 0, 0];
    for (const i of [3, 4, 5]) {
      for (const value of [-1, 1]) {
        const outcome = applyWorkbook(workbook(valid.with(i, value)));
        expect(outcome.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
        expect(outcome.problems).toEqual([
          expect.objectContaining({ sheet: 'Loads', row: 2, column: columns[i], blocking: true }),
        ]);
        expect(outcome.model.loads).toEqual([]);
        expect(modelStore.snapshot()).toEqual(before);
      }
    }
    const accepted = applyWorkbook(workbook(valid));
    expect(accepted.problems).toEqual([]);
    expect(accepted.loaded.nodes).toBe(1);
    expect(modelStore.loads).toEqual([
      { type: 'nodal', data: expect.objectContaining({ fx: custom ? -2 : 2, fz: -3, my: custom ? -4 : 4 }) },
    ]);
  }
});

it('#2364 malformed prescribed rotations cannot replace a model', () => {
  for (const [build, flat] of [['production', true], ['production', false], ['development', false]] as const) {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(build));
    uiStore.analysisMode = flat ? '2d' : 'pro';
    modelStore.clear();
    modelStore.addNode(17, 21);
    const before = modelStore.snapshot();
    const base = flat ? nodes : { Nodes: [['id', 'x', 'y', 'z'], [1, 2, 3, 4]] };
    const type = flat ? 'fixed' : 'fixed3d';
    const declarations: Record<string, unknown[][]>[] = [{}, { Axes: axes(DEFAULT_AXES) }];
    for (const declaration of declarations) {
      for (const column of ['drx', 'dry', 'drz']) {
        const workbook = { ...base, ...declaration, Supports: [['node', 'type', column], [1, type, 'bad']] };
        const outcome = applyWorkbook(workbook);
        expect(outcome.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
        expect(outcome.problems).toEqual([
          expect.objectContaining({ sheet: 'Supports', row: 2, column, blocking: true }),
        ]);
        expect(modelStore.snapshot()).toEqual(before);
      }
    }
  }
});

it('#2364 incompatible prescribed rotation units cannot replace a model', () => {
  for (const workspace of ['2d', 'pro'] as const) {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
    uiStore.analysisMode = workspace;
    modelStore.clear();
    modelStore.addNode(17, 21);
    const before = modelStore.snapshot();
    const base = workspace === '2d' ? nodes : { Nodes: [['id', 'x', 'y', 'z'], [1, 2, 3, 4]] };
    const type = workspace === '2d' ? 'fixed' : 'fixed3d';
    for (const column of ['drx', 'dry', 'drz']) {
      const workbook = { ...base, Supports: [['node', 'type', column + ' [mm]'], [1, type, 1]] };
      const outcome = applyWorkbook(workbook);
      expect(outcome.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
      expect(outcome.problems).toEqual([
        expect.objectContaining({ sheet: 'Supports', row: 1, column, blocking: true }),
      ]);
      expect(modelStore.snapshot()).toEqual(before);
    }
    const headers = ['node', 'type', 'drx [rad]', 'dry [deg]', 'drz'];
    const rotation = workspace === '2d' ? ['', -180, ''] : [0, -180, 1];
    const accepted = applyWorkbook({ ...base, Supports: [headers, [1, type, ...rotation]] });
    expect(accepted.problems).toEqual([]);
    expect(accepted.loaded.nodes).toBe(1);
    const support = [...modelStore.supports.values()][0]!;
    expect([support.drx, support.dry, support.drz]).toEqual(workspace === '2d'
      ? [undefined, -Math.PI, undefined] : [0, -Math.PI, 1]);
  }
});

it('#2364 workbook file import refuses a partially invalid load or prescribed rotation', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  uiStore.analysisMode = '2d';
  modelStore.addNode(17, 21);
  const before = modelStore.snapshot();
  for (const [sheet, rows] of [
    ['Loads', [['type', 'case', 'node', 'fz', 'fy'], ['nodal', 1, 1, -3, 1]]],
    ['Supports', [['node', 'type', 'dry'], [1, 'fixed', 'bad']]],
  ] as const) {
    const book = XLSX.utils.book_new();
    const workbook = { ...nodes, Axes: axes(DEFAULT_AXES), [sheet]: rows };
    for (const [name, data] of Object.entries(workbook)) {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data.map(row => [...row])), name);
    }
    const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'invalid.xlsx');
    const outcome = await importExcelFile(file);
    expect(outcome?.loaded).toEqual({ nodes: 0, elements: 0, sections: 0 });
    expect(outcome?.problems).toEqual([expect.objectContaining({ sheet, row: 2, blocking: true })]);
    expect(modelStore.snapshot()).toEqual(before);
  }
});
