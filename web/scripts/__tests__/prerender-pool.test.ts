import { describe, expect, it } from 'vitest';
import { prerenderConcurrency, routePool } from '../prerender-pool';

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
