/**
 * INPRES-CIRSOC 103 Parte I (2018): every transcribed table, re-read from the official text.
 *
 * The module's tables were typed by hand. Here each one is parsed a second time, by a
 * different path, straight out of the converted regulation
 * (`docs/codes/CIRSOC/markdown/inpres-cirsoc-103-i/`, whose PDF digest `SOURCES.md` records),
 * and diffed row by row. Nothing below copies a value from the module: the expected side is
 * whatever the page prints.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { designSpectrum, isBlocked, ZONE_AS, ZONE_T3, RISK_FACTOR, SIMULTANEITY_F1, SIMULTANEITY_F2, type SiteClass } from '../spectrum';
import { BEHAVIOUR_TABLE_2018 } from '../behaviour';
import { PERIOD_COEFFICIENTS, periodCapFactor, staticMethodApplicable } from '../static-method';
import { ACCIDENTAL_ECCENTRICITY } from '../../../engine/loads/seismic-cases';

const DIR = '../../../../../../docs/codes/CIRSOC/markdown/inpres-cirsoc-103-i/';
const read = (f: string) => readFileSync(new URL(DIR + f, import.meta.url), 'utf8');
const CH2 = read('capitulo-2-accion-sismica-zonificacion-y-metodos-de.md');
const CH3 = read('capitulo-3-espectros-acciones-y-combinaciones-de.md');
const CH5 = read('capitulo-5-factores-de-comportamiento-de-la.md');
const CH6 = read('capitulo-6-metodo-estatico.md');

/** "0 ,37" / "2,5" / "3.5" → number. The text layer splits some decimals with a space. */
const nums = (s: string): number[] =>
  [...s.replace(/(\d) ,(\d)/g, '$1,$2').matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));

/** The lines from the first one matching `start` up to the first after it matching `end`. */
function section(text: string, start: RegExp, end: RegExp): string[] {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) throw new Error(`no ${start}`);
  const j = lines.findIndex((l, k) => k > i && end.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : j);
}

describe('Tabla 3.1: as, Ca and Cv (p. 49)', () => {
  const t = section(CH3, /Tabla 3\.1 Valores de as/, /En todos los casos/);
  const header = t.find((l) => /as = /.test(l))!;
  const asRow = nums(header);                 // zones 4, 3, 2, 1 as printed
  const rows: Record<1 | 2 | 3, number[]> = {
    1: nums(t.find((l) => /^\s*1 \(SA, SB, SC\)/.test(l))!.split(')')[1]!),
    2: nums(t.find((l) => /^\s*2 \(SD\)/.test(l))!.split(')')[1]!),
    3: nums(t.find((l) => /^\s*3 \(SE\)/.test(l))!.split(')')[1]!),
  };
  const zonesInPrintOrder = [4, 3, 2, 1] as const;

  it('the parse found four zones and eight numbers per row', () => {
    expect(asRow).toEqual([0.35, 0.25, 0.15, 0.08]);
    for (const r of Object.values(rows)) expect(r).toHaveLength(8);
  });

  it('as by zone', () => {
    zonesInPrintOrder.forEach((z, k) => expect(ZONE_AS[z]).toBe(asRow[k]));
  });

  const siteOf: Record<1 | 2 | 3, SiteClass[]> = { 1: ['SA', 'SB', 'SC'], 2: ['SD'], 3: ['SE'] };
  for (const type of [1, 2, 3] as const) {
    for (const site of siteOf[type]) {
      it(`row ${type}, site ${site}: every zone, with Na = 1 and Nv = 1,2 [3.11]/[3.12] where printed`, () => {
        zonesInPrintOrder.forEach((zone, k) => {
          const s = designSpectrum({ zone, site });
          if (isBlocked(s)) throw new Error('blocked');
          // Zones 4 and 3 print "0,37 Na" / "0,51 Nv"; zones 2 and 1 a plain number.
          const near = zone >= 3;
          expect(s.ca).toBeCloseTo(rows[type][2 * k]! * (near ? 1 : 1), 12);
          expect(s.cv).toBeCloseTo(rows[type][2 * k + 1]! * (near ? 1.2 : 1), 12);
          expect(s.type).toBe(type);
        });
      });
    }
  }
});

