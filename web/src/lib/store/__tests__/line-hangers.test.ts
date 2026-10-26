/**
 * A beam bearing on a beam line mid-span is found as an indirect support, with its end shear and
 * the hanging steel it asks; the command closes the line's stirrups up over the stretch until
 * they place it, and the saved line carries it to the detailing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { modelBeamLines } from '../frame-equalize';
import { openLine } from '../beam-line-store';
import { lineHangers } from '../line-hangers';
import { hangerArea, hangersPlaced, withHangers } from '../../engine/design/beam-hangers';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

/** Two columns 6 m apart carrying a beam in two members; a secondary beam bears at its middle, its far end on a third column. */
function frameWithSecondary() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '30×70', a: 0.21, iy: 0.3 * 0.7 ** 3 / 12, iz: 0.7 * 0.3 ** 3 / 12, j: 0.0045, b: 0.3, h: 0.7, shape: 'rect' } as never);
  const sec = modelStore.addSection({ name: '20×45', a: 0.09, iy: 0.00152, iz: 0.0003, j: 0.0007, b: 0.2, h: 0.45, shape: 'rect' } as never);
  const A = modelStore.addNode(0, 0, 0), B = modelStore.addNode(6, 0, 0), F = modelStore.addNode(3, 4, 0);
  const C = modelStore.addNode(0, 0, 3), M = modelStore.addNode(3, 0, 3), D = modelStore.addNode(6, 0, 3), E = modelStore.addNode(3, 4, 3);
  const set = (id: number, s: number) => { modelStore.updateElement(id, { sectionId: s, materialId: conc }); return id; };
  for (const [i, j] of [[A, C], [B, D], [F, E]] as const) set(modelStore.addElement(i, j), col);
  const beams = [set(modelStore.addElement(C, M), beam), set(modelStore.addElement(M, D), beam)];
  const secondary = set(modelStore.addElement(M, E), sec);
  for (const n of [A, B, F]) modelStore.addSupport(n, 'fixed3d');
  for (const e of [...beams, secondary]) modelStore.addDistributedLoad3D(e, 0, 0, -15, -15, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  return { beams, secondary, M };
}

describe('hanging steel where a beam bears on the line', () => {
  it('finds the secondary beam at the middle, with its end shear and the steel it asks', () => {
    const { beams, secondary, M } = frameWithSecondary();
    const line = modelBeamLines().find((l) => l.members.includes(beams[0]!))!;
    const open = openLine(beams[0]!)!;
    const found = lineHangers(line, open.model.lengths);
    expect(found.map((s) => [s.elementId, s.nodeId, +s.x.toFixed(3)])).toEqual([[secondary, M, 3]]);
    const s = found[0]!;
    // The end shear the secondary beam brings, read back from its own stations, and Ah from it.
    expect(s.vu).toBeGreaterThan(20);
    expect(s.need).toBeCloseTo(hangerArea(s.vu, verificationStore.contextFor(beams[0]!)!.material.fy), 9);
    // Over the 0,20 m width plus the 0,70 m depth, half each side.
    expect([s.from, s.to].map((v) => +v.toFixed(3))).toEqual([2.55, 3.45]);
    // The command closes the stirrups up until they place it.
    expect(open.model.stirrups.length).toBeGreaterThan(0);
    const next = withHangers(open.model, s.from, s.to, s.need);
    expect(hangersPlaced(next.stirrups, s.from, s.to)).toBeGreaterThanOrEqual(s.need - 1e-9);
  });

  it('a beam meeting the line over a column is a direct support, not listed', () => {
    const { beams } = frameWithSecondary();
    const line = modelBeamLines().find((l) => l.members.includes(beams[0]!))!;
    // The secondary beam's far end sits on a column: from its own line it is not an indirect support.
    const other = modelBeamLines().find((l) => !l.members.includes(beams[0]!));
    if (other) expect(lineHangers(other, openLine(other.members[0]!)?.model.lengths ?? []).length).toBe(0);
    expect(lineHangers(line, openLine(beams[0]!)!.model.lengths).length).toBe(1);
  });
});
