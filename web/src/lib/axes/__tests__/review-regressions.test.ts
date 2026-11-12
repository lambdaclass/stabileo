import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axesStore } from '../axes.svelte';
import { distributedText, pointOnElementText } from '../../engine/calc-report-loads';
import { parseWorkbook } from '../../excel-import/parse';
import { AXES_SHEET, SHEETS, headerFor } from '../../excel-import/schema';

afterEach(() => axesStore.reset());

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const words = { global: 'global' };
const DOWN_UP = { up: '-Z', right: '+X', hand: 'right' } as const;

describe('review regressions', () => {
  it('the loads table has one values cell per row', () => {
    expect(read('components/tables/LoadsTable.svelte').match(/class="load-values"/g)?.length).toBe(1);
  });

  it('the Basic report prints a global plane load as the user typed it', () => {
    expect(distributedText({ qI: -10, qJ: -10, angle: 30, isGlobal: true }, words)).toContain('θ=30°');
    axesStore.choice = DOWN_UP;
    const dist = distributedText({ qI: -10, qJ: -10, angle: 30, isGlobal: true }, words);
    expect(dist).toContain('q=10');
    expect(dist).toContain('θ=-30°');
    expect(pointOnElementText({ a: 1, p: -5, isGlobal: true }, words)).toContain('P=5');
    expect(pointOnElementText({ a: 1, p: -5 }, words)).toContain('P=-5');
  });

  it('the Excel import stores a global plane line load typed in the user axes', () => {
    const headers = (name: string) => SHEETS.find((s) => s.name === name)!.columns.map(headerFor);
    const rowOf = (name: string, cells: Record<string, string | number>) => SHEETS.find((s) => s.name === name)!.columns.map((c) => cells[c.key] ?? '');
    const sheets: Record<string, unknown[][]> = {
      [AXES_SHEET]: [['up', 'right', 'hand'], ['-Z', '+X', 'right']],
      Nodes: [headers('Nodes'), rowOf('Nodes', { id: 1, x: 0, y: 0 }), rowOf('Nodes', { id: 2, x: 4, y: 0 })],
      Materials: [headers('Materials'), rowOf('Materials', { id: 1, name: 'S', E: 200000, nu: 0.3 })],
      Sections: [headers('Sections'), rowOf('Sections', { id: 1, name: 'R', A: 0.01, Iz: 1e-4 })],
      Members: [headers('Members'), rowOf('Members', { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, material: 1, section: 1 })],
      Loads: [headers('Loads'), rowOf('Loads', { type: 'distributed', case: 1, member: 1, qi: -10, qj: -6, dir: 'global' })],
    };
    const r = parseWorkbook(sheets);
    const load = r.model.loads.find((l) => l.type === 'distributed')?.data as Record<string, number> | undefined;
    expect(r.problems, JSON.stringify(r.problems)).toEqual([]);
    expect(load).toMatchObject({ qI: 10, qJ: 6, isGlobal: true });
  });

  it('the results CSV keeps the ry header under the default axes', () => {
    expect(read('lib/store/file.ts')).toContain('r${twoD.normal.toLowerCase()} (rad)');
  });

  it('cards that default to a user axis reset it when the axes change', () => {
    for (const f of ['components/pro/loads/ProWriteLoadCard.svelte', 'components/pro/loads/ProShellLoadForm.svelte', 'components/pro/loads/LoadTargetPicker.svelte', 'components/pro/ProConstraintsTab.svelte', 'components/pro/ProTransformPanel.svelte']) {
      expect(read(f), f).toMatch(/if \(k === shownAxes\) return;/);
    }
  });
});

describe('inclined 2D supports', () => {
  it('turn their global angle with a mirrored plane in the model code, and keep a member-axis angle', async () => {
    const { transformSnapshot } = await import('../../model/code/frame');
    const snap = { analysisMode: '2d', nodes: [[1, { id: 1, x: 0, y: 0 }]], supports: [[1, { id: 1, nodeId: 1, type: 'rollerX', angle: 30 }], [2, { id: 2, nodeId: 1, type: 'rollerX', angle: 30, isGlobal: false }]], loads: [] };
    const u = transformSnapshot(snap, { up: '+Z', right: '-X', hand: 'left' }, 'toUser') as typeof snap;
    const angleOf = (i: number) => (u.supports[i]![1] as { angle: number }).angle;
    expect(angleOf(0)).toBe(-30);
    expect(angleOf(1)).toBe(30);
    expect(transformSnapshot(u, { up: '+Z', right: '-X', hand: 'left' }, 'toModel')).toEqual(snap);
  });
});

describe('member joints in the model code', () => {
  it('are written in the user DOF order and read back as stored', async () => {
    const { transformSnapshot } = await import('../../model/code/frame');
    const joint = [false, false, true, false, true, false];
    const snap = { analysisMode: 'pro', nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]], elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, jointJ: { dof: joint } }]], supports: [], loads: [] };
    const choice = { up: '+Y', right: '+X', hand: 'right' } as const;
    const u = transformSnapshot(snap, choice, 'toUser') as typeof snap;
    expect((u.elements[0]![1] as { jointJ: { dof: boolean[] } }).jointJ.dof).toEqual([false, true, false, false, false, true]);
    expect(transformSnapshot(u, choice, 'toModel').elements).toEqual(snap.elements);
  });
});
