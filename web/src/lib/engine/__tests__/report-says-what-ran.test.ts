/**
 * The report has to agree with what was actually done.
 *
 * ── The three things this pins ─────────────────────────────────────
 *
 *  · "Advanced analysis" was ONE checkbox over as many as six studies, so a
 *    report carried all of them or none — and a reader could not tell an
 *    analysis that was never asked for from one that was asked for and found
 *    nothing. Both print as silence, and silence about a buckling check is
 *    the most expensive kind.
 *
 *  · The CIRSOC verification section was offered here. A code check is a
 *    DESIGN output with its own edition, provenance and staleness rules, and
 *    a report that mixes "what the structure does" with "whether it passes"
 *    invites the second to be read with the first one's authority.
 *
 *  · An untouched letterhead printed its labels anyway.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml, type ReportData, type ReportConfig } from '../pro-report';
import en from '../../i18n/locales/en';

const ADVANCED = {
  pdelta: { converged: true, iterations: 3, b2Factor: 1.12 },
  modal: { modes: [{ frequency: 2.5, period: 0.4 }], totalMass: 1000 },
  buckling: { factors: [4.2] },
} as ReportData['advancedResults'];

function cfg(over: Partial<ReportConfig> = {}): ReportConfig {
  return {
    companyName: '', companyLogo: null, projectAddress: '', engineerName: '', revision: '1',
    sections: {
      modelData: true, results: true, verification: false, advancedAnalysis: true,
      storyDrift: false, diagnostics: true, quantities: true, loads: true,
    },
    ...over,
  } as ReportConfig;
}

function data(over: Partial<ReportData> = {}): ReportData {
  return {
    projectName: 'T', date: '2026-09-12',
    nodes: [], elements: [], materials: [], sections: [], supports: [],
    loadCount: 0,
    results: { displacements: [], reactions: [], elementForces: [] },
    verifications: [],
    t: (k: string) => (en as Record<string, string>)[k] ?? k,
    ...over,
  } as ReportData;
}

describe('advanced analyses, and which of them the report claims', () => {
  it('prints the ones that ran', () => {
    const html = generateReportHtml(data({ advancedResults: ADVANCED, config: cfg() }));
    expect(html).toContain('P-Delta');
    expect(html).toMatch(/Modal/);
    expect(html).toMatch(/Buckling|Pandeo/);
  });

  it('prints only the ones the reader picked', () => {
    const html = generateReportHtml(data({
      advancedResults: ADVANCED,
      config: cfg({ advancedPicked: { pdelta: true, modal: false, buckling: false } }),
    }));
    expect(html).toContain('P-Delta');
    expect(html, 'modal was deselected').not.toMatch(/<h3>[^<]*Modal/);
    expect(html, 'buckling was deselected').not.toMatch(/<h3>[^<]*(Buckling|Pandeo)/);
  });

  it('prints no advanced section at all when every one of them is deselected', () => {
    const html = generateReportHtml(data({
      advancedResults: ADVANCED,
      config: cfg({ advancedPicked: { pdelta: false, modal: false, buckling: false } }),
    }));
    /* Not an empty heading: a section title with nothing under it reads as an
       analysis that ran and produced nothing. */
    expect(html).not.toMatch(/<h2>[^<]*Advanced/);
  });

  it('says nothing about an analysis that never ran', () => {
    const html = generateReportHtml(data({ config: cfg() }));
    expect(html).not.toMatch(/<h2>[^<]*Advanced/);
  });
});

describe('what the report must not carry', () => {
  it('has no CIRSOC verification section — that is a design output', () => {
    const html = generateReportHtml(data({
      config: cfg(),
      verifications: [{ elementId: 1, b: 0.2, h: 0.4 } as never],
    }));
    expect(html).not.toContain('sec-verification');
  });

  it('prints no letterhead when the project fields were left blank', () => {
    const html = generateReportHtml(data({
      config: cfg({ companyName: 'ACME', hasProjectInfo: false }),
    }));
    expect(html, 'blank means blank, even with a remembered name').not.toContain('ACME');
  });

  it('prints the letterhead when it was filled in', () => {
    const html = generateReportHtml(data({
      config: cfg({ companyName: 'ACME', hasProjectInfo: true }),
    }));
    expect(html).toContain('ACME');
  });
});
