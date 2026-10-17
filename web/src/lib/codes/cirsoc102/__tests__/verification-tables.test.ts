/**
 * CIRSOC 102-2025: every table the wind modules transcribe, re-read from the official text.
 *
 * The modules' tables were typed by hand. Here each one is parsed a second time, by a different
 * path, out of the converted regulation (`docs/codes/CIRSOC/markdown/cirsoc-102-2025/`, whose PDF
 * digest `SOURCES.md` records), and diffed row by row against what the module returns. Nothing
 * below copies a value from a module: the expected side is whatever the page prints. Where the
 * text layer scrambles a table beyond parsing (Figura 2.4-1's roof grid), the transcription is a
 * second one by hand, cell by cell, and says so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CP_SIDE_WALL, CP_WINDWARD_WALL, EXPOSURE_CONSTANTS, KD, SERVICE_WIND_FACTOR,
  classifyEnclosure, cpLeewardWall, flatRoofCp, groundElevationFactor, internalPressureCoefficient,
  roofCp, velocityPressureExposureCoefficient, type Exposure,
} from '../wind';
import { claddingPressures, type CladdingRoof } from '../cladding';
import { chimneyCf, freeRoofCn, freeRoofCnAlong, openSignCf, solidSignCf, towerCf } from '../other-structures';

const DIR = '../../../../../../docs/codes/CIRSOC/markdown/cirsoc-102-2025/';
const read = (f: string) => readFileSync(new URL(DIR + f, import.meta.url), 'utf8');
const CH1 = read('capitulo-1-cargas-de-viento-requisitos-generales.md');
const CH2 = read('capitulo-2-cargas-de-viento-sobre-edificios-sistemas.md');
const CH4 = read('capitulo-4-cargas-de-viento-sobre-accesorios-de-edificios.md');
const CH5 = read('capitulo-5-cargas-de-viento.md');
const APB = read('apendice-b-combinaciones-de-cargas-que-incluyen-carga.md');

/** "1,80" / "–1.4" / "- 0,55" → number; the text layer prints both dashes and both separators. */
const num = (s: string) => Number(s.replace(/[–−]/g, '-').replace(/-\s+/, '-').replace(',', '.'));
const NUM = /[-–−]?\s?\d+(?:[.,]\d+)?/g;
const nums = (s: string): number[] => [...s.matchAll(NUM)].map((m) => num(m[0]));

/** The lines from the first one matching `start` up to the first after it matching `end`. */
function section(text: string, start: RegExp, end: RegExp): string[] {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) throw new Error(`no ${start}`);
  const j = lines.findIndex((l, k) => k > i && end.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : j);
}
/** The normative column only: the left part of a two-column page (SOURCES.md, limitation 1). */
const left = (l: string, width = 64) => l.slice(0, width);

// ─── Chapter 1 ──────────────────────────────────────────────────

describe('Tabla 1.9-1: exposure constants (p. 58)', () => {
  const t = section(CH1, /^Tabla 1\.9-1\. Constantes de exposición/, /zmin:\s+altura mínima/);
  const rows = Object.fromEntries(t.map((l) => l.match(/^\s+([BCD])\s+(.*)$/)).filter((m) => m).map((m) => {
    // 7,5  1000  1/7,5  0,84  1/4,5  0,47  0,30  98  1/3,0  9,2
    const cells = m![2]!.trim().split(/\s+/).map((c) => (c.startsWith('1/') ? 1 / num(c.slice(2)) : num(c)));
    return [m![1]!, cells];
  }));
  it.each(['B', 'C', 'D'] as Exposure[])('exposure %s, every column', (e) => {
    const [alpha, zg, alphaHat, bHat, alphaBar, bBar, c, ell, epsBar, zmin] = rows[e]!;
    const k = EXPOSURE_CONSTANTS[e];
    expect(rows[e]).toHaveLength(10);
    expect(k.alpha).toBe(alpha); expect(k.zg).toBe(zg);
    expect(k.alphaHat).toBeCloseTo(alphaHat!, 12); expect(k.bHat).toBe(bHat);
    expect(k.alphaBar).toBeCloseTo(alphaBar!, 12); expect(k.bBar).toBe(bBar);
    expect(k.c).toBe(c); expect(k.ell).toBe(ell);
    expect(k.epsBar).toBeCloseTo(epsBar!, 12); expect(k.zmin).toBe(zmin);
  });
});

