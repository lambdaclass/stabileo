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
  meta_capi_test_event_code: null,
  gtm_container_id: null,
  meta_ad_account_id: 'act_1234567',
  google_ads_customer_id: null,
  google_ads_login_customer_id: null,
  secrets: {
    meta_capi_access_token: { set: true, hint: '…6789' },
    meta_ads_access_token: { set: false, hint: null },
    google_ads_service_account: { set: false, hint: null },
  },
  sync_interval_minutes: 30,
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
  it('loads the settings, and saves only what it is given', async () => {
    const { marketingSettings } = await signedIn();
    on('GET /marketing/settings', () => json(200, { data: SETTINGS }));
    await marketingSettings.load();
    expect(marketingSettings.settings?.secrets.meta_capi_access_token).toEqual({ set: true, hint: '…6789' });

    on('PUT /marketing/settings', () => json(200, { data: { ...SETTINGS, gtm_container_id: 'GTM-ABC123' } }));
    expect(await marketingSettings.save({ gtm_container_id: 'gtm-abc123' })).toBe(true);
    expect(seen.at(-1)).toEqual({ route: 'PUT /marketing/settings', body: { gtm_container_id: 'gtm-abc123' } });
    expect(marketingSettings.settings?.gtm_container_id).toBe('GTM-ABC123');
  });

  it('keeps the server refusal for the form, and the stored settings as they were', async () => {
    const { marketingSettings } = await signedIn();
    on('GET /marketing/settings', () => json(200, { data: SETTINGS }));
    await marketingSettings.load();
    on('PUT /marketing/settings', () => json(422, { error: 'validation_error', message: 'Validation failed', details: { gtm_container_id: ['must look like GTM-XXXXXXX'] } }));
    expect(await marketingSettings.save({ gtm_container_id: 'UA-1' })).toBe(false);
    expect((marketingSettings.saveError as { status: number }).status).toBe(422);
    expect(marketingSettings.settings?.gtm_container_id).toBeNull();
  });

  it('asks the overview with the period, channel and currency, and remembers the currency', async () => {
    const { adsReport } = await signedIn();
    on('GET /marketing/ads/overview?days=30&channel=all&display=USD', () => json(200, { data: { accounts: [], tree: [], display: 'USD' } }));
    await adsReport.load();
    on('GET /marketing/ads/overview?days=7&channel=meta&display=ARS', () => json(200, { data: { accounts: [], tree: [], display: 'ARS' } }));
    await adsReport.load({ days: 7, channel: 'meta', display: 'ARS' });
    expect(adsReport.overview?.display).toBe('ARS');
    expect(storage.get('stabileo-admin-ads-display')).toBe('ARS');

    on('POST /marketing/ads/sync', () => json(202, { data: { queued: 2 } }));
    await adsReport.sync();
    expect(adsReport.queued).toBe(2);
  });

  it('the acquisition report follows its period', async () => {
    const { acquisition } = await signedIn();
    on('GET /marketing/acquisition?days=90', () => json(200, { data: { totals: { accounts: 4 } } }));
    await acquisition.load(90);
    expect(acquisition.days).toBe(90);
    expect(acquisition.data?.totals.accounts).toBe(4);
  });
});
