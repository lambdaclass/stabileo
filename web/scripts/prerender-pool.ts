import { cpus } from 'node:os';

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
