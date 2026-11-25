/**
 * Combinations in symbols, onto cases: wind and seismic one direction at a time, the rest summed.
 */
import { describe, it, expect } from 'vitest';
import { expandCombinations, presentSymbols, symbolOfType } from '../combination-cases';
import { sumCombinationFactors } from '../../wasm-solver';
import { msg } from '../../../codes/message';
import { generateCombinations, type CombinationTerm, type LoadCombinationSpec } from '../../../codes/cirsoc101/combinations';
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

describe('reversing a wind case by sign', () => {
  const w = [
    { id: 1, type: 'D', name: 'D' },
    { id: 4, type: 'W', name: 'Lateral' },
    { id: 5, type: 'W', name: 'Roof suction +X' },
  ];
  const spec = [{ id: 'w', label: '1.2 D + 1.0 W', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'W', factor: 1 }] }] as never;

  it('is only done for the cases it is exact for', () => {
    // Reversing roof suction turns it into pressure the code never prescribes.
    const out = expandCombinations(spec, w, { bothSenses: { W: true }, reversible: (id) => id === 4 });
    const signs = out.map((c) => c.factors.find((f) => f.caseId !== 1)!).map((f) => `${f.caseId}:${Math.sign(f.factor)}`).sort();
    expect(signs).toEqual(['4:-1', '4:1', '5:1']);
  });
});

const floorTerm = { symbol: 'L', factor: 1 } as const;
const roofTerm = { symbol: 'Lr', factor: 1.5 } as const;
const patternCases = [
  { id: 1, type: 'L', name: 'Whole floor', alternatives: 'floor' },
  { id: 2, type: 'L', name: 'Partial floor', alternatives: 'floor', pattern: true },
  { id: 3, type: 'Lr', name: 'Whole roof', alternatives: 'roof' },
  { id: 4, type: 'Lr', name: 'Partial roof', alternatives: 'roof', pattern: true },
];

function rule(...terms: CombinationTerm[]): LoadCombinationSpec {
  return { id: 'pattern', label: 'Pattern selection', terms, refs: [], notes: [] };
}

function netFactors(combinations: ReturnType<typeof expandCombinations>) {
  return combinations.map(c => sumCombinationFactors(c.factors).filter(f => f.factor !== 0));
}

function patternIds(terms: CombinationTerm[], options?: { patternsInCompanions: boolean }) {
  return expandCombinations([rule(...terms)], patternCases, options)
    .map(c => [...new Set(c.factors.map(f => f.caseId))]);
}

it('#2569 split floor live selects the same patterns and factors as one term', () => {
  const single = rule({ ...floorTerm, factor: 2 }, roofTerm);
  const split = rule(floorTerm, floorTerm, roofTerm);
  expect(patternIds(single.terms)).toEqual([[1, 3], [2, 3]]);
  expect(patternIds(split.terms)).toEqual([[1, 3], [2, 3]]);
  expect(netFactors(expandCombinations([split], patternCases))).toEqual(netFactors(expandCombinations([single], patternCases)));
});

it('#2569 ranks the magnitude of the signed total and excludes canceled actions from the ranking', () => {
  const negative = rule({ ...floorTerm, factor: -4 }, { ...floorTerm, factor: 2 }, roofTerm);
  expect.soft(netFactors(expandCombinations([negative], patternCases))).toEqual(
    netFactors(expandCombinations([rule({ ...floorTerm, factor: -2 }, roofTerm)], patternCases)),
  );
  expect.soft(patternIds([{ ...floorTerm, factor: 4 }, { ...floorTerm, factor: -3 }, roofTerm]))
    .toEqual([[1, 3], [1, 4]]);
  const canceled = rule({ ...floorTerm, factor: 4 }, { ...floorTerm, factor: -4 }, roofTerm);
  const expected = netFactors(expandCombinations([rule(roofTerm)], patternCases));
  expect(netFactors(expandCombinations([canceled], patternCases))).toEqual(expected);
});

