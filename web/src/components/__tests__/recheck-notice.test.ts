import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import RecheckNotice from '../RecheckNotice.svelte';
import { recheckStore } from '../../lib/store/recheck.svelte';
import { t } from '../../lib/i18n';

vi.mock('../../lib/store/file', () => ({ saveWorkspaceToLocalStorage: vi.fn() }));
vi.mock('../../lib/actions/recheck', () => ({
  rerunAnalysisAndDesign: vi.fn(),
  recheckKey: (key: string) => key,
}));

afterEach(() => recheckStore.reset());

it('lists every stale change when lazy notice details are unavailable, without changing the project stamp', () => {
  const project = {
    analysisMode: 'pro',
    materials: [[1, { id: 1, e: 200000, fy: 250 }]],
    elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  } as const;
  // Use mutable tuples for the saved-project API.
  recheckStore.openProject(JSON.parse(JSON.stringify(project)));
  const stamp = recheckStore.capture();
  const changes = recheckStore.assessment!.changes;
  expect(changes.map(c => c.id)).toContain('cirsoc301-tension-needs-connection');

  // SSR deliberately does not run the import effect: details remain null, exactly as after
  // a rejected chunk import. Exercise the actual component markup, not a source-text check.
  const html = render(RecheckNotice).body;
  for (const change of changes) {
    expect(html).toContain(`data-change-id="${change.id}"`);
    expect(html).toContain(`>${change.id}</span>`);
  }
  expect(html).toContain(t('recheck.detailsUnavailable'));
  expect(html).toContain(t('recheck.staleWarning'));
  for (const id of ['recheck-ack', 'recheck-later', 'recheck-rerun']) {
    expect(html).toMatch(new RegExp(`<[^>]*disabled[^>]*data-testid="${id}"`));
  }
  expect(recheckStore.capture()).toEqual(stamp);
  expect(recheckStore.stale).toBe(true);
  expect(recheckStore.noticeOpen).toBe(true);
});
