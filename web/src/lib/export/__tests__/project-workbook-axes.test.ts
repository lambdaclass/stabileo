import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../../store/active-results';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { parseWorkbook } from '../../excel-import/parse';
import { axesStore } from '../../axes/axes.svelte';
import { makeFrame, pseudoToUser, toUser, type AxesChoice } from '../../axes/frame';
import { tensorToUser } from '../workbook-frame';
import type { WorkbookSheet } from '../workbook-cells';

const YUP: AxesChoice = { up: '+Y', right: '-Z', hand: 'left' };

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); axesStore.reset(); });
afterEach(() => axesStore.reset());

const sheet = (sheets: WorkbookSheet[], name: string) => sheets.find((x) => x.name === name)!;
const records = (s: WorkbookSheet) => s.rows.slice(1).map((r) => Object.fromEntries(s.rows[0]!.map((h, i) => [String(h), r[i]])));
const asImport = (sheets: WorkbookSheet[]) => Object.fromEntries(sheets.map((s) => [s.name, s.rows as unknown[][]]));

function portal() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 1, 3), d = modelStore.addNode(4, 1, 0);
  modelStore.addElement(a, b, 'frame');
  const beam = modelStore.addElement(b, c, 'frame');
  modelStore.addElement(d, c, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'pinned3d');
  for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
  const dead = modelStore.addLoadCase('D', 'D');
  modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, dead);
  modelStore.addNodalLoad3D(b, 5, 2, -1, 0.5, 0, 1, dead);
  modelStore.addCombination('1.2 D', [{ caseId: dead, factor: 1.2 }]);
  const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  return { b, dead };
}

describe('the project workbook in the user axes', () => {
  it('stays as it was in the default axes', () => {
    portal();
    const names = currentWorkbookSheets(2).map((s) => s.name);
    expect(names).not.toContain('Axes');
  });

  it('writes the model, the statics and the results in one frame, says which, and reads back to the same model', () => {
    portal();
    const plain = currentWorkbookSheets(2);
    axesStore.choice = YUP;
    const f = makeFrame(YUP);
    const sheets = currentWorkbookSheets(2);
    expect(sheet(sheets, 'Axes').rows).toEqual([['up', 'right', 'hand'], ['+Y', '-Z', 'left']]);
    const conv = records(sheet(sheets, 'Conventions')).find((r) => r.topic === 'axes')!;
    expect(String(conv.convention)).toContain('up=+Y right=-Z hand=left');

    const node3 = records(sheet(sheets, 'Nodes')).find((r) => r.id === 3)!;
    expect([node3['x [m]'], node3['y [m]'], node3['z [m]']]).toEqual(toUser(f, [4, 1, 3]).map((v) => v + 0));

    const fz = records(sheet(sheets, 'LoadData')).filter((r) => r.type === 'nodal3d');
    const byField = Object.fromEntries(fz.map((r) => [r.field, r.value]));
    expect([byField.fx, byField.fy, byField.fz]).toEqual(toUser(f, [5, 2, -1]).map((v) => v + 0));
    expect([byField.mx, byField.my, byField.mz]).toEqual(pseudoToUser(f, [0.5, 0, 1]).map((v) => v + 0));

    const sup = records(sheet(sheets, 'Supports')).find((r) => r.node === 4)!;
    expect([sup.restrainedRx, sup.restrainedRy, sup.restrainedRz]).toEqual([0, 0, 0]);

    const plainStatics = records(sheet(plain, 'Statics')).filter((r) => r.source === 'case');
    const statics = records(sheet(sheets, 'Statics')).filter((r) => r.source === 'case');
    const get = (rows: typeof statics, k: string) => rows.find((r) => r.component === k)!.reactions as number;
    const model = ['fx', 'fy', 'fz'].map((k) => get(plainStatics, k));
    expect(['fx', 'fy', 'fz'].map((k) => get(statics, k))).toEqual(toUser(f, model as never).map((v) => v + 0));
    expect(get(statics, 'fy')).toBe(get(plainStatics, 'fz'));

    const reaction = records(sheet(sheets, 'Reactions')).find((r) => r.node === 1 && r.source === 'case')!;
    const solved = resultsStore.perCase3D.values().next().value!.reactions.find((x) => x.nodeId === 1)!;
    expect(reaction['Fy [kN]']).toBe(toUser(f, [solved.fx, solved.fy, solved.fz])[1]);

    const back = parseWorkbook(asImport(sheets));
    const plainBack = parseWorkbook(asImport(plain));
    for (const [a, b] of back.model.nodes.map((n, i) => [n, plainBack.model.nodes[i]!] as const)) {
      expect(a.x).toBeCloseTo(b.x, 12); expect(a.y).toBeCloseTo(b.y, 12); expect(a.z ?? 0).toBeCloseTo(b.z ?? 0, 12);
    }
  });

  it('turns a symmetric tensor with the frame', () => {
    const f = makeFrame(YUP);
    const t = { xx: 1, yy: 2, zz: 3, xy: 4, yz: 5, zx: 6 };
    const u = tensorToUser(f, t);
    const M = [[1, 4, 6], [4, 2, 5], [6, 5, 3]];
    const R = f.rows;
    const full = (i: number, j: number) => R[i]!.reduce((s, a, p) => s + R[j]!.reduce((q, b, r) => q + a * b * M[p]![r]!, 0), 0);
    expect(u).toEqual({ xx: full(0, 0), yy: full(1, 1), zz: full(2, 2), xy: full(0, 1), yz: full(1, 2), zx: full(2, 0) });
  });
});
