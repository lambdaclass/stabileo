import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, setAuthHooks, ApiError, API_URL } from '../client';

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
  setAuthHooks(null);
});

afterEach(() => {
  setAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('the API client', () => {
  it('defaults to the local accounts backend in development', () => {
    expect(API_URL).toBe('http://localhost:4100');
  });

  it('sends JSON to the base URL without a bearer on a public call', async () => {
    setAuthHooks({ accessToken: () => 'tok-1', refresh: vi.fn() });
    fetchMock.mockResolvedValueOnce(json(200, { ok: 1 }));

    const out = await request<{ ok: number }>('POST', '/api/v1/auth/login', { body: { email: 'a@b.c', password: 'pw' } });

    expect(out).toEqual({ ok: 1 });
    const [c] = calls(fetchMock);
    expect(c.url).toBe('http://localhost:4100/api/v1/auth/login');
    expect(c.method).toBe('POST');
    expect(c.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(c.body).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  it('attaches the access token on an authenticated call and sends no body on a GET', async () => {
    setAuthHooks({ accessToken: () => 'tok-1', refresh: vi.fn() });
    fetchMock.mockResolvedValueOnce(json(200, { data: { id: 'u1' } }));

    await request('GET', '/api/v1/auth/me', { auth: true });

    const [c] = calls(fetchMock);
    expect(c.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok-1' });
    expect(c.body).toBeUndefined();
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    let token = 'stale';
    const refresh = vi.fn(async () => { token = 'fresh'; return true; });
    setAuthHooks({ accessToken: () => token, refresh });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, { data: { id: 'u1', name: 'Ada' } }));

    const out = await request<{ data: { id: string; name: string } }>('GET', '/api/v1/auth/me', { auth: true });

    expect(out.data).toEqual({ id: 'u1', name: 'Ada' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls(fetchMock).map((c) => c.headers.Authorization)).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('retries only once: a second 401 is thrown', async () => {
    const refresh = vi.fn(async () => true);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'Still no' }));

    const err = await request('GET', '/api/v1/auth/me', { auth: true }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: 'Still no' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the refresh fails', async () => {
    const refresh = vi.fn(async () => false);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'Unauthorized' }));

    const err = await request('GET', '/api/v1/auth/me', { auth: true }).catch((e) => e);

    expect(err).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a 401 that is about the request, not the session', async () => {
    const refresh = vi.fn(async () => true);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_current_password', message: 'Wrong password' }));

    const err = await request('PUT', '/api/v1/auth/password', { auth: true, body: { current_password: 'x', password: 'yyyyyyyy' } }).catch((e) => e);

    expect(err).toMatchObject({ status: 401, code: 'invalid_current_password', message: 'Wrong password' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh on a public call', async () => {
    const refresh = vi.fn(async () => true);
    setAuthHooks({ accessToken: () => 'tok', refresh });
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'nope' }));

    await expect(request('POST', '/api/v1/auth/login', { body: {} })).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('maps a validation error with its field details', async () => {
    fetchMock.mockResolvedValueOnce(json(422, {
      error: 'validation_error',
      message: 'Validation failed',
      details: { email: ['has already been taken'], password: ['should be at least 8 character(s)'] },
    }));

    const err = (await request('POST', '/api/v1/auth/register', { body: {} }).catch((e: unknown) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('validation_error');
    expect(err.message).toBe('Validation failed');
    expect(err.details).toEqual({
      email: ['has already been taken'],
      password: ['should be at least 8 character(s)'],
    });
  });

  it('maps a response that is not the error envelope by its status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));

    const err = await request('GET', '/api/v1/auth/me').catch((e) => e);

    expect(err).toMatchObject({ status: 502, code: 'http_502', message: 'Bad Gateway', details: {} });
  });

  it('turns a failed connection into a network_error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await request('POST', '/api/v1/auth/login', { body: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'network_error', message: 'Failed to fetch' });
  });

  it('returns undefined for an empty success body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(request('DELETE', '/api/v1/auth/logout', { body: { refresh_token: 'r' } })).resolves.toBeUndefined();
  });
});
