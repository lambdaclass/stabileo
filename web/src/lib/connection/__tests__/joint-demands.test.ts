import { describe, it, expect } from 'vitest';
import {
  jointDemands, hasDemands, boltShearDemandKN, boltTensionDemandKN,
  type ComboResults,
} from '../joint-demands';

const elements = new Map([
  [1, { id: 1, nodeI: 10, nodeJ: 11 }],
  [2, { id: 2, nodeI: 12, nodeJ: 10 }],
]);

const combo = (id: number, name: string, forces: Array<Record<string, unknown>>): ComboResults =>
  ({ id, name, elementForces: forces });

describe('the governing demand names where it came from', () => {
  const combos = [
    combo(1, '1.2D + 1.6L', [
      { elementId: 1, NI: 40, VyI: 10, VzI: 0, MyI: 0, MzI: 5 },
      { elementId: 2, NJ: -20, VyJ: 3, VzJ: 4, MyJ: 0, MzJ: 0 },
    ]),
    combo(2, '1.2D + 1.0W', [
      { elementId: 1, NI: 15, VyI: 30, VzI: 40, MyI: 0, MzI: 2 },
      { elementId: 2, NJ: -80, VyJ: 1, VzJ: 0, MyJ: 0, MzJ: 0 },
    ]),
  ];
  const d = jointDemands(10, [1, 2], elements, combos);

  it('reports the largest axial, with its combination, member and end', () => {
    // Element 2 meets node 10 at its J end, and combo 2 gives it 80 kN.
    expect(d.axial).toEqual({
      component: 'axial', value: 80, comboId: 2, comboName: '1.2D + 1.0W',
      elementId: 2, end: 'J',
    });
  });

  it('reports the resultant shear, not one component of it', () => {
    // Element 1 in combo 2: √(30² + 40²) = 50.
    expect(d.shear!.value).toBeCloseTo(50, 9);
    expect(d.shear!.comboId).toBe(2);
    expect(d.shear!.elementId).toBe(1);
  });

  /*
   * The resultant is taken PER combination. Pairing `Vy` from one with `Vz` from another would
   * invent a load case the analysis never ran — and would give √(30² + 4²) here, not 50.
   */
  it('never pairs components from different combinations', () => {
    const worst = Math.hypot(30, 40);
    expect(d.shear!.value).toBeCloseTo(worst, 9);
    expect(d.shear!.value).toBeLessThanOrEqual(Math.hypot(30, 40));
  });

  it('takes the end that actually meets the node', () => {
    // Element 1 meets node 10 at I; element 2 at J. Reading the wrong end reads a different
    // member's far-end force.
    expect(d.axial!.end).toBe('J');
    expect(d.shear!.end).toBe('I');
  });

  it('says how many combinations it walked', () => {
    expect(d.combinationsConsidered).toBe(2);
  });

  it('is a magnitude, never a sign', () => {
    // Element 2's axial is −80 in the results; a demand is 80.
    expect(d.axial!.value).toBe(80);
  });
});

describe('what it refuses to report', () => {
  /*
   * A truss diagonal carries no moment. «The governing moment is 0,0 kN·m» invites a reader to
   * check a connection against nothing, so absence is reported as absence.
   */
  it('a component that is zero everywhere comes back null, not zero', () => {
    const d = jointDemands(10, [1], elements, [
      combo(1, 'D', [{ elementId: 1, NI: 10, VyI: 0, VzI: 0, MyI: 0, MzI: 0 }]),
    ]);
    expect(d.moment).toBeNull();
    expect(d.shear).toBeNull();
    expect(d.axial!.value).toBe(10);
  });

  it('an unsolved model reports nothing, and says so', () => {
    const d = jointDemands(10, [1, 2], elements, []);
    expect(hasDemands(d)).toBe(false);
    expect(d.combinationsConsidered).toBe(0);
    expect(d.axial).toBeNull();
  });

  /*
   * A member at the joint with no forces in any result is named rather than dropped. A bolt
   * group sized while one of the members meeting it was invisible is a wrong bolt group.
   */
  it('names the members it found no forces for', () => {
    const d = jointDemands(10, [1, 2], elements, [
      combo(1, 'D', [{ elementId: 1, NI: 10, VyI: 1, VzI: 0 }]),
    ]);
    expect(d.membersWithoutForces).toEqual([2]);
  });

  it('ignores a member that is not in the model', () => {
    const d = jointDemands(10, [1, 99], elements, [
      combo(1, 'D', [{ elementId: 1, NI: 10, VyI: 1, VzI: 0 }]),
    ]);
    expect(d.membersWithoutForces).toEqual([99]);
    expect(d.axial!.elementId).toBe(1);
  });

  it('treats a missing or non-numeric component as zero rather than throwing', () => {
    const d = jointDemands(10, [1], elements, [
      combo(1, 'D', [{ elementId: 1, NI: 'x', VyI: null, VzI: undefined, MzI: 7 }]),
    ]);
    expect(d.axial).toBeNull();
    expect(d.moment!.value).toBe(7);
  });
});

describe('which demand sizes which check', () => {
  const d = jointDemands(10, [1], elements, [
    combo(1, 'D', [{ elementId: 1, NI: 60, VyI: 30, VzI: 40, MzI: 0 }]),
  ]);

  /*
   * J.3.6 gives tension and shear strengths separately, and which component feeds which is the
   * kind of thing that gets mixed up once and stays wrong. Named, so it is checkable.
   */
  it('shear feeds the shear check and axial feeds the tension one', () => {
    expect(boltShearDemandKN(d)).toBeCloseTo(50, 9);
    expect(boltTensionDemandKN(d)).toBe(60);
  });

  it('and both are null when the model was never solved', () => {
    const empty = jointDemands(10, [1], elements, []);
    expect(boltShearDemandKN(empty)).toBeNull();
    expect(boltTensionDemandKN(empty)).toBeNull();
  });
});
