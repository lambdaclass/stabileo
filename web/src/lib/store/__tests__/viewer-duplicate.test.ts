import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const file = vi.hoisted(() => ({ saveAutosave: vi.fn(), saveWorkspaceToLocalStorage: vi.fn() }));
vi.mock('../file', async (original) => ({ ...(await original<typeof import('../file')>()), ...file }));

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
    file.saveAutosave.mockReset();
    file.saveWorkspaceToLocalStorage.mockReset();
  });
  afterEach(() => { uiStore.viewerMode = false; resetAutosaveService(); });

  it('says it is saved only once the autosave and the workspace are both written', async () => {
    const write = deferred<{ ok: boolean; backend: 'indexeddb'; revision: number }>();
    file.saveAutosave.mockReturnValue(write.promise);
    file.saveWorkspaceToLocalStorage.mockReturnValue(true);
    const done = duplicateViewed();
    expect(uiStore.viewerMode).toBe(false);
    await Promise.resolve();
    expect(file.saveAutosave).toHaveBeenCalledTimes(1);
    expect(uiStore.toasts).toHaveLength(0);
    write.resolve({ ok: true, backend: 'indexeddb', revision: 3 });
    expect(await done).toBe(true);
    expect(file.saveWorkspaceToLocalStorage).toHaveBeenCalledTimes(1);
    expect(uiStore.toasts.map((x) => [x.message, x.type])).toEqual([[t('viewer.duplicated'), 'success']]);
  });

  it('reports a failed autosave instead of a success', async () => {
    file.saveAutosave.mockResolvedValue({ ok: false, backend: 'indexeddb', revision: null, failure: { kind: 'quota', detail: '' } });
    file.saveWorkspaceToLocalStorage.mockReturnValue(true);
    expect(await duplicateViewed()).toBe(false);
    expect(uiStore.toasts.map((x) => [x.message, x.type])).toEqual([[t('viewer.duplicateNotSaved'), 'error']]);
  });

  it('reports a workspace that could not be written', async () => {
    file.saveAutosave.mockResolvedValue({ ok: true, backend: 'indexeddb', revision: 1 });
    file.saveWorkspaceToLocalStorage.mockReturnValue(false);
    expect(await duplicateViewed()).toBe(false);
    expect(uiStore.toasts.map((x) => x.type)).toEqual(['error']);
  });
});
