import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminSession, AllowedEmail } from '../../lib/api/admin';
import { DEFAULT_ALLOWLIST_QUERY, allowlistParams, allowlistSearch, parseAllowlistQuery } from '../admin-allowlist.svelte';

const SESSION: AdminSession = {
  access_token: 'admin-access-1',
  refresh_token: 'admin-refresh-1',
  expires_in: 900,
  account: {
    id: 'a0',
    email: 'admin@stabileo.com',
    name: 'Stabileo Admin',
    company: null,
    job_title: null,
    country: null,
    locale: 'es',
    email_verified_at: null,
    inserted_at: '2026-10-15T12:00:00Z',
  },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function entry(n: number, patch: Partial<AllowedEmail> = {}): AllowedEmail {
  return {
    id: `e${n}`,
    email: `person${n}@lambdaclass.com`,
    is_active: true,
    added_by: { id: 'a0', email: 'admin@stabileo.com' },
    inserted_at: '2026-10-16T09:00:00Z',
    updated_at: '2026-10-16T09:00:00Z',
    ...patch,
  };
}

type Route = (body: unknown) => Response | Promise<Response>;
type Seen = { route: string; body: unknown; auth: string | undefined };

let routes: Map<string, Route[]>;
let seen: Seen[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function signedIn() {
  vi.resetModules();
  // A fresh i18n store holds the public entries only; the admin app registers the rest.
  await import('../../lib/i18n/full-dictionaries');
  const { adminAuth } = await import('../admin-auth.svelte');
  const { adminAllowlist } = await import('../admin-allowlist.svelte');
  on('POST /auth/login', () => json(200, SESSION));
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  seen = [];
  return { adminAuth, adminAllowlist };
}

beforeEach(() => {
  routes = new Map();
  seen = [];
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const route = `${init.method} ${url.replace('http://localhost:4100/api/v1/admin', '')}`;
    const headers = init.headers as Record<string, string>;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    seen.push({ route, body, auth: headers.Authorization });
    const next = routes.get(route)?.shift();
    if (!next) throw new Error(`unexpected request ${route}`);
    return next(body);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACTIVE_PAGE_1 = 'GET /allowed-emails?status=active&limit=50&offset=0';
const ALL_PAGE_1 = 'GET /allowed-emails?status=all&limit=50&offset=0';

describe('allowlist query helpers', () => {
  it('round-trips the URL and maps to list params', () => {
    const q = parseAllowlistQuery('?q=grace&removed=1&page=3');
    expect(q).toEqual({ search: 'grace', includeRemoved: true, page: 3 });
    expect(allowlistSearch(q)).toBe('?q=grace&removed=1&page=3');
    expect(allowlistSearch(DEFAULT_ALLOWLIST_QUERY)).toBe('');
    expect(parseAllowlistQuery('?page=-2&removed=yes')).toEqual(DEFAULT_ALLOWLIST_QUERY);
    expect(allowlistParams(q)).toEqual({ search: 'grace', status: 'all', limit: 50, offset: 100 });
    expect(allowlistParams({ ...q, search: '  ', includeRemoved: false, page: 1 })).toEqual({ search: undefined, status: 'active', limit: 50, offset: 0 });
  });
});

describe('the admin allowlist store', () => {
  it('loads active emails by default, with total and limit from meta', async () => {
    const { adminAllowlist } = await signedIn();
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(1), entry(2)], meta: { total: 2, limit: 50, offset: 0 } }));

    const pending = adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);
    expect(adminAllowlist.loading).toBe(true);
    await pending;

    expect(adminAllowlist.loading).toBe(false);
    expect(adminAllowlist.rows.map((r) => r.email)).toEqual(['person1@lambdaclass.com', 'person2@lambdaclass.com']);
    expect(adminAllowlist.total).toBe(2);
    expect(adminAllowlist.limit).toBe(50);
    expect(seen).toEqual([{ route: ACTIVE_PAGE_1, body: undefined, auth: 'Bearer admin-access-1' }]);
  });

  it('includes removed ones, searches and pages through meta', async () => {
    const { adminAllowlist } = await signedIn();
    on('GET /allowed-emails?search=person&status=all&limit=50&offset=50',
      () => json(200, { data: [entry(51, { is_active: false })], meta: { total: 51, limit: 50, offset: 50 } }));

    await adminAllowlist.load({ search: ' person ', includeRemoved: true, page: 2 });

    expect(adminAllowlist.rows).toEqual([entry(51, { is_active: false })]);
    expect(adminAllowlist.total).toBe(51);
  });

  it('records a list error and keeps the previous rows', async () => {
    const { adminAllowlist } = await signedIn();
    on(ACTIVE_PAGE_1,
      () => json(200, { data: [entry(1)], meta: { total: 1, limit: 50, offset: 0 } }),
      () => json(500, { error: 'internal_error', message: 'Boom' }));

    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    expect(adminAllowlist.listError).toMatchObject({ status: 500 });
    expect(adminAllowlist.rows.map((r) => r.id)).toEqual(['e1']);
  });

  it('adds an email: trims it, posts it and puts the new row first', async () => {
    const { adminAllowlist } = await signedIn();
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(1)], meta: { total: 1, limit: 50, offset: 0 } }));
    on('POST /allowed-emails', (body) => json(201, { data: entry(9, { email: (body as { email: string }).email }) }));
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    const pending = adminAllowlist.add('  grace@lambdaclass.com ');
    expect(adminAllowlist.adding).toBe(true);
    const added = await pending;

    expect(added?.email).toBe('grace@lambdaclass.com');
    expect(adminAllowlist.adding).toBe(false);
    expect(adminAllowlist.addError).toBeNull();
    expect(adminAllowlist.rows.map((r) => r.email)).toEqual(['grace@lambdaclass.com', 'person1@lambdaclass.com']);
    expect(adminAllowlist.total).toBe(2);
    expect(seen.at(-1)).toEqual({ route: 'POST /allowed-emails', body: { email: 'grace@lambdaclass.com' }, auth: 'Bearer admin-access-1' });
  });

  it('keeps a 422 on add with details.email and leaves the rows alone', async () => {
    const { adminAllowlist } = await signedIn();
    const { fieldErrors } = await import('../../lib/api/error-text');
    const { setLocale } = await import('../../lib/i18n');
    setLocale('en');
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(1)], meta: { total: 1, limit: 50, offset: 0 } }));
    on('POST /allowed-emails', () => json(422, {
      error: 'validation_error', message: 'Validation failed', details: { email: ['must be at an allowed domain'] },
    }));
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    await expect(adminAllowlist.add('x@gmail.com')).resolves.toBeNull();

    expect(adminAllowlist.addError).toMatchObject({ status: 422, details: { email: ['must be at an allowed domain'] } });
    expect(fieldErrors(adminAllowlist.addError)).toEqual({ email: 'This email is not at an allowed domain.' });
    expect(adminAllowlist.rows.map((r) => r.id)).toEqual(['e1']);
    expect(adminAllowlist.total).toBe(1);

    adminAllowlist.clearAddError();
    expect(adminAllowlist.addError).toBeNull();
  });

  it('removing drops the row from the active list', async () => {
    const { adminAllowlist } = await signedIn();
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(1), entry(2)], meta: { total: 2, limit: 50, offset: 0 } }));
    on('DELETE /allowed-emails/e1', () => json(200, { data: entry(1, { is_active: false }) }));
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    const pending = adminAllowlist.remove('e1');
    expect(adminAllowlist.busyId).toBe('e1');
    const removed = await pending;

    expect(removed?.is_active).toBe(false);
    expect(adminAllowlist.busyId).toBeNull();
    expect(adminAllowlist.rows.map((r) => r.id)).toEqual(['e2']);
    expect(adminAllowlist.total).toBe(1);
  });

  it('with removed ones shown, removing marks the row and re-adding reactivates it', async () => {
    const { adminAllowlist } = await signedIn();
    on(ALL_PAGE_1, () => json(200, { data: [entry(1), entry(2)], meta: { total: 2, limit: 50, offset: 0 } }));
    on('DELETE /allowed-emails/e1', () => json(200, { data: entry(1, { is_active: false }) }));
    on('POST /allowed-emails', () => json(201, { data: entry(1, { updated_at: '2026-10-18T09:00:00Z' }) }));
    await adminAllowlist.load({ ...DEFAULT_ALLOWLIST_QUERY, includeRemoved: true });

    await adminAllowlist.remove('e1');
    expect(adminAllowlist.rows.map((r) => [r.id, r.is_active])).toEqual([['e1', false], ['e2', true]]);
    expect(adminAllowlist.total).toBe(2);

    const again = await adminAllowlist.readd('e1');

    expect(again).toEqual(entry(1, { updated_at: '2026-10-18T09:00:00Z' }));
    expect(adminAllowlist.rows.map((r) => [r.id, r.is_active])).toEqual([['e1', true], ['e2', true]]);
    expect(adminAllowlist.total).toBe(2);
    expect(seen.at(-1)).toEqual({ route: 'POST /allowed-emails', body: { email: 'person1@lambdaclass.com' }, auth: 'Bearer admin-access-1' });
  });

  it('cannot_remove_self is kept against the row and reads as a translated message', async () => {
    const { adminAllowlist, adminAuth } = await signedIn();
    const { adminErrorText } = await import('../error-text');
    const { setLocale } = await import('../../lib/i18n');
    setLocale('en');
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(0, { email: 'admin@stabileo.com' })], meta: { total: 1, limit: 50, offset: 0 } }));
    on('DELETE /allowed-emails/e0', () => json(422, { error: 'cannot_remove_self', message: 'You cannot remove yourself' }));
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    await expect(adminAllowlist.remove('e0')).resolves.toBeNull();

    expect(adminAllowlist.rowError?.id).toBe('e0');
    expect(adminErrorText(adminAllowlist.rowError?.error)).toBe('You cannot remove your own email from the allowlist.');
    expect(adminAllowlist.rows.map((r) => [r.id, r.is_active])).toEqual([['e0', true]]);
    expect(adminAllowlist.busyId).toBeNull();
    expect(adminAuth.isAuthenticated).toBe(true);
  });

  it('reset clears the state', async () => {
    const { adminAllowlist } = await signedIn();
    on(ACTIVE_PAGE_1, () => json(200, { data: [entry(1)], meta: { total: 1, limit: 50, offset: 0 } }));
    await adminAllowlist.load(DEFAULT_ALLOWLIST_QUERY);

    adminAllowlist.reset();

    expect(adminAllowlist.rows).toEqual([]);
    expect(adminAllowlist.total).toBe(0);
    expect(adminAllowlist.rowError).toBeNull();
  });
});
