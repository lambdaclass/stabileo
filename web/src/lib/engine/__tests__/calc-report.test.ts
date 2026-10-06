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

describe('calc-report elements table hinges column', () => {
  it('renders per-axis release labels for each end, and "—" when neither end has a release', () => {
    const elements = [
      {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: true, t: false },
        releaseJ: { my: false, mz: false, t: false },
      },
      {
        id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false },
        releaseJ: { my: false, mz: false, t: false },
      },
      {
        id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1,
        releaseI: { my: true, mz: false, t: true },
        releaseJ: { my: false, mz: false, t: false },
      },
    ] as any;
    const html = generateCalcReportHtml(baseData({ elements }));

    // Element 1: released at I (Mz only), rigid at J
    expect(html).toContain('I: Mz · J: —');
    // Element 3: released at I (My+T), rigid at J
    expect(html).toContain('I: My+T · J: —');
    // Element 2: rigid at both ends collapses to a single em dash, not "I: — · J: —"
    expect(html).toContain('<td>2</td><td>frame</td><td>2</td><td>3</td><td>1</td><td>1</td><td>—</td></tr>');
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

describe('calc-report units', () => {
  const sec = { id: 1, name: 'R', a: 0.02, iy: 1e-4, iz: 2e-4, j: 0 } as any;
  const withDisp = {
    reactions: [{ nodeId: 1, rx: 0, rz: 9.80665, my: 0 }],
    displacements: [{ nodeId: 1, ux: 0.0025, uz: 0, ry: 0 }],
    elementForces: [],
  } as any;

  it('in SI gives sections in cm² and cm⁴, displacements in mm and reactions in kN', () => {
    const html = generateCalcReportHtml(baseData({ sections: [sec], results2D: withDisp }));
    expect(html).toContain('<th>A (cm²)</th><th>Iy (cm⁴)</th>');
    expect(html).toContain('<td class="num">200.0</td><td class="num">10000</td>');
    expect(html).toContain('<th>ux (mm)</th>');
    expect(html).toContain('<td class="num">2.500</td>');
    expect(html).toContain('<th>Rz (kN)</th>');
    expect(html).toContain('<td class="num">9.81</td>');
  });

  it('in MKS gives reactions in tf and displacements in cm, keeping the resolution', () => {
    const html = generateCalcReportHtml(baseData({ unitSystem: 'MKS', results2D: withDisp }));
    expect(html).toContain('<th>Rz (tf)</th>');
    expect(html).toContain('<td class="num">1.000</td>');
    expect(html).toContain('<th>ux (cm)</th>');
    expect(html).toContain('<td class="num">0.2500</td>');
    expect(html).not.toContain('(kN)');
    expect(html).not.toContain('(mm)');
  });

  it('in imperial gives sections in in² and in⁴, and displacements in inches', () => {
    const html = generateCalcReportHtml(baseData({ unitSystem: 'Imperial', sections: [sec], results2D: withDisp }));
    expect(html).toContain('<th>A (in²)</th><th>Iy (in⁴)</th>');
    expect(html).toContain('<th>Rz (kip)</th>');
    expect(html).toContain('<th>ux (in)</th>');
    expect(html).not.toContain('(m²)');
  });
});