describe('Tabla 1.13-1: K_z, every printed row against the note-1 expression (p. 78)', () => {
  const t = section(CH1, /^Tabla 1\.13-1\. Coeficientes de exposición/, /^ Notas:/);
  const rows = t.map((l) => l.match(/^\s+(0-5|\d+)\s+(\d,\d\d)\s+(\d,\d\d)\s+(\d,\d\d)/)).filter((m) => m)
    .map((m) => [m![1] === '0-5' ? 5 : Number(m![1]), num(m![2]!), num(m![3]!), num(m![4]!)] as const);
  it('parses all 20 rows', () => expect(rows).toHaveLength(20));
  // The commentary says the table kept the 2005 values where the new ones fall within 0,01 of them;
  // every row is in fact within the printing's half unit of the formula, so the formula the module
  // uses (note 1 permits it) is the table to two decimals.
  it.each(rows)('z = %s m', (z, b, c, d) => {
    expect(Math.abs(velocityPressureExposureCoefficient(z, 'B') - b)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(velocityPressureExposureCoefficient(z, 'C') - c)).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(velocityPressureExposureCoefficient(z, 'D') - d)).toBeLessThanOrEqual(0.0051);
  });
  it('edges: the "0-5" row below 5 m, z_g, above z_g and above 1000 m', () => {
    for (const e of ['B', 'C', 'D'] as Exposure[]) {
      const k5 = velocityPressureExposureCoefficient(5, e);
      expect(velocityPressureExposureCoefficient(0, e)).toBe(k5);
      expect(velocityPressureExposureCoefficient(4.99, e)).toBe(k5);
      const zg = EXPOSURE_CONSTANTS[e].zg;
      expect(velocityPressureExposureCoefficient(zg, e)).toBeCloseTo(2.41, 12);
      if (zg < 1000) expect(velocityPressureExposureCoefficient(zg + 1, e)).toBe(2.41);
      expect(velocityPressureExposureCoefficient(1000, e)).toBeCloseTo(2.41, 12);
      expect(velocityPressureExposureCoefficient(1000.1, e)).toBeNaN();
    }
  });
  it('between rows the value lies between the rows (note 3 interpolation never exceeded downward)', () => {
    for (let i = 1; i < rows.length; i++) {
      const [z0, ...a] = rows[i - 1]!, [z1, ...b] = rows[i]!;
      (['B', 'C', 'D'] as Exposure[]).forEach((e, k) => {
        const mid = velocityPressureExposureCoefficient((z0 + z1) / 2, e);
        // The power law is concave, so the formula at mid-height is at or above the chord.
        expect(mid).toBeGreaterThanOrEqual((a[k]! + b[k]!) / 2 - 0.0051);
        expect(mid).toBeLessThanOrEqual(b[k]! + 0.0051);
      });
    }
  });
});

describe('Tabla 1.12-1: K_e (p. 77)', () => {
  const t = section(CH1, /^Tabla 1\.12-1\. Factor de altitud/, /^ Notas:/);
  const rows = t.map((l) => l.match(/^\s+(\d+) ?m\s+(\d,\d\d)/)).filter((m) => m).map((m) => [Number(m![1]), num(m![2]!)] as const);
  it('parses the seven altitudes 0 to 1800 m', () => expect(rows.map((r) => r[0])).toEqual([0, 300, 600, 900, 1200, 1500, 1800]));
  // Note 2 allows the table or the expression. The module takes the expression; above 900 m the
  // printed rows (the ASCE 7-22 values at 4000, 5000 and 6000 ft, put at 1200, 1500 and 1800 m)
  // are up to 0,007 below it, so the expression is never the lower, unsafe, of the two.
  it.each(rows)('%i m', (z, ke) => {
    const f = groundElevationFactor(z);
    expect(f).toBeGreaterThanOrEqual(ke - 0.005);
    expect(f - ke).toBeLessThan(0.008);
  });
  it('below sea level it exceeds 1 (the conservative K_e = 1 of note 1 is then slightly unsafe, as the commentary says)', () => {
    expect(groundElevationFactor(-105)).toBeGreaterThan(1);
  });
});

describe('Tabla 1.6-1: K_d (p. 44)', () => {
  const t = section(CH1, /^Tabla 1\.6-1\. Factor de direccionalidad/, /El factor de direccionalidad Kd se ha calibrado/).map((l) => left(l, 60));
  const value = (label: RegExp) => {
    const i = t.findIndex((l) => label.test(l));
    if (i < 0) throw new Error(`no ${label}`);
    // The value sits on the label's line or, for a wrapped label, on the next (Redondas and
    // Octagonales carry a footnote glyph after it).
    for (const l of [t[i]!, t[i + 1]!]) { const m = l.slice(0, 58).match(/\s(\d,\d\d)(?![\d,])/); if (m) return num(m[1]!); }
    throw new Error(`no value for ${label}`);
  };
  it('every structure type the module names', () => {
    expect(KD.building).toBe(value(/la fuerza de viento/));
    expect(KD.archedRoof).toBe(value(/Cubiertas abovedadas/));
    expect(KD.chimneySquare).toBe(value(/^\s+Cuadradas/));
    expect(KD.chimneyHexagonal).toBe(value(/Hexagonales/));
    expect(KD.chimneyRound).toBe(value(/Redondas/));
    expect(KD.chimneyOctagonal).toBe(value(/Octagonales/));
    expect(KD.solidSign).toBe(value(/Carteles llenos/));
    expect(KD.openSign).toBe(value(/Carteles abiertos/));
    expect(KD.latticeTowerTriangularOrRect).toBe(value(/rectangular/));
    expect(KD.latticeTowerOther).toBe(value(/Toda otra sección/));
  });
});

