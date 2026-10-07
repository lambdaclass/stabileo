/**
 * What the load tools and the edit card refuse, and that a refusal changes nothing.
 *
 *  - The 3D thermal tool wrote a load of ΔTg = ∇T = 0, where every other tool refuses a load of
 *    nothing (`drawBar.loadIsZero`).
 *  - The edit card let every component of a load be set to zero, one field at a time: the load
 *    stayed in the list, drawn as nothing.
 *  - An a or b that puts a member load off its member is refused by the store, silently, and the
 *    card cleared the results anyway: the solve was lost and the model unchanged.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { addThermalLoadIfAny, editLoad } from '../load-ops';
import { editLeavesNothing } from '../../model/loads/load-magnitudes';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function member3D() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  return modelStore.addElement(a, b, 'frame');
}
const find = (id: number) => modelStore.loads.find((l) => l.data.id === id)!;

describe('the thermal tool', () => {
  it('writes nothing for ΔTg = ∇T = 0, and the load otherwise', () => {
    const e = member3D();
    const n = modelStore.loads.length;
    expect(addThermalLoadIfAny(e, 0, 0, 1)).toBeNull();
    expect(modelStore.loads).toHaveLength(n);
    expect(addThermalLoadIfAny(e, 0, 15, 1)).not.toBeNull();
    expect(modelStore.loads).toHaveLength(n + 1);
  });
});

describe('the edit card', () => {
  it('refuses the edit that would leave every component of a distributed load at zero', () => {
    const e = member3D();
    const id = modelStore.addDistributedLoad3D(e, 0, 0, -5, -5);
    expect(editLoad(id, { qZI: 0 })).toBe('done');
    const steps = historyStore.undoCount;
    expect(editLoad(id, { qZJ: 0 })).toBe('zero');
    expect(find(id).data).toMatchObject({ qZI: 0, qZJ: -5 });
    expect(historyStore.undoCount).toBe(steps);
  });

  it('an edit that leaves another component is no load of nothing; an imposed displacement of zero is a restraint', () => {
    const load = { type: 'nodal3d', data: { id: 1, nodeId: 1, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 2 } } as never;
    expect(editLeavesNothing(load, { fz: 0 })).toBe(false);
    expect(editLeavesNothing(load, { fz: 0, mz: 0 })).toBe(true);
    // A position is not a magnitude: moving a load never makes it nothing.
    expect(editLeavesNothing({ type: 'distributed3d', data: { id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0 } } as never, { a: 1 })).toBe(false);
    expect(editLeavesNothing({ type: 'displacement3d', data: { id: 1, nodeId: 1, dz: -0.01 } } as never, { dz: 0 })).toBe(false);
  });

  it('says so when a or b would put the load off the member, and changes nothing', () => {
    const e = member3D();
    const id = modelStore.addDistributedLoad3D(e, 0, 0, -5, -5, 1, 3);
    const steps = historyStore.undoCount;
    const version = modelStore.modelVersion;
    expect(editLoad(id, { b: 9 })).toBe('place');
    expect(editLoad(id, { a: 3.5 })).toBe('place');
    expect(find(id).data).toMatchObject({ a: 1, b: 3 });
    expect(historyStore.undoCount).toBe(steps);
    // Nothing changed, so nothing that reads the version (the results among them) is retired.
    expect(modelStore.modelVersion).toBe(version);
    expect(editLoad(id, { b: 4 })).toBe('done');
  });
});
