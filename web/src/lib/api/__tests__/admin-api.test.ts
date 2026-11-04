import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthHooks, ApiError } from '../client';
import { adminApi, googleSignInUrl, usersQueryString, type AdminAccount, type AllowedEmail } from '../admin';

const ROOT = 'http://localhost:4100/api/v1/admin';

const ADA: AdminAccount = {
  id: '6f1c2c0e-0000-4000-8000-000000000001',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  company: null,
  job_title: null,
  country: 'AR',
  locale: 'es',
  email_verified_at: null,
  inserted_at: '2026-10-15T12:00:00Z',
  is_active: true,
  last_sign_in_at: '2026-10-15T13:00:00Z',
  active_sessions: 2,
  is_admin: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function calls(fetchMock: ReturnType<typeof vi.fn>): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit).method ?? 'GET',
    headers: (init as RequestInit).headers as Record<string, string>,
    body: (init as RequestInit).body === undefined ? undefined : JSON.parse(String((init as RequestInit).body)),
  }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAuthHooks({ accessToken: () => 'admin-access', refresh: vi.fn(async () => 'rejected' as const) });
});

afterEach(() => {
  setAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('usersQueryString', () => {
  it('is empty with no params', () => {
    expect(usersQueryString()).toBe('');
    expect(usersQueryString({})).toBe('');
  });

  it('serialises every param in a fixed order', () => {
    expect(usersQueryString({ offset: 100, limit: 50, sort_dir: 'asc', sort_by: 'email', status: 'disabled', search: 'ada' }))
      .toBe('?search=ada&status=disabled&sort_by=email&sort_dir=asc&limit=50&offset=100');
  });

  it('drops a blank search, trims a real one and encodes it', () => {
    expect(usersQueryString({ search: '   ', status: 'all' })).toBe('?status=all');
    expect(usersQueryString({ search: '  ada & co@x.io ' })).toBe('?search=ada+%26+co%40x.io');
  });

  it('keeps a zero offset', () => {
    expect(usersQueryString({ limit: 50, offset: 0 })).toBe('?limit=50&offset=0');
  });
});

describe('adminApi', () => {
  it('logs in publicly against the admin prefix', async () => {
    const session = { access_token: 'a1', refresh_token: 'r1', expires_in: 900, account: ADA };
    fetchMock.mockResolvedValueOnce(json(200, session));

    await expect(adminApi.login({ email: 'ada@example.com', password: 'pw' })).resolves.toEqual(session);

    expect(calls(fetchMock)).toEqual([{
      url: `${ROOT}/auth/login`,
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: { email: 'ada@example.com', password: 'pw' },
    }]);
  });

  it('refreshes and logs out with the refresh token in the body, without a bearer', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 900, account: ADA }))
      .mockResolvedValueOnce(json(200, { message: 'Logged out' }));

    await adminApi.refresh('r1');
    await adminApi.logout('r2');

    const [refresh, logout] = calls(fetchMock);
    expect(refresh).toMatchObject({ url: `${ROOT}/auth/refresh`, method: 'POST', body: { refresh_token: 'r1' } });
    expect(logout).toMatchObject({ url: `${ROOT}/auth/logout`, method: 'DELETE', body: { refresh_token: 'r2' } });
    expect(refresh.headers.Authorization).toBeUndefined();
    expect(logout.headers.Authorization).toBeUndefined();
  });

  it('reads /auth/me with the bearer and unwraps data', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: ADA }));

    await expect(adminApi.me()).resolves.toEqual(ADA);

    expect(calls(fetchMock)).toEqual([{
      url: `${ROOT}/auth/me`,
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer admin-access' },
      body: undefined,
    }]);
  });

  it('lists users with the query string and returns data and meta', async () => {
    const page = { data: [ADA], meta: { total: 51, limit: 50, offset: 50 } };
    fetchMock.mockResolvedValueOnce(json(200, page));

    const out = await adminApi.listUsers({ search: 'ada', status: 'active', sort_by: 'last_sign_in_at', sort_dir: 'desc', limit: 50, offset: 50 });

    expect(out).toEqual(page);
    const [c] = calls(fetchMock);
    expect(c.url).toBe(`${ROOT}/users?search=ada&status=active&sort_by=last_sign_in_at&sort_dir=desc&limit=50&offset=50`);
    expect(c.method).toBe('GET');
    expect(c.headers.Authorization).toBe('Bearer admin-access');
    expect(c.body).toBeUndefined();
  });

  it('lists users without a query string when given no params', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: [], meta: { total: 0, limit: 50, offset: 0 } }));
    await adminApi.listUsers();
    expect(calls(fetchMock)[0].url).toBe(`${ROOT}/users`);
  });

  it('hits the per-user endpoints with an encoded id and unwraps data', async () => {
    const disabled = { ...ADA, is_active: false, active_sessions: 0 };
    fetchMock
      .mockResolvedValueOnce(json(200, { data: ADA }))
      .mockResolvedValueOnce(json(200, { data: disabled }))
      .mockResolvedValueOnce(json(200, { data: ADA }))
      .mockResolvedValueOnce(json(200, { data: { ...ADA, active_sessions: 0 }, revoked: 2 }));

    await expect(adminApi.getUser(ADA.id)).resolves.toEqual(ADA);
    await expect(adminApi.disableUser(ADA.id)).resolves.toEqual(disabled);
    await expect(adminApi.enableUser(ADA.id)).resolves.toEqual(ADA);
    await expect(adminApi.forceLogout('a/b')).resolves.toEqual({ data: { ...ADA, active_sessions: 0 }, revoked: 2 });

    expect(calls(fetchMock).map((c) => `${c.method} ${c.url} ${c.headers.Authorization} ${c.body}`)).toEqual([
      `GET ${ROOT}/users/${ADA.id} Bearer admin-access undefined`,
      `POST ${ROOT}/users/${ADA.id}/disable Bearer admin-access undefined`,
      `POST ${ROOT}/users/${ADA.id}/enable Bearer admin-access undefined`,
      `POST ${ROOT}/users/a%2Fb/force-logout Bearer admin-access undefined`,
    ]);
  });

  it('refreshes once on an expired token and retries the call with the new one', async () => {
    let token = 'stale';
    const refresh = vi.fn(async () => { token = 'fresh'; return 'ok' as const; });
    setAuthHooks({ accessToken: () => token, refresh });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'invalid_token', message: 'Invalid token' }))
      .mockResolvedValueOnce(json(200, { data: [ADA], meta: { total: 1, limit: 50, offset: 0 } }));

    const out = await adminApi.listUsers({ limit: 50 });

    expect(out.meta.total).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls(fetchMock).map((c) => c.headers.Authorization)).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('retries only once', async () => {
    const refresh = vi.fn(async () => 'ok' as const);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'invalid_token', message: 'Invalid token' }))
      .mockResolvedValueOnce(json(401, { error: 'not_admin', message: 'Not an admin' }));

    const err = await adminApi.getUser(ADA.id).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'not_admin' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on a failed login', async () => {
    const refresh = vi.fn(async () => 'ok' as const);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_credentials', message: 'Invalid email or password' }));

    const err = await adminApi.login({ email: 'x@y.z', password: 'nope' }).catch((e) => e);

    expect(err).toMatchObject({ status: 401, code: 'invalid_credentials' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces cannot_disable_self and a 404 as ApiErrors', async () => {
    fetchMock
      .mockResolvedValueOnce(json(422, { error: 'cannot_disable_self', message: 'You cannot disable yourself' }))
      .mockResolvedValueOnce(json(404, { error: 'not_found', message: 'Not found' }));

    await expect(adminApi.disableUser(ADA.id)).rejects.toMatchObject({ status: 422, code: 'cannot_disable_self' });
    await expect(adminApi.getUser('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

const ENTRY: AllowedEmail = {
  id: '7a1c2c0e-0000-4000-8000-0000000000e1',
  email: 'grace@lambdaclass.com',
  is_active: true,
  added_by: { id: ADA.id, email: 'admin@lambdaclass.com' },
  inserted_at: '2026-10-16T09:00:00Z',
  updated_at: '2026-10-16T09:00:00Z',
};

describe('adminApi sign-in config and OAuth', () => {
  it('reads /auth/config publicly', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { password_login: false, google_login: true }));

    await expect(adminApi.authConfig()).resolves.toEqual({ password_login: false, google_login: true });

    expect(calls(fetchMock)).toEqual([{
      url: `${ROOT}/auth/config`,
      method: 'GET',
      headers: { Accept: 'application/json' },
      body: undefined,
    }]);
  });

  it('points the Google button at the backend start route', () => {
    expect(googleSignInUrl()).toBe(`${ROOT}/auth/google`);
  });

  it('exchanges a one-time code for an admin session, without a bearer', async () => {
    const session = { access_token: 'a1', refresh_token: 'r1', expires_in: 900, account: ADA };
    fetchMock.mockResolvedValueOnce(json(200, session));

    await expect(adminApi.exchangeOAuthCode('one-time')).resolves.toEqual(session);

    expect(calls(fetchMock)).toEqual([{
      url: `${ROOT}/auth/oauth/exchange`,
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: { code: 'one-time' },
    }]);
  });

  it('surfaces 401 invalid_or_expired_code from the exchange', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_or_expired_code', message: 'Invalid or expired code' }));
    await expect(adminApi.exchangeOAuthCode('stale')).rejects.toMatchObject({ status: 401, code: 'invalid_or_expired_code' });
  });
});

