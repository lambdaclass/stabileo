import { expect } from 'vitest';
import type { LoadPlan } from '../load-plan';

export function physicalSnowCases(plan: Pick<LoadPlan, 'cases'>) {
  const cases = plan.cases.filter(c => c.type === 'S');
  const companions = cases.filter(c => c.snowBasis === 'flatRoof');
  expect(companions).toHaveLength(1);
  expect(companions[0]!.nameKey).toBe('snow.case.flatRoof');
  expect(companions[0]!.pattern).toBeUndefined();
  expect(companions[0]!.alternatives).toBe('snow-roof');
  return cases.filter(c => !c.snowBasis);
}
