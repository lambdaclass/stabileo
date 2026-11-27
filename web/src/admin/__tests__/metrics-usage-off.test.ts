import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION = {
  access_token: 'admin-access-1',
  refresh_token: 'admin-refresh-1',
  expires_in: 900,
  account: { id: 'a0', email: 'admin@stabileo.com', name: 'Stabileo Admin', company: null, job_title: null, country: null, locale: 'es', email_verified_at: null, inserted_at: '2026-10-15T12:00:00Z' },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let settings: Record<string, unknown>;

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const route = `${init.method} ${url.replace('http://localhost:4100/api/v1/admin', '')}`;
    if (route === 'POST /auth/login') return json(200, SESSION);
    if (route === 'GET /settings') return json(200, { data: settings });
    throw new Error(`unexpected request ${route}`);
  }));
});

afterEach(() => vi.unstubAllGlobals());

async function page(loadSettings: boolean) {
  vi.resetModules();
  const { adminAuth } = await import('../admin-auth.svelte');
  const { adminSettings } = await import('../admin-settings.svelte');
  await adminAuth.login({ email: 'admin@stabileo.com', password: 'pw' });
  if (loadSettings) await adminSettings.load();
  const { render } = await import('svelte/server');
  const { default: UsageOffNotice } = await import('../UsageOffNotice.svelte');
  return render(UsageOffNotice).body;
}

describe('Metrics while anonymous usage is not stored', () => {
  it('says so above the figures, with the way to Settings', async () => {
    settings = { usage_telemetry_enabled: false };
    const body = await page(true);
    expect(body).toContain('data-testid="admin-metrics-usage-off"');
    expect(body).toContain('data-testid="admin-metrics-usage-off-settings"');
  });

  it('says nothing once it is stored, or before the settings are known', async () => {
    settings = { usage_telemetry_enabled: true };
    expect(await page(true)).not.toContain('admin-metrics-usage-off');
    expect(await page(false)).not.toContain('admin-metrics-usage-off');
  });
});
