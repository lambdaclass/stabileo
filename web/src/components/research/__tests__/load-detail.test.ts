import { afterEach, describe, expect, it, vi } from 'vitest';

const replay = vi.hoisted(() => ({ calls: 0, release: null as null | ((value: unknown) => void), fail: false }));

vi.mock('../shauer2025/ShauerPage.svelte', () => ({ default: function ShauerPage() {} }));
vi.mock('../shauer2025/replay-data', () => ({
  shauerReplay: () => {
    replay.calls++;
    return new Promise((resolve, reject) => {
      replay.release = (value) => (replay.fail ? reject(new Error('offline')) : resolve(value));
    });
  },
}));

afterEach(() => {
  vi.resetModules();
  replay.calls = 0;
  replay.release = null;
  replay.fail = false;
});

describe('research detail loader', () => {
  it('starts the Shauer replay with the page chunk and resolves only once it has arrived', async () => {
    const { loadResearchDetail, loadedResearchDetails } = await import('../load-detail');
    let resolved = false;
    const loading = loadResearchDetail('/research/fracture/shauer-2025/').then((page) => { resolved = true; return page; });
    await vi.waitFor(() => expect(replay.calls).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    replay.release!({ frames: [] });
    const page = await loading;
    expect((page as { name: string }).name).toBe('ShauerPage');
    expect(loadedResearchDetails['/research/fracture/shauer-2025']).toBe(page);
  });

  it('still renders the page when the replay cannot be fetched, which then shows its own error', async () => {
    const { loadResearchDetail } = await import('../load-detail');
    replay.fail = true;
    const loading = loadResearchDetail('/research/fracture/shauer-2025');
    await vi.waitFor(() => expect(replay.release).not.toBeNull());
    replay.release!(null);
    expect(((await loading) as { name: string }).name).toBe('ShauerPage');
  });

  it('fetches no replay for a paper without one', async () => {
    const { loadResearchDetail } = await import('../load-detail');
    expect(await loadResearchDetail('/research')).toBeNull();
    expect(replay.calls).toBe(0);
  });
});
