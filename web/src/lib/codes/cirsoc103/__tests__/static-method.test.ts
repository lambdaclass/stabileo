/**
 * INPRES-CIRSOC 103 — the static method, checked against the printed page.
 *
 * The seismic coefficient is the number that scales the whole earthquake, and almost
 * every way of getting it wrong produces a plausible answer: a floor not applied, a
 * period not capped, the plateau used where the falling branch belongs. So the
 * assertions below quote clauses and work the arithmetic out by hand rather than
 * re-running the module's own expressions.
 */
import { describe, it, expect } from 'vitest';
import {
  designSpectrum, spectralOrdinate, isBlocked, seismicWeight,
  ZONE_AS, ZONE_T3, RISK_FACTOR, SIMULTANEITY_F1, NA_MIN, NV_MIN,
  spectralType, type DesignSpectrum,
} from '../spectrum';
import {
  approximatePeriod, periodCapFactor, designPeriod, designSeismicCoefficient,
  baseShear, distributeInHeight, staticMethodApplicable,
  PERIOD_COEFFICIENTS,
} from '../static-method';
import {
  BEHAVIOUR_TABLE_2018, findBehaviour, combineR, R_ELASTIC,
} from '../behaviour';

const spectrumOf = (zone: 1 | 2 | 3 | 4, site: 'SB' | 'SD' | 'SE' = 'SB'): DesignSpectrum => {
  const s = designSpectrum({ zone, site });
  if (isBlocked(s)) throw new Error('blocked');
  return s;
};

describe('zoning and the site', () => {
  it('carries the four effective accelerations Tabla 3.1 prints', () => {
    expect(ZONE_AS).toEqual({ 1: 0.08, 2: 0.15, 3: 0.25, 4: 0.35 });
    expect(ZONE_T3).toEqual({ 1: 3, 2: 5, 3: 8, 4: 13 });
  });

  it('maps site classes to the three spectral types', () => {
    expect(['SA', 'SB', 'SC'].map((s) => spectralType(s as 'SA'))).toEqual([1, 1, 1]);
    expect(spectralType('SD')).toBe(2);
    expect(spectralType('SE')).toBe(3);
    // SF has no row: §2.3.2 sends it to a site-specific evaluation.
    expect(spectralType('SF')).toBeNull();
  });

  it('refuses zone 0 and site SF instead of extrapolating a row', () => {
    const z0 = designSpectrum({ zone: 0, site: 'SB' });
    expect(isBlocked(z0)).toBe(true);
    expect((z0 as { blocked: { key: string } }).blocked.key).toBe('seismic.blocked.zone0');

    const sf = designSpectrum({ zone: 4, site: 'SF' });
    expect(isBlocked(sf)).toBe(true);
    expect((sf as { blocked: { key: string } }).blocked.key).toBe('seismic.blocked.siteSF');
  });

  it('applies the fault-proximity coefficients only where the table prints them', () => {
    // Zone 4, type 1: Ca = 0,37 Na and Cv = 0,51 Nv, with Na ≥ 1 and Nv ≥ 1,2.
    const z4 = spectrumOf(4);
    expect(z4.na).toBe(NA_MIN);
    expect(z4.nv).toBe(NV_MIN);
    expect(z4.ca).toBeCloseTo(0.37, 10);
    expect(z4.cv).toBeCloseTo(0.51 * 1.2, 10);
    // …and says it assumed them, because the regulation gives no distance table.
    expect(z4.assumptions.map((a) => a.key)).toContain('seismic.assumed.faultProximity');

    // Zone 2 prints plain numbers; nothing is multiplied and nothing is assumed.
    const z2 = spectrumOf(2);
    expect(z2.ca).toBe(0.18);
    expect(z2.cv).toBe(0.25);
    expect(z2.assumptions).toEqual([]);
  });

  it('never lets a supplied Na or Nv fall below the printed floor', () => {
    const s = designSpectrum({ zone: 3, site: 'SB', na: 0.5, nv: 0.5 });
    expect(isBlocked(s)).toBe(false);
    expect((s as DesignSpectrum).na).toBe(1.0);
    expect((s as DesignSpectrum).nv).toBe(1.2);
  });

  it('carries all twelve cells of Tabla 3.1, as printed', () => {
    /*
     * The whole table, not the two cells the other assertions happen to touch.
     *
     * Ca and Cv scale the entire earthquake, and a mistyped cell is invisible: every
     * number here is plausible, so a 0,32 where the page prints 0,30 produces a design
     * that looks exactly as right as the correct one. I checked these against the
     * printed page by hand and got the check itself wrong twice before getting it
     * right, which is the argument for writing it down rather than trusting the pass.
     *
     * Zones 3 and 4 print Ca and Cv as multiples of Na and Nv, which default to the
     * floors the table states (1 and 1,2), so the expectation carries that factor.
     */
    const printed: Record<1 | 2 | 3, Record<1 | 2 | 3 | 4, [number, number]>> = {
      1: { 4: [0.37, 0.51], 3: [0.29, 0.39], 2: [0.18, 0.25], 1: [0.09, 0.13] },
      2: { 4: [0.40, 0.59], 3: [0.32, 0.47], 2: [0.22, 0.32], 1: [0.12, 0.18] },
      3: { 4: [0.36, 0.90], 3: [0.35, 0.74], 2: [0.30, 0.50], 1: [0.19, 0.26] },
    };
    const siteOf: Record<1 | 2 | 3, 'SB' | 'SD' | 'SE'> = { 1: 'SB', 2: 'SD', 3: 'SE' };
    for (const type of [1, 2, 3] as const) {
      for (const zone of [1, 2, 3, 4] as const) {
        const s = spectrumOf(zone, siteOf[type]);
        const [ca, cv] = printed[type][zone];
        const nearFault = zone >= 3;
        expect(s.type, `type for ${siteOf[type]}`).toBe(type);
        expect(s.ca, `Ca type ${type} zone ${zone}`)
          .toBeCloseTo(ca * (nearFault ? NA_MIN : 1), 10);
        expect(s.cv, `Cv type ${type} zone ${zone}`)
          .toBeCloseTo(cv * (nearFault ? NV_MIN : 1), 10);
      }
    }
  });

  it('derives the characteristic periods from [3.13] and [3.14]', () => {
    const s = spectrumOf(4, 'SD');   // type 2: Ca = 0,40, Cv = 0,59 Nv
    expect(s.t2).toBeCloseTo(s.cv / (2.5 * s.ca), 12);
    expect(s.t1).toBeCloseTo(0.2 * s.t2, 12);
  });
});