describe('Tabla 1.11-1: (GCpi) and the enclosure criteria (p. 76)', () => {
  const t = section(CH1, /^Tabla 1\.11-1\. Coeficientes de presión interna/, /^ Notas:/).join('\n');
  it('magnitudes, in the order printed: open, partially open, partially enclosed, enclosed', () => {
    // Each classification's (GCpi) closes its line(s): 0,00, then ±0,18, ±0,55, ±0,18.
    // The value column starts past the criteria (whose "A0i / Agi ≤ 0,20" also ends a line).
    const vals = [...t.matchAll(/^.{80,}?([+-]?\s?\d,\d\d)\s*$/gm)].map((m) => Math.abs(num(m[1]!)));
    expect(vals).toEqual([0, 0.18, 0.18, 0.55, 0.55, 0.18, 0.18]);
    expect(internalPressureCoefficient('open')).toBe(vals[0]);
    expect(internalPressureCoefficient('partiallyOpen')).toBe(vals[1]);
    expect(internalPressureCoefficient('partiallyEnclosed')).toBe(vals[3]);
    expect(internalPressureCoefficient('enclosed')).toBe(vals[5]);
  });
  it('criteria at their boundaries: A0 = 0,8 Ag, A0 = min(0,01 Ag; 0,4 m²), A0 = 1,10 A0i, A0i/Agi = 0,20', () => {
    expect(t).toMatch(/A0 ≥ 0,8Ag/);
    expect(classifyEnclosure({ a0: 80, ag: 100, a0i: 0, agi: 100 })).toBe('open');
    expect(classifyEnclosure({ a0: 79.9, ag: 100, a0i: 0, agi: 100 })).toBe('partiallyEnclosed');
    // 0,01·Ag = 0,3 m² < 0,4 m²: the limit is 0,3.
    expect(classifyEnclosure({ a0: 0.3, ag: 30, a0i: 0, agi: 100 })).toBe('enclosed');
    expect(classifyEnclosure({ a0: 0.31, ag: 30, a0i: 0, agi: 100 })).toBe('partiallyEnclosed');
    // 0,01·Ag = 1 m² > 0,4 m²: the limit is 0,4.
    expect(classifyEnclosure({ a0: 0.4, ag: 100, a0i: 0, agi: 100 })).toBe('enclosed');
    expect(classifyEnclosure({ a0: 0.41, ag: 100, a0i: 0, agi: 100 })).toBe('partiallyEnclosed');
    // A0 must exceed 1,10 A0i strictly, and A0i/Agi ≤ 0,20 holds at equality.
    expect(classifyEnclosure({ a0: 11, ag: 100, a0i: 10, agi: 50 })).toBe('partiallyOpen');
    expect(classifyEnclosure({ a0: 11.1, ag: 100, a0i: 10, agi: 50 })).toBe('partiallyEnclosed');
    expect(classifyEnclosure({ a0: 30, ag: 100, a0i: 10, agi: 50 })).toBe('partiallyEnclosed');
    expect(classifyEnclosure({ a0: 30, ag: 100, a0i: 10.1, agi: 50 })).toBe('partiallyOpen');
  });
});

// ─── Chapter 2 ──────────────────────────────────────────────────

describe('Figura 2.4-1: wall coefficients (p. 104)', () => {
  const t = section(CH2, /^Figura 2\.4-1 \(cont\.\)/, /Coeficientes de presión para cubiertas/);
  const cp = (re: RegExp) => num(t.find((l) => re.test(l))!.match(re)![1]!);
  it('windward, side and the leeward rows with interpolation between them (note 2)', () => {
    expect(CP_WINDWARD_WALL).toBe(cp(/Pared a barlovento\s+Todos los valores\s+(-?\d,\d)/));
    expect(CP_SIDE_WALL).toBe(cp(/Paredes laterales\s+Todos los valores\s+(-?\d,\d)/));
    expect(cpLeewardWall(0)).toBe(cp(/^\s+0–1\s+(-?\d,\d)/));
    expect(cpLeewardWall(1)).toBe(cp(/^\s+0–1\s+(-?\d,\d)/));
    expect(cpLeewardWall(2)).toBeCloseTo(cp(/Pared a sotavento\s+2\s+(-?\d,\d)/), 12);
    expect(cpLeewardWall(4)).toBe(cp(/^\s+≥4\s+(-?\d,\d)/));
    expect(cpLeewardWall(100)).toBe(cp(/^\s+≥4\s+(-?\d,\d)/));
  });
});

/**
 * Figura 2.4-1's roof grid, second transcription by hand from p. 104 (the text layer interleaves
 * its two rows of values with the h/L labels). `upper`: each cell's first value, `lower`: its
 * second or only one; '#' the ≥ 60° column, printed as 0,01 θ.
 */
