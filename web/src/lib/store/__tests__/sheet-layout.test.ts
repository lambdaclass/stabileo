/**
 * The composition adjusted by hand survives a regeneration: a drawing moved to another sheet and
 * given another scale, placed at a point, a text moved, an annotation added, are all applied again
 * after the sheets are laid out anew; when the drawing changed size the adjustment is listed, not
 * applied over it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { addAnnotation, adjustDrawing, projectSheetSet, setSheetEntries, sheetLanguage } from '../sheet-set';
import { textKeys } from '../../sheets/sheet-layout';
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

function project() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  setSheetEntries([{ id: 'formwork', kind: 'formwork' }, { id: 'setout', kind: 'setout' }]);
}

/** The setting-out plan's key (its level reads in the sheets' language). */
const SO = 'setout:setout-base';
const sheetOf = (ss: ReturnType<typeof projectSheetSet>, key: string) => ss.find((s) => s.drawings.includes(key))!;
const placedOf = (ss: ReturnType<typeof projectSheetSet>, key: string) => sheetOf(ss, key).placed!.find((p) => p.key === key)!;

describe('a composition adjusted by hand', () => {
  it('a drawing moved to another sheet and given another scale keeps both after a regeneration', () => {
    project();
    const a = projectSheetSet(null, 'A');
    const fw = a.flatMap((s) => s.placed ?? []).find((p) => p.key.startsWith('formwork:'))!;
    const so = a.flatMap((s) => s.placed ?? []).find((p) => p.key === SO)!;
    expect(sheetOf(a, fw.key).number).not.toBe(sheetOf(a, so.key).number);
    adjustDrawing(fw, { withDrawing: so.key, scale: 200 });
    // A regeneration lays the sheets out anew, then applies the two adjustments.
    const b = projectSheetSet(null, 'A');
    expect(sheetOf(b, fw.key).number).toBe(sheetOf(b, so.key).number);
    expect(placedOf(b, fw.key).scale).toBe(200);
    expect(b[0]!.layoutConflicts).toBeUndefined();
  });

  it('a drawing placed at a point, a text moved inside it and an annotation are applied again', () => {
    project();
    const a = projectSheetSet(null, 'A');
    const so = placedOf(a, SO);
    // A text of the plan: the first column's name.
    const sheet = sheetOf(a, so.key);
    const before = sheet.primitives.find((p) => p.kind === 'text' && p.text === 'C1') as { at: { x: number; y: number } };
    const key = [...textKeys(projectSheetSetDrawing(so.key)).values()].find((k) => k.endsWith(':C1'))!;
    adjustDrawing(so, { at: { x: so.x + 30, y: so.y }, moves: { [key]: { x: 0, y: 5 } } });
    addAnnotation(so.key, { x: 60, y: 300 }, 'Ver nota 3');
    const b = projectSheetSet(null, 'A'), s2 = sheetOf(b, so.key), p2 = placedOf(b, so.key);
    expect(p2.x).toBeCloseTo(so.x + 30, 6);
    const after = s2.primitives.find((p) => p.kind === 'text' && p.text === 'C1') as { at: { x: number; y: number } };
    expect(after.at.x - before.at.x).toBeCloseTo(30, 6);
    expect(after.at.y - before.at.y).toBeCloseTo(5, 6);
    expect(s2.primitives.some((p) => p.kind === 'text' && p.text === 'Ver nota 3')).toBe(true);
  });

  it('when the drawing changed size the adjustment is listed, not applied', () => {
    project();
    const a = projectSheetSet(null, 'A');
    const so = placedOf(a, SO);
    adjustDrawing(so, { at: { x: so.x + 30, y: so.y } });
    // The frame grows a metre: the setting-out plan is another size now.
    const far = [...modelStore.nodes.values()].filter((n) => Math.abs(n.x - 9) < 1e-6);
    for (const n of far) modelStore.updateNode(n.id, 10, n.y, n.z);
    const b = projectSheetSet(null, 'A');
    expect(b[0]!.layoutConflicts?.map((c) => [c.key, c.reason])).toEqual([[so.key, 'sizeChanged']]);
    expect(placedOf(b, so.key).x).not.toBeCloseTo(so.x + 30, 3);
  });
});

/** The drawing as the work drawings give it, for its text keys. */
import { planContext, workDrawings } from '../work-drawings';
function projectSheetSetDrawing(key: string) {
  const [entry, k] = key.split(':') as [string, string];
  return workDrawings(null, new Set([entry as never]), planContext(sheetLanguage(), 'A1')).get(entry as never)!.find((d) => d.key === k)!.primitives;
}
