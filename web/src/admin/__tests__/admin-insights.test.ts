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
let seen: { route: string; body: unknown; auth: string | undefined }[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function signedIn() {
  vi.resetModules();
  const { adminAuth } = await import('../admin-auth.svelte');
  const insights = await import('../admin-insights.svelte');
  const { adminSettings } = await import('../admin-settings.svelte');
  on('POST /auth/login', () => json(200, SESSION));
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  seen = [];
  return { ...insights, adminSettings };
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

describe('admin metrics and lists', () => {
  it('loads the summary for the window asked for', async () => {
    const { adminMetrics } = await signedIn();
    on('GET /insights/summary?days=7', () => json(200, { data: { days: 7, accounts: { total: 3 } } }));
    await adminMetrics.load(7);
    expect(adminMetrics.days).toBe(7);
    expect(adminMetrics.summary?.accounts.total).toBe(3);
    expect(seen[0].auth).toBe('Bearer admin-access-1');
  });

  it('pages projects with the filters it was given', async () => {
    const { adminProjects } = await signedIn();
    on('GET /projects?limit=50&offset=0&search=hangar', () => json(200, { data: [{ id: 'p1', name: 'Hangar' }], meta: { total: 1, limit: 50, offset: 0 } }));
    await adminProjects.load({ search: 'hangar', offset: 0 });
    expect(adminProjects.rows.map((r) => r.id)).toEqual(['p1']);
    expect(adminProjects.total).toBe(1);
  });

  it('keeps the error and the old rows when a page fails', async () => {
    const { adminAudit } = await signedIn();
    on('GET /audit-log?limit=50&offset=0', () => json(200, { data: [{ id: 'x' }], meta: { total: 1, limit: 50, offset: 0 } }));
    on('GET /audit-log?limit=50&offset=50', () => json(500, { error: 'boom', message: 'boom' }));
    await adminAudit.load();
    await adminAudit.load({ offset: 50 });
    expect(adminAudit.error).toBeTruthy();
    expect(adminAudit.rows.map((r) => r.id)).toEqual(['x']);
  });

  it('changes a feedback status and updates the row in place', async () => {
    const { adminFeedback } = await signedIn();
    on('GET /insights/feedback?limit=50&offset=0&status=new', () => json(200, { data: [{ id: 'f1', status: 'new' }], meta: { total: 1, limit: 50, offset: 0 } }));
    on('PUT /insights/feedback/f1', () => json(200, { data: { id: 'f1', status: 'done' } }));
    await adminFeedback.load({ status: 'new' });
    await adminFeedback.setStatus('f1', 'done');
    expect(seen.at(-1)!.body).toEqual({ status: 'done' });
    expect(adminFeedback.rows[0].status).toBe('done');
  });

  it('sets one flag at a time, sending only that flag', async () => {
    const { adminSettings } = await signedIn();
    on('GET /settings', () => json(200, { data: { user_login_enabled: true, usage_telemetry_enabled: false, cloud_projects_enabled: false } }));
    on('PUT /settings', () => json(200, { data: { user_login_enabled: true, usage_telemetry_enabled: true, cloud_projects_enabled: false } }));
    await adminSettings.load();
    expect(adminSettings.flag('usage_telemetry_enabled')).toBe(false);
    await adminSettings.setFlag('usage_telemetry_enabled', true);
    expect(seen.at(-1)!.body).toEqual({ usage_telemetry_enabled: true });
    expect(adminSettings.flag('usage_telemetry_enabled')).toBe(true);
    expect(adminSettings.flag('user_login_enabled')).toBe(true);
  });
});
