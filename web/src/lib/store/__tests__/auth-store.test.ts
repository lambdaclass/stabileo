import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Account, Session } from '../../api/auth';

const ADA: Account = {
  id: '6f1c2c0e-0000-4000-8000-000000000001',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  company: null,
  job_title: null,
  country: null,
  locale: 'es',
  email_verified_at: null,
  inserted_at: '2026-10-15T12:00:00Z',
};

function session(n: number, account: Account = ADA): Session {
  return { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 900, account };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (body: unknown, headers: Record<string, string>) => Response | Promise<Response>;
type Seen = { route: string; body: unknown; auth: string | undefined };

let storage: Map<string, string>;
let routes: Map<string, Route[]>;
let seen: Seen[];

function on(route: string, ...responses: Route[]) {
  routes.set(route, [...(routes.get(route) ?? []), ...responses]);
}

async function load() {
  vi.resetModules();
  const mod = await import('../auth.svelte');
  const { ApiError } = await import('../../api/client');
  return { ...mod, ApiError };
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
    const path = url.replace('http://localhost:4100/api/v1/auth', '');
    const route = `${init.method} ${path}`;
    const headers = init.headers as Record<string, string>;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    seen.push({ route, body, auth: headers.Authorization });
    const next = routes.get(route)?.shift();
    if (!next) throw new Error(`unexpected request ${route}`);
    return next(body, headers);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the auth store', () => {
  it('starts anonymous with no account', async () => {
    const { authStore } = await load();
    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
  });

  it('logs in: loading while pending, then authenticated, persisting only the refresh token', async () => {
    const { authStore, REFRESH_TOKEN_KEY } = await load();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    on('POST /login', async () => { await gate; return json(200, session(1)); });

    const pending = authStore.login({ email: 'ada@example.com', password: 'correct-horse' });
    expect(authStore.status).toBe('loading');
    release();
    const account = await pending;

    expect(account).toEqual(ADA);
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(seen).toEqual([{ route: 'POST /login', body: { email: 'ada@example.com', password: 'correct-horse' }, auth: undefined }]);
    expect([...storage.entries()]).toEqual([[REFRESH_TOKEN_KEY, 'refresh-1']]);
  });

  it('a failed login returns to anonymous, stores nothing and surfaces the code', async () => {
    const { authStore, ApiError } = await load();
    on('POST /login', () => json(401, { error: 'invalid_credentials', message: 'Invalid email or password' }));

    const err = await authStore.login({ email: 'ada@example.com', password: 'wrong' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('invalid_credentials');
    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('registers with the given fields and surfaces field details on a 422', async () => {
    const { authStore } = await load();
    on('POST /register', () => json(422, {
      error: 'validation_error',
      message: 'Validation failed',
      details: { email: ['has already been taken'] },
    }));
    on('POST /register', () => json(201, session(2)));

    const err = await authStore.register({ email: 'ada@example.com', password: 'longenough', name: 'Ada', locale: 'en', accept_terms: true }).catch((e) => e);
    expect(err.details).toEqual({ email: ['has already been taken'] });
    expect(authStore.status).toBe('anonymous');

    await authStore.register({ email: 'ada2@example.com', password: 'longenough', name: 'Ada', locale: 'en', accept_terms: true });
    expect(seen.map((s) => s.body)).toEqual([
      { email: 'ada@example.com', password: 'longenough', name: 'Ada', locale: 'en', accept_terms: true },
      { email: 'ada2@example.com', password: 'longenough', name: 'Ada', locale: 'en', accept_terms: true },
    ]);
    expect(authStore.status).toBe('authenticated');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-2');
  });

  it('init restores a stored session through /refresh and rotates the stored token', async () => {
    storage.set('stabileo-refresh-token', 'refresh-0');
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: true }));
    on('POST /refresh', () => json(200, session(1)));

    const pending = authStore.init();
    expect(authStore.status).toBe('loading');
    await pending;

    expect(seen).toEqual([
      { route: 'GET /config', body: undefined, auth: undefined },
      { route: 'POST /refresh', body: { refresh_token: 'refresh-0' }, auth: undefined },
    ]);
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');
  });

  it('init without a stored token only reads /config', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: true }));
    await authStore.init();
    expect(seen.map((s) => s.route)).toEqual(['GET /config']);
    expect(authStore.status).toBe('anonymous');
    expect(authStore.userLoginEnabled).toBe(true);
  });

  it('init with the accounts flag off makes no request even with a stored token', async () => {
    storage.set('stabileo-refresh-token', 'refresh-0');
    storage.set('stabileo-feature-accounts', '0');
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: true }));
    await authStore.init();
    expect(seen).toEqual([]);
    expect(authStore.status).toBe('anonymous');
    expect(authStore.userLoginEnabled).toBe(false);
    expect(authStore.showAccountEntry).toBe(false);
  });

  it('init with a rejected refresh token forgets it', async () => {
    storage.set('stabileo-refresh-token', 'refresh-old');
    const { authStore } = await load();
    on('POST /refresh', () => json(401, { error: 'refresh_failed', message: 'Invalid refresh token' }));

    await authStore.init();

    expect(authStore.status).toBe('anonymous');
    expect(storage.has('stabileo-refresh-token')).toBe(false);
  });

  it('init keeps the token when the server is unreachable, so the next start can retry', async () => {
    storage.set('stabileo-refresh-token', 'refresh-0');
    const { authStore } = await load();
    on('POST /refresh', () => { throw new TypeError('Failed to fetch'); });

    await authStore.init();

    expect(authStore.status).toBe('anonymous');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-0');
  });

  it('loadMe and updateProfile use the in-memory access token and update the account', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(200, { data: { ...ADA, company: 'Analytical Engines' } }));
    on('PUT /me', (body) => json(200, { data: { ...ADA, ...(body as object) } }));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    const me = await authStore.loadMe();
    expect(me.company).toBe('Analytical Engines');
    expect(authStore.account?.company).toBe('Analytical Engines');

    const updated = await authStore.updateProfile({ name: 'Ada L.', country: 'AR', locale: 'pt', job_title: null });
    expect(updated).toEqual({ ...ADA, name: 'Ada L.', country: 'AR', locale: 'pt', job_title: null });
    expect(authStore.account).toEqual(updated);

    expect(seen.slice(1)).toEqual([
      { route: 'GET /me', body: undefined, auth: 'Bearer access-1' },
      { route: 'PUT /me', body: { name: 'Ada L.', country: 'AR', locale: 'pt', job_title: null }, auth: 'Bearer access-1' },
    ]);
    expect([...storage.values()]).toEqual(['refresh-1']);
  });

  it('an expired access token is refreshed once and the call retried', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }), () => json(200, { data: ADA }));
    on('POST /refresh', () => json(200, session(2)));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await authStore.loadMe();

    expect(seen.slice(1)).toEqual([
      { route: 'GET /me', body: undefined, auth: 'Bearer access-1' },
      { route: 'POST /refresh', body: { refresh_token: 'refresh-1' }, auth: undefined },
      { route: 'GET /me', body: undefined, auth: 'Bearer access-2' },
    ]);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-2');
    expect(authStore.status).toBe('authenticated');
  });

  it('two calls that expire together share one refresh', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    const expired = () => json(401, { error: 'unauthorized', message: 'Token expired' });
    on('GET /me', expired, expired, () => json(200, { data: ADA }), () => json(200, { data: ADA }));
    on('POST /refresh', () => json(200, session(2)));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await Promise.all([authStore.loadMe(), authStore.loadMe()]);

    expect(seen.filter((s) => s.route === 'POST /refresh')).toHaveLength(1);
    expect(seen.filter((s) => s.route === 'GET /me').map((s) => s.auth)).toEqual([
      'Bearer access-1', 'Bearer access-1', 'Bearer access-2', 'Bearer access-2',
    ]);
  });

  it('a session that cannot be refreshed signs the user out', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }));
    on('POST /refresh', () => json(401, { error: 'refresh_failed', message: 'Revoked' }));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('a refresh that lost the race to another tab retries with the token that tab stored', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }), () => json(200, { data: ADA }));
    on(
      'POST /refresh',
      () => {
        // The other tab rotated refresh-1 first and stored its successor.
        storage.set('stabileo-refresh-token', 'refresh-2');
        return json(401, { error: 'refresh_failed', message: 'Already rotated' });
      },
      () => json(200, session(3)),
    );
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.loadMe()).resolves.toEqual(ADA);

    expect(seen.filter((s) => s.route === 'POST /refresh').map((s) => s.body)).toEqual([
      { refresh_token: 'refresh-1' },
      { refresh_token: 'refresh-2' },
    ]);
    expect(authStore.status).toBe('authenticated');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-3');
  });

  it('a rejected refresh does not remove a token another tab stored meanwhile', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }));
    on(
      'POST /refresh',
      () => {
        storage.set('stabileo-refresh-token', 'refresh-2');
        return json(401, { error: 'refresh_failed', message: 'Already rotated' });
      },
      () => {
        // ...and by the time this one is rejected, a third tab has rotated again.
        storage.set('stabileo-refresh-token', 'refresh-3');
        return json(401, { error: 'refresh_failed', message: 'Already rotated' });
      },
    );
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('anonymous');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-3');
  });

  it('an unreachable refresh keeps the session and its token, and a later call recovers', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    const expired = () => json(401, { error: 'unauthorized', message: 'Token expired' });
    on('GET /me', expired, expired, () => json(200, { data: ADA }));
    on('POST /refresh', () => { throw new TypeError('Failed to fetch'); }, () => json(200, session(2)));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 0, code: 'network_error' });
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');

    await expect(authStore.loadMe()).resolves.toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-2');
  });

  it('a refresh the server fails with a 5xx keeps the session and its token', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }));
    on('POST /refresh', () => json(503, { error: 'unavailable', message: 'Try again' }));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.loadMe()).rejects.not.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('authenticated');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');
  });

  it('a wrong current password keeps the session and does not refresh', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('PUT /password', () => json(401, { error: 'invalid_current_password', message: 'Wrong password' }));
    on('PUT /password', () => json(200, { message: 'Password updated' }));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.changePassword('nope', 'new-password-1')).rejects.toMatchObject({ code: 'invalid_current_password' });
    expect(authStore.status).toBe('authenticated');

    await authStore.changePassword('pw-pw-pw-pw', 'new-password-1');
    expect(seen.filter((s) => s.route === 'PUT /password')).toEqual([
      { route: 'PUT /password', body: { current_password: 'nope', password: 'new-password-1' }, auth: 'Bearer access-1' },
      { route: 'PUT /password', body: { current_password: 'pw-pw-pw-pw', password: 'new-password-1' }, auth: 'Bearer access-1' },
    ]);
    expect(seen.some((s) => s.route === 'POST /refresh')).toBe(false);
  });

  it('logout revokes the refresh token on the server and forgets everything locally', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('DELETE /logout', () => json(200, { message: 'Logged out' }));
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await authStore.logout();

    expect(seen[1]).toEqual({ route: 'DELETE /logout', body: { refresh_token: 'refresh-1' }, auth: undefined });
    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('logout still signs out locally when the server is unreachable', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));
    on('DELETE /logout', () => { throw new TypeError('Failed to fetch'); });
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    await expect(authStore.logout()).resolves.toBeUndefined();

    expect(authStore.status).toBe('anonymous');
    expect(storage.size).toBe(0);
  });

  it('survives a localStorage that throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1)));

    await authStore.init();
    await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' });

    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
  });
});

