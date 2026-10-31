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
  const { prefetchPublicLink } = await import('../../../lib/public-navigation');
  const anchor = new EventTarget();
  const action = prefetchPublicLink(anchor as HTMLAnchorElement, '/research');
  anchor.dispatchEvent(new Event(event === 'focus' ? 'blur' : 'click'));
  await vi.dynamicImportSettled();
  expect(research).not.toHaveBeenCalled();
  anchor.dispatchEvent(new Event(event));
  await vi.dynamicImportSettled();
  expect(research).toHaveBeenCalledExactlyOnceWith('/research');
  anchor.dispatchEvent(new Event(event));
  await vi.dynamicImportSettled();
  expect(research).toHaveBeenCalledOnce();
  action.update('/tools');
  anchor.dispatchEvent(new Event(event));
  await vi.dynamicImportSettled();
  expect(tools).toHaveBeenCalledExactlyOnceWith('/tools');
  action.update('/research/unknown');
  action.destroy();
  anchor.dispatchEvent(new Event(event));
  await vi.dynamicImportSettled();
  expect(research).toHaveBeenCalledOnce();
});

it('honors saveData for speculative loads but still permits navigation', async () => {
  vi.stubGlobal('navigator', { connection: { saveData: true } });
  const requestIdleCallback = vi.fn();
  vi.stubGlobal('window', { requestIdleCallback, setTimeout: vi.fn() });
  const { prefetchPublicLink, idlePrefetchPublicPages, loadPublicPage } = await import('../../../lib/public-navigation');
  const anchor = new EventTarget();
  prefetchPublicLink(anchor as HTMLAnchorElement, '/research');
  anchor.dispatchEvent(new Event('pointerenter'));
  expect(idlePrefetchPublicPages()).toBeUndefined();
  expect(requestIdleCallback).not.toHaveBeenCalled();
  await vi.dynamicImportSettled();
  expect(research).not.toHaveBeenCalled();
  await loadPublicPage('/research');
  expect(research).toHaveBeenCalledOnce();
});

it('warms both index chunks only when the idle callback fires, and cancels on teardown', async () => {
  let idle: () => void = () => {};
  const cancel = vi.fn();
  vi.stubGlobal('window', { requestIdleCallback: vi.fn(fn => { idle = fn; return 42; }), cancelIdleCallback: cancel });
  const { idlePrefetchPublicPages } = await import('../../../lib/public-navigation');
  const cleanup = idlePrefetchPublicPages();
  await vi.dynamicImportSettled();
  expect(research).not.toHaveBeenCalled();
  expect(tools).not.toHaveBeenCalled();
  idle();
  await vi.dynamicImportSettled();
  expect(research).toHaveBeenCalledExactlyOnceWith('/research');
  expect(tools).toHaveBeenCalledExactlyOnceWith('/tools');
  cleanup?.();
  expect(cancel).toHaveBeenCalledWith(42);
});

it('falls back to a timer when requestIdleCallback is missing', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const { idlePrefetchPublicPages } = await import('../../../lib/public-navigation');
  const cleanup = idlePrefetchPublicPages();
  await vi.dynamicImportSettled();
  expect(research).not.toHaveBeenCalled();
  vi.runAllTimers();
  vi.useRealTimers();
  await vi.dynamicImportSettled();
  expect(research).toHaveBeenCalledOnce();
  expect(tools).toHaveBeenCalledOnce();
  cleanup?.();
});

it('a cancelled idle warm-up loads nothing', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const { idlePrefetchPublicPages } = await import('../../../lib/public-navigation');
  idlePrefetchPublicPages()?.();
  vi.runAllTimers();
  vi.useRealTimers();
  await vi.dynamicImportSettled();
  expect(research).not.toHaveBeenCalled();
  expect(tools).not.toHaveBeenCalled();
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
