import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../index';
import { saveStatus } from '../save-status.svelte';

const ok = (backend: 'indexeddb' | 'localstorage' = 'indexeddb', revision = 3) => ({ ok: true, backend, revision, failure: null }) as never;

describe('the save status the PRO header shows', () => {
  beforeEach(() => { modelStore.clear(); saveStatus.reset(); });

  it('says nothing for an empty project, and "changed" once there is a model not yet saved', () => {
    expect(saveStatus.state).toBe('idle');
    modelStore.addNode(0, 0, 0);
    expect(saveStatus.state).toBe('changed');
  });

  it('is saving while a write runs, saved after it, and changed again after an edit', () => {
    modelStore.addNode(0, 0, 0);
    const mark = saveStatus.begin();
    expect(saveStatus.state).toBe('saving');
    saveStatus.end(mark, ok());
    expect(saveStatus.state).toBe('saved');
    expect(saveStatus.revision).toBe(3);
    modelStore.addNode(1, 0, 0);
    expect(saveStatus.state).toBe('changed');
  });

  it('keeps "changed" when the model moved on while the write ran', () => {
    modelStore.addNode(0, 0, 0);
    const mark = saveStatus.begin();
    modelStore.addNode(1, 0, 0);
    saveStatus.end(mark, ok());
    expect(saveStatus.state).toBe('changed');
  });

  it('names a save to the fallback storage, and a failed one until a write works', () => {
    modelStore.addNode(0, 0, 0);
    saveStatus.end(saveStatus.begin(), ok('localstorage'));
    expect(saveStatus.state).toBe('degraded');
    saveStatus.end(saveStatus.begin(), { ok: false, backend: 'none', revision: null, failure: { kind: 'quota', detail: '' } } as never);
    expect(saveStatus.state).toBe('failed');
    expect(saveStatus.failure).toBe('quota');
    saveStatus.end(saveStatus.begin(), ok());
    expect(saveStatus.state).toBe('saved');
  });

  it('leaves the state as it was when there was nothing to save', () => {
    saveStatus.end(saveStatus.begin(), null);
    expect(saveStatus.state).toBe('idle');
  });
});
