import { expect, it } from 'vitest';
import expected from '../../../../../docs/results-changes/2096-complete-reference.json';
import { completeReferenceAnswers } from './helpers/issue-2096-reference';

it('complete inputs preserve the exact main answers for every dispatcher family, EC2 design and direct/prepared CIRSOC', () => {
  expect(expected.foreign).toHaveLength(5);
  for (const run of expected.foreign) expect(run.rows[0]!.status).toBe('checked');
  expect(completeReferenceAnswers()).toEqual(expected);
});
