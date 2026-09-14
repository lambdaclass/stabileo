import { describe, it, expect } from 'vitest';
import {
  designBoltedJoint, boltAreaCm2, nominalShearMPa, nominalTensionMPa, clearDistanceCm,
  BOLT_GRADES, type BoltLayoutChoice,
} from '../bolted-joint';

const layout = (o: Partial<BoltLayoutChoice> = {}): BoltLayoutChoice => ({
  diameterMm: 20, grade: 'A325', threads: 'included', count: 4, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40, ...o,
});
const plate = { thicknessMm: 10, fuMPa: 400 };
const check = (d: ReturnType<typeof designBoltedJoint>, id: string) =>
  d.checks.find((c) => c.id === id)!;

describe('Tabla J.3.2, as the table gives it', () => {
  it('carries the three grades and their nominal strengths', () => {
    expect(nominalTensionMPa('A307')).toBe(260);
    expect(nominalTensionMPa('A325')).toBe(620);
    expect(nominalTensionMPa('A490')).toBe(778);
    expect(nominalShearMPa('A325', 'included')).toBe(330);
    expect(nominalShearMPa('A325', 'excluded')).toBe(415);
    expect(nominalShearMPa('A490', 'included')).toBe(414);
    expect(nominalShearMPa('A490', 'excluded')).toBe(517);
  });

  /*
   * The table gives A307 one shear value and no threads-excluded column. Inventing one by
   * analogy with A325's ratio would be reading a row the code does not have.
   */
  it('gives A307 no threads-excluded value, because the table does not', () => {
    expect(nominalShearMPa('A307', 'included')).toBe(140);
    expect(nominalShearMPa('A307', 'excluded')).toBeNull();
  });

  it('every grade has a tension value', () => {
    for (const g of BOLT_GRADES) expect(nominalTensionMPa(g)).toBeGreaterThan(0);
  });
});

describe('§J.3.6 — Rn = φ Fn Ab (10⁻¹)', () => {
  it('the bolt area is the nominal body area', () => {
    // A 20 mm bolt: π·(1 cm)² = 3,1416 cm².
    expect(boltAreaCm2(20)).toBeCloseTo(Math.PI, 6);
    expect(boltAreaCm2(16)).toBeCloseTo(Math.PI * 0.8 * 0.8, 9);
  });

  it('computes the shear capacity of the group', () => {
    const d = designBoltedJoint(layout(), plate, { shearKN: 100 });
    // φ Fnv Ab · 10⁻¹ · planes · count = 0,75 · 330 · π · 0,1 · 1 · 4
    const expected = 0.75 * 330 * Math.PI * 0.1 * 1 * 4;
    expect(check(d, 'boltShear').capacityKN).toBeCloseTo(expected, 6);
    expect(check(d, 'boltShear').clause).toBe('J.3.6');
    expect(check(d, 'boltShear').state).toBe('adequate');
  });

  it('double shear doubles it', () => {
    const one = designBoltedJoint(layout({ shearPlanes: 1 }), plate, { shearKN: 10 });
    const two = designBoltedJoint(layout({ shearPlanes: 2 }), plate, { shearKN: 10 });
    expect(check(two, 'boltShear').capacityKN!).toBeCloseTo(check(one, 'boltShear').capacityKN! * 2, 6);
  });

  it('and reports exceeded when the demand is above it', () => {
    const d = designBoltedJoint(layout(), plate, { shearKN: 1e4 });
    expect(check(d, 'boltShear').state).toBe('exceeded');
    expect(d.state).toBe('exceeded');
  });

  /*
   * Prying is named and not computed. §J.3.6 says the applied force includes «cualquier tracción
   * resultante del efecto de la acción de palanca», and prying depends on the plate's
   * flexibility and the bolt's distance to the web — neither of which this model records.
   */
  it('says prying is not included rather than silently omitting it', () => {
    const d = designBoltedJoint(layout(), plate, { tensionKN: 50 });
    expect(check(d, 'boltTension').noteKeys).toContain('bolted.note.pryingNotIncluded');
  });
});

describe('§J.3.7 — combined tension and shear', () => {
  it('reduces the available tension as shear rises', () => {
    const low = designBoltedJoint(layout(), plate, { shearKN: 20, tensionKN: 50 });
    const high = designBoltedJoint(layout(), plate, { shearKN: 200, tensionKN: 50 });
    expect(check(high, 'combined').capacityKN!).toBeLessThan(check(low, 'combined').capacityKN!);
  });

  /*
   * The cap matters. At low shear `1,3 Fnt − (Fnt/φFnv) frv` exceeds `Fnt`, and using it would
   * report more tension capacity than the bolt has.
   */
  it('never exceeds the plain tension capacity', () => {
    const d = designBoltedJoint(layout(), plate, { shearKN: 1, tensionKN: 50 });
    expect(check(d, 'combined').capacityKN!)
      .toBeLessThanOrEqual(check(d, 'boltTension').capacityKN! + 1e-9);
  });

  it('is unavailable when only one of the two demands exists', () => {
    const d = designBoltedJoint(layout(), plate, { shearKN: 50 });
    expect(check(d, 'combined').state).toBe('unavailable');
    expect(check(d, 'combined').noteKeys).toContain('bolted.missing.bothDemands');
  });
});

