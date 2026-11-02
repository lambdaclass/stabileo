/** Old project files' results comparison (#718): the snapshot gate's rule plus a vector floor. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, mergeValues } from '../../../../scripts/results-snapshot/compare.mjs';
import { compareLegacy, familyOf, VECTOR_ATOL } from '../vector-floor';

describe('a component statics makes zero, against the size of its vector', () => {
  const truss = {
    'base.reactions[n1].rx': 5.684341886e-14, 'base.reactions[n1].rz': 35, 'base.reactions[n5].rx': 0, 'base.reactions[n5].rz': 35,
    'base.reactions[n1].my': 0, 'base.elementForces[e1].nStart': 35, 'base.elementForces[e1].vStart': 2e-15, 'base.elementForces[e1].mStart': 0,
  };
  it('takes round-off in it as the same result, though it is 25 % of its own peak', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n1].rx': 7.105427358e-14, 'base.elementForces[e1].vStart': -3e-15 }).differs).toBe(false);
  });
  it('NEGATIVE: catches a real value in it, a millionth of the vector', () => {
    const d = compareLegacy(truss, { ...truss, 'base.reactions[n1].rx': 35e-6 });
    expect(d.changed.map((c) => c.path)).toEqual(['base.reactions[n1].rx']);
    expect(compareLegacy(truss, { ...truss, 'base.elementForces[e1].vStart': 35e-6 }).differs).toBe(true);
  });
  it('NEGATIVE: never takes the floor from another unit (a moment from forces)', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n1].my': 1e-9 }).differs).toBe(true);
    expect(compareLegacy(truss, { ...truss, 'base.elementForces[e1].mStart': 1e-9 }).differs).toBe(true);
  });
  it('NEGATIVE: never takes the floor from another member\'s or node\'s vector', () => {
    const frame = {
      'base.elementForces[e1].nStart': 5000, 'base.elementForces[e1].vStart': 1e-12,
      'base.elementForces[e2].nStart': 1e-3, 'base.elementForces[e2].vStart': 2,
      'base.reactions[n1].fz': 5000, 'base.reactions[n2].fx': 3,
    };
    const shear = compareLegacy(frame, { ...frame, 'base.elementForces[e2].vStart': 2 * (1 + 2e-6) });
    expect(shear.changed.map((c) => c.path)).toEqual(['base.elementForces[e2].vStart']);
    expect(compareLegacy(frame, { ...frame, 'base.reactions[n2].fx': 3 * (1 + 2e-6) }).differs).toBe(true);
    expect(compareLegacy(frame, { ...frame, 'base.elementForces[e1].vStart': -2e-12 }).differs).toBe(false);
  });
  it('NEGATIVE: removed and newly produced values still differ', () => {
    expect(compareLegacy(truss, { ...truss, 'base.reactions[n9].rz': 1 })).toMatchObject({ differs: true, added: ['base.reactions[n9].rz'] });
    const { 'base.reactions[n5].rz': _, ...less } = truss;
    expect(compareLegacy(truss, less)).toMatchObject({ differs: true, removed: ['base.reactions[n5].rz'] });
  });
  it('groups by vector instance: collection, record, unit and result set', () => {
    expect(familyOf('case[3].reactions[n1].fx')).toBe('case[3].reactions[n1].<force>');
    expect(familyOf('base.reactions[n1].rz')).toBe('base.reactions[n1].<force>');
    expect(familyOf('base.reactions[n2].fz')).toBe('base.reactions[n2].<force>');
    expect(familyOf('base.elementForces[e4].vzEnd')).toBe('base.elementForces[e4].<force>');
    expect(familyOf('base.displacements[n1].rz')).toBe('base.displacements[n1].<rotation>');
    expect(familyOf('base.reactions[n1].my')).toBe('base.reactions[n1].<moment>');
    expect(familyOf('base.quadStresses[e1].nodeIndex')).toBeNull();
    expect(familyOf('base.resultSummary.displacementX.maxValue')).toBeNull();
  });
});

describe('NEGATIVE: the floor is round-off, not an engineering tolerance', () => {
  const member = { 'base.elementForces[e1].nStart': 5000, 'base.elementForces[e1].vStart': 0 };
  it('a shear from 0 to 0.0004 beside an axial force of 5000 is a change, to the gate and to old files', () => {
    const shear = { ...member, 'base.elementForces[e1].vStart': 0.0004 };
    expect(compareValues(member, shear).changed.map((c: { path: string }) => c.path)).toEqual(['base.elementForces[e1].vStart']);
    expect(compareLegacy(member, shear).changed.map((c) => c.path)).toEqual(['base.elementForces[e1].vStart']);
    expect(mergeValues(member, shear)).toEqual(shear);
  });
  it('a shear of 1e-6 kN beside 5000 kN, two parts in ten billion, is a change', () => {
    expect(compareLegacy(member, { ...member, 'base.elementForces[e1].vStart': 1e-6 }).differs).toBe(true);
  });
  it('round-off of 1e-10 of the vector is not', () => {
    expect(VECTOR_ATOL).toBe(1e-10);
    expect(compareLegacy(member, { ...member, 'base.elementForces[e1].vStart': 4e-7 }).differs).toBe(false);
  });
});
