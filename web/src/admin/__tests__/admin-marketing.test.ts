import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminSession } from '../../lib/api/admin';

const SESSION: AdminSession = {
  access_token: 'admin-access-1',
  refresh_token: 'admin-refresh-1',
  expires_in: 900,
  account: { id: 'a0', email: 'admin@stabileo.com', name: 'Admin', company: null, job_title: null, country: null, locale: 'es', email_verified_at: null, inserted_at: '2026-10-15T12:00:00Z' },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (body: unknown) => Response;
let routes: Map<string, Route[]>;
let seen: { route: string; body: unknown }[];
let storage: Map<string, string>;

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

const SETTINGS = {
  meta_pixel_id: '123456789',
  gtm_container_id: null,
  meta_capi_access_token: true,
  meta_capi_test_event_code: null,
};

async function signedIn() {
  vi.resetModules();
  const { adminAuth } = await import('../admin-auth.svelte');
  const marketing = await import('../admin-marketing.svelte');
  on('POST /auth/login', () => json(200, SESSION));
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  seen = [];
  return marketing;
}

beforeEach(() => {
  routes = new Map();
  seen = [];
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const route = `${init.method} ${url.replace(/^http:\/\/localhost:\d+\/api\/v1\/admin/, '')}`;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    seen.push({ route, body });
    const next = routes.get(route)?.shift();
    if (!next) throw new Error(`unexpected request ${route}`);
    return next(body);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin marketing', () => {
  it('loads the advertising settings, read-only, with the token only as set or not', async () => {
    const { marketingSettings } = await signedIn();
    on('GET /marketing/settings', () => json(200, { data: SETTINGS }));
    await marketingSettings.load();
    expect(marketingSettings.settings).toEqual(SETTINGS);
    expect(seen.map((r) => r.route)).toEqual(['GET /marketing/settings']);
  });

  it('a slower answer for an older period never replaces the newer one', async () => {
    const { acquisition } = await signedIn();
    let release: (r: Response) => void = () => {};
    on('GET /marketing/acquisition?days=30', () => new Promise<Response>((r) => (release = r)) as unknown as Response);
    on('GET /marketing/acquisition?days=7', () => json(200, { data: { totals: { accounts: 7 } } }));
    const older = acquisition.load(30);
    await acquisition.load(7);
    release(json(200, { data: { totals: { accounts: 30 } } }));
    await older;
    expect(acquisition.days).toBe(7);
    expect(acquisition.data?.totals.accounts).toBe(7);
  });

  it('the acquisition report follows its period', async () => {
    const { acquisition } = await signedIn();
    on('GET /marketing/acquisition?days=90', () => json(200, { data: { totals: { accounts: 4 } } }));
    await acquisition.load(90);
    expect(acquisition.days).toBe(90);
    expect(acquisition.data?.totals.accounts).toBe(4);
  });
});
