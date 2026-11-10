/**
 * The Google sign-in window. Each attempt keeps a random verifier and opens the backend with its
 * SHA-256 (`attempt`); the backend ends at `/oauth-callback.html` on this origin, which hands back
 * `{ code }` or `{ error }` tagged with that attempt on the `stabileo-oauth` channel. Only this
 * attempt's answer is taken, and the code trades only with the verifier, so another tab's or
 * another browser's code finishes nothing here. Google's pages can cut the window's link to its
 * opener, so neither `window.opener` nor `popup.closed` is relied on: the wait ends with an answer
 * or with `cancel()`.
 */
export const OAUTH_CHANNEL = 'stabileo-oauth';
export const OAUTH_STORAGE_KEY = 'stabileo-oauth-result';

export type PopupAnswer = { code: string } | { error: string };
export type PopupCode = { code: string; verifier: string };

export class GoogleSignInError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'GoogleSignInError';
    this.code = code;
  }
}

export interface PendingPopup {
  answer: Promise<PopupCode>;
  cancel(): void;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function attemptOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// An error that names no attempt (the backend lost its own record of it) still ends the wait: it
// can only stop a sign-in, never finish one.
function parse(data: unknown, attempt: string | null): PopupAnswer | null {
  if (!attempt || !data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== OAUTH_CHANNEL) return null;
  if (typeof d.code === 'string' && d.code) return d.attempt === attempt ? { code: d.code } : null;
  if (typeof d.error === 'string' && d.error && (d.attempt === attempt || d.attempt === undefined)) return { error: d.error };
  return null;
}

/** Opens the window; call it straight from the click, or the browser blocks it. */
export function openGooglePopup(url: string, win: Window = window): PendingPopup {
  const popup = win.open('', 'stabileo-google', 'popup,width=480,height=640');
  if (!popup) return { answer: Promise.reject(new GoogleSignInError('popup_blocked')), cancel: () => {} };

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  let attempt: string | null = null;
  let settled = false;
  let finish: (answer: PopupAnswer) => void = () => {};
  const answer = new Promise<PopupCode>((resolve, reject) => {
    finish = (a) => ('code' in a ? resolve({ code: a.code, verifier }) : reject(new GoogleSignInError(a.error)));
  });

  let channel: BroadcastChannel | null = null;
  const done = (a: PopupAnswer | null) => {
    if (!a || settled) return;
    settled = true;
    cleanup();
    finish(a);
  };
  const onMessage = (e: MessageEvent) => {
    if (e.origin === win.location.origin && e.source === popup) done(parse(e.data, attempt));
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== OAUTH_STORAGE_KEY || !e.newValue) return;
    try {
      done(parse(JSON.parse(e.newValue), attempt));
    } catch {
      return;
    }
  };
  function cleanup() {
    win.removeEventListener('message', onMessage);
    win.removeEventListener('storage', onStorage);
    channel?.close();
  }

  win.addEventListener('message', onMessage);
  win.addEventListener('storage', onStorage);
  try {
    channel = new BroadcastChannel(OAUTH_CHANNEL);
    channel.onmessage = (e) => done(parse(e.data, attempt));
  } catch {
    channel = null;
  }

  void attemptOf(verifier).then(
    (a) => {
      attempt = a;
      if (!settled) popup.location.href = `${url}${url.includes('?') ? '&' : '?'}attempt=${encodeURIComponent(a)}`;
    },
    () => done({ error: 'callback_failed' }),
  );

  return {
    answer,
    cancel() {
      try {
        popup.close();
      } catch {
        /* already gone */
      }
      done({ error: 'cancelled' });
    },
  };
}
