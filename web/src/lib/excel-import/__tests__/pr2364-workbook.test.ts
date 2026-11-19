import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { DEFAULT_AXES, type AxesChoice } from '../../axes/frame';
import { modelSheets, type WorkbookModel } from '../../export/workbook-model';
import { modelStore, uiStore } from '../../store';
import { applyWorkbook } from '../apply';
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