describe('the runtime sign-in flag', () => {
  it('hides the account entry while /config says sign-in is off', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: false }));

    expect(authStore.showAccountEntry).toBe(false);
    await authStore.init();

    expect(seen.map((s) => s.route)).toEqual(['GET /config']);
    expect(authStore.userLoginEnabled).toBe(false);
    expect(authStore.showAccountEntry).toBe(false);
  });

  it('shows the account entry when /config says sign-in is on', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: true }));

    await authStore.init();

    expect(authStore.userLoginEnabled).toBe(true);
    expect(authStore.showAccountEntry).toBe(true);
    expect(authStore.account).toBeNull();
  });

  it('treats an unreachable /config as sign-in off', async () => {
    const { authStore } = await load();
    on('GET /config', () => { throw new TypeError('Failed to fetch'); });

    await authStore.init();

    expect(seen.map((s) => s.route)).toEqual(['GET /config']);
    expect(authStore.userLoginEnabled).toBe(false);
    expect(authStore.showAccountEntry).toBe(false);
  });

  it('treats a /config server error as sign-in off', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(500, { error: 'internal_error', message: 'Boom' }));

    await authStore.init();

    expect(authStore.showAccountEntry).toBe(false);
  });

  it('restores a stored session while sign-in is off and keeps the entry for that user', async () => {
    storage.set('stabileo-refresh-token', 'refresh-0');
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: false }));
    on('POST /refresh', () => json(200, session(1)));
    on('DELETE /logout', () => json(200, { message: 'Logged out' }));

    await authStore.init();

    expect(seen.map((s) => s.route)).toEqual(['GET /config', 'POST /refresh']);
    expect(authStore.userLoginEnabled).toBe(false);
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');
    expect(authStore.showAccountEntry).toBe(true);

    await authStore.logout();

    expect(authStore.account).toBeNull();
    expect(authStore.showAccountEntry).toBe(false);
  });

  it('a 403 user_login_disabled from /login or /register stays anonymous and keeps the code', async () => {
    const { authStore } = await load();
    const off = () => json(403, { error: 'user_login_disabled', message: 'User login is disabled' });
    on('POST /login', off);
    on('POST /register', off);

    const login = await authStore.login({ email: 'ada@example.com', password: 'pw-pw-pw-pw' }).catch((e) => e);
    const register = await authStore.register({ email: 'ada@example.com', password: 'pw-pw-pw-pw', name: 'Ada', accept_terms: true }).catch((e) => e);

    expect([login.status, login.code]).toEqual([403, 'user_login_disabled']);
    expect([register.status, register.code]).toEqual([403, 'user_login_disabled']);
    expect(authStore.status).toBe('anonymous');
    expect(storage.size).toBe(0);
  });
});

