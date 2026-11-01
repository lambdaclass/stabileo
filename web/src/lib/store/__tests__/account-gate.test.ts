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
});
