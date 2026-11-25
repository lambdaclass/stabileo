/**
 * The project's own combination rules: their notation, their expansion over the cases (one wind
 * or seismic case at a time, both senses on request), and the template file.
 */
import { describe, it, expect } from 'vitest';
import { ruleLabel, ruleToSpec, rulesFromTemplate, rulesToTemplate, specToRule, type CombinationRule } from '../combination-rules';
import { expandCombinations } from '../combination-cases';
import { generateCombinations } from '../../../codes/cirsoc101/combinations';

const cases = [
  { id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' },
  { id: 3, type: 'E', name: 'Sismo X' }, { id: 4, type: 'E', name: 'Sismo Y' },
];
const rule: CombinationRule = { id: 'r1', purpose: 'strength', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'E', factor: 1 }, { symbol: 'L', factor: 0.5 }] };

describe('project combination rules', () => {
  it('write their formula in the regulation notation', () => {
    expect(ruleLabel(rule)).toBe('1.2 D + 1.0 E + 0.5 L');
    expect(ruleLabel({ ...rule, terms: [{ symbol: 'D', factor: 0.9 }, { symbol: 'E', factor: -1 }] })).toBe('0.9 D − 1.0 E');
  });

  it('expand like the regulation: each seismic case alone, both senses when asked', () => {
    const one = expandCombinations([ruleToSpec(rule)], cases);
    expect(one).toHaveLength(2);
    for (const c of one) expect(c.factors.filter((f) => f.caseId === 3 || f.caseId === 4)).toHaveLength(1);
    const two = expandCombinations([ruleToSpec(rule)], cases, { bothSenses: { E: true } });
    expect(two).toHaveLength(4);
    expect(two.some((c) => c.factors.some((f) => f.caseId === 3 && f.factor === -1))).toBe(true);
  });

  it('start from CIRSOC 101 with the same terms', () => {
    const spec = generateCombinations({ present: { L: true, Lr: false, S: false, R: false, W: false, E: true, F: false, H: false } })[0]!;
    expect(ruleToSpec(specToRule(spec, 'r1')).label).toBe(spec.label);
  });

  it('round-trip through a template file, and refuse one that is not', () => {
    const back = rulesFromTemplate(rulesToTemplate([rule], 'Obra'))!;
    expect(back.name).toBe('Obra');
    expect(back.rules[0]!.terms).toEqual(rule.terms);
    expect(rulesFromTemplate('{"kind":"other","rules":[]}')).toBeNull();
    expect(rulesFromTemplate('not json')).toBeNull();
    const odd = rulesFromTemplate(JSON.stringify({ kind: 'stabileo.combinationRules', rules: [{ terms: [{ symbol: 'Q', factor: 1 }, { symbol: 'D', factor: 1.4 }] }] }));
    expect(odd).toBeNull();
  });
});

describe('ids for new rules', () => {
  it('never repeat one in use, after a deletion left a gap', async () => {
    const { freshRuleIds } = await import('../combination-rules');
    // r2 was deleted: the list is two long, and r3 is taken.
    const ids = freshRuleIds([{ id: 'r1' }, { id: 'r3' }], 3);
    expect(ids).toHaveLength(3);
    expect(new Set([...ids, 'r1', 'r3']).size).toBe(5);
  });
});

describe('service wind in project rules', () => {
  it('survives seeding and a template round trip', async () => {
    const { RULE_SYMBOLS } = await import('../combination-rules');
    expect(RULE_SYMBOLS).toContain('Wa');
    const rule: CombinationRule = { id: 'r1', purpose: 'service', terms: [{ symbol: 'D', factor: 1 }, { symbol: 'Wa', factor: 1 }] };
    const back = rulesFromTemplate(rulesToTemplate([rule], 'Obra'))!;
    expect(back.rules[0]!.terms).toEqual(rule.terms);
  });
});

it('#2535 a malformed term rejects a template instead of removing an action', () => {
  const template = (terms: unknown[]) => JSON.stringify({ kind: 'stabileo.combinationRules', rules: [{ terms }] });
  const dead = { symbol: 'D', factor: 1 };
  expect.soft(rulesFromTemplate(template([null]))).toBeNull();
  expect.soft(rulesFromTemplate(template([dead, null]))).toBeNull();
  expect(rulesFromTemplate(template([dead]))?.rules[0]?.terms).toEqual([dead]);
});

it.each([
  { symbol: 'L', factor: '2' },
  { symbol: 'L', factor: null },
  { symbol: 'L' },
  { factor: 2 },
  { symbol: 'S', factor: 2, snowBasis: 'physical' },
  { symbol: 'L', factor: 2, snowBasis: 'flatRoof' },
])('#2535 rejects the whole template with malformed term %j', live => {
  const doc = { kind: 'stabileo.combinationRules', rules: [{ terms: [{ symbol: 'D', factor: 1 }, live] }] };
  expect(rulesFromTemplate(JSON.stringify(doc))).toBeNull();
});

it('#2535 imported grouped snow selects its flat-roof basis', () => {
  const snowRule: CombinationRule = { id: 'snow', purpose: 'strength', terms: [
    { symbol: 'S', factor: 2, group: 'roof', snowBasis: 'flatRoof' },
  ] };
  const paired = [
    { id: 1, type: 'S', name: 'Physical snow', group: 'roof' },
    { id: 2, type: 'S', name: 'Flat-roof snow', group: 'roof', snowBasis: 'flatRoof' as const },
  ];
  const parsed = rulesFromTemplate(rulesToTemplate([snowRule], 'Roof'));
  expect.soft(parsed?.rules[0]?.terms).toEqual(snowRule.terms);
  expect(expandCombinations(parsed!.rules.map(ruleToSpec), paired)[0]?.factors).toEqual([{ caseId: 2, factor: 2 }]);
});
