/**
 * CIRSOC 104-2005 against the regulation's own worked examples.
 *
 * Source: INTI-CIRSOC, "Comentarios al Reglamento CIRSOC 104 — Reglamento Argentino de Acción de la
 * Nieve y del Hielo sobre las Construcciones", sección EJEMPLOS, Ejemplos N° 1 a 3, pp. Ejemplos-35
 * a Ejemplos-40 (PDF published by INTI at
 * inti.gob.ar/assets/uploads/files/cirsoc/vigencia-2013/area100/2021/15%20-Comentarios%20CIRSOC%20104.pdf).
 *
 * Every number asserted below is printed in those pages. Tolerances follow the printing: the
 * examples round to 0,01 kN/m² (0,1 kN/m² in Figura C 3 and C 4) and read C_s and h_d off Figuras 2
 * and 9 by eye. Where a value differs from stabileo by more than its rounding, the test says why.
 */
import { describe, it, expect } from 'vitest';
import { GROUND_SNOW_TABLES } from '../ground-snow';
import { roofSnow, snowDensity, driftIndex } from '../snow';
import { stepDrift, figure9Hd } from '../drift';
import { shapedSnow } from '../../../engine/loads/snow-shapes';

const pgOf = (table: string, locality: string) =>
  GROUND_SNOW_TABLES.find((t) => t.table === table)!.rows.find((r) => r.locality === locality)!.pg;

describe('Ejemplo N° 1: gable roof, 34°, W = 9 m, tiles, El Calafate (pp. Ejemplos-35/36)', () => {
  const r = roofSnow({
    pg: pgOf('1.14', 'El Calafate'), terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II',
    roof: { kind: 'gable', slopeDeg: 34, W: 9, slippery: false },
  });
  it('p_g = 1,2 kN/m² (Tabla 1.14); C_e = 1,0; C_t = 1,0; I = 1,0; p_f = 0,84 kN/m²', () => {
    expect(pgOf('1.14', 'El Calafate')).toBe(1.2);
    expect([r.ce, r.ct, r.importance]).toEqual([1.0, 1.0, 1.0]);
    expect(r.pf).toBeCloseTo(0.84, 2);
  });
  it('34° > 21/9 + 0,5 = 2,8°: no minimum', () => {
    expect(21 / 9 + 0.5).toBeCloseTo(2.8, 1);
    expect(r.pfMinimum).toBeNull();
  });
  it('C_s = 0,91 read off Figura 2.a solid line; p_s = 0,76 kN/m²', () => {
    // (70 − 34)/(70 − 30) = 0,90: the example reads 0,91 off the drawing.
    expect(Math.abs(r.cs - 0.91)).toBeLessThanOrEqual(0.011);
    expect(r.ps).toBeCloseTo(0.76, 2);
  });
  it('β = 0,9; windward 0,3 p_s = 0,23; leeward 1,2 (1 + β/2) p_s/C_e = 1,32 kN/m²; no rain on snow', () => {
    expect(driftIndex(1.2)).toBeCloseTo(0.9, 12);
    expect(r.unbalanced!.windward).toBeCloseTo(0.23, 2);
    expect(r.unbalanced!.leeward).toBeCloseTo(1.32, 2);
    expect(r.rainOnSnow).toBe(0);
  });
});

describe('Ejemplo N° 2: circular vault 25 m wide, rise 4,6 m, eaves at 41°, Bariloche (pp. Ejemplos-36/37)', () => {
  const pg = pgOf('1.10', 'San Carlos de Bariloche');
  const r = roofSnow({ pg, terrain: 'C', exposure: 'full', thermal: 'normal', category: 'III', roof: { kind: 'mono', slopeDeg: 21, W: 12.5, slippery: false } });
  /** A circular arc with eaves at 41° and half-width 12,5 m (rise 4,67 m; the example says 4,6). */
  const R0 = 12.5 / Math.sin((41 * Math.PI) / 180);
  const arc = Array.from({ length: 201 }, (_, k) => {
    const a = ((-41 + (82 * k) / 200) * Math.PI) / 180;
    return { x: R0 * Math.sin(a), y: 0, z: R0 * Math.cos(a) - R0 * Math.cos((41 * Math.PI) / 180) };
  });
  const s = shapedSnow(arc, { kind: 'curved', pf: r.pf, ce: r.ce, ct: r.ct, slippery: false, gamma: r.gamma, axis: 'x' })!;
  const at = (x: number) => ({ x, y: 0, z: 0 });

  it('p_g = 2,0 (Tabla 1.10); C_e = 0,9; I = 1,1; p_f = 1,4 kN/m²; the 21° chord takes no minimum', () => {
    expect(pg).toBe(2.0);
    expect([r.ce, r.ct, r.importance]).toEqual([0.9, 1.0, 1.1]);
    expect(r.pf).toBeCloseTo(1.386, 12);
    expect(r.pf).toBeCloseTo(1.4, 1);
    expect(r.pfMinimum).toBeNull();
  });
  it('balanced: C_s = 1 up to 30° (p_s = 1,4), C_s = 0,72 at the 41° eaves (p_s = 1,01 kN/m²)', () => {
    expect(s.balanced(at(0))).toBeCloseTo(r.pf, 12);
    const x30 = R0 * Math.sin((30 * Math.PI) / 180);
    expect(s.balanced(at(x30 - 0.2))).toBeCloseTo(r.pf, 12);
    // The example rounds p_f to 1,4 first: 0,72 · 1,4 = 1,01. With 1,386, 1,00.
    expect(Math.abs(s.balanced(at(12.5)) - 1.01)).toBeLessThanOrEqual(0.015);
  });
  it('unbalanced (case 2): 0,5 p_f = 0,7 at the crown, 2 p_f C_s/C_e = 3,1 at 30°, 2,2 kN/m² at the eaves; none windward', () => {
    const u = s.unbalanced.find((x) => x.dir === '+X')!;
    expect(u.at(at(0))).toBeCloseTo(0.7, 1);
    const x30 = R0 * Math.sin((30 * Math.PI) / 180);
    expect(u.at(at(x30))).toBeCloseTo(3.1, 1);
    expect(u.at(at(12.5))).toBeCloseTo(2.2, 1);
    expect(u.at(at(-6))).toBe(0);
  });
});

