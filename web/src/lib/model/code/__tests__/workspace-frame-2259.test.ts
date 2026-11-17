import { expect, it } from 'vitest';
import { allChoices, makeFrame, planeSigns, type AxesChoice } from '../../../axes/frame';
import { modelToUser } from '../../../export/workbook-frame';
import { transformSnapshot } from '../frame';
import { codeToModel, modelToCode } from '../format';

type Snapshot = Record<string, any>;
type Entry = 'snapshot export' | 'snapshot import' | 'code export' | 'code import';
const entries: Entry[] = ['snapshot export', 'snapshot import', 'code export', 'code import'];

function read(code: string): Snapshot {
  const parsed = codeToModel(code);
  expect(parsed.errors).toEqual([]);
  expect(parsed.snapshot).not.toBeNull();
  return parsed.snapshot!;
}

function convert(snap: Snapshot, choice: AxesChoice, entry: Entry): Snapshot {
  if (entry === 'snapshot export') return transformSnapshot(snap, choice, 'toUser');
  if (entry === 'snapshot import') return transformSnapshot(snap, choice, 'toModel');
  if (entry === 'code export') return read(modelToCode(snap as never, choice).split('\n').filter(line => !line.startsWith('frame ')).join('\n'));
  return read(`${modelToCode(snap as never)}\nframe up="${choice.up}" right="${choice.right}" hand="${choice.hand}"\n`);
}

function snapshot(mode: string | undefined, depth: number | undefined): Snapshot {
  return {
    ...(mode === undefined ? {} : { analysisMode: mode }),
    nodes: [[1, { id: 1, x: 2, y: 3, ...(depth === undefined ? {} : { z: depth }) }]],
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 1, fx: 5, fz: 7, my: 11 } }],
  };
}

function expectPlane(snap: Snapshot, choice: AxesChoice, entry: Entry): void {
  const shown = convert(snap, choice, entry);
  const p = planeSigns(makeFrame(choice));
  expect(shown.nodes).toEqual([[1, { ...snap.nodes[0][1], x: p.sx * 2, y: p.sz * 3 }]]);
  expect(shown.loads[0].data).toEqual({ id: 1, nodeId: 1, fx: p.sx * 5, fz: p.sz * 7, my: p.sr * 11 });
}

it.each(entries)('known wrong result: #2259 explicit plane modes override zero depth through %s', entry => {
  for (const choice of allChoices()) for (const mode of ['2d', 'edu']) for (const depth of [undefined, 0]) {
    expectPlane(snapshot(mode, depth), choice, entry);
  }
});

it.each(entries)('spatial modes and mode-less depth retain their coordinate transforms through %s', entry => {
  for (const choice of allChoices()) for (const mode of ['3d', 'pro', undefined]) for (const depth of [undefined, 0]) {
    const snap = snapshot(mode, depth);
    if (mode === undefined && depth === undefined) {
      expectPlane(snap, choice, entry);
      continue;
    }
    const shown = convert(snap, choice, entry);
    const f = makeFrame(choice);
    const matrix = entry.endsWith('import') ? f.rows[0].map((_, i) => f.rows.map(row => row[i]!)) : f.rows;
    const vector = (v: number[]) => matrix.map(row => row.reduce((sum, x, i) => sum + x * v[i]!, 0) + 0);
    const n = shown.nodes[0][1];
    expect([n.x, n.y, n.z ?? 0]).toEqual(vector([2, 3, 0]));
    const d = shown.loads[0].data;
    expect([d.fx ?? 0, d.fy ?? 0, d.fz ?? 0]).toEqual(vector([5, 0, 7]));
    expect([d.mx ?? 0, d.my ?? 0, d.mz ?? 0]).toEqual(vector([0, 11, 0]).map(x => x * f.det + 0));
  }
});

it('workbook model conversion retains the shared spatial transform for zero depth', () => {
  for (const choice of allChoices()) {
    const snap = snapshot('pro', 0);
    const m = { nodes: new Map(snap.nodes), loads: snap.loads };
    const shown = modelToUser(m, makeFrame(choice));
    const expected = convert(snap, choice, 'snapshot export');
    expect([...shown.nodes]).toEqual(expected.nodes);
    expect(shown.loads).toEqual(expected.loads);
  }
});
