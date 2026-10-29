import { expect, it } from 'vitest';
import { evidence } from '../evidence';

it('counts only published comparisons as paper checks', () => {
  expect(evidence.map(({ category, total, passed }) => ({ category, total, passed }))).toEqual([
    { category: 'paper', total: 7, passed: 7 },
    { category: 'independent', total: 22, passed: 22 },
  ]);
  expect(evidence[0].checks.every((check) => /^(Supplemental|Fig\.|Eq\.|foam:)/.test(check.name))).toBe(true);
});
