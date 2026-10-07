/**
 * The loads of floor-load definitions (`store/defined-loads.ts`) as the rest of the application
 * meets them: a shared link, the delete key, a load plan, undo and redo, and every analysis.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, uiStore, historyStore } from '..';
import { addFloorLoadDef, syncDefinedLoads, expandDefinitions, DEFINED_LOADS_SETTLE_MS } from '../defined-loads';
import { definitionsCurrent, type FloorLoadDef } from '../../model/loads/floor-definitions';
import { generateEmbedURL, generateShareURL, loadFromShareLink } from '../../utils/url-sharing';
import { deleteSelection } from '../../actions/delete-selection';
import { replaceScope, loadStateForPlan } from '../apply-load-plan';
import { describePlanDelta } from '../../engine/loads/load-plan-delta';
import type { LoadPlan } from '../../engine/loads/load-plan';
import { runLiveCalc } from '../../engine/live-calc';
import * as wasm from '../../engine/wasm-solver';

/** A 8 × 6 m bay at z = 3 on four columns, a live load of 2 kN/m² on it as a definition. */
function bay() {
  modelStore.clear();
  historyStore.clear();
  const top = [[0, 0], [8, 0], [8, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  top.forEach((a, i) => modelStore.addElement(a, top[(i + 1) % 4]!));
  for (const [i, t] of top.entries()) {
    const b = modelStore.addNode(modelStore.nodes.get(t)!.x, modelStore.nodes.get(t)!.y, 0);
    modelStore.addElement(b, t);
    modelStore.addSupport(b, 'fixed' as never);
    void i;
  }
  const caseId = modelStore.addLoadCase('L', 'L');
  const def: FloorLoadDef = { caseId, q: 2, target: { by: 'level', z: 3 }, distribution: 'twoWay' };
  const defId = addFloorLoadDef('L floor', def);
  return { top, caseId, defId };
}
const fromDef = () => modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef !== undefined);
const current = () => definitionsCurrent(modelStore.loads, expandDefinitions());
/** A node moved as the viewport moves one: one undo step. */
const move = (id: number, x: number, y: number, z: number) => modelStore.batch(() => modelStore.updateNode(id, x, y, z));

beforeEach(() => { uiStore.analysisMode = '3d'; });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = '2d';
});

describe('a shared link', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    vi.stubGlobal('location', { hash: '', pathname: '/', search: '', origin: 'https://x' });
    vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  });

  for (const [name, make] of [['share', generateShareURL], ['embed', generateEmbedURL]] as const) {
    it(`(${name}) arrives with its definitions, so the first rewrite keeps the floor's loads`, () => {
      bay();
      const n = fromDef().length;
      expect(n).toBeGreaterThan(0);
      const url = make()!.url;
      modelStore.clear();
      expect(loadFromShareLink(url)).toBe(true);
      expect([...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad')).toHaveLength(1);
      syncDefinedLoads();
      expect(fromDef()).toHaveLength(n);
    });
  }

  it('a load whose definition is not there stays, as a plain load', () => {
    const { defId } = bay();
    const n = fromDef().length;
    const snap = modelStore.snapshot();
    modelStore.restore({ ...snap, groups: (snap.groups ?? []).filter(([id]) => id !== defId) });
    expect(syncDefinedLoads()).not.toBeNull();
    expect(fromDef()).toHaveLength(0);
    expect(modelStore.loads.filter((l) => l.type === 'distributed3d')).toHaveLength(n);
  });
});

describe('the delete key', () => {
  it('leaves a definition\'s loads and says why', () => {
    bay();
    const toast = vi.spyOn(uiStore, 'toast');
    const ids = fromDef().map((l) => l.data.id);
    uiStore.selectedLoads = new Set(ids);
    deleteSelection();
    expect(fromDef().map((l) => l.data.id)).toEqual(ids);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/defini/i), 'info');
  });
});