const THETAS = [10, 15, 20, 25, 30, 35, 45] as const;
const PRINTED: Record<string, { upper: Array<number | null>; lower: number[]; leeward: [number, number, number] }> = {
  '0.25': { upper: [-0.7, -0.5, -0.3, -0.2, -0.2, 0.0, null], lower: [-0.18, 0.0, 0.2, 0.3, 0.3, 0.4, 0.4], leeward: [-0.3, -0.5, -0.6] },
  '0.5': { upper: [-0.9, -0.7, -0.4, -0.3, -0.2, -0.2, 0.0], lower: [-0.18, -0.18, 0.0, 0.2, 0.2, 0.3, 0.4], leeward: [-0.5, -0.5, -0.6] },
  '1.0': { upper: [-1.3, -1.0, -0.7, -0.5, -0.3, -0.2, 0.0], lower: [-0.18, -0.18, -0.18, 0.0, 0.2, 0.2, 0.3], leeward: [-0.7, -0.6, -0.6] },
};

describe('Figura 2.4-1: roof coefficients, wind normal to the ridge, θ ≥ 10° (p. 104)', () => {
  it('the hand transcription agrees with the numbers the text layer does print', () => {
    const t = section(CH2, /^Figura 2\.4-1 \(cont\.\)/, /^Notas:/).join('\n');
    // Each h/L row's first line of values, in the order printed.
    expect(t).toMatch(/-0,7\s+-0,5\s+-0,3\s+-0,2\s+-0,2\s+0,0\*/);
    expect(t).toMatch(/-0,9\s+-0,7\s+-0,4\s+-0,3\s+-0,2\s+-0,2\s+0,0\*/);
    expect(t).toMatch(/-1,3\*\*\s+-1,0\s+-0,7\s+-0,5\s+-0,3\s+-0,2\s+0,0\*/);
    expect(t).toMatch(/-0,3\s+-0,5\s+-0,6/);
    expect(t).toMatch(/-0,5\s+-0,5\s+-0,6/);
    expect(t).toMatch(/-0,7\s+-0,6\s+-0,6/);
  });
  for (const [hl, row] of Object.entries(PRINTED)) {
    it(`h/L = ${hl}: every printed cell`, () => {
      THETAS.forEach((th, k) => {
        const r = roofCp(Number(hl), th);
        const want = [row.upper[k], row.lower[k]].filter((v): v is number => v !== null);
        expect(r.windward.length).toBe(new Set(want).size);
        for (const v of want) expect(r.windward.some((w) => Math.abs(w - v) < 1e-9)).toBe(true);
      });
      for (const th of [60, 70, 80]) expect(roofCp(Number(hl), th).windward).toEqual([+(0.01 * th).toFixed(4)]);
      expect(roofCp(Number(hl), 10).leeward[0]).toBeCloseTo(row.leeward[0], 12);
      expect(roofCp(Number(hl), 15).leeward[0]).toBeCloseTo(row.leeward[1], 12);
      for (const th of [20, 30, 60]) expect(roofCp(Number(hl), th).leeward[0]).toBeCloseTo(row.leeward[2], 12);
    });
  }
  it('outside the h/L rows: ≤ 0,25 takes the 0,25 row, ≥ 1,0 the 1,0 row', () => {
    expect(roofCp(0.05, 20)).toEqual(roofCp(0.25, 20));
    expect(roofCp(3, 20)).toEqual(roofCp(1.0, 20));
  });
  it('between h/L rows it interpolates (note 2); it used to round h/L up to the next row', () => {
    // 25°: 0,3 at h/L 0,25 and 0,2 at 0,5. At 0,26 the positive case is 0,296, not 0,2.
    const r = roofCp(0.26, 25);
    expect(Math.max(...r.windward)).toBeCloseTo(0.296, 12);
    expect(Math.min(...r.windward)).toBeCloseTo(-0.204, 12);
    // Between 0,5 and 1,0 at 30°: upper −0,2 → −0,3, lower 0,2 both, leeward −0,6.
    expect(roofCp(0.75, 30).windward).toEqual([-0.25, 0.2]);
  });
  it('past the upper row\'s 0,0*, no value of its sign: 0,0 for interpolation, then none (note 2)', () => {
    // h/L ≤ 0,25, 40°: the upper row is 0,0 between 35° and 45°, the lower 0,4.
    expect(roofCp(0.25, 40).windward).toEqual([0, 0.4]);
    expect(roofCp(0.25, 45).windward).toEqual([0.4]);
    expect(roofCp(0.5, 50).windward).toEqual([0, 0.4667]);
    expect(roofCp(0.5, 60).windward).toEqual([0.6]);
  });
  it('the footnote: above 80°, 0,8', () => {
    expect(roofCp(0.5, 80.01).windward).toEqual([0.8]);
  });
});

