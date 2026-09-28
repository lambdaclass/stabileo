/**
 * The property panel's declared-Lb edit is undoable, as one step.
 *
 * `ElementDetails.svelte` writes `Element.unbracedLength` through
 * `modelStore.batch(() => modelStore.updateElement(...))` — `updateElement` pushes no
 * history of its own, the batch does. The input commits on `change` (blur/Enter), not per
 * keystroke, so one commit is exactly one undo step. These pin the contract on the store
 * the panel uses: setting an Lb comes back with one Ctrl+Z, and clearing it does too.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';

beforeAll(async () => {
  // The history store wires itself into the model store on a microtask.
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
});

describe('declared Lb from the property panel', () => {
  it('setting it is one undo step, and undo restores the deduced state', () => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(5, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    historyStore.clear();

    modelStore.batch(() => modelStore.updateElement(e, { unbracedLength: 2.5 }));

    expect(modelStore.elements.get(e)!.unbracedLength).toBe(2.5);
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.elements.get(e)!.unbracedLength).toBeUndefined();
  });

  it('clearing a declared Lb is undoable too', () => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(5, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.batch(() => modelStore.updateElement(e, { unbracedLength: 2.5 }));
    historyStore.clear();

    modelStore.batch(() => modelStore.updateElement(e, { unbracedLength: undefined }));

    expect(modelStore.elements.get(e)!.unbracedLength).toBeUndefined();
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.elements.get(e)!.unbracedLength).toBe(2.5);
  });
});
