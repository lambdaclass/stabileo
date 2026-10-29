import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import ContainmentBanner from '../../../components/ContainmentBanner.svelte';
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { knownIssueMessage, knownIssueDisposition, knownIssueRefusal, knownIssueResultDisposition } from '../known-issues';
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
    const registry = readFileSync('../engine/src/known_issues.rs', 'utf8');
    const ids = [...registry.matchAll(/Entry \{ id: "([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) {
      for (const loc of ['es', 'en', 'pt'] as const) {
        setLocale(loc);
        expect(knownIssueMessage({ code: 'known_issue', phase: id, message: 'ENGINE' }), `${id} ${loc}`).not.toBe('ENGINE');
      }
    }
  });
});


describe('containment modes', () => {
  const warning = { code: 'known_issue', severity: 'warning', phase: 'NL-5', value: 428, message: 'Approximate' };
  it('WARN keeps results visible and provides an issue banner', () => {
    const state = knownIssueDisposition([warning]);
    expect(state.refused).toBe(false);
    expect(state.messages[0]).toContain('#428');
    const html = render(ContainmentBanner, { props: { disposition: state, children: createRawSnippet(() => ({ render: () => '<span>123.45</span>' })) } }).body;
    expect(html).toContain('role="alert"');
    expect(html).toContain('#428');
    expect(html).toContain('123.45');
    expect(knownIssueResultDisposition({ results: { structuredDiagnostics: [warning] } }).messages[0]).toContain('#428');
  });
  it('REFUSE hides results and translates the structured engine refusal', () => {
    const refusal = { ...warning, severity: 'error' };
    expect(knownIssueDisposition([refusal]).refused).toBe(true);
    const html = render(ContainmentBanner, { props: { disposition: knownIssueDisposition([refusal]), children: createRawSnippet(() => ({ render: () => '<span>123.45</span>' })) } }).body;
    expect(html).toContain('#428');
    expect(html).not.toContain('123.45');
    expect(knownIssueResultDisposition({ steps: [{ results: { structuredDiagnostics: [refusal] } }] }).refused).toBe(true);
    expect(knownIssueRefusal(JSON.stringify({ structuredDiagnostics: [refusal] }))).toContain('#428');
    expect(knownIssueRefusal('ordinary error')).toBeNull();
  });
});

for (const key of ['results', 'finalResults', 'steps', 'stages', 'X', 'Y', 'caseResults', 'combinationResults']) {
  it(`collects and renders diagnostics in ${key}`, () => {
    const leaf = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }] };
    const result = { [key]: ['steps', 'stages', 'caseResults', 'combinationResults'].includes(key) ? [{ results: leaf }] : leaf };
    const disposition = knownIssueResultDisposition(result);
    expect(disposition.messages).toHaveLength(1);
    const html = render(ContainmentBanner, { props: { disposition } }).body;
    expect(html).toContain('#759');
    expect(disposition.refused).toBe(false);
  });
}
it('collects both spectral directions, deduplicates, and tolerates cycles', () => {
  const X = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }] };
  const Y = { structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NL-DYNAMIC-GAPS', value: 370, message: 'ENGINE' }] };
  const result: Record<string, unknown> = { X, Y, results: X };
  expect(knownIssueResultDisposition(result).messages).toHaveLength(2);
  result.results = result;
  expect(knownIssueResultDisposition(result).messages).toHaveLength(2);
});