describe('Figura 2.4-1: roof by distance from the windward edge, θ < 10° and wind along the ridge (p. 104)', () => {
  const h = 10;
  it('h/L ≤ 0,5 rows, with −0,18 beside each (note 3), at the zone boundaries', () => {
    for (const hl of [0.1, 0.5]) {
      expect(flatRoofCp(hl, 0, h).cp).toEqual([-0.9, -0.18]);
      expect(flatRoofCp(hl, h / 2, h).cp).toEqual([-0.9, -0.18]);
      expect(flatRoofCp(hl, h, h).cp).toEqual([-0.9, -0.18]);
      expect(flatRoofCp(hl, h + 0.01, h).cp).toEqual([-0.5, -0.18]);
      expect(flatRoofCp(hl, 2 * h, h).cp).toEqual([-0.5, -0.18]);
      expect(flatRoofCp(hl, 2 * h + 0.01, h).cp).toEqual([-0.3, -0.18]);
    }
  });
  it('h/L ≥ 1,0 rows, without the area reduction of the ** note (which only lowers −1,3)', () => {
    for (const hl of [1, 2]) {
      expect(flatRoofCp(hl, h / 2, h).cp).toEqual([-1.3, -0.18]);
      expect(flatRoofCp(hl, h / 2 + 0.01, h).cp).toEqual([-0.7, -0.18]);
      expect(flatRoofCp(hl, 5 * h, h).cp).toEqual([-0.7, -0.18]);
    }
  });
});

const close = (got: { cnw: number; cnl: number }, cnw: number, cnl: number) => {
  expect(got.cnw).toBeCloseTo(cnw, 12);
  expect(got.cnl).toBeCloseTo(cnl, 12);
};

/** Rows of a free-roof figure: each angle followed by its A and B lines of numbers. */
function freeRoofRows(fig: RegExp, width: number): Array<{ theta: number; A: number[]; B: number[] }> {
  const t = section(CH2, fig, /^Notas:/);
  const out: Array<{ theta: number; A: number[]; B: number[] }> = [];
  let theta: number | null = null;
  let pendingA: number[] | null = null;
  for (const l of t) {
    const a = l.match(/^\s+(?:(\d+(?:,\d)?)º\s+)?([AB])\s+(.*)$/);
    const angleOnly = l.match(/^\s+(\d+(?:,\d)?)º\s*$/);
    if (angleOnly) theta = num(angleOnly[1]!);
    if (!a) continue;
    if (a[1]) theta = num(a[1]);
    const v = nums(a[3]!);
    if (v.length !== width) continue;
    if (a[2] === 'A') pendingA = v;
    else { out.push({ theta: theta!, A: pendingA!, B: v }); pendingA = null; }
  }
  return out;
}

describe('Figuras 2.4-4 to 2.4-7: free roofs (pp. 107-110)', () => {
  it('2.4-4, monoslope: every angle, case, blockage and direction (γ = 180° is the wind up the slope)', () => {
    const rows = freeRoofRows(/^Figura 2\.4-4\s+Coeficientes de presión neta/, 8);
    expect(rows.map((r) => r.theta)).toEqual([0, 7.5, 15, 22.5, 30, 37.5, 45]);
    for (const r of rows) {
      for (const c of ['A', 'B'] as const) {
        const [w0, l0, bw0, bl0, w180, l180, bw180, bl180] = r[c];
        close(freeRoofCn('monoslope', r.theta, c, false, false), w0!, l0!);
        close(freeRoofCn('monoslope', r.theta, c, true, false), bw0!, bl0!);
        close(freeRoofCn('monoslope', r.theta, c, false, true), w180!, l180!);
        close(freeRoofCn('monoslope', r.theta, c, true, true), bw180!, bl180!);
      }
    }
    // Note 3: below 7,5° the 0° coefficients.
    expect(freeRoofCn('monoslope', 7.4, 'A', false)).toEqual(freeRoofCn('monoslope', 0, 'A', false));
  });
  for (const [kind, fig] of [['pitched', /^Figura 2\.4-5\s+Coeficientes/], ['troughed', /^Figura 2\.4-6\s+Coeficientes/]] as const) {
    it(`${fig.source.slice(1, 13)}, ${kind}: every angle, case and blockage; below 7,5° the monoslope's`, () => {
      const rows = freeRoofRows(fig, 4);
      expect(rows.map((r) => r.theta)).toEqual([7.5, 15, 22.5, 30, 37.5, 45]);
      for (const r of rows) {
        for (const c of ['A', 'B'] as const) {
          const [w, l, bw, bl] = r[c];
          close(freeRoofCn(kind, r.theta, c, false), w!, l!);
          close(freeRoofCn(kind, r.theta, c, true), bw!, bl!);
        }
      }
      expect(freeRoofCn(kind, 5, 'B', true)).toEqual(freeRoofCn('monoslope', 0, 'B', true));
    });
  }
  it('2.4-7, wind along the ridge: x ≤ h, h < x ≤ 2h, x > 2h', () => {
    const t = section(CH2, /^Figura 2\.4-7\s+Coeficientes/, /^Notas:/);
    const ab = t.map((l) => l.match(/\s([AB])\s+(-?\d,\d)\s+(-?\d,\d)\s*$/)).filter((m) => m);
    expect(ab).toHaveLength(6);
    const xs = [0.5, 1.5, 3];
    ab.forEach((m, k) => {
      const x = xs[Math.floor(k / 2)]!, c = m![1] as 'A' | 'B';
      expect(freeRoofCnAlong(x, c, false)).toBe(num(m![2]!));
      expect(freeRoofCnAlong(x, c, true)).toBe(num(m![3]!));
    });
    expect(freeRoofCnAlong(1, 'A', false)).toBe(-0.8);
    expect(freeRoofCnAlong(2, 'A', false)).toBe(-0.6);
  });
});

