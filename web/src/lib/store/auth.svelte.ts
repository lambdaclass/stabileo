import { ApiError, setAuthHooks } from '../api/client';
import { authApi, type Account, type ProfileUpdate, type RegisterInput, type LoginInput, type Session } from '../api/auth';
import { accounts } from '../features';

export type AuthStatus = 'anonymous' | 'loading' | 'authenticated';

export const REFRESH_TOKEN_KEY = 'stabileo-refresh-token';

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    return;
  }
}

let account = $state<Account | null>(null);
let status = $state<AuthStatus>('anonymous');
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

function applySession(session: Session): Account {
  accessToken = session.access_token;
  writeRefreshToken(session.refresh_token);
  account = session.account;
  status = 'authenticated';
  return session.account;
}

function clearSession(): void {
  accessToken = null;
  writeRefreshToken(null);
  account = null;
  status = 'anonymous';
}

function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const token = readRefreshToken();
  if (!token) return Promise.resolve(false);
  refreshing = authApi
    .refresh(token)
    .then((session) => {
      applySession(session);
      return true;
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) clearSession();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

setAuthHooks({ accessToken: () => accessToken, refresh: refreshSession });

async function authenticated<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code !== 'invalid_current_password') clearSession();
    throw e;
  }
}

async function startSession(open: () => Promise<Session>): Promise<Account> {
  status = 'loading';
  try {
    return applySession(await open());
  } catch (e) {
    status = account ? 'authenticated' : 'anonymous';
    throw e;
  }
}

export const authStore = {
  get account() { return account; },
  get status() { return status; },
  get isAuthenticated() { return status === 'authenticated'; },

  async init(): Promise<void> {
    if (!accounts() || status !== 'anonymous' || !readRefreshToken()) return;
    status = 'loading';
    const ok = await refreshSession();
    if (!ok && status === 'loading') status = account ? 'authenticated' : 'anonymous';
  },

  register(input: RegisterInput): Promise<Account> {
    return startSession(() => authApi.register(input));
  },

  login(input: LoginInput): Promise<Account> {
    return startSession(() => authApi.login(input));
  },

  async logout(): Promise<void> {
    const token = readRefreshToken();
    clearSession();
    if (!token) return;
    try {
      await authApi.logout(token);
    } catch {
      return;
    }
  },

  async loadMe(): Promise<Account> {
    const me = await authenticated(() => authApi.me());
    account = me;
    status = 'authenticated';
    return me;
  },

  async updateProfile(patch: ProfileUpdate): Promise<Account> {
    const next = await authenticated(() => authApi.updateMe(patch));
    account = next;
    return next;
  },

  changePassword(currentPassword: string, password: string): Promise<void> {
    return authenticated(() => authApi.changePassword(currentPassword, password));
  },
};

export function initialsOf(a: Pick<Account, 'name' | 'email'>): string {
  const words = a.name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? a.email).slice(0, 2);
  return letters.toUpperCase();
}
