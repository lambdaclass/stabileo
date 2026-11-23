import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve() {
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

/** A 6 × 6 m flat slab, 20 cm, pinned all round, on one 40×40 column at its centre, 12 kPa D under 1.4D. */
function flatSlab() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const N = 6, id: number[][] = [];
  for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(-3 + i, -3 + j, 3)); }
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) modelStore.addSurfaceLoad3D(modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], conc, 0.2), 12, D);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (i === 0 || j === 0 || i === N || j === N) modelStore.addSupport(id[i]![j]!, 'pinned3d');
  const base = modelStore.addNode(0, 0, 0), top = id[3]![3]!;
  const below = modelStore.addElement(base, top, 'frame');
  modelStore.updateElementSection(below, col); modelStore.updateElementMaterial(below, conc);
  modelStore.addSupport(base, 'fixed3d');
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  return { conc, col, top, below, D, edge: { x: id[6]![3]!, y: id[3]![6]! } };
}

describe('punching at a slab-column joint', () => {
  it('reads the column standing on the joint even when it was drawn as another member', () => {
    const s = flatSlab();
    const head = modelStore.addNode(0, 0, 6);
    const above = modelStore.addElement(s.top, head, 'frame');
    modelStore.updateElementSection(above, s.col); modelStore.updateElementMaterial(above, s.conc);
    modelStore.addNodalLoad3D(head, 0, 0, -300, 0, 0, 0, s.D);
    modelStore.addGroup('C1', 'physicalMember', { elements: [s.below] }, { data: { kind: 'column', provenance: 'declared' } });
    modelStore.addGroup('C2', 'physicalMember', { elements: [above] }, { data: { kind: 'column', provenance: 'declared' } });
    solve();
    const p = buildSheetRows().punching.find((r) => r.name === 'C1')!;
    const forces = resultsStore.perCombo3D.values().next().value!.elementForces;
    const nBelow = Math.abs(forces.find((f) => f.elementId === s.below)!.nEnd), nAbove = Math.abs(forces.find((f) => f.elementId === above)!.nStart);
    expect(nAbove).toBeGreaterThan(400);
    expect(p.vu).toBeLessThanOrEqual((nBelow - nAbove) * 1.01);
  });

  it('is checked where beams reach the column one way only, and left to the beams where they reach it both ways', () => {
    const s = flatSlab();
    const beam = (to: number) => { const b = modelStore.addElement(s.top, to, 'frame'); modelStore.updateElementSection(b, s.col); modelStore.updateElementMaterial(b, s.conc); };
    beam(s.edge.x);
    solve();
    expect(buildSheetRows().punching).toHaveLength(1);
    beam(s.edge.y);
    solve();
    expect(buildSheetRows().punching).toHaveLength(0);
  });
});
