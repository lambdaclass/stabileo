import type { ListParams, Page } from '../lib/api/admin';
import { adminAuth } from './admin-auth.svelte';

export const PAGE_SIZE = 50;

export function createListStore<T extends { id: string }>(fetchPage: (params: ListParams) => Promise<Page<T>>) {
  let rows = $state<T[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<unknown>(null);
  let params = $state<ListParams>({ limit: PAGE_SIZE, offset: 0 });
  let seq = 0;

  return {
    get rows() { return rows; },
    get total() { return total; },
    get loading() { return loading; },
    get error() { return error; },
    get params() { return params; },

    async load(patch: ListParams = {}): Promise<void> {
      params = { ...params, ...patch };
      const mine = ++seq;
      loading = true;
      try {
        const page = await adminAuth.call(() => fetchPage(params));
        if (mine !== seq) return;
        rows = page.data;
        total = page.meta.total;
        error = null;
      } catch (e) {
        if (mine !== seq) return;
        error = e;
      } finally {
        if (mine === seq) loading = false;
      }
    },

    replace(row: T): void {
      rows = rows.map((r) => (r.id === row.id ? row : r));
    },

    reset(): void {
      seq++;
      rows = [];
      total = 0;
      loading = false;
      error = null;
      params = { limit: PAGE_SIZE, offset: 0 };
    },
  };
}
