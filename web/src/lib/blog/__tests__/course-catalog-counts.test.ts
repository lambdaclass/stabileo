import { expect, it } from 'vitest';
import { GROUP_ORDER, methodsIn } from '../../engine/steps/methods';
import { findPost } from '..';

const course = findPost('learn-structural-analysis-step-by-step')!;
it.skip.each(Object.entries(course.i18n))('known wrong result: #2613 — %s publishes the registered method counts in catalog order', (_locale, body) => {
  const table = body.blocks.find(block => block.k === 'table')!;
  expect(table.rows.map(row => row[1])).toEqual(GROUP_ORDER.map(group => String(methodsIn(group).length)));
});
