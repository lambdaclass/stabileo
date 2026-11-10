import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import RecheckNotice from '../RecheckNotice.svelte';
import { recheckStore } from '../../lib/store/recheck.svelte';
import { t, setLocale } from '../../lib/i18n';
import { OFFERED_LOCALES } from '../../lib/i18n/offered';

vi.mock('../../lib/store/file', () => ({ saveWorkspaceSettled: vi.fn() }));
vi.mock('../../lib/actions/recheck', () => ({
  rerunAnalysisAndDesign: vi.fn(),
  recheckKey: (key: string) => key,
}));

afterEach(() => { vi.restoreAllMocks(); recheckStore.reset(); setLocale('en'); });

it('shows nothing during the first moments of the check, then the changes, without changing the project stamp', async () => {
  const project = {
    analysisMode: 'pro',
    materials: [[1, { id: 1, e: 200000, fy: 250 }]],
    elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  } as const;
  // Use mutable tuples for the saved-project API.
  recheckStore.openProject(JSON.parse(JSON.stringify(project)));
  const stamp = recheckStore.capture();
  const html = render(RecheckNotice).body;
  expect(recheckStore.pending).toBe(true);
  expect(recheckStore.noticeOpen).toBe(true);
  expect(html).not.toContain('data-testid="recheck-overlay"');
  expect(html).not.toContain('data-testid="recheck-stale-banner"');
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const changes = recheckStore.assessment!.changes;
  expect(changes.map(c => c.id)).toContain('cirsoc301-tension-needs-connection');
  const loaded = render(RecheckNotice).body;
  // Native dialog is required: aria-modal on a div cannot outrank the mobile desk.
  expect(loaded).toMatch(/<dialog[^>]*role="alertdialog"[^>]*data-testid="recheck-overlay"/);
  expect(loaded).toContain(t('recheck.title'));
  expect(loaded).not.toContain(t('recheck.checkingTitle'));
  for (const change of changes) {
    expect(loaded).toContain(`data-change-id="${change.id}"`);
  }
  expect(loaded).not.toContain(t('recheck.loading'));
  expect(recheckStore.capture()).toEqual(stamp);
  expect(recheckStore.stale).toBe(true);
  expect(recheckStore.noticeOpen).toBe(true);
});

it('says the generated loads are older when the project was solved in this build', async () => {
  recheckStore.openProject(JSON.parse(JSON.stringify({
    analysisMode: 'pro',
    elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
    loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }],
    designData: { loadBasis: {} },
    solvedWith: { ...recheckStore.capture(), analyses: ['linear'] },
  })));
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const html = render(RecheckNotice).body;
  expect(html).toContain('data-change-id="generated-area-loads-headroom"');
  expect(html).toContain(t('recheck.introLoads').split('{to}')[0]!);
  expect(html).toContain('data-testid="recheck-regenerate"');
  expect(html).toContain(t('autoLoad.autoGenBtn'));
  expect(html).not.toContain('data-testid="recheck-rerun"');
  expect(html).not.toContain(t('recheck.staleWarning'));
});

it('offers both actions when a notice mixes generated-load and solve changes', async () => {
  recheckStore.openProject(JSON.parse(JSON.stringify({
    analysisMode: 'pro',
    materials: [[1, { id: 1, e: 200000, fy: 250 }]],
    elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
    loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }],
    designData: { loadBasis: {} },
  })));
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const ids = recheckStore.assessment!.changes.map((c) => c.id);
  expect(ids).toContain('generated-area-loads-headroom');
  expect(ids).toContain('cirsoc301-tension-needs-connection');
  const html = render(RecheckNotice).body;
  expect(html).toContain('data-testid="recheck-regenerate"');
  expect(html).toContain('data-testid="recheck-rerun"');
  expect(html).toContain(t('recheck.staleWarning'));
});

it.each(OFFERED_LOCALES.filter((l) => l !== 'en'))('shows each change in the reader\'s language (%s), not in English', async (locale) => {
  const project = {
    analysisMode: 'pro',
    materials: [[1, { id: 1, e: 200000, fy: 250 }]],
    elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  } as const;
  setLocale(locale);
  recheckStore.openProject(JSON.parse(JSON.stringify(project)));
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const changes = recheckStore.assessment!.changes;
  expect(changes.map(c => c.id)).toContain('cirsoc301-tension-needs-connection');
  const html = render(RecheckNotice).body;
  const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const change of changes) {
    expect(change.title[locale], change.id).not.toBe(change.title.en);
    expect(html).toContain(text(change.title[locale]));
    expect(html).toContain(text(change.explanation[locale]));
    expect(html).not.toContain(text(change.explanation.en));
  }
});

it('does not claim results changed when the change list could not be loaded', () => {
  vi.spyOn(recheckStore, 'loadFailed', 'get').mockReturnValue(true);
  vi.spyOn(recheckStore, 'pending', 'get').mockReturnValue(true);
  vi.spyOn(recheckStore, 'noticeOpen', 'get').mockReturnValue(true);
  vi.spyOn(recheckStore, 'assessment', 'get').mockReturnValue({ solvedVersion: 1, currentVersion: 2, older: true, newer: false, changes: [], advisories: [], maybe: [] });
  const html = render(RecheckNotice).body;
  expect(html).toContain('data-testid="recheck-overlay"');
  expect(html).toContain(t('recheck.checkingTitle'));
  expect(html).toContain(t('recheck.loadFailed'));
  expect(html).not.toContain(t('recheck.title'));
  expect(html).toMatch(/<input[^>]*disabled[^>]*data-testid="recheck-ack"/);
});
