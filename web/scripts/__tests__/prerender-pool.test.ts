import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { captureProblem, MIN_CAPTURE_CHARS, newPrerenderPage, PRERENDER_NAVIGATION_TIMEOUT_MS, prerenderConcurrency, routePool, waitForRenderedApp } from '../prerender-pool';

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

  type Probe = (min: number) => boolean;
  function withDocument<T>(app: { innerHTML: string; pending?: boolean; failed?: boolean }, run: () => T): T {
    const doc = globalThis as { document?: unknown };
    const before = doc.document;
    doc.document = {
      querySelector: (s: string) => (s === '#app' ? app
        : s === '#app [data-public-pending]' ? (app.pending ? {} : null)
          : s === '#app [data-public-load-failed]' ? (app.failed ? {} : null) : null),
    };
    const restore = () => { doc.document = before; };
    let result: T;
    try { result = run(); } catch (error) { restore(); throw error; }
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  }
  const timedOut = async () => { throw new Error('Timeout 120000ms exceeded'); };

  it('a capture waits for the page to render, not only for the network to go quiet', async () => {
    const calls: { fn: Probe; arg: number; timeout: number }[] = [];
    const app = { innerHTML: '<!----><!---->' };
    await withDocument(app, () => waitForRenderedApp({ waitForFunction: async (fn, arg, { timeout }) => { calls.push({ fn, arg, timeout }); }, evaluate: async (fn) => fn() }));
    expect(calls).toHaveLength(1);
    expect(calls[0].arg).toBe(MIN_CAPTURE_CHARS);
    expect(calls[0].timeout).toBe(PRERENDER_NAVIGATION_TIMEOUT_MS);
    withDocument(app, () => {
      expect(calls[0].fn(MIN_CAPTURE_CHARS)).toBe(false);
      app.innerHTML = 'x'.repeat(MIN_CAPTURE_CHARS);
      expect(calls[0].fn(MIN_CAPTURE_CHARS)).toBe(true);
    });
  });

  it('a header over the loading placeholder is not captured as the page, however long its markup (#1770)', async () => {
    const calls: Probe[] = [];
    const app = { innerHTML: 'x'.repeat(MIN_CAPTURE_CHARS * 10), pending: true };
    await withDocument({ innerHTML: '' }, () => waitForRenderedApp({ waitForFunction: async (fn) => { calls.push(fn); }, evaluate: async (fn) => fn() }));
    withDocument(app, () => {
      expect(calls[0](MIN_CAPTURE_CHARS)).toBe(false);
      app.pending = false;
      expect(calls[0](MIN_CAPTURE_CHARS)).toBe(true);
    });
  });

  it('a page still showing its loading placeholder at the timeout fails the capture (#1770)', async () => {
    const app = { innerHTML: 'x'.repeat(MIN_CAPTURE_CHARS * 10), pending: true };
    await expect(withDocument(app, () => waitForRenderedApp({ waitForFunction: timedOut, evaluate: async (fn) => fn() })))
      .rejects.toThrow(/still showed its loading placeholder/);
  });

  it('a page whose content failed to load stops the wait and fails the capture (#1770)', async () => {
    const calls: Probe[] = [];
    const app = { innerHTML: '<h1>Stabileo Blog</h1>', pending: true, failed: true };
    await expect(withDocument(app, () => waitForRenderedApp({ waitForFunction: async (fn) => { calls.push(fn); }, evaluate: async (fn) => fn() })))
      .rejects.toThrow(/load-failed placeholder/);
    withDocument(app, () => expect(calls[0](MIN_CAPTURE_CHARS)).toBe(true));
  });

  it('a rendered shell is not captured while the page still holds work it will render (#1452)', async () => {
    const calls: Probe[] = [];
    await withDocument({ innerHTML: '' }, () => waitForRenderedApp({ waitForFunction: async (fn) => { calls.push(fn); }, evaluate: async (fn) => fn() }));
    const scope = globalThis as { __prerenderHolds?: number };
    try {
      withDocument({ innerHTML: 'x'.repeat(MIN_CAPTURE_CHARS * 10) }, () => {
        scope.__prerenderHolds = 1;
        expect(calls[0](MIN_CAPTURE_CHARS)).toBe(false);
        scope.__prerenderHolds = 0;
        expect(calls[0](MIN_CAPTURE_CHARS)).toBe(true);
      });
    } finally {
      delete scope.__prerenderHolds;
    }
  });

  it('a load that never settles fails the capture instead of writing the shell (#1452)', async () => {
    const scope = globalThis as { __prerenderHolds?: number };
    scope.__prerenderHolds = 1;
    try {
      await expect(withDocument({ innerHTML: 'x'.repeat(MIN_CAPTURE_CHARS) }, () => waitForRenderedApp({ waitForFunction: timedOut, evaluate: async (fn) => fn() })))
        .rejects.toThrow(/1 load\(s\) the page renders were still pending/);
    } finally {
      delete scope.__prerenderHolds;
    }
  });

  it('a page that never renders is left to the caller, which refuses to write it', async () => {
    await expect(withDocument({ innerHTML: '' }, () => waitForRenderedApp({ waitForFunction: timedOut, evaluate: async (fn) => fn() }))).resolves.toBeUndefined();
    const source = readFileSync(new URL('../prerender.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/await waitForRenderedApp\(page\);\n\s*const \{ head, body \}/);
    expect(source.match(/const problem = captureProblem\(result, (locale|DEFAULT_LOCALE)\);\n\s*if \(problem\) throw new Error/g)).toHaveLength(2);
  });
});

describe('a captured page', () => {
  const head = '<title>x</title><link rel="alternate" hreflang="en" href="https://stabileo.com/en/blog/x/"><link rel="alternate" hreflang="es" href="https://stabileo.com/es/blog/x/">';
  const body = 'x'.repeat(MIN_CAPTURE_CHARS);

  it('is written when it is a page in its own language with its hreflang set', () => {
    expect(captureProblem({ head, body, lang: 'es' }, 'es')).toBeUndefined();
  });

  it('is refused when nearly empty', () => {
    expect(captureProblem({ head, body: 'x', lang: 'es' }, 'es')).toBe('came back nearly empty (1 chars)');
  });

  it('is refused when it still carries the fallback shell\'s English, as /es/blog/learn-structural-analysis-step-by-step/ did (#1770)', () => {
    expect(captureProblem({ head: '<title>Stabileo</title>', body, lang: 'en' }, 'es')).toBe('came back in <html lang="en">, not es');
  });

  it('is refused without its own hreflang link, as /es/examples/outrigger/ was (#1770)', () => {
    expect(captureProblem({ head: '<title>Stabileo</title>', body, lang: 'es' }, 'es')).toBe('came back without its hreflang="es" link');
  });
});

describe('the loading placeholder', () => {
  it('carries the marker the capture waits on', () => {
    const source = readFileSync(new URL('../../src/components/site/PublicPending.svelte', import.meta.url), 'utf8');
    expect(source).toMatch(/<div class="landing blog"[^>]*\sdata-public-pending[\s>]/);
  });
});