describe('Tabla 3.2: T3 (p. 50)', () => {
  const t = section(CH3, /Tabla 3\.2 Valor del período T3/, /<a id="c3\.6">/);
  const pairs = t.map((l) => nums(l)).filter((n) => n.length === 2);
  it('four rows, each equal to the module', () => {
    expect(pairs.map((p) => p[0])).toEqual([4, 3, 2, 1]);
    for (const [z, t3] of pairs) expect(ZONE_T3[z as 1 | 2 | 3 | 4]).toBe(t3);
  });
});

describe('Tabla 3.3: simultaneity factors f1 and f2 (p. 51)', () => {
  const t = section(CH3, /Tabla 3\.3 Factor de simultaneidad/, /\(\*\) Se hará/);
  const values = t.map((l) => l.match(/\s(\d,\d\d|0)\s*$/)?.[1]).filter((v): v is string => !!v).map((v) => Number(v.replace(',', '.')));
  it('the printed column, in order', () => {
    // f1: exceptional, reduced, intermediate, high, full, local verification, other; f2: retaining, other.
    expect(values).toEqual([0, 0.25, 0.5, 0.75, 1, 1, 0.2, 0.7, 0.2]);
  });
  it('the module carries the same numbers', () => {
    const [ex, red, inter, high, full, , other, ret, sOther] = values;
    expect(SIMULTANEITY_F1).toEqual({ exceptional: ex, reduced: red, intermediate: inter, high, full, other });
    expect(SIMULTANEITY_F2).toEqual({ retaining: ret, other: sOther });
  });
});

describe('§2.4: γr by destination group (pp. 35–36)', () => {
  const groups = [...CH2.matchAll(/### 2\.4\.\d Grupo (Ao|A|B|C)\s+\S*\s*r\s+\S*\s*(\d ?,\d)/g)]
    .map((m) => [m[1]!, Number(m[2]!.replace(/\s/g, '').replace(',', '.'))] as const);
  it('four headings, each equal to the module', () => {
    expect(groups.map((g) => g[0])).toEqual(['Ao', 'A', 'B', 'C']);
    for (const [g, v] of groups) expect(RISK_FACTOR[g as keyof typeof RISK_FACTOR]).toBe(v);
  });
});

describe('Tabla 5.1: R, Cd and Ωo (pp. 60–61)', () => {
  const t = section(CH5, /Tabla 5\.1\. Factores de comportamiento/, /Notas aclaratorias a Tabla 5\.1/);
  const N = String.raw`(\d+(?:[.,]\d+)?)`;
  const rowRe = new RegExp(String.raw`^\s*(\d{1,2})\s{2,}.*?\s{2,}` + N + String.raw`\s+` + N + String.raw`\s+` + N + String.raw`\s*$`);
  const parsed = new Map<number, [number, number, number]>();
  for (const l of t) {
    const m = l.match(rowRe);
    if (!m) continue;
    const row = Number(m[1]);
    if (parsed.has(row)) throw new Error(`row ${row} twice`);
    parsed.set(row, [m[2]!, m[3]!, m[4]!].map((v) => Number(v.replace(',', '.'))) as [number, number, number]);
  }

  it('rows 2 to 36 parsed exactly once', () => {
    expect([...parsed.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 35 }, (_, i) => i + 2));
  });

  it('every numeric row equals the module (R, Cd, Ωo)', () => {
    for (const [row, [r, cd, om]] of parsed) {
      const e = BEHAVIOUR_TABLE_2018.find((x) => x.row === row)!;
      expect({ row, r: e.r, cd: e.cd, omega0: e.omega0 }).toEqual({ row, r, cd, omega0: om });
    }
  });

  it('row 1 prints a formula, R = (3 + A/5)·z with 5z ≤ R ≤ 7, Cd = R and Ωo = 2,5', () => {
    const l = t.find((x) => /^\s*1\s+Tabiques aislados y acoplados/.test(x))!;
    expect(l).toMatch(/\sR\s+2,5\s*$/);
    const row1 = BEHAVIOUR_TABLE_2018.find((x) => x.row === 1)!;
    expect(row1.r).toBeNull();
    expect(row1.formula).toBe(true);
    expect(row1.omega0).toBe(2.5);
  });

  it('§5.1.2 [5.1]: R = 1,5 for elastic design', () => {
    expect(CH5).toMatch(/R\s+\S?\s*1,5\s+\[5\.1\]/);
  });
});

describe('Tabla 6.1: Cu (p. 68)', () => {
  const t = section(CH6, /Tabla 6\.1\. Coeficiente para el límite superior/, /Pueden interpolarse/);
  const rows = t.map((l) => nums(l)).filter((n) => n.length === 2);
  it('four rows; the module returns each printed value at its as', () => {
    expect(rows).toEqual([[0.35, 1.4], [0.25, 1.45], [0.15, 1.6], [0.08, 1.7]]);
    for (const [as, cu] of rows) expect(periodCapFactor(as!)).toBeCloseTo(cu!, 12);
  });
  it('"≥ 0,35" and "≤ 0,08" hold the end values outside the range', () => {
    expect(periodCapFactor(0.5)).toBe(1.4);
    expect(periodCapFactor(0.02)).toBe(1.7);
  });
  it('"pueden interpolarse valores intermedios": linear between rows', () => {
    expect(periodCapFactor(0.20)).toBeCloseTo((1.6 + 1.45) / 2, 12);
    expect(periodCapFactor(0.30)).toBeCloseTo((1.45 + 1.4) / 2, 12);
    expect(periodCapFactor(0.115)).toBeCloseTo((1.7 + 1.6) / 2, 12);
  });
});

describe('Tabla 6.2: Cr and x (p. 69)', () => {
  const t = section(CH6, /Tabla 6\.2\. Valores de Cr y x/, /<a id="c6\.2\.4">/);
  const rows = t.map((l) => l.match(/(0,\d{4})\s+(0,\d\d)\s*$/)).filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ cr: Number(m[1]!.replace(',', '.')), x: Number(m[2]!.replace(',', '.')) }));
  it('four rows in print order: steel frame, RC frame, steel EBF/BRB, other', () => {
    expect(rows).toHaveLength(4);
    expect([PERIOD_COEFFICIENTS.steelMomentFrame, PERIOD_COEFFICIENTS.concreteMomentFrame,
      PERIOD_COEFFICIENTS.steelEccentricOrBRB, PERIOD_COEFFICIENTS.other]).toEqual(rows);
  });
});