describe('the elastic spectrum, [3.1]–[3.4]', () => {
  const s = spectrumOf(4);

  it('rises to the plateau, holds it, then falls as Cv/T', () => {
    expect(spectralOrdinate(0, s)).toBeCloseTo(s.ca, 12);              // [3.1] at T = 0
    expect(spectralOrdinate(s.t1, s)).toBeCloseTo(2.5 * s.ca, 12);     // continuous at T1
    expect(spectralOrdinate(s.t2, s)).toBeCloseTo(2.5 * s.ca, 12);     // [3.2] plateau
    expect(spectralOrdinate(2 * s.t2, s)).toBeCloseTo(s.cv / (2 * s.t2), 12); // [3.3]
  });

  it('is continuous at T2 and at T3, which is where a branch error shows', () => {
    const eps = 1e-9;
    expect(spectralOrdinate(s.t2 + eps, s)).toBeCloseTo(spectralOrdinate(s.t2, s), 6);
    expect(spectralOrdinate(s.t3 + eps, s)).toBeCloseTo(spectralOrdinate(s.t3, s), 6);
  });

  it('falls faster than 1/T past T3', () => {
    // [3.4] is Cv·T3/T², so doubling T past T3 quarters the ordinate.
    const a = spectralOrdinate(s.t3 * 2, s);
    const b = spectralOrdinate(s.t3 * 4, s);
    expect(b / a).toBeCloseTo(0.25, 6);
  });
});

