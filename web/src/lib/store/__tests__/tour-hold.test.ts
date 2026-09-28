/**
 * A walkthrough waits for the work its steps start: the example its first card loads.
 *
 * Advancing past the load let it land after the reader had solved; it cleared the results on
 * arrival, and the viewport disarmed the section analysis's mode with them, so the member click
 * the next card asks for selected the member instead.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { tourStore, actionAdvances } from '../tour.svelte';

// The store remembers a started tour, measures its target on the next frame and checks the page
// when it ends. The unit environment has none of the three, and none is what this is about.
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  const mem = new Map<string, string>();
  g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  g.requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
  g.location ??= { pathname: '/' };
});

describe('the walkthrough holds for a load', () => {
  it('cannot advance while one is running, and can once it settles', async () => {
    tourStore.start([{ id: 'a', target: 'none', title: '', description: '', position: 'center' }, { id: 'b', target: 'none', title: '', description: '', position: 'center' }] as never);
    let release!: () => void;
    const held = tourStore.hold(new Promise<void>((r) => { release = r; }));
    expect(tourStore.isBusy).toBe(true);
    expect(tourStore.canAdvance).toBe(false);
    tourStore.next();
    expect(tourStore.currentStepIndex).toBe(0);
    release();
    await held;
    expect(tourStore.isBusy).toBe(false);
    expect(tourStore.canAdvance).toBe(true);
    tourStore.end();
  });

  it('lets go of a load that fails', async () => {
    await expect(tourStore.hold(Promise.reject(new Error('no such example')))).rejects.toThrow();
    expect(tourStore.isBusy).toBe(false);
  });
});

describe('a card\'s action button', () => {
  it('leaves a step that advances itself to do so, instead of running ahead of its action', () => {
    const waitFor = () => false;
    expect(actionAdvances({ autoAdvance: true, waitFor })).toBe(false);
    expect(actionAdvances({ waitFor })).toBe(true);
    expect(actionAdvances({})).toBe(true);
    expect(actionAdvances({}, false)).toBe(false);
  });
});