describe('Tabla 6.3: accidental eccentricity (p. 70)', () => {
  const t = section(CH6, /Tabla 6\.3\. Excentricidad Accidental/, /<a id="c6\.3">/).join(' ');
  it('0, 5 % and 10 % of the plan length', () => {
    expect(t).toMatch(/0 \(cero\)/);
    expect(t).toMatch(/5% de la longitud de la planta/);
    expect(t).toMatch(/10% de la longitud de la planta/);
    expect(ACCIDENTAL_ECCENTRICITY).toEqual({ low: 0, medium: 0.05, extreme: 0.1 });
  });
});

describe('Tabla 2.5: the static method\'s height limits (p. 39)', () => {
  const t = section(CH2, /Tabla 2\.5\. Condiciones para la aplicación/, /\(\*\) Construcciones de la zona 0/);
  const high = nums(t.find((l) => /^\s*3y4\s/.test(l))!.replace('3y4', '')).slice(0, 3);
  const low = nums(t.find((l) => /^\s*0\*, 1 y 2/.test(l))!.replace(/0\*, 1 y 2/, '')).slice(0, 3);
  it('the printed heights for Ao, A, B', () => {
    expect(high).toEqual([12, 30, 45]);
    expect(low).toEqual([16, 45, 60]);
  });
  // A regular building of 10 levels: the limit is the only thing that can block it.
  const ok = (zone: 1 | 2 | 3 | 4, group: 'Ao' | 'A' | 'B', h: number) =>
    staticMethodApplicable({ zone, group, heightM: h, levels: 10, regularity: 'regular' }).allowed;
  for (const [zone, lim] of [[4, high], [3, high], [2, low], [1, low]] as const) {
    (['Ao', 'A', 'B'] as const).forEach((g, k) => {
      it(`zone ${zone}, group ${g}: allowed at ${lim[k]} m, refused just above`, () => {
        expect(ok(zone, g, lim[k]!)).toBe(true);
        expect(ok(zone, g, lim[k]! + 0.01)).toBe(false);
      });
    });
  }
});
