/**
 * The Pages Function behind the feedback widget (functions/api/feedback.ts)
 * turns anonymous input into a public GitHub issue. These tests pin the parts
 * that keep that safe: the captcha is mandatory, every field is bounded, and
 * user text cannot ping people, cross-link issues or attach foreign links.
 */
import { describe, expect, it } from 'vitest';
import {
  buildIssue,
  LIMITS,
  neutralizeMarkdown,
  safeShareLink,
  validateFeedback,
} from '../../../../functions/api/feedback';

const base = { type: 'bug', description: 'Beam shows wrong moment', turnstileToken: 'tok' };

describe('feedback function', () => {
  it('requires a Turnstile token (no bypass sentinel)', () => {
    expect(validateFeedback({ ...base, turnstileToken: undefined }).ok).toBe(false);
    expect(validateFeedback({ ...base, turnstileToken: '' }).ok).toBe(false);
    const sentinel = validateFeedback({ ...base, turnstileToken: 'turnstile-bypass' });
    // A non-empty token is passed on to Cloudflare for verification; the old
    // sentinel no longer skips that step, it is simply an invalid token there.
    expect(sentinel.ok).toBe(true);
    expect(validateFeedback(base).ok).toBe(true);
  });

  it('rejects non-object bodies and oversized descriptions', () => {
    expect(validateFeedback(null).ok).toBe(false);
    expect(validateFeedback([base]).ok).toBe(false);
    expect(validateFeedback({ ...base, description: 'x'.repeat(LIMITS.description + 1) }).ok).toBe(false);
    expect(validateFeedback({ ...base, description: 42 }).ok).toBe(false);
  });

  it('neutralises mentions, issue refs and HTML', () => {
    const out = neutralizeMarkdown('ping @octocat see #12 <!-- hidden --> <img src=x>');
    expect(out).not.toMatch(/@octocat/);
    expect(out).not.toMatch(/#12/);
    expect(out).not.toContain('<');
  });

  it('only attaches https links to the app', () => {
    expect(safeShareLink('https://stabileo.com/#s=abc')).toBe('https://stabileo.com/#s=abc');
    expect(safeShareLink('https://evil.example/phish')).toBeNull();
    expect(safeShareLink('javascript:alert(1)')).toBeNull();
    expect(safeShareLink('http://stabileo.com/')).toBeNull();
    expect(safeShareLink('https://stabileo.com/' + 'a'.repeat(LIMITS.shareLink))).toBeNull();
  });

  it('builds a bounded single-line author and drops unknown types', () => {
    const v = validateFeedback({
      ...base,
      type: '__proto__',
      name: 'Eve\n**Tipo:** Admin' + 'x'.repeat(500),
      shareLink: 'https://evil.example/',
    });
    if (!v.ok) throw new Error('expected valid');
    const issue = buildIssue(v.body);
    expect(issue.title.startsWith('[Otro]')).toBe(true);
    expect(issue.label).toBe('feedback');
    const author = issue.body.split('\n').find((l) => l.startsWith('**Autor:**'))!;
    expect(author.length).toBeLessThan(LIMITS.name + 20);
    expect(issue.body).not.toContain('evil.example');
  });
});
