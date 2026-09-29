/**
 * The report at project scale: nothing omitted because the model is large, the envelope across
 * the result sets for every member, the statics and deflection checks, the chosen figures, and the
 * job's data on the cover.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml, type ReportData, type ReportConfig } from '../pro-report';
import en from '../../i18n/locales/en';

const N = 150;
const ef = (id: number, m: number) => ({ elementId: id, length: 3, nStart: 1, nEnd: 1, vyStart: 0, vyEnd: 0, vzStart: 2, vzEnd: -2, mxStart: 0, mxEnd: 0, myStart: m, myEnd: -m, mzStart: 0, mzEnd: 0 });
const set = (k: number) => ({ displacements: [], reactions: [{ nodeId: 1, fx: 0, fy: 0, fz: 10 * k, mx: 0, my: 0, mz: 0 }], elementForces: Array.from({ length: N }, (_, i) => ef(i + 1, k * (i + 1))) });

const cfg = (over: Partial<ReportConfig['sections']> = {}): ReportConfig => ({
  companyName: '', companyLogo: null,
  figures: [{ dataUrl: 'data:image/png;base64,AAAA', caption: '1.2D+1.6L: My' }],
  sections: { modelData: true, results: true, verification: false, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: false, envelope: true, statics: true, deflections: true, figures: true, ...over },
}) as ReportConfig;

const data = (config: ReportConfig): ReportData => ({
  projectName: 'Big', date: '2026-09-27',
  nodes: Array.from({ length: N + 1 }, (_, i) => ({ id: i + 1, x: i, y: 0, z: 0 })),
  elements: Array.from({ length: N }, (_, i) => ({ id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame' })),
  materials: [{ id: 1, name: 'S', e: 200000, nu: 0.3, rho: 78.5 }], sections: [{ id: 1, name: 'IPE', a: 0.005, iz: 1e-5, iy: 2e-4, j: 1e-7 }], supports: [],
  loadCount: 0,
  results: set(1),
  verifications: [],
  resultSets: [{ id: 1, name: 'C1', results: set(1) }, { id: 2, name: 'C2', results: set(2) }] as never,
  resultSetName: 'C2',
  statics: { cases: [{ caseId: 1, caseName: 'D', applied: { fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 }, reactions: { fx: 0, fy: 0, fz: 10, mx: 0, my: 0, mz: 0 }, difference: { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }, worstRelative: 0, uncovered: [], selfWeightIncluded: false }], combos: [] },
  deflections: [{ span: '1', L: 3, delta: 0.004, limit: 'L/360', direction: 'resultant', ratio: 0.48, status: 'ok', cantilever: false }],
  projectInfo: { client: 'ACME', job: 'Nave 2', revisions: [{ code: 'A', date: '2026-09-01' }, { code: 'B', date: '2026-09-20' }], designer: { name: 'B. Chesta', date: '2026-09-20' } },
  config,
  t: (k: string) => (en as Record<string, string>)[k] ?? k,
} as unknown as ReportData);

describe('the report at project scale', () => {
  const html = generateReportHtml(data(cfg()));

  it('prints every member and node, however many', () => {
    expect(html).not.toMatch(/omitted|omitidos/i);
    const rows = html.split('\n').join('').match(/<tr><td rowspan="2">\d+<\/td><td>i<\/td>/g) ?? [];
    expect(rows.length).toBe(N);
  });

  it('carries the envelope across the result sets, with the extremes and where they are', () => {
    expect(html).toContain('id="sec-envelope"');
    // Member 150 under C2: My = 300 at end i; the summary, read along the members, names it
    // with its station.
    // (The records are synthetic, their shear not matched to their moments, so the value along
    // the member is not the end's 300; where and under which set is what this checks.)
    expect(html).toMatch(/<td>My \(kN·m\)<\/td><td class="num">[\d.]+<\/td><td>150 @ [\d.]+<\/td><td>C2<\/td>/);
    expect((html.match(/<td rowspan="2">\d+·[ij]<\/td><td>Max<\/td>/g) ?? []).length).toBe(2 * N);
  });

  it('carries the statics, the deflections, the figures and the job', () => {
    expect(html).toContain('id="sec-statics"');
    expect(html).toContain('id="sec-deflections"');
    expect(html).toContain('id="sec-figures"');
    expect(html).toContain('1.2D+1.6L: My');
    expect(html).toContain('ACME');
    expect(html).toContain('Nave 2');
    expect(html).toContain('B. Chesta');
    expect(html).toMatch(/B · 2026-09-20/);
  });

  it('leaves out what was not asked for', () => {
    const lean = generateReportHtml(data(cfg({ envelope: false, statics: false, deflections: false, figures: false })));
    expect(lean).not.toContain('id="sec-envelope"');
    expect(lean).not.toContain('id="sec-statics"');
    expect(lean).not.toContain('id="sec-figures"');
  });
});
