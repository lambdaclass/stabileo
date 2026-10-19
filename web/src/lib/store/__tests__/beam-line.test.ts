/**
 * A beam line read as bars along it and projected back onto its members: on a designed two-bay
 * frame the round trip checks exactly as the members' own bars do, and the editor's edits reach
 * the members as one undo step, the saved line read back while its members stay as saved.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { modelBeamLines } from '../frame-equalize';
import { checkDraft, frameGroupOf, lineMembers, openLine, saveLine, savedMemberCuts, setFrameGroup } from '../beam-line-store';
import { addBar, areaAt, cutBar, deleteZone, equalizeZones, joinBars, lapBars, lineFromMembers, membersFromLine, removeBar, setHook, splitZone, stretchBar, updateZone } from '../../engine/design/beam-line';
import { lineKey } from '../../design-contract/beam-line';
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
  // The reading of the beams' role in the lateral system this suite was written under (`suite-lateral.ts`).
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  // 40×40: on 30×30 the beams' top hooks do not fit the columns and the design refuses them
  // (`end-support-anchorage.ts`); this file reads a designed line.
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
  return modelBeamLines()[0]!;
}

const summary = (v: { checks: Array<{ category: string; status: string; ratio: number }> }) =>
  v.checks.map((c) => `${c.category}|${c.status}|${c.ratio}`).sort();

describe('a beam line as bars along it', () => {
  it('reads its members and projects back to the same checks', () => {
    const line = designed();
    const ms = lineMembers(line);
    const model = lineFromMembers(ms);
    expect(model.members).toEqual(line.members);
    // Two spans, 5 and 4 m: the top bars over the middle column are one bar when both sides agree.
    const back = membersFromLine(model, ms);
    const a = designRunStore.currentAdapter()!;
    for (const m of ms) {
      const ctx = verificationStore.contextFor(m.id)!;
      const own = a.verify(ctx, m.reinforcement!);
      const trip = a.verify(ctx, back.get(m.id)!);
      expect(summary(trip)).toEqual(summary(own));
    }
    const draft = checkDraft(line, model);
    expect([...draft.keys()].sort()).toEqual([...line.members].sort());
  });

  it('edits bars and stirrup zones', () => {
    const line = designed();
    let m = lineFromMembers(lineMembers(line));
    const bottom = m.bars.find((b) => b.face === 'bottom')!;
    const before = areaAt(m, 'bottom', (bottom.from + bottom.to) / 2);
    m = addBar(m, { face: 'bottom', row: 1, count: 2, diameter: 12, from: 1, to: 3, role: 'extra' });
    expect(areaAt(m, 'bottom', 2)).toBeCloseTo(areaAt(lineFromMembers(lineMembers(line)), 'bottom', 2) + 2 * Math.PI * 1.44 / 4, 6);
    const added = m.bars.find((b) => b.row === 1)!;
    m = stretchBar(m, added.id, 'to', 3.5);
    expect(m.bars.find((b) => b.id === added.id)!.to).toBe(3.5);
    m = cutBar(m, added.id, 2.5, 0.4);
    const pieces = m.bars.filter((b) => b.row === 1);
    expect(pieces.map((b) => [b.from, b.to]).sort()).toEqual([[1, 2.7], [2.3, 3.5]]);
    m = joinBars(m, pieces[0]!.id, pieces[1]!.id);
    expect(m.bars.filter((b) => b.row === 1).map((b) => [b.from, b.to])).toEqual([[1, 3.5]]);
    const [p, q] = [m.bars.find((b) => b.row === 1)!, null];
    void q;
    m = cutBar(m, p.id, 2, 0);
    const [l, r] = m.bars.filter((b) => b.row === 1).sort((u, v) => u.from - v.from);
    m = lapBars(m, l!.id, r!.id, 0.6);
    const lapped = m.bars.filter((b) => b.row === 1).sort((u, v) => u.from - v.from);
    expect(lapped[0]!.to - lapped[1]!.from).toBeCloseTo(0.6, 9);
    m = setHook(m, lapped[0]!.id, 'start', true);
    expect(m.bars.find((b) => b.id === lapped[0]!.id)!.hookStart).toBe(true);
    m = removeBar(m, lapped[0]!.id);
    expect(m.bars.some((b) => b.id === lapped[0]!.id)).toBe(false);
    void before;
    // Stirrups.
    const z = m.stirrups[0]!;
    m = splitZone(m, z.id, (z.from + z.to) / 2);
    expect(m.stirrups.length).toBeGreaterThan(1);
    const [z1, z2] = m.stirrups;
    m = updateZone(m, z1!.id, { spacing: 0.08, legs: 9 });
    expect(m.stirrups.find((x) => x.id === z1!.id)).toMatchObject({ spacing: 0.08, legs: 6 });
    m = equalizeZones(m, [z1!.id, z2!.id]);
    expect(m.stirrups.find((x) => x.id === z2!.id)).toMatchObject({ spacing: 0.08, legs: 6 });
    const n = m.stirrups.length;
    m = deleteZone(m, z2!.id);
    expect(m.stirrups.length).toBe(n - 1);
  });

  it('saves as one undo step, reads back while its members stay, and gives the detailing its cuts', () => {
    const line = designed();
    const before = line.members.map((id) => structuredClone(modelStore.elements.get(id)!.reinforcement));
    let m = openLine(line.members[0]!)!.model;
    const top = m.bars.find((b) => b.face === 'top' && b.from > 0.5)!;
    m = stretchBar(m, top.id, 'from', top.from - 0.3);
    saveLine(line, m);
    const back = openLine(line.members[0]!)!;
    expect(back.saved).toBe(true);
    expect(back.model.bars.find((b) => b.id === top.id)!.from).toBeCloseTo(top.from - 0.3, 9);
    expect(savedMemberCuts().size).toBeGreaterThan(0);
    // A member edited elsewhere: the saved line is stale and the line is read from the members.
    historyStore.undo();
    expect(line.members.map((id) => modelStore.elements.get(id)!.reinforcement)).toEqual(before);
    expect(openLine(line.members[0]!)!.saved).toBe(false);
  });

  it('a grouped line takes the bars of the one saved', () => {
    designed();
    const [l1, l2] = modelBeamLines();
    setFrameGroup([lineKey(l1!.members), lineKey(l2!.members)]);
    expect(frameGroupOf(lineKey(l2!.members))).toHaveLength(2);
    let m = openLine(l1!.members[0]!)!.model;
    m = addBar(m, { face: 'bottom', row: 1, count: 2, diameter: 16, from: 0.5, to: 4.5, role: 'extra' });
    const written = saveLine(l1!, m);
    for (const id of l2!.members) expect(written).toContain(id);
    expect(modelStore.elements.get(l2!.members[0]!)!.reinforcement).toEqual(modelStore.elements.get(l1!.members[0]!)!.reinforcement);
  });
});

describe('predefined spans', () => {
  it('two spans reinforced as one take the heaviest arrangement over both', async () => {
    const { uniteSpans, splitSpans } = await import('../../engine/design/beam-line');
    const line = designed();
    const m = lineFromMembers(lineMembers(line));
    const u = uniteSpans(m, 0, 1);
    expect(u.spans).toEqual([[0, 1]]);
    const total = m.lengths[0]! + m.lengths[1]!;
    const bottom = u.bars.filter((b) => b.face === 'bottom' && b.row === 0);
    expect(bottom).toHaveLength(1);
    expect(bottom[0]!.from).toBeCloseTo(0, 9);
    expect(bottom[0]!.to).toBeCloseTo(total, 9);
    const heaviest = Math.max(...m.bars.filter((b) => b.face === 'bottom' && b.row === 0).map((b) => b.count * b.diameter ** 2));
    expect(bottom[0]!.count * bottom[0]!.diameter ** 2).toBe(heaviest);
    expect(splitSpans(u, 1).spans).toEqual([]);
  });
});
