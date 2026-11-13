import { expect, it } from 'vitest';
import { conditionHolds } from '../applicability';
import entry from '../result-changes/staged-constrained-determinacy.json';

it('registers constrained construction histories without claiming ordinary static results', () => {
  for (const dimension of ['plane2D', 'space3D']) {
    expect(conditionHolds(entry.when, new Set([dimension, 'constraints', 'stagedConstruction']))).toBe(true);
    expect(conditionHolds(entry.when, new Set([dimension, 'constraints']))).toBe(false);
    expect(conditionHolds(entry.when, new Set([dimension, 'stagedConstruction']))).toBe(false);
  }
  expect(entry.quantities).toEqual(['stages', 'finalResults']);
});
