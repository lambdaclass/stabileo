import { describe, it, expect, vi, afterEach } from 'vitest';
import { groupKnownIssues, knownIssueKind, kindLevel, topLevel, visibleNotices, HIDEABLE_KINDS } from '../result-notices';
import { errorMapRange } from '../discretization.svelte';

const d = (phase: string, severity = 'warning', message = phase) => ({ code: 'known_issue', phase, severity, message });
const text = (x: { message: string }) => x.message;

describe('sorting known issues into notice kinds', () => {
  it('names each family and makes every refusal a blocking withheld notice', () => {
    expect(knownIssueKind(d('LIN-SECOND-ORDER'))).toBe('secondOrder');
    expect(knownIssueKind(d('LIN-SECOND-ORDER-UNBOUNDED'))).toBe('secondOrderUnchecked');
    expect(knownIssueKind(d('LIN-SECOND-ORDER-NEAR'))).toBe('secondOrderUnchecked');
    expect(knownIssueKind(d('LIN-SMALL-DISPLACEMENT'))).toBe('largeDisplacement');
    expect(knownIssueKind(d('NUM-INVARIANCE'))).toBe('conditioning');
    expect(knownIssueKind(d('SH-MITC4-CONVERGENCE'))).toBe('shellMesh');
    expect(knownIssueKind(d('MD-ORTHOGONALITY'))).toBe('limitation');
    expect(knownIssueKind(d('SH-MITC4-DISTORTION', 'error'))).toBe('withheld');
    expect(kindLevel('withheld')).toBe('blocking');
    expect(kindLevel('secondOrder')).toBe('warning');
    expect(kindLevel('secondOrderUnchecked')).toBe('info');
    expect(kindLevel('discretization')).toBe('info');
  });

  it('groups by kind, most severe first, without repeating a message', () => {
    const notices = groupKnownIssues([d('MD-ORTHOGONALITY'), d('LIN-SECOND-ORDER-UNBOUNDED'), d('BU-BOUND', 'error'), d('MD-ORTHOGONALITY'), d('BU-ACCURACY')], text);
    expect(notices.map((n) => [n.kind, n.level])).toEqual([['withheld', 'blocking'], ['limitation', 'warning'], ['secondOrderUnchecked', 'info']]);
    expect(notices[1]!.details).toEqual(['MD-ORTHOGONALITY', 'BU-ACCURACY']);
    expect(topLevel(notices)).toBe('blocking');
    expect(topLevel([])).toBeNull();
  });

  it('drops "not screened" when the screen found a definite second-order exceedance', () => {
    const notices = groupKnownIssues([d('LIN-SECOND-ORDER'), d('LIN-SECOND-ORDER-UNBOUNDED'), d('LIN-SECOND-ORDER-NEAR')], text);
    expect(notices.map((n) => n.kind)).toEqual(['secondOrder']);
  });

  it('hides a kind the reader hid, but never a blocking notice', () => {
    const notices = groupKnownIssues([d('BU-BOUND', 'error'), d('NUM-INVARIANCE')], text);
    expect(visibleNotices(notices, () => true).map((n) => n.kind)).toEqual(['withheld']);
    expect(visibleNotices(notices, () => false)).toHaveLength(2);
    expect(HIDEABLE_KINDS).not.toContain('withheld');
  });
});

describe('the error map scale', () => {
  it('keeps the largest value when nothing stands out', () => {
    expect(errorMapRange([14, 2, 3], 5)).toEqual({ min: 0, max: 14, clipped: false });
    expect(errorMapRange([], 5)).toEqual({ min: 0, max: 10, clipped: false });
  });

  it('clips a few singular elements to the top colour instead of washing the rest out', () => {
    const values = [...Array.from({ length: 98 }, (_, i) => 1 + (i % 20)), 346, 280];
    const range = errorMapRange(values, 5);
    expect(range.max).toBe(20);
    expect(range.clipped).toBe(true);
  });
});

