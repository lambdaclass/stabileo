declare const __STABILEO_DEV_API_URL__: string;

export const API_URL: string = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? __STABILEO_DEV_API_URL__ : '')
).replace(/\/+$/, '');

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldErrors;

  constructor(status: number, code: string, message: string, details: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * How a refresh ended: `ok` renewed the session; `rejected` means the server refused the refresh
 * token, so the session is over; `unavailable` means no answer (network, 5xx), so the session may
 * still be live and is kept for a later call to retry.
 */
export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

export interface AuthHooks {
  accessToken(): string | null;
  refresh(): Promise<RefreshOutcome>;
}

let hooks: AuthHooks | null = null;

export function setAuthHooks(next: AuthHooks | null): void {
  hooks = next;
}

const NOT_A_SESSION_FAILURE = new Set(['invalid_current_password', 'invalid_credentials', 'refresh_failed']);

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toFieldErrors(raw: unknown): FieldErrors {
  if (!isRecord(raw)) return {};
  const out: FieldErrors = {};
  for (const [field, msgs] of Object.entries(raw)) {
    if (Array.isArray(msgs)) out[field] = msgs.map(String);
    else if (typeof msgs === 'string') out[field] = [msgs];
  }
  return out;
}

async function readJson(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toApiError(status: number, statusText: string, body: unknown): ApiError {
  if (isRecord(body) && typeof body.error === 'string') {
    const message = typeof body.message === 'string' ? body.message : body.error;
    return new ApiError(status, body.error, message, toFieldErrors(body.details));
  }
  return new ApiError(status, `http_${status}`, statusText || `HTTP ${status}`);
}

async function send(method: Method, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = opts.auth ? hooks?.accessToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', e instanceof Error ? e.message : String(e));
  }
}

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  let resp = await send(method, path, opts);
  let body = await readJson(resp);

  if (resp.status === 401 && opts.auth && hooks) {
    const code = isRecord(body) && typeof body.error === 'string' ? body.error : '';
    if (!NOT_A_SESSION_FAILURE.has(code)) {
      const outcome = await hooks.refresh();
      // Not the 401: callers end the session on a 401, and nothing said this one is over.
      if (outcome === 'unavailable') throw new ApiError(0, 'network_error', 'Could not renew the session');
      if (outcome === 'ok') {
        resp = await send(method, path, opts);
        body = await readJson(resp);
      }
    }
  }

  if (!resp.ok) throw toApiError(resp.status, resp.statusText, body);
  return body as T;
}
