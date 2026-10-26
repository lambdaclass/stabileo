/**
 * Copying a frame onto a different one, and a floor onto another: the two-bay frame on two levels,
 * the upper level's second beam given another section. The copy writes the members that fit (one
 * undo step) and lists the one that does not; a project tolerance groups frames whose lengths
 * differ by a few millimetres.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { applyFrameCopy, lineLevels, modelBeamLines, previewFloorCopy, previewFrameCopy } from '../frame-equalize';
import { lineAxis } from '../line-axis';
import { rebarHash } from '../../engine/design/rebar-hash';
import { mirrorReinforcement, repeatedFrames } from '../../engine/design/repeated-frames';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

function designed() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  stateSuiteLateral();
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const other = modelStore.addSection({ name: '20×40', a: 0.08, iy: 0.00107, iz: 0.000267, j: 0.0006, b: 0.2, h: 0.4, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  const at = (z: number, x: number) => beams.find((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - z) < 1e-6 && Math.min(a.x, b.x) < x && Math.max(a.x, b.x) > x; })!.id;
  modelStore.updateElementSection(at(6, 7), other);
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -20, -20, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  const lineAt = (z: number) => modelBeamLines().find((l) => Math.abs(lineAxis(l)!.start.z - z) < 1e-6)!;
  return { at, lineAt };
}

describe('copying onto a different frame', () => {
  it('the frames no longer repeat, and the copy says which member does not fit', () => {
    const { at, lineAt } = designed();
    expect(repeatedFrames(modelBeamLines())).toEqual([]);
    const [plan] = previewFrameCopy(lineAt(3), [lineAt(6)]);
    const byTarget = new Map(plan!.rows.map((r) => [r.target, r.status]));
    expect(byTarget.get(at(6, 2))).toBe('copy');
    expect(byTarget.get(at(6, 7))).toBe('section');
  });

  it('writes the members that fit, in one undo step, and leaves the rest as they were', () => {
    const { at, lineAt } = designed();
    // The first level's first beam given heavier bars by hand, so the copy has something to move.
    const heavy = JSON.parse(JSON.stringify(modelStore.elements.get(at(3, 2))!.reinforcement!));
    heavy.regions.bottomSpanLayers = [{ count: 4, diameter: 16, row: 0 }]; heavy.regions.bottomSpan = { count: 4, diameter: 16 };
    delete heavy.regions.bottomGroups;
    modelStore.reinforcementTransaction((api) => api.setReinforcement(at(3, 2), heavy));
    const src = modelStore.elements.get(at(3, 2))!.reinforcement!;
    const untouched = rebarHash(modelStore.elements.get(at(6, 7))!.reinforcement!);
    const before = rebarHash(modelStore.elements.get(at(6, 2))!.reinforcement!);
    const plans = previewFrameCopy(lineAt(3), [lineAt(6)]);
    const written = applyFrameCopy(plans);
    expect(written).toEqual([at(6, 2)]);
    const row = plans[0]!.rows.find((r) => r.target === at(6, 2))!;
    expect(rebarHash(modelStore.elements.get(at(6, 2))!.reinforcement!)).toBe(rebarHash(row.mirror ? mirrorReinforcement(src) : src));
    expect(rebarHash(modelStore.elements.get(at(6, 7))!.reinforcement!)).toBe(untouched);
    historyStore.undo();
    expect(rebarHash(modelStore.elements.get(at(6, 2))!.reinforcement!)).toBe(before);
  });

  it('a floor onto another: line by line on the same plan line', () => {
    designed();
    expect(lineLevels()).toEqual([3, 6]);
    const f = previewFloorCopy(3, 6);
    expect(f.unmatched).toEqual([]);
    expect(f.plans).toHaveLength(1);
    expect(f.plans[0]!.rows.map((r) => r.status).sort()).toEqual(['copy', 'section']);
  });
});

describe('repeated frames with a tolerance', () => {
  it('lengths a few millimetres apart repeat under a tolerance, not without one', () => {
    const l = (id: string, sig: string[]) => ({ id, label: id, members: sig.map((_, i) => i), forward: sig.map(() => true), signature: sig });
    const lines = [l('a', ['5000:1', '4000:1']), l('b', ['5015:1', '3990:1']), l('c', ['5000:2', '4000:1'])];
    expect(repeatedFrames(lines)).toEqual([]);
    expect(repeatedFrames(lines, 20).map((g) => g.lines.map((x) => x.id))).toEqual([['a', 'b']]);
  });
});
