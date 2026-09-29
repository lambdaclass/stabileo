/**
 * The report numbers its sections in the order it prints them, once each, and writes a
 * combination's factors apart from the case names.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml, type ReportData, type ReportConfig } from '../pro-report';
import en from '../../i18n/locales/en';

const config = {
  companyName: '', companyLogo: null, projectAddress: '', engineerName: '', revision: '1',
  sections: { modelData: true, results: true, verification: false, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true },
} as ReportConfig;

const data = {
  projectName: 'T', date: '2026-09-29',
  nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 0 }, { id: 3, x: 4, y: 4, z: 0 }, { id: 4, x: 0, y: 4, z: 0 }],
  elements: [], materials: [], sections: [], supports: [],
  combinations: [{ id: 1, name: 'U1', factors: [{ caseId: 1, caseName: 'Dead', factor: 1.25 }, { caseId: 2, caseName: 'Live', factor: 1 }] }],
  loadCount: 1,
  results: { displacements: [], reactions: [], elementForces: [] },
  verifications: [],
  config,
  t: (k: string) => (en as Record<string, string>)[k] ?? k,
} as unknown as ReportData;

describe('report numbering', () => {
  const html = generateReportHtml(data);

  it('does not number a title that carries its own number twice', () => {
    expect(html).not.toMatch(/1\. 1\./);
    expect(html).not.toMatch(/2\. 2\./);
  });

  it('numbers sub-sections in the order they appear, each once', () => {
    const nums = [...html.matchAll(/<h2>(\d)\.(\d+) /g)].map((m) => [+m[1]!, +m[2]!] as const);
    expect(nums.length).toBeGreaterThan(3);
    const seen = new Set<string>();
    let last = [0, 0];
    for (const [a, b] of nums) {
      const key = `${a}.${b}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(a > last[0]! || (a === last[0] && b === last[1]! + 1), key).toBe(true);
      if (a > last[0]!) expect(b, key).toBe(1);
      last = [a, b];
    }
  });

  it('writes a factor apart from its case and keeps its figures', () => {
    expect(html).toContain('1.25 Dead + Live');
  });
});
