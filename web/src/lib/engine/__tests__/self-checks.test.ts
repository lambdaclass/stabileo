import { describe, expect, it } from 'vitest';
import { selfCheckWarnings } from '../self-checks';
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
