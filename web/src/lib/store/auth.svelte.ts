import { ApiError, setAuthHooks, type RefreshOutcome } from '../api/client';
import { authApi, type Account, type AuthConfig, type ConsentKind, type GoogleRegisterInput, type ProfileUpdate, type Session } from '../api/auth';
import { openGooglePopup, type PendingPopup } from '../auth/google-popup';
import { accounts } from '../features';
import { usageConsent } from '../telemetry/consent.svelte';

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

/**
 * A "no" to anonymous usage holds from either side once someone signs in: the account's turns this
 * browser off, and this browser's is recorded on the account, so the profile, what is sent and the
 * admin site agree. A "yes" changes nothing here, so the usage notice still shows once.
 */
function adoptUsageChoice(a: Account): void {
  const recorded = a.consents?.usage_analytics;
  if (recorded === false && usageConsent.choice !== 'denied') usageConsent.set('denied');
  else if (recorded === true && usageConsent.choice === 'denied') {
    void authApi.recordConsent('usage_analytics', false).then((next) => { if (account?.id === next.id) account = next; }, () => {});
  }
}

function applySession(session: Session): Account {
  accessToken = session.access_token;
  ownRefreshToken = session.refresh_token;
  writeRefreshToken(session.refresh_token);
  account = session.account;
  status = 'authenticated';
  adoptUsageChoice(session.account);
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
    if (e instanceof ApiError && e.status === 401) clearSession(ownRefreshToken);
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

export type GoogleOutcome =
  | { kind: 'signedIn'; account: Account }
  | { kind: 'signup'; token: string; email: string; name: string };

export const authStore = {
  get account() { return account; },
  get status() { return status; },
  get isAuthenticated() { return status === 'authenticated'; },
  get userLoginEnabled() { return userLoginEnabled; },
  get showAccountEntry() { return accounts() && (userLoginEnabled || account !== null); },
  get cloudProjectsEnabled() { return serverConfig?.cloud_projects_enabled === true; },
  get saveRequiresAccount() { return userLoginEnabled && serverConfig?.google_login === true && serverConfig?.save_requires_account === true; },
  get usageTelemetryEnabled() { return serverConfig?.usage_telemetry_enabled === true; },
  get termsVersion() { return serverConfig?.terms_version ?? null; },
  get googleLogin() { return serverConfig?.google_login === true; },
  get configKnown() { return serverConfig !== null; },
  get needsTerms() { return account !== null && account.consents?.terms_current === false; },

  async init(): Promise<void> {
    if (!accounts()) return;
    const restore = status === 'anonymous' && readRefreshToken() !== null;
    if (restore) status = 'loading';
    const [, outcome] = await Promise.all([loadConfig(), restore ? refreshSession() : Promise.resolve('ok')]);
    if (outcome !== 'ok' && status === 'loading') status = account ? 'authenticated' : 'anonymous';
  },

  /**
   * Opens Google's window and waits for its answer: a session for a known person, or what a new
   * one needs to accept the terms with `completeGoogleSignup`. Call it straight from the click.
   */
  signInWithGoogle(open: (url: string) => PendingPopup = openGooglePopup): { result: Promise<GoogleOutcome>; cancel(): void } {
    const pending = open(authApi.googleStartUrl());
    const result = pending.answer.then(async ({ code, verifier }) => {
      const answer = await authApi.googleExchange(code, verifier);
      if ('signup_required' in answer) return { kind: 'signup' as const, token: answer.signup_token, email: answer.email, name: answer.name };
      return { kind: 'signedIn' as const, account: applySession(answer) };
    });
    return { result, cancel: pending.cancel };
  },

  completeGoogleSignup(input: GoogleRegisterInput): Promise<Account> {
    return startSession(() => authApi.googleRegister(input));
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
    adoptUsageChoice(me);
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
};

export function initialsOf(a: Pick<Account, 'name' | 'email'>): string {
  const words = a.name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? a.email).slice(0, 2);
  return letters.toUpperCase();
}
