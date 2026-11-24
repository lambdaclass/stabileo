import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = { isAuthenticated: false, account: null as { id: string } | null };
const sent: { path: string; body: unknown }[] = [];
let answer: { recorded: string[] } = { recorded: [] };
const firstSave = vi.fn();

vi.mock('../../features', () => ({ accounts: () => true }));
vi.mock('../../store/auth.svelte', () => ({ authStore: auth }));
vi.mock('../../api/client', () => ({
  request: vi.fn(async (_m: string, path: string, opts: { body: unknown }) => {
    sent.push({ path, body: opts.body });
    return { data: answer };
  }),
}));
vi.mock('../tracking', () => ({ tracking: { firstSave } }));

const { milestone, reportActivity, pendingMilestones } = await import('../activity.svelte');

const store = new Map<string, string>();

beforeEach(() => {
  sent.length = 0;
  store.clear();
  firstSave.mockClear();
  auth.isAuthenticated = false;
  auth.account = null;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('location', { pathname: '/app/basic', search: '' });
  vi.stubGlobal('document', { cookie: '' });
});

describe('account activity', () => {
  it('keeps milestones reached before signing in, and sends them once there is a session', async () => {
    milestone('first_analysis');
    await reportActivity();
    expect(sent).toEqual([]);
    expect(pendingMilestones()).toEqual(['first_analysis']);

    auth.isAuthenticated = true;
    auth.account = { id: 'acc-1' };
    answer = { recorded: ['first_analysis', 'first_save'] };
    milestone('first_save');
    await reportActivity();

    expect(sent).toEqual([{ path: '/api/v1/marketing/activity', body: { milestones: ['first_analysis', 'first_save'], attribution: {}, page: '/app/basic' } }]);
    expect(pendingMilestones()).toEqual([]);
    expect(firstSave).toHaveBeenCalledExactlyOnceWith('acc-1');
  });

  it('reports the day once, and a milestone the backend had already seen sends no pixel event', async () => {
    auth.isAuthenticated = true;
    auth.account = { id: 'acc-2' };
    answer = { recorded: [] };
    await reportActivity();
    await reportActivity();
    expect(sent).toHaveLength(1);

    milestone('first_save');
    await reportActivity();
    expect(sent).toHaveLength(2);
    expect(firstSave).not.toHaveBeenCalled();
  });
});

describe('the first analysis', () => {
  it('a solve the app started (an example opening) is not the person\'s first analysis; a failed one still uses up the skip', async () => {
    const { analysisFinished, skipNextAnalysis } = await import('../activity.svelte');
    auth.isAuthenticated = true;
    auth.account = { id: 'acc-3' };
    answer = { recorded: ['first_analysis'] };

    skipNextAnalysis();
    analysisFinished(false);
    analysisFinished(false);
    await reportActivity();
    expect(sent.flatMap((s) => (s.body as { milestones: string[] }).milestones)).toEqual([]);

    analysisFinished(true);
    await reportActivity();
    expect(sent.at(-1)!.body).toMatchObject({ milestones: ['first_analysis'] });
  });
});

describe('what is already recorded', () => {
  it('a milestone the backend recorded is not sent again from this browser', async () => {
    auth.isAuthenticated = true;
    auth.account = { id: 'acc-5' };
    answer = { recorded: ['first_export'] };
    milestone('first_export');
    await reportActivity();
    expect(store.get('stb-milestones:acc-5')).toBe('["first_export"]');

    const calls = sent.length;
    milestone('first_export');
    await reportActivity();
    expect(sent).toHaveLength(calls);
  });

  it('a skip the app asked for expires if its solve never finishes', async () => {
    const { analysisFinished, skipNextAnalysis } = await import('../activity.svelte');
    auth.isAuthenticated = true;
    auth.account = { id: 'acc-6' };
    answer = { recorded: ['first_analysis'] };
    skipNextAnalysis(0);
    analysisFinished(true, 31_000);
    await reportActivity();
    expect(sent.at(-1)!.body).toMatchObject({ milestones: ['first_analysis'] });
  });
});

describe('the day', () => {
  it('is the Buenos Aires day, not the UTC one', async () => {
    const { today } = await import('../activity.svelte');
    expect(today(Date.UTC(2026, 10, 5, 2, 59))).toBe('2026-11-04');
    expect(today(Date.UTC(2026, 10, 5, 3, 0))).toBe('2026-11-05');
  });
});
