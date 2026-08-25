import { describe, it, expect } from 'vitest';
import { designJoint, hasDrawableGeometry, jointStateKey } from '../joint-design';
import type { BoltLayoutChoice } from '../bolted-joint';

const elements = new Map([[1, { id: 1, nodeI: 10, nodeJ: 11 }]]);
const combos = [{
  id: 1, name: '1.2D + 1.6L',
  elementForces: [{ elementId: 1, NI: 50, VyI: 40, VzI: 30, MyI: 0, MzI: 0 }],
}];
const bolts = (o: Partial<BoltLayoutChoice> = {}): BoltLayoutChoice => ({
  diameterMm: 20, grade: 'A325', threads: 'included', count: 4, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40, ...o,
});
const base = {
  nodeId: 10, elementIds: [1], elements, combos,
  originM: { x: 0, y: 0, z: 0 },
};

describe('one entity, fed from the model', () => {
  it('takes its demands from the analysis, not from typed numbers', () => {
    const d = designJoint({ ...base, bolts: bolts(), plate: { thicknessMm: 10, fuMPa: 400 } });
    // √(40² + 30²) = 50 kN shear, 50 kN axial.
    expect(d.demands.shear!.value).toBeCloseTo(50, 9);
    expect(d.bolts.checks.find((c) => c.id === 'boltShear')!.demandKN).toBeCloseTo(50, 9);
    expect(d.bolts.checks.find((c) => c.id === 'boltTension')!.demandKN).toBe(50);
  });

  /*
   * The plate the 3-D view draws is the plate the bearing check ran on. Two representations
   * would be two things that can disagree, and the one on screen would be the unchecked one.
   */
  it('the plate the view draws is the plate the checks used', () => {
    const d = designJoint({ ...base, bolts: bolts(), plate: { thicknessMm: 10, fuMPa: 400 } });
    expect(d.plate.state).toBe('available');
    if (d.plate.state !== 'available') throw new Error('unreachable');
    expect(d.plate.plate.thicknessM).toBeCloseTo(0.010, 9);
    expect(d.plate.plate.holesM).toHaveLength(4);
    // The hole size comes from the same envelope the bearing check read.
    expect(d.plate.plate.holeDiameterM * 1000)
      .toBe(d.bolts.envelope.standardHoleDiameter.valueMm);
  });

  it('and there is geometry to draw only when the plate exists', () => {
    const withPlate = designJoint({ ...base, bolts: bolts(), plate: { thicknessMm: 10, fuMPa: 400 } });
    const without = designJoint({ ...base, bolts: bolts() });
    expect(hasDrawableGeometry(withPlate)).toBe(true);
    expect(hasDrawableGeometry(without)).toBe(false);
  });
});

describe('the summary is conservative', () => {
  it('nothing chosen is notDesigned', () => {
    const d = designJoint(base);
    expect(d.state).toBe('notDesigned');
  });

  it('a missing plate is incomplete', () => {
    const d = designJoint({ ...base, bolts: bolts() });
    expect(d.state).toBe('incomplete');
  });

  it('a failing check outranks a missing input', () => {
    /*
     * A joint with one failing check is not «incomplete» because another part lacks an input:
     * the failure is the fact worth surfacing, and burying it under a milder state is how a
     * real problem goes unnoticed.
     */
    const d = designJoint({
      ...base,
      bolts: bolts({ count: 1, spacingMm: 10 }),
      plate: { thicknessMm: 10, fuMPa: 400 },
    });
    expect(d.state).toBe('exceeded');
  });

  it('a complete adequate joint is designed', () => {
    const d = designJoint({
      ...base, bolts: bolts({ count: 8 }), plate: { thicknessMm: 12, fuMPa: 400 },
    });
    expect(d.state).toBe('designed');
  });

  /*
   * A weld pulls the joint down to its own ceiling, which is `notVerifiable` — Tabla J.2.5 makes
   * the base metal «Gobernado por la Sección J.4», which this app cannot evaluate.
   */
  it('a weld caps the joint at its own ceiling', () => {
    const d = designJoint({
      ...base, bolts: bolts({ count: 8 }), plate: { thicknessMm: 12, fuMPa: 400 },
      weld: { legMm: 6, lengthMm: 200, runs: 2, fexxMPa: 480, thickerPartMm: 12, thinnerPartMm: 10 },
    });
    expect(d.weld!.state).toBe('notVerifiable');
    expect(d.state).toBe('notVerifiable');
  });

  /*
   * Most bolted joints have no weld. Reporting «weld incomplete» on every one of them would make
   * the state meaningless, so an absent weld is absent rather than incomplete.
   */
  it('an absent weld is not an incomplete one', () => {
    const d = designJoint({
      ...base, bolts: bolts({ count: 8 }), plate: { thicknessMm: 12, fuMPa: 400 },
    });
    expect(d.weld).toBeNull();
    expect(d.state).toBe('designed');
  });

  it('never returns verified', () => {
    const cases = [
      designJoint(base),
      designJoint({ ...base, bolts: bolts() }),
      designJoint({ ...base, bolts: bolts({ count: 8 }), plate: { thicknessMm: 12, fuMPa: 400 } }),
      designJoint({
        ...base, bolts: bolts({ count: 8 }), plate: { thicknessMm: 12, fuMPa: 400 },
        weld: { legMm: 6, lengthMm: 200, fexxMPa: 480, thickerPartMm: 12, thinnerPartMm: 10 },
      }),
    ];
    for (const d of cases) expect(d.state).not.toBe('verified');
  });
});

describe('battens travel with the joint when the member is built up', () => {
  it('are produced for a Group V member with a length', () => {
    const d = designJoint({
      ...base, bolts: bolts(), plate: { thicknessMm: 10, fuMPa: 400 },
      battens: { arrangement: 'doubleBack', gapMm: 10, lengthM: 6 },
    });
    expect(d.battens!.state).toBe('available');
    if (d.battens!.state !== 'available') throw new Error('unreachable');
    expect(d.battens!.layout.stations).toHaveLength(4);
    // Still no plate dimensions: §E.6 gives none.
    expect(d.battens!.layout.plate.state).toBe('GEOMETRY_UNAVAILABLE');
  });

  it('and are null when the member is not built up', () => {
    expect(designJoint({ ...base, bolts: bolts() }).battens).toBeNull();
  });
});

describe('the state is rendered through a key, never as a raw enum', () => {
  it('names every state, including the one nothing produces', () => {
    for (const s of ['notDesigned', 'incomplete', 'designed', 'exceeded', 'notVerifiable',
      'verified'] as const) {
      expect(jointStateKey(s)).toBe(`joint.state.${s}`);
    }
  });
});