describe('§6.2.3 — the period', () => {
  it('reproduces Tabla 6.2 for each structural type', () => {
    expect(PERIOD_COEFFICIENTS.steelMomentFrame).toEqual({ cr: 0.0724, x: 0.80 });
    expect(PERIOD_COEFFICIENTS.concreteMomentFrame).toEqual({ cr: 0.0466, x: 0.90 });
    expect(PERIOD_COEFFICIENTS.steelEccentricOrBRB).toEqual({ cr: 0.0731, x: 0.75 });
    expect(PERIOD_COEFFICIENTS.other).toEqual({ cr: 0.0488, x: 0.75 });
    // A 20 m concrete frame: Ta = 0,0466 · 20^0,90 = 0,0466 · 14,82 = 0,691 s.
    expect(approximatePeriod(20, 'concreteMomentFrame')).toBeCloseTo(0.0466 * 20 ** 0.9, 12);
    expect(approximatePeriod(20, 'concreteMomentFrame')).toBeCloseTo(0.691, 3);
  });

  it('reads Tabla 6.1 at its printed rows and interpolates between them', () => {
    expect(periodCapFactor(0.35)).toBeCloseTo(1.40, 12);
    expect(periodCapFactor(0.25)).toBeCloseTo(1.45, 12);
    expect(periodCapFactor(0.15)).toBeCloseTo(1.60, 12);
    expect(periodCapFactor(0.08)).toBeCloseTo(1.70, 12);
    // "≥ 0,35" and "≤ 0,08" hold flat outside the printed range.
    expect(periodCapFactor(0.5)).toBeCloseTo(1.40, 12);
    expect(periodCapFactor(0.01)).toBeCloseTo(1.70, 12);
    // Halfway between 0,15 and 0,25 is halfway between 1,60 and 1,45.
    expect(periodCapFactor(0.20)).toBeCloseTo(1.525, 10);
  });

  it('uses Ta when no analysis period is given', () => {
    const r = designPeriod({ heightM: 20, system: 'concreteMomentFrame' }, 0.35);
    expect(r.t).toBeCloseTo(r.ta, 12);
    expect(r.capped).toBe(false);
  });

  it('caps a long computed period at Cu·Ta, which is the clause that matters', () => {
    // A soft model reports 3 s for a 20 m frame. [6.7] does not accept it: a period as
    // long as the assumed stiffness is low would design the earthquake away.
    const r = designPeriod({ heightM: 20, system: 'concreteMomentFrame', computedT: 3 }, 0.35);
    expect(r.capped).toBe(true);
    expect(r.t).toBeCloseTo(1.40 * r.ta, 10);
    expect(r.t).toBeLessThan(3);
  });

  it('keeps a computed period that is already short enough', () => {
    const r = designPeriod({ heightM: 20, system: 'concreteMomentFrame', computedT: 0.8 }, 0.35);
    expect(r.capped).toBe(false);
    expect(r.t).toBe(0.8);
  });
});

