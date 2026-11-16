import { adminApi, type AdminFeedback, type FeedbackStatus, type InsightsSummary } from '../lib/api/admin';
import { adminAuth } from './admin-auth.svelte';
import { createListStore } from './list-store.svelte';

let summary = $state<InsightsSummary | null>(null);
let days = $state(30);
let loading = $state(false);
let error = $state<unknown>(null);
let seq = 0;

export const adminMetrics = {
  get summary() { return summary; },
  get days() { return days; },
  get loading() { return loading; },
  get error() { return error; },

  async load(next: number = days): Promise<void> {
    days = next;
    const mine = ++seq;
    loading = true;
    try {
      const s = await adminAuth.call(() => adminApi.insightsSummary(next));
      if (mine !== seq) return;
      summary = s;
      error = null;
    } catch (e) {
      if (mine !== seq) return;
      error = e;
    } finally {
      if (mine === seq) loading = false;
    }
  },

  reset(): void {
    seq++;
    summary = null;
    days = 30;
    loading = false;
    error = null;
  },
};

export const adminProjects = createListStore((p) => adminApi.listProjects(p));
export const adminAudit = createListStore((p) => adminApi.listAuditLog(p));

const feedbackList = createListStore<AdminFeedback>((p) => adminApi.listFeedback(p));

export const adminFeedback = Object.assign(feedbackList, {
  async setStatus(id: string, status: FeedbackStatus): Promise<void> {
    const updated = await adminAuth.call(() => adminApi.setFeedbackStatus(id, status));
    feedbackList.replace(updated);
  },
});
