import { describe, it, expect, vi } from 'vitest';
import { GoogleSignInError, OAUTH_CHANNEL, OAUTH_STORAGE_KEY, openGooglePopup } from '../google-popup';

function fakeWindow(popup: { close: () => void } | null = { close: vi.fn() }) {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const win = {
    location: { origin: 'https://stabileo.test' },
    open: vi.fn(() => popup),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => listeners.get(type)?.delete(fn),
  };
  const fire = (type: string, e: unknown) => listeners.get(type)?.forEach((fn) => fn(e));
  const count = (type: string) => listeners.get(type)?.size ?? 0;
  return { win: win as unknown as Window, open: win.open, fire, count };
}

describe('the Google sign-in window', () => {
  it('opens the backend URL and answers the code posted from this origin', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('https://stabileo.test/api/v1/auth/google', w.win);
    expect(w.open).toHaveBeenCalledWith('https://stabileo.test/api/v1/auth/google', 'stabileo-google', expect.stringContaining('popup'));

    w.fire('message', { origin: 'https://evil.test', data: { type: OAUTH_CHANNEL, code: 'forged' } });
    w.fire('message', { origin: 'https://stabileo.test', data: { type: 'other', code: 'x' } });
    w.fire('message', { origin: 'https://stabileo.test', data: { type: OAUTH_CHANNEL, code: 'code-1' } });

    await expect(pending.answer).resolves.toBe('code-1');
    expect(w.count('message')).toBe(0);
    expect(w.count('storage')).toBe(0);
  });

  it('answers through storage when the window lost its opener', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('u', w.win);
    w.fire('storage', { key: OAUTH_STORAGE_KEY, newValue: JSON.stringify({ type: OAUTH_CHANNEL, error: 'email_not_verified' }) });

    const err = await pending.answer.catch((e) => e);
    expect(err).toBeInstanceOf(GoogleSignInError);
    expect(err.code).toBe('email_not_verified');
  });

  it('answers through the broadcast channel', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('u', w.win);
    const channel = new BroadcastChannel(OAUTH_CHANNEL);
    channel.postMessage({ type: OAUTH_CHANNEL, code: 'code-2' });
    await expect(pending.answer).resolves.toBe('code-2');
    channel.close();
  });

  it('a blocked window is popup_blocked', async () => {
    const err = await openGooglePopup('u', fakeWindow(null).win).answer.catch((e) => e);
    expect(err.code).toBe('popup_blocked');
  });

  it('cancel closes the window and ends the wait as cancelled', async () => {
    const popup = { close: vi.fn() };
    const w = fakeWindow(popup);
    const pending = openGooglePopup('u', w.win);
    pending.cancel();

    const err = await pending.answer.catch((e) => e);
    expect(err.code).toBe('cancelled');
    expect(popup.close).toHaveBeenCalled();
    expect(w.count('message')).toBe(0);
  });
});
