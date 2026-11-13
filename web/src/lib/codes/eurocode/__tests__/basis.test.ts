/**
 * EN 1990 combinations, recommended values (Table A1.1, Table A1.2(B), ξ = 0,85) and the UK
 * National Annex (Table NA.A1.1, Table NA.A1.2(B), ξ = 0,925), by hand from those tables.
 */
import { describe, expect, it } from 'vitest';
import type { CombinationInputs, LoadCombinationSpec } from '../../cirsoc101/combinations';
import { psiSet, serviceCombinations, strengthCombinations } from '../basis';

const ci = (over: Partial<CombinationInputs['present']> = {}): CombinationInputs => ({
  present: { L: true, Lr: false, S: true, R: false, W: true, E: false, F: false, H: false, ...over },
});
const f = (c: LoadCombinationSpec, s: string) => c.terms.find((t) => t.symbol === s)?.factor ?? 0;
const find = (list: LoadCombinationSpec[], want: Record<string, number>) => list.find((c) =>
  c.terms.length === Object.keys(want).length && Object.entries(want).every(([s, v]) => Math.abs(f(c, s) - v) < 1e-9));

describe('EN 1990 recommended values, G + Q (category A) + W + S', () => {
  it('ψ of Table A1.1', () => {
    const p = psiSet('eurocode', new Set(['A']));
    expect(p.L).toEqual([0.7, 0.5, 0.3]);
    expect(p.S).toEqual([0.5, 0.2, 0]);
    expect(p.W).toEqual([0.6, 0.2, 0]);
    expect(psiSet('eurocode', new Set(['A']), 1200).S).toEqual([0.7, 0.5, 0.2]);
    expect(psiSet('eurocode', new Set(['E'])).L).toEqual([1.0, 0.9, 0.8]);
  });

  it('6.10a takes every variable action at 1,5·ψ0 under 1,35 G', () => {
    const { combinations } = strengthCombinations('eurocode', ci(), { categories: new Set(['A']) });
    expect(find(combinations, { D: 1.35, L: 1.05, S: 0.75, W: 0.9 })).toBeDefined();
    expect(find(combinations, { D: 1.35 })).toBeDefined();
  });

  it('6.10b: ξ·1,35 = 1,1475 G with each leading action at 1,5, and γG,inf = 1,0', () => {
    const { combinations } = strengthCombinations('eurocode', ci(), { categories: new Set(['A']) });
    expect(find(combinations, { D: 1.1475, L: 1.5, S: 0.75, W: 0.9 })).toBeDefined();
    expect(find(combinations, { D: 1.1475, W: 1.5, L: 1.05, S: 0.75 })).toBeDefined();
    expect(find(combinations, { D: 1.1475, S: 1.5, L: 1.05, W: 0.9 })).toBeDefined();
    expect(find(combinations, { D: 1.0, W: 1.5 })).toBeDefined();
    expect(combinations.every((c) => !(f(c, 'W') && f(c, 'E')))).toBe(true);
  });

  it('a roof imposed load (H) is never with snow or wind, and ψ0 = 0 leaves it out as companion', () => {
    const { combinations } = strengthCombinations('eurocode', ci({ Lr: true }));
    for (const c of combinations) if (f(c, 'Lr')) expect(f(c, 'S') + f(c, 'W')).toBe(0);
    expect(combinations.filter((c) => f(c, 'Lr')).every((c) => f(c, 'Lr') === 1.5)).toBe(true);
  });

  it('6.12b: G + AEd + ψ2·Q, ψ2 = 0,3 for category A, snow ψ2 = 0 below 1000 m', () => {
    const { combinations } = strengthCombinations('eurocode', ci({ E: true }), { categories: new Set(['A']) });
    const seismic = combinations.filter((c) => f(c, 'E'));
    expect(seismic.map((c) => c.label).sort()).toEqual(['1.0 D + 1.0 E', '1.0 D + 1.0 E + 0.3 L']);
  });

  it('service: characteristic 6.14b, frequent 6.15b, quasi-permanent 6.16b', () => {
    const s = serviceCombinations('eurocode', ci(), { categories: new Set(['B']) });
    expect(find(s, { D: 1, L: 1, S: 0.5, W: 0.6 })).toBeDefined();
    expect(find(s, { D: 1, L: 0.5 })).toBeDefined();
    expect(find(s, { D: 1, W: 0.2, L: 0.3 })).toBeDefined();
    expect(find(s, { D: 1, L: 0.3 })).toBeDefined();
    expect(s.every((c) => c.purpose === 'service')).toBe(true);
  });
});

describe('UK National Annex', () => {
  it('ξ = 0,925 and wind ψ0 = 0,5 (Table NA.A1.1); roofs ψ0 = 0,7', () => {
    const { combinations } = strengthCombinations('uk', ci(), { categories: new Set(['B']) });
    expect(find(combinations, { D: 0.925 * 1.35, L: 1.5, S: 0.75, W: 0.75 })).toBeDefined();
    expect(find(combinations, { D: 1.35, L: 1.05, S: 0.75, W: 0.75 })).toBeDefined();
    expect(psiSet('uk', new Set(['B'])).Lr).toEqual([0.7, 0, 0]);
    const withRoof = strengthCombinations('uk', ci({ Lr: true, S: false, W: false })).combinations;
    expect(find(withRoof, { D: 0.925 * 1.35, L: 1.5, Lr: 1.05 })).toBeDefined();
  });

  it('without a plan context it says the categories were assumed', () => {
    const r = strengthCombinations('uk', ci());
    expect(r.notes.some((n) => n.key === 'loads.ec.combo.noContext')).toBe(true);
  });
});
