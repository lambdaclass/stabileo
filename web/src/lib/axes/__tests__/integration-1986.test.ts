import { afterEach, expect, it } from 'vitest';
import { axesStore } from '../axes.svelte';
import { allChoices, makeFrame, planeSigns, supportTypeIn } from '../frame';
import { transformSnapshot } from '../../model/code/frame';
import { axisTokensIn } from '../case-names';
import { stepTextIn } from '../step-doc-frame';
import { verticalCoordIn } from '../typed-frame';
import { ilText, ilSignReversed } from '../user-names';
import { componentShown, redundantText } from '../../../components/fm/fm-text';
import { parseWorkbook } from '../../excel-import/parse';
import { AXES_SHEET, SHEETS, headerFor } from '../../excel-import/schema';
import { buildTemplateWorkbook } from '../../excel-import/template';
import * as XLSX from 'xlsx';
import { setoutPlan } from '../../sheets/plans/extra-plans';
import { pointOnElementText } from '../../engine/calc-report-loads';
import { planePointLoad3D } from '../../engine/member-point-loads';
import { nodeMoveArgs3D, nodeShown3D } from '../node-coords';

const YUP = { up: '+Y', right: '-Z', hand: 'left' } as const;
afterEach(() => axesStore.reset());
const head = (n: string) => SHEETS.find((s) => s.name === n)!.columns.map(headerFor);
const row = (n: string, values: Record<string, unknown>) => SHEETS.find((s) => s.name === n)!.columns.map((c) => values[c.key] ?? '');
const axes = (c = YUP) => [[ 'up', 'right', 'hand' ], [c.up, c.right, c.hand]];

it('known wrong result: #1986 explicit 2D snapshots with zero z stay in the solver plane', () => {
  for (const c of allChoices()) {
    const snap = { analysisMode: '2d', nodes: [[1, { id: 1, x: 2, y: 3, z: 0 }]], loads: [{ type: 'nodal', data: { fx: 5, fz: 7, my: 11 } }] };
    const u = transformSnapshot(snap, c, 'toUser');
    const p = planeSigns(makeFrame(c));
    expect(u.nodes[0]![1]).toEqual({ id: 1, x: p.sx * 2, y: p.sz * 3, z: 0 });
    expect(u.loads[0]!.data).toEqual({ fx: p.sx * 5, fz: p.sz * 7, my: p.sr * 11 });
    expect(transformSnapshot(u, c, 'toModel')).toEqual(snap);
  }
});

it('known wrong result: #1986 workbook directional supports are inverse-mapped', () => {
  const r = parseWorkbook({ [AXES_SHEET]: axes(), Nodes: [head('Nodes'), row('Nodes', { id: 1, x: 1, y: 2, z: 3 })], Supports: [head('Supports'), row('Supports', { node: 1, type: 'rollerXY' })] });
  expect(r.problems).toEqual([]);
  expect(r.model.supports[0]!.type).toBe('rollerYZ');
});

it('known wrong result: #1986 flat workbook springs and settlements map user columns with their units', () => {
  const r = parseWorkbook({ [AXES_SHEET]: axes(), Nodes: [head('Nodes'), row('Nodes', { id: 1, y: 2, z: -3 })], Supports: [['node', 'type', 'kz [N/mm]', 'ky [N/mm]', 'krx [N·mm/rad]', 'dz [mm]', 'dy [mm]'], [1, 'spring', 13, 17, 19000000, 2, -3]] });
  expect(r.problems).toEqual([]);
  expect(r.model.supports[0]).toMatchObject({ kx: 13, ky: 17, kz: 19, dx: -0.002, dz: -0.003 });
});

it('known wrong result: #1986 support labels distinguish spatial Y from legacy plane Y', () => {
  axesStore.choice = { up: '+Y', right: '+X', hand: 'right' };
  expect(supportTypeIn(axesStore.frame, 'rollerY', true)).toBe('rollerZ');
  expect(supportTypeIn(axesStore.frame, 'rollerY', false)).toBe('rollerY');
  expect(supportTypeIn(axesStore.frame, 'guidedY', true)).toBe('guidedZ');
});

it('known wrong result: #1986 moment redundant direction agrees with its displayed reaction in every frame', () => {
  for (const c of allChoices()) {
    axesStore.choice = c;
    for (let component = 0; component < 6; component++) {
      const a = componentShown(component, false, true);
      const text = redundantText({ kind: 'reaction', nodeId: 1, component } as never, { is3D: true, supports: [] } as never);
      expect(text).toContain(`${a.sign < 0 ? '−' : ''}${a.name[1]}`);
      expect(text.includes('−')).toBe(a.sign < 0);
    }
  }
});

