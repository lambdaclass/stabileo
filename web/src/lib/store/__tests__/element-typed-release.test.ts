import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';

describe('Element typed Release contract', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  it('addElement creates an element with default-zero releases on both ends', () => {
    modelStore.addNode(0, 0); // id 1
    modelStore.addNode(6, 0); // id 2
    const elemId = modelStore.addElement(1, 2, 'frame');
    const elem = modelStore.elements.get(elemId)!;
    expect(elem.releaseI).toEqual({ my: false, mz: false, t: false });
    expect(elem.releaseJ).toEqual({ my: false, mz: false, t: false });
    // Legacy generic flags must not appear on the model.
    expect((elem as any).hingeStart).toBeUndefined();
    expect((elem as any).hingeEnd).toBeUndefined();
  });

  it('toggleRelease flips a single axis at a single end without touching the others', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(6, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');

    modelStore.toggleRelease(elemId, 'i', 'mz');
    let elem = modelStore.elements.get(elemId)!;
    expect(elem.releaseI).toEqual({ my: false, mz: true, t: false });
    expect(elem.releaseJ).toEqual({ my: false, mz: false, t: false });

    modelStore.toggleRelease(elemId, 'j', 'my');
    elem = modelStore.elements.get(elemId)!;
    expect(elem.releaseI).toEqual({ my: false, mz: true, t: false });
    expect(elem.releaseJ).toEqual({ my: true, mz: false, t: false });

    modelStore.toggleRelease(elemId, 'i', 't');
    elem = modelStore.elements.get(elemId)!;
    expect(elem.releaseI).toEqual({ my: false, mz: true, t: true });
  });

  it('toggleRelease on the same axis is idempotent in pairs (toggle twice → original)', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(6, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    modelStore.toggleRelease(elemId, 'i', 'mz');
    modelStore.toggleRelease(elemId, 'i', 'mz');
    expect(modelStore.elements.get(elemId)!.releaseI.mz).toBe(false);
  });

  it('splitElementAtPoint preserves typed releases per end', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(8, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    modelStore.toggleRelease(elemId, 'i', 'mz');
    modelStore.toggleRelease(elemId, 'j', 'my');

    const split = modelStore.splitElementAtPoint(elemId, 0.5);
    expect(split).not.toBeNull();
    const a = modelStore.elements.get(split!.elemA)!;
    const b = modelStore.elements.get(split!.elemB)!;
    expect(a.releaseI).toEqual({ my: false, mz: true, t: false });
    expect(a.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect(b.releaseI).toEqual({ my: false, mz: false, t: false });
    expect(b.releaseJ).toEqual({ my: true, mz: false, t: false });
  });
});
