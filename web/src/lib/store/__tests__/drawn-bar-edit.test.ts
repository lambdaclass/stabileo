/**
 * One bar of the detailing, edited where it was selected.
 *
 * A beam the detailing laid on its own is first taken as drawn: its line saved as the detailing laid
 * it, which must change no bar. From then on each of its bars is a line bar: editing it edits the
 * line (one undo step), the member is checked again, the detailing is laid again from the line, and
 * the edit is there after a regeneration.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { modelBeamLines } from '../frame-equalize';
import { openLine, saveLine } from '../beam-line-store';
import { canTakeAsDrawn, drawnBar, editDrawnBar, lineBarOf, takeAsDrawn } from '../drawn-bar-edit';
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

function detailedFrame() {
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
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  detailingStore.generate();
  expect(detailingStore.lastError).toBeNull();
  return modelBeamLines()[0]!;
}

/** The longitudinal steel of the line's members: count and total cut length per diameter. */
const steel = (ids: readonly number[]) => {
  const out: Record<string, { n: number; m: number }> = {};
  for (const b of detailingStore.assemblies.flatMap((a) => a.bars)) {
    if (b.role !== 'longitudinal' || !b.ownerElementIds.some((id) => ids.includes(id))) continue;
    const k = `Ø${b.diameterMm}`; out[k] ??= { n: 0, m: 0 };
    out[k].n += 1; out[k].m = Math.round((out[k].m + b.cuttingLength) * 100) / 100;
  }
  return out;
};

describe('a detailed bar, edited where it was selected', () => {
  /*
   * Taking a beam as drawn changes no bar: the detailing laid again from the saved line lays the
   * bars it laid before, or the take is undone and refused. Here it is refused: the detailing fused
   * and extended the support bars of the two spans across their shared support (e3's top bars run
   * 2,7 m into e5), which the line reads as e5's own at its start, so laid again e5 fails the cage
   * at that joint and would lose its bars. Nothing changes, and the line stays unsaved.
   */
  it('taking a beam as drawn changes no bar the detailing laid, or is refused', () => {
    const line = detailedFrame();
    const before = steel(line.members);
    expect(canTakeAsDrawn(line.members[0]!)).toBe(true);
    expect(takeAsDrawn(line.members[0]!)).toBe(false);
    expect(steel(line.members)).toEqual(before);
    expect(openLine(line.members[0]!)!.saved).toBe(false);
    expect(canTakeAsDrawn(line.members[0]!)).toBe(true);
  });

  it('an edit of a drawn bar reaches the line, the check, the detailing and survives a regeneration', () => {
    const line = detailedFrame();
    // The line saved as its members' regions hold it (the frame editor's reading), then laid.
    const open0 = openLine(line.members[0]!)!;
    saveLine(open0.line, open0.model);
    detailingStore.generate();
    const bar = detailingStore.assemblies.flatMap((a) => a.bars).find((b) => b.role === 'longitudinal' && lineBarOf(b.id) && drawnBar(b.id)?.bar.face === 'bottom')!;
    const d = drawnBar(bar.id)!;
    const changes = editDrawnBar(bar.id, { diameter: d.bar.diameter + 2, hookEnd: !d.bar.hookEnd })!;
    // The line holds the edit.
    const now = openLine(line.members[0]!)!.model.bars.find((b) => b.id === d.bar.id)!;
    expect([now.diameter, !!now.hookEnd]).toEqual([d.bar.diameter + 2, !d.bar.hookEnd]);
    // The schedule changed weight, and says by how much per diameter.
    expect(changes.some((c) => c.diameterMm === d.bar.diameter + 2 && c.deltaKg > 0)).toBe(true);
    // The detailing lays it, and keeps it on a regeneration.
    const laid = () => detailingStore.assemblies.flatMap((a) => a.bars).filter((b) => b.id.includes(`-line-${d.bar.id}-`));
    expect(laid().every((b) => b.diameterMm === d.bar.diameter + 2)).toBe(true);
    detailingStore.generate();
    expect(laid().length).toBeGreaterThan(0);
    expect(laid().every((b) => b.diameterMm === d.bar.diameter + 2)).toBe(true);
    // One undo step puts the bar back.
    historyStore.undo();
    expect(openLine(line.members[0]!)!.model.bars.find((b) => b.id === d.bar.id)!.diameter).toBe(d.bar.diameter);
  });
});
