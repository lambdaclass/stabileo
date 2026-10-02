/**
 * The workbook follows the report dialog's choices, and opening the report leaves the
 * verification tab's results alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { workbookOptions } from '../report-export';

const base = { companyName: '', companyLogo: null, projectAddress: '', engineerName: '', revision: '', format: 'xlsx' as const };
const sections = { modelData: false, results: true, verification: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: false };
const v = { elementId: 3, elementType: 'beam', Mu: 12.5, Vu: 8, Nu: 0, overallStatus: 'ok' } as never;

describe('report workbook', () => {
  it('model sheets and results as chosen; the verification sheet is the Design panel\'s', () => {
    // A verification handed in from the older checker is not printed: the sheet lists what the
    // Design panel checked (`reportDesignChecks`), and with no design run there is none.
    const o = workbookOptions({ config: { ...base, sections }, verifications: [v], advancedResults: {}, t: (k) => k });
    expect(o.includeModel).toBe(false);
    expect(o.includeResults).toBe(true);
    expect(o.extraSheets).toHaveLength(0);
  });

  it('opening the report does not write the verification store', () => {
    const src = readFileSync(new URL('../../../components/pro/ProPanel.svelte', import.meta.url), 'utf8');
    expect(src).not.toMatch(/verificationStore\.setConcrete/);
  });
});
