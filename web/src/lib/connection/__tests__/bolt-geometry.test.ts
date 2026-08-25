import { describe, it, expect } from 'vitest';
import { boltLayoutEnvelope, TABULATED_DIAMETERS_MM } from '../bolt-geometry';

describe('what §J.3 actually states', () => {
  const env = (o = {}) => boltLayoutEnvelope({ diameterMm: 20, plateThicknessMm: 10, ...o });

  it('minimum spacing is three diameters', () => {
    // «La distancia mínima s entre los centros de los agujeros normales u holgados será 3 veces
    // el diámetro nominal del bulón.»
    expect(env().minSpacing.valueMm).toBe(60);
    expect(env().minSpacing.clause).toBe('J.3.3');
    expect(env().minSpacing.basis).toBe('derivedFromRule');
  });

  it('minimum edge distance comes from the table, and depends on how the edge was made', () => {
    expect(env({ edgeFinish: 'sheared' }).minEdgeDistance.valueMm).toBe(34);
    expect(env({ edgeFinish: 'rolled' }).minEdgeDistance.valueMm).toBe(26);
    expect(env().minEdgeDistance.clause).toBe('J.3.4');
    expect(env().minEdgeDistance.basis).toBe('tabulated');
  });

  it('maximum edge distance is twelve thicknesses, capped at 150 mm', () => {
    expect(env({ plateThicknessMm: 10 }).maxEdgeDistance.valueMm).toBe(120);
    // «pero no excederá de 150 mm»
    expect(env({ plateThicknessMm: 40 }).maxEdgeDistance.valueMm).toBe(150);
    expect(env().maxEdgeDistance.clause).toBe('J.3.5');
  });

  it('maximum longitudinal spacing depends on exposure', () => {
    // Painted or with no corrosion risk: 24 t, not over 300 mm.
    expect(env({ plateThicknessMm: 10, exposure: 'painted' }).maxLongitudinalSpacing.valueMm).toBe(240);
    expect(env({ plateThicknessMm: 20, exposure: 'painted' }).maxLongitudinalSpacing.valueMm).toBe(300);
    // Unpainted weathering steel: 14 t, not over 180 mm.
    expect(env({ plateThicknessMm: 10, exposure: 'weathering' }).maxLongitudinalSpacing.valueMm).toBe(140);
    expect(env({ plateThicknessMm: 20, exposure: 'weathering' }).maxLongitudinalSpacing.valueMm).toBe(180);
  });

  it('the standard hole comes from Tabla J.3.3', () => {
    expect(env({ diameterMm: 20 }).standardHoleDiameter.valueMm).toBe(22);
    expect(env({ diameterMm: 24 }).standardHoleDiameter.valueMm).toBe(27);
    expect(env().standardHoleDiameter.clause).toBe('J.3.2');
  });

  /*
   * §B.4.2's «2 mm mayor que la dimensión nominal del agujero» is a NET AREA rule — the hole to
   * deduct — and Tabla J.3.3 is the hole itself. Both are in this app and they are different
   * numbers: a 20 mm bolt has a 22 mm hole and deducts 24 mm. Conflating them would mis-deduct
   * on every bolted tension member, so the test states the distinction rather than leaving it
   * to a comment.
   */
  it('and is not the net-area deduction of §B.4.2', () => {
    const hole = env({ diameterMm: 20 }).standardHoleDiameter.valueMm!;
    expect(hole).toBe(22);
    expect(hole).not.toBe(20 + 2 + 2);
  });
});

describe('above the table, the code gives a rule and this uses it', () => {
  it('minimum edge distance is 1,75 d sheared and 1,25 d rolled', () => {
    const e = (finish: 'sheared' | 'rolled') =>
      boltLayoutEnvelope({ diameterMm: 36, plateThicknessMm: 10, edgeFinish: finish });
    expect(e('sheared').minEdgeDistance.valueMm).toBeCloseTo(1.75 * 36, 9);
    expect(e('rolled').minEdgeDistance.valueMm).toBeCloseTo(1.25 * 36, 9);
    expect(e('rolled').minEdgeDistance.basis).toBe('derivedFromRule');
  });

  it('the standard hole is d + 3 above 28 mm', () => {
    expect(boltLayoutEnvelope({ diameterMm: 36 }).standardHoleDiameter.valueMm).toBe(39);
  });
});

describe('what it refuses to invent', () => {
  /*
   * A diameter BETWEEN two rows is not a diameter the code tabulates, and interpolating a code
   * table is inventing a limit it does not state. Only ABOVE the table does a rule exist.
   */
  it('does not interpolate a diameter the table skips', () => {
    const e = boltLayoutEnvelope({ diameterMm: 18, plateThicknessMm: 10 });
    expect(e.minEdgeDistance.valueMm).toBeNull();
    expect(e.minEdgeDistance.basis).toBe('unavailable');
    expect(e.minEdgeDistance.clause).toBe('J.3.4');
    expect(e.complete).toBe(false);
  });

  it('says which input is missing rather than guessing one', () => {
    const e = boltLayoutEnvelope({});
    expect(e.missingKeys).toEqual(['bolt.missing.diameter', 'bolt.missing.plateThickness']);
    expect(e.complete).toBe(false);
    // Every quantity still names its clause, so a surface can show the RULE while saying it
    // cannot evaluate it yet.
    for (const q of [e.minSpacing, e.minEdgeDistance, e.maxEdgeDistance,
      e.maxLongitudinalSpacing, e.standardHoleDiameter]) {
      expect(q.valueMm).toBeNull();
      expect(q.clause).toMatch(/^J\.3\./);
      expect(q.noteKey).toBeTruthy();
    }
  });

  it('a thickness alone still gives the two rules that depend only on it', () => {
    const e = boltLayoutEnvelope({ plateThicknessMm: 8 });
    expect(e.maxEdgeDistance.valueMm).toBe(96);
    expect(e.maxLongitudinalSpacing.valueMm).toBe(192);
    expect(e.minSpacing.valueMm).toBeNull();
    expect(e.missingKeys).toEqual(['bolt.missing.diameter']);
  });

  it('rejects a nonsensical input rather than computing from it', () => {
    for (const bad of [0, -5, Number.NaN]) {
      const e = boltLayoutEnvelope({ diameterMm: bad, plateThicknessMm: bad });
      expect(e.complete).toBe(false);
      expect(e.minSpacing.valueMm).toBeNull();
    }
  });
});

describe('the tabulated diameters', () => {
  it('are the twelve Tabla J.3.4 lists, and a picker offers no other', () => {
    expect([...TABULATED_DIAMETERS_MM]).toEqual([6, 7, 8, 10, 12, 14, 16, 20, 22, 24, 27, 30]);
  });

  it('every one of them yields a complete envelope with a thickness', () => {
    for (const d of TABULATED_DIAMETERS_MM) {
      const e = boltLayoutEnvelope({ diameterMm: d, plateThicknessMm: 10 });
      expect(e.minSpacing.valueMm, `d=${d}`).toBe(3 * d);
      expect(e.minEdgeDistance.valueMm, `d=${d}`).not.toBeNull();
      // The two smallest have no hole row above 27 mm; every tabulated one does have a hole.
      if (d <= 27) expect(e.standardHoleDiameter.valueMm, `d=${d}`).not.toBeNull();
    }
  });
});
