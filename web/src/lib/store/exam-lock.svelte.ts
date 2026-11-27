/** `room`: the window shows an exam and nothing may be written over the reader's workspace; `locked`: an attempt runs, and the lock ends by itself at the deadline plus the grace. */

export const EXAM_GRACE_MS = 30_000;

export type ReleaseReason = 'submitted' | 'deadline' | 'error' | 'disabled' | 'left';

export interface EngageInput {
  deadlineAt: string;
  serverNow: string;
}

type Timer = ReturnType<typeof setTimeout>;

let room = $state(false);
let locked = $state(false);
let deadlineMs = $state<number | null>(null);
let offsetMs = $state(0);
let reason = $state<ReleaseReason | null>(null);
let title = $state('');
let timer: Timer | null = null;
let clock: () => number = () => Date.now();

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function serverTime(): number {
  return clock() + offsetMs;
}

export const examLock = {
  get room() { return room; },
  get locked() { return locked; },
  get deadlineMs() { return deadlineMs; },
  get releaseReason() { return reason; },
  get title() { return title; },
  set title(v: string) { title = v; },

  /** True while nothing may be written over the reader's own workspace or autosave. */
  get holdsWorkspace() { return room || locked; },

  enterRoom(): void {
    room = true;
  },

  leaveRoom(): void {
    examLock.release('left');
    room = false;
  },

  /** Server milliseconds now, from the offset the last `engage` or `syncClock` measured. */
  serverNow(): number {
    return serverTime();
  },

  syncClock(serverNow: string): void {
    const at = Date.parse(serverNow);
    if (Number.isFinite(at)) offsetMs = at - clock();
  },

  /** Milliseconds left before the deadline (not the grace), never negative; null without one. */
  remainingMs(): number | null {
    if (deadlineMs === null) return null;
    return Math.max(0, deadlineMs - serverTime());
  },

  /** Locks until the deadline plus the grace. Refuses (and stays open) when that has already passed or the times are unreadable. */
  engage({ deadlineAt, serverNow }: EngageInput): boolean {
    const deadline = Date.parse(deadlineAt);
    examLock.syncClock(serverNow);
    if (!Number.isFinite(deadline) || !Number.isFinite(Date.parse(serverNow))) {
      examLock.release('error');
      return false;
    }
    deadlineMs = deadline;
    const left = deadline + EXAM_GRACE_MS - serverTime();
    if (left <= 0) {
      examLock.release('deadline');
      return false;
    }
    clearTimer();
    locked = true;
    reason = null;
    timer = setTimeout(() => examLock.release('deadline'), left);
    return true;
  },

  release(why: ReleaseReason): void {
    clearTimer();
    reason = why;
    locked = false;
  },

  /** Test seam. */
  reset(now: () => number = () => Date.now()): void {
    clearTimer();
    room = false;
    locked = false;
    deadlineMs = null;
    offsetMs = 0;
    reason = null;
    title = '';
    clock = now;
  },
};
