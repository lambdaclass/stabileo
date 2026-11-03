import { describe, it, expect } from 'vitest';
import { postAnalysisLines, partLines, postAnalysisRows, postAnalysisHtml, POST_ANALYSIS_UNBALANCED } from '../post-analysis';
import en from '../../i18n/locales/en';

const tr = (k: string, p: Record<string, string | number> = {}) => ((en as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p[x] ?? `{${x}}`));
const none = { diagnostics: [], statics: null, pdelta: null, mechanism: null, design: null };

describe('the report after the analysis', () => {
  it('files every finding under the model, as the screen lists them, naming the source of the solver\'s', () => {
    const lines = postAnalysisLines({ ...none, diagnostics: [
      { severity: 'warning', code: 'A', message: 'm1', source: 'model', elementIds: [3] },
      { severity: 'error', code: 'B', message: 'm2', source: 'solver', nodeIds: [7] },
    ] as never }, tr);
    expect(partLines(lines, 'analysis')).toEqual([]);
    const model = partLines(lines, 'model');
    expect(model.map((l) => [l.severity, l.selection])).toEqual([['error', { nodes: [7], elements: [], shells: [] }], ['warning', { nodes: [], elements: [3], shells: [] }]]);
    expect(model[0]!.detail).toBe('Solver');
    expect(model[1]!.detail).toBeUndefined();
    expect(postAnalysisRows(lines, tr).map((r) => r[0])).toEqual(['Model', 'Model']);
  });

  it('says which cases do not balance, how much, and that the rest do', () => {
    const off = postAnalysisLines({ ...none, statics: [{ caseName: 'D', worstRelative: 2e-7, uncovered: [] }, { caseName: 'W', worstRelative: 0.02, uncovered: ['thermal'] }] }, tr);
    expect(off).toHaveLength(2);
    expect(off[0]).toMatchObject({ severity: 'error', part: 'analysis' });
    expect(off[0]!.text).toContain('W');
    expect(off[0]!.detail).toContain('thermal');
    expect(off[1]).toMatchObject({ severity: 'ok', text: expect.stringContaining('in 1 case:') });
    expect(postAnalysisLines({ ...none, statics: [{ caseName: 'W', worstRelative: POST_ANALYSIS_UNBALANCED / 10, uncovered: [] }] }, tr)[0]!.severity).toBe('warning');
    const ok = postAnalysisLines({ ...none, statics: [{ caseName: 'D', worstRelative: 1e-9, uncovered: [] }, { caseName: 'L', worstRelative: 3e-9, uncovered: [] }] }, tr);
    expect(ok).toEqual([{ part: 'analysis', severity: 'ok', text: expect.stringContaining('2 cases') }]);
  });

  it('never says a case balances when its check left loads out of the sum', () => {
    const partial = postAnalysisLines({ ...none, statics: [{ caseName: 'S', worstRelative: 1e-9, uncovered: ['surface3d'] }] }, tr);
    expect(partial.filter((l) => l.severity === 'ok')).toEqual([]);
    expect(partial).toEqual([{ part: 'analysis', severity: 'warning', text: expect.stringContaining('S'), detail: expect.stringContaining('surface3d') }]);
    const mixed = postAnalysisLines({ ...none, statics: [{ caseName: 'D', worstRelative: 1e-9, uncovered: [] }, { caseName: 'S', worstRelative: 2e-9, uncovered: ['nodal'] }] }, tr);
    expect(mixed.find((l) => l.severity === 'ok')!.text).toContain('in 1 case:');
    expect(mixed.find((l) => l.severity === 'warning')).toMatchObject({ text: expect.stringContaining('S'), detail: expect.stringContaining('nodal') });
  });

  it('reads the P-Delta iteration and a mechanism', () => {
    expect(postAnalysisLines({ ...none, pdelta: { converged: false, iterations: 20, isStable: true, b2Factor: 1.4 } }, tr)[0]).toMatchObject({ severity: 'warning', text: expect.stringContaining('did not converge') });
    expect(postAnalysisLines({ ...none, pdelta: { converged: true, iterations: 3, isStable: false, b2Factor: 9 } }, tr)[0]!.severity).toBe('error');
    const m = postAnalysisLines({ ...none, mechanism: { mechanismModes: 2, mechanismNodes: [1, 2], unconstrainedDofs: [{ nodeId: 2 }, { nodeId: 5 }] } }, tr);
    expect(m[0]).toMatchObject({ severity: 'error', selection: { nodes: [1, 2, 5] } });
  });

  it('lists the members the design does not approve, or says they all verify', () => {
    const d = postAnalysisLines({ ...none, design: { total: 4, members: [{ elementId: 9, status: 'fail', reasons: ['r'] }, { elementId: 2, status: 'provisional', reasons: [] }] } }, tr);
    expect(partLines(d, 'design').map((l) => [l.severity, l.selection?.elements])).toEqual([['error', [9]], ['warning', [2]]]);
    expect(postAnalysisLines({ ...none, design: { total: 4, members: [] } }, tr)[0]).toMatchObject({ severity: 'ok', part: 'design' });
  });

  it('exports every line, as rows and as a document', () => {
    const lines = postAnalysisLines({ ...none, statics: [{ caseName: 'W', worstRelative: 0.02, uncovered: [] }], design: { total: 1, members: [{ elementId: 9, status: 'fail', reasons: [] }] } }, tr);
    const rows = postAnalysisRows(lines, tr);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['Design', 'Error', expect.stringContaining('9'), '', 'E9']);
    const html = postAnalysisHtml(lines, tr, 'T', 's');
    expect(html).toContain('<h2>Analysis (1)</h2>');
    expect(html).toContain('<h2>Design (1)</h2>');
  });
});
