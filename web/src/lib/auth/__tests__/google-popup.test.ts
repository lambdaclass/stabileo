import { describe, it, expect, vi } from 'vitest';
import { GoogleSignInError, OAUTH_CHANNEL, OAUTH_STORAGE_KEY, attemptOf, openGooglePopup } from '../google-popup';

function fakeWindow(popup: { close: () => void; location: { href: string } } | null = { close: vi.fn(), location: { href: '' } }) {
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
  return { win: win as unknown as Window, open: win.open, popup, fire, count };
}

/** The attempt the window was sent to the backend with, once it is on its way. */
async function sentAttempt(popup: { location: { href: string } }): Promise<string> {
  await vi.waitFor(() => expect(popup.location.href).toContain('attempt='));
  return new URL(popup.location.href, 'https://stabileo.test').searchParams.get('attempt')!;
}

describe('the Google sign-in window', () => {
  it('opens the backend with this attempt and answers only its code, with the verifier behind the attempt', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('https://stabileo.test/api/v1/auth/google', w.win);
    expect(w.open).toHaveBeenCalledWith('', 'stabileo-google', expect.stringContaining('popup'));
    const attempt = await sentAttempt(w.popup!);
    expect(w.popup!.location.href).toBe(`https://stabileo.test/api/v1/auth/google?attempt=${attempt}`);
    expect(attempt).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const own = { origin: 'https://stabileo.test', source: w.popup };
    w.fire('message', { origin: 'https://evil.test', source: w.popup, data: { type: OAUTH_CHANNEL, code: 'forged', attempt } });
    w.fire('message', { origin: 'https://stabileo.test', source: {}, data: { type: OAUTH_CHANNEL, code: 'other-window', attempt } });
    w.fire('message', { ...own, data: { type: 'other', code: 'x', attempt } });
    w.fire('message', { ...own, data: { type: OAUTH_CHANNEL, code: 'another-attempt', attempt: 'b'.repeat(43) } });
    w.fire('message', { ...own, data: { type: OAUTH_CHANNEL, code: 'untagged' } });
    w.fire('message', { ...own, data: { type: OAUTH_CHANNEL, code: 'code-1', attempt } });

    const { code, verifier } = await pending.answer;
    expect(code).toBe('code-1');
    expect(await attemptOf(verifier)).toBe(attempt);
    expect(w.count('message')).toBe(0);
    expect(w.count('storage')).toBe(0);
  });

  it('another tab\'s callback on the shared channels finishes nothing', async () => {
    const a = fakeWindow();
    const b = fakeWindow();
    const first = openGooglePopup('u', a.win);
    const second = openGooglePopup('u', b.win);
    const attemptA = await sentAttempt(a.popup!);
    const attemptB = await sentAttempt(b.popup!);
    expect(attemptA).not.toBe(attemptB);

    const settled = vi.fn();
    void second.answer.then(settled, settled);
    const msg = JSON.stringify({ type: OAUTH_CHANNEL, code: 'code-A', attempt: attemptA });
    a.fire('storage', { key: OAUTH_STORAGE_KEY, newValue: msg });
    b.fire('storage', { key: OAUTH_STORAGE_KEY, newValue: msg });

    expect((await first.answer).code).toBe('code-A');
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    second.cancel();
  });

  it('answers an error through storage when the window lost its opener', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('u', w.win);
    const attempt = await sentAttempt(w.popup!);
    w.fire('storage', { key: OAUTH_STORAGE_KEY, newValue: JSON.stringify({ type: OAUTH_CHANNEL, error: 'email_not_verified', attempt }) });

    const err = await pending.answer.catch((e) => e);
    expect(err).toBeInstanceOf(GoogleSignInError);
    expect(err.code).toBe('email_not_verified');
  });

  it('an error that names no attempt still ends the wait', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('u', w.win);
    await sentAttempt(w.popup!);
    w.fire('storage', { key: OAUTH_STORAGE_KEY, newValue: JSON.stringify({ type: OAUTH_CHANNEL, error: 'invalid_state' }) });
    expect((await pending.answer.catch((e) => e)).code).toBe('invalid_state');
  });

  it('answers through the broadcast channel', async () => {
    const w = fakeWindow();
    const pending = openGooglePopup('u', w.win);
    const attempt = await sentAttempt(w.popup!);
    const channel = new BroadcastChannel(OAUTH_CHANNEL);
    channel.postMessage({ type: OAUTH_CHANNEL, code: 'code-2', attempt });
    expect((await pending.answer).code).toBe('code-2');
    channel.close();
  });

  it('a blocked window is popup_blocked', async () => {
    const err = await openGooglePopup('u', fakeWindow(null).win).answer.catch((e) => e);
    expect(err.code).toBe('popup_blocked');
  });

  it('cancel closes the window and ends the wait as cancelled', async () => {
    const popup = { close: vi.fn(), location: { href: '' } };
    const w = fakeWindow(popup);
    const pending = openGooglePopup('u', w.win);
    pending.cancel();

    const err = await pending.answer.catch((e) => e);
    expect(err.code).toBe('cancelled');
    expect(popup.close).toHaveBeenCalled();
    expect(w.count('message')).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(popup.location.href).toBe('');
  });
});
