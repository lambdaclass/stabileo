/**
 * INPRES-CIRSOC 103 Parte I (2018) against worked examples with published numbers.
 *
 * No official "Ejemplos de aplicación" of the 2018 Parte I was found (INPRES publishes the
 * Comentarios, which work no numeric example). The two sources used, and what each covers:
 *
 * 1. EDICI Ingeniería, "Cargas sísmicas según INPRES-CIRSOC 103 en Argentina: guía práctica
 *    para estructuras de baja altura", https://edici.com.ar/blog/cargas-sismicas-inpres-cirsoc-103
 *    (read 2026-10-17). A single-storey steel shed in Gran Mendoza worked by the 2018 edition:
 *    Tabla 3.1, [3.13], [6.8] with Tabla 6.2, [6.3], [6.5], [6.1]. A practitioner's guide, not
 *    an INPRES publication: it is the only published 2018 worked example found.
 *
 * 2. INPRES / INTI-CIRSOC, "Ejemplo de diseño sísmico de un edificio estructurado con tabiques
 *    en voladizo de hormigón armado, según el Reglamento INPRES-CIRSOC 103, P.II, edición
 *    2005", §1.1.1.c.6–c.7, pp. 16–17 (PDF pp. 32–33),
 *    https://www.inti.gob.ar/assets/uploads/files/cirsoc/EJEMPLOS%202/tapa103.pdf. Its
 *    actions come from the 1991 Parte I, whose spectrum and C differ from 2018, so only the
 *    distribution in height is used: 1991 §14.1.1.3 prints Fk = Wk·hk·Vo / Σ Wi·hi, which is
 *    2018's [6.11] word for word. Vo is taken from the example as published.
 *
 * Tolerances are the published rounding.
 */
import { describe, it, expect } from 'vitest';
import { designSpectrum, isBlocked, type DesignSpectrum } from '../spectrum';
import { approximatePeriod, designSeismicCoefficient, baseShear, distributeInHeight, staticMethodApplicable } from '../static-method';
import { findBehaviour } from '../behaviour';

const spec = (zone: 1 | 4, site: 'SC'): DesignSpectrum => {
  const s = designSpectrum({ zone, site, na: 1, nv: 1.2 });
  if (isBlocked(s)) throw new Error('blocked');
  return s;
};

describe('EDICI guide: steel shed, Gran Mendoza, zone 4, site SC, group B, R = 3', () => {
  const s = spec(4, 'SC');
  // "Pórticos arriostrados ... convencionales" (Tabla 5.1 row 23), R = 3 as the guide uses.
  const r = findBehaviour('steel_braced_concentric_ordinary')!.r!;
  const ta = approximatePeriod(7, 'other');
  const c = designSeismicCoefficient({ spectrum: s, group: 'B', r, t: ta });

  it('Ca = 0,37 and Cv = 0,61 (0,51·1,2), as printed to two decimals', () => {
    expect(s.ca).toBeCloseTo(0.37, 2);
    expect(Math.abs(s.cv - 0.61)).toBeLessThanOrEqual(0.005);
  });
  it('T2 = 0,66 s [3.13]', () => {
    expect(Math.abs(s.t2 - 0.66)).toBeLessThanOrEqual(0.005);
  });
  it('Ta = 0,0488 · 7^0,75 = 0,21 s [6.8], on the plateau', () => {
    expect(r).toBe(3);
    expect(Math.abs(ta - 0.21)).toBeLessThanOrEqual(0.005);
    expect(c.basis).toBe('plateau');
  });
  it('C = 2,5·0,37·1,0/3 = 0,31 [6.3]; the floor 0,8·0,35·1,2/3 = 0,11 [6.5] does not govern', () => {
    expect(Math.abs(c.c - 0.31)).toBeLessThanOrEqual(0.005);
    expect(Math.abs((0.8 * s.as * s.nv) / r - 0.11)).toBeLessThanOrEqual(0.005);
    expect(c.floorApplied).toBeNull();
  });
  it('W = 286 kN, Vo = 89 kN [6.1] (the guide rounds C to 0,31 first: ±0,005·286 kN)', () => {
    expect(Math.abs(baseShear(c.c, 286) - 89)).toBeLessThanOrEqual(0.005 * 286 + 0.5);
  });
  it('a 7 m single level may use the static method (§2.7.2)', () => {
    expect(staticMethodApplicable({ zone: 4, group: 'B', heightM: 7, levels: 1, regularity: 'regular', t: ta, t2: s.t2 }).allowed).toBe(true);
  });
  it('the same shed in Córdoba capital, zone 1, site SC: C = 2,5·0,09/3 = 0,075, Vo = 21 kN', () => {
    const s1 = spec(1, 'SC');
    const c1 = designSeismicCoefficient({ spectrum: s1, group: 'B', r, t: approximatePeriod(7, 'other') });
    expect(c1.c).toBeCloseTo(0.075, 10);
    expect(Math.abs(baseShear(c1.c, 286) - 21)).toBeLessThanOrEqual(0.5);
  });
});

describe('INPRES/INTI wall-building example: distribution in height [6.11] (pp. 16–17)', () => {
  // Nivel, Wk [kN], hk [m] as printed on p. 10 (PDF p. 25) and in the table on p. 17 (PDF p. 33).
  const levels = [
    [10, 6370, 32.5], [9, 6750, 29.5], [8, 6750, 26.5], [7, 7100, 23.4], [6, 7100, 20.3],
    [5, 7150, 17.2], [4, 7150, 14.1], [3, 7600, 10.9], [2, 7600, 7.7], [1, 8200, 4.5],
  ] as const;
  const published = {
    // Vo,x = 0,25 × 71770 = 17943 kN; Vo,y = 0,26 × 71770 = 18660 kN (p. 16).
    x: { vo: 17943, f: [2863, 2754, 2474, 2298, 1993, 1701, 1394, 1146, 809, 510], v: [2863, 5617, 8091, 10389, 12382, 14083, 15478, 16623, 17433, 17943] },
    y: { vo: 18660, f: [2978, 2864, 2573, 2390, 2073, 1769, 1450, 1192, 842, 531], v: [2978, 5842, 8415, 10804, 12877, 14646, 16096, 17288, 18129, 18660] },
  };
  const masses = levels.map(([, w, h]) => ({ w, h }));

  it('W = 71770 kN and Σ Wk·hk = 1297350, as printed', () => {
    expect(masses.reduce((s, m) => s + m.w, 0)).toBe(71770);
    expect(masses.reduce((s, m) => s + m.w * m.h, 0)).toBeCloseTo(1297350, 6);
  });

  for (const dir of ['x', 'y'] as const) {
    it(`direction ${dir.toUpperCase()}: every Fk and storey shear Vk to the published kN`, () => {
      // [6.11] alone: the 2T2 test of [6.12]/[6.13] is a 2018 addition, so it is kept off here.
      const d = distributeInHeight(masses, published[dir].vo, 0, 1);
      expect(d.topHeavy).toBe(false);
      d.forces.forEach((f, k) => expect(Math.abs(f.f - published[dir].f[k]!)).toBeLessThanOrEqual(0.5));
      let v = 0;
      d.forces.forEach((f, k) => { v += f.f; expect(Math.abs(v - published[dir].v[k]!)).toBeLessThanOrEqual(1.5); });
      expect(v).toBeCloseTo(published[dir].vo, 6);
    });
  }
});
