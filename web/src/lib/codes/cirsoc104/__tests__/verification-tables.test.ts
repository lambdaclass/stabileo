/**
 * CIRSOC 104-2005's tables and figures against independent readings of the official text.
 *
 * Tablas 1.1 a 1.15, 2, 3 and 4 are parsed here from the converted regulation
 * (`docs/codes/CIRSOC/markdown/cirsoc-104-2005/tablas.md`) by a parser of this file's own, keyed by
 * the table each row sits under, not by its order. The 166 rows were also diffed, outside the test,
 * against a second extraction of the official PDF (sha256 e1e6d178…, pages 52–66) made with
 * poppler's `pdftotext -layout` instead of the `pypdf` the Markdown came from: no difference.
 *
 * Figura 9 (h_d) has no expression in the regulation. Its curves were re-digitized for this test
 * from the vector paths of PDF page 49 (the curves are strips of filled quads; their centres were
 * mapped through the axis box 0–5 kN/m² × 0–3 m and its tick marks), independently of the table in
 * `drift.ts`. That reading is the `FIG9_REREAD` below.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROUND_SNOW_TABLES } from '../ground-snow';
import { EXPOSURE_FACTOR, IMPORTANCE_FACTOR, THERMAL_FACTOR, roofSnow, slopeFactor, isLowSlope, type SnowInputs } from '../snow';
import { figure9Hd, stepDrift, parapetDrift, slidingSnow } from '../drift';

const TABLAS = readFileSync(new URL('../../../../../../docs/codes/CIRSOC/markdown/cirsoc-104-2005/tablas.md', import.meta.url), 'utf8');
const num = (s: string) => Number(s.replace(',', '.'));

/** Tablas 1.1–1.15 by table: rows `Nº LOCALIDAD DISTRITO HSNM pg`, and the localities printed above a header. */
function parseGroundSnow() {
  const out = new Map<string, Array<{ n: number; locality: string; district: string; h: number; pg: number; est: boolean }>>();
  const heads = new Map<string, Array<{ locality: string; pg: number }>>();
  let table = '';
  for (const line of TABLAS.split('\n')) {
    const t = /^Tabla (1\.\d+)\.\s/.exec(line.trim());
    if (t) { table = t[1]!; out.set(table, []); heads.set(table, []); continue; }
    if (!table) continue;
    const h = /^\s*([A-ZÁÉÍÓÚ][\p{L} .]+?)\s+pg\s*=\s*([\d.,]+)\s*kN\/m2/u.exec(line);
    if (h && !/kgf/.test(line)) heads.get(table)!.push({ locality: h[1]!.trim(), pg: num(h[2]!) });
    // Villa Reynolds' "p_g" prints its subscript on the next line: "Villa Reynolds p      = 0.45kN/m2".
    const h2 = /^\s*([A-ZÁÉÍÓÚ][\p{L} .]+?)\s+p\s+=\s*([\d.,]+)kN\/m2/u.exec(line);
    if (h2 && !h) heads.get(table)!.push({ locality: h2[1]!.trim(), pg: num(h2[2]!) });
    const m = /^\s*(\d{1,3})\s+(\S.*?)\s{2,}(\S.*?)\s{2,}(\d{1,4})\s+(\d,\d+)(\*?)\s*$/.exec(line);
    if (m) out.get(table)!.push({ n: +m[1]!, locality: m[2]!.trim(), district: m[3]!.trim(), h: +m[4]!, pg: num(m[5]!), est: m[6] === '*' });
  }
  return { rows: out, heads };
}

describe('Tablas 1.1 a 1.15: ground snow p_g by locality', () => {
  const { rows, heads } = parseGroundSnow();

  it('every printed row, table by table, matches: number, locality, district, altitude, p_g and (*)', () => {
    expect([...rows.keys()]).toEqual(Array.from({ length: 15 }, (_, i) => `1.${i + 1}`));
    let count = 0;
    for (const [table, printed] of rows) {
      const mod = GROUND_SNOW_TABLES.find((t) => t.table === table)!;
      const listed = mod.rows.filter((r) => !r.heading);
      expect(listed.length, `Tabla ${table}`).toBe(printed.length);
      for (const p of printed) {
        const r = listed.find((x) => x.n === p.n && x.locality === p.locality);
        expect(r, `Tabla ${table} Nº ${p.n} ${p.locality}`).toBeDefined();
        expect([r!.district, r!.altitudeM, r!.pg, !!r!.estimated], `Tabla ${table} ${p.locality}`).toEqual([p.district, p.h, p.pg, p.est]);
        count++;
      }
    }
    expect(count).toBe(166);
  });

  it('the localities printed above a table header are there too (Uspallata 0,80; Villa Reynolds 0,45)', () => {
    // These were missing: Uspallata (Las Heras, Mendoza) could only be read as Las Heras's 0,3 and
    // Villa Reynolds (General Pedernera, San Luis) as Mercedes's 0,3.
    const all = [...heads].flatMap(([table, hs]) => hs.map((h) => ({ table, ...h })));
    expect(all).toEqual([{ table: '1.8', locality: 'Uspallata', pg: 0.8 }, { table: '1.13', locality: 'Villa Reynolds', pg: 0.45 }]);
    for (const h of all) {
      const r = GROUND_SNOW_TABLES.find((t) => t.table === h.table)!.rows.find((x) => x.locality === h.locality);
      expect(r?.pg, h.locality).toBe(h.pg);
      expect(r?.heading).toBe(true);
    }
  });

  it('keeps the map numbers unique within each table (the dialog keys localities by them)', () => {
    for (const t of GROUND_SNOW_TABLES) expect(new Set(t.rows.map((r) => r.n)).size, t.table).toBe(t.rows.length);
  });
});

