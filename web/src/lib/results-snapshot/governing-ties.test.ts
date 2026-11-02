import { describe, expect, it } from 'vitest';
import { governingCombos } from './governing-ties';

const ends = (myStart: number, myEnd: number) => ({
  elementId: 7, length: 4, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: (myEnd - myStart) / 4, vzEnd: 0, mxStart: 0, mxEnd: 0,
  myStart, myEnd, mzStart: 0, mzEnd: 0, qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [], qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [],
});
const midspan = { ...ends(0, 0), vzStart: 20, qZI: -10, qZJ: -10, distributedLoadsZ: [{ qI: -10, qJ: -10, a: 0, b: 4 }] };

const perCombo = new Map([
  [1, { elementForces: [ends(30, -12)] }],
  [2, { elementForces: [ends(-30, 5)] }],
  [3, { elementForces: [ends(10, 20)] }],
  [4, { elementForces: [midspan] }],
]);

describe('the combinations recorded as governing', () => {
  it('every combination that ties, whichever the app named', () => {
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 1, value: 30 })).toEqual([1, 2]);
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 2, value: 30 })).toEqual([1, 2]);
  });
  it('a moment reached inside the member ties by that interior value', () => {
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 4, value: 20 })).toEqual([3, 4]);
  });
  it('NEGATIVE: a governing combination named wrongly, its value right, changes the record', () => {
    expect(governingCombos(perCombo, 7, 'momentY', { comboId: 3, value: 30 })).toEqual([1, 2, 3]);
  });
});
