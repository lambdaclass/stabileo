/**
 * Where the report goes: the tab opened in the click, a new one, or — when the pop-up blocker
 * refuses both — a downloaded file, said so to the caller.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openCalcReport, type CalcReportData } from '../calc-report';

const data = (projectName = 'Nave: 2') => ({
  config: { projectName, engineerName: '', companyName: '', date: '1 Jan 2026', notes: '' },
  is3D: false, analysisMode: '2D', provenance: { kind: 'single' }, hasDesignChecks: false,
  nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
}) as CalcReportData;

function stubBrowser(openReturns: unknown) {
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const open = vi.fn(() => openReturns);
  vi.stubGlobal('window', { open });
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn(), removeChild: vi.fn() } });
  return { anchor, open };
}

describe('openCalcReport', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fills the tab opened in the click', () => {
    const { anchor, open } = stubBrowser(null);
    const tab = { closed: false, location: { href: '' } } as unknown as Window;
    expect(openCalcReport(data(), tab)).toBe('tab');
    expect(tab.location.href).toMatch(/^blob:/);
    expect(open).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it('blocked, or its tab closed, and a new one refused: the report is downloaded and the caller told', () => {
    const { anchor, open } = stubBrowser(null);
    expect(openCalcReport(data(), null)).toBe('download');
    expect(open).toHaveBeenCalledTimes(1);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.href).toMatch(/^blob:/);
    expect(anchor.download).toBe('Nave_ 2.html');

    const closed = { closed: true, location: { href: '' } } as unknown as Window;
    expect(openCalcReport(data(''), closed)).toBe('download');
    expect(anchor.download).toBe('stabileo.html');
  });
});