it('#2569 uses the current tie boundary after summing each action', () => {
  for (const [offset, expected] of [
    [-2e-9, [[1, 3], [1, 4]]],
    [-0.5e-9, [[1, 3], [2, 3], [1, 4]]],
    [0, [[1, 3], [2, 3], [1, 4]]],
    [0.5e-9, [[1, 3], [2, 3], [1, 4]]],
    [2e-9, [[1, 3], [2, 3]]],
  ] as const) {
    expect.soft(patternIds([floorTerm, { ...floorTerm, factor: 0.5 + offset }, roofTerm]), String(offset)).toEqual(expected);
  }
  expect(patternIds([floorTerm, { ...floorTerm, factor: 0.5 }, roofTerm], { patternsInCompanions: true }))
    .toEqual([[1, 3], [1, 4], [2, 3], [2, 4]]);
});

it('#2569 sums repeated named groups without mixing separate groups', () => {
  const grouped = patternCases.map(c => c.type === 'L' ? { ...c, group: 'floor' } : c);
  const partitioned = [...grouped, { id: 5, type: 'L', name: 'Other floor' }];
  const named = { ...floorTerm, group: 'floor' };
  const single = rule({ ...named, factor: 2 }, floorTerm, roofTerm);
  const split = rule(named, named, floorTerm, roofTerm);
  const expanded = expandCombinations([single], partitioned);
  expect(expanded.map(c => c.factors.map(f => f.caseId))).toEqual([[1, 5, 3], [2, 5, 3]]);
  expect.soft(netFactors(expandCombinations([split], partitioned))).toEqual(netFactors(expanded));
  expect(expandCombinations([rule(named, floorTerm, roofTerm)], partitioned)
    .map(c => c.factors.map(f => f.caseId))).toEqual([[1, 5, 3], [1, 5, 4]]);
  expect(netFactors(expandCombinations([rule({ ...named, factor: 4 }, { ...named, factor: -4 }, floorTerm, roofTerm)], partitioned)))
    .toEqual(netFactors(expandCombinations([rule({ ...named, factor: 0 }, floorTerm, roofTerm)], partitioned)));
});

it('#2569 combines explicit and legacy references to the same snow basis', () => {
  const flatRoof = { symbol: 'S', factor: 1, snowBasis: 'flatRoof' } as const;
  const physical = { symbol: 'S', factor: 1 } as const;
  const snowCases = [
    ...patternCases.slice(2),
    { id: 5, type: 'S', name: 'Whole physical snow', alternatives: 'snow' },
    { id: 6, type: 'S', name: 'Whole flat-roof snow', alternatives: 'snow', snowBasis: flatRoof.snowBasis },
    { id: 7, type: 'S', name: 'Partial flat-roof snow', alternatives: 'snow', snowBasis: flatRoof.snowBasis, pattern: true },
  ];
  const single = rule({ ...flatRoof, factor: 2 }, roofTerm);
  const split = { ...rule(flatRoof, physical, roofTerm), notes: [msg('loads.cirsoc101.note.snowAsFlatRoof')] };
  const expanded = expandCombinations([single], snowCases);
  expect(expanded.map(c => c.factors.map(f => f.caseId))).toEqual([[6, 3], [7, 3]]);
  expect.soft(netFactors(expandCombinations([split], snowCases))).toEqual(netFactors(expanded));
  expect(expandCombinations([rule(flatRoof, physical, roofTerm)], snowCases)
    .map(c => c.factors.map(f => f.caseId))).toEqual([[6, 3], [6, 4], [5, 3], [5, 4]]);
});

it('#2569 sums finite factors independent of term order and refuses overflow', () => {
  const large = { ...floorTerm, factor: Number.MAX_VALUE };
  const half = { ...floorTerm, factor: Number.MAX_VALUE / 2 };
  const negative = { ...large, factor: -large.factor };
  const expected = netFactors(expandCombinations([rule(large, roofTerm)], patternCases));
  expect(expected).toHaveLength(2);
  expect.soft(netFactors(expandCombinations([rule(half, half, roofTerm)], patternCases))).toEqual(expected);
  expect.soft(netFactors(expandCombinations([rule(large, large, negative, roofTerm)], patternCases))).toEqual(expected);
  expect.soft(netFactors(expandCombinations([rule(negative, large, large, roofTerm)], patternCases))).toEqual(expected);
  expect(() => expandCombinations([rule(large, large, roofTerm)], patternCases)).toThrow('combos.refused.factorTotal');
});