describe('Ejemplo N° 3: flat roofs with a 3 m step, Ushuaia (pp. Ejemplos-38 a 40)', () => {
  const pg = pgOf('1.15', 'Ushuaia');
  const upper = roofSnow({ pg, terrain: 'C', exposure: 'full', thermal: 'normal', category: 'II', roof: { kind: 'mono', slopeDeg: 0, W: 15, slippery: false } });
  const lower = roofSnow({ pg, terrain: 'C', exposure: 'partial', thermal: 'unheated', category: 'I', roof: { kind: 'mono', slopeDeg: 0, W: 26, slippery: false } });

  it('upper: p_f by (1) = 0,63; the minimum I·p_g = 1,0 kN/m² controls', () => {
    expect(pg).toBe(1.0);
    expect(upper.pfComputed).toBeCloseTo(0.63, 2);
    expect(upper.pfMinimum).toBeCloseTo(1.0, 12);
    expect(upper.pf).toBeCloseTo(1.0, 12);
  });
  it('lower: C_t = 1,2, I = 0,8, p_f by (1) = 0,67; the minimum 0,8 kN/m² controls', () => {
    expect(lower.pfComputed).toBeCloseTo(0.67, 2);
    expect(lower.pf).toBeCloseTo(0.8, 12);
  });
  it('γ = 2,63 kN/m³; h_b = 0,3 m; h_c = 2,7 m; h_c/h_b = 9', () => {
    expect(snowDensity(1)).toBeCloseTo(2.63, 2);
    const d = stepDrift({ pg, balanced: lower.pf, stepHeight: 3, luUpper: 30.5, luLower: 52 });
    expect(d.hb).toBeCloseTo(0.3, 1);
    expect(d.hc).toBeCloseTo(2.7, 1);
    expect(d.hc / d.hb).toBeCloseTo(9, 0);
    expect(d.applies).toBe(true);
  });
  it('h_d leeward 0,91 m (Figura 9, l_u 30,5 m) and windward 3/4 · 1,21 = 0,91 m (l_u 52 m), read by eye', () => {
    // The example reads Figura 9 by eye to 0,01 m on its 0–3 m axis. stabileo's reading of the
    // drawn curves gives 0,932 and 1,187 (0,890 windward): within 0,025 m either way, and the
    // curves re-read from the PDF's vectors (verification-tables) agree with stabileo, not with
    // either printed number, so these are reading differences, not a disagreement in the code.
    expect(Math.abs(figure9Hd(1, 30.5).hd - 0.91)).toBeLessThanOrEqual(0.025);
    expect(Math.abs(figure9Hd(1, 52).hd - 1.21)).toBeLessThanOrEqual(0.025);
  });
  it('h_d ≤ h_c: w = 4 h_d = 3,64 m; p_d = h_d γ = 2,4 kN/m², on 0,8 balanced (3,2 at the step)', () => {
    const d = stepDrift({ pg, balanced: lower.pf, stepHeight: 3, luUpper: 30.5, luLower: 52 });
    expect(d.height).toBeLessThanOrEqual(d.hc);
    expect(Math.abs(d.w - 3.64)).toBeLessThanOrEqual(4 * 0.025);
    expect(d.pd).toBeCloseTo(2.4, 1);
    expect(lower.pf + d.pd).toBeCloseTo(3.2, 1);
  });
  it('rain on snow: the example omits it at p_g = 1,0; the regulation\'s text (Cap. 10, "p_g ≤ 1") keeps it, reduced', () => {
    // Cap. 10: "en todos aquellos lugares donde se verifique que p_g ≤ 1 ... pero diferente de cero".
    // Upper roof: the minimum adds 0,37 > 0,25, so nothing is left either way.
    expect(upper.rainOnSnow).toBe(0);
    // Lower roof: the minimum adds 0,128, and 0,25 − 0,128 = 0,122 kN/m² remains. The example
    // (3.4) says no rain on snow is needed "ya que p_g es igual a 1,0", which reads its source's
    // "20 psf or less" as strict; the regulation prints ≤. stabileo follows the regulation, the
    // heavier of the two.
    expect(lower.rainOnSnow).toBeCloseTo(0.25 - (0.8 - 0.7 * 1.0 * 1.2 * 0.8 * 1.0), 12);
  });
});
