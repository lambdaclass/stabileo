/**
 * Auth store — manages Google Sign-In state.
 * Uses Google Identity Services (GSI) for client-side auth.
 * Persists session to localStorage.
 */

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  sub: string; // Google user ID
  exp: number; // token expiration (unix seconds)
}

const STORAGE_KEY = 'dedaliano-auth-user';

function loadUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveUser(user: AuthUser | null) {
  if (typeof localStorage === 'undefined') return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Decode a JWT payload (no verification — we trust Google's signature on client). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(payload));
}

let _user = $state<AuthUser | null>(loadUser());
let _ready = $state(false);

export const authStore = {
  get user() { return _user; },
  get isLoggedIn() { return _user !== null; },
  get ready() { return _ready; },

  /** Called by GSI callback when user signs in. */
  handleCredential(credential: string) {
    try {
      const payload = decodeJwtPayload(credential);
      const user: AuthUser = {
        email: payload.email as string,
        name: payload.name as string,
        picture: payload.picture as string,
        sub: payload.sub as string,
        exp: payload.exp as number,
      };
      _user = user;
      saveUser(user);

      // Log sign-in to backend (fire-and-forget)
      logSignIn(user).catch(() => {});
    } catch (e) {
      console.error('Failed to decode Google credential:', e);
    }
  },

  logout() {
    _user = null;
    saveUser(null);
    // Revoke Google session
    if (typeof google !== 'undefined' && google.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  },

  /** Mark the auth store as ready (GSI loaded or no GSI available). */
  setReady() {
    _ready = true;
  },
};

/** Log sign-in event to Cloudflare Function. */
async function logSignIn(user: AuthUser) {
  try {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        name: user.name,
        sub: user.sub,
      }),
    });
  } catch {
    // Silent fail — tracking is best-effort
  }
}

// Declare google GSI types
declare global {
  interface Window {
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
  const google: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          auto_select?: boolean;
        }): void;
        renderButton(
          element: HTMLElement,
          config: { theme?: string; size?: string; width?: number; text?: string; shape?: string; logo_alignment?: string },
        ): void;
        prompt(): void;
        disableAutoSelect(): void;
      };
    };
  };
}
