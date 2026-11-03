import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = { saveRequiresAccount: false, userLoginEnabled: false, isAuthenticated: false };
const tracked: { name: string; props: Record<string, unknown> }[] = [];
let accountsOn = true;

vi.mock('../auth.svelte', () => ({ authStore: auth }));
vi.mock('../../features', () => ({ accounts: () => accountsOn }));
vi.mock('../../telemetry/usage', () => ({
  trackUsage: (name: string, props: Record<string, unknown>) => void tracked.push({ name, props }),
}));

const { accountGate } = await import('../account-gate.svelte');
const { saveFile } = await import('../../export/save-file');

beforeEach(() => {
  auth.saveRequiresAccount = false;
  auth.userLoginEnabled = false;
  auth.isAuthenticated = false;
  accountsOn = true;
  tracked.length = 0;
  accountGate.open = false;
});

describe('account gate', () => {
  it('runs at once while no account is required', () => {
    const run = vi.fn();
    accountGate.guard('save', run);
    expect(run).toHaveBeenCalledOnce();
    expect(accountGate.open).toBe(false);
    expect(tracked).toEqual([]);
  });

  it('runs at once when the accounts feature is off, whatever the server says', () => {
    auth.saveRequiresAccount = true;
    accountsOn = false;
    const run = vi.fn();
    accountGate.guard('export', run);
    expect(run).toHaveBeenCalledOnce();
    expect(accountGate.open).toBe(false);
  });

  it('runs at once for a signed-in user', () => {
    auth.saveRequiresAccount = true;
    auth.isAuthenticated = true;
    const run = vi.fn();
    accountGate.guard('share', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('asks for an account, and runs the action once the user signs in', () => {
    auth.saveRequiresAccount = true;
    const run = vi.fn();
    accountGate.guard('save', run);
    expect(run).not.toHaveBeenCalled();
    expect(accountGate.open).toBe(true);
    expect(accountGate.action).toBe('save');

    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(run).toHaveBeenCalledOnce();
    expect(accountGate.action).toBeNull();
    expect(tracked).toEqual([
      { name: 'gate.shown', props: { action: 'save' } },
      { name: 'gate.passed', props: { action: 'save' } },
    ]);
  });

  it('drops the action when the dialog closes without an account', () => {
    auth.saveRequiresAccount = true;
    const run = vi.fn();
    accountGate.guard('code', run);
    accountGate.open = false;
    expect(run).not.toHaveBeenCalled();
    expect(accountGate.action).toBeNull();

    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps only the last action asked for', () => {
    auth.saveRequiresAccount = true;
    const first = vi.fn();
    const second = vi.fn();
    accountGate.guard('save', first);
    accountGate.guard('export', second);
    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('a comment asks for an account whenever sign-in is open, whatever the save switch says', () => {
    auth.userLoginEnabled = true;
    const run = vi.fn();
    accountGate.requireSignIn('feedback', run);
    expect(run).not.toHaveBeenCalled();
    expect(accountGate.action).toBe('feedback');

    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(run).toHaveBeenCalledOnce();
  });

  it('a comment goes straight through while sign-in is closed', () => {
    const run = vi.fn();
    accountGate.requireSignIn('feedback', run);
    expect(run).toHaveBeenCalledOnce();
    expect(accountGate.open).toBe(false);
  });

  describe('allow', () => {
    it('resolves true at once while no account is required', async () => {
      await expect(accountGate.allow('open')).resolves.toBe(true);
      expect(accountGate.open).toBe(false);
    });

    it('waits for sign-in, then resolves true', async () => {
      auth.saveRequiresAccount = true;
      const answer = accountGate.allow('import');
      expect(accountGate.open).toBe(true);
      expect(accountGate.action).toBe('import');

      auth.isAuthenticated = true;
      accountGate.open = false;
      await expect(answer).resolves.toBe(true);
      expect(tracked.map((e) => e.name)).toEqual(['gate.shown', 'gate.passed']);
    });

    it('resolves false when the request is closed without signing in', async () => {
      auth.saveRequiresAccount = true;
      const answer = accountGate.allow('export');
      accountGate.open = false;
      await expect(answer).resolves.toBe(false);
    });
  });

  describe('files', () => {
    const input = () => ({ value: 'C:\\fakepath\\beam.ded', files: ['beam.ded'] }) as unknown as HTMLInputElement;

    it('hands the change straight to the handler while no account is required', () => {
      const handler = vi.fn();
      const e = { currentTarget: input() } as unknown as Event;
      accountGate.files('open', handler)(e);
      expect(handler).toHaveBeenCalledWith(e);
    });

    it('reads the chosen file only after sign-in, from the same input', () => {
      auth.saveRequiresAccount = true;
      const el = input();
      const handler = vi.fn((e: Event) => (e.currentTarget as HTMLInputElement).files);
      accountGate.files('open', handler)({ currentTarget: el } as unknown as Event);
      expect(handler).not.toHaveBeenCalled();
      expect(accountGate.action).toBe('open');

      auth.isAuthenticated = true;
      accountGate.open = false;
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.results[0].value).toEqual(['beam.ded']);
    });

    it('closing the request reads nothing and clears the input, so the same file can be chosen again', () => {
      auth.saveRequiresAccount = true;
      const el = input();
      const handler = vi.fn();
      accountGate.files('import', handler)({ currentTarget: el } as unknown as Event);
      accountGate.open = false;
      expect(handler).not.toHaveBeenCalled();
      expect(el.value).toBe('');
    });
  });

  it('defer leaves an action that opens its own window alone, unless the account is missing; then it runs it again after sign-in', () => {
    const run = vi.fn();
    expect(accountGate.defer('export', run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(accountGate.open).toBe(false);

    auth.saveRequiresAccount = true;
    auth.userLoginEnabled = true;
    expect(accountGate.defer('export', run)).toBe(true);
    expect(accountGate.open).toBe(true);
    accountGate.open = false;
    expect(run).not.toHaveBeenCalled();

    expect(accountGate.defer('export', run)).toBe(true);
    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(run).toHaveBeenCalledOnce();
  });

  it('a download that waits for a long sign-in makes its link then, and a closed request downloads nothing', () => {
    vi.useFakeTimers();
    const made: string[] = [];
    const revoked: string[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { made.push(`blob:${made.length}`); return made.at(-1)!; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => void revoked.push(u));
    const clicks: string[] = [];
    let attached = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { href: '', download: '', click: () => void clicks.push(`${a.download} ${a.href}`) };
        return a;
      },
      body: { appendChild: () => void (attached += 1), removeChild: () => void (attached -= 1) },
    });
    try {
      auth.saveRequiresAccount = true;
      saveFile('a.csv', new Blob(['x']));
      expect(made).toEqual([]);
      accountGate.open = false;
      vi.advanceTimersByTime(20_000);
      expect(made).toEqual([]);
      expect(clicks).toEqual([]);

      saveFile('b.csv', new Blob(['y']));
      vi.advanceTimersByTime(30_000);
      auth.isAuthenticated = true;
      accountGate.open = false;
      expect(clicks).toEqual(['b.csv blob:0']);
      expect(revoked).toEqual([]);
      vi.advanceTimersByTime(10_000);
      expect(revoked).toEqual(['blob:0']);
      expect(attached).toBe(0);
    } finally {
      create.mockRestore();
      revoke.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