describe('§6.2.2 — the design seismic coefficient', () => {
  it('uses the plateau at or below T2, [6.3]', () => {
    const s = spectrumOf(4);
    const r = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: s.t2 * 0.5 });
    expect(r.basis).toBe('plateau');
    expect(r.c).toBeCloseTo((2.5 * s.ca * 1.0) / 7, 10);
    expect(r.floorApplied).toBeNull();
  });

  it('uses the falling branch past T2, [6.4], which is smaller', () => {
    const s = spectrumOf(4);
    const short = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: s.t2 });
    const long = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: s.t2 * 2 });
    expect(long.basis).toBe('spectrum');
    expect(long.c).toBeLessThan(short.c);
    expect(long.c).toBeCloseTo((s.cv / (s.t2 * 2)) / 7, 10);
  });

  it('scales with the destination group, and only with it', () => {
    const s = spectrumOf(4);
    const at = (g: 'Ao' | 'A' | 'B' | 'C') =>
      designSeismicCoefficient({ spectrum: s, group: g, r: 7, t: s.t2 * 0.5 }).c;
    expect(at('Ao') / at('B')).toBeCloseTo(1.5, 10);
    expect(at('A') / at('B')).toBeCloseTo(1.3, 10);
    expect(at('C') / at('B')).toBeCloseTo(0.8, 10);
    expect(RISK_FACTOR).toEqual({ Ao: 1.5, A: 1.3, B: 1.0, C: 0.8 });
  });

  it('applies the near-fault floor [6.5] in zones 3 and 4', () => {
    // A long-period building in zone 4: [6.4] falls below 0,8·as·Nv/R and is lifted.
    const s = spectrumOf(4);
    const r = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: 10 });
    expect(r.floorApplied).toBe('nearFault');
    expect(r.c).toBeCloseTo((0.8 * s.as * s.nv) / 7, 10);
  });

  it('applies the low-zone floor [6.6] in zones 1 and 2, which carries no R', () => {
    const s = spectrumOf(2);
    const r = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: 8 });
    expect(r.floorApplied).toBe('lowZone');
    expect(r.c).toBeCloseTo(0.11 * s.ca * 1.0, 10);
    // Raising R does not lower this floor — [6.6] has no R in it, unlike [6.5].
    const stiffer = designSeismicCoefficient({ spectrum: s, group: 'B', r: 2, t: 8 });
    expect(stiffer.c).toBeCloseTo(r.c, 10);
  });

  it('divides by R, which is the largest single lever on the answer', () => {
    const s = spectrumOf(4);
    const t = s.t2 * 0.5;
    const ductile = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t });
    const brittle = designSeismicCoefficient({ spectrum: s, group: 'B', r: 2.5, t });
    expect(brittle.c / ductile.c).toBeCloseTo(7 / 2.5, 10);
  });
});

describe('Tabla 5.1 — behaviour factors', () => {
  it('has all thirty-six rows, numbered as printed', () => {
    expect(BEHAVIOUR_TABLE_2018.length).toBe(36);
    expect(BEHAVIOUR_TABLE_2018.map((e) => e.row)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    );
    expect(new Set(BEHAVIOUR_TABLE_2018.map((e) => e.key)).size).toBe(36);
  });

  it('reproduces rows a reader can check', () => {
    expect(findBehaviour('rc_frame_full_ductility')).toMatchObject({ row: 2, r: 7, cd: 5.5, omega0: 3 });
    expect(findBehaviour('rc_cantilever_columns')).toMatchObject({ row: 6, r: 2.5 });
    expect(findBehaviour('steel_braced_eccentric')).toMatchObject({ row: 24, r: 7, cd: 4 });
    expect(findBehaviour('mas_solid_unconfined')).toMatchObject({ row: 11, r: 1.5 });
  });

  it('refuses to put a number on the row that prints a formula', () => {
    // Row 1 is R = (3 + A/5)·z bounded by 5z ≤ R ≤ 7 — a calculation on the wall
    // layout. Substituting either bound would invent the reader's coupling ratio.
    const walls = findBehaviour('rc_walls')!;
    expect(walls.formula).toBe(true);
    expect(walls.r).toBeNull();
  });

  it('takes the minimum where a direction mixes systems, §5.1.1 a)', () => {
    expect(combineR([7, 4, 6])).toBe(4);
    expect(combineR([])).toBeNull();
    // A null R from the formula row must not sneak in as a zero.
    expect(combineR([7, 0, -1])).toBe(7);
  });

  it('knows the elastic election of §5.1.2', () => {
    expect(R_ELASTIC).toBe(1.5);
  });
});

