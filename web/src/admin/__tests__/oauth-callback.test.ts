import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminSession } from '../../lib/api/admin';

const SESSION: AdminSession = {
  access_token: 'admin-access-g',
  refresh_token: 'admin-refresh-g',
  expires_in: 900,
  account: {
    id: '6f1c2c0e-0000-4000-8000-0000000000ad',
    email: 'grace@lambdaclass.com',
    name: 'Grace Hopper',
    company: null,
    job_title: null,
    country: null,
    locale: 'en',
    email_verified_at: '2026-10-15T12:00:00Z',
    inserted_at: '2026-10-15T12:00:00Z',
  },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Seen = { route: string; body: unknown; auth: string | undefined };

let storage: Map<string, string>;
let responses: Map<string, () => Response>;
let seen: Seen[];
let url: URL;
let replaced: string[];

function visit(href: string) {
  url = new URL(href, 'http://localhost:4001');
}

async function load() {
  vi.resetModules();
  // A fresh i18n store holds the public entries only; the admin app registers the rest.
  await import('../../lib/i18n/full-dictionaries');
  const { setLocale } = await import('../../lib/i18n');
  setLocale('en');
  storage.clear();
  const { completeOAuthCallback } = await import('../oauth-callback');
  const { adminAuth, ADMIN_REFRESH_TOKEN_KEY } = await import('../admin-auth.svelte');
  const { adminRoute } = await import('../admin-route.svelte');
  return { completeOAuthCallback, adminAuth, adminRoute, ADMIN_REFRESH_TOKEN_KEY };
}

beforeEach(() => {
  storage = new Map();
  responses = new Map();
  seen = [];
  replaced = [];
  visit('/oauth/callback');
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('location', {
    get pathname() { return url.pathname; },
    get search() { return url.search; },
    get origin() { return url.origin; },
  });
  vi.stubGlobal('history', {
    replaceState: (_s: unknown, _t: string, next: string) => { replaced.push(next); visit(next); },
    pushState: (_s: unknown, _t: string, next: string) => visit(next),
  });
  vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
    const route = `${init.method} ${u.replace('http://localhost:4100/api/v1/admin', '')}`;
    const headers = init.headers as Record<string, string>;
    seen.push({ route, body: init.body === undefined ? undefined : JSON.parse(String(init.body)), auth: headers.Authorization });
    const next = responses.get(route);
    if (!next) throw new Error(`unexpected request ${route}`);
    return next();
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the admin OAuth callback', () => {
  it('exchanges the code, stores the session like a password login and drops the code from the URL', async () => {
    visit('/oauth/callback?code=one-time-code');
    const { completeOAuthCallback, adminAuth, adminRoute, ADMIN_REFRESH_TOKEN_KEY } = await load();
    responses.set('POST /auth/oauth/exchange', () => json(200, SESSION));
    responses.set('GET /auth/me', () => json(200, { data: SESSION.account }));
    expect(adminRoute.isCallback).toBe(true);

    const outcome = await completeOAuthCallback(location.search);

    expect(outcome).toEqual({ ok: true });
    expect(seen).toEqual([{ route: 'POST /auth/oauth/exchange', body: { code: 'one-time-code' }, auth: undefined }]);
    expect(adminAuth.status).toBe('authenticated');
    expect(adminAuth.account).toEqual(SESSION.account);
    expect([...storage.entries()]).toEqual([[ADMIN_REFRESH_TOKEN_KEY, 'admin-refresh-g']]);
    expect(replaced).toEqual(['/']);
    expect(url.pathname + url.search).toBe('/');
    expect(adminRoute.isCallback).toBe(false);
    expect(adminRoute.page).toBe('users');

    const { adminApi } = await import('../../lib/api/admin');
    await adminApi.me();
    expect(seen[1]).toEqual({ route: 'GET /auth/me', body: undefined, auth: 'Bearer admin-access-g' });
  });

  it('shows the message for each oauth_error code without calling the server', async () => {
    const { completeOAuthCallback, adminAuth } = await load();
    const expected: Record<string, string> = {
      provider_error: 'Google did not complete the sign-in. It may have been cancelled.',
      invalid_state: 'The sign-in request expired or was tampered with. Please try again.',
      callback_failed: 'Sign-in with Google failed. Please try again.',
      email_not_verified: 'Your Google email is not verified.',
      domain_not_allowed: 'This Google account is not at an allowed domain.',
      email_not_allowed: 'This email is not on the admin allowlist.',
      account_disabled: 'This account is disabled.',
      oauth_unavailable: 'Google sign-in is not available on this server.',
    };

    for (const [code, message] of Object.entries(expected)) {
      await expect(completeOAuthCallback(`?oauth_error=${code}`)).resolves.toEqual({ ok: false, message });
    }

    expect(seen).toEqual([]);
    expect(adminAuth.isAuthenticated).toBe(false);
    expect(storage.size).toBe(0);
  });

  it('an unknown oauth_error falls back to the generic callback message', async () => {
    const { completeOAuthCallback } = await load();
    await expect(completeOAuthCallback('?oauth_error=something_new'))
      .resolves.toEqual({ ok: false, message: 'Sign-in with Google failed. Please try again.' });
  });

  it('oauth_error wins over a code', async () => {
    const { completeOAuthCallback } = await load();
    const out = await completeOAuthCallback('?code=abc&oauth_error=email_not_allowed');
    expect(out).toEqual({ ok: false, message: 'This email is not on the admin allowlist.' });
    expect(seen).toEqual([]);
  });

  it('a 401 from the exchange shows the expired-code message, stores nothing and drops the code', async () => {
    visit('/oauth/callback?code=reused');
    const { completeOAuthCallback, adminAuth, adminRoute } = await load();
    responses.set('POST /auth/oauth/exchange', () => json(401, { error: 'invalid_or_expired_code', message: 'Invalid or expired code' }));

    const outcome = await completeOAuthCallback(location.search);

    expect(outcome).toEqual({ ok: false, message: 'The sign-in code expired or was already used. Please sign in again.' });
    expect(seen.map((s) => s.route)).toEqual(['POST /auth/oauth/exchange']);
    expect(adminAuth.status).toBe('anonymous');
    expect(adminAuth.account).toBeNull();
    expect(storage.size).toBe(0);
    expect(replaced).toEqual(['/oauth/callback']);
    expect(url.search).toBe('');
    expect(adminRoute.isCallback).toBe(true);
  });

  it('an unreachable server during the exchange shows the network message', async () => {
    const { completeOAuthCallback } = await load();
    responses.set('POST /auth/oauth/exchange', () => { throw new TypeError('Failed to fetch'); });

    await expect(completeOAuthCallback('?code=abc')).resolves.toEqual({ ok: false, message: 'Could not reach the server.' });
  });

  it('neither a code nor an error is reported as an incomplete link', async () => {
    const { completeOAuthCallback } = await load();
    await expect(completeOAuthCallback('')).resolves.toEqual({ ok: false, message: 'The sign-in link is incomplete. Please start again.' });
    expect(seen).toEqual([]);
  });
});

describe('the admin route', () => {
  it('maps paths to pages and keeps the URL in sync on navigation', async () => {
    visit('/allowlist?q=grace');
    const { adminRoute } = await load();
    const { pageFromPath, isOAuthCallback } = await import('../admin-route.svelte');

    expect(adminRoute.page).toBe('allowlist');
    expect(pageFromPath('/settings/')).toBe('settings');
    expect(pageFromPath('/nope')).toBe('users');
    expect(isOAuthCallback('/oauth/callback/')).toBe(true);

    adminRoute.navigate('settings');
    expect(url.pathname).toBe('/settings');
    expect(url.search).toBe('');
    expect(adminRoute.page).toBe('settings');

    visit('/');
    adminRoute.sync();
    expect(adminRoute.page).toBe('users');
  });
});