describe('a load plan', () => {
  const plan = (caseId: number) => ({
    cases: [{ type: 'L', nameKey: 'x', existingId: caseId }], combinations: [], distributed: [{ elementId: 1, q: 3, caseType: 'L' }], nodal: [], surface: [], thermal: [],
  }) as unknown as LoadPlan;

  it('does not count a definition\'s loads among the user\'s, and says it adds to them', () => {
    const { caseId } = bay();
    const p = plan(caseId);
    const s = replaceScope(p, modelStore.loads, modelStore.model.loadCases, modelStore.model.combinations);
    expect(s.unmarked.loads).toEqual([]);
    expect(s.defined.loads.sort()).toEqual(fromDef().map((l) => l.data.id).sort());
    const delta = describePlanDelta(p, loadStateForPlan(p), { replaceExisting: true, alsoUnmarked: true });
    expect(delta.unmarked).toBeNull();
    expect(delta.warnings.map((w) => w.key)).toContain('loadPlan.warning.definedKept');
  });
});

describe('undo and redo', () => {
  it('a rewrite before a solve takes no step of its own and leaves redo', () => {
    const { top } = bay();
    move(top[1]!, 9, 0, 3);
    move(top[2]!, 9, 6, 3);
    syncDefinedLoads(); // Solve
    expect(current()).toBe(true);
    historyStore.undo();
    historyStore.undo();
    expect(historyStore.redoCount).toBe(2);
    syncDefinedLoads(); // Solve again
    expect(current()).toBe(true);
    expect(historyStore.redoCount).toBe(2);
    historyStore.redo();
    historyStore.redo();
    expect(modelStore.nodes.get(top[2]!)!.x).toBe(9);
  });
});

describe('every analysis reads current loads', () => {
  it('an analysis reads them rewritten even while the rewrite waits for the model to be still', () => {
    const { top } = bay();
    const steps = historyStore.undoCount;
    move(top[1]!, 10, 0, 3);
    move(top[2]!, 10, 6, 3);
    // A drag does not pay a rewrite per step: nothing is written while edits keep coming.
    expect(current()).toBe(false);
    // What an advanced analysis builds from (modal, buckling, P-Delta… `buildInput`) flushes it:
    // the 10 × 6 m bay's 120 kN, not the 8 × 6 m one's 96, and no step of its own.
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const pieces = input.loads as unknown as Array<{ type: string; data: { qZI: number; qZJ: number; a: number; b: number } }>;
    const kN = pieces.filter((l) => l.type === 'distributed').reduce((t, l) => t - (l.data.qZI + l.data.qZJ) / 2 * (l.data.b - l.data.a), 0);
    expect(kN).toBeCloseTo(120, 6);
    expect(current()).toBe(true);
    expect(historyStore.undoCount).toBe(steps + 2);
  });

  it('once the model is still, the rewrite runs by itself, in the edit\'s step', async () => {
    const { top } = bay();
    const steps = historyStore.undoCount;
    move(top[1]!, 10, 0, 3);
    expect(current()).toBe(false);
    await new Promise((r) => setTimeout(r, DEFINED_LOADS_SETTLE_MS + 50));
    expect(current()).toBe(true);
    expect(historyStore.undoCount).toBe(steps + 1);
    historyStore.undo();
    await new Promise((r) => setTimeout(r, DEFINED_LOADS_SETTLE_MS + 50));
    expect(current()).toBe(true);
  });

  it('live calc solves the model with them rewritten', async () => {
    const { top } = bay();
    vi.spyOn(wasm, 'isWasmReady').mockReturnValue(true);
    let seen: boolean | null = null;
    vi.spyOn(modelStore, 'solve3DAsync').mockImplementation(async () => { seen = current(); return null; });
    modelStore.updateNode(top[1]!, 10, 0, 3);
    await runLiveCalc('3d', 'rightHand');
    expect(seen).toBe(true);
  });
});
