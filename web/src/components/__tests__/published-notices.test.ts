import { afterEach, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import KnownIssueResult from '../KnownIssueResult.svelte';
import ContainmentBanner from '../ContainmentBanner.svelte';
import { knownIssueResultDisposition } from '../../lib/engine/known-issues';
import { containmentDismissal } from '../../lib/store/containment-dismissal.svelte';
import { HIDDEN_NOTICES_KEY, noticePrefs } from '../../lib/store/notice-prefs.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>ordinates</span>' }));
afterEach(() => {
  vi.unstubAllGlobals();
  noticePrefs.reload();
  containmentDismissal.restore();
});

it.each(['warning', 'error'])('known wrong result: #1928 the published standalone result preserves its %s despite a hidden category', severity => {
  const result = { structuredDiagnostics: [{ code: 'known_issue', severity, phase: 'NUM-INVARIANCE', message: 'ENGINE' }] };
  const disposition = knownIssueResultDisposition(result);
  expect(disposition.messages).toHaveLength(1);
  const stored = JSON.stringify(['conditioning', 'secondOrderUnchecked']);
  const getItem = (key: string) => key === HIDDEN_NOTICES_KEY ? stored : null;
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem, setItem });
  noticePrefs.reload();
  noticePrefs.showAll();
  noticePrefs.hide('conditioning');
  expect(setItem).not.toHaveBeenCalled();
  const html = render(KnownIssueResult, { props: { result, children } }).body;
  expect(html).toContain(disposition.messages[0]);
  expect(html.includes('ordinates')).toBe(!disposition.refused);
  expect(noticePrefs.isHidden('conditioning')).toBe(false);
});

it('known wrong result: #1928 the published viewport keeps each reported refusal until its model is corrected', () => {
  const disposition = { refused: true, messages: ['Refused in this model'] };
  containmentDismissal.dismiss(disposition.messages);
  const html = render(ContainmentBanner, { props: { disposition, children } }).body;
  expect(html).toContain(disposition.messages[0]);
  expect(html).not.toContain('data-testid="containment-dismiss"');
  expect(html).not.toContain('ordinates');
  expect(render(ContainmentBanner, { props: { disposition: { refused: false, messages: [] }, children } }).body).toContain('ordinates');
});
