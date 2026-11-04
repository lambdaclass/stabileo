/**
 * A shell's thickness, material and curvature undo. The store used to change the shell object in
 * place, and the undo snapshot held that same object, so the undo restored the change.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../index';

describe('shell edits undo', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('thickness, material and curvature come back on undo', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(1, 0, 0), modelStore.addNode(1, 1, 0), modelStore.addNode(0, 1, 0)];
    const q = modelStore.addQuad(n as [number, number, number, number], 1, 0.2);
    const p = modelStore.addPlate([n[0]!, n[1]!, n[2]!], 1, 0.2);
    modelStore.updateQuad(q, { thickness: 0.3 });
    modelStore.updatePlate(p, { thickness: 0.3 });
    modelStore.setQuadCurved(q, true);
    historyStore.undo();
    expect(modelStore.quads.get(q)!.curved).toBeUndefined();
    historyStore.undo();
    expect(modelStore.plates.get(p)!.thickness).toBe(0.2);
    historyStore.undo();
    expect(modelStore.quads.get(q)!.thickness).toBe(0.2);
  });
});
