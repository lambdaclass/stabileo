import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminSession } from '../../lib/api/admin';

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

type Route = (body: unknown) => Response | Promise<Response>;
type Seen = { route: string; body: unknown; auth: string | undefined };

let routes: Map<string, Route[]>;
let seen: Seen[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function signedIn() {
  vi.resetModules();
  const { adminAuth } = await import('../admin-auth.svelte');
  const { adminSettings } = await import('../admin-settings.svelte');
  on('POST /auth/login', () => json(200, SESSION));
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  seen = [];
  return { adminAuth, adminSettings };
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

describe('the admin settings store', () => {
  it('loads the settings with the admin bearer', async () => {
    const { adminSettings } = await signedIn();
    on('GET /settings', () => json(200, { data: { user_login_enabled: false } }));

    const pending = adminSettings.load();
    expect(adminSettings.loading).toBe(true);
    await pending;

    expect(adminSettings.loading).toBe(false);
    expect(adminSettings.settings).toEqual({ user_login_enabled: false });
    expect(adminSettings.userLoginEnabled).toBe(false);
    expect(adminSettings.loadError).toBeNull();
    expect(seen).toEqual([{ route: 'GET /settings', body: undefined, auth: 'Bearer admin-access-1' }]);
  });

  it('records a load error', async () => {
    const { adminSettings } = await signedIn();
    on('GET /settings', () => json(500, { error: 'internal_error', message: 'Boom' }));

    await adminSettings.load();

    expect(adminSettings.settings).toBeNull();
    expect(adminSettings.loadError).toMatchObject({ status: 500, code: 'internal_error' });
  });

  it('saving shows the pending value, then the saved one', async () => {
    const { adminSettings } = await signedIn();
    on('GET /settings', () => json(200, { data: { user_login_enabled: false } }));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    on('PUT /settings', async (body) => { await gate; return json(200, { data: body }); });
    await adminSettings.load();

    const pending = adminSettings.setUserLoginEnabled(true);
    expect(adminSettings.saving).toBe(true);
    expect(adminSettings.userLoginEnabled).toBe(true);
    expect(adminSettings.settings).toEqual({ user_login_enabled: false });
    await expect(adminSettings.setUserLoginEnabled(false)).resolves.toBe(false);
    release();

    await expect(pending).resolves.toBe(true);
    expect(adminSettings.saving).toBe(false);
    expect(adminSettings.settings).toEqual({ user_login_enabled: true });
    expect(adminSettings.userLoginEnabled).toBe(true);
    expect(adminSettings.savedAt).not.toBeNull();
    expect(adminSettings.saveError).toBeNull();
    expect(seen.filter((s) => s.route === 'PUT /settings')).toEqual([
      { route: 'PUT /settings', body: { user_login_enabled: true }, auth: 'Bearer admin-access-1' },
    ]);
  });

  it('a failed save keeps the saved value and records the error', async () => {
    const { adminSettings } = await signedIn();
    on('GET /settings', () => json(200, { data: { user_login_enabled: true } }));
    on('PUT /settings', () => json(422, {
      error: 'validation_error', message: 'Validation failed', details: { user_login_enabled: ['is invalid'] },
    }));
    await adminSettings.load();

    await expect(adminSettings.setUserLoginEnabled(false)).resolves.toBe(false);

    expect(adminSettings.saving).toBe(false);
    expect(adminSettings.settings).toEqual({ user_login_enabled: true });
    expect(adminSettings.userLoginEnabled).toBe(true);
    expect(adminSettings.saveError).toMatchObject({ status: 422, details: { user_login_enabled: ['is invalid'] } });
    expect(adminSettings.savedAt).toBeNull();
  });

  it('a 401 on save that cannot be refreshed signs the admin out', async () => {
    const { adminSettings, adminAuth } = await signedIn();
    on('GET /settings', () => json(200, { data: { user_login_enabled: true } }));
    on('PUT /settings', () => json(401, { error: 'not_admin', message: 'Not an admin' }));
    on('POST /auth/refresh', () => json(401, { error: 'refresh_failed', message: 'Revoked' }));
    await adminSettings.load();

    await adminSettings.setUserLoginEnabled(false);

    expect(adminAuth.isAuthenticated).toBe(false);
    expect(adminAuth.endedBy).toBe('not_admin');
    expect(adminSettings.saveError).toMatchObject({ status: 401, code: 'not_admin' });
  });

  it('does nothing before the settings are loaded, and reset clears everything', async () => {
    const { adminSettings } = await signedIn();
    await expect(adminSettings.setUserLoginEnabled(true)).resolves.toBe(false);
    expect(seen).toEqual([]);

    on('GET /settings', () => json(200, { data: { user_login_enabled: true } }));
    await adminSettings.load();
    adminSettings.reset();

    expect(adminSettings.settings).toBeNull();
    expect(adminSettings.userLoginEnabled).toBe(false);
    expect(adminSettings.savedAt).toBeNull();
  });
});