describe('§J.3.10 — plate bearing', () => {
  it('takes the lesser of the two expressions', () => {
    const d = designBoltedJoint(layout({ edgeDistanceMm: 40 }), plate, { shearKN: 10 });
    const hole = d.envelope.standardHoleDiameter.valueMm!;
    const lc = clearDistanceCm(40, hole);
    const perBolt = Math.min(1.2 * lc * 1.0 * 400 * 0.1, 2.4 * 2.0 * 1.0 * 400 * 0.1);
    expect(check(d, 'bearing').capacityKN).toBeCloseTo(0.75 * perBolt * 4, 6);
    expect(check(d, 'bearing').clause).toBe('J.3.10');
  });

  /*
   * `Lc` is the CLEAR distance — «entre el borde del agujero y el borde del material» — not the
   * edge distance. Using the edge distance directly overstates bearing by half a hole on every
   * bolt.
   */
  it('the clear distance is the edge distance less half a hole', () => {
    expect(clearDistanceCm(40, 22)).toBeCloseTo((40 - 11) / 10, 9);
    // And never negative: a hole running off the edge is not a negative capacity.
    expect(clearDistanceCm(5, 22)).toBe(0);
  });

  it('the deformation-allowed case gives more, as the clause says', () => {
    const strict = designBoltedJoint(layout({ deformationConsidered: true }), plate, { shearKN: 10 });
    const relaxed = designBoltedJoint(layout({ deformationConsidered: false }), plate, { shearKN: 10 });
    expect(check(relaxed, 'bearing').capacityKN!)
      .toBeGreaterThan(check(strict, 'bearing').capacityKN!);
  });

  it('needs the PLATE fu, not the bolt grade', () => {
    const d = designBoltedJoint(layout(), { thicknessMm: 10 }, { shearKN: 10 });
    expect(check(d, 'bearing').state).toBe('unavailable');
    expect(check(d, 'bearing').noteKeys).toContain('bolted.missing.plateFu');
  });
});

describe('the geometric checks run against the CHOSEN layout', () => {
  it('flags a spacing below three diameters', () => {
    const ok = designBoltedJoint(layout({ spacingMm: 60 }), plate, { shearKN: 10 });
    const bad = designBoltedJoint(layout({ spacingMm: 50 }), plate, { shearKN: 10 });
    expect(check(ok, 'spacing').state).toBe('adequate');
    expect(check(bad, 'spacing').state).toBe('exceeded');
    expect(check(bad, 'spacing').clause).toBe('J.3.3');
  });

  it('flags an edge distance below the table value', () => {
    // A 20 mm bolt to a rolled edge takes 26 mm.
    const ok = designBoltedJoint(layout({ edgeDistanceMm: 26 }), plate, { shearKN: 10 });
    const bad = designBoltedJoint(layout({ edgeDistanceMm: 25 }), plate, { shearKN: 10 });
    expect(check(ok, 'edgeDistance').state).toBe('adequate');
    expect(check(bad, 'edgeDistance').state).toBe('exceeded');
    expect(check(bad, 'edgeDistance').clause).toBe('J.3.4');
  });
});

describe('the five states, and the one that never happens', () => {
  it('no layout is notDesigned', () => {
    const d = designBoltedJoint(null, plate, { shearKN: 10 });
    expect(d.state).toBe('notDesigned');
    expect(d.checks).toHaveLength(0);
    expect(d.missingKeys).toContain('bolted.missing.layout');
  });

  /*
   * A missing plate is something the USER can supply. Actionable, and distinct from the state
   * below it.
   */
  it('a missing user input is incomplete', () => {
    const d = designBoltedJoint(layout(), {}, { shearKN: 10 });
    expect(d.state).toBe('incomplete');
    expect(d.missingKeys).toContain('bolted.missing.plateThickness');
    expect(d.missingKeys).toContain('bolted.missing.plateFu');
  });

  /*
   * An A307 with threads excluded: every user input is present and Tabla J.3.2 still has no row.
   * No amount of typing fixes it, which is why it is a different state.
   */
  it('a clause with no answer is notVerifiable, not incomplete', () => {
    const d = designBoltedJoint(
      layout({ grade: 'A307', threads: 'excluded' }), plate, { shearKN: 10, tensionKN: 5 });
    expect(d.state).toBe('notVerifiable');
    expect(check(d, 'boltShear').noteKeys).toContain('bolted.missing.fnvNotTabulated');
  });

  it('everything adequate is designed', () => {
    const d = designBoltedJoint(layout(), plate, { shearKN: 20, tensionKN: 10 });
    expect(d.state).toBe('designed');
    expect(d.checks.every((c) => c.state === 'adequate')).toBe(true);
  });

  /*
   * The state this app can never reach. Passing the checks it can run is not a metallic
   * authority certifying them, and `steelCountsAsVerified()` returns the literal `false`.
   */
  it('never returns verified, for any input', () => {
    const cases = [
      designBoltedJoint(null, plate, {}),
      designBoltedJoint(layout(), {}, {}),
      designBoltedJoint(layout(), plate, { shearKN: 1, tensionKN: 1 }),
      designBoltedJoint(layout({ grade: 'A490', threads: 'excluded' }), plate,
        { shearKN: 1, tensionKN: 1 }),
    ];
    for (const d of cases) expect(d.state).not.toBe('verified');
  });
});

describe('every check names its clause, always', () => {
  it('even when it could not run', () => {
    const d = designBoltedJoint(layout(), {}, {});
    expect(d.checks.length).toBeGreaterThan(0);
    for (const c of d.checks) {
      expect(c.clause, c.id).toMatch(/^J\.3\./);
      if (c.state === 'unavailable') {
        expect(c.capacityKN, c.id).toBeNull();
        expect(c.noteKeys.length, c.id).toBeGreaterThan(0);
      }
    }
  });
});
