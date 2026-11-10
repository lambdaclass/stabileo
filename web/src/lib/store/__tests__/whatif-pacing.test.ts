/**
 * A slider drag rebuilds the model at most once a frame, never while a live solve is running,
 * and always ends on the last value set.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import { liveSolveBusy, trackLiveSolve } from '../../engine/live-calc-state';

const firstLoadValue = () => {
  const d = modelStore.model.loads[0].data as { qI?: number; p?: number; fz?: number; fy?: number };
  return d.qI ?? d.p ?? d.fz ?? d.fy;
};

beforeEach(async () => {
  whatIf.abandon();
  historyStore.clear();
  uiStore.analysisMode = '2d';
  await modelStore.loadExample('portal-frame');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  whatIf.abandon();
  vi.clearAllTimers();
  vi.useRealTimers();
  modelStore.clear();
});

describe('Explore while a live solve is running', () => {
  it('waits for it, then applies only the latest value', async () => {
    const base = firstLoadValue()!;
    whatIf.open();
    let finish!: () => void;
    const solving = trackLiveSolve(() => new Promise<void>((done) => { finish = done; }));
    expect(liveSolveBusy()).toBe(true);

    const version = modelStore.modelVersion;
    whatIf.setLoadFactor(0, 1.5);
    vi.advanceTimersByTime(20);
    whatIf.setLoadFactor(0, 2);
    vi.advanceTimersByTime(200);
    expect(modelStore.modelVersion).toBe(version);
    expect(firstLoadValue()).toBe(base);

    finish();
    await solving;
    expect(liveSolveBusy()).toBe(false);
    vi.advanceTimersByTime(20);
    expect(modelStore.modelVersion).toBe(version + 1);
    expect(firstLoadValue()).toBeCloseTo(2 * base, 12);
  });

  it('coalesces the moves of one frame into one rebuild', () => {
    whatIf.open();
    const version = modelStore.modelVersion;
    for (const f of [1.1, 1.2, 1.3, 1.4]) whatIf.setLoadFactor(0, f);
    vi.advanceTimersByTime(20);
    expect(modelStore.modelVersion).toBe(version + 1);
  });

  it('drops what was waiting when it closes', async () => {
    whatIf.open();
    const base = firstLoadValue();
    whatIf.setLoadFactor(0, 3);
    await whatIf.close();
    const version = modelStore.modelVersion;
    vi.advanceTimersByTime(50);
    expect(modelStore.modelVersion).toBe(version);
    expect(firstLoadValue()).toBe(base);
  });
});
