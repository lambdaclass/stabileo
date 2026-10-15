import type { ListUsersParams, SortBy, SortDir, StatusFilter } from '../lib/api/admin';

export const PAGE_SIZE = 50;

export interface ListQuery {
  search: string;
  status: StatusFilter;
  sortBy: SortBy;
  sortDir: SortDir;
  page: number;
  user: string | null;
}

export const DEFAULT_QUERY: ListQuery = {
  search: '',
  status: 'all',
  sortBy: 'inserted_at',
  sortDir: 'desc',
  page: 1,
  user: null,
};

const STATUSES: readonly StatusFilter[] = ['all', 'active', 'disabled'];
const SORTS: readonly SortBy[] = ['inserted_at', 'last_sign_in_at', 'email', 'name'];
const DIRS: readonly SortDir[] = ['asc', 'desc'];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseQuery(search: string): ListQuery {
  const qs = new URLSearchParams(search);
  const page = Number.parseInt(qs.get('page') ?? '', 10);
  return {
    search: qs.get('q') ?? '',
    status: oneOf(qs.get('status'), STATUSES, DEFAULT_QUERY.status),
    sortBy: oneOf(qs.get('sort'), SORTS, DEFAULT_QUERY.sortBy),
    sortDir: oneOf(qs.get('dir'), DIRS, DEFAULT_QUERY.sortDir),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    user: qs.get('user') || null,
  };
}

export function toSearch(q: ListQuery): string {
  const qs = new URLSearchParams();
  if (q.search.trim()) qs.set('q', q.search.trim());
  if (q.status !== DEFAULT_QUERY.status) qs.set('status', q.status);
  if (q.sortBy !== DEFAULT_QUERY.sortBy) qs.set('sort', q.sortBy);
  if (q.sortDir !== DEFAULT_QUERY.sortDir) qs.set('dir', q.sortDir);
  if (q.page > 1) qs.set('page', String(q.page));
  if (q.user) qs.set('user', q.user);
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export function toParams(q: ListQuery): ListUsersParams {
  return {
    search: q.search.trim() || undefined,
    status: q.status,
    sort_by: q.sortBy,
    sort_dir: q.sortDir,
    limit: PAGE_SIZE,
    offset: (q.page - 1) * PAGE_SIZE,
  };
}

export function pageCount(total: number, limit = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / limit));
}

export function toggleSort(q: ListQuery, column: SortBy): ListQuery {
  if (q.sortBy === column) return { ...q, sortDir: q.sortDir === 'asc' ? 'desc' : 'asc', page: 1 };
  const textual = column === 'email' || column === 'name';
  return { ...q, sortBy: column, sortDir: textual ? 'asc' : 'desc', page: 1 };
}
