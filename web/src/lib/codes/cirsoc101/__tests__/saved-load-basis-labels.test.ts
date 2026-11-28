import { expect, it } from 'vitest';
import { combinationLabel } from '../combinations';
import { loadCodeFor } from '../../families';

it('identifies the group of a saved load term wherever its combination is printed', () => {
  expect(combinationLabel([{ symbol: 'L', factor: 1, group: 'A' }, { symbol: 'L', factor: 1, group: 'B' }])).toBe('1.0 L(A) + 1.0 L(B)');
  expect(combinationLabel([{ symbol: 'L', factor: 1 }])).toBe('1.0 L');
});

it('identifies the published clauses for partitions, reduction and partial loading', () => {
  expect(loadCodeFor('cirsoc101-2025-loads')?.sections).toMatchObject({ partition: '§4.3.2', reduction: '§4.7.2', patterns: '§4.3.3' });
});
