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
    // An unknown symbol is dropped, not guessed.
    const odd = rulesFromTemplate(JSON.stringify({ kind: 'stabileo.combinationRules', rules: [{ terms: [{ symbol: 'Q', factor: 1 }, { symbol: 'D', factor: 1.4 }] }] }))!;
    expect(odd.rules[0]!.terms).toEqual([{ symbol: 'D', factor: 1.4 }]);
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
