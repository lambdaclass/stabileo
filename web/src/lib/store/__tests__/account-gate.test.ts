import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = { saveRequiresAccount: false, userLoginEnabled: false, isAuthenticated: false };
const tracked: { name: string; props: Record<string, unknown> }[] = [];
let accountsOn = true;

vi.mock('../auth.svelte', () => ({ authStore: auth }));
vi.mock('../../features', () => ({ accounts: () => accountsOn }));
vi.mock('../../telemetry/usage', () => ({
  trackUsage: (name: string, props: Record<string, unknown>) => void tracked.push({ name, props }),
}));

const { accountGate, gateFileInputs } = await import('../account-gate.svelte');

async function freshGate() {
  vi.resetModules();
  return import('../account-gate.svelte');
}
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

  it('runs every action asked for while the request is open, once the user signs in', () => {
    auth.saveRequiresAccount = true;
    const first = vi.fn();
    const second = vi.fn();
    accountGate.guard('save', first);
    accountGate.guard('export', second);
    expect(accountGate.action).toBe('save');
    auth.isAuthenticated = true;
    accountGate.open = false;
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(tracked.filter((e) => e.name === 'gate.shown')).toHaveLength(1);
  });

  it('closing the request calls what each action does on a refusal', () => {
    auth.saveRequiresAccount = true;
    const cancel = vi.fn();
    accountGate.guard('save', vi.fn(), cancel);
    accountGate.open = false;
    expect(cancel).toHaveBeenCalledOnce();
  });

  describe('when sign-in cannot happen', () => {
    it('the waiting save goes ahead without an account, and so does every later one in the visit', async () => {
      const { accountGate } = await freshGate();
      auth.saveRequiresAccount = true;
      const run = vi.fn();
      const cancel = vi.fn();
      accountGate.guard('save', run, cancel);

      expect(accountGate.proceedWithoutAccount()).toBe(true);
      expect(run).toHaveBeenCalledOnce();
      expect(cancel).not.toHaveBeenCalled();
      expect(accountGate.open).toBe(false);
      expect(accountGate.action).toBeNull();
      expect(tracked.at(-1)).toEqual({ name: 'gate.unavailable', props: { action: 'save' } });

      const later = vi.fn();
      accountGate.guard('export', later);
      expect(later).toHaveBeenCalledOnce();
      expect(accountGate.open).toBe(false);
    });

    it('a comment, which needs the account itself, does not go ahead', async () => {
      const { accountGate } = await freshGate();
      auth.userLoginEnabled = true;
      const run = vi.fn();
      accountGate.requireSignIn('feedback', run);
      expect(accountGate.proceedWithoutAccount()).toBe(false);
      expect(run).not.toHaveBeenCalled();
      expect(accountGate.open).toBe(true);
    });
  });

  describe('file inputs', () => {
    function setup(accept = '.ded,.json', extra: Record<string, unknown> = {}, gate = gateFileInputs) {
      let listener: ((e: Event) => void) | null = null;
      const target = {
        addEventListener: (_: string, l: (e: Event) => void, capture: boolean) => { expect(capture).toBe(true); listener = l; },
        removeEventListener: () => { listener = null; },
      } as unknown as Window;
      const stop = gate(target);
      const input = Object.assign(new EventTarget(), { tagName: 'INPUT', type: 'file', accept, files: ['beam.ded'], value: 'C:\\fakepath\\beam.ded', dataset: {} as Record<string, string> }, extra);
      const handler = vi.fn();
      input.addEventListener('change', handler);
      const choose = () => {
        const e = new Event('change', { bubbles: true });
        Object.defineProperty(e, 'target', { value: input });
        const stopped = vi.spyOn(e, 'stopImmediatePropagation');
        listener!(e);
        return stopped;
      };
      return { input, handler, choose, stop };
    }

    it('lets the choice through while no account is required', () => {
      const { choose } = setup();
      expect(choose()).not.toHaveBeenCalled();
      expect(accountGate.open).toBe(false);
    });

    it('holds the chosen file until sign-in, then hands the same input on', () => {
      auth.saveRequiresAccount = true;
      const { choose, handler } = setup();
      expect(choose()).toHaveBeenCalledOnce();
      expect(accountGate.action).toBe('open');
      expect(handler).not.toHaveBeenCalled();

      auth.isAuthenticated = true;
      accountGate.open = false;
      expect(handler).toHaveBeenCalledOnce();
    });

    it('names anything but a project file an import, and a closed request clears the input', () => {
      auth.saveRequiresAccount = true;
      const { choose, input, handler } = setup('.dxf');
      choose();
      expect(accountGate.action).toBe('import');
      accountGate.open = false;
      expect(handler).not.toHaveBeenCalled();
      expect(input.value).toBe('');
    });

    it('never holds an input marked as free of the account', () => {
      auth.saveRequiresAccount = true;
      const { choose } = setup('image/png', { dataset: { accountFree: '' } });
      expect(choose()).not.toHaveBeenCalled();
      expect(accountGate.open).toBe(false);
    });

    it('a failed sign-in hands the held file on too', async () => {
      const fresh = await freshGate();
      auth.saveRequiresAccount = true;
      const { choose, handler } = setup('.ded', {}, fresh.gateFileInputs);
      choose();
      fresh.accountGate.proceedWithoutAccount();
      expect(handler).toHaveBeenCalledOnce();
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

