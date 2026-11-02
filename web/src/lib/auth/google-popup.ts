/**
 * The Google sign-in window. The backend sends it, at the end, to `/oauth-callback.html` on this
 * origin, which hands back `{ code }` or `{ error }` on the `stabileo-oauth` channel. Google's pages
 * can cut the window's link to its opener, so neither `window.opener` nor `popup.closed` is relied
 * on: the wait ends with an answer or with `cancel()`.
 */
export const OAUTH_CHANNEL = 'stabileo-oauth';
export const OAUTH_STORAGE_KEY = 'stabileo-oauth-result';

export type PopupAnswer = { code: string } | { error: string };

export class GoogleSignInError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'GoogleSignInError';
    this.code = code;
  }
}

export interface PendingPopup {
  answer: Promise<string>;
  cancel(): void;
}

function parse(data: unknown): PopupAnswer | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== OAUTH_CHANNEL) return null;
  if (typeof d.code === 'string' && d.code) return { code: d.code };
  if (typeof d.error === 'string' && d.error) return { error: d.error };
  return null;
}

/** Opens the window; call it straight from the click, or the browser blocks it. */
export function openGooglePopup(url: string, win: Window = window): PendingPopup {
  const popup = win.open(url, 'stabileo-google', 'popup,width=480,height=640');
  if (!popup) return { answer: Promise.reject(new GoogleSignInError('popup_blocked')), cancel: () => {} };

  let finish: (answer: PopupAnswer) => void = () => {};
  const answer = new Promise<string>((resolve, reject) => {
    finish = (a) => ('code' in a ? resolve(a.code) : reject(new GoogleSignInError(a.error)));
  });

  let channel: BroadcastChannel | null = null;
  const done = (a: PopupAnswer | null) => {
    if (!a) return;
    cleanup();
    finish(a);
  };
  const onMessage = (e: MessageEvent) => {
    if (e.origin === win.location.origin) done(parse(e.data));
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== OAUTH_STORAGE_KEY || !e.newValue) return;
    try {
      done(parse(JSON.parse(e.newValue)));
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
    channel.onmessage = (e) => done(parse(e.data));
  } catch {
    channel = null;
  }

  return {
    answer,
    cancel() {
      cleanup();
      try {
        popup.close();
      } catch {
        /* already gone */
      }
      finish({ error: 'cancelled' });
    },
  };
}
