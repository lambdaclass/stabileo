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

const googleCode = (url: string) => (void url, { answer: Promise.resolve({ code: 'code-1', verifier: 'v-1' }), cancel: () => {} });

async function signIn(authStore: { signInWithGoogle(open: typeof googleCode): { result: Promise<unknown> } }): Promise<void> {
  await authStore.signInWithGoogle(googleCode).result;
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

  it('a Google sign-up is loading while pending, then authenticated, persisting only the refresh token', async () => {
    const { authStore, REFRESH_TOKEN_KEY } = await load();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    on('POST /google/register', async () => { await gate; return json(201, session(1)); });

    const pending = authStore.completeGoogleSignup({ signup_token: 'st-1', accept_terms: true });
    expect(authStore.status).toBe('loading');
    release();
    const account = await pending;

    expect(account).toEqual(ADA);
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(seen).toEqual([{ route: 'POST /google/register', body: { signup_token: 'st-1', accept_terms: true }, auth: undefined }]);
    expect([...storage.entries()]).toEqual([[REFRESH_TOKEN_KEY, 'refresh-1']]);
  });

  it('a refused sign-up returns to anonymous, stores nothing and surfaces the field details', async () => {
    const { authStore, ApiError } = await load();
    on('POST /google/register', () => json(422, { error: 'validation_error', message: 'Validation failed', details: { accept_terms: ['must be accepted'] } }));

    const err = await authStore.completeGoogleSignup({ signup_token: 'st-1', accept_terms: false }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.details).toEqual({ accept_terms: ['must be accepted'] });
    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
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
    on('POST /google/exchange', () => json(200, session(1)));
    on('GET /me', () => json(200, { data: { ...ADA, company: 'Analytical Engines' } }));
    on('PUT /me', (body) => json(200, { data: { ...ADA, ...(body as object) } }));
    await signIn(authStore);

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
    on('POST /google/exchange', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }), () => json(200, { data: ADA }));
    on('POST /refresh', () => json(200, session(2)));
    await signIn(authStore);

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
    on('POST /google/exchange', () => json(200, session(1)));
    const expired = () => json(401, { error: 'unauthorized', message: 'Token expired' });
    on('GET /me', expired, expired, () => json(200, { data: ADA }), () => json(200, { data: ADA }));
    on('POST /refresh', () => json(200, session(2)));
    await signIn(authStore);

    await Promise.all([authStore.loadMe(), authStore.loadMe()]);

    expect(seen.filter((s) => s.route === 'POST /refresh')).toHaveLength(1);
    expect(seen.filter((s) => s.route === 'GET /me').map((s) => s.auth)).toEqual([
      'Bearer access-1', 'Bearer access-1', 'Bearer access-2', 'Bearer access-2',
    ]);
  });

  it('a session that cannot be refreshed signs the user out', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }));
    on('POST /refresh', () => json(401, { error: 'refresh_failed', message: 'Revoked' }));
    await signIn(authStore);

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('a refresh that lost the race to another tab retries with the token that tab stored', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
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
    await signIn(authStore);

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
    on('POST /google/exchange', () => json(200, session(1)));
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
    await signIn(authStore);

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('anonymous');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-3');
  });

  it('an unreachable refresh keeps the session and its token, and a later call recovers', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
    const expired = () => json(401, { error: 'unauthorized', message: 'Token expired' });
    on('GET /me', expired, expired, () => json(200, { data: ADA }));
    on('POST /refresh', () => { throw new TypeError('Failed to fetch'); }, () => json(200, session(2)));
    await signIn(authStore);

    await expect(authStore.loadMe()).rejects.toMatchObject({ status: 0, code: 'network_error' });
    expect(authStore.status).toBe('authenticated');
    expect(authStore.account).toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');

    await expect(authStore.loadMe()).resolves.toEqual(ADA);
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-2');
  });

  it('a refresh the server fails with a 5xx keeps the session and its token', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
    on('GET /me', () => json(401, { error: 'unauthorized', message: 'Token expired' }));
    on('POST /refresh', () => json(503, { error: 'unavailable', message: 'Try again' }));
    await signIn(authStore);

    await expect(authStore.loadMe()).rejects.not.toMatchObject({ status: 401 });

    expect(authStore.status).toBe('authenticated');
    expect(storage.get('stabileo-refresh-token')).toBe('refresh-1');
  });

  it('logout revokes the refresh token on the server and forgets everything locally', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
    on('DELETE /logout', () => json(200, { message: 'Logged out' }));
    await signIn(authStore);

    await authStore.logout();

    expect(seen[1]).toEqual({ route: 'DELETE /logout', body: { refresh_token: 'refresh-1' }, auth: undefined });
    expect(authStore.status).toBe('anonymous');
    expect(authStore.account).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('logout still signs out locally when the server is unreachable', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1)));
    on('DELETE /logout', () => { throw new TypeError('Failed to fetch'); });
    await signIn(authStore);

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
    on('POST /google/exchange', () => json(200, session(1)));

    await authStore.init();
    await signIn(authStore);

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

  it('a 403 user_login_disabled from a Google sign-up stays anonymous and keeps the code', async () => {
    const { authStore } = await load();
    on('POST /google/register', () => json(403, { error: 'user_login_disabled', message: 'User login is disabled' }));

    const err = await authStore.completeGoogleSignup({ signup_token: 'st-1', accept_terms: true }).catch((e) => e);

    expect([err.status, err.code]).toEqual([403, 'user_login_disabled']);
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
    expect(authStore.saveRequiresAccount).toBe(false);
    expect(authStore.termsVersion).toBeNull();
  });

  it('asks for an account to save only while sign-in is open and Google can be used for it', async () => {
    const answers = [
      [{ user_login_enabled: false, google_login: true, save_requires_account: true }, false],
      [{ user_login_enabled: true, google_login: false, save_requires_account: true }, false],
      [{ user_login_enabled: true, save_requires_account: true }, false],
      [{ user_login_enabled: true, google_login: true, save_requires_account: true }, true],
    ] as const;
    for (const [config, asks] of answers) {
      const { authStore } = await load();
      on('GET /config', () => json(200, config));
      await authStore.init();
      expect(authStore.saveRequiresAccount).toBe(asks);
    }
  });

  it('asks for the terms only when the signed-in account accepted older ones', async () => {
    const { authStore } = await load();
    expect(authStore.needsTerms).toBe(false);
    on('POST /google/exchange', () => json(200, session(1, { ...ADA, consents: { ...CONSENTS, terms_current: false } })));
    await signIn(authStore);
    expect(authStore.needsTerms).toBe(true);
  });

  it('records a consent with the session and adopts the account it answers', async () => {
    const { authStore } = await load();
    on('POST /google/exchange', () => json(200, session(1, { ...ADA, consents: { ...CONSENTS, terms_current: false } })));
    await signIn(authStore);
    on('POST /consents', () => json(201, { data: { ...ADA, consents: CONSENTS } }));

    await authStore.recordConsent('terms', true);

    expect(seen.at(-1)).toEqual({ route: 'POST /consents', body: { kind: 'terms', granted: true }, auth: 'Bearer access-1' });
    expect(authStore.needsTerms).toBe(false);
    expect(authStore.account?.consents?.terms_current).toBe(true);
  });

  describe('the usage choice follows the account', () => {
    const withUsage = (usage: boolean) => ({ ...session(1), account: { ...session(1).account, consents: { ...CONSENTS, usage_analytics: usage } } });
    const stored = () => JSON.parse(storage.get('stabileo-usage-consent') ?? '{}').choice;

    it('an account that said no turns sharing off in a browser that had it on, on sign-in and on restore', async () => {
      storage.set('stabileo-usage-consent', JSON.stringify({ choice: 'granted' }));
      const { authStore } = await load();
      const { usageConsent } = await import('../../telemetry/consent.svelte');
      on('POST /google/exchange', () => json(200, withUsage(false)));
      await signIn(authStore);
      expect(usageConsent.choice).toBe('denied');
      expect(stored()).toBe('denied');

      storage.set('stabileo-usage-consent', JSON.stringify({ choice: 'granted' }));
      storage.set('stabileo-refresh-token', 'refresh-0');
      const again = await load();
      const consent = await import('../../telemetry/consent.svelte');
      on('GET /config', () => json(200, { user_login_enabled: true }));
      on('POST /refresh', () => json(200, withUsage(false)));
      await again.authStore.init();
      expect(consent.usageConsent.choice).toBe('denied');
    });

    it('a no given in this browser is recorded on an account that had it on, and stays off', async () => {
      storage.set('stabileo-usage-consent', JSON.stringify({ choice: 'denied' }));
      const { authStore } = await load();
      const { usageConsent } = await import('../../telemetry/consent.svelte');
      on('POST /google/exchange', () => json(200, withUsage(true)));
      on('POST /consents', () => json(201, { data: withUsage(false).account }));
      await signIn(authStore);

      await vi.waitFor(() => expect(authStore.account?.consents?.usage_analytics).toBe(false));
      expect(seen.find((r) => r.route === 'POST /consents')!.body).toEqual({ kind: 'usage_analytics', granted: false });
      expect(usageConsent.choice).toBe('denied');
    });

    it('an account that said yes leaves the browser as it was, and /me with a no turns it off', async () => {
      const { authStore } = await load();
      const { usageConsent } = await import('../../telemetry/consent.svelte');
      on('POST /google/exchange', () => json(200, withUsage(true)));
      await signIn(authStore);
      expect(usageConsent.choice).toBe('undecided');
      expect(usageConsent.granted).toBe(false);
      expect(seen.some((r) => r.route === 'POST /consents')).toBe(false);

      on('GET /me', () => json(200, { data: withUsage(false).account }));
      await authStore.loadMe();
      expect(usageConsent.choice).toBe('denied');
    });
  });

  describe('with Google', () => {
    const popup = (answer: Promise<{ code: string; verifier: string }>) => {
      const opened: string[] = [];
      const cancel = vi.fn();
      return { opened, cancel, open: (url: string) => (opened.push(url), { answer, cancel }) };
    };

    it('a known person: opens Google on the backend, trades the code and keeps the session', async () => {
      const { authStore, REFRESH_TOKEN_KEY } = await load();
      on('POST /google/exchange', () => json(200, session(1)));
      const p = popup(Promise.resolve({ code: 'code-1', verifier: 'v-1' }));

      const outcome = await authStore.signInWithGoogle(p.open).result;

      expect(p.opened).toEqual(['http://localhost:4100/api/v1/auth/google']);
      expect(seen).toEqual([{ route: 'POST /google/exchange', body: { code: 'code-1', verifier: 'v-1' }, auth: undefined }]);
      expect(outcome).toEqual({ kind: 'signedIn', account: ADA });
      expect(authStore.status).toBe('authenticated');
      expect(storage.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    });

    it('someone new: answers the sign-up, then opens the session once the terms are accepted', async () => {
      const { authStore, REFRESH_TOKEN_KEY } = await load();
      on('POST /google/exchange', () => json(200, { signup_required: true, signup_token: 'st-1', email: 'ada@gmail.test', name: 'Ada' }));
      const outcome = await authStore.signInWithGoogle(popup(Promise.resolve({ code: 'code-1', verifier: 'v-1' })).open).result;

      expect(outcome).toEqual({ kind: 'signup', token: 'st-1', email: 'ada@gmail.test', name: 'Ada' });
      expect(authStore.status).toBe('anonymous');
      expect(storage.size).toBe(0);

      on('POST /google/register', () => json(201, session(2, { ...ADA, consents: CONSENTS })));
      await authStore.completeGoogleSignup({ signup_token: 'st-1', accept_terms: true, usage_analytics: true, locale: 'es' });

      expect(seen.at(-1)).toEqual({
        route: 'POST /google/register',
        body: { signup_token: 'st-1', accept_terms: true, usage_analytics: true, locale: 'es' },
        auth: undefined,
      });
      expect(authStore.status).toBe('authenticated');
      expect(storage.get(REFRESH_TOKEN_KEY)).toBe('refresh-2');
    });

    it('an error from Google reaches the caller and nothing is sent', async () => {
      const { authStore } = await load();
      const { GoogleSignInError } = await import('../../auth/google-popup');
      const err = await authStore.signInWithGoogle(popup(Promise.reject(new GoogleSignInError('email_not_verified'))).open).result.catch((e) => e);

      expect(err).toBeInstanceOf(GoogleSignInError);
      expect(err.code).toBe('email_not_verified');
      expect(seen).toEqual([]);
      expect(authStore.status).toBe('anonymous');
    });

    it('reads which ways in the server offers', async () => {
      const { authStore } = await load();
      on('GET /config', () => json(200, { user_login_enabled: true, google_login: true }));
      vi.stubGlobal('window', { localStorage });
      await authStore.init();
      expect(authStore.googleLogin).toBe(true);
    });
  });
});
