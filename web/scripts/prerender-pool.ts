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

const pendingHolds = () => (globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0;

/** Resolves once #app holds a page's worth of markup and no `holdPrerender` work is pending; after the timeout the caller still checks the length, but work still pending throws. */
export async function waitForRenderedApp(page: {
  waitForFunction(fn: (min: number) => boolean, arg: number, options: { timeout: number }): Promise<unknown>;
  evaluate(fn: () => number): Promise<number>;
}): Promise<void> {
  await page.waitForFunction(
    (min) => (document.querySelector('#app')?.innerHTML.length ?? 0) >= min && !(((globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0) > 0),
    MIN_CAPTURE_CHARS,
    { timeout: PRERENDER_NAVIGATION_TIMEOUT_MS },
  )
    .catch(() => undefined);
  const pending = await page.evaluate(pendingHolds);
  if (pending > 0) throw new Error(`prerender: ${pending} load(s) the page renders were still pending after ${PRERENDER_NAVIGATION_TIMEOUT_MS / 1000} s`);
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
