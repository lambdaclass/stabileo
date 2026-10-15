import { ApiError, setAuthHooks } from '../lib/api/client';
import type { Account, LoginInput } from '../lib/api/auth';
import { adminApi, type AdminSession } from '../lib/api/admin';

export type AdminAuthStatus = 'anonymous' | 'loading' | 'authenticated';

export const ADMIN_REFRESH_TOKEN_KEY = 'stabileo-admin-refresh-token';

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  } catch {
    return;
  }
}

let account = $state<Account | null>(null);
let status = $state<AdminAuthStatus>('anonymous');
let endedBy = $state<string | null>(null);
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

function applySession(session: AdminSession): Account {
  accessToken = session.access_token;
  writeRefreshToken(session.refresh_token);
  account = session.account;
  status = 'authenticated';
  endedBy = null;
  return session.account;
}

function clearSession(reason: string | null = null): void {
  const wasSignedIn = status === 'authenticated' || accessToken !== null;
  accessToken = null;
  writeRefreshToken(null);
  account = null;
  status = 'anonymous';
  if (wasSignedIn) endedBy = reason;
}

function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const token = readRefreshToken();
  if (!token) return Promise.resolve(false);
  refreshing = adminApi
    .refresh(token)
    .then((session) => {
      applySession(session);
      return true;
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) clearSession(e.code);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

setAuthHooks({ accessToken: () => accessToken, refresh: refreshSession });

export const adminAuth = {
  get account() { return account; },
  get status() { return status; },
  get isAuthenticated() { return status === 'authenticated'; },
  get endedBy() { return endedBy; },

  async init(): Promise<void> {
    if (status !== 'anonymous' || !readRefreshToken()) return;
    status = 'loading';
    const ok = await refreshSession();
    if (!ok && status === 'loading') status = account ? 'authenticated' : 'anonymous';
  },

  async login(input: LoginInput): Promise<Account> {
    status = 'loading';
    try {
      return applySession(await adminApi.login(input));
    } catch (e) {
      status = account ? 'authenticated' : 'anonymous';
      throw e;
    }
  },

  async logout(): Promise<void> {
    const token = readRefreshToken();
    clearSession();
    endedBy = null;
    if (!token) return;
    try {
      await adminApi.logout(token);
    } catch {
      return;
    }
  },

  async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        endedBy = e.code;
      }
      throw e;
    }
  },
};
