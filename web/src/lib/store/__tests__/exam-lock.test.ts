import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { examLock, EXAM_GRACE_MS } from '../exam-lock.svelte';

const T0 = Date.parse('2026-11-12T13:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  examLock.reset();
});
afterEach(() => {
  examLock.reset();
  vi.useRealTimers();
});

describe('the exam lock fails open', () => {
  it('locks until the deadline plus the grace, by the server clock, then lifts itself', () => {
    const serverNow = T0 + 5 * 60_000;
    expect(examLock.engage({ deadlineAt: iso(serverNow + 60_000), serverNow: iso(serverNow) })).toBe(true);
    expect(examLock.locked).toBe(true);
    expect(examLock.remainingMs()).toBe(60_000);
    vi.advanceTimersByTime(60_000 + EXAM_GRACE_MS - 1);
    expect(examLock.locked).toBe(true);
    vi.advanceTimersByTime(1);
    expect(examLock.locked).toBe(false);
    expect(examLock.releaseReason).toBe('deadline');
    expect(examLock.remainingMs()).toBe(0);
  });

  it('refuses to lock past the grace, or on times it cannot read', () => {
    expect(examLock.engage({ deadlineAt: iso(T0 - EXAM_GRACE_MS), serverNow: iso(T0) })).toBe(false);
    expect(examLock.locked).toBe(false);
    expect(examLock.engage({ deadlineAt: 'soon', serverNow: iso(T0) })).toBe(false);
    expect(examLock.locked).toBe(false);
    expect(examLock.releaseReason).toBe('error');
  });

  it.each(['submitted', 'error', 'disabled', 'left'] as const)('lifts on %s and records why', (why) => {
    examLock.engage({ deadlineAt: iso(T0 + 3_600_000), serverNow: iso(T0) });
    examLock.release(why);
    expect(examLock.locked).toBe(false);
    expect(examLock.releaseReason).toBe(why);
    vi.advanceTimersByTime(3_600_000 + EXAM_GRACE_MS);
    expect(examLock.releaseReason).toBe(why);
  });

  it('holds the workspace while the room is open, and leaving the room lifts the lock too', () => {
    expect(examLock.holdsWorkspace).toBe(false);
    examLock.enterRoom();
    expect(examLock.holdsWorkspace).toBe(true);
    examLock.engage({ deadlineAt: iso(T0 + 60_000), serverNow: iso(T0) });
    examLock.leaveRoom();
    expect(examLock.locked).toBe(false);
    expect(examLock.room).toBe(false);
    expect(examLock.holdsWorkspace).toBe(false);
  });

  it('counts down from the server clock even when the computer is off by minutes', () => {
    examLock.syncClock(iso(T0 + 10 * 60_000));
    examLock.engage({ deadlineAt: iso(T0 + 15 * 60_000), serverNow: iso(T0 + 10 * 60_000) });
    expect(examLock.remainingMs()).toBe(5 * 60_000);
    expect(examLock.serverNow()).toBe(T0 + 10 * 60_000);
  });
});
