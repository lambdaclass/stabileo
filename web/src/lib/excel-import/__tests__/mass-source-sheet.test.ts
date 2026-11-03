import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { parseWorkbook } from '../parse';
import { applyWorkbook } from '../apply';
import { modelStore, uiStore } from '../../store';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { setLocale } from '../../i18n';
import type { MassSource } from '../../engine/dynamics/mass-source';

const aoa = (header: string[], ...rows: Array<Array<unknown>>) => [header, ...rows];
const HEAD = ['item', 'key', 'value', 'case', 'factor', 'on', 'w', 'region'];

function frame(): Record<string, unknown[][]> {
  return {
    Nodes: aoa(['id', 'x [m]', 'y [m]', 'z [m]'], [1, 0, '', 0], [2, 0, '', 3], [3, 0, '', 6]),
    Materials: aoa(['id', 'name', 'E [MPa]', 'nu'], [1, 'C', 30000, 0.2]),
    Sections: aoa(['id', 'name', 'b [m]', 'h [m]'], [1, 'C30', 0.3, 0.3]),
    Members: aoa(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1], [2, 'frame', 2, 3, 1, 1]),
    Supports: aoa(['node', 'type'], [1, 'fixed']),
    LoadCases: aoa(['id', 'name', 'type'], [1, 'D', 'D'], [2, 'L', 'L'], [5, 'S', 'S']),
  };
}

function withMass(...rows: Array<Array<unknown>>) {
  const b = frame();
  b.MassSource = aoa(HEAD, ...rows);
  return parseWorkbook(b);
}

const before = uiStore.analysisMode;
beforeEach(() => { setLocale('en'); uiStore.analysisMode = '2d'; modelStore.clear(); });
afterAll(() => { setLocale('es'); uiStore.analysisMode = before; });