describe('adminApi settings', () => {
  it('reads and writes /settings with the bearer and unwraps data', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { user_login_enabled: false } }))
      .mockResolvedValueOnce(json(200, { data: { user_login_enabled: true } }));

    await expect(adminApi.getSettings()).resolves.toEqual({ user_login_enabled: false });
    await expect(adminApi.updateSettings({ user_login_enabled: true })).resolves.toEqual({ user_login_enabled: true });

    expect(calls(fetchMock)).toEqual([
      { url: `${ROOT}/settings`, method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer admin-access' }, body: undefined },
      {
        url: `${ROOT}/settings`,
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer admin-access' },
        body: { user_login_enabled: true },
      },
    ]);
  });

  it('surfaces a 422 on user_login_enabled', async () => {
    fetchMock.mockResolvedValueOnce(json(422, {
      error: 'validation_error', message: 'Validation failed', details: { user_login_enabled: ['is invalid'] },
    }));
    const err = await adminApi.updateSettings({ user_login_enabled: true }).catch((e) => e);
    expect(err).toMatchObject({ status: 422, code: 'validation_error', details: { user_login_enabled: ['is invalid'] } });
  });
});

describe('adminApi allowlist', () => {
  it('lists allowed emails with the query string and returns data and meta', async () => {
    const page = { data: [ENTRY], meta: { total: 1, limit: 50, offset: 0 } };
    fetchMock.mockResolvedValueOnce(json(200, page));

    await expect(adminApi.listAllowedEmails({ search: 'grace', status: 'all', sort_by: 'email', sort_dir: 'asc', limit: 50, offset: 0 }))
      .resolves.toEqual(page);

    const [c] = calls(fetchMock);
    expect(c.url).toBe(`${ROOT}/allowed-emails?search=grace&status=all&sort_by=email&sort_dir=asc&limit=50&offset=0`);
    expect(c.method).toBe('GET');
    expect(c.headers.Authorization).toBe('Bearer admin-access');
  });

  it('adds an email and removes one by encoded id', async () => {
    const removed = { ...ENTRY, is_active: false, updated_at: '2026-10-17T09:00:00Z' };
    fetchMock
      .mockResolvedValueOnce(json(201, { data: ENTRY }))
      .mockResolvedValueOnce(json(200, { data: removed }));

    await expect(adminApi.addAllowedEmail('grace@lambdaclass.com')).resolves.toEqual(ENTRY);
    await expect(adminApi.removeAllowedEmail('a/b')).resolves.toEqual(removed);

    const [add, del] = calls(fetchMock);
    expect(add).toEqual({
      url: `${ROOT}/allowed-emails`,
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer admin-access' },
      body: { email: 'grace@lambdaclass.com' },
    });
    expect(del).toEqual({
      url: `${ROOT}/allowed-emails/a%2Fb`,
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: 'Bearer admin-access' },
      body: undefined,
    });
  });

  it('surfaces details.email on a 422 add and cannot_remove_self on a 422 remove', async () => {
    fetchMock
      .mockResolvedValueOnce(json(422, { error: 'validation_error', message: 'Validation failed', details: { email: ['must be at an allowed domain'] } }))
      .mockResolvedValueOnce(json(422, { error: 'cannot_remove_self', message: 'You cannot remove yourself' }));

    await expect(adminApi.addAllowedEmail('x@gmail.com')).rejects.toMatchObject({ status: 422, details: { email: ['must be at an allowed domain'] } });
    await expect(adminApi.removeAllowedEmail(ENTRY.id)).rejects.toMatchObject({ status: 422, code: 'cannot_remove_self' });
  });
});
