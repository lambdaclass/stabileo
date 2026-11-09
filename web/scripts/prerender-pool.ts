import { cpus } from 'node:os';

export const PRERENDER_NAVIGATION_TIMEOUT_MS = 120_000;

export async function newPrerenderPage<P extends { setDefaultNavigationTimeout(timeout: number): void }>(
  create: () => Promise<P>,
): Promise<P> {
  const page = await create();
  page.setDefaultNavigationTimeout(PRERENDER_NAVIGATION_TIMEOUT_MS);
  return page;
}

export const MIN_CAPTURE_CHARS = 500;

type CaptureState = { holds: number; placeholder: boolean; failed: boolean };

function captureState(): CaptureState {
  return {
    holds: (globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0,
    placeholder: document.querySelector('#app [data-public-pending]') !== null,
    failed: document.querySelector('#app [data-public-load-failed]') !== null,
  };
}

/** Resolves once #app holds a page's worth of markup, its content has replaced the loading placeholder and no `holdPrerender` work is pending; throws if the page failed to load or is still loading after the timeout. */
export async function waitForRenderedApp(page: {
  waitForFunction(fn: (min: number) => boolean, arg: number, options: { timeout: number }): Promise<unknown>;
  evaluate(fn: () => CaptureState): Promise<CaptureState>;
}): Promise<void> {
  await page.waitForFunction(
    (min) => document.querySelector('#app [data-public-load-failed]') !== null || (
      (document.querySelector('#app')?.innerHTML.length ?? 0) >= min
      && document.querySelector('#app [data-public-pending]') === null
      && !(((globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0) > 0)),
    MIN_CAPTURE_CHARS,
    { timeout: PRERENDER_NAVIGATION_TIMEOUT_MS },
  )
    .catch(() => undefined);
  const { holds, placeholder, failed } = await page.evaluate(captureState);
  if (failed) throw new Error('prerender: the page showed its load-failed placeholder instead of its content');
  if (holds > 0) throw new Error(`prerender: ${holds} load(s) the page renders were still pending after ${PRERENDER_NAVIGATION_TIMEOUT_MS / 1000} s`);
  if (placeholder) throw new Error(`prerender: the page still showed its loading placeholder after ${PRERENDER_NAVIGATION_TIMEOUT_MS / 1000} s`);
}

/** Why a captured page must not be written, or undefined when it is a real page in `locale`. */
export function captureProblem({ head, body, lang }: { head: string; body: string; lang: string }, locale: string): string | undefined {
  if (body.length < MIN_CAPTURE_CHARS) return `came back nearly empty (${body.length} chars)`;
  if (lang !== locale) return `came back in <html lang="${lang}">, not ${locale}`;
  if (!new RegExp(`<link[^>]*hreflang="${locale}"`).test(head)) return `came back without its hreflang="${locale}" link`;
  return undefined;
}

export function prerenderConcurrency(value = process.env.PRERENDER_CONCURRENCY, cpuCount = cpus().length): number {
  const count = value === undefined ? Math.min(6, Math.max(1, cpuCount)) : Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('PRERENDER_CONCURRENCY must be a positive integer');
  }
  return count;
}

/** Reuse one resource per worker; return results in input order, regardless of completion order.
 * Drain active workers before cleanup/rejection, and stop assigning work after the first failure.
 */
export async function routePool<T extends { href: string }, P, R>(
  routes: readonly T[], concurrency: number,
  create: () => Promise<P>, close: (page: P) => Promise<void>,
  render: (page: P, route: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid pool concurrency');
  const results = new Array<R>(routes.length);
  let next = 0;
  let failure: Error | undefined;
  await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, async () => {
    let resource: P | undefined;
    let route: T | undefined;
    try {
      resource = await create();
      while (!failure && next < routes.length) {
        const index = next++;
        route = routes[index];
        results[index] = await render(resource, route);
      }
    } catch (cause) {
      failure ??= new Error(`prerender: ${route?.href ?? 'worker setup'} failed`, { cause });
    } finally {
      if (resource !== undefined) {
        try { await close(resource); }
        catch (cause) { failure ??= new Error('prerender: worker cleanup failed', { cause }); }
      }
    }
  }));
  if (failure) throw failure;
  return results;
}
