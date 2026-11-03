import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { parseWorkbook } from '../parse';
import { applyWorkbook } from '../apply';
import { modelStore, uiStore } from '../../store';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { setLocale } from '../../i18n';

const aoa = (header: string[], ...rows: Array<Array<unknown>>) => [header, ...rows];

function frame(): Record<string, unknown[][]> {
  return {
    Nodes: aoa(['id', 'x [m]', 'y [m]', 'z [m]'], [1, 0, '', 0], [2, 0, '', 3], [3, 0, '', 6]),
    Materials: aoa(['id', 'name', 'E [MPa]', 'nu'], [1, 'C', 30000, 0.2]),
    Sections: aoa(['id', 'name', 'b [m]', 'h [m]'], [1, 'C30', 0.3, 0.3]),
    Members: aoa(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1], [2, 'frame', 2, 3, 1, 1]),
    Supports: aoa(['node', 'type'], [1, 'fixed']),
  };
}

const before = uiStore.analysisMode;
beforeEach(() => { setLocale('en'); uiStore.analysisMode = '2d'; modelStore.clear(); });
afterAll(() => { setLocale('es'); uiStore.analysisMode = before; });

describe('the PointMasses sheet', () => {
  it('reads each mass at its node, with the horizontal-only flag and the polar inertia', () => {
    const b = frame();
    b.PointMasses = aoa(['node', 'm [t]', 'horizontalOnly', 'izz [t·m²]'], [2, 12.5, 'no', ''], [3, 8, 'yes', 41.75]);
    const r = parseWorkbook(b);
    expect(r.problems).toEqual([]);
    expect(r.model.pointMasses).toEqual([{ nodeId: 2, m: 12.5 }, { nodeId: 3, m: 8, horizontalOnly: true, izz: 41.75 }]);
    expect(r.counts.PointMasses).toBe(2);
  });

  it('converts a mass stated in kilograms', () => {
    const b = frame();
    b.PointMasses = aoa(['node', 'm [kg]', 'izz [kg·m²]'], [2, 12500, 3000]);
    expect(parseWorkbook(b).model.pointMasses).toEqual([{ nodeId: 2, m: 12.5, izz: 3 }]);
  });

  it('refuses a mass at a node that does not exist, a negative mass, an unreadable inertia and a second mass at a node', () => {
    const b = frame();
    b.PointMasses = aoa(['node', 'm [t]', 'izz [t·m²]'], [9, 1, ''], [2, -1, ''], [3, 1, 'abc'], [2, 4, ''], [2, 5, '']);
    const r = parseWorkbook(b);
    expect(r.model.pointMasses).toEqual([{ nodeId: 2, m: 4 }]);
    expect(r.problems.map((p) => [p.row, p.column])).toEqual([[2, 'node'], [3, 'm'], [4, 'izz'], [6, undefined]]);
    expect(r.problems[0]!.message).toBe('node 9 does not exist');
    expect(r.problems[3]!.message).toContain('row 5');
  });

  it('refuses a horizontal-only cell that reads as neither yes nor no, and takes blank, 0 and no as no', () => {
    const b = frame();
    b.PointMasses = aoa(['node', 'm [t]', 'horizontalOnly'], [2, 1, 'maybe'], [3, 2, 7], [2, 3, ''], [3, 4, 0]);
    const r = parseWorkbook(b);
    expect(r.problems.map((p) => [p.row, p.column, p.message])).toEqual([[2, 'horizontalOnly', 'yes or no was expected'], [3, 'horizontalOnly', 'yes or no was expected']]);
    expect(r.model.pointMasses).toEqual([{ nodeId: 2, m: 3 }, { nodeId: 3, m: 4 }]);
  });

  it('leaves a workbook without the sheet with no masses', () => {
    const r = parseWorkbook(frame());
    expect(r.model.pointMasses).toBeUndefined();
    applyWorkbook(frame());
    expect(modelStore.model.massSource).toBeUndefined();
  });

  it('puts the masses on the imported nodes', () => {
    const b = frame();
    b.PointMasses = aoa(['node', 'm [t]', 'horizontalOnly'], [3, 8, 1]);
    applyWorkbook(b);
    const [p] = modelStore.model.massSource?.points ?? [];
    expect(p).toMatchObject({ m: 8, horizontalOnly: true });
    expect(modelStore.nodes.get(p!.nodeId)).toMatchObject({ x: 0, y: 6 });
  });
});

describe('a project workbook carries the masses', () => {
  it('writes them as the importer reads them, and they come back on the same nodes', () => {
    applyWorkbook(frame());
    const ids = [...modelStore.nodes.keys()].sort((a, c) => a - c);
    const points = [{ nodeId: ids[1]!, m: 12.5 }, { nodeId: ids[2]!, m: 8, horizontalOnly: true, izz: 41.75 }];
    modelStore.setMassSource({ kind: 'custom', factors: [], points });

    const sheets = currentWorkbookSheets(5, { results: false });
    const pm = sheets.find((s) => s.name === 'PointMasses');
    expect(pm?.rows).toEqual([['node', 'm [t]', 'horizontalOnly', 'izz [t·m²]'], [ids[1], 12.5, 0, ''], [ids[2], 8, 1, 41.75]]);

    const book = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
    const back = parseWorkbook(book);
    expect(back.problems.filter((p) => p.sheet === 'PointMasses')).toEqual([]);
    expect(back.model.pointMasses).toEqual(points);

    const coords = new Map(points.map((p) => [p.nodeId, modelStore.nodes.get(p.nodeId)!]));
    applyWorkbook(book);
    const again = modelStore.model.massSource?.points ?? [];
    expect(again.map((p) => ({ ...p, nodeId: undefined }))).toEqual(points.map((p) => ({ ...p, nodeId: undefined })));
    again.forEach((p, i) => {
      const was = coords.get(points[i]!.nodeId)!, now = modelStore.nodes.get(p.nodeId)!;
      expect([now.x, now.y, now.z ?? 0]).toEqual([was.x, was.y, was.z ?? 0]);
    });
  });

  it('writes no PointMasses sheet for a model without masses', () => {
    applyWorkbook(frame());
    expect(currentWorkbookSheets(5, { results: false }).some((s) => s.name === 'PointMasses')).toBe(false);
  });
});
