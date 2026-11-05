import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN_CAPTURE_CHARS, newPrerenderPage, PRERENDER_NAVIGATION_TIMEOUT_MS, prerenderConcurrency, routePool, waitForRenderedApp } from '../prerender-pool';

const routes = ['/a/', '/b/', '/c/', '/d/'].map(href => ({ href }));

describe('prerender route pool', () => {
  it('bounds and reuses pages, preserving serial results despite reversed completion order', async () => {
    let created = 0;
    const closed: number[] = [];
    const completed: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const results = await routePool(routes, 2, async () => ++created, async p => { closed.push(p); }, async (_, route) => {
      if (route.href === '/a/') await gate;
      completed.push(route.href);
      if (route.href === '/d/') release();
      return `HTML ${route.href}`;
    });
    expect(created).toBe(2);
    expect(closed.sort()).toEqual([1, 2]);
    expect(completed).toEqual(['/b/', '/c/', '/d/', '/a/']);
    expect(results).toEqual(routes.map(r => `HTML ${r.href}`));
  });

  it('names the failing route, drains active work and closes every page', async () => {
    const cause = new Error('navigation failed');
    const closed: number[] = [];
    let created = 0;
    let finished = false;
    const started: string[] = [];
    const run = routePool(routes, 2, async () => ++created, async p => { closed.push(p); }, async (_, route) => {
      started.push(route.href);
      if (route.href === '/a/') throw cause;
      await Promise.resolve();
      finished = true;
      return route.href;
    });
    await expect(run).rejects.toMatchObject({ message: 'prerender: /a/ failed', cause });
    expect(finished).toBe(true);
    expect(started).toEqual(['/a/', '/b/']);
    expect(closed.sort()).toEqual([1, 2]);
  });

  it('defaults to at most six CPUs and accepts only positive integer overrides', () => {
    expect(prerenderConcurrency(undefined, 4)).toBe(4);
    expect(prerenderConcurrency(undefined, 16)).toBe(6);
    expect(prerenderConcurrency('1', 4)).toBe(1);
    for (const value of ['0', '-1', '1.5', 'NaN', '']) expect(() => prerenderConcurrency(value)).toThrow('PRERENDER_CONCURRENCY');
  });
});

describe('prerender navigation timeout', () => {
  it('gives every prerender page 120 s per navigation, so a loaded build host does not fail the build', async () => {
    const set: number[] = [];
    const page = await newPrerenderPage(async () => ({ setDefaultNavigationTimeout: (ms: number) => { set.push(ms); } }));
    expect(PRERENDER_NAVIGATION_TIMEOUT_MS).toBe(120_000);
    expect(set).toEqual([120_000]);
    expect(page).toBeDefined();
  });

  it('creates every page in prerender.ts through newPrerenderPage', () => {
    const source = readFileSync(new URL('../prerender.ts', import.meta.url), 'utf8');
    const pages = source.match(/browser\.newPage\(/g) ?? [];
    const wrapped = source.match(/newPrerenderPage\(\(\) => browser\.newPage\(/g) ?? [];
    expect(pages.length).toBeGreaterThan(0);
    expect(wrapped.length).toBe(pages.length);
  });

  it('a capture waits for the page to render, not only for the network to go quiet', async () => {
    const calls: { fn: (min: number) => boolean; arg: number; timeout: number }[] = [];
    await waitForRenderedApp({ waitForFunction: async (fn, arg, { timeout }) => { calls.push({ fn, arg, timeout }); } });
    expect(calls).toHaveLength(1);
    expect(calls[0].arg).toBe(MIN_CAPTURE_CHARS);
    expect(calls[0].timeout).toBe(PRERENDER_NAVIGATION_TIMEOUT_MS);
    const app = { innerHTML: '<!----><!---->' };
    const doc = globalThis as { document?: unknown };
    const before = doc.document;
    doc.document = { querySelector: (s: string) => (s === '#app' ? app : null) };
    try {
      expect(calls[0].fn(MIN_CAPTURE_CHARS)).toBe(false);
      app.innerHTML = 'x'.repeat(MIN_CAPTURE_CHARS);
      expect(calls[0].fn(MIN_CAPTURE_CHARS)).toBe(true);
    } finally {
      doc.document = before;
    }
  });

  it('a rendered shell is not captured while the page still holds work it will render (#1452)', async () => {
    const calls: ((min: number) => boolean)[] = [];
    await waitForRenderedApp({ waitForFunction: async (fn) => { calls.push(fn); } });
    const doc = globalThis as { document?: unknown; __prerenderHolds?: number };
    const before = doc.document;
    doc.document = { querySelector: (s: string) => (s === '#app' ? { innerHTML: 'x'.repeat(MIN_CAPTURE_CHARS * 10) } : null) };
    try {
      doc.__prerenderHolds = 1;
      expect(calls[0](MIN_CAPTURE_CHARS)).toBe(false);
      doc.__prerenderHolds = 0;
      expect(calls[0](MIN_CAPTURE_CHARS)).toBe(true);
    } finally {
      doc.document = before;
      delete doc.__prerenderHolds;
    }
  });

  it('a page that never renders is left to the caller, which reports it as nearly empty', async () => {
    await expect(waitForRenderedApp({ waitForFunction: async () => { throw new Error('Timeout 120000ms exceeded'); } })).resolves.toBeUndefined();
    const source = readFileSync(new URL('../prerender.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/await waitForRenderedApp\(page\);\n\s*const \{ head, body \}/);
    expect(source).toMatch(/body\.length < MIN_CAPTURE_CHARS\) throw new Error\(`prerender: \$\{href\} came back nearly empty/);
  });
});
