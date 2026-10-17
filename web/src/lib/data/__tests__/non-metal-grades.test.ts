/**
 * Concrete and timber, and the reason the design code is part of their identity.
 *
 * For steel the code is a lens: the same S355 is 355 MPa whoever checks it. For
 * concrete it is not. Each code calibrated its own modulus expression against
 * its own tests and its own safety format, so the SAME concrete comes out up to
 * 40% stiffer under one than another — and that difference goes straight into
 * every deflection the solver reports.
 *
 * These tests pin that spread, because it is the thing a reader is most likely
 * to assume away.
 */

import { describe, it, expect } from 'vitest';
import { CONCRETE, TIMBER, modulusByCode, concreteCodes, timberCodes } from '../non-metal-grades';

const byId = (id: string) => {
  const g = [...CONCRETE, ...TIMBER].find((x) => x.id === id);
  if (!g) throw new Error(`${id} missing`);
  return g;
};

describe('the modulus depends on the code, not only on the concrete', () => {
  it('a 25 MPa concrete is 23 500 MPa to CIRSOC and 31 500 to Eurocode', () => {
    // The single most consequential number in this file.
    expect(byId('cirsoc-h25').e).toBe(23500);
    expect(byId('en-c25').e).toBe(31476);
    // NBR 6118 §8.2.8 secant modulus: (0,8 + 0,2·25/80)·5600·√25 = 0,8625 × 28 000.
    expect(byId('nbr-c25').e).toBe(24150);
  });

  it('the spread is largest at low strengths, where most buildings sit', () => {
    const at = (f: number) => modulusByCode(f);
    const spread = (f: number) => {
      const es = at(f).map((x) => x.e);
      return (Math.max(...es) - Math.min(...es)) / Math.min(...es);
    };
    expect(spread(20)).toBeGreaterThan(0.4);
    // ...and narrows as the concrete gets stronger, which is why the choice of
    // code matters most exactly where it is least often questioned.
    expect(spread(50)).toBeLessThan(spread(20));
  });

  it('reproduces EN 1992-1-1 table 3.1 to the nearest GPa', () => {
    // Ecm tabulated: C20/25 30, C25/30 31, C30/37 33, C40/50 35 GPa.
    const en = (f: number) => CONCRETE.find((c) => c.id === `en-c${f}`)!.e / 1000;
    expect(Math.round(en(20))).toBe(30);
    expect(Math.round(en(25))).toBe(31);
    expect(Math.round(en(30))).toBe(33);
    expect(Math.round(en(40))).toBe(35);
  });

  it('CIRSOC and ACI share an expression, so equal strengths give equal moduli', () => {
    // CIRSOC 201 adopts ACI's 4700·sqrt(f'c). Same input, same answer.
    const h30 = byId('cirsoc-h30').e;
    expect(h30).toBe(Math.round(4700 * Math.sqrt(30)));
  });
});

describe('strength classes are named differently and are not interchangeable', () => {
  it('Eurocode names the cylinder AND the cube for the same concrete', () => {
    // C25/30 is one concrete, not a choice between 25 and 30 — the cube test
    // simply reads higher. Both are carried so neither can be misread.
    const c = CONCRETE.find((x) => x.id === 'en-c25')!;
    expect(c.fck).toBe(25);
    expect(c.fckCube).toBe(30);
    expect(c.fckCube!).toBeGreaterThan(c.fck);
  });

  it('Argentine and Brazilian classes are cylinder strengths, with no cube figure', () => {
    const h25 = byId('cirsoc-h25') as { fck: number; fckCube?: number };
    expect(h25.fck).toBe(25);
    expect(h25.fckCube).toBeUndefined();
    expect((byId('nbr-c25') as { fck: number }).fck).toBe(25);
  });

  it('American classes are specified in psi, so their MPa values are the odd ones', () => {
    // 4000 psi is 27,6 MPa. A table that rounded it to 25 or 30 would be
    // quietly changing the concrete.
    const c = CONCRETE.find((x) => x.id === 'aci-4000')!;
    expect(c.fck).toBeCloseTo(27.6, 1);
  });

  it('covers all four regions', () => {
    expect(new Set(CONCRETE.map((c) => c.region))).toEqual(new Set(['AR', 'EU', 'US', 'BR']));
    expect(concreteCodes().length).toBeGreaterThanOrEqual(4);
  });
});

describe('timber classes carry a whole property set', () => {
  it('C24 has the EN 338 values that define the class', () => {
    const c = byId('en338-c24') as { fmk: number; e: number; rhoK: number; fvk: number };
    expect(c.fmk).toBe(24);      // the number that names it
    expect(c.e).toBe(11000);
    expect(c.rhoK).toBe(350);
  });

  it('the class number IS the characteristic bending strength', () => {
    for (const w of TIMBER) {
      const digits = Number(w.designation.slice(1));
      expect(w.fmk, w.designation).toBe(digits);
    }
  });

  it('stiffness and density rise with the class, monotonically', () => {
    const softwood = TIMBER.filter((w) => w.designation.startsWith('C'));
    for (let i = 1; i < softwood.length; i++) {
      expect(softwood[i].e, softwood[i].designation).toBeGreaterThanOrEqual(softwood[i - 1].e);
      expect(softwood[i].rhoK, softwood[i].designation).toBeGreaterThanOrEqual(softwood[i - 1].rhoK);
    }
  });

  it('hardwood is denser than softwood of the same strength class', () => {
    // D30 and C30 bend alike and weigh very differently, which is what the
    // letter is for.
    const c30 = byId('en338-c30') as { rhoK: number };
    const d30 = byId('en338-d30') as { rhoK: number };
    expect(d30.rhoK).toBeGreaterThan(c30.rhoK);
  });

  it('self-weight uses the MEAN density, not the characteristic one', () => {
    // Characteristic density is a 5th percentile, used for connections. Using
    // it for self-weight would underestimate the load by about 20%.
    const c24 = byId('en338-c24') as { rho: number; rhoK: number };
    expect(c24.rho * 1000 / 9.81).toBeGreaterThan(c24.rhoK);
  });

  it('names its code', () => {
    expect(timberCodes()).toContain('EN 338');
    for (const w of TIMBER) expect(w.code, w.designation).toBeTruthy();
  });
});