// ─── Chapter 4 ──────────────────────────────────────────────────

describe('Figura 4.4-1: solid signs and walls, cases A and B (p. 138)', () => {
  const t = section(CH4, /Coeficientes de fuerza Cf, CASO A y CASO B/, /^<!-- page/);
  const bs = nums(t.find((l) => /≤ 0,05/.test(l))!.replace('≤', '').replace('≥', ''));
  const rows = t.map((l) => l.match(/^\s+(≤ )?(\d(?:,\d+)?)\s+((?:\d,\d\d\s+){11}\d,\d\d)\s*$/)).filter((m) => m)
    .map((m) => ({ sh: num(m![2]!), cf: nums(m![3]!) }));
  it('parses 7 rows of 12', () => {
    expect(bs).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2, 4, 5, 10, 20, 30, 45]);
    expect(rows.map((r) => r.sh)).toEqual([1, 0.9, 0.7, 0.5, 0.3, 0.2, 0.16]);
  });
  it('every cell, and the edge values beyond (≤ 0,05, ≥ 45, ≤ 0,16)', () => {
    for (const r of rows) bs.forEach((b, j) => expect(solidSignCf(b, r.sh)).toBeCloseTo(r.cf[j]!, 12));
    expect(solidSignCf(0.01, 0.1)).toBeCloseTo(rows[6]!.cf[0]!, 12);
    expect(solidSignCf(90, 1)).toBeCloseTo(rows[0]!.cf[11]!, 12);
  });
  it('interpolates between rows and columns (note 4)', () => {
    // s/h 0,9 row: (1,55 + 1,50)/2; 0,7 row: (1,65 + 1,60)/2; halfway: 1,575.
    expect(solidSignCf(1.5, 0.8)).toBeCloseTo(1.575, 12);
  });
});

describe('Figura 4.5-1: chimneys and tanks (p. 140)', () => {
  const t = section(CH4, /^Figura 4\.5-1\s+Coeficientes de fuerza/, /^Notación/).join('\n');
  const triple = (re: RegExp) => nums(t.match(re)![1]!);
  const cases = [
    ['squareNormal', /Todas\s+(1,3\s+1,4\s+2,0)/], ['squareDiagonal', /Todas\s+(1,0\s+1,1\s+1,5)/],
    ['hexOct', /Todas\s+(1,0\s+1,2\s+1,4)/], ['roundSmooth', /(0,5\s+0,6\s+0,7)/],
    ['roundRough', /(0,7\s+0,8\s+0,9)/], ['roundVeryRough', /(0,8\s+1,0\s+1,2)/],
  ] as const;
  it.each(cases)('%s at h/D 1, 7, 25 and the D√qz ≤ 5,3 row for round sections', (section, re) => {
    const [a, b, c] = triple(re);
    expect(chimneyCf(section, 1, 10)).toBeCloseTo(a!, 12);
    expect(chimneyCf(section, 7, 10)).toBeCloseTo(b!, 12);
    expect(chimneyCf(section, 25, 10)).toBeCloseTo(c!, 12);
    expect(chimneyCf(section, 4, 10)).toBeCloseTo((a! + b!) / 2, 12);
  });
  it('round with D√qz ≤ 5,3: 0,7 0,8 1,2 whatever the surface; > 5,3 at the boundary takes the surface row', () => {
    const [a, b, c] = triple(/Todas\s+(0,7\s+0,8\s+1,2)/);
    for (const s of ['roundSmooth', 'roundRough', 'roundVeryRough'] as const) {
      expect([chimneyCf(s, 1, 5.3), chimneyCf(s, 7, 5.3), chimneyCf(s, 25, 5.3)]).toEqual([a, b, c]);
    }
    expect(chimneyCf('roundSmooth', 1, 5.31)).toBe(0.5);
  });
});

describe('Figura 4.5-2: open signs and lattice frameworks (p. 141)', () => {
  const t = section(CH4, /^Figura 4\.5-2\s+Coeficientes de fuerza/, /^Notación/);
  const rows = t.map((l) => l.match(/^\s+(< 0,1|0,1 a 0,29|0,3 a 0,7)\s+(\d(?:,\d)?)\s+(\d,\d)\s+(\d,\d)/)).filter((m) => m)
    .map((m) => [num(m![2]!), num(m![3]!), num(m![4]!)]);
  it('three solidity bands, at their edges', () => {
    expect(rows).toHaveLength(3);
    for (const [eps, k] of [[0.05, 0], [0.099, 0], [0.1, 1], [0.29, 1], [0.3, 2], [0.7, 2]] as const) {
      expect([openSignCf(eps, 'flat'), openSignCf(eps, 'roundSmall'), openSignCf(eps, 'roundLarge')]).toEqual(rows[k]);
    }
  });
});