describe('Tablas 2, 3 y 4', () => {
  it('Tabla 2, C_e: every terrain row and exposure column, N/A included', () => {
    const t2 = TABLAS.slice(TABLAS.indexOf('Tabla 2.'), TABLAS.indexOf('Tabla 3.'));
    const row = (re: RegExp) => re.exec(t2)!.slice(1, 4).map((v) => (v === 'N/A' ? null : num(v)));
    const printed = {
      A: row(/^A \(ver Apéndice A\)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)/m),
      B: row(/^B \(ver Apéndice A\)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)/m),
      C: row(/^C \(ver Apéndice A\)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)/m),
      D: row(/^D \(ver Apéndice A\)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)/m),
      aboveTreeline: row(/^Encima de la línea de árboles en áreas\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)\s+(N\/A|\d,\d)/m),
    };
    for (const [k, v] of Object.entries(printed)) {
      const e = EXPOSURE_FACTOR[k as keyof typeof EXPOSURE_FACTOR];
      expect([e.full, e.partial, e.sheltered], k).toEqual(v);
    }
  });

  it('Tabla 3, C_t, and Tabla 4, I', () => {
    const t3 = TABLAS.slice(TABLAS.indexOf('Tabla 3.'), TABLAS.indexOf('Tabla 4.'));
    expect(/Todas las estructuras excepto las que se indican a continuación\s+(\d,\d+)/.exec(t3)![1]).toBe('1,0');
    expect(/Estructuras mantenidas justo por encima del congelamiento[^\n]*\n[^\n]*?(\d,\d+)\s*$/m.exec(t3)![1]).toBe('1,1');
    expect(/Estructuras no calefaccionadas y estructuras intencionalmente\s+(\d,\d+)/.exec(t3)![1]).toBe('1,2');
    expect(/Invernaderos continuamente calefaccionados[^\n]*?(\d,\d+)\s*$/m.exec(t3)![1]).toBe('0,85');
    expect(THERMAL_FACTOR).toEqual({ normal: 1.0, coldVentilated: 1.1, unheated: 1.2, greenhouse: 0.85 });
    const t4 = TABLAS.slice(TABLAS.indexOf('Tabla 4.'));
    const imp = Object.fromEntries([...t4.matchAll(/^\s+(IV|III|II|I)\s+(\d,\d)\s*$/gm)].map((m) => [m[1], num(m[2]!)]));
    expect(imp).toEqual(IMPORTANCE_FACTOR);
  });
});

describe('Figura 2, C_s: the labelled break points and the 70° end', () => {
  it('stays 1 up to the label, then falls straight to 0 at 70°, for every curve', () => {
    // Labels on Figura 2 (PDF p. 44): 5° and 30° (a, warm), 10° and 37,5° (b, C_t = 1,1),
    // 15° and 45° (c, C_t = 1,2); the smooth unobstructed surface first.
    for (const [ct, slippery, start] of [[1.0, true, 5], [1.0, false, 30], [0.85, false, 30], [1.1, true, 10], [1.1, false, 37.5], [1.2, true, 15], [1.2, false, 45]] as const) {
      expect(slopeFactor(start, ct, slippery)).toBe(1);
      expect(slopeFactor(start + 1e-6, ct, slippery)).toBeLessThan(1);
      expect(slopeFactor((start + 70) / 2, ct, slippery)).toBeCloseTo(0.5, 12);
      expect(slopeFactor(70, ct, slippery)).toBe(0);
      expect(slopeFactor(89, ct, slippery)).toBe(0);
    }
  });
});

