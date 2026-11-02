import { describe, expect, it } from 'vitest';
import { governingCombos } from './governing-ties';

const perCombo = new Map([
  [1, { elementForces: [{ elementId: 7, myStart: 30, myEnd: -12 }] }],
  [2, { elementForces: [{ elementId: 7, myStart: -30, myEnd: 5 }] }],
  [3, { elementForces: [{ elementId: 7, myStart: 10, myEnd: 20 }] }],
]);

describe('the combinations recorded as governing', () => {
  it('every combination that ties, whichever the app named', () => {
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 1, value: 30 })).toEqual([1, 2]);
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 2, value: 30 })).toEqual([1, 2]);
  });
  it('NEGATIVE: a governing combination named wrongly, its value right, changes the record', () => {
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 3, value: 30 })).toEqual([1, 2, 3]);
  });
});
