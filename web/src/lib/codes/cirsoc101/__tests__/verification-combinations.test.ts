/**
 * The combination generators against the official texts, read independently.
 *
 * The printed combinations are parsed here from the converted regulation (docs/codes/CIRSOC/
 * markdown), not copied from `combinations.ts`: CIRSOC 101-2025 §2.3.2 (p. 51), CIRSOC 102-2025
 * Apéndice B.3.2 and B.4.2 (pp. 242–244) and INPRES-CIRSOC 103-2018 Parte I §3.7.1 (p. 53).
 *
 * Then, for every subset of the loads a model can have, two properties:
 *
 *  - soundness: every generated strength combination is one the text prints, factor for factor,
 *    with some of its loads not acting;
 *  - completeness in effect: for random load effects, every printed combination with any subset
 *    of its variable loads not acting (§2.3.2: "Se deberán investigar los efectos de una o más
 *    cargas que no estén actuando") is inside the envelope of the generated set, sign by sign.
 *    W and E are never together (§2.3.2, and 103 §3.7.4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateCombinations, type CombinationInputs, type CombinationTerm, type LoadSymbol } from '../combinations';
import { generateServiceCombinations } from '../service-combinations';

const MD = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../../../../docs/codes/CIRSOC/markdown/${rel}`, import.meta.url)), 'utf8');
/**
 * The normative (left) column of a two-column page: the first 58 characters of each line, less a
 * stray first letter of the commentary column where a line runs into it.
 */
const left = (s: string) => s.split('\n').map((l) => l.slice(0, 58).replace(/\s{3,}\S$/, '')).join('\n');

/** One slot of a printed combination: a factor and the loads it may be ("Lr ó S ó R"). */
interface Slot { options: Array<{ symbol: LoadSymbol; factor: number }> }

/** "1,2 D + 1,6 (Lr ó S ó R) + (L ó 0,5 W)" → slots. */
function parseCombination(text: string): Slot[] {
  const num = (s: string) => Number(s.replace(',', '.'));
  return text.split(/\s*\+\s*(?![^()]*\))/).map((part) => {
    const p = part.trim();
    const m = /^(\d+,\d+)?\s*\((.*)\)$/.exec(p);
    if (m) {
      const outer = m[1] ? num(m[1]) : 1;
      return {
        options: m[2]!.split(/\s+ó\s+/).map((o) => {
          const t = /^(\d+,\d+)?\s*([A-Za-z]+)$/.exec(o.trim())!;
          return { symbol: t[2] as LoadSymbol, factor: outer * (t[1] ? num(t[1]) : 1) };
        }),
      };
    }
    const t = /^(\d+,\d+)?\s*([A-Za-z]+)$/.exec(p);
    if (!t) throw new Error(`unparsed term "${p}" in "${text}"`);
    return { options: [{ symbol: t[2] as LoadSymbol, factor: t[1] ? num(t[1]) : 1 }] };
  });
}

// ── CIRSOC 101-2025 §2.3.2 ──
const ch2 = left(MD('cirsoc-101-2025/capitulo-2-combinaciones-de-carga.md'));
const s232 = ch2.slice(ch2.indexOf('### 2.3.2'), ch2.indexOf('### 2.3.3'));
const PRINTED_101 = [...s232.matchAll(/^\s+([1-7])\.\s+(\d,\d.*?)\s*$/gm)].map((m) => ({ n: Number(m[1]), slots: parseCombination(m[2]!) }));