describe('the MassSource sheet', () => {
  it('reads a code with its parameters and the weights that are mass', () => {
    const r = withMass(
      ['source', 'preset', 'cirsoc103-2018', '', '', '', '', ''],
      ['param', 'occupancy', 'high', '', '', '', '', ''],
      ['param', 'snowRetaining', 'yes', '', '', '', '', ''],
      ['weight', '', '', '', '', 'floor', 1.5, 'all'],
      ['weight', '', '', '', '', 'members', 0.8, '{"kind":"box","x":[0,5],"z":[2,4]}'],
    );
    expect(r.problems).toEqual([]);
    expect(r.model.massSource).toEqual({
      kind: 'preset', presetId: 'cirsoc103-2018', params: { occupancy: 'high', snowRetaining: true },
      weights: [{ on: 'floor', w: 1.5, region: { kind: 'all' } }, { on: 'members', w: 0.8, region: { kind: 'box', x: [0, 5], z: [2, 4] } }],
    });
    expect(r.counts.MassSource).toBe(1);
  });

  it('reads a table of factors by case', () => {
    const r = withMass(['source', 'custom', '', '', '', '', '', ''], ['factor', '', '', 1, 1, '', '', ''], ['factor', '', '', 2, 0.25, '', '', '']);
    expect(r.problems).toEqual([]);
    expect(r.model.massSource).toEqual({ kind: 'custom', factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 0.25 }] });
  });

  it('leaves a workbook without the sheet with no mass source', () => {
    const r = parseWorkbook(frame());
    expect(r.model.massSource).toBeUndefined();
    expect(r.counts.MassSource).toBe(0);
    applyWorkbook(frame());
    expect(modelStore.model.massSource).toBeUndefined();
  });

  it('refuses a source that is neither preset nor custom, and imports nothing from the sheet', () => {
    const r = withMass(['source', 'table', '', '', '', '', '', ''], ['factor', '', '', 1, 1, '', '', '']);
    expect(r.model.massSource).toBeUndefined();
    expect(r.problems).toEqual([{ sheet: 'MassSource', row: 2, column: 'key', message: '"table" is not a mass source (preset or custom): the MassSource sheet is not imported' }]);
  });

  it('refuses a code this version does not know', () => {
    const r = withMass(['source', 'preset', 'asce7-99', '', '', '', '', ''], ['param', 'occupancy', 'high', '', '', '', '', '']);
    expect(r.model.massSource).toBeUndefined();
    expect(r.problems.map((p) => [p.row, p.column])).toEqual([[2, 'value']]);
    expect(r.problems[0]!.message).toContain('asce7-99');
  });

  it('refuses a second source row', () => {
    const r = withMass(['source', 'custom', '', '', '', '', '', ''], ['source', 'preset', 'cirsoc103-2018', '', '', '', '', '']);
    expect(r.model.massSource).toEqual({ kind: 'custom', factors: [] });
    expect(r.problems.map((p) => [p.row, p.message])).toEqual([[3, 'the mass source is already stated in row 2: this row is ignored']]);
  });

  it('refuses an unknown parameter, a value the code does not offer and a yes/no it cannot read', () => {
    const r = withMass(
      ['source', 'preset', 'cirsoc103-2018', '', '', '', '', ''],
      ['param', 'importance', 'high', '', '', '', '', ''],
      ['param', 'occupancy', 'mostly', '', '', '', '', ''],
      ['param', 'snowRetaining', 'perhaps', '', '', '', '', ''],
    );
    expect(r.model.massSource).toEqual({ kind: 'preset', presetId: 'cirsoc103-2018', params: {} });
    expect(r.problems.map((p) => [p.row, p.column])).toEqual([[3, 'key'], [4, 'value'], [5, 'value']]);
  });

  it('refuses a parameter stated twice and keeps the first value', () => {
    const r = withMass(
      ['source', 'preset', 'cirsoc103-2018', '', '', '', '', ''],
      ['param', 'occupancy', 'high', '', '', '', '', ''],
      ['param', 'occupancy', 'mostly', '', '', '', '', ''],
      ['param', 'snowRetaining', 'yes', '', '', '', '', ''],
      ['param', 'snowRetaining', 'no', '', '', '', '', ''],
    );
    expect(r.model.massSource).toEqual({ kind: 'preset', presetId: 'cirsoc103-2018', params: { occupancy: 'high', snowRetaining: true } });
    expect(r.problems.map((p) => [p.row, p.column])).toEqual([[4, 'key'], [6, 'key']]);
  });

  it('refuses a parameter without a code', () => {
    const r = withMass(['source', 'custom', '', '', '', '', '', ''], ['param', 'occupancy', 'high', '', '', '', '', '']);
    expect(r.problems.map((p) => [p.row, p.message])).toEqual([[3, 'a parameter needs a preset source with a known code']]);
  });

  it('refuses a negative factor, a non-finite one, an unknown case, a repeated case and a factor under a code', () => {
    const r = withMass(
      ['source', 'custom', '', '', '', '', '', ''],
      ['factor', '', '', 1, -0.5, '', '', ''],
      ['factor', '', '', 2, 'Infinity', '', '', ''],
      ['factor', '', '', 9, 1, '', '', ''],
      ['factor', '', '', 5, 0.5, '', '', ''],
      ['factor', '', '', 5, 0.7, '', '', ''],
    );
    expect(r.model.massSource).toEqual({ kind: 'custom', factors: [{ caseId: 5, factor: 0.5 }] });
    expect(r.problems.map((p) => [p.row, p.column ?? null, p.message])).toEqual([
      [3, 'factor', 'a mass factor must be zero or greater'],
      [4, 'factor', expect.any(String)],
      [5, 'case', expect.stringContaining('9')],
      [7, null, 'case 5 already has a factor in row 6: this row is ignored'],
    ]);
    const coded = withMass(['source', 'preset', 'cirsoc103-2018', '', '', '', '', ''], ['factor', '', '', 1, 1, '', '', '']);
    expect(coded.problems.map((p) => [p.row, p.column])).toEqual([[3, 'item']]);
  });

  it('refuses a weight with an unknown place, a negative value, a bad region or a region on a zone or group', () => {
    const r = withMass(
      ['weight', '', '', '', '', 'roof', 1, 'all'],
      ['weight', '', '', '', '', 'floor', -1, 'all'],
      ['weight', '', '', '', '', 'floor', 1, '{"kind":"box","x":[0]}'],
      ['weight', '', '', '', '', 'floor', 1, 'everywhere'],
      ['weight', '', '', '', '', 'floor', 1, '{"kind":"group","groupId":3}'],
      ['weight', '', '', '', '', 'slabs', 2, ''],
      ['row', '', '', '', '', '', '', ''],
    );
    expect(r.model.massSource).toEqual({ kind: 'custom', factors: [], weights: [{ on: 'slabs', w: 2, region: { kind: 'all' } }] });
    expect(r.problems.map((p) => [p.row, p.column])).toEqual([[2, 'on'], [3, 'w'], [4, 'region'], [5, 'region'], [6, 'region'], [8, 'item']]);
    expect(r.problems[4]!.message).toContain('zone or a group');
  });
});