describe('§6.2.4.1 — distribution in height', () => {
  const levels = [{ h: 3, w: 100 }, { h: 6, w: 100 }, { h: 9, w: 80 }];

  it('sums to the base shear and follows Wk·hk', () => {
    const r = distributeInHeight(levels, 1000, 0.5, 0.6);
    expect(r.topHeavy).toBe(false);
    expect(r.forces.reduce((s, f) => s + f.f, 0)).toBeCloseTo(1000, 8);
    const sumWh = 100 * 3 + 100 * 6 + 80 * 9;
    expect(r.forces[0].f).toBeCloseTo((100 * 3 * 1000) / sumWh, 8);
    // It climbs: the inverted triangle is the whole content of [6.11].
    expect(r.forces[2].f).toBeGreaterThan(r.forces[0].f);
  });

  it('puts a tenth of the shear on the top mass when T > 2 T2, [6.12]/[6.13]', () => {
    const r = distributeInHeight(levels, 1000, 1.5, 0.6);
    expect(r.topHeavy).toBe(true);
    expect(r.forces.reduce((s, f) => s + f.f, 0)).toBeCloseTo(1000, 8);
    const sumWh = 100 * 3 + 100 * 6 + 80 * 9;
    expect(r.forces[0].f).toBeCloseTo((0.9 * 100 * 3 * 1000) / sumWh, 8);
    expect(r.forces[2].f).toBeCloseTo((0.9 * 80 * 9 * 1000) / sumWh + 100, 8);
  });

  it('finds the top mass by height, not by array order', () => {
    const scrambled = [{ h: 9, w: 80 }, { h: 3, w: 100 }, { h: 6, w: 100 }];
    const r = distributeInHeight(scrambled, 1000, 1.5, 0.6);
    // The 9 m level is first in the array and must still take the extra tenth.
    const sumWh = 100 * 3 + 100 * 6 + 80 * 9;
    expect(r.forces[0].f).toBeCloseTo((0.9 * 80 * 9 * 1000) / sumWh + 100, 8);
  });

  it('ignores the reference level and anything weightless', () => {
    const withBase = [{ h: 0, w: 500 }, ...levels, { h: 12, w: 0 }];
    const r = distributeInHeight(withBase, 1000, 0.5, 0.6);
    expect(r.forces.length).toBe(3);
    expect(r.forces.reduce((s, f) => s + f.f, 0)).toBeCloseTo(1000, 8);
  });

  it('returns zeros rather than NaN when there is no mass above the base', () => {
    const r = distributeInHeight([{ h: 0, w: 100 }], 1000, 0.5, 0.6);
    expect(r.forces.every((f) => f.f === 0)).toBe(true);
  });
});

describe('§2.7.2 — when the static method may be used', () => {
  const base = { zone: 4 as const, group: 'B' as const, regularity: 'regular' as const };

  it('admits anything up to three levels or under nine metres', () => {
    expect(staticMethodApplicable({ ...base, heightM: 8, levels: 3 }).allowed).toBe(true);
    expect(staticMethodApplicable({ ...base, heightM: 8.5, levels: 8 }).allowed).toBe(true);
    expect(staticMethodApplicable({ ...base, heightM: 40, levels: 3 }).allowed).toBe(true);
  });

  it('applies the Tabla 2.5 height limits above that', () => {
    // Zones 3 and 4: Ao 12 m, A 30 m, B 45 m.
    expect(staticMethodApplicable({ ...base, heightM: 44, levels: 14 }).allowed).toBe(true);
    expect(staticMethodApplicable({ ...base, heightM: 46, levels: 15 }).allowed).toBe(false);
    expect(staticMethodApplicable({ ...base, group: 'Ao', heightM: 13, levels: 4 }).allowed).toBe(false);
    // Zones 0, 1 and 2 reach further: B up to 60 m.
    expect(staticMethodApplicable({ ...base, zone: 2, heightM: 55, levels: 18 }).allowed).toBe(true);
    expect(staticMethodApplicable({ ...base, zone: 2, heightM: 61, levels: 20 }).allowed).toBe(false);
  });

  it('refuses an irregular building above the small-building exemption', () => {
    const r = staticMethodApplicable({ ...base, heightM: 30, levels: 10, regularity: 'irregular' });
    expect(r.allowed).toBe(false);
    expect(r.reasons.map((x) => x.key)).toContain('seismic.blocked.irregular');
  });

  it('refuses outright when §2.7.3 makes the dynamic methods obligatory', () => {
    // T > 3 T2 is not a warning: a static answer for such a building is one the
    // regulation does not accept, whatever its height.
    const r = staticMethodApplicable({ ...base, heightM: 8, levels: 2, t: 2.5, t2: 0.6 });
    expect(r.allowed).toBe(false);
    expect(r.dynamicRequired).toBe(true);
    expect(r.reasons[0].key).toBe('seismic.blocked.dynamicRequired');
  });

  it('says out loud that group C is being read on group B’s row', () => {
    const r = staticMethodApplicable({ ...base, group: 'C', heightM: 30, levels: 10 });
    expect(r.allowed).toBe(true);
    expect(r.reasons.map((x) => x.key)).toContain('seismic.assumed.groupCAsB');
  });
});