describe('the printed text, as parsed', () => {
  it('CIRSOC 101-2025 §2.3.2 prints seven combinations', () => {
    expect(PRINTED_101.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const show = (c: { slots: Slot[] }) => c.slots.map((s) => s.options.map((o) => `${o.factor} ${o.symbol}`).join('|')).join(' + ');
    expect(PRINTED_101.map(show)).toEqual([
      '1.4 D',
      '1.2 D + 1.6 L + 0.5 Lr|0.5 S|0.5 R',
      '1.2 D + 1.6 Lr|1.6 S|1.6 R + 1 L|0.5 W',
      '1.2 D + 1 W + 1 L + 0.5 Lr|0.5 S|0.5 R',
      '1.2 D + 1 E + 1 L + 0.2 S',
      '0.9 D + 1 W',
      '0.9 D + 1 E',
    ]);
  });

  it('prints Exception 1 (0,5 L in 3, 4 and 5 for Lo ≤ 5 kN/m², not garages or public assembly)', () => {
    expect(s232.replace(/\s+/g, ' ')).toMatch(/El factor de carga L en las combinaciones 3, (?:c )?4, y 5 se permite que sea igual a 0,5 para todos los destinos de uso en los cuales Lo en la Tabla 4.1 sea menor o igual que 5 kN\/m2 con la excepción de garajes o áreas ocupadas como lugares de reunión pública/);
  });

  it('prints F with D\'s factor in 1 to 5 and 7, H at 1,6 / 0,9 / 0, and W apart from E', () => {
    const t = (ch2.slice(ch2.indexOf('### 2.3.2'), ch2.indexOf('### 2.3.3'))).replace(/\s+/g, ' ');
    expect(t).toMatch(/mismo factor de carga que la carga permanente D en las combinaciones 1 hasta 5 y 7/);
    expect(t).toMatch(/se deberá incluir H con un factor de carga de 1,6/);
    expect(t).toMatch(/H con un factor de carga de 0,9 cuando la carga sea permanente o un factor de carga igual a 0 para todas las demás condiciones/);
    expect(t).toMatch(/no será necesario considerar que actúan simultáneamente/);
    expect(t).toMatch(/Se deberán investigar los efectos de una o más cargas que no estén actuando/);
  });
});

// ── The properties ──

const VARIABLE: readonly LoadSymbol[] = ['L', 'Lr', 'S', 'R', 'W', 'E'];
type Present = CombinationInputs['present'];
const subsets = (): Present[] => {
  const out: Present[] = [];
  for (let mask = 0; mask < 1 << VARIABLE.length; mask++) {
    const p: Present = { L: false, Lr: false, S: false, R: false, W: false, E: false, F: false, H: false };
    VARIABLE.forEach((s, i) => { (p as unknown as Record<string, boolean>)[s] = !!(mask & (1 << i)); });
    out.push(p);
  }
  return out;
};

/**
 * Every printed combination with every choice of alternative and every subset of its variable
 * loads not acting, for the loads `p` has: the set §2.3.2 asks to investigate.
 * `lFactor`: the L factor in 3, 4 and 5 (Exception 1). `five`: the companions of 5 (103 [3.16]).
 */
function required(p: Present, lFactor: number, five: { l: number; s: number } = { l: lFactor, s: 0.2 }): Array<{ n: number; terms: CombinationTerm[] }> {
  const out: Array<{ n: number; terms: CombinationTerm[] }> = [];
  for (const c of PRINTED_101) {
    let choices: CombinationTerm[][] = [[]];
    for (const slot of c.slots) {
      const opts = slot.options.filter((o) => o.symbol === 'D' || p[o.symbol as keyof Present]).map((o) => {
        let f = o.factor;
        if (o.symbol === 'L' && [3, 4, 5].includes(c.n)) f = c.n === 5 ? five.l : lFactor;
        if (o.symbol === 'S' && c.n === 5) f = five.s;
        return { symbol: o.symbol, factor: f };
      });
      // A slot whose loads are all absent, or that does not act, adds nothing.
      choices = choices.flatMap((ch) => [ch, ...opts.map((o) => [...ch, o])]);
    }
    for (const ch of choices) {
      if (!ch.some((t) => t.symbol === 'D')) continue;
      if (ch.some((t) => t.symbol === 'W') && ch.some((t) => t.symbol === 'E')) continue;
      out.push({ n: c.n, terms: ch });
    }
  }
  return out;
}

const key = (terms: readonly CombinationTerm[]) => terms.filter((t) => t.factor !== 0).map((t) => `${t.symbol}:${+t.factor.toFixed(4)}`).sort().join(' ');

/** A deterministic generator of load effects in [−1, 1]. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 2 ** 32) * 2 - 1; };
}

/**
 * Whether every required combination is inside the generated set's envelope, sign by sign: a
 * positive effect no larger than the largest generated one, a negative one no lower than the
 * lowest. (1,2 D alone is not between 0,9 D and 1,4 D's values when D's effect is negative, but its
 * magnitude is below 1,4 D's: what a strength check reads.)
 */
function envelopeHolds(gen: readonly CombinationTerm[][], req: readonly CombinationTerm[][], samples = 400): string | null {
  const r = rng(12345);
  for (let k = 0; k < samples; k++) {
    const x: Record<string, number> = {};
    for (const s of ['D', ...VARIABLE]) x[s] = r();
    const val = (terms: readonly CombinationTerm[]) => terms.reduce((a, t) => a + t.factor * (x[t.symbol] ?? 0), 0);
    const vals = gen.map(val);
    const hi = Math.max(...vals), lo = Math.min(...vals);
    for (const t of req) {
      const v = val(t);
      if ((v > 0 && v > hi + 1e-9) || (v < 0 && v < lo - 1e-9)) return `${key(t)} = ${v.toFixed(4)} outside [${lo.toFixed(4)}, ${hi.toFixed(4)}] at ${JSON.stringify(x)}`;
    }
  }
  return null;
}

describe('CIRSOC 101-2025 §2.3.2 — every subset of loads present', () => {
  for (const [lo, lFactor] of [[10, 1.0], [2, 0.5]] as const) {
    it(`soundness: every generated combination is a printed one with loads not acting (Lo = ${lo} kN/m²)`, () => {
      for (const p of subsets()) {
        const allowed = new Set(required(p, lFactor).map((c) => key(c.terms)));
        for (const c of generateCombinations({ present: p, maxLoKNm2: lo })) {
          expect(allowed.has(key(c.terms)), `${c.id} ${c.label} for ${JSON.stringify(p)}`).toBe(true);
          const sym = c.terms.map((t) => t.symbol);
          expect(sym.includes('W') && sym.includes('E')).toBe(false);
        }
      }
    });

    it(`completeness: every printed combination, with any loads not acting, is inside the envelope (Lo = ${lo} kN/m²)`, () => {
      for (const p of subsets()) {
        const gen = generateCombinations({ present: p, maxLoKNm2: lo }).map((c) => c.terms);
        const fail = envelopeHolds(gen, required(p, lFactor).map((c) => c.terms));
        expect(fail, JSON.stringify(p)).toBeNull();
      }
    });

    it(`every printed combination with all its present loads acting is generated as printed (Lo = ${lo} kN/m²)`, () => {
      for (const p of subsets()) {
        const got = new Set(generateCombinations({ present: p, maxLoKNm2: lo }).map((c) => key(c.terms)));
        const full = required(p, lFactor).filter((c) => {
          const printed = PRINTED_101.find((x) => x.n === c.n)!;
          // Full: every slot with a present load contributes one.
          return printed.slots.every((s) => s.options.every((o) => o.symbol !== 'D' && !p[o.symbol as keyof Present]) || c.terms.some((t) => s.options.some((o) => o.symbol === t.symbol)));
        });
        for (const c of full) {
          // Combination 3's "(L ó 0,5 W)" and the roof slot are alternatives: one each, all present.
          if (c.terms.length === 1 && c.n !== 1) continue; // D alone: only combination 1 prints it.
          // A printed combination whose principal load is absent (3 with no roof load is 1,2 D + L or
          // 1,2 D + 0,5 W; 4 with no wind is 1,2 D + L + 0,5 Lr) lies inside 1,4 D and the
          // combinations where its loads are principal (the completeness test holds it), so it is
          // not generated on its own.
          const principal: Record<number, LoadSymbol[]> = { 2: ['L', 'Lr', 'S', 'R'], 3: ['Lr', 'S', 'R'], 4: ['W'], 5: ['E'], 6: ['W'], 7: ['E'] };
          if (principal[c.n] && !principal[c.n]!.some((s) => p[s as keyof Present])) continue;
          expect(got.has(key(c.terms)), `${c.n}: ${key(c.terms)} for ${JSON.stringify(p)}`).toBe(true);
        }
      }
    });
  }

  it('the printed combinations alone (no loads left out) miss envelope cases: the shed with roof live load and wind', () => {
    // The finding this verification fixed: with Lr and W and no floor live load, the printed
    // combination 3 is 1,2 D + 1,6 Lr + 0,5 W only, and wind suction on the roof (W opposing D and
    // Lr) lowered every gravity combination: 1,2 D + 1,6 Lr was never generated.
    const p: Present = { L: false, Lr: true, S: false, R: false, W: true, E: false, F: false, H: false };
    const printedOnly = generateCombinations({ present: p, maxLoKNm2: 10, notActing: false }).map((c) => c.terms);
    expect(printedOnly.some((t) => key(t) === 'D:1.2 Lr:1.6')).toBe(false);
    expect(envelopeHolds(printedOnly, required(p, 1.0).map((c) => c.terms))).not.toBeNull();
    const now = generateCombinations({ present: p, maxLoKNm2: 10 }).map((c) => c.terms);
    expect(now.some((t) => key(t) === 'D:1.2 Lr:1.6')).toBe(true);
    expect(envelopeHolds(now, required(p, 1.0).map((c) => c.terms))).toBeNull();
  });

  it('F takes D\'s factor in every combination but 6', () => {
    for (const p of subsets()) {
      for (const c of generateCombinations({ present: { ...p, F: true }, maxLoKNm2: 10 })) {
        const d = c.terms.find((t) => t.symbol === 'D')!.factor;
        const f = c.terms.find((t) => t.symbol === 'F');
        if (c.basic === 6) expect(f, c.id).toBeUndefined();
        else if (c.basic) expect(f?.factor, c.id).toBe(d);
      }
    }
  });

  it('H: 1,6 where it adds, 0,9 permanent / 0 otherwise where it opposes, both when unstated', () => {
    for (const p of subsets()) {
      const add = generateCombinations({ present: { ...p, H: true }, earthPressureAction: 'adds' });
      for (const c of add) if (c.basic) expect(c.terms.find((t) => t.symbol === 'H')?.factor, c.id).toBe(1.6);
      const opp = generateCombinations({ present: { ...p, H: true }, earthPressureAction: 'opposes', earthPressurePermanent: true });
      for (const c of opp) if (c.basic) expect(c.terms.find((t) => t.symbol === 'H')?.factor, c.id).toBe(0.9);
      const tmp = generateCombinations({ present: { ...p, H: true }, earthPressureAction: 'opposes' });
      for (const c of tmp) expect(c.terms.some((t) => t.symbol === 'H'), c.id).toBe(false);
      const both = generateCombinations({ present: { ...p, H: true } }).filter((c) => c.basic);
      expect(both.filter((c) => c.terms.some((t) => t.symbol === 'H' && t.factor === 1.6)).length).toBe(both.filter((c) => !c.terms.some((t) => t.symbol === 'H')).length);
    }
  });

  it('Exception 1 holds 1,0 L with a garage or public assembly, and with Lo unknown', () => {
    const p: Present = { L: true, Lr: true, S: false, R: false, W: true, E: true, F: false, H: false };
    for (const ci of [{ maxLoKNm2: 2, hasGarageOrPublicAssembly: true }, {}]) {
      for (const c of generateCombinations({ present: p, ...ci })) {
        const l = c.terms.find((t) => t.symbol === 'L');
        if (l && c.basic && [3, 4, 5].includes(c.basic)) expect(l.factor, c.id).toBe(1.0);
      }
    }
    // Exactly at the 5 kN/m² boundary the exception applies ("menor o igual que 5").
    expect(generateCombinations({ present: p, maxLoKNm2: 5 }).find((c) => c.id === '4-Lr')!.terms.find((t) => t.symbol === 'L')!.factor).toBe(0.5);
    expect(generateCombinations({ present: p, maxLoKNm2: 5.01 }).find((c) => c.id === '4-Lr')!.terms.find((t) => t.symbol === 'L')!.factor).toBe(1.0);
    // Combination 2 is outside the exception: 1,6 L always.
    expect(generateCombinations({ present: p, maxLoKNm2: 2 }).filter((c) => c.basic === 2).every((c) => c.terms.find((t) => t.symbol === 'L')?.factor === 1.6)).toBe(true);
  });
});

// ── INPRES-CIRSOC 103-2018 Parte I §3.7.1 ──
describe('INPRES-CIRSOC 103-2018 §3.7.1 [3.16]/[3.17] and Tabla 3.3', () => {
  const ch3 = MD('inpres-cirsoc-103-i/capitulo-3-espectros-acciones-y-combinaciones-de.md');
  const s371 = ch3.slice(ch3.indexOf('### 3.7.1'), ch3.indexOf('### 3.7.2'));

  it('prints 1,20 D ± 1,00 E + f1 L + f2 S and 0,9 D ± 1,00 E (the ± lost by the text layer)', () => {
    expect(s371).toMatch(/1,20 D\s+\S?\s*1,00 E\s+\S?\s*f1 L\s+\S?\s*f2 S\s+\[3\.16\]/);
    expect(s371).toMatch(/0.9 D\s+\S?\s*1,00 E\s+\[3\.17\]/);
    expect(ch3).toMatch(/Cubiertas horizontales o que no permitan la evacuación de la nieve\s+0,70/);
    expect(ch3).toMatch(/No se requiere considerar la simultaneidad de viento y sismo/);
  });

  it('combination 5 takes the larger of 101\'s and 103\'s companion factors', () => {
    const p: Present = { L: true, Lr: false, S: true, R: false, W: false, E: true, F: false, H: false };
    const five = (sc?: { f1?: number; f2?: number }, lo = 2) =>
      generateCombinations({ present: p, maxLoKNm2: lo, ...(sc ? { seismicCompanions: sc } : {}) }).find((c) => c.id === '5')!;
    const f = (c: ReturnType<typeof five>, s: LoadSymbol) => c.terms.find((t) => t.symbol === s)!.factor;
    // A dwelling (f1 = 0,25) under a roof that sheds snow (f2 = 0,20): 101's 0,5 L and 0,2 S govern.
    expect([f(five({ f1: 0.25, f2: 0.2 }), 'L'), f(five({ f1: 0.25, f2: 0.2 }), 'S')]).toEqual([0.5, 0.2]);
    // A flat roof keeps its snow: f2 = 0,70 > 0,2.
    expect(f(five({ f1: 0.25, f2: 0.7 }), 'S')).toBe(0.7);
    // Tanks normally full (f1 = 1,0) with Lo ≤ 5: 103 asks for all of L where 101 allows half.
    expect(f(five({ f1: 1.0 }), 'L')).toBe(1.0);
    // Its loads-not-acting variants keep the raised factors.
    const all = generateCombinations({ present: p, maxLoKNm2: 2, seismicCompanions: { f1: 0.25, f2: 0.7 } }).filter((c) => c.basic === 5);
    for (const c of all) { const s = c.terms.find((t) => t.symbol === 'S'); if (s) expect(s.factor).toBe(0.7); }
    // Without the seismic code's figures, combination 5 as CIRSOC 101 prints it.
    expect(f(five(), 'S')).toBe(0.2);
  });
});

// ── CIRSOC 102-2025 Apéndice B ──
describe('CIRSOC 102-2025 Apéndice B', () => {
  const apB = MD('cirsoc-102-2025/apendice-b-combinaciones-de-cargas-que-incluyen-carga.md');
  const b32 = left(apB.slice(apB.indexOf('B.3.2. Combinaciones básicas'), apB.indexOf('B.4. COMBINACIONES')));
  const b42 = left(apB.slice(apB.indexOf('B.4.2. Combinaciones básicas')));

  it('B.3.2\'s three wind combinations are 101\'s 3, 4 and 6', () => {
    const printed = [...b32.matchAll(/^\s*([1-3])\.\s+(\d,\d.*?)\s*$/gm)].map((m) => m[2]!.replace(/(\d,\d+)([A-Za-z(])/g, '$1 $2'));
    expect(printed).toHaveLength(3);
    const norm = (slots: Slot[]) => slots.map((s) => s.options.map((o) => `${o.factor} ${o.symbol}`).sort().join('|')).sort().join(' + ');
    expect(printed.map((t) => norm(parseCombination(t)))).toEqual([3, 4, 6].map((n) => norm(PRINTED_101.find((c) => c.n === n)!.slots)));
  });

  it('B.4.2\'s four service combinations are the ones generated, factor for factor', () => {
    const lines = [...b42.matchAll(/^(?:###\s*|\s*)([1-4])\.?\s+(D|\d,\d ?D)\s*(.*?)\s*$/gm)].map((m) => `${m[2]} ${m[3]}`.replace(/(\d,\d+)([A-Za-z(])/g, '$1 $2').trim());
    expect(lines).toEqual(['D + Wa', 'D + 0,5 L + Wa', '0,6 D + 0,6 W', 'D + 0,75 L + 0,45 W + 0,75 (Lr ó S ó R)']);
    const p = { L: true, Lr: true, S: true, R: false, W: true, E: false, F: false, H: false, Wa: true };
    const gen = new Set(generateServiceCombinations({ present: p }).filter((c) => c.refs.some((r) => r.clause === 'B.4.2')).map((c) => key(c.terms)));
    const expected = lines.flatMap((l) => {
      const slots = parseCombination(l);
      let out: CombinationTerm[][] = [[]];
      for (const s of slots) out = out.flatMap((o) => s.options.filter((x) => x.symbol === 'D' || (p as Record<string, boolean>)[x.symbol]).map((x) => [...o, x]));
      return out.map(key);
    });
    expect([...gen].sort()).toEqual([...new Set(expected)].sort());
  });
});
