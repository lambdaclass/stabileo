import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { AutosaveWriteResult } from '../autosave-db';

import { modelStore, uiStore } from '../index';
import { resetAutosaveService } from '../autosave-service';
import { duplicateViewed } from '../viewer-duplicate';
import { t } from '../../i18n';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('duplicating the model in the viewer', () => {
  beforeEach(() => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    uiStore.viewerMode = true;
    uiStore.toasts.splice(0);
  });
  afterEach(() => { uiStore.viewerMode = false; resetAutosaveService(); });

  it('says it is saved only once the autosave and the workspace are both written', async () => {
    const write = deferred<AutosaveWriteResult>();
    const autosave = vi.fn(() => write.promise);
    const workspace = vi.fn(() => true);
    const done = duplicateViewed({ autosave, workspace });
    expect(uiStore.viewerMode).toBe(false);
    await Promise.resolve();
    expect(autosave).toHaveBeenCalledWith('manual');
    expect(workspace).not.toHaveBeenCalled();
    expect(uiStore.toasts).toHaveLength(0);
    write.resolve({ ok: true, backend: 'indexeddb', revision: 3 });
    expect(await done).toBe(true);
    expect(workspace).toHaveBeenCalledTimes(1);
    expect(uiStore.toasts.map((x) => [x.message, x.type])).toEqual([[t('viewer.duplicated'), 'success']]);
  });

  it('reports a failed autosave instead of a success', async () => {
    const autosave = vi.fn(async (): Promise<AutosaveWriteResult> => ({ ok: false, backend: 'indexeddb', revision: null, failure: { kind: 'quota', detail: '' } }));
    expect(await duplicateViewed({ autosave, workspace: () => true })).toBe(false);
    expect(uiStore.toasts.map((x) => [x.message, x.type])).toEqual([[t('viewer.duplicateNotSaved'), 'error']]);
  });

  it('writes the autosave slot the viewer kept free, once out of the viewer', async () => {
    let seen: boolean | null = null;
    await duplicateViewed({ autosave: async () => { seen = uiStore.viewerMode; return null; }, workspace: () => true });
    expect(seen).toBe(false);
  });

  it('reports an autosave that throws, and still writes the workspace', async () => {
    const workspace = vi.fn(() => true);
    expect(await duplicateViewed({ autosave: async () => { throw new Error('boom'); }, workspace })).toBe(false);
    expect(workspace).toHaveBeenCalledTimes(1);
    expect(uiStore.toasts.map((x) => [x.message, x.type])).toEqual([[t('viewer.duplicateNotSaved'), 'error']]);
  });

  it('reports a workspace that could not be written', async () => {
    const autosave = vi.fn(async (): Promise<AutosaveWriteResult> => ({ ok: true, backend: 'indexeddb', revision: 1 }));
    expect(await duplicateViewed({ autosave, workspace: () => false })).toBe(false);
    expect(uiStore.toasts.map((x) => x.type)).toEqual(['error']);
  });
});
