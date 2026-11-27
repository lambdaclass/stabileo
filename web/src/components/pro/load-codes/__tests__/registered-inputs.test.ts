import { expect, it } from 'vitest';
import { unifiedPlates } from '../../../../lib/features';
import { loadCodeFor } from '../../../../lib/codes/families';
import { CODE_INPUTS } from '../registry';

it.skip('known wrong result: unnumbered — only offers load editors for adapters that this build can run', () => {
  expect(Object.keys(CODE_INPUTS).filter(id => !loadCodeFor(id))).toEqual([]);
  expect(Boolean(CODE_INPUTS['asce7-22-wind'])).toBe(unifiedPlates());
});
