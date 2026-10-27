import { ApiError, setAuthHooks, type RefreshOutcome } from '../api/client';
import { authApi, type Account, type AuthConfig, type ConsentKind, type ProfileUpdate, type RegisterInput, type LoginInput, type Session } from '../api/auth';
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
let userLoginEnabled = $state(false);
let serverConfig = $state<AuthConfig | null>(null);
let accessToken: string | null = null;
// The refresh token this tab last stored. Other tabs share the stored key and may replace it.
let ownRefreshToken: string | null = null;
let refreshing: Promise<RefreshOutcome> | null = null;

function applySession(session: Session): Account {
  accessToken = session.access_token;
  ownRefreshToken = session.refresh_token;
  writeRefreshToken(session.refresh_token);
  account = session.account;
  status = 'authenticated';
  return session.account;
}

// Forgets the stored token only while it is still `token`: one another tab stored since is live.
function clearSession(token: string | null = readRefreshToken()): void {
  accessToken = null;
  ownRefreshToken = null;
  if (readRefreshToken() === token) writeRefreshToken(null);
  account = null;
  status = 'anonymous';
}

async function renew(token: string, retried = false): Promise<RefreshOutcome> {
  try {
    applySession(await authApi.refresh(token));
    return 'ok';
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) return 'unavailable';
    // Two tabs refreshing at once send the same token and only one wins; the loser finds the
    // winner's successor in storage and renews with that.
    const stored = readRefreshToken();
    if (!retried && stored && stored !== token) return renew(stored, true);
    clearSession(token);
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

setAuthHooks({ accessToken: () => accessToken, refresh: refreshSession });

async function loadConfig(): Promise<void> {
  try {
    serverConfig = await authApi.config();
    userLoginEnabled = serverConfig.user_login_enabled === true;
  } catch {
    serverConfig = null;
    userLoginEnabled = false;
  }
}

async function authenticated<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code !== 'invalid_current_password') clearSession(ownRefreshToken);
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
  get userLoginEnabled() { return userLoginEnabled; },
  get showAccountEntry() { return accounts() && (userLoginEnabled || account !== null); },
  get cloudProjectsEnabled() { return serverConfig?.cloud_projects_enabled === true; },
  get usageTelemetryEnabled() { return serverConfig?.usage_telemetry_enabled === true; },
  get termsVersion() { return serverConfig?.terms_version ?? null; },
  get needsTerms() { return account !== null && account.consents?.terms_current === false; },

  async init(): Promise<void> {
    if (!accounts()) return;
    const restore = status === 'anonymous' && readRefreshToken() !== null;
    if (restore) status = 'loading';
    const [, outcome] = await Promise.all([loadConfig(), restore ? refreshSession() : Promise.resolve('ok')]);
    if (outcome !== 'ok' && status === 'loading') status = account ? 'authenticated' : 'anonymous';
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

  async recordConsent(kind: ConsentKind, granted: boolean): Promise<Account> {
    const next = await authenticated(() => authApi.recordConsent(kind, granted));
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
