/**
 * Combinations in symbols, onto cases: wind and seismic one direction at a time, the rest summed.
 */
import { describe, it, expect } from 'vitest';
import { expandCombinations, presentSymbols, symbolOfType, withWindBasis } from '../combination-cases';
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
  it('is the characteristic combinations, every factor 1,0, marked as service', () => {
    const specs = generateServiceCombinations({ present: presentSymbols(cases) });
    expect(specs.map((s) => s.label)).toEqual([
      '1.0 D', '1.0 D + 1.0 L', '1.0 D + 1.0 Lr', '1.0 D + 1.0 L + 1.0 Lr', '1.0 D + 1.0 W', '1.0 D + 1.0 L + 1.0 W',
    ]);
    expect(specs.every((s) => s.purpose === 'service' && s.terms.every((t) => t.factor === 1))).toBe(true);
    const out = expandCombinations(specs, cases);
    expect(out.filter((c) => c.purpose === 'service')).toHaveLength(out.length);
    // D + W and D + L + W, per direction.
    expect(out).toHaveLength(4 + 2 * 2);
  });

  it('has no seismic service combination', () => {
    const specs = generateServiceCombinations({ present: { ...presentSymbols(cases), E: true } });
    expect(specs.some((s) => s.terms.some((t) => t.symbol === 'E'))).toBe(false);
  });
});

describe('the wind basis', () => {
  it('service-level wind reads CIRSOC 101-2025 with W at 1,6 and 0,8, the 2005 factors', () => {
    const specs = withWindBasis(generateCombinations({ present: presentSymbols(cases) }), 'service');
    const wFactors = new Set(specs.flatMap((s) => s.terms.filter((t) => t.symbol === 'W').map((t) => t.factor)));
    expect([...wFactors].sort()).toEqual([0.8, 1.6]);
    expect(specs.some((s) => s.label === '0.9 D + 1.6 W')).toBe(true);
    // Nothing else moves.
    expect(specs.find((s) => s.id === '1')!.label).toBe('1.4 D');
  });

  it('CIRSOC 102-2025 wind keeps the printed factors, and service combinations never scale', () => {
    const base = generateCombinations({ present: presentSymbols(cases) });
    expect(withWindBasis(base, 'strength').map((s) => s.label)).toEqual(base.map((s) => s.label));
    const svc = generateServiceCombinations({ present: presentSymbols(cases) });
    expect(withWindBasis(svc, 'service').map((s) => s.label)).toEqual(svc.map((s) => s.label));
  });
});