describe('a project workbook carries the whole mass source', () => {
  const sources: Array<[string, (n: number[]) => MassSource]> = [
    ['a code with parameters, weights and points', (ids) => ({
      kind: 'preset', presetId: 'cirsoc103-2018', params: { occupancy: 'full', snowRetaining: true },
      weights: [{ on: 'floor', w: 1.5, region: { kind: 'all' } }, { on: 'members', w: 0.8, region: { kind: 'box', x: [0, 5], y: [1, 4] } }],
      points: [{ nodeId: ids[2]!, m: 8, horizontalOnly: true, izz: 41.75 }],
    })],
    ['a table of factors', () => ({ kind: 'custom', factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 0.25 }], weights: [{ on: 'slabs', w: 2, region: { kind: 'all' } }] })],
  ];

  it.each(sources)('exports %s, reads it back with no problem and applies it unchanged', (_, make) => {
    applyWorkbook(frame());
    const ids = [...modelStore.nodes.keys()].sort((a, c) => a - c);
    const source = make(ids);
    modelStore.setMassSource(source);
    const stated = modelStore.model.massSource!;

    const sheets = currentWorkbookSheets(5, { results: false });
    expect(sheets.some((s) => s.name === 'MassSource')).toBe(true);
    const book = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
    const back = parseWorkbook(book);
    expect(back.problems.filter((p) => p.sheet === 'MassSource' || p.sheet === 'PointMasses')).toEqual([]);
    const { points: _p, ...rest } = stated;
    expect(back.model.massSource).toEqual(rest);

    applyWorkbook(book);
    const again = modelStore.model.massSource!;
    expect({ ...again, points: undefined }).toEqual({ ...stated, points: undefined });
    expect((again.points ?? []).map((p) => ({ ...p, nodeId: 0 }))).toEqual((stated.points ?? []).map((p) => ({ ...p, nodeId: 0 })));
  });

  it('a weight on a zone or a group is named on the cover as not carried, and its re-import reports it instead of dropping it silently', () => {
    applyWorkbook(frame());
    const ids = [...modelStore.nodes.keys()].sort((a, c) => a - c);
    const group = modelStore.addGroup('upper', 'user' as never, { nodes: [ids[1]!, ids[2]!] });
    modelStore.setMassSource({ kind: 'custom', factors: [{ caseId: 1, factor: 1 }], weights: [
      { on: 'members', w: 0.8, region: { kind: 'box', x: [0, 5], z: [2, 7] } },
      { on: 'members', w: 1.2, region: { kind: 'group', groupId: group } },
      { on: 'floor', w: 2, region: { kind: 'zone', zoneId: 4 } },
    ] });
    const sheets = currentWorkbookSheets(5, { results: false });
    const cover = sheets.find((x) => x.name === 'Cover')!;
    const note = cover.rows.find((r) => String(r[1] ?? '').includes('2') && String(r[0]).length > 0 && /zone|group/i.test(String(r[1])));
    expect(note).toBeDefined();
    const back = parseWorkbook(Object.fromEntries(sheets.map((x) => [x.name, x.rows])));
    const refused = back.problems.filter((p) => p.sheet === 'MassSource' && p.column === 'region');
    expect(refused).toHaveLength(2);
    expect(back.model.massSource).toEqual({ kind: 'custom', factors: [{ caseId: 1, factor: 1 }], weights: [{ on: 'members', w: 0.8, region: { kind: 'box', x: [0, 5], z: [2, 7] } }] });
  });

  it('a mass source without zone or group weights adds no cover note', () => {
    applyWorkbook(frame());
    modelStore.setMassSource({ kind: 'custom', factors: [{ caseId: 1, factor: 1 }], weights: [{ on: 'floor', w: 1, region: { kind: 'all' } }] });
    const cover = currentWorkbookSheets(5, { results: false }).find((x) => x.name === 'Cover')!;
    expect(cover.rows.some((r) => /zone|group/i.test(String(r[1] ?? '')))).toBe(false);
  });

  it('writes no MassSource sheet for a model without a mass source', () => {
    applyWorkbook(frame());
    expect(currentWorkbookSheets(5, { results: false }).some((s) => s.name === 'MassSource')).toBe(false);
  });
});
