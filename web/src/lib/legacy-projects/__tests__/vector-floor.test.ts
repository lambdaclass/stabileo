/** Old project files' results comparison (#718): the snapshot gate's rule plus a round-off zero for reaction forces. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues } from '../../../../scripts/results-snapshot/compare.mjs';
import { compareLegacy, familyOf, VECTOR_ATOL } from '../vector-floor';

const truss = {
  'base.reactions[n1].rx': 5.684341886e-14, 'base.reactions[n1].rz': 35, 'base.reactions[n5].rx': 0, 'base.reactions[n5].rz': 35,
  'base.reactions[n1].my': 0, 'base.elementForces[e1].nStart': 35, 'base.elementForces[e1].vStart': 0, 'base.elementForces[e1].mStart': 0,
  'base.displacements[n2].ux': 0, 'base.displacements[n2].uz': -0.012, 'base.quadStresses[e9].tauXy': 0, 'base.quadStresses[e9].sigmaXx': 100,
};

describe('a reaction force component statics makes zero', () => {
  it('v0.2.0\'s round-off, 25 % and 54 % of its own peak, is the same zero', () => {
    expect(VECTOR_ATOL).toBe(1e-12);
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n1].rx': 7.105427358e-14 }).differs).toBe(false);
    expect(compareLegacy({ ...truss, 'base.reactions[n1].rx': -9.237055565e-14 }, { ...truss, 'base.reactions[n1].rx': -4.263256415e-14 }).differs).toBe(false);
    expect(compareValues(truss, { ...truss, 'base.reactions[n1].rx': 7.105427358e-14 }).differs).toBe(true);
  });
  it('NEGATIVE: a value that leaves zero is a change, however small beside its vector', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n1].rx': 4e-11 }).changed.map((c) => c.path)).toEqual(['base.reactions[n1].rx']);
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n1].rx': 35e-6 }).differs).toBe(true);
  });
  it('NEGATIVE: never takes the floor from another node\'s reaction', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n5].rx': 2e-14 }).differs).toBe(false);
    const lone = { 'base.reactions[n1].rz': 35, 'base.reactions[n7].rx': 0 };
    expect(compareLegacy(lone, { ...lone, 'base.reactions[n7].rx': 1e-14 }).differs).toBe(true);
  });
});

describe('NEGATIVE: every other quantity keeps the gate\'s rule', () => {
  for (const [path, value] of [
    ['base.elementForces[e1].vStart', 1e-14],
    ['base.elementForces[e1].mStart', 1e-14],
    ['base.reactions[n1].my', 1e-14],
    ['base.displacements[n2].ux', 1e-18],
    ['base.quadStresses[e9].tauXy', 1e-14],
  ] as const) {
    it(`${path}: round-off out of zero is a change`, () => {
      expect(compareLegacy(truss, { ...truss, [path]: value }).changed.map((c) => c.path)).toEqual([path]);
    });
  }
  it('removed and newly produced values still differ', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n9].rz': 1 })).toMatchObject({ differs: true, added: ['base.reactions[n9].rz'] });
    const { 'base.reactions[n5].rz': _, ...less } = truss;
    expect(compareLegacy(truss, less)).toMatchObject({ differs: true, removed: ['base.reactions[n5].rz'] });
  });
  it('only reaction forces have a vector', () => {
    expect(familyOf('case[3].reactions[n1].fx')).toBe('case[3].reactions[n1].<force>');
    expect(familyOf('base.reactions[n2].rz')).toBe('base.reactions[n2].<force>');
    expect(familyOf('base.reactions[n1].my')).toBeNull();
    expect(familyOf('base.elementForces[e4].vzEnd')).toBeNull();
    expect(familyOf('base.displacements[n1].rz')).toBeNull();
    expect(familyOf('base.quadStresses[e1].sigmaXx')).toBeNull();
  });
});
