/**
 * Operations on loads as a set (`load-ops.ts`): what deleting a case says it takes, a destination
 * case that is not there, and an add that adds nothing.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, type Load } from '../model.svelte';
import '../index';
import { historyStore } from '../history.svelte';
import { addLoads, copyLoadsToCase, moveLoadsToCase, caseDeletionScope, addNodalLoadIfAny } from '../load-ops';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const nodal = (nodeId: number, caseId: number): Load => ({ type: 'nodal3d', data: { id: 0, nodeId, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId } });

describe('deleting a case says all it takes', () => {
  it('its self-weight rows and its place in the mass source, as removeLoadCase takes them', () => {
    const n = modelStore.addNode(0, 0, 0);
    const [c1, c2] = modelStore.model.loadCases.map((c) => c.id) as [number, number];
    addLoads([nodal(n, c1)]);
    modelStore.model.analysis = { ...(modelStore.model.analysis ?? {}), selfWeight: [{ caseId: c1, direction: 'Z', factor: -1 }, { caseId: c2, direction: 'Z', factor: -1 }] } as never;
    modelStore.model.massSource = { kind: 'custom', factors: [{ caseId: c1, factor: 1 }, { caseId: c2, factor: 0.3 }] } as never;
    expect(caseDeletionScope(c1)).toMatchObject({ loads: 1, selfWeight: 1, mass: true });
    modelStore.model.massSource = { kind: 'custom', factors: [{ caseId: c2, factor: 0.3 }] } as never;
    expect(caseDeletionScope(c1)).toMatchObject({ selfWeight: 1, mass: false });
    modelStore.removeLoadCase(c1);
    const rows = (modelStore.model.analysis as { selfWeight?: Array<{ caseId: number }> } | undefined)?.selfWeight ?? [];
    expect(rows.some((r) => r.caseId === c1)).toBe(false);
  });
});

describe('a destination case that is not there', () => {
  it('copy and move refuse it: no loads left in no case', () => {
    const n = modelStore.addNode(0, 0, 0);
    const c1 = modelStore.model.loadCases[0]!.id;
    const [id] = addLoads([nodal(n, c1)]);
    const before = modelStore.loads.length;
    historyStore.clear();
    expect(copyLoadsToCase([id!], 999, 2)).toEqual([]);
    expect(moveLoadsToCase([id!], 999)).toBe(false);
    expect(modelStore.loads.length).toBe(before);
    expect(modelStore.loads.every((l) => modelStore.model.loadCases.some((c) => c.id === (l.data.caseId ?? 1)))).toBe(true);
    expect(historyStore.undoCount).toBe(0);
  });
});

describe('adding nothing', () => {
  it('an empty batch is no edit: no undo step, the model unchanged', () => {
    modelStore.addNode(0, 0, 0);
    historyStore.clear();
    const v = modelStore.modelVersion;
    expect(addLoads([])).toEqual([]);
    expect(historyStore.undoCount).toBe(0);
    expect(modelStore.modelVersion).toBe(v);
  });

  it('a nodal load of six zeros (the context menu\'s "add load") is not added', () => {
    const n = modelStore.addNode(0, 0, 0);
    historyStore.clear();
    expect(addNodalLoadIfAny(n, { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }, 1)).toBeNull();
    expect(modelStore.loads).toHaveLength(0);
    expect(historyStore.undoCount).toBe(0);
    expect(addNodalLoadIfAny(n, { fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 }, 1)).not.toBeNull();
    expect(modelStore.loads).toHaveLength(1);
  });
});