it('known wrong result: #1986 adjacent signed case tokens retain each original sign', () => {
  expect(axisTokensIn(makeFrame({ up: '+Y', right: '+X', hand: 'right' }), 'Wind +X+Y')).toBe('Wind +X−Z');
  expect(axisTokensIn(makeFrame(YUP), 'Wind -X-Y')).toBe('Wind +Z-X');
});

it('known wrong result: #1986 a subscript is transformed once even when X and Z swap', () => {
  const f = makeFrame({ up: '+X', right: '+Z', hand: 'right' });
  expect(stepTextIn(f, 'steps.frames.react.caption', 'R_x toward +x, R_z toward +z')).toBe('R_z toward +z, R_x toward +x');
});

it('known wrong result: #1986 hydrostatic equation preserves pressure under reversed height', () => {
  axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
  expect(verticalCoordIn('γ·(level − z)')).toBe('γ·(y − level)');
  axesStore.reset();
  expect(verticalCoordIn('γ·(level − z)')).toBe('γ·(level − z)');
});

it('known wrong result: #1986 influence text preserves signed directions including rotation and horizontal responses', () => {
  axesStore.choice = YUP;
  expect(ilText('Rx', 'Rx toward +X')).toBe('Rz toward −Z');
  expect(ilSignReversed('Rx')).toBe(true);
  expect(ilSignReversed('ry')).toBe(true);
  expect(ilText('ry', 'ry toward +Y')).toBe('ry toward +X');
});

it('known wrong result: #1986 setout angle follows the orientation of reflected plan coordinates', () => {
  axesStore.choice = { up: '+Z', right: '-X', hand: 'left' };
  const drawings = setoutPlan('L1', [{ name: 'C1', x: 2, y: 3, b: 0.2, h: 0.4, rotDeg: 30 }], [], 50, { kind: 'centre' }, (k) => k, (v, d) => v.toFixed(d));
  const text = drawings[1]!.primitives.filter((p) => p.kind === 'text').map((p) => p.text);
  expect(text).toContain('-30.0°');
});

it('reported #1986 global point px remains member-local in the actual load contract', () => {
  axesStore.choice = { up: '+Z', right: '-X', hand: 'left' };
  const load = { elementId: 1, a: 1, p: 0, px: 5, isGlobal: true };
  expect(pointOnElementText(load, { global: 'global' })).toContain('Px=5');
  const F = planePointLoad3D(load, 3, 4, true);
  expect(F.px).toBeCloseTo(3, 12);
  expect(F.pz).toBeCloseTo(4, 12);
});

it('reported #1986 project LoadData and SelfWeight sheets are reported as unsupported', () => {
  const r = parseWorkbook({ [AXES_SHEET]: axes(), Nodes: [head('Nodes'), row('Nodes', { id: 1, x: 1, y: 2, z: 3 })], LoadData: [['load', 'type', 'field', 'value'], [1, 'nodal3d', 'fx', 5]], SelfWeight: [['direction', 'factor'], ['Y', -1]] });
  expect(r.unknownSheets).toEqual(['LoadData', 'SelfWeight']);
  expect(r.model.loads).toEqual([]);
});

it('reported #1986 standing nodes have matching display, edit and creation inverses', () => {
  for (const c of allChoices()) {
    axesStore.choice = c;
    for (const upright of [false, true]) {
      const n = { x: 2, y: 3, z: 0 };
      expect(nodeMoveArgs3D(nodeShown3D(n, upright), upright).map((v) => v + 0)).toEqual([2, 3, 0]);
    }
  }
});

it('known wrong result: #1986 plane template couples keep their magnitude in every frame', () => {
  const spec = SHEETS.find((s) => s.name === 'Loads')!;
  const example = spec.examples.find((r) => r[0] === 'nodal')!;
  const index = spec.columns.findIndex((c) => c.key === 'mz');
  const old = example[index];
  example[index] = 2;
  try {
    for (const c of allChoices()) {
      const wb = buildTemplateWorkbook(XLSX as never, c);
      const sheets = Object.fromEntries(wb.SheetNames.map((n: string) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })]));
      const back = parseWorkbook(sheets as never);
      expect(back.problems).toEqual([]);
      expect(back.model.loads.find((l) => l.type === 'nodal')!.data.my).toBe(2);
    }
  } finally { example[index] = old!; }
});