describe('Figura 4.5-3: trussed towers (p. 142)', () => {
  const t = section(CH4, /^Figura 4\.5-3\s+Coeficientes de fuerza/, /^<!-- page/).join('\n');
  it('the printed polynomials and the two notes\' factors', () => {
    // ε is a private-use glyph in the text layer: matched as any one character.
    expect(t).toMatch(/Cuadrado\s+4,0 .2 – 5,9 . \+ 4,0/u);
    expect(t).toMatch(/Triángulo\s+3,4 .2 – 4,7 . \+ 3,4/u);
    expect(t).toMatch(/0,51 .2 \+ 0,57, pero no > 1,0/u);
    expect(t).toMatch(/1 \+ 0,75 ., pero no > 1,2/u);
    for (const e of [0.1, 0.25, 0.5]) {
      expect(towerCf(e, 'square', false)).toBeCloseTo(4 * e * e - 5.9 * e + 4, 12);
      expect(towerCf(e, 'triangle', false)).toBeCloseTo(3.4 * e * e - 4.7 * e + 3.4, 12);
      expect(towerCf(e, 'square', true)).toBeCloseTo((4 * e * e - 5.9 * e + 4) * Math.min(1, 0.51 * e * e + 0.57), 12);
      expect(towerCf(e, 'square', false, true)).toBeCloseTo((4 * e * e - 5.9 * e + 4) * Math.min(1.2, 1 + 0.75 * e), 12);
    }
    // The diagonal factor caps at 1,2 from ε = 0,267 on.
    expect(towerCf(0.4, 'square', false, true) / towerCf(0.4, 'square', false)).toBeCloseTo(1.2, 12);
  });
});

// ─── Chapter 5: the commentary's equations for the C&C curves ───

/**
 * Tablas C 5.3-1 to C 5.3-8 (pp. 159-161) parsed into zone → [area breakpoints, value] curves:
 * the first constant, the log-linear piece and the last constant, read from the printed lines.
 */
function ccTable(title: RegExp): Map<string, { pos: boolean; f: (a: number) => number }> {
  const t = section(CH5, title, /Tabla C 5\.3-\d|^Reglamento CIRSOC|Algunas de las/);
  const out = new Map<string, { pos: boolean; f: (a: number) => number }>();
  let sign: 'pos' | 'neg' = 'pos';
  let zone = '';
  let pieces: Array<{ lo: number; hi: number; a: number; b: number }> = [];
  const flush = () => {
    if (!zone || pieces.length === 0) return;
    const ps = pieces;
    const f = (A: number) => {
      const p = ps.find((q) => A > q.lo && A <= q.hi) ?? (A <= ps[0]!.hi ? ps[0]! : ps[ps.length - 1]!);
      return p.a + p.b * Math.log10(A);
    };
    for (const z of zone.split(',')) out.set(`${sign}:${z}`, { pos: sign === 'pos', f });
    pieces = [];
  };
  for (const raw of t) {
    const l = raw.replace(/[–−]/g, '-');
    if (/Negativo con voladizo/.test(l)) { flush(); break; }
    // A "Positivo:"/"Negativo:" line can carry the curve's first piece (Tabla C 5.3-1).
    if (/Positivo/.test(l)) { flush(); sign = 'pos'; zone = ''; }
    if (/Negativo/.test(l)) { flush(); sign = 'neg'; zone = ''; }
    const head = l.match(/^\s+(Todas las zonas|Zonas? [^G]+?)\s+GCp/);
    if (head) {
      flush();
      const z = head[1]!.replace(/Zonas? /, '').replace(/ y /g, ',').replace(/\s/g, '');
      zone = z === 'Todaslaszonas' ? '*' : z;
    }
    const m = l.match(/GCp = (-?\s?\d+[.,]\d+)(?:\s*([+-])\s*(\d+[.,]\d+) log A)?\s+(?:(\d+[.,]?\d*) <\s*)?A\s*([≤>])\s*(\d+[.,]?\d*) m2/);
    if (!m) continue;
    const a = num(m[1]!.replace(/\s/g, '')), b = m[2] ? (m[2] === '-' ? -1 : 1) * num(m[3]!) : 0;
    const lo = m[4] ? num(m[4]) : m[5] === '>' ? num(m[6]!) : 0;
    const hi = m[5] === '≤' ? num(m[6]!) : Infinity;
    pieces.push({ lo, hi, a, b });
  }
  flush();
  return out;
}

