import { afterEach, expect, it, vi } from 'vitest';
import { createFigureLoader, FIGURE_LOAD_TIMEOUT_MS } from '../hero/figure-loader';

afterEach(() => vi.useRealTimers());

for (const expired of [false, true]) {
  it(`#2285 retries a rejected import (expired: ${expired})`, async () => {
    vi.useFakeTimers();
    const module = {};
    const chunk = Promise.withResolvers<typeof module>();
    const loader = vi.fn().mockReturnValueOnce(chunk.promise).mockResolvedValueOnce(module);
    const load = createFigureLoader(loader);
    expect(loader).not.toHaveBeenCalled();
    const preload = load();
    const selection = load();
    expect(selection).toBe(preload);
    if (expired) {
      await vi.advanceTimersByTimeAsync(FIGURE_LOAD_TIMEOUT_MS);
      await expect(selection).resolves.toBeUndefined();
      await expect(load()).resolves.toBeUndefined();
    }
    chunk.reject(new Error('chunk unavailable'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(selection).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const retry = load();
    expect(load()).toBe(retry);
    await expect(retry).resolves.toBe(module);
    await expect(load()).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(2);
  });
}

it('accepts a module that resolves just before its deadline', async () => {
  vi.useFakeTimers();
  const module = {};
  const chunk = Promise.withResolvers<typeof module>();
  const loader = vi.fn(() => chunk.promise);
  const load = createFigureLoader(loader);
  const selection = load();
  await vi.advanceTimersByTimeAsync(FIGURE_LOAD_TIMEOUT_MS - 1);
  chunk.resolve(module);
  await expect(selection).resolves.toBe(module);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(2);
  await expect(load()).resolves.toBe(module);
  expect(loader).toHaveBeenCalledTimes(1);
});

it('#2285 caches a module that arrives after the deadline for later callers', async () => {
  vi.useFakeTimers();
  const module = {};
  const chunk = Promise.withResolvers<typeof module>();
  const loader = vi.fn(() => chunk.promise);
  const load = createFigureLoader(loader);
  const preload = load();
  const selection = load();
  expect(selection).toBe(preload);
  await vi.advanceTimersByTimeAsync(FIGURE_LOAD_TIMEOUT_MS);
  await expect(selection).resolves.toBeUndefined();
  await expect(load()).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  chunk.resolve(module);
  await vi.advanceTimersByTimeAsync(0);
  await expect(load()).resolves.toBe(module);
  expect(loader).toHaveBeenCalledTimes(1);
});
