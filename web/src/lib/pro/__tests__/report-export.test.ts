/**
 * Opening the report leaves the verification tab's results alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('report export', () => {
  it('opening the report does not write the verification store', () => {
    const src = readFileSync(new URL('../../../components/pro/ProPanel.svelte', import.meta.url), 'utf8');
    expect(src).not.toMatch(/verificationStore\.setConcrete/);
  });

  it('the report is the printable document only: the spreadsheet is Export › Excel', () => {
    const src = readFileSync(new URL('../report-export.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/downloadProjectWorkbook|xlsx/);
  });
});

it('actual report export entry point catches containment refusal and explains it', async () => {
  const { vi } = await import('vitest');
  const inputs = await import('../../engine/pro-report-inputs');
  const provenance = await import('../../store/result-provenance');
  const { uiStore } = await import('../../store/ui.svelte');
  const { exportReportAs } = await import('../report-export');
  const { t, setLocale } = await import('../../i18n');
  setLocale('es');
  const diagnostic = { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' };
  vi.spyOn(inputs, 'buildProReportData').mockReturnValue({
    projectName: 'test', date: '', nodes: [], elements: [], materials: [], sections: [], supports: [], loadCount: 0,
    results: { displacements: [], reactions: [], elementForces: [], structuredDiagnostics: [diagnostic] },
    verifications: [], t,
  } as never);
  vi.spyOn(provenance, 'provenanceForExport').mockResolvedValue(undefined as never);
  const toast = vi.spyOn(uiStore, 'toast');
  await expect(exportReportAs({ config: { sections: { modelData: false } } as never, advancedResults: {}, t })).resolves.toBeUndefined();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('#741'), 'error');
  expect(toast.mock.calls.at(-1)![0]).not.toMatch(/ENGINE|structuredDiagnostics/);
  vi.restoreAllMocks(); setLocale('en');
});


it('a refused workspace result is explained before the report builder sees a null display result', async () => {
  const { vi } = await import('vitest');
  const { resultsStore, uiStore } = await import('../../store');
  const inputs = await import('../../engine/pro-report-inputs');
  const { exportReportAs } = await import('../report-export');
  const { t } = await import('../../i18n');
  resultsStore.clear(); uiStore.analysisMode = 'pro';
  resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [],
    structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }],
  } as never);
  const build = vi.spyOn(inputs, 'buildProReportData');
  const toast = vi.spyOn(uiStore, 'toast');
  expect(resultsStore.results3D).toBeNull();
  await exportReportAs({ config: {} as never, advancedResults: {}, t });
  expect(build).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('#741'), 'error');
  vi.restoreAllMocks(); resultsStore.clear();
});
