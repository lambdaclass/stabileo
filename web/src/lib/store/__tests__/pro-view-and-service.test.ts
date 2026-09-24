/**
 * Story drift on the columns, one deflection check for concrete and steel, named views, and the
 * selection that reads like the selected members.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { storyDrifts } from '../../engine/story-drift';
import { groupByParallel } from '../../engine/design/member-grouping';
import { memberLabelText, selectionNodeIds } from '../view-state.svelte';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { deflectionChecks, LONG_TERM_FACTOR } from '../serviceability';
import { modelToCode, codeToModel } from '../../model/code/format';

const disp = (nodeId: number, ux: number, uy = 0, uz = 0) => ({ nodeId, ux, uy, uz });

describe('story drift', () => {
  // Two stories, Z up; the second floor twists, so its two columns drift differently.
  const nodes = new Map([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }],
    [3, { x: 0, y: 0, z: 3 }], [4, { x: 6, y: 0, z: 3 }],
    [5, { x: 0, y: 0, z: 6.5 }], [6, { x: 6, y: 0, z: 6.5 }],
  ]);
  const els = [
    { id: 1, nodeI: 1, nodeJ: 3 }, { id: 2, nodeI: 2, nodeJ: 4 },
    { id: 3, nodeI: 3, nodeJ: 5 }, { id: 4, nodeI: 4, nodeJ: 6 },
    { id: 5, nodeI: 3, nodeJ: 4 }, { id: 6, nodeI: 5, nodeJ: 6 },
  ];
  const d = [disp(1, 0), disp(2, 0), disp(3, 0.006, 0.001, -0.002), disp(4, 0.006, 0.001, -0.002), disp(5, 0.010, 0.002, -0.003), disp(6, 0.016, 0.003, -0.003)];

  it('is each column’s relative lateral displacement over its height, the worst per story', () => {
    const s = storyDrifts(nodes, els, d, { limit: 0.015 });
    expect(s.map((x) => x.level)).toEqual([3, 6.5]);
    expect(s[0]!.ratioX).toBeCloseTo(0.006 / 3, 12);
    expect(s[0]!.ratioY).toBeCloseTo(0.001 / 3, 12);
    // Column 4 drifts 10 mm over 3.5 m; column 3 only 4 mm. The story is its worst column.
    expect(s[1]!.ratioX).toBeCloseTo(0.010 / 3.5, 12);
    expect(s[1]!.columnX).toBe(4);
  });

  it('never reads the vertical displacement as a drift, nor a plan row as a level', () => {
    const s = storyDrifts(nodes, els, d, { limit: 0.015 });
    for (const x of s) {
      expect(x.driftX).not.toBeCloseTo(0.002, 6);
      expect([3, 6.5]).toContain(x.level);
    }
  });

  it('a flat model solved in XZ is read in that frame', () => {
    const flat = new Map([[1, { x: 0, y: 0 }], [2, { x: 0, y: 4 }]]);
    const s = storyDrifts(flat, [{ id: 1, nodeI: 1, nodeJ: 2 }], [disp(1, 0), disp(2, 0.02, 0, -0.001)], { limit: 0.015, embedded2D: true });
    expect(s).toHaveLength(1);
    expect(s[0]!.ratioX).toBeCloseTo(0.005, 12);
    expect(s[0]!.ratioY).toBe(0);
    expect(s[0]!.status).toBe('ok');
  });
});

describe('selection like the selected members', () => {
  const model = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }], [3, { id: 3, x: 0, y: 4, z: 0 }], [4, { id: 4, x: 5, y: 4, z: 0 }], [5, { id: 5, x: 0, y: 0, z: 3 }]]),
    elements: new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
      [2, { id: 2, nodeI: 4, nodeJ: 3, sectionId: 1, materialId: 1, type: 'frame' }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, sectionId: 2, materialId: 1, type: 'frame' }],
      [4, { id: 4, nodeI: 1, nodeJ: 5, sectionId: 2, materialId: 1, type: 'frame' }],
    ]),
    sections: new Map(), materials: new Map(), supports: new Map(),
  };
  it('parallel takes the direction, either way round, not the line', () => {
    expect(groupByParallel(model as never, [1])).toEqual([1, 2]);
    expect(groupByParallel(model as never, [4])).toEqual([4]);
  });
  it('a member label reads the id, the section or the material; framing a member takes its ends', () => {
    const e = { id: 7, sectionId: 3, materialId: 2 };
    expect(memberLabelText('section', e, new Map([[3, { name: 'IPE 300' }]]), new Map())).toBe('IPE 300');
    expect(memberLabelText('material', e, new Map(), new Map([[2, { name: 'S275' }]]))).toBe('S275');
    expect(memberLabelText('id', e, new Map(), new Map())).toBe('7');
    expect([...selectionNodeIds([9], [1], model.elements)].sort()).toEqual([1, 2, 9]);
  });
});

describe('named views', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('are saved with the project, carried by the code, and undoable without retiring the solve', async () => {
    await initSolver();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 1, 0, 0, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    const before = historyStore.undoCount;
    const id = modelStore.saveView('North frame', { x: 10, y: -20, z: 5 }, { x: 0, y: 0, z: 1.5 });
    expect(historyStore.undoCount).toBe(before + 1);
    expect(resultsStore.results3D).not.toBeNull();
    expect(modelStore.views).toEqual([{ id, name: 'North frame', position: { x: 10, y: -20, z: 5 }, target: { x: 0, y: 0, z: 1.5 } }]);
    expect(codeToModel(modelToCode(modelStore.snapshot())).snapshot!.views).toEqual(modelStore.views);
    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.views).toEqual([]);
    modelStore.restore(snap);
    expect(modelStore.views[0]!.name).toBe('North frame');
    modelStore.removeView(id);
    expect(modelStore.snapshot().views).toBeUndefined();
  });
});

describe('one deflection check for concrete and steel', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  function beam(material: { e: number; fy: number }) {
    modelStore.clear();
    const mid = modelStore.addMaterial({ name: 'M', nu: 0.2, rho: 25, ...material } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e, mid);
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    modelStore.addDistributedLoad3D(e, 0, 0, -5, -5);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    return e;
  }

  it('concrete adds its long-term deflection, steel does not; the immediate one is the same curve', () => {
    const c = beam({ e: 30000, fy: 25 });
    const conc = deflectionChecks().rows.get(c)!;
    expect(conc.family).toBe('concrete');
    expect(conc.check.deltaTotal).toBeCloseTo(conc.check.deltaImm * (1 + LONG_TERM_FACTOR.concrete), 12);
    const s = beam({ e: 200000, fy: 250 });
    const steel = deflectionChecks().rows.get(s)!;
    expect(steel.family).toBe('steel');
    expect(steel.check.deltaTotal).toBe(steel.check.deltaImm);
    expect(steel.check.limit).toBeCloseTo(6 / 360, 12);
  });
});
