import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { resizeHints, supportWallBases, wallsToHold } from '../rc-sheets-resize';
import { holdWallBasesAndDesign, sheetsSolve, solveAndDesign } from '../rc-sheets-solve.svelte';
import type { SheetRow } from '../rc-sheets.svelte';

const wall = (key: string, unheld: number[], status: 'ok' | 'fail' = 'fail') =>
  ({ family: 'wall', key, status, verifications: unheld.length ? [{ label: 'rcSheets.v.wallBase', ok: false }] : [], demand: { thickness: 0.2, base: { nodes: unheld.length + 1, held: 1, unheld } } }) as unknown as SheetRow;

describe('holding the walls\' bases all along', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); resultsStore.clear(); });

  it('holds every wall on the foundation in one undo step, with the support the foundation has', () => {
    const a = [0, 1, 2].map((x) => modelStore.addNode(x, 0, 0));
    const b = [0, 1, 2].map((y) => modelStore.addNode(5, y, 0));
    modelStore.addSupport(a[0]!, 'pinned3d');
    modelStore.addSupport(b[0]!, 'pinned3d');
    const rows = [wall('wall:1:0', [a[1]!, a[2]!]), wall('wall:2:0', [b[1]!, b[2]!])];
    expect(wallsToHold(rows).map((r) => r.key)).toEqual(['wall:1:0', 'wall:2:0']);
    expect(supportWallBases(rows)).toBe(4);
    const types = [...modelStore.supports.values()].map((s) => [s.nodeId, s.type]);
    expect(types).toEqual(expect.arrayContaining([a[1], a[2], b[1], b[2]].map((n) => [n, 'pinned3d'])));
    historyStore.undo();
    expect(modelStore.supports.size).toBe(2);
  });

  it('leaves a wall standing on a floor above alone: a support there would hold it in mid-air', () => {
    const ground = modelStore.addNode(0, 0, 0);
    modelStore.addSupport(ground, 'fixed3d');
    const up = [0, 1].map((x) => modelStore.addNode(x, 0, 3));
    const rows = [wall('wall:3:1', up)];
    expect(wallsToHold(rows)).toEqual([]);
    expect(supportWallBases(rows)).toBe(0);
    expect(modelStore.supports.size).toBe(1);
  });

  it('does nothing for a wall already held, or another family', () => {
    expect(supportWallBases([wall('wall:1:0', [], 'ok'), { family: 'beam', key: 'beam:1', status: 'fail' } as never])).toBe(0);
  });

  it('proposes no thickness for a wall that fails only because its base is not held', () => {
    const n = modelStore.addNode(1, 0, 0);
    expect(resizeHints(wall('wall:1:0', [n]))).toEqual([]);
  });

  it('solves again and designs once the supports are in, and says when the solve gave nothing', async () => {
    const n = [0, 1].map((x) => modelStore.addNode(x, 0, 0));
    modelStore.addSupport(n[0]!, 'fixed3d');
    let solves = 0;
    const failing = async () => { solves++; return { ok: false as const, error: 'x' }; };
    expect(await holdWallBasesAndDesign([wall('wall:1:0', [n[1]!])], failing)).toBe(1);
    expect(solves).toBe(1);
    expect(modelStore.supports.size).toBe(2);
    expect(sheetsSolve.busy).toBe(false);
    expect(await solveAndDesign(async () => ({ ok: true as const, combinationsLeftOut: null }))).toBe(false);
    expect(await holdWallBasesAndDesign([wall('wall:1:0', [n[1]!])], failing)).toBe(0);
    expect(solves).toBe(1);
  });
});