describe('§3.4, Cap. 6 and Cap. 10: boundaries', () => {
  const base: SnowInputs = { pg: 0.8, terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roof: { kind: 'gable', slopeDeg: 3, W: 10, slippery: false } };
  it('gable roofs: the minimum up to 21/W + 0,5 inclusive, unbalanced from it inclusive', () => {
    const lim = 21 / 10 + 0.5;
    expect(isLowSlope({ ...base.roof, slopeDeg: lim })).toBe(true);
    expect(isLowSlope({ ...base.roof, slopeDeg: lim + 1e-6 })).toBe(false);
    expect(roofSnow({ ...base, roof: { ...base.roof, slopeDeg: lim - 1e-6 } }).unbalanced).toBeNull();
    expect(roofSnow({ ...base, roof: { ...base.roof, slopeDeg: lim } }).unbalanced).not.toBeNull();
    expect(roofSnow({ ...base, roof: { ...base.roof, slopeDeg: 70.01 } }).unbalanced).toBeNull();
  });
  it('single-slope roofs: the minimum under 15° only ("menor que 15°")', () => {
    expect(isLowSlope({ kind: 'mono', slopeDeg: 14.99, W: 10, slippery: false })).toBe(true);
    expect(isLowSlope({ kind: 'mono', slopeDeg: 15, W: 10, slippery: false })).toBe(false);
  });
  it('the minimum is I·p_g up to p_g = 1 and I·1 above', () => {
    const flat = { ...base, roof: { ...base.roof, kind: 'mono' as const, slopeDeg: 0 } };
    expect(roofSnow({ ...flat, pg: 1.0, category: 'IV' }).pfMinimum).toBeCloseTo(1.2, 12);
    expect(roofSnow({ ...flat, pg: 1.01, category: 'IV' }).pfMinimum).toBeCloseTo(1.2, 12);
    expect(roofSnow({ ...flat, pg: 0.5, category: 'I' }).pfMinimum).toBeCloseTo(0.4, 12);
  });
  it('rain on snow: 0 < p_g ≤ 1 and slope under 2,4°', () => {
    const flat = { ...base, category: 'IV' as const, terrain: 'B' as const, exposure: 'sheltered' as const, roof: { ...base.roof, kind: 'mono' as const, slopeDeg: 2.39 } };
    // C_e 1,2, I 1,2: (1) gives 0,7·1,2·1,2·0,8 = 0,806 above the minimum 0,96? No: 0,806 < 0,96, so 0,154 comes off.
    const r = roofSnow(flat);
    expect(r.rainOnSnow).toBeCloseTo(0.25 - (0.96 - 0.7 * 1.2 * 1.2 * 0.8), 12);
    expect(roofSnow({ ...flat, roof: { ...flat.roof, slopeDeg: 2.4 } }).rainOnSnow).toBe(0);
    expect(roofSnow({ ...flat, pg: 0 }).rainOnSnow).toBe(0);
    expect(roofSnow({ ...flat, pg: 1.0 }).rainOnSnow).toBeGreaterThanOrEqual(0);
    expect(roofSnow({ ...flat, pg: 1.01 }).rainOnSnow).toBe(0);
  });
});

/** Figura 9 re-read from the PDF's vector paths (see the header): h_d, m, by p_g and l_u. */
const FIG9_REREAD: Record<number, Record<number, number>> = {
  7.5: { 0.5: 0.299, 1: 0.382, 1.5: 0.46, 2: 0.531, 2.5: 0.591, 3: 0.638, 3.5: 0.675, 4: 0.703, 4.5: 0.725 },
  15: { 0.5: 0.534, 1: 0.658, 1.5: 0.757, 2: 0.833, 2.5: 0.894, 3: 0.941, 3.5: 0.978, 4: 1.006, 4.5: 1.03, 4.75: 1.042 },
  30: { 0.5: 0.779, 1: 0.923, 1.5: 1.042, 2: 1.138, 2.5: 1.216, 3: 1.28, 3.5: 1.335, 4: 1.38, 4.5: 1.42, 4.75: 1.439 },
  60: { 0.5: 1.08, 1: 1.253, 1.5: 1.41, 2: 1.541, 2.5: 1.646, 3: 1.731, 3.5: 1.801, 4: 1.855, 4.5: 1.905 },
  120: { 0.5: 1.499, 1: 1.711, 1.5: 1.904, 2: 2.069, 2.5: 2.202, 3: 2.306, 3.5: 2.39, 4: 2.46, 4.5: 2.521 },
  180: { 0.5: 1.77, 1: 2.015, 1.5: 2.236, 2: 2.421, 2.5: 2.568, 3: 2.685, 3.5: 2.783, 4: 2.871, 4.5: 2.951, 4.75: 2.991 },
};

