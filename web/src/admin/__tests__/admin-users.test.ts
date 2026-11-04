import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminAccount, AdminSession } from '../../lib/api/admin';
import { DEFAULT_QUERY } from '../list-query';

function account(n: number, patch: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: `u${n}`,
    email: `user${n}@example.com`,
    name: `User ${n}`,
    company: null,
    job_title: null,
    country: null,
    locale: 'es',
    email_verified_at: null,
    inserted_at: '2026-10-15T12:00:00Z',
    is_active: true,
    last_sign_in_at: null,
    active_sessions: 1,
    is_admin: false,
    ...patch,
  };
}

const SESSION: AdminSession = {
  access_token: 'admin-access-1',
  refresh_token: 'admin-refresh-1',
  expires_in: 900,
  account: { ...account(0), email: 'admin@stabileo.com' },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = () => Response | Promise<Response>;

let routes: Map<string, Route[]>;
let seen: string[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function signedIn() {
  vi.resetModules();
  const { adminAuth } = await import('../admin-auth.svelte');
  const { adminUsers } = await import('../admin-users.svelte');
  on('POST /auth/login', () => json(200, SESSION));
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  seen = [];
  return { adminAuth, adminUsers };
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
    seen.push(route);
    const next = routes.get(route)?.shift();
    if (!next) throw new Error(`unexpected request ${route}`);
    return next();
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the admin users store', () => {
  it('loads a page with the query mapped to list params', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users?search=ada&status=active&sort_by=email&sort_dir=asc&limit=50&offset=50',
      () => json(200, { data: [account(1), account(2)], meta: { total: 52, limit: 50, offset: 50 } }));

    const pending = adminUsers.load({ ...DEFAULT_QUERY, search: 'ada', status: 'active', sortBy: 'email', sortDir: 'asc', page: 2 });
    expect(adminUsers.loading).toBe(true);
    await pending;

    expect(adminUsers.loading).toBe(false);
    expect(adminUsers.rows.map((r) => r.id)).toEqual(['u1', 'u2']);
    expect(adminUsers.total).toBe(52);
    expect(adminUsers.listError).toBeNull();
  });

  it('keeps only the latest of two overlapping loads', async () => {
    const { adminUsers } = await signedIn();
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => { releaseFirst = r; });
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0', async () => {
      await gate;
      return json(200, { data: [account(1)], meta: { total: 1, limit: 50, offset: 0 } });
    });
    on('GET /users?search=two&status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(2)], meta: { total: 1, limit: 50, offset: 0 } }));

    const first = adminUsers.load(DEFAULT_QUERY);
    await adminUsers.load({ ...DEFAULT_QUERY, search: 'two' });
    releaseFirst();
    await first;

    expect(adminUsers.rows.map((r) => r.id)).toEqual(['u2']);
    expect(adminUsers.loading).toBe(false);
  });

  it('records a list error and keeps the previous rows', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(1)], meta: { total: 1, limit: 50, offset: 0 } }),
      () => json(500, { error: 'internal_error', message: 'Boom' }));

    await adminUsers.load(DEFAULT_QUERY);
    await adminUsers.load(DEFAULT_QUERY);

    expect(adminUsers.listError).toMatchObject({ status: 500, code: 'internal_error' });
    expect(adminUsers.rows.map((r) => r.id)).toEqual(['u1']);
  });

  it('opens a user from the row immediately, then from the server', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(1)], meta: { total: 1, limit: 50, offset: 0 } }));
    on('GET /users/u1', () => json(200, { data: account(1, { active_sessions: 3 }) }));
    await adminUsers.load(DEFAULT_QUERY);

    const pending = adminUsers.open('u1');
    expect(adminUsers.selected?.active_sessions).toBe(1);
    expect(adminUsers.detailLoading).toBe(true);
    await pending;

    expect(adminUsers.selectedId).toBe('u1');
    expect(adminUsers.selected?.active_sessions).toBe(3);
    expect(adminUsers.rows[0].active_sessions).toBe(3);
    expect(adminUsers.detailLoading).toBe(false);
  });

  it('records a 404 on open', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users/missing', () => json(404, { error: 'not_found', message: 'Not found' }));

    await adminUsers.open('missing');

    expect(adminUsers.selected).toBeNull();
    expect(adminUsers.detailError).toMatchObject({ status: 404 });
  });

  it('disable, enable and force logout update the row and the open detail', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(1), account(2)], meta: { total: 2, limit: 50, offset: 0 } }));
    on('GET /users/u1', () => json(200, { data: account(1) }));
    on('POST /users/u1/disable', () => json(200, { data: account(1, { is_active: false, active_sessions: 0 }) }));
    on('POST /users/u1/enable', () => json(200, { data: account(1) }));
    on('POST /users/u1/force-logout', () => json(200, { data: account(1, { active_sessions: 0 }), revoked: 4 }));
    await adminUsers.load(DEFAULT_QUERY);
    await adminUsers.open('u1');

    const disabled = await adminUsers.act('u1', 'disable');
    expect(disabled).toEqual({ account: account(1, { is_active: false, active_sessions: 0 }), revoked: null });
    expect(adminUsers.rows[0].is_active).toBe(false);
    expect(adminUsers.selected?.is_active).toBe(false);
    expect(adminUsers.rows[1]).toEqual(account(2));

    await adminUsers.act('u1', 'enable');
    expect(adminUsers.rows[0].is_active).toBe(true);
    expect(adminUsers.selected?.is_active).toBe(true);

    const out = await adminUsers.act('u1', 'force-logout');
    expect(out.revoked).toBe(4);
    expect(adminUsers.rows[0].active_sessions).toBe(0);
    expect(adminUsers.selected?.active_sessions).toBe(0);

    expect(seen.slice(-3)).toEqual(['POST /users/u1/disable', 'POST /users/u1/enable', 'POST /users/u1/force-logout']);
  });

  it('a refused action changes nothing and rethrows cannot_disable_self', async () => {
    const { adminUsers, adminAuth } = await signedIn();
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(0, { is_admin: true })], meta: { total: 1, limit: 50, offset: 0 } }));
    on('POST /users/u0/disable', () => json(422, { error: 'cannot_disable_self', message: 'You cannot disable yourself' }));
    await adminUsers.load(DEFAULT_QUERY);

    await expect(adminUsers.act('u0', 'disable')).rejects.toMatchObject({ status: 422, code: 'cannot_disable_self' });

    expect(adminUsers.rows[0].is_active).toBe(true);
    expect(adminAuth.isAuthenticated).toBe(true);
  });

  it('close and reset clear the state', async () => {
    const { adminUsers } = await signedIn();
    on('GET /users?status=all&sort_by=inserted_at&sort_dir=desc&limit=50&offset=0',
      () => json(200, { data: [account(1)], meta: { total: 1, limit: 50, offset: 0 } }));
    on('GET /users/u1', () => json(200, { data: account(1) }));
    await adminUsers.load(DEFAULT_QUERY);
    await adminUsers.open('u1');

    adminUsers.close();
    expect(adminUsers.selectedId).toBeNull();
    expect(adminUsers.selected).toBeNull();

    adminUsers.reset();
    expect(adminUsers.rows).toEqual([]);
    expect(adminUsers.total).toBe(0);
  });
});
