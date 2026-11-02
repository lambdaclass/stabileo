import { describe, expect, it } from 'vitest';
import { selfCheckWarnings, selfCheckGroups } from '../self-checks';
import { modelFindings } from '../model-findings';
import type { StructuredDiagnostic } from '../types';

const diagnostic = (severity: StructuredDiagnostic['severity']): StructuredDiagnostic => ({
  code: 'residual_high', severity, phase: 'self_check:modal_residual:1',
  message: 'WARN: self-check modal_residual:1', value: 2e-6, threshold: 1e-6,
});

const EN_WARNING = 'Self-check mode 1 eigen-equation residual: 2.00e-6 (warning from 1.00e-6)';

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
  expect(body).toContain(EN_WARNING);
  const clean = render(SelfCheckBanner, { props: { results: [{ structuredDiagnostics: [diagnostic('info')] }] } });
  expect(clean.body).not.toContain('role="alert"');
});

import ModalCertificate from '../../../components/advanced/ModalCertificate.svelte';

it('keeps modal warnings visible even before a background certificate is available', () => {
  const { body } = render(ModalCertificate, { props: {
    result: { modes: [{ frequency: 2 }], structuredDiagnostics: [diagnostic('warning')] }, mode: 0,
  } });
  expect(body).toContain('role="alert"');
  expect(body).toContain(EN_WARNING);
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
  expect(body.match(/Self-check mode 1 eigen-equation residual/g)).toHaveLength(1000);
});

import ResultSelfChecks from '../../../components/ResultSelfChecks.svelte';
import { resultsStore, uiStore } from '../../store';
import type { ModalResult3D } from '../result-types';

it('keeps a warned mode visible above the results after switching from Advanced to Results', () => {
  resultsStore.clear();
  const previousTab = uiStore.proActiveTab;
  const previousMode = uiStore.analysisMode;
  resultsStore.setModalResult3D({ modes: [{ frequency: 2, period: 0.5 }], structuredDiagnostics: [diagnostic('warning')] } as ModalResult3D);
  // Select the PRO workspace as the application does.
  uiStore.analysisMode = 'pro';
  uiStore.proActiveTab = 'advanced';
  uiStore.proActiveTab = 'results';
  expect(resultsStore.diagramType).toBe('modeShape');
  const { body } = render(ResultSelfChecks);
  expect(body).toContain(EN_WARNING);
  expect(body).toContain('role="alert"');
  resultsStore.clear();
  uiStore.proActiveTab = previousTab;
  uiStore.analysisMode = previousMode;
});

import { setLocale, ensureLocale, i18n } from '../../i18n';
import { selfCheckWarningText, localizeEngineText } from '../../i18n/engine-text';

describe('self-check text in the reader\'s language', () => {
  it('words warnings and refusals from the phase and numbers, in Spanish too', async () => {
    const previous = i18n.locale;
    await ensureLocale('es');
    try {
      setLocale('es');
      expect(selfCheckWarningText(diagnostic('warning'))).toBe('Autoverificación residuo de la ecuación del modo 1: 2.00e-6 (advertencia desde 1.00e-6). Revisá el modelo antes de usar estos resultados.');
      expect(localizeEngineText('REFUSE: self-check modal_residual:3: 6.200e-3 exceeds 1.000e-3')).toBe('Resultados rechazados: la autoverificación residuo de la ecuación del modo 3 vale 6.20e-3, por encima del límite 1.00e-3.');
      expect(localizeEngineText('Caso D: REFUSE: self-check static_balance: non-finite force')).toBe('Caso D: Resultados rechazados: falló la autoverificación balance de reacciones (un valor no es finito).');
    } finally {
      setLocale(previous);
    }
  });

  it('words a report\'s warnings with the report\'s translator', () => {
    const spanish = (key: string) => ({ 'selfCheck.check.modal_residual': 'residuo del modo {mode}', 'selfCheck.warning': '{check} = {value} > {threshold}' } as Record<string, string>)[key] ?? key;
    expect(selfCheckWarningText(diagnostic('warning'), spanish)).toBe('residuo del modo 1 = 2.00e-6 > 1.00e-6');
    expect(localizeEngineText('REFUSE: self-check modal_mass: non-positive modal mass')).toBe('Results refused: self-check modal mass failed (the modal mass is not positive).');
    expect(localizeEngineText('REFUSE: self-check modal_mass: a reason we never wrote')).toBe('Results refused: self-check modal mass failed (a reason we never wrote).');
  });

  it('leaves unknown checks and diagnostics without numbers in the engine\'s words', () => {
    expect(localizeEngineText('REFUSE: self-check something_else: 1e-2 exceeds 1e-3')).toBe('REFUSE: self-check something_else: 1e-2 exceeds 1e-3');
    const bare = { ...diagnostic('warning'), value: undefined };
    expect(selfCheckWarningText(bare)).toBe(bare.message);
  });
});