describe('Figura 9, h_d', () => {
  it('matches a second reading of the figure\'s curves to 0,01 m (a 0,03 m line on a 0–3 m axis)', () => {
    let n = 0;
    for (const [lu, row] of Object.entries(FIG9_REREAD)) {
      for (const [pg, hd] of Object.entries(row)) {
        expect(Math.abs(figure9Hd(+pg, +lu).hd - hd), `p_g ${pg}, l_u ${lu}`).toBeLessThanOrEqual(0.0105);
        n++;
      }
    }
    expect(n).toBe(57);
  });
  it('takes l_u below 7,5 m as 7,5 m (the figure\'s note) and flags readings outside the figure', () => {
    expect(figure9Hd(1, 3).hd).toBe(figure9Hd(1, 7.5).hd);
    expect(figure9Hd(5, 30).outside).toBe(true);
    expect(figure9Hd(1, 200).outside).toBe(true);
    expect(figure9Hd(4.75, 180).outside).toBe(false);
  });
  it('rises with p_g and with l_u', () => {
    for (const lu of [7.5, 10, 30, 52, 100, 180]) for (let pg = 0.25; pg < 4.75; pg += 0.25) expect(figure9Hd(pg + 0.25, lu).hd).toBeGreaterThan(figure9Hd(pg, lu).hd);
    for (const pg of [0.5, 1, 2, 4]) for (let lu = 7.5; lu < 180; lu += 5) expect(figure9Hd(pg, lu + 5).hd).toBeGreaterThan(figure9Hd(pg, lu).hd);
  });
});

describe('Cap. 7, 8 and 9: the drift rules', () => {
  it('no drift under h_c/h_b = 0,2; a drift at it', () => {
    const g = 0.426 * 1 + 2.2, hb = 0.8 / g;
    expect(stepDrift({ pg: 1, balanced: 0.8, stepHeight: hb * 1.2 - 1e-6, luUpper: 30, luLower: 30 }).applies).toBe(false);
    expect(stepDrift({ pg: 1, balanced: 0.8, stepHeight: hb * 1.2 + 1e-6, luUpper: 30, luLower: 30 }).applies).toBe(true);
  });
  it('h_d ≤ h_c: w = 4 h_d, height h_d; h_d > h_c: w = 4 h_d²/h_c, height h_c; w ≤ 8 h_c', () => {
    const tall = stepDrift({ pg: 1, balanced: 0.8, stepHeight: 3, luUpper: 30.5, luLower: 52 });
    expect(tall.w).toBeCloseTo(4 * tall.height, 12);
    const low = stepDrift({ pg: 3, balanced: 2, stepHeight: 1.2, luUpper: 120, luLower: 10 });
    const hd = Math.max(low.hdLeeward, low.hdWindward);
    expect(low.height).toBeCloseTo(low.hc, 12);
    expect(low.w).toBeCloseTo(Math.min((4 * hd * hd) / low.hc, 8 * low.hc), 12);
    expect(low.pd).toBeCloseTo(low.hc * low.gamma, 12);
  });
  it('windward: 3/4 h_d with the lower roof\'s length; the larger governs', () => {
    const d = stepDrift({ pg: 1, balanced: 0.8, stepHeight: 3, luUpper: 10, luLower: 100 });
    expect(d.hdWindward).toBeCloseTo(0.75 * figure9Hd(1, 100).hd, 12);
    expect(d.governs).toBe('windward');
  });
  it('§7.2: (6 − s)/6 within 6 m, none from 6 m', () => {
    const at = (s: number) => stepDrift({ pg: 1, balanced: 0.8, stepHeight: 3, luUpper: 30, luLower: 30, separation: s });
    expect(at(3).height).toBeCloseTo(at(0).height / 2, 12);
    expect(at(6).applies).toBe(false);
  });
  it('Cap. 8: 0,75 h_d with the roof upwind of the parapet', () => {
    const p = parapetDrift({ pg: 2, balanced: 1.4, parapetHeight: 2, lu: 40 });
    expect(p.hdWindward).toBeCloseTo(0.75 * figure9Hd(2, 40).hd, 12);
  });
  it('Cap. 9: smooth roofs over 2 %, others over 16 %; 0,4 p_f W over 4,5 m', () => {
    expect(slidingSnow({ pf: 1, slopePercent: 2, slippery: true, W: 10 }).applies).toBe(false);
    expect(slidingSnow({ pf: 1, slopePercent: 2.01, slippery: true, W: 10 }).applies).toBe(true);
    expect(slidingSnow({ pf: 1, slopePercent: 16, slippery: false, W: 10 }).applies).toBe(false);
    const s = slidingSnow({ pf: 1.2, slopePercent: 30, slippery: false, W: 10 });
    expect(s.perMetre).toBeCloseTo(0.4 * 1.2 * 10, 12);
    expect(s.intensity).toBeCloseTo(s.perMetre / 4.5, 12);
  });
});
