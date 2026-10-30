import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const research = vi.hoisted(() => vi.fn(async () => (() => {}) as never));
const tools = vi.hoisted(() => vi.fn(async () => (() => {}) as never));
vi.mock('../../research/load-page', () => ({ loadResearchPage: research }));
vi.mock('../../tools/load-page', () => ({ loadToolsPage: tools }));

beforeEach(() => { vi.resetModules(); research.mockClear(); tools.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('wires the prefetch action to the crawlable PublicLink anchor', () => {
  const source = readFileSync('src/components/landing/PublicLink.svelte', 'utf8');
  expect(source).toContain('<a use:prefetchPublicLink={to} {href}');
});

it.each(['pointerenter', 'focus', 'touchstart'])('prefetches on %s, deduplicates, updates and cleans up', async event => {
  const { prefetchPublicLink, loadPublicPage } = await import('../../../lib/public-navigation');
  const anchor = new EventTarget();
  const action = prefetchPublicLink(anchor as HTMLAnchorElement, '/research');
  expect(research).not.toHaveBeenCalled();
  anchor.dispatchEvent(new Event(event));
  await loadPublicPage('/research');
  expect(research).toHaveBeenCalledTimes(1);
  anchor.dispatchEvent(new Event(event));
  await loadPublicPage('/research');
  expect(research).toHaveBeenCalledTimes(1);
  action.update('/tools');
  anchor.dispatchEvent(new Event(event));
  await loadPublicPage('/tools');
  expect(tools).toHaveBeenCalledTimes(1);
  action.update('/research/unknown');
  action.destroy();
  anchor.dispatchEvent(new Event(event));
  expect(research).toHaveBeenCalledTimes(1);
});

it('honors saveData for speculative loads but still permits navigation', async () => {
  vi.stubGlobal('navigator', { connection: { saveData: true } });
  const { prefetchPublicPage, idlePrefetchPublicPages, loadPublicPage } = await import('../../../lib/public-navigation');
  prefetchPublicPage('/research');
  idlePrefetchPublicPages();
  expect(research).not.toHaveBeenCalled();
  await loadPublicPage('/research');
  expect(research).toHaveBeenCalledOnce();
});

it('warms both index chunks at idle and cancels on teardown', async () => {
  let idle: () => void = () => {};
  const cancel = vi.fn();
  vi.stubGlobal('window', { requestIdleCallback: vi.fn(fn => { idle = fn; return 42; }), cancelIdleCallback: cancel });
  const { idlePrefetchPublicPages, loadPublicPage } = await import('../../../lib/public-navigation');
  const cleanup = idlePrefetchPublicPages();
  expect(research).not.toHaveBeenCalled();
  idle();
  await Promise.all([loadPublicPage('/research'), loadPublicPage('/tools')]);
  expect(research).toHaveBeenCalledOnce();
  expect(tools).toHaveBeenCalledOnce();
  cleanup?.();
  expect(cancel).toHaveBeenCalledWith(42);
});

it('retries failed prefetches', async () => {
  research.mockRejectedValueOnce(new Error('offline'));
  const { loadPublicPage } = await import('../../../lib/public-navigation');
  await expect(loadPublicPage('/research')).rejects.toThrow('offline');
  await loadPublicPage('/research');
  expect(research).toHaveBeenCalledTimes(2);
});

describe('public scroll reset after the route DOM commits', () => {
  it.each(['', '#a%20b', '#missing'])('resets the inner container and handles hash %s', async hash => {
    const root = { scrollTo: vi.fn(), contains: () => true };
    const target = { scrollIntoView: vi.fn() };
    const getElementById = vi.fn(id => id === 'a b' ? target : null);
    const querySelector = vi.fn(() => root);
    vi.stubGlobal('document', { querySelector, getElementById });
    vi.stubGlobal('window', { scrollTo: vi.fn() });
    const { resetPublicScroll } = await import('../../../lib/public-navigation');
    resetPublicScroll(hash);
    expect(querySelector).toHaveBeenCalledWith('.landing');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(hash === '#a%20b' ? 1 : 0);
  });
});

it('owns native scroll restoration while the public router is mounted', async () => {
  vi.stubGlobal('history', { scrollRestoration: 'auto' });
  const { manualPublicScrollRestoration } = await import('../../../lib/public-navigation');
  const cleanup = manualPublicScrollRestoration();
  expect(history.scrollRestoration).toBe('manual');
  cleanup();
  expect(history.scrollRestoration).toBe('auto');
});