describe('the hidden kinds, remembered', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, data };
  }

  it('hides, shows and restores kinds, and writes each change through', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const { noticePrefs, HIDDEN_NOTICES_KEY } = await import('../notice-prefs.svelte');
    expect(noticePrefs.hidden).toEqual([]);
    noticePrefs.hide('secondOrderUnchecked');
    noticePrefs.hide('discretization');
    noticePrefs.hide('discretization');
    expect(noticePrefs.isHidden('discretization')).toBe(true);
    expect(JSON.parse(storage.data.get(HIDDEN_NOTICES_KEY)!)).toEqual(['secondOrderUnchecked', 'discretization']);
    noticePrefs.show('discretization');
    expect(noticePrefs.hidden).toEqual(['secondOrderUnchecked']);
    noticePrefs.showAll();
    expect(JSON.parse(storage.data.get(HIDDEN_NOTICES_KEY)!)).toEqual([]);
  });

  it('refuses to hide withheld results', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { noticePrefs } = await import('../notice-prefs.svelte');
    noticePrefs.hide('withheld');
    expect(noticePrefs.isHidden('withheld')).toBe(false);
    expect(noticePrefs.hidden).toEqual([]);
  });

  it('reads the saved choice on load, ignoring unknown and blocking kinds and broken storage', async () => {
    vi.stubGlobal('localStorage', memoryStorage({ 'stabileo-hidden-notices': JSON.stringify(['selfCheck', 'withheld', 'nonsense']) }));
    const first = await import('../notice-prefs.svelte');
    expect(first.noticePrefs.hidden).toEqual(['selfCheck']);
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage({ 'stabileo-hidden-notices': '{oops' }));
    const second = await import('../notice-prefs.svelte');
    expect(second.noticePrefs.hidden).toEqual([]);
    vi.resetModules();
    vi.stubGlobal('localStorage', undefined);
    const third = await import('../notice-prefs.svelte');
    third.noticePrefs.hide('selfCheck');
    expect(third.noticePrefs.isHidden('selfCheck')).toBe(true);
  });
});

describe('the notice over the model', () => {
  afterEach(async () => { (await import('../notice-prefs.svelte')).noticePrefs.showAll(); });

  async function banner(diagnostics: ReturnType<typeof d>[]) {
    const { render } = await import('svelte/server');
    const { knownIssueDisposition } = await import('../../engine/known-issues');
    const { default: ContainmentBanner } = await import('../../../components/ContainmentBanner.svelte');
    return render(ContainmentBanner, { props: { disposition: knownIssueDisposition(diagnostics), diagnostics } }).body;
  }

  it('says one plain line per kind, folds the engine text and offers to hide each kind', async () => {
    const html = await banner([d('LIN-SECOND-ORDER-UNBOUNDED', 'warning', 'ENGINE A'), d('NUM-INVARIANCE', 'warning', 'ENGINE B')]);
    expect(html).toContain('data-level="warning"');
    expect(html).toMatch(/data-testid="containment-headline"[^>]*>(2 notices about these results|notices\.count)</);
    expect(html.match(/data-testid="containment-row"/g)).toHaveLength(2);
    expect(html.match(/data-testid="notice-hide-kind"/g)).toHaveLength(2);
    expect(html).toContain('data-kind="conditioning"');
    expect(html).toContain('data-kind="secondOrderUnchecked" data-level="info"');
    expect(html).toContain('ENGINE B');
  });

  it('leaves a hidden kind out, and never a refusal', async () => {
    const { noticePrefs } = await import('../notice-prefs.svelte');
    noticePrefs.hide('conditioning');
    noticePrefs.hide('secondOrderUnchecked');
    expect(await banner([d('LIN-SECOND-ORDER-UNBOUNDED'), d('NUM-INVARIANCE')])).not.toContain('containment-notice');
    const refused = await banner([d('NUM-INVARIANCE'), d('BU-BOUND', 'error')]);
    expect(refused).toContain('data-level="blocking"');
    expect(refused).not.toContain('containment-dismiss');
    expect(refused).not.toContain('notice-hide-kind');
  });
});
