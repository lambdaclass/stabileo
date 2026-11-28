import { it, expect, vi } from 'vitest';
import { createRecheckStore } from '../recheck.svelte';
import '../index';
import { steelTruss } from './recheck-fixtures';

it('known wrong result: #1928 reading a published project warning only acknowledges it in the current session', async () => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  try {
    const saved = { ...createRecheckStore().capture()!, id: 'released-solve', resultsVersion: 0 };
    const project = { ...(steelTruss() as object), solvedWith: saved };
    const open = async (store: ReturnType<typeof createRecheckStore>) => {
      store.openProject(project, 'pro');
      await vi.waitFor(() => expect(store.pending).toBe(false));
    };
    const first = createRecheckStore();
    await open(first);
    expect(first.noticeOpen).toBe(true);
    first.acknowledge();
    await open(first);
    expect(first.noticeOpen).toBe(false);
    const restarted = createRecheckStore();
    await open(restarted);
    expect(restarted.noticeOpen).toBe(true);
    expect(memory.has('stabileo-recheck-acknowledged')).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
