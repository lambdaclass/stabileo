import { describe, it, expect } from 'vitest';
import { staticsVerdict } from '../statics-check';
import { staticsSectionHtml } from '../report/project-sections';
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

  it('the report ticks no case whose check left loads out, and names them', () => {
    const html = staticsSectionHtml({ cases: [row('D', 1e-9, []), row('S', 1e-9, ['surface3d'])] as never, combos: [] }, tr, 'Statics').join('');
    const cells = [...html.matchAll(/<td rowspan="2"[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
    expect(cells.filter((c) => c === '✓')).toHaveLength(1);
    expect(html).toContain('surface3d');
    expect(html).toContain(tr('pro.statics.partial'));
  });
});
