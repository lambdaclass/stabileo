/**
 * The life of a design decision on the qa-8 frame: designed, edited, locked, reverted, saved as
 * a copy and recovered; a redesign that leaves the locked alone and keeps the edited when asked.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { decisionState, isLocked, recoverCopy, revertToProposal, saveCopy, setLocked, storedDecisions, equalizeFrom } from '../design-decisions';
import { commitManual } from '../rebar-edit';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import * as wasmSolver from '../../engine/wasm-solver';
import { rebarHash } from '../../engine/design/rebar-hash';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function solved() {
  modelStore.clear(); resultsStore.clear(); historyStore.clear(); verificationStore.clear(); designRunStore.resetMarks();
  modelStore.restore({
    nodes: qa8.nodes.map((n: any) => [n.id, n]) as never,
    materials: qa8.materials.map((m: any) => [m.id, m]) as never,
    sections: qa8.sections.map((x: any) => [x.id, x]) as never,
    elements: qa8.elements.map((e: any) => [e.id, e]) as never,
    supports: qa8.supports.map((x: any) => [x.id, x]) as never,
    loads: qa8.loads as never, loadCases: qa8.loadCases as never, combinations: qa8.combinations as never,
    nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
  } as never);
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.designAll().ok).toBe(true);
}
const bars = (id: number) => modelStore.elements.get(id)!.reinforcement;
const weaker = (id: number) => { const r = JSON.parse(JSON.stringify(bars(id))); const reg = r.regions ?? r; return { r, reg }; };

describe('design decisions', () => {
  beforeEach(() => solved());

  it('a run proposes, the proposal is kept, an edit is marked, revert goes back to it', () => {
    const id = [...modelStore.elements.values()].find((e) => e.reinforcement?.regions)!.id;
    expect(decisionState(id)).toBe('proposed');
    const proposed = rebarHash(bars(id));
    expect(rebarHash(storedDecisions().proposals[String(id)])).toBe(proposed);
    const { r } = weaker(id);
    r.regions.bottomSpanLayers = [{ count: 2, diameter: 12, row: 0 }];
    commitManual(id, r);
    expect(decisionState(id)).toBe('edited');
    revertToProposal([id]);
    expect(rebarHash(bars(id))).toBe(proposed);
    expect(decisionState(id)).toBe('proposed');
  });

  it('a locked member is left by a redesign; an edited one is kept unless overwriting is asked for', () => {
    const [a, b] = [...modelStore.elements.values()].filter((e) => e.reinforcement?.regions).map((e) => e.id);
    for (const id of [a!, b!]) { const { r } = weaker(id); r.regions.bottomSpanLayers = [{ count: 2, diameter: 10, row: 0 }]; commitManual(id, r); }
    setLocked([a!], true);
    expect(isLocked(a!)).toBe(true);
    const hashA = rebarHash(bars(a!)), hashB = rebarHash(bars(b!));
    expect(designRunStore.autoDesign([a!, b!], { edited: 'keep' }).ok).toBe(false); // both left: nothing to design
    expect(designRunStore.lastSkipped).toEqual({ locked: 1, edited: 1 });
    // Kept is the rule when nothing is said: no design command overwrites a person's bars unasked.
    expect(designRunStore.autoDesign([a!, b!]).ok).toBe(false);
    expect(designRunStore.lastSkipped).toEqual({ locked: 1, edited: 1 });
    expect(rebarHash(bars(b!))).toBe(hashB);
    expect(designRunStore.autoDesign([a!, b!], { edited: 'overwrite' }).ok).toBe(true);
    expect(rebarHash(bars(a!))).toBe(hashA);
    expect(rebarHash(bars(b!))).not.toBe(hashB);
    // A lock is one undo step of its own.
    setLocked([b!], true);
    expect(isLocked(b!)).toBe(true);
    historyStore.undo();
    expect(isLocked(b!)).toBe(false);
    expect(isLocked(a!)).toBe(true);
  });

  it('a copy of the frame is saved and recovered, survives the file, and equalize copies to the same section', () => {
    const ids = [...modelStore.elements.values()].filter((e) => e.reinforcement).map((e) => e.id);
    const before = new Map(ids.map((id) => [id, rebarHash(bars(id))]));
    const copy = saveCopy('antes');
    const { r } = weaker(ids[0]!);
    if (r.regions) r.regions.bottomSpanLayers = [{ count: 2, diameter: 10, row: 0 }];
    commitManual(ids[0]!, r);
    const snap = modelStore.snapshot();
    modelStore.restore(snap);
    expect(storedDecisions().copies.map((c) => c.label)).toEqual(['antes']);
    expect(recoverCopy(copy)).toBeGreaterThan(0);
    for (const id of ids) expect(rebarHash(bars(id))).toBe(before.get(id));
    const src = modelStore.elements.get(ids[0]!)!;
    const same = ids.filter((id) => id !== src.id && modelStore.elements.get(id)!.sectionId === src.sectionId);
    if (same.length) {
      expect(equalizeFrom(src.id, same).length).toBe(same.length);
      for (const id of same) expect(rebarHash(bars(id))).toBe(rebarHash(src.reinforcement));
    }
  });
});
