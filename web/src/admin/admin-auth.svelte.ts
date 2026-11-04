import { ApiError, setAuthHooks, type RefreshOutcome } from '../lib/api/client';
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
// The refresh token this tab last stored. Other tabs share the stored key and may replace it.
let ownRefreshToken: string | null = null;
let refreshing: Promise<RefreshOutcome> | null = null;

function applySession(session: AdminSession): Account {
  accessToken = session.access_token;
  ownRefreshToken = session.refresh_token;
  writeRefreshToken(session.refresh_token);
  account = session.account;
  status = 'authenticated';
  endedBy = null;
  return session.account;
}

// Forgets the stored token only while it is still `token`: one another tab stored since is live.
function clearSession(reason: string | null = null, token: string | null = readRefreshToken()): void {
  const wasSignedIn = status === 'authenticated' || accessToken !== null;
  accessToken = null;
  ownRefreshToken = null;
  if (readRefreshToken() === token) writeRefreshToken(null);
  account = null;
  status = 'anonymous';
  if (wasSignedIn) endedBy = reason;
}

async function renew(token: string, retried = false): Promise<RefreshOutcome> {
  try {
    applySession(await adminApi.refresh(token));
    return 'ok';
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) return 'unavailable';
    // Two tabs refreshing at once send the same token and only one wins; the loser finds the
    // winner's successor in storage and renews with that.
    const stored = readRefreshToken();
    if (!retried && stored && stored !== token) return renew(stored, true);
    clearSession(e.code, token);
    return 'rejected';
  }
}

function refreshSession(): Promise<RefreshOutcome> {
  if (refreshing) return refreshing;
  const token = readRefreshToken();
  if (!token) return Promise.resolve('rejected');
  refreshing = renew(token).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function startSession(open: () => Promise<AdminSession>): Promise<Account> {
  status = 'loading';
  try {
    return applySession(await open());
  } catch (e) {
    status = account ? 'authenticated' : 'anonymous';
    throw e;
  }
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
    const outcome = await refreshSession();
    if (outcome !== 'ok' && status === 'loading') status = account ? 'authenticated' : 'anonymous';
  },

  login(input: LoginInput): Promise<Account> {
    return startSession(() => adminApi.login(input));
  },

  exchangeOAuthCode(code: string): Promise<Account> {
    return startSession(() => adminApi.exchangeOAuthCode(code));
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
        clearSession(null, ownRefreshToken);
        endedBy = e.code;
      }
      throw e;
    }
  },
};
