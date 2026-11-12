import { describe, it, expect, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplateWorkbook } from '../template';
import { parseWorkbook } from '../parse';
import { AXES_SHEET, SHEETS, headerFor } from '../schema';
import { allChoices, makeFrame, pseudoToModel, toModel, type AxesChoice } from '../../axes/frame';
import { axesStore } from '../../axes/axes.svelte';

const YUP: AxesChoice = { up: '+Y', right: '-Z', hand: 'left' };

function readBack(wb: unknown): Record<string, unknown[][]> {
  const back = XLSX.read(XLSX.write(wb as never, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of back.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(back.Sheets[name], { header: 1, defval: '', blankrows: false }) as unknown[][];
  }
  return sheets;
}

const headers = (name: string) => SHEETS.find((s) => s.name === name)!.columns.map(headerFor);
function rowOf(name: string, cells: Record<string, string | number>): Array<string | number> {
  return SHEETS.find((s) => s.name === name)!.columns.map((c) => cells[c.key] ?? '');
}

afterEach(() => axesStore.reset());

function comparable(loads: Array<{ type: string; data: Record<string, unknown> }>) {
  return loads.map((l) => {
    const data = { ...l.data };
    delete data.id;
    if (l.type === 'nodal') delete data.fy;
    return { type: l.type, data };
  });
}
const others = (loads: ReturnType<typeof comparable>) => loads.filter((l) => l.type !== 'distributed3d');
const spatial = (loads: ReturnType<typeof comparable>) => loads.filter((l) => l.type === 'distributed3d');

describe('a workbook in the user axes', () => {
  it('the template written in any of the 48 frames imports to the same model as the default one', () => {
    const plain = parseWorkbook(readBack(buildTemplateWorkbook(XLSX as never, null)));
    expect(plain.problems).toEqual([]);
    for (const c of allChoices()) {
      const r = parseWorkbook(readBack(buildTemplateWorkbook(XLSX as never, c)));
      expect(r.problems, JSON.stringify(c)).toEqual([]);
      expect(r.unknownSheets).toEqual([]);
      expect(r.model.nodes, JSON.stringify(c)).toEqual(plain.model.nodes);
      const mine = comparable(r.model.loads), theirs = comparable(plain.model.loads);
      expect(others(mine), JSON.stringify(c)).toEqual(others(theirs));
      // A global member load that needs a column along the user's X is left out of the template, never turned local.
      for (const l of spatial(mine)) expect(spatial(theirs), JSON.stringify(c)).toContainEqual(l);
      expect(r.model.supports).toEqual(plain.model.supports);
    }
  });

  it('writes the frame only when it is not the default, and the default template stays as it was', () => {
    axesStore.reset();
    expect(Object.keys(readBack(buildTemplateWorkbook(XLSX as never)))).not.toContain(AXES_SHEET);
    axesStore.choice = YUP;
    const sheets = readBack(buildTemplateWorkbook(XLSX as never));
    expect(sheets[AXES_SHEET]).toEqual([['up', 'right', 'hand'], ['+Y', '-Z', 'left']]);
    const nodes = sheets.Nodes!;
    const head = (nodes[0] as string[]).map((h) => h.split(' ')[0]);
    const third = nodes[3] as Array<string | number>;
    expect(third[head.indexOf('y')]).toBe(4);
    expect(third[head.indexOf('z')]).toBe(-6);
    expect(third[head.indexOf('x')]).toBe('');
  });

  it('reads coordinates, nodal loads, springs and settlements in the declared frame', () => {
    const f = makeFrame(YUP);
    const sheets: Record<string, unknown[][]> = {
      [AXES_SHEET]: [['up', 'right', 'hand'], ['+Y', '-Z', 'left']],
      Nodes: [headers('Nodes'), rowOf('Nodes', { id: 1, x: 1, y: 2, z: 3 }), rowOf('Nodes', { id: 2, x: 0, y: 5, z: 0 })],
      Supports: [headers('Supports'), rowOf('Supports', { node: 1, type: 'spring', kx: 10, ky: 20, krz: 7, dy: -0.01 })],
      Loads: [headers('Loads'), rowOf('Loads', { type: 'nodal3d', case: 1, node: 2, fx: 1, fy: -10, fz: 2, mx: 3, my: 0, mz: 4 })],
    };
    const r = parseWorkbook(sheets);
    expect(r.problems).toEqual([]);
    const [x, y, z] = toModel(f, [1, 2, 3]);
    expect(r.model.nodes[0]).toMatchObject({ x: x + 0, y: y + 0, z: z + 0 });
    expect(r.model.nodes[0]).toMatchObject({ x: -3, y: 1, z: 2 });
    const load = r.model.loads[0]!.data as Record<string, number>;
    const F = toModel(f, [1, -10, 2]).map((v) => v + 0), M = pseudoToModel(f, [3, 0, 4]).map((v) => v + 0);
    expect([load.fx, load.fy, load.fz]).toEqual(F);
    expect([load.mx, load.my, load.mz]).toEqual(M);
    expect(load.fz).toBe(-10);
    const s = r.model.supports[0] as Record<string, number>;
    expect(s.ky).toBe(10);
    expect(s.kz).toBe(20);
    expect(s.krx).toBe(7);
    expect(s.dz).toBe(-0.01);
  });

  it('reads a flat model whose depth column is empty, with its height and couple in the user axes', () => {
    const sheets: Record<string, unknown[][]> = {
      [AXES_SHEET]: [['up', 'right', 'hand'], ['-Y', '+X', 'right']],
      Nodes: [headers('Nodes'), rowOf('Nodes', { id: 1, x: 2, y: -3 }), rowOf('Nodes', { id: 2, x: 0, y: 0 })],
      Loads: [headers('Loads'), rowOf('Loads', { type: 'nodal', case: 1, node: 1, fx: 5, fy: 10, mz: 2 })],
    };
    const r = parseWorkbook(sheets);
    expect(r.problems).toEqual([]);
    expect(r.model.nodes[0]).toMatchObject({ x: 2, y: 3, z: 0 });
    const load = r.model.loads[0]!.data as Record<string, number>;
    expect(load.fx).toBe(5);
    expect(load.fz).toBe(-10);
    const f = makeFrame({ up: '-Y', right: '+X', hand: 'right' });
    expect(load.my).toBe(pseudoToModel(f, [0, 0, 2])[1] + 0);
  });

  it('reads a flat model\'s global support angle in the user axes: a mirrored vertical turns it the other way', () => {
    const sheets: Record<string, unknown[][]> = {
      [AXES_SHEET]: [['up', 'right', 'hand'], ['-Y', '+X', 'right']],
      Nodes: [headers('Nodes'), rowOf('Nodes', { id: 1, x: 2, y: -3 }), rowOf('Nodes', { id: 2, x: 0, y: 0 })],
      Supports: [headers('Supports'), rowOf('Supports', { node: 2, type: 'rollerX', angle: 30 })],
    };
    const r = parseWorkbook(sheets);
    expect(r.problems).toEqual([]);
    expect((r.model.supports[0] as { angle?: number }).angle).toBe(-30);
  });

  it('refuses a frame it cannot read and falls back to the model axes', () => {
    const r = parseWorkbook({
      [AXES_SHEET]: [['up', 'right', 'hand'], ['+Y', '+Y', 'right']],
      Nodes: [headers('Nodes'), rowOf('Nodes', { id: 1, x: 1, z: 2 })],
    });
    expect(r.problems.map((p) => p.sheet)).toEqual([AXES_SHEET]);
    expect(r.model.nodes[0]).toMatchObject({ x: 1, y: 2, z: 0 });
  });
});
