/**
 * What a signed-in account does that shows it uses Stabileo: its first analysis, save and export,
 * and each day it opens the app (`POST /api/v1/marketing/activity`). Milestones reached before
 * signing in wait in memory and go once there is a session; the backend answers the ones it had
 * not seen, and a first save is then sent to the pixel with the backend's event id.
 */
import { request } from '../api/client';
import { accounts } from '../features';
import { authStore } from '../store/auth.svelte';
import { pixelCookies } from './attribution';
import { tracking } from './tracking';

export type Milestone = 'first_analysis' | 'first_save' | 'first_export';

const ACTIVE_KEY = 'stb-active-day';
const pending = new Set<Milestone>();
let skipAnalysis = 0;
let sending: Promise<void> | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function reportedToday(accountId: string): boolean {
  try {
    return localStorage.getItem(ACTIVE_KEY) === `${accountId}:${today()}`;
  } catch {
    return false;
  }
}

function markReported(accountId: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, `${accountId}:${today()}`);
  } catch {
    /* private mode: the day may be reported again, which the backend ignores */
  }
}

async function flush(): Promise<void> {
  const account = authStore.account;
  if (!accounts() || !authStore.isAuthenticated || !account) return;
  if (pending.size === 0 && reportedToday(account.id)) return;
  const milestones = [...pending];
  pending.clear();
  try {
    const answer = await request<{ data: { recorded: Milestone[] } }>('POST', '/api/v1/marketing/activity', {
      auth: true,
      body: { milestones, attribution: pixelCookies(), page: location.pathname },
    });
    markReported(account.id);
    if (answer.data.recorded.includes('first_save')) tracking.firstSave(account.id);
  } catch {
    for (const m of milestones) pending.add(m);
  }
}

export function reportActivity(): Promise<void> {
  sending = (sending ?? Promise.resolve()).then(flush);
  return sending;
}

/** The next solve was started by the app (an example opening, a tab restoring), not by the person. */
export function skipNextAnalysis(): void {
  skipAnalysis += 1;
}

/** A solve finished: the person's first analysis, unless the app started it. */
export function analysisFinished(ok: boolean): void {
  if (skipAnalysis > 0) {
    skipAnalysis -= 1;
    return;
  }
  if (ok) milestone('first_analysis');
}

export function milestone(kind: Milestone): void {
  if (!accounts()) return;
  pending.add(kind);
  void reportActivity();
}

export function pendingMilestones(): Milestone[] {
  return [...pending];
}

export function watchActivity(): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (authStore.isAuthenticated) void reportActivity();
    });
  });
}