describe('initialsOf', () => {
  it('takes the first and last word of the name, else the email', async () => {
    const { initialsOf } = await load();
    expect(initialsOf({ name: 'Ada King Lovelace', email: 'a@x.io' })).toBe('AL');
    expect(initialsOf({ name: 'ada', email: 'a@x.io' })).toBe('AD');
    expect(initialsOf({ name: '  ', email: 'zoe@x.io' })).toBe('ZO');
  });
});

describe('consents and server switches', () => {
  const CONSENTS = { terms: { version: '2026-10-27', accepted_at: '2026-10-27T12:00:00Z' }, terms_current: true, usage_analytics: false, model_research: false };

  it('reads the server switches and the terms version from /config', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(200, { user_login_enabled: true, terms_version: '2026-10-27', usage_telemetry_enabled: true, cloud_projects_enabled: false }));
    await authStore.init();
    expect(authStore.termsVersion).toBe('2026-10-27');
    expect(authStore.usageTelemetryEnabled).toBe(true);
    expect(authStore.cloudProjectsEnabled).toBe(false);
  });

  it('switches read off when /config is unreachable', async () => {
    const { authStore } = await load();
    on('GET /config', () => json(503, {}));
    await authStore.init();
    expect(authStore.usageTelemetryEnabled).toBe(false);
    expect(authStore.cloudProjectsEnabled).toBe(false);
    expect(authStore.termsVersion).toBeNull();
  });

  it('asks for the terms only when the signed-in account accepted older ones', async () => {
    const { authStore } = await load();
    expect(authStore.needsTerms).toBe(false);
    on('POST /login', () => json(200, session(1, { ...ADA, consents: { ...CONSENTS, terms_current: false } })));
    await authStore.login({ email: 'ada@example.com', password: 'pw' });
    expect(authStore.needsTerms).toBe(true);
  });

  it('records a consent with the session and adopts the account it answers', async () => {
    const { authStore } = await load();
    on('POST /login', () => json(200, session(1, { ...ADA, consents: { ...CONSENTS, terms_current: false } })));
    await authStore.login({ email: 'ada@example.com', password: 'pw' });
    on('POST /consents', () => json(201, { data: { ...ADA, consents: CONSENTS } }));

    await authStore.recordConsent('terms', true);

    expect(seen.at(-1)).toEqual({ route: 'POST /consents', body: { kind: 'terms', granted: true }, auth: 'Bearer access-1' });
    expect(authStore.needsTerms).toBe(false);
    expect(authStore.account?.consents?.terms_current).toBe(true);
  });

  it('sends the terms acceptance and the optional usage choice with a sign-up', async () => {
    const { authStore } = await load();
    on('POST /register', () => json(201, session(1, { ...ADA, consents: CONSENTS })));
    await authStore.register({ email: 'ada@example.com', password: 'longenough', name: 'Ada', accept_terms: true, usage_analytics: true });
    expect(seen.at(-1)!.body).toEqual({ email: 'ada@example.com', password: 'longenough', name: 'Ada', accept_terms: true, usage_analytics: true });
  });
});