describe('§3.6 — the gravity load that shakes', () => {
  it('reproduces Tabla 3.3', () => {
    expect(SIMULTANEITY_F1.exceptional).toBe(0);
    expect(SIMULTANEITY_F1.reduced).toBe(0.25);
    expect(SIMULTANEITY_F1.intermediate).toBe(0.50);
    expect(SIMULTANEITY_F1.high).toBe(0.75);
    expect(SIMULTANEITY_F1.full).toBe(1.00);
    expect(SIMULTANEITY_F1.other).toBe(0.20);
  });

  it('weighs a level as D + f1 L + f2 S, [3.15]', () => {
    const r = seismicWeight({ deadKN: 1000, liveKN: 400, occupancy: 'reduced' });
    expect(r.weightKN).toBeCloseTo(1000 + 0.25 * 400, 10);
    expect(r.f1).toBe(0.25);
  });

  it('separates a warehouse from a flat, which one project-wide number cannot', () => {
    const flat = seismicWeight({ deadKN: 1000, liveKN: 400, occupancy: 'reduced' });
    const store = seismicWeight({ deadKN: 1000, liveKN: 400, occupancy: 'high' });
    expect(store.weightKN - flat.weightKN).toBeCloseTo((0.75 - 0.25) * 400, 10);
  });

  it('takes 0,70 of the snow on a roof that holds it and 0,20 otherwise', () => {
    const held = seismicWeight({ deadKN: 0, liveKN: 0, snowKN: 100, occupancy: 'exceptional', snowRetaining: true });
    const shed = seismicWeight({ deadKN: 0, liveKN: 0, snowKN: 100, occupancy: 'exceptional' });
    expect(held.weightKN).toBeCloseTo(70, 10);
    expect(shed.weightKN).toBeCloseTo(20, 10);
  });
});

describe('a worked building, end to end', () => {
  it('gives a ten-storey concrete frame in zone 4 a coefficient a reader can follow', () => {
    // 30 m, reinforced-concrete moment frame with full ductility, group B, site SB.
    const s = spectrumOf(4);
    const p = designPeriod({ heightM: 30, system: 'concreteMomentFrame' }, s.as);
    // Ta = 0,0466 · 30^0,90 = 0,0466 · 21,35 = 0,995 s, past T2 = 0,662 s.
    expect(p.t).toBeCloseTo(0.0466 * 30 ** 0.9, 10);
    expect(s.t2).toBeCloseTo(0.612 / (2.5 * 0.37), 10);
    expect(p.t).toBeGreaterThan(s.t2);

    const c = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: p.t });
    expect(c.basis).toBe('spectrum');
    // Sa = Cv/T; C = Sa·γr/R; and the near-fault floor does not bind at this period.
    expect(c.c).toBeCloseTo((s.cv / p.t) / 7, 10);
    expect(c.floorApplied).toBeNull();
    // A real building's coefficient, not a plateau value: well under 2,5 Ca / R.
    expect(c.c).toBeLessThan((2.5 * s.ca) / 7);
    expect(c.c).toBeGreaterThan(0.05);

    const levels = Array.from({ length: 10 }, (_, i) => ({ h: 3 * (i + 1), w: 900 }));
    const w = levels.reduce((acc, l) => acc + l.w, 0);
    const v0 = baseShear(c.c, w);
    const d = distributeInHeight(levels, v0, p.t, s.t2);
    expect(d.forces.reduce((acc, f) => acc + f.f, 0)).toBeCloseTo(v0, 6);
    expect(d.topHeavy).toBe(false);   // 0,971 s is under 2 T2 = 1,324 s
  });
});
