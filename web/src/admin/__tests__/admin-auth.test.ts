import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Account } from '../../lib/api/auth';
import type { AdminSession } from '../../lib/api/admin';

const ADMIN: Account = {
  id: '6f1c2c0e-0000-4000-8000-0000000000ad',
  email: 'admin@stabileo.com',
  name: 'Stabileo Admin',
  company: null,
  job_title: null,
  country: null,
  locale: 'en',
  email_verified_at: null,
  inserted_at: '2026-10-15T12:00:00Z',
};

function session(n: number): AdminSession {
  return { access_token: `admin-access-${n}`, refresh_token: `admin-refresh-${n}`, expires_in: 900, account: ADMIN };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (body: unknown) => Response | Promise<Response>;
type Seen = { route: string; body: unknown; auth: string | undefined };

let storage: Map<string, string>;
let routes: Map<string, Route[]>;
let seen: Seen[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function load() {
  vi.resetModules();
  const mod = await import('../admin-auth.svelte');
  const { adminApi } = await import('../../lib/api/admin');
  const { ApiError } = await import('../../lib/api/client');
  return { ...mod, adminApi, ApiError };
}

beforeEach(() => {
  storage = new Map();
  routes = new Map();
  seen = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://localhost:4100/api/v1/admin', '');
    const route = `${init.method} ${path}`;
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

describe('the admin auth store', () => {
  it('starts anonymous', async () => {
    const { adminAuth } = await load();
    expect(adminAuth.status).toBe('anonymous');
    expect(adminAuth.account).toBeNull();
    expect(adminAuth.isAuthenticated).toBe(false);
    expect(adminAuth.endedBy).toBeNull();
  });

  it('uses its own refresh-token key, not the product one', async () => {
    const { ADMIN_REFRESH_TOKEN_KEY } = await load();
    const { REFRESH_TOKEN_KEY } = await import('../../lib/store/auth.svelte');
    expect(ADMIN_REFRESH_TOKEN_KEY).toBe('stabileo-admin-refresh-token');
    expect(ADMIN_REFRESH_TOKEN_KEY).not.toBe(REFRESH_TOKEN_KEY);
  });

  it('logs in: loading while pending, then authenticated, persisting only the refresh token under the admin key', async () => {
    const { adminAuth } = await load();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    on('POST /auth/login', async () => { await gate; return json(200, session(1)); });

    const pending = adminAuth.login({ email: 'admin@stabileo.com', password: 'stabileo-demo-password' });
    expect(adminAuth.status).toBe('loading');
    release();
    await expect(pending).resolves.toEqual(ADMIN);

    expect(adminAuth.status).toBe('authenticated');
    expect(adminAuth.account).toEqual(ADMIN);
    expect(seen).toEqual([{
      route: 'POST /auth/login',
      body: { email: 'admin@stabileo.com', password: 'stabileo-demo-password' },
      auth: undefined,
    }]);
    expect([...storage.entries()]).toEqual([['stabileo-admin-refresh-token', 'admin-refresh-1']]);
  });

  it('a rejected login returns to anonymous, stores nothing and surfaces invalid_credentials', async () => {
    const { adminAuth, ApiError } = await load();
    on('POST /auth/login', () => json(401, { error: 'invalid_credentials', message: 'Invalid email or password' }));

    const err = await adminAuth.login({ email: 'demo@stabileo.com', password: 'x' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('invalid_credentials');
    expect(adminAuth.status).toBe('anonymous');
    expect(adminAuth.endedBy).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('does not touch the product session token', async () => {
    storage.set('stabileo-refresh-token', 'product-refresh');
    const { adminAuth } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('DELETE /auth/logout', () => json(200, { message: 'Logged out' }));

    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
    await adminAuth.logout();

    expect([...storage.entries()]).toEqual([['stabileo-refresh-token', 'product-refresh']]);
  });

  it('init restores a stored admin session through /auth/refresh and rotates the token', async () => {
    storage.set('stabileo-admin-refresh-token', 'admin-refresh-0');
    const { adminAuth } = await load();
    on('POST /auth/refresh', () => json(200, session(1)));

    const pending = adminAuth.init();
    expect(adminAuth.status).toBe('loading');
    await pending;

    expect(seen).toEqual([{ route: 'POST /auth/refresh', body: { refresh_token: 'admin-refresh-0' }, auth: undefined }]);
    expect(adminAuth.status).toBe('authenticated');
    expect(adminAuth.account).toEqual(ADMIN);
    expect(storage.get('stabileo-admin-refresh-token')).toBe('admin-refresh-1');
  });

  it('init ignores a product refresh token', async () => {
    storage.set('stabileo-refresh-token', 'product-refresh');
    const { adminAuth } = await load();
    await adminAuth.init();
    expect(seen).toEqual([]);
    expect(adminAuth.status).toBe('anonymous');
  });

  it('init with a rejected refresh token forgets it', async () => {
    storage.set('stabileo-admin-refresh-token', 'admin-refresh-old');
    const { adminAuth } = await load();
    on('POST /auth/refresh', () => json(401, { error: 'refresh_failed', message: 'Invalid refresh token' }));

    await adminAuth.init();

    expect(adminAuth.status).toBe('anonymous');
    expect(storage.has('stabileo-admin-refresh-token')).toBe(false);
  });

  it('init keeps the token when the server is unreachable', async () => {
    storage.set('stabileo-admin-refresh-token', 'admin-refresh-0');
    const { adminAuth } = await load();
    on('POST /auth/refresh', () => { throw new TypeError('Failed to fetch'); });

    await adminAuth.init();

    expect(adminAuth.status).toBe('anonymous');
    expect(storage.get('stabileo-admin-refresh-token')).toBe('admin-refresh-0');
  });

  it('call() sends the in-memory access token, refreshes once on expiry and retries', async () => {
    const { adminAuth, adminApi } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('GET /auth/me', () => json(401, { error: 'invalid_token', message: 'Expired' }), () => json(200, { data: ADMIN }));
    on('POST /auth/refresh', () => json(200, session(2)));
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await expect(adminAuth.call(() => adminApi.me())).resolves.toEqual(ADMIN);

    expect(seen.slice(1)).toEqual([
      { route: 'GET /auth/me', body: undefined, auth: 'Bearer admin-access-1' },
      { route: 'POST /auth/refresh', body: { refresh_token: 'admin-refresh-1' }, auth: undefined },
      { route: 'GET /auth/me', body: undefined, auth: 'Bearer admin-access-2' },
    ]);
    expect(storage.get('stabileo-admin-refresh-token')).toBe('admin-refresh-2');
    expect(adminAuth.status).toBe('authenticated');
  });

  it('two calls that expire together share one refresh', async () => {
    const { adminAuth, adminApi } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    const expired = () => json(401, { error: 'invalid_token', message: 'Expired' });
    on('GET /auth/me', expired, expired, () => json(200, { data: ADMIN }), () => json(200, { data: ADMIN }));
    on('POST /auth/refresh', () => json(200, session(2)));
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await Promise.all([adminAuth.call(() => adminApi.me()), adminAuth.call(() => adminApi.me())]);

    expect(seen.filter((s) => s.route === 'POST /auth/refresh')).toHaveLength(1);
  });

  it('a session that cannot be refreshed signs the admin out and records the original reason', async () => {
    const { adminAuth, adminApi } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('GET /users/u1', () => json(401, { error: 'not_admin', message: 'Not an admin' }));
    on('POST /auth/refresh', () => json(401, { error: 'refresh_failed', message: 'Revoked' }));
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await expect(adminAuth.call(() => adminApi.getUser('u1'))).rejects.toMatchObject({ status: 401 });

    expect(adminAuth.status).toBe('anonymous');
    expect(adminAuth.account).toBeNull();
    expect(adminAuth.endedBy).toBe('not_admin');
    expect(storage.size).toBe(0);
  });

  it('call() leaves the session alone on a non-401 error', async () => {
    const { adminAuth, adminApi } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('POST /users/u1/disable', () => json(422, { error: 'cannot_disable_self', message: 'Cannot disable yourself' }));
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await expect(adminAuth.call(() => adminApi.disableUser('u1'))).rejects.toMatchObject({ status: 422, code: 'cannot_disable_self' });

    expect(adminAuth.status).toBe('authenticated');
    expect(storage.get('stabileo-admin-refresh-token')).toBe('admin-refresh-1');
  });

  it('logout revokes the admin refresh token and forgets everything locally', async () => {
    const { adminAuth } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('DELETE /auth/logout', () => json(200, { message: 'Logged out' }));
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await adminAuth.logout();

    expect(seen[1]).toEqual({ route: 'DELETE /auth/logout', body: { refresh_token: 'admin-refresh-1' }, auth: undefined });
    expect(adminAuth.status).toBe('anonymous');
    expect(adminAuth.account).toBeNull();
    expect(adminAuth.endedBy).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('logout still signs out locally when the server is unreachable', async () => {
    const { adminAuth } = await load();
    on('POST /auth/login', () => json(200, session(1)));
    on('DELETE /auth/logout', () => { throw new TypeError('Failed to fetch'); });
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    await expect(adminAuth.logout()).resolves.toBeUndefined();

    expect(adminAuth.status).toBe('anonymous');
    expect(storage.size).toBe(0);
  });

  it('survives a localStorage that throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    const { adminAuth } = await load();
    on('POST /auth/login', () => json(200, session(1)));

    await adminAuth.init();
    await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });

    expect(adminAuth.status).toBe('authenticated');
  });
});
