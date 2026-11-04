import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import RecheckNotice from '../RecheckNotice.svelte';
import { recheckStore } from '../../lib/store/recheck.svelte';
import { t, setLocale } from '../../lib/i18n';

vi.mock('../../lib/store/file', () => ({ saveWorkspaceToLocalStorage: vi.fn() }));
vi.mock('../../lib/actions/recheck', () => ({
  rerunAnalysisAndDesign: vi.fn(),
  recheckKey: (key: string) => key,
}));

afterEach(() => { recheckStore.reset(); setLocale('en'); });

it('keeps acknowledgement disabled until lazy changes arrive, without changing the project stamp', async () => {
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
  // Native dialog is required: aria-modal on a div cannot outrank the mobile desk.
  expect(html).toMatch(/<dialog[^>]*role="alertdialog"[^>]*data-testid="recheck-overlay"/);
  expect(html).toContain(t('recheck.loading'));
  expect(html).toContain(t('recheck.staleWarning'));
  for (const id of ['recheck-ack', 'recheck-later', 'recheck-rerun']) {
    expect(html).toMatch(new RegExp(`<[^>]*disabled[^>]*data-testid="${id}"`));
  }
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const changes = recheckStore.assessment!.changes;
  expect(changes.map(c => c.id)).toContain('cirsoc301-tension-needs-connection');
  const loaded = render(RecheckNotice).body;
  for (const change of changes) {
    expect(loaded).toContain(`data-change-id="${change.id}"`);
  }
  expect(loaded).not.toContain(t('recheck.loading'));
  expect(recheckStore.capture()).toEqual(stamp);
  expect(recheckStore.stale).toBe(true);
  expect(recheckStore.noticeOpen).toBe(true);
});

it.each(['de', 'fr', 'tr'] as const)('shows each change in the reader\'s language (%s), not in English', async (locale) => {
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
