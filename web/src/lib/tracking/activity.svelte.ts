import { request } from '../api/client';
import { accounts } from '../features';
import { authStore } from '../store/auth.svelte';
import { adAttribution } from './attribution';
import { tracking } from './tracking';

export type Milestone = 'first_analysis' | 'first_save' | 'first_export';

const ACTIVE_KEY = 'stb-active-day';
const RECORDED_KEY = 'stb-milestones';
const BUENOS_AIRES_OFFSET_MS = 3 * 3600_000;
const SKIP_WINDOW_MS = 30_000;
const pending = new Set<Milestone>();
let skips: number[] = [];
let sending: Promise<void> | null = null;

export function today(now = Date.now()): string {
  return new Date(now - BUENOS_AIRES_OFFSET_MS).toISOString().slice(0, 10);
}

function recorded(accountId: string): Set<Milestone> {
  try {
    const raw = localStorage.getItem(`${RECORDED_KEY}:${accountId}`);
    return new Set(raw ? (JSON.parse(raw) as Milestone[]) : []);
  } catch {
    return new Set();
  }
}

function markRecorded(accountId: string, milestones: readonly Milestone[]): void {
  if (milestones.length === 0) return;
  try {
    const all = recorded(accountId);
    for (const m of milestones) all.add(m);
    localStorage.setItem(`${RECORDED_KEY}:${accountId}`, JSON.stringify([...all]));
  } catch {
    return;
  }
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
  const known = recorded(account.id);
  for (const m of known) pending.delete(m);
  if (pending.size === 0 && reportedToday(account.id)) return;
  const milestones = [...pending];
  pending.clear();
  try {
    const answer = await request<{ data: { recorded: Milestone[] } }>('POST', '/api/v1/marketing/activity', {
      auth: true,
      body: { milestones, attribution: adAttribution(), page: location.pathname },
    });
    markReported(account.id);
    markRecorded(account.id, milestones);
    if (answer.data.recorded.includes('first_save')) void tracking.firstSave(account.id);
  } catch {
    for (const m of milestones) pending.add(m);
  }
}

export function reportActivity(): Promise<void> {
  sending = (sending ?? Promise.resolve()).then(flush);
  return sending;
}

/** The next solve was started by the app (an example opening, a tab restoring), not by the person. */
export function skipNextAnalysis(now = Date.now()): void {
  skips.push(now + SKIP_WINDOW_MS);
}

export function analysisFinished(ok: boolean, now = Date.now()): void {
  skips = skips.filter((until) => until > now);
  if (skips.length > 0) {
    skips.shift();
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
