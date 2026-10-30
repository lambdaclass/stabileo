import { describe, expect, it } from 'vitest';
import { selfCheckWarnings, selfCheckGroups } from '../self-checks';
import { modelFindings } from '../model-findings';
import type { StructuredDiagnostic } from '../types';

const diagnostic = (severity: StructuredDiagnostic['severity']): StructuredDiagnostic => ({
  code: 'residual_high', severity, phase: 'self_check:modal_residual:1',
  message: 'WARN: self-check modal_residual:1', value: 2e-6, threshold: 1e-6,
});

describe('runtime self-check containment', () => {
  it('shows warnings from modal and every static load case, while clean results stay quiet', () => {
    const warning = diagnostic('warning');
    expect(selfCheckWarnings([null, {}, { structuredDiagnostics: [diagnostic('info')] }])).toEqual([]);
    expect(selfCheckWarnings([{}, { structuredDiagnostics: [warning] }])).toEqual([warning]);
    expect(modelFindings([warning])).toMatchObject([{ severity: 'warning', code: 'residual_high' }]);
  });
});

import { render } from 'svelte/server';
import SelfCheckBanner from '../../../components/advanced/SelfCheckBanner.svelte';

it('renders a persistent alert with the engine explanation and hides passing checks', () => {
  const warning = diagnostic('warning');
  const { body } = render(SelfCheckBanner, { props: { results: [{ structuredDiagnostics: [warning] }] } });
  expect(body).toContain('role="alert"');
  expect(body).toContain(warning.message);
  const clean = render(SelfCheckBanner, { props: { results: [{ structuredDiagnostics: [diagnostic('info')] }] } });
  expect(clean.body).not.toContain('role="alert"');
});

import ModalCertificate from '../../../components/advanced/ModalCertificate.svelte';

it('keeps modal warnings visible even before a background certificate is available', () => {
  const { body } = render(ModalCertificate, { props: {
    result: { modes: [{ frequency: 2 }], structuredDiagnostics: [diagnostic('warning')] }, mode: 0,
  } });
  expect(body).toContain('role="alert"');
  expect(body).toContain('WARN: self-check modal_residual:1');
});

it('deduplicates an active case alias and preserves labels for distinct affected cases', () => {
  const first = { structuredDiagnostics: [diagnostic('warning')] };
  const second = { structuredDiagnostics: [diagnostic('warning')] };
  expect(selfCheckWarnings([first, second, first])).toHaveLength(2);
  expect(selfCheckGroups([first, second, first], ['Dead', 'Wind'])).toEqual([
    { label: 'Dead', warnings: first.structuredDiagnostics },
    { label: 'Wind', warnings: second.structuredDiagnostics },
  ]);
});

it('keeps 100 modal warnings and many cases in closed, bounded details', () => {
  const results = Array.from({ length: 10 }, () => ({ structuredDiagnostics: Array.from({ length: 100 }, () => diagnostic('warning')) }));
  const { body } = render(SelfCheckBanner, { props: { results: [...results, results[0]], labels: results.map((_, i) => `Case ${i}`) } });
  expect(body).toContain(': 1000');
  expect(body).toContain('<details>');
  expect(body).not.toMatch(/<details[^>]*open/);
  expect(body).toContain('Case 9');
  expect(body.match(/WARN: self-check/g)).toHaveLength(1000);
});

import ResultChecks from '../../../components/ResultChecks.svelte';
import { resultsStore, uiStore } from '../../store';
import type { ModalResult3D } from '../result-types';

it('keeps a warned mode visible in ResultChecks after switching from Advanced to Results', () => {
  resultsStore.clear();
  const previousTab = uiStore.proActiveTab;
  const previousMode = uiStore.analysisMode;
  resultsStore.setModalResult3D({ modes: [{ frequency: 2, period: 0.5 }], structuredDiagnostics: [diagnostic('warning')] } as ModalResult3D);
  // Select the PRO workspace as the application does.
  uiStore.analysisMode = 'pro';
  uiStore.proActiveTab = 'advanced';
  uiStore.proActiveTab = 'results';
  expect(resultsStore.diagramType).toBe('modeShape');
  const { body } = render(ResultChecks);
  expect(body).toContain('WARN: self-check modal_residual:1');
  expect(body).toContain('role="alert"');
  resultsStore.clear();
  uiStore.proActiveTab = previousTab;
  uiStore.analysisMode = previousMode;
});
