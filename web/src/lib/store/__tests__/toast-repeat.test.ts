import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uiStore } from '../index';

describe('a toast that repeats', () => {
  beforeEach(() => { vi.useFakeTimers(); uiStore.toasts.splice(0); });
  afterEach(() => { uiStore.toasts.splice(0); vi.useRealTimers(); });

  it('replaces the one on screen, moves to the newest place and lives its full time again', () => {
    uiStore.toast('Node I: 1 — click on Node J');
    uiStore.toast('Member 9 created', 'success');
    vi.advanceTimersByTime(3000);
    uiStore.toast('Node I: 1 — click on Node J');
    expect(uiStore.toasts.map((x) => x.message)).toEqual(['Member 9 created', 'Node I: 1 — click on Node J']);
    vi.advanceTimersByTime(1500);
    expect(uiStore.toasts.map((x) => x.message)).toEqual(['Node I: 1 — click on Node J']);
    vi.advanceTimersByTime(2600);
    expect(uiStore.toasts).toHaveLength(0);
  });

  it('keeps apart the same words of another kind or with another action', () => {
    uiStore.toast('Done', 'success');
    uiStore.toast('Done', 'error');
    uiStore.toast('Done', 'success', 'kinematic');
    expect(uiStore.toasts).toHaveLength(3);
  });
});
