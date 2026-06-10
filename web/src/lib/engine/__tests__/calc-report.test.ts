// Regression tests for the calc-book report generator.
import { describe, it, expect } from 'vitest';
import { generateCalcReportHtml, type CalcReportData } from '../calc-report';

function baseData(overrides: Partial<CalcReportData> = {}): CalcReportData {
  return {
    config: { projectName: 'Test', engineerName: '', companyName: '', date: '1 Jan 2026', notes: '' },
    is3D: false,
    analysisMode: '2D',
    provenance: { kind: 'single', caseName: 'D' },
    hasDesignChecks: false,
    nodes: [],
    elements: [],
    materials: [],
    sections: [],
    supports: [],
    loads: [],
    loadCases: [],
    combinations: [],
    // A loaded simply-supported beam: Σreactions equals the applied load
    // resultant (10 kN), NOT zero — the solver convention is Σreactions = −Σapplied.
    results2D: {
      reactions: [
        { nodeId: 1, rx: 0, rz: 6, my: 0 },
        { nodeId: 2, rx: 0, rz: 4, my: 0 },
      ],
      displacements: [{ nodeId: 1, ux: 0, uz: 0 }],
      elementForces: [],
    } as any,
    ...overrides,
  };
}

describe('calc-report reactions section', () => {
  it('does not flag a loaded model as failing equilibrium (Σreactions balances Σapplied, not zero)', () => {
    const html = generateCalcReportHtml(baseData());
    expect(html).not.toContain('⚠ Review');
    expect(html).not.toContain('Equilibrium check');
    expect(html).toContain('Support reactions balance the applied loads');
  });

  it('notes that envelope reaction sums are not a physical load balance', () => {
    const html = generateCalcReportHtml(baseData({ provenance: { kind: 'envelope' } }));
    expect(html).toContain('not a physical load balance');
  });
});

describe('calc-report applied-loads table', () => {
  it('numbers condensed rows by their true position in the load list', () => {
    const loads = Array.from({ length: 100 }, (_, i) => ({
      type: 'nodal',
      description: `LOAD_DESC_${i + 1}`,
      caseLabel: 'D',
    }));
    const html = generateCalcReportHtml(baseData({ loads }));

    // Head block: rows 1..30 shown, 31 condensed away
    expect(html).toContain('<td>30</td><td>nodal</td><td>LOAD_DESC_30</td>');
    expect(html).not.toContain('LOAD_DESC_31');
    expect(html).toContain('... 65 more loads ...');

    // Tail rows carry their real positions (96..100), not a continued counter (32..36)
    expect(html).toContain('<td>96</td><td>nodal</td><td>LOAD_DESC_96</td>');
    expect(html).toContain('<td>100</td><td>nodal</td><td>LOAD_DESC_100</td>');
    expect(html).not.toContain('<td>32</td><td>nodal</td>');
  });

  it('numbers all rows sequentially when not condensed', () => {
    const loads = Array.from({ length: 5 }, (_, i) => ({
      type: 'nodal',
      description: `LOAD_DESC_${i + 1}`,
      caseLabel: 'D',
    }));
    const html = generateCalcReportHtml(baseData({ loads }));
    expect(html).toContain('<td>5</td><td>nodal</td><td>LOAD_DESC_5</td>');
    expect(html).not.toContain('more loads');
  });
});
