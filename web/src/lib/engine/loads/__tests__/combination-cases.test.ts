/**
 * Combinations in symbols, onto cases: wind and seismic one direction at a time, the rest summed.
 */
import { describe, it, expect } from 'vitest';
import { expandCombinations, presentSymbols, symbolOfType } from '../combination-cases';
import { generateCombinations } from '../../../codes/cirsoc101/combinations';
import { generateServiceCombinations } from '../../../codes/cirsoc101/service-combinations';

const cases = [
  { id: 1, type: 'D', name: 'Peso propio' },
  { id: 2, type: 'D', name: 'Solados' },
  { id: 3, type: 'L', name: 'Sobrecarga' },
  { id: 4, type: 'W', name: 'Viento X' },
  { id: 5, type: 'W', name: 'Viento Y' },
  { id: 6, type: 'LR', name: 'Cubierta' },
];

describe('expanding combinations over the model’s cases', () => {
  it('reads case types case-insensitively', () => {
    expect(symbolOfType('LR')).toBe('Lr');
    expect(symbolOfType('w')).toBe('W');
    expect(symbolOfType('Q')).toBeNull();
    expect(presentSymbols(cases)).toMatchObject({ L: true, Lr: true, W: true, E: false, S: false });
  });

  it('never puts two wind directions in one combination', () => {
    const out = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    for (const c of out) {
      const winds = c.factors.filter((f) => f.caseId === 4 || f.caseId === 5);
      expect(winds.length, c.name).toBeLessThanOrEqual(1);
    }
    // 0,9 D + 1,0 W appears once per direction, named for it.
    const six = out.filter((c) => c.specId.startsWith('6'));
    expect(six.map((c) => c.name).sort()).toEqual(['0.9 D + 1.0 W (Viento X)', '0.9 D + 1.0 W (Viento Y)']);
  });

  it('sums every case of a gravity symbol', () => {
    const [one] = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    expect(one.name).toBe('1.4 D');
    expect(one.factors).toEqual([{ caseId: 1, factor: 1.4 }, { caseId: 2, factor: 1.4 }]);
  });

  it('carries wind at 1,0 in the strength set, as CIRSOC 101-2025 prints it', () => {
    const out = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    const windFactors = new Set(out.flatMap((c) => c.factors.filter((f) => f.caseId === 4).map((f) => f.factor)));
    expect([...windFactors].every((f) => f === 1 || f === 0.5)).toBe(true);
  });

  it('drops a combination whose action the model has no case for', () => {
    const noWind = cases.filter((c) => c.type !== 'W');
    const specs = generateCombinations({ present: { ...presentSymbols(noWind), W: true } });
    const out = expandCombinations(specs, noWind);
    expect(out.some((c) => c.name.includes('W'))).toBe(false);
  });
});

describe('the service set', () => {
  it('is the characteristic combination for gravity, and CIRSOC 102-2025 B.4.2 for wind', () => {
    const specs = generateServiceCombinations({ present: presentSymbols(cases) });
    expect(specs.map((s) => s.label)).toEqual([
      '1.0 D', '1.0 D + 1.0 L', '1.0 D + 1.0 Lr', '1.0 D + 1.0 L + 1.0 Lr',
      // B.4.2: 0,6 D + 0,6 W and D + 0,75 L + 0,45 W + 0,75 (Lr ó S ó R). No Wa case, so no D + Wa.
      '0.6 D + 0.6 W', '1.0 D + 0.75 L + 0.45 W + 0.75 Lr',
    ]);
    expect(specs.every((s) => s.purpose === 'service')).toBe(true);
    expect(specs.filter((s) => s.terms.some((t) => t.symbol === 'W')).every((s) => s.refs.some((r) => r.clause === 'B.4.2'))).toBe(true);
    const out = expandCombinations(specs, cases);
    expect(out.filter((c) => c.purpose === 'service')).toHaveLength(out.length);
    // The two wind ones, per direction.
    expect(out).toHaveLength(4 + 2 * 2);
  });

  it('has no seismic service combination', () => {
    const specs = generateServiceCombinations({ present: { ...presentSymbols(cases), E: true } });
    expect(specs.some((s) => s.terms.some((t) => t.symbol === 'E'))).toBe(false);
  });
});

describe('both senses', () => {
  it('with both senses, each wind case enters once with each sign, and nothing else changes', () => {
    const specs = generateCombinations({ present: presentSymbols(cases) });
    const one = expandCombinations(specs, cases);
    const two = expandCombinations(specs, cases, { bothSenses: { W: true } });
    const withWind = one.filter((c) => c.factors.some((f) => f.caseId === 4 || f.caseId === 5));
    expect(two.length).toBe(one.length + withWind.length);
    for (const c of withWind) {
      const w = c.factors.find((f) => f.caseId === 4 || f.caseId === 5)!;
      const mirror = two.find((d) => d.specId === c.specId
        && d.factors.some((f) => f.caseId === w.caseId && f.factor === -w.factor));
      expect(mirror, c.name).toBeDefined();
      expect(mirror!.factors.filter((f) => f.caseId !== w.caseId)).toEqual(c.factors.filter((f) => f.caseId !== w.caseId));
      expect(mirror!.name).toContain('−');
    }
    // A combination without wind is not doubled.
    expect(two.filter((c) => !c.factors.some((f) => f.caseId === 4 || f.caseId === 5)).length)
      .toBe(one.length - withWind.length);
  });
});

describe('cases that are alternatives of one another', () => {
  it('snow patterns of one roof enter one at a time, a separate snow case always', () => {
    // Balanced and the two unbalanced patterns are the same snow on the same roof, three ways.
    const snow = [
      { id: 1, type: 'D', name: 'D' },
      { id: 7, type: 'S', name: 'Nieve balanceada', alternatives: 'snow-roof' },
      { id: 8, type: 'S', name: 'Nieve desbalanceada +X', alternatives: 'snow-roof' },
      { id: 9, type: 'S', name: 'Nieve desbalanceada −X', alternatives: 'snow-roof' },
      { id: 10, type: 'S', name: 'Nieve sobre la marquesina' },
    ];
    const out = expandCombinations([{ id: 's', label: '1.2 D + 1.6 S', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'S', factor: 1.6 }] }] as never, snow);
    expect(out).toHaveLength(3);
    for (const c of out) {
      const patterns = c.factors.filter((f) => [7, 8, 9].includes(f.caseId));
      expect(patterns, c.name).toHaveLength(1);
      expect(c.factors.some((f) => f.caseId === 10), c.name).toBe(true);
    }
    expect(new Set(out.flatMap((c) => c.factors.map((f) => f.caseId)).filter((id) => id >= 7 && id <= 9))).toEqual(new Set([7, 8, 9]));
  });

  it('a rule with wind and earthquake takes one direction of each, never both directions of either', () => {
    const both = [
      { id: 1, type: 'D', name: 'D' },
      { id: 4, type: 'W', name: 'W X' }, { id: 5, type: 'W', name: 'W Y' },
      { id: 11, type: 'E', name: 'E X' }, { id: 12, type: 'E', name: 'E Y' },
    ];
    const out = expandCombinations([{ id: 'r', label: '1.2 D + 1.0 W + 1.0 E', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'W', factor: 1 }, { symbol: 'E', factor: 1 }] }] as never, both);
    expect(out).toHaveLength(4);
    for (const c of out) {
      expect(c.factors.filter((f) => f.caseId === 4 || f.caseId === 5), c.name).toHaveLength(1);
      expect(c.factors.filter((f) => f.caseId === 11 || f.caseId === 12), c.name).toHaveLength(1);
    }
  });
});
