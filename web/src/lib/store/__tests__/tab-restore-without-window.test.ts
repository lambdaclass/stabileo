import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../index';
import { tabManager } from '../tabs.svelte';
import { loadFile } from '../file';

const SESSION_FILE = (JSON.parse(readFileSync(new URL('../../../../legacy-projects/v0.4.0/manifest.json', import.meta.url), 'utf8')) as { session: { file: string } }).session.file;
const SESSION_BYTES = readFileSync(new URL(`../../../../legacy-projects/v0.4.0/${SESSION_FILE}`, import.meta.url));
const SESSION = (SESSION_FILE.endsWith('.gz') ? gunzipSync(SESSION_BYTES) : SESSION_BYTES).toString('utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the deferred re-solve of a restored session that had results', () => {
  it('does nothing without a window, so a test that ends before it fires cannot fail a later one', async () => {
    vi.useFakeTimers();
    expect(typeof window).toBe('undefined');
    await loadFile(new File([SESSION], 'session.ded'));
    expect(tabManager.tabs).toHaveLength(3);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(() => vi.runAllTimers()).not.toThrow();
  });

  it('asks the window to solve when there is one', async () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    const solves = vi.fn();
    win.addEventListener('stabileo-solve', solves);
    vi.stubGlobal('window', win);
    await loadFile(new File([SESSION], 'session.ded'));
    vi.runAllTimers();
    expect(solves).toHaveBeenCalledTimes(1);
  });
});
