import { describe, it, expect, afterEach } from 'vitest';
import { knownIssueMessage } from '../known-issues';
import { setLocale } from '../../i18n';

afterEach(() => setLocale('en'));

describe('known-issue warnings in the reader’s language', () => {
  const d = { code: 'known_issue', phase: 'NL-5', value: 428, message: 'engine English (known issue #428, NL-5; being fixed)' };

  it('shows the app’s sentence for the id, with the issue number', () => {
    setLocale('es');
    const es = knownIssueMessage(d);
    expect(es).toMatch(/no lineales de material/);
    expect(es).toMatch(/#428/);
    setLocale('en');
    expect(knownIssueMessage(d)).toMatch(/Material-nonlinear/);
  });

  it('keeps the engine’s text for an id the app does not know, and leaves other codes alone', () => {
    expect(knownIssueMessage({ ...d, phase: 'XX-99' })).toBe(d.message);
    expect(knownIssueMessage({ code: 'residual_high', message: 'r' })).toBe('r');
  });

  it('says a thermal default was assumed in the reader’s language (#407)', () => {
    for (const phase of ['alpha', 'depth']) {
      for (const loc of ['es', 'en', 'pt'] as const) {
        setLocale(loc);
        expect(knownIssueMessage({ code: 'thermal_default_assumed', phase, message: 'ENGINE' }), `${phase} ${loc}`).not.toBe('ENGINE');
      }
    }
    expect(knownIssueMessage({ code: 'thermal_default_assumed', phase: 'other', message: 'ENGINE' })).toBe('ENGINE');
  });

  it('says a cable\'s own weight gives most of its tension, in the reader\'s language (#527)', () => {
    for (const loc of ['es', 'en', 'pt'] as const) {
      setLocale(loc);
      const m = knownIssueMessage({ code: 'cable_self_weight_tension', value: 1.55, message: 'ENGINE' });
      expect(m, loc).not.toBe('ENGINE');
      expect(m, loc).toMatch(/100 %/);
    }
    expect(knownIssueMessage({ code: 'cable_self_weight_tension', value: 0.4, message: 'ENGINE' })).toMatch(/40 %/);
  });

  it('has a sentence for every finding the engine contains, in es, en and pt', () => {
    for (const id of ['NL-5']) {
      for (const loc of ['es', 'en', 'pt'] as const) {
        setLocale(loc);
        expect(knownIssueMessage({ code: 'known_issue', phase: id, message: 'ENGINE' }), `${id} ${loc}`).not.toBe('ENGINE');
      }
    }
  });
});