describe('Tablas C 5.3-1 to C 5.3-8: components and cladding, h ≤ 20 m (pp. 159-161)', () => {
  const AREAS = [0.5, 1, 1.5, 2, 3, 5, 8.33, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200];
  const rowsOf = (roof: CladdingRoof, slope: number, a: number) =>
    claddingPressures({ qhNm2: 1000, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: slope, roof, gcpi: 0, areaM2: a }).rows;
  const check = (title: RegExp, roof: CladdingRoof, slope: number, surface: 'wall' | 'roof', zones: string[]) => {
    const tab = ccTable(title);
    for (const z of zones) {
      for (const sign of ['pos', 'neg'] as const) {
        const curve = tab.get(`${sign}:${z}`) ?? tab.get(`${sign}:*`);
        expect(curve, `${title.source} ${sign} zone ${z}`).toBeDefined();
        for (const a of AREAS) {
          const row = rowsOf(roof, slope, a).find((r) => r.surface === surface && r.zone === z)!;
          const got = sign === 'pos' ? row.gcpPos! : row.gcpNeg;
          // The commentary prints the slopes to four digits: the curves agree to their rounding.
          expect(Math.abs(got - curve!.f(a)), `${title.source} ${sign} zone ${z} A=${a}`).toBeLessThan(0.002);
        }
      }
    }
  };
  it('C 5.3-1, walls (unreduced: a roof steeper than 10°)', () => check(/Tabla C 5\.3-1\. Paredes/, 'gable', 15, 'wall', ['4', '5']));
  it('C 5.3-2, gable θ ≤ 7°, without overhang', () => check(/Tabla C 5\.3-2\. Cubierta a dos aguas/, 'gable', 5, 'roof', ["1'", '1', '2', '3']));
  it('C 5.3-3, gable 7° < θ ≤ 20°', () => check(/Tabla C 5\.3-3\. Cubierta a dos aguas/, 'gable', 15, 'roof', ['1', '2', '3']));
  it('C 5.3-4, gable 20° < θ ≤ 27°', () => check(/Tabla C 5\.3-4\. Cubierta a dos aguas/, 'gable', 25, 'roof', ['1', '2', '3']));
  it('C 5.3-5, gable 27° < θ ≤ 45°', () => check(/Tabla C 5\.3-5\. Cubierta a dos aguas/, 'gable', 35, 'roof', ['1', '2', '3']));
  it('C 5.3-6, hip 7° < θ ≤ 20°', () => check(/Tabla C 5\.3-6\. Cubierta a cuatro aguas/, 'hip', 15, 'roof', ['1', '2', '3']));
  it('C 5.3-7, hip 20° < θ ≤ 27°', () => check(/Tabla C 5\.3-7\. Cubierta a cuatro aguas/, 'hip', 25, 'roof', ['1', '2', '3']));
  it('C 5.3-8, hip θ = 45°', () => check(/Tabla C 5\.3-8\. Cubierta a cuatro aguas/, 'hip', 45, 'roof', ['1', '2', '3']));
  it('slope boundaries: 7° is Fig. 5.3-2A, 7,01° is 5.3-2B; 20° is 2B, 20,01° 2C; 27° 2C, 27,01° 2D', () => {
    const zone3 = (s: number) => rowsOf('gable', s, 1).find((r) => r.surface === 'roof' && r.zone === '3')!.gcpNeg;
    expect(zone3(7)).toBeCloseTo(-3.2, 12);
    expect(zone3(7.01)).toBeCloseTo(-3.6, 12);
    expect(zone3(20)).toBeCloseTo(-3.6, 12);
    expect(zone3(20.01)).toBeCloseTo(-3.0, 12);
    expect(zone3(27)).toBeCloseTo(-3.0, 12);
    expect(zone3(27.01)).toBeCloseTo(-2.5, 12);
  });
  it('§5.2.2 and Figura 5.3-1 note 5 as printed', () => {
    const t = section(CH5, /^### 5\.2\.2 Presiones de viento de diseño mínimas/, /^<a id/).join(' ');
    expect(t).toMatch(/presión neta de 0,80 kN\/m2/);
    expect(CH5).toMatch(/Los valores de \(GCp\) para paredes se deben reducir en un 10 % cuando .{1,3}≤ 10°/u);
    const tiny = claddingPressures({ qhNm2: 100, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: 15, gcpi: 0.18, areaM2: 10 });
    for (const r of tiny.rows) { expect(r.pPos).toBe(0.8); expect(r.pNeg).toBe(-0.8); }
    const flat = rowsOf('gable', 10, 1).find((r) => r.surface === 'wall' && r.zone === '5')!;
    const steep = rowsOf('gable', 10.01, 1).find((r) => r.surface === 'wall' && r.zone === '5')!;
    expect(flat.gcpNeg).toBeCloseTo(0.9 * steep.gcpNeg, 12);
  });
});

// ─── Apéndice B ─────────────────────────────────────────────────

describe('Figura C AB.4.2-1: service wind conversion factors (p. 246)', () => {
  const t = section(APB, /^Figura C AB\.4\.2-1/, /^<a id/);
  const rows = t.map((l) => l.match(/^\s+(\d+)\s+(\d,\d\d)\s*$/)).filter((m) => m).map((m) => [Number(m![1]), num(m![2]!)] as const);
  it('every recurrence', () => {
    expect(rows.map((r) => r[0])).toEqual([500, 200, 100, 50, 25, 10, 5]);
    for (const [mri, f] of rows) expect(SERVICE_WIND_FACTOR[mri as keyof typeof SERVICE_WIND_FACTOR]).toBe(f);
  });
});
