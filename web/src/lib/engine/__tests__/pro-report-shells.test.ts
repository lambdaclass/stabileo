/**
 * CP3 — shell report output.
 * Pins that the calc report emits a shell-results section with the governing
 * Von Mises element, principal stresses, and the assumptions/provenance note.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml, type ReportData } from '../pro-report';
import en from '../../i18n/locales/en';
import type { AnalysisResults3D, PlateStress, QuadStress } from '../types-3d';

const plate = (id: number, sxx: number, vm: number): PlateStress => ({
  elementId: id, sigmaXx: sxx, sigmaYy: 0, tauXy: 0, mx: 1, my: 0, mxy: 0, sigma1: sxx, sigma2: 0, vonMises: vm,
});
const quad = (id: number, sxx: number, vm: number): QuadStress => ({
  elementId: id, sigmaXx: sxx, sigmaYy: 0, tauXy: 0, mx: 2, my: 0, mxy: 0, vonMises: vm,
});

function makeData(results: Partial<AnalysisResults3D>): ReportData {
  return {
    projectName: 'T', date: '2026-06-07',
    nodes: [], elements: [], materials: [], sections: [], supports: [],
    loadCount: 0,
    results: { displacements: [], reactions: [], elementForces: [], ...results },
    verifications: [],
    t: (k: string) => (en as Record<string, string>)[k] ?? k,
  } as ReportData;
}

describe('shell report section (2.4)', () => {
  it('emits a shell-results section with governing Von Mises + assumptions', () => {
    const html = generateReportHtml(makeData({
      plateStresses: [plate(1, 10, 10)],
      quadStresses: [quad(7, 200, 99), quad(8, 50, 50)],
    }));
    expect(html).toContain('Shell results'); // 2.4 heading text
    expect(html).toContain('2.4');
    // Governing VM is Quad 7 (vm 99) — provenance line names it.
    expect(html).toMatch(/Quad 7/);
    expect(html).toContain('99');
    // Assumptions / provenance note present.
    expect(html).toContain('mid-surface');
    expect(html).toContain('No shell reinforcement design');
  });

  it('omits the section entirely when there are no shell stresses', () => {
    const html = generateReportHtml(makeData({}));
    expect(html).not.toContain('Shell results');
  });
});

it('retains and escapes mandatory advanced warnings with diagnostics disabled', () => {
  const data = makeData({});
  data.advancedResults = {
    modal: { modes: [{ frequency: 1, period: 1 }], disposition: { refused: false, messages: ['MD-ORTHOGONALITY <unsafe>'] } },
    buckling: { factors: [2], disposition: { refused: false, messages: ['BU-ACCURACY'] } },
    spectral: { baseShearX: 3, disposition: { refused: false, messages: ['spectral warning'] } },
  };
  data.config = { sections: { diagnostics: false } } as ReportData["config"];
  const html = generateReportHtml(data);
  expect(html).toContain('MD-ORTHOGONALITY &lt;unsafe&gt;');
  expect(html).toContain('BU-ACCURACY');
  expect(html).toContain('spectral warning');
  data.advancedResults.buckling!.disposition!.refused = true;
  expect(() => generateReportHtml(data)).toThrow('BU-ACCURACY');
});


it.each(['warning', 'error'] as const)('contains an exported %s result when the selected result is clean', severity => {
  const data = makeData({});
  data.resultSets = [{ id: 2, name: 'Other combination', results: {
    ...data.results,
    structuredDiagnostics: [{ code: 'known_issue', severity, phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }],
  } }];
  data.config = { sections: { diagnostics: false } } as ReportData['config'];
  if (severity === 'error') expect(() => generateReportHtml(data)).toThrow('#759');
  else expect(generateReportHtml(data)).toContain('#759');
});


it.each(['warning', 'error'] as const)('report assembly includes seismic drift sources with %s diagnostics', async severity => {
  const { modelStore, resultsStore, uiStore } = await import('../../store');
  const { buildProReportData } = await import('../pro-report-inputs');
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  const seismic = modelStore.addLoadCase('Earthquake', 'E');
  for (const combination of [...modelStore.combinations]) modelStore.removeCombination(combination.id);
  const combo = modelStore.addCombination('Clean export', [{ caseId: seismic, factor: 1 }]);
  const clean = makeData({}).results;
  const affected = { ...clean, structuredDiagnostics: [{ code: 'known_issue', severity, phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' }] };
  resultsStore.setResults3D(clean);
  resultsStore.setCombinationResults3D(new Map([[seismic, affected]]), new Map([[combo, clean]]), null as never);
  const data = buildProReportData({ config: { sections: {} } as NonNullable<ReportData['config']>, t: k => k })!;
  expect(data.results.structuredDiagnostics).toBeUndefined();
  expect(data.resultSets?.every(source => !source.results.structuredDiagnostics?.length)).toBe(true);
  expect(data.containment?.messages.join(' ')).toContain('#759');
  expect(data.containment?.refused).toBe(severity === 'error');
  resultsStore.clear();
  modelStore.clear();
  uiStore.analysisMode = '3d';
});
