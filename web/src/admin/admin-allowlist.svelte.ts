import { adminApi, type AllowedEmail, type ListAllowedEmailsParams } from '../lib/api/admin';
import { adminAuth } from './admin-auth.svelte';
import { PAGE_SIZE } from './list-query';

export interface AllowlistQuery {
  search: string;
  includeRemoved: boolean;
  page: number;
}

export const DEFAULT_ALLOWLIST_QUERY: AllowlistQuery = { search: '', includeRemoved: false, page: 1 };

export function parseAllowlistQuery(search: string): AllowlistQuery {
  const qs = new URLSearchParams(search);
  const page = Number.parseInt(qs.get('page') ?? '', 10);
  return {
    search: qs.get('q') ?? '',
    includeRemoved: qs.get('removed') === '1',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

export function allowlistSearch(q: AllowlistQuery): string {
  const qs = new URLSearchParams();
  if (q.search.trim()) qs.set('q', q.search.trim());
  if (q.includeRemoved) qs.set('removed', '1');
  if (q.page > 1) qs.set('page', String(q.page));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export function allowlistParams(q: AllowlistQuery): ListAllowedEmailsParams {
  return {
    search: q.search.trim() || undefined,
    status: q.includeRemoved ? 'all' : 'active',
    limit: PAGE_SIZE,
    offset: (q.page - 1) * PAGE_SIZE,
  };
}

let rows = $state<AllowedEmail[]>([]);
let total = $state(0);
let limit = $state(PAGE_SIZE);
let loading = $state(false);
let listError = $state<unknown>(null);
let includeRemoved = $state(false);
let adding = $state(false);
let addError = $state<unknown>(null);
let busyId = $state<string | null>(null);
let rowError = $state<{ id: string; error: unknown } | null>(null);
let listSeq = 0;

function upsert(entry: AllowedEmail): void {
  const visible = entry.is_active || includeRemoved;
  const exists = rows.some((r) => r.id === entry.id);
  if (exists && visible) rows = rows.map((r) => (r.id === entry.id ? entry : r));
  else if (exists) {
    rows = rows.filter((r) => r.id !== entry.id);
    total = Math.max(0, total - 1);
  } else if (visible) {
    rows = [entry, ...rows];
    total += 1;
  }
}

export const adminAllowlist = {
  get rows() { return rows; },
  get total() { return total; },
  get limit() { return limit; },
  get loading() { return loading; },
  get listError() { return listError; },
  get adding() { return adding; },
  get addError() { return addError; },
  get busyId() { return busyId; },
  get rowError() { return rowError; },

  async load(query: AllowlistQuery): Promise<void> {
    const seq = ++listSeq;
    loading = true;
    try {
      const page = await adminAuth.call(() => adminApi.listAllowedEmails(allowlistParams(query)));
      if (seq !== listSeq) return;
      includeRemoved = query.includeRemoved;
      rows = page.data;
      total = page.meta.total;
      limit = page.meta.limit;
      listError = null;
    } catch (e) {
      if (seq !== listSeq) return;
      listError = e;
    } finally {
      if (seq === listSeq) loading = false;
    }
  },

  async add(email: string): Promise<AllowedEmail | null> {
    if (adding) return null;
    adding = true;
    addError = null;
    try {
      const entry = await adminAuth.call(() => adminApi.addAllowedEmail(email.trim()));
      upsert(entry);
      return entry;
    } catch (e) {
      addError = e;
      return null;
    } finally {
      adding = false;
    }
  },

  async readd(id: string): Promise<AllowedEmail | null> {
    const row = rows.find((r) => r.id === id);
    if (!row || busyId) return null;
    busyId = id;
    rowError = null;
    try {
      const entry = await adminAuth.call(() => adminApi.addAllowedEmail(row.email));
      upsert(entry);
      return entry;
    } catch (e) {
      rowError = { id, error: e };
      return null;
    } finally {
      busyId = null;
    }
  },

  async remove(id: string): Promise<AllowedEmail | null> {
    if (busyId) return null;
    busyId = id;
    rowError = null;
    try {
      const entry = await adminAuth.call(() => adminApi.removeAllowedEmail(id));
      upsert(entry);
      return entry;
    } catch (e) {
      rowError = { id, error: e };
      return null;
    } finally {
      busyId = null;
    }
  },

  clearAddError(): void {
    addError = null;
  },

  reset(): void {
    listSeq++;
    rows = [];
    total = 0;
    limit = PAGE_SIZE;
    loading = false;
    listError = null;
    includeRemoved = false;
    adding = false;
    addError = null;
    busyId = null;
    rowError = null;
  },
};
