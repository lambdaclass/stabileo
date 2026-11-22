import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import ResultChecks from '../ResultChecks.svelte';
import KnownIssueResult from '../KnownIssueResult.svelte';
import { certificateStore, type CertificateState } from '../../lib/store/certificate.svelte';
import { noticePrefs } from '../../lib/store/notice-prefs.svelte';
import { setLocale } from '../../lib/i18n';

const done = (certificate: { status: 'certified'; absBound: number; relBound: number | null } | { status: 'uncertified'; reason: string }, endToEnd?: unknown): CertificateState => ({
  status: 'done', dim: '2d', scope: 'single', certificate,
  forceBounds: new Map(), shellBounds: new Map(), stationBounds: new Map(), deflectionBounds: new Map(), reactionBounds: new Map(),
  ...(endToEnd ? { endToEnd } : {}),
}) as CertificateState;

const details = (html: string) => html.match(/<details class="rc[^"]*"[^>]*>/)![0];

describe('result checks flag', () => {
  afterEach(() => { vi.restoreAllMocks(); setLocale('en'); });

  it('is calm for a certified result', () => {
    vi.spyOn(certificateStore, 'shown').mockReturnValue(done({ status: 'certified', absBound: 1e-12, relBound: 1e-10 }));
    const tag = details(render(ResultChecks).body);
    expect(tag).toContain('data-flagged="false"');
    expect(tag).not.toMatch(/class="[^"]*warn/);
  });

  it('stands out in warning colour for a result that is not certified', () => {
    vi.spyOn(certificateStore, 'shown').mockReturnValue(done({ status: 'uncertified', reason: 'residual too large' }));
    const tag = details(render(ResultChecks).body);
    expect(tag).toContain('data-flagged="true"');
    expect(tag).toContain('data-flag-level="warn"');
    expect(tag).toMatch(/class="rc[^"]*\bflagged\b[^"]*\bwarn\b/);
  });

  it('stands out for a failed end-to-end check under a certified solve', () => {
    vi.spyOn(certificateStore, 'shown').mockReturnValue(done({ status: 'certified', absBound: 1e-12, relBound: 1e-10 }, { status: 'failed', reason: 'mismatch' }));
    const tag = details(render(ResultChecks).body);
    expect(tag).toContain('data-flag-level="warn"');
  });
});

describe('known issues beside an advanced result', () => {
  afterEach(() => { noticePrefs.showAll(); setLocale('en'); });
  const children = createRawSnippet(() => ({ render: () => '<span>ordinates</span>' }));
  const result = (phase: string) => ({ points: [{ value: 1 }], structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase, value: 762, message: 'ENGINE' }] });

  it('are sorted into their own kind, not all into "limitation"', () => {
    const html = render(KnownIssueResult, { props: { result: result('NUM-INVARIANCE'), children } }).body;
    expect(html).toContain('data-kind="conditioning"');
    expect(html).not.toContain('data-kind="limitation"');
  });

  it('hiding a kind hides that kind only', () => {
    noticePrefs.hide('limitation');
    expect(render(KnownIssueResult, { props: { result: result('NUM-INVARIANCE'), children } }).body).toContain('data-kind="conditioning"');
    noticePrefs.hide('conditioning');
    const html = render(KnownIssueResult, { props: { result: result('NUM-INVARIANCE'), children } }).body;
    expect(html).not.toContain('data-testid="known-issue-result"');
    expect(html).toContain('ordinates');
  });

  it('a refusal is never hidden and withholds the result', () => {
    noticePrefs.hide('conditioning');
    const refused = { structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'NUM-INVARIANCE', value: 762, message: 'ENGINE' }] };
    const html = render(KnownIssueResult, { props: { result: refused, children } }).body;
    expect(html).toContain('data-kind="withheld"');
    expect(html).not.toContain('ordinates');
  });
});
