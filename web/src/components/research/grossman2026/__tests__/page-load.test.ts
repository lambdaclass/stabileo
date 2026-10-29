import { afterEach, expect, it, vi } from 'vitest';
import { initializePage } from '../page-load';
import { Playback } from '../../shell/playback.svelte';

afterEach(() => vi.useRealTimers());

it('does not restart playback when navigating away during the WASM load', async () => {
  vi.useFakeTimers();
  const playback = new Playback(10, 10);
  let resolve!: () => void;
  const ready = vi.fn(() => {
    playback.setCount(20);
    playback.startAutoplay({ reducedMotion: false, narrow: false });
  });
  const failed = vi.fn();
  const cancel = initializePage(new Promise<void>(r => { resolve = r; }), ready, failed);
  cancel();
  playback.dispose();
  resolve();
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  expect(playback.playing).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('ignores a rejected load after navigation', async () => {
  const failed = vi.fn();
  let reject!: (error: Error) => void;
  const cancel = initializePage(new Promise<void>((_, r) => { reject = r; }), vi.fn(), failed);
  cancel();
  reject(new Error('unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  expect(failed).not.toHaveBeenCalled();
});

it('delivers successful loads and failures while mounted', async () => {
  const ready = vi.fn();
  const failed = vi.fn();
  initializePage(Promise.resolve('glue'), ready, failed);
  initializePage(Promise.reject(new Error('unavailable')), ready, failed);
  await Promise.resolve();
  await Promise.resolve();
  expect(ready).toHaveBeenCalledWith('glue');
  expect(failed).toHaveBeenCalledWith(new Error('unavailable'));
});

it('preserves an interaction while WASM is loading', async () => {
  vi.useFakeTimers();
  const playback = new Playback(10, 10);
  let resolve!: () => void;
  initializePage(new Promise<void>(r => { resolve = r; }), () => {
    playback.setCount(26);
    playback.startAutoplay({ reducedMotion: false, narrow: false });
  }, vi.fn());
  playback.pause();
  resolve();
  await Promise.resolve();
  expect(playback.playing).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('stops playing after one narrow-screen sweep', () => {
  vi.useFakeTimers();
  const playback = new Playback(140, 1800);
  playback.setCount(26);
  playback.startAutoplay({ reducedMotion: false, narrow: true });
  vi.advanceTimersByTime(5300);
  expect(playback.shown).toBe(25);
  expect(playback.playing).toBe(false);
  playback.dispose();
});
