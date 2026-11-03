import { describe, it, expect } from 'vitest';
import { staticsVerdict, residualLabel } from '../statics-check';
import { staticsSectionHtml } from '../report/project-sections';
import { postAnalysisLines } from '../post-analysis';
import en from '../../i18n/locales/en';

const tr = (k: string, p: Record<string, string | number> = {}) => ((en as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p[x] ?? `{${x}}`));
const zero = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
const row = (caseName: string, worstRelative: number, uncovered: string[]) => ({
  caseId: 1, caseName, applied: { ...zero, fz: -10 }, reactions: { ...zero, fz: 10 }, difference: zero, worstRelative, uncovered, selfWeightIncluded: false,
});

describe('what the statics check can say about a case', () => {
  it('balances only when every load is in the sum', () => {
    expect(staticsVerdict(row('D', 1e-9, []))).toBe('balances');
    expect(staticsVerdict(row('S', 1e-9, ['surface3d']))).toBe('partial');
    expect(staticsVerdict(row('W', 0.02, ['surface3d']))).toBe('unbalanced');
    expect(staticsVerdict(row('W', 0.02, []))).toBe('unbalanced');
  });

  it('a residual that is not a number never balances', () => {
    for (const r of [NaN, Infinity, -Infinity]) expect(staticsVerdict(row('N', r, [])), String(r)).toBe('unbalanced');
    const html = staticsSectionHtml({ cases: [row('N', NaN, [])] as never, combos: [] }, tr, 'Statics').join('');
    expect(html).not.toContain('✓');
    const lines = postAnalysisLines({ diagnostics: [], statics: [{ caseName: 'N', worstRelative: NaN, uncovered: [] }], pdelta: null, mechanism: null, design: null }, tr);
    expect(lines.map((l) => l.severity)).toEqual(['error']);
  });

  it('a residual that is not a number is said in words, never printed as NaN or Infinity', () => {
    for (const r of [NaN, Infinity, -Infinity]) {
      const html = staticsSectionHtml({ cases: [row('N', r, [])] as never, combos: [] }, tr, 'Statics').join('');
      expect(html, String(r)).not.toMatch(/NaN|Infinity/);
      expect(html).toContain(tr('pro.statics.notComputable'));
      const [line] = postAnalysisLines({ diagnostics: [], statics: [{ caseName: 'N', worstRelative: r, uncovered: [] }], pdelta: null, mechanism: null, design: null }, tr);
      expect(line!.text, String(r)).not.toMatch(/NaN|Infinity|\{/);
      expect(line!.text).toBe(tr('post.unbalancedNotComputable', { name: 'N' }));
      expect(residualLabel(r, 'x')).toBe('x');
    }
    expect(residualLabel(0, 'x')).toBe('0');
    expect(residualLabel(2e-6, 'x')).toBe('2.0e-6');
    expect(residualLabel(0.0123, 'x')).toBe('1.23 %');
  });

  it('the report ticks no case whose check left loads out, and names them', () => {
    const html = staticsSectionHtml({ cases: [row('D', 1e-9, []), row('S', 1e-9, ['surface3d'])] as never, combos: [] }, tr, 'Statics').join('');
    const cells = [...html.matchAll(/<td rowspan="2"[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
    expect(cells.filter((c) => c === '✓')).toHaveLength(1);
    expect(html).toContain('surface3d');
    expect(html).toContain(tr('pro.statics.partial'));
  });
});
