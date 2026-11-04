/**
 * The detailing lays a saved beam line's bars as the frame editor draws them.
 *
 * Before: the detailing received the members' three regions and five cut points (`memberCuts`) and
 * laid bars of its own; a bar cut with a lap in the middle of a span came out as one continuous
 * bar, and the splice planner decided again where bars meeting at a support were spliced. Now each
 * drawn bar is one bar in the detailing, starting and ending where it was drawn, with a stable
 * identity (the line bar's id), and a drawn lap is checked against the splice length the bar needs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { modelBeamLines } from '../frame-equalize';
import { openLine, saveLine } from '../beam-line-store';
import { cutBar } from '../../engine/design/beam-line';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
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

function designedFrame() {
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
}

/** The line's first span bottom bar cut at 2,5 m with a lap of `lap` m, saved, the detailing run. */
function cutAndDetail(lap: number) {
  designedFrame();
  const line = modelBeamLines()[0]!;
  const open = openLine(line.members[0]!)!;
  const bottom = open.model.bars.find((b) => b.face === 'bottom' && b.from < 0.5 && b.to > 4)!;
  const next = cutBar(open.model, bottom.id, 2.5, lap);
  saveLine(line, next);
  const run = detailingStore.generate()!;
  expect(detailingStore.lastError, 'detailing ran').toBeNull();
  const left = next.bars.find((b) => b.face === 'bottom' && Math.abs(b.to - (2.5 + lap / 2)) < 1e-9)!;
  const right = next.bars.find((b) => b.face === 'bottom' && Math.abs(b.from - (2.5 - lap / 2)) < 1e-9)!;
  const bars = run.assemblies.flatMap((a) => a.bars);
  const drawn = (lineBarId: string) => bars.filter((b) => b.role === 'longitudinal' && b.id.includes(`-line-${lineBarId}-`));
  return { line, run, bars, left, right, drawn, count: bottom.count };
}

/** A bar's longitudinal body along x, m (the frame runs along x from 0 to 9). */
function extentX(b: BarPath): [number, number] {
  const xs = b.segments.flatMap((s) => [s.start.x, s.end.x]);
  return [Math.min(...xs), Math.max(...xs)];
}

describe('a line\'s bars, laid as drawn', () => {
  it('a bar cut with a lap mid-span is two bars, overlapping exactly where it was drawn', () => {
    const { left, right, drawn, count } = cutAndDetail(1.0);
    const L = drawn(left.id), R = drawn(right.id);
    expect(L).toHaveLength(count);
    expect(R).toHaveLength(count);
    for (const b of [...L, ...R]) expect(b.source).toBe('manual');
    // The left bar ends at 3,0 m, the right one starts at 2,0 m: the 1,0 m lap as drawn.
    for (const b of L) expect(extentX(b)[1]).toBeCloseTo(3.0, 3);
    for (const b of R) expect(extentX(b)[0]).toBeCloseTo(2.0, 3);
  });

  it('a lap shorter than the splice length the bar needs is reported with its clause, a long one is not', () => {
    const short = cutAndDetail(0.2);
    const said = JSON.stringify(short.run.assemblies.map((a) => a.unsupported));
    expect(said).toMatch(/Solape dibujado de .*: 0\.20 m, menor que la longitud de empalme ℓst = .* \(25\.5\.2\)/);
    const long = cutAndDetail(1.6);
    expect(JSON.stringify(long.run.assemblies.map((a) => a.unsupported))).not.toMatch(/Solape dibujado/);
  });

  it('the two bars of a drawn lap are not a clash; splices that do not fit beside each other are', () => {
    const { run, left, right } = cutAndDetail(1.0);
    const between = run.assemblies.flatMap((a) => a.conflicts ?? []).filter((c) => {
      const ids = [c.barA ?? '', c.barB ?? '', ...((c as { barIds?: string[] }).barIds ?? [])].join(' ');
      return ids.includes(`-line-${left.id}-`) && ids.includes(`-line-${right.id}-`);
    });
    // Each pair is in contact: no clearance under zero between the bars of one lap.
    expect(between.filter((c) => (c.clearance ?? 0) <= 1e-6)).toEqual([]);
    // Four contact splices of the bottom row do not fit the 0,20 m web with the clear spacing the
    // bars need between one splice and the next: that is said, as spacing within the layer.
    for (const c of between) expect(c.pairClass).toBe('sameLayerSpacing');
  });

  it('keeps each bar\'s identity across a regeneration', () => {
    const { bars } = cutAndDetail(1.0);
    const ids = bars.filter((b) => b.source === 'manual').map((b) => b.id).sort();
    const again = detailingStore.generate()!.assemblies.flatMap((a) => a.bars).filter((b) => b.source === 'manual').map((b) => b.id).sort();
    expect(again).toEqual(ids);
    expect(ids.length).toBeGreaterThan(0);
  });
});
