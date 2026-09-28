/**
 * The views undo channel: project data the analysis does not read is undone without retiring
 * the solve, and every field recorded on the channel comes back when undone.
 *
 * The channel used to restore the named views alone, so the other setters that record through it
 * (the grid first) undid nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const cases: Array<[string, () => void, () => unknown]> = [
  ['the grid', () => modelStore.setGrid({ axes: [{ id: 'a', name: '1', axis: 'x', at: 0 }], levels: [] } as never), () => modelStore.snapshot().grid],
  ['the dynamics', () => modelStore.setDynamics({ timeHistory: { method: 'newmark', dt: 0.01, duration: 1 } } as never), () => modelStore.snapshot().dynamics],
  ['the notes', () => modelStore.setNotes([{ id: 1, text: 'check', at: { x: 0, y: 0, z: 0 } }] as never), () => modelStore.snapshot().notes],
  ['the project data', () => modelStore.setProjectInfo({ client: 'someone' }), () => modelStore.snapshot().projectInfo],
  ['the deflection limits', () => modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'memberKind', value: 'beam' }, n: 300, direction: 'resultant' }] } as never), () => modelStore.snapshot().deflectionLimits],
];

describe('the views undo channel', () => {
  it.each(cases)('undoes %s without bumping the model version, and redoes it', (_name, set, read) => {
    const v0 = modelStore.modelVersion;
    set();
    const stated = read();
    expect(stated).toBeDefined();
    historyStore.undo();
    expect(read()).toBeUndefined();
    expect(modelStore.modelVersion).toBe(v0);
    historyStore.redo();
    expect(read()).toEqual(stated);
  });
});
