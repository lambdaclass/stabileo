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
