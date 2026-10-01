/**
 * CIRSOC Flex — robustness audit of Basic mode's concrete calculator.
 *
 * ── What this file asks ────────────────────────────────────────────
 *
 * The other `cirsoc-flex-*` suites pin the calculator to the workbook's own
 * published examples. This one asks what happens when a reader types numbers
 * of their own, which is the ordinary use of a pocket calculator:
 *
 *   1. seeded random sweeps over realistic ranges, every case run through the
 *      same `solveFlex` the panel calls and through the text the panel prints
 *      (`sheetRows` and the translated memo), checking that each answer is
 *      either a well-formed design or a clear refusal;
 *   2. edge inputs a user can type (zero, negative, empty, huge, cover past
 *      mid-depth, percentages that do not add up, flange narrower than the
 *      web, demands past what the section can carry);
 *   3. hand calculations for the textbook cases (Whitney block, φ from εt,
 *      T with the block in the flange and in the web, doubly reinforced,
 *      minimum steel) and monotonicity of the design;
 *   4. units, between the fields, the engine and the printed rows.
 *
 * ── How the defects were recorded, and where they stand ───────────
 *
 * Every test that exposed a defect was an `itDefect` (= `it.fails`), with the
 * hand calculation beside it, passing BECAUSE the engine was wrong. All
 * fifteen are fixed, and each is now a plain `it` still named after the
 * defect it pins, with the same hand calculation as its expectation; the
 * comment above each says what was wrong and what the engine does now. A new
 * defect goes back in as an `itDefect` (run `FLEX_SHOW_DEFECTS=1` to see it
 * fail for its stated reason). The input classes the sweeps used to exclude
 * have a sweep of their own in §1.
 *
 * Units, as the engine takes them: lengths in m, f'c and fy in MPa, Mu in
 * kN·m, Pu in kN (+ compression), areas out in cm². The panel types cm and
 * divides by 100 in one place (`CirsocFlexPanel.svelte`, `input`).
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput, type FlexOutput } from '../cirsoc-flex';
import { beta1, phiFromStrain, axialCap, minFlexuralSteelCm2 } from '../cirsoc201-basis';
import { barsPerLayer } from '../cirsoc201-bars';
import { sheetRows } from '../../../../../components/flex/sheet-rows';
import { teAllAt } from '../../../../i18n/engine-text';

// ── Fixtures ─────────────────────────────────────────────────────────

const BASE: FlexInput = {
  kase: 'FSR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.60, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0, bf: 1.0, hf: 0.10, bw: 0.25,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true, ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [], Pu: 0, Mu: 200, Muy: 0,
};

const solve = (o: Partial<FlexInput>) => solveFlex({ ...BASE, ...o });

/**
 * A test that exposes an OPEN defect: `it.fails` normally, so the suite stays
 * green and turns red once the defect is fixed. `FLEX_SHOW_DEFECTS=1` runs
 * them as plain tests, to read what each one actually gets. None is open.
 */
export const itDefect = process.env.FLEX_SHOW_DEFECTS ? it : it.fails;

/** mulberry32 — small, fast, and the same sequence on every machine. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (lo: number, hi: number) => lo + (hi - lo) * next();
  /* Rounded the way a reader types: whole cm, half cm, whole MPa. */
  const cm = (lo: number, hi: number) => Math.round(range(lo, hi)) / 100;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  return { next, range, cm, pick };
}

const TEXT_BAD = /NaN|undefined|Infinity|null|\{\w+\}/;
/** The memo lines an input refusal opens with. */
const REFUSAL_KEYS = /^flex\.step\.(bad\w+|flangeNarrow|noBars)$/;
const RAW_KEY = /^flex\.[\w.]+$/;

/** Everything the panel prints for one answer, as strings. */
function printed(i: FlexInput, r: FlexOutput): string[] {
  const rows = sheetRows({
    kase: i.kase, mode: i.mode, r, fc: i.fc, fy: i.fy,
    spiral: i.confinement === 'spiral', barCount: i.barCount, Pu: i.Pu, Mu: i.Mu,
  });
  const cells = [
    ...rows.beam, ...rows.needed, ...rows.minMax, ...rows.verifyResult,
    ...rows.extra, ...rows.general, ...rows.safety, ...rows.bars,
  ].flat();
  return [rows.headline, ...cells, ...teAllAt(r.steps, 'es')];
}

/**
 * Well-formedness of one answer. Returns the list of problems, empty when
 * the answer is a valid design, a valid verification, or a clear refusal.
 */
function problems(i: FlexInput, r: FlexOutput): string[] {
  const p: string[] = [];
  const finite = (name: string, v: unknown, required = false) => {
    if (v === undefined) { if (required) p.push(`${name} undefined`); return; }
    if (typeof v !== 'number' || !Number.isFinite(v)) p.push(`${name} = ${String(v)}`);
  };
  finite('AstCm2', r.AstCm2, true);
  finite('rho', r.rho, true);
  for (const k of ['AsCm2', 'AsPrimeCm2', 'AsMinCm2', 'AstMinCm2', 'AstMaxCm2',
    'a', 'c', 'cMax', 'epsilonT', 'phi', 'phiPn', 'phiMn', 'puMax'] as const) {
    finite(k, r[k]);
  }
  for (const k of ['AstCm2', 'AsCm2', 'AsPrimeCm2', 'AsMinCm2', 'rho', 'a', 'c'] as const) {
    const v = r[k];
    if (typeof v === 'number' && v < -1e-9) p.push(`${k} negative: ${v}`);
  }
  if (!(Number.isFinite(r.ratio) || (r.ratio === Infinity && !r.ok))) p.push(`ratio = ${r.ratio}`);
  if (r.ratio < 0) p.push(`ratio negative: ${r.ratio}`);
  if (r.ok && r.impossible) p.push('ok AND impossible');
  const keys = r.steps.map((s) => s.key);
  /*
   * A refusal of the INPUTS is a clear answer too, as long as it says which
   * input: nothing else in it is a result, so the checks below do not apply.
   */
  if (r.invalid) {
    if (r.ok || !r.impossible) p.push('invalid but not refused');
    if (!keys.some((k) => REFUSAL_KEYS.test(k))) p.push('invalid without saying why');
    for (const s of printed(i, r)) {
      if (TEXT_BAD.test(s)) p.push(`prints "${s}"`);
      if (RAW_KEY.test(s)) p.push(`raw key "${s}"`);
    }
    return p;
  }
  if (r.ok && r.ratio > 1 + 1e-6) p.push(`ok with ratio ${r.ratio}`);
  if (r.ok && r.phi !== undefined && (r.phi < 0.65 - 1e-9 || r.phi > 0.9 + 1e-9)) p.push(`ok with φ = ${r.phi}`);
  if (i.mode === 'design' && !r.ok && !r.impossible) p.push('design: neither an answer nor a refusal');
  if (r.barChoice && /NaN|undefined/.test(r.barChoice.label)) p.push(`bar label ${r.barChoice.label}`);
  for (const s of printed(i, r)) {
    if (TEXT_BAD.test(s)) p.push(`prints "${s}"`);
    if (RAW_KEY.test(s)) p.push(`raw key "${s}"`);
  }
  const isBeam = i.kase === 'FSR' || i.kase === 'FST';
  if (isBeam && i.mode === 'design') {
    if (r.impossible && !keys.includes('flex.step.impossible')) p.push('refused without saying so');
    if (!r.impossible && (r.phiMn ?? 0) < Math.abs(i.Mu) * 0.999) p.push(`design φMn ${r.phiMn} < Mu ${i.Mu}`);
    /* The design's own rule (and, looser, §10.3.5's 4 ‰): a returned beam is ductile. */
    if (r.ok && (r.epsilonT ?? 0) < 0.005 - 1e-4) p.push(`${D14} design with εt = ${((r.epsilonT ?? 0) * 1000).toFixed(2)} ‰`);
    /* The d the answer was computed at is the d of the bars it proposes. */
    const dStep = r.steps.find((s) => s.key === 'flex.step.d' || s.key === 'flex.step.dLayers')?.params?.d;
    const centroid = r.barChoice?.centroidFromFaceM;
    if (!r.impossible && typeof dStep === 'number' && centroid !== undefined
      && Math.abs(dStep - (i.h - centroid) * 100) > 0.05) {
      p.push(`${D14} d = ${dStep.toFixed(2)} cm printed, bars give ${((i.h - centroid) * 100).toFixed(2)} cm`);
    }
  }
  if (isBeam && i.mode === 'verify' && !r.ok && !r.impossible
    && !keys.includes('flex.step.fails') && !keys.includes('flex.step.notDuctile')) {
    p.push('verify fails without saying so');
  }
  if (!isBeam && i.mode === 'design' && r.impossible && !keys.includes('flex.step.noneWorks')) {
    p.push('column refused without saying so');
  }
  return p;
}

/**
 * Problems owned by DEFECT 14 (the non-monotone sizing bisection) carry this
 * tag, so the sweeps can report them in their own `it.fails` and still fail
 * on anything else.
 */
const D14 = '[DEFECT 14]';
const notD14 = (xs: string[]) => xs.filter((x) => !x.startsWith(D14));
/** What the beam sweeps found under DEFECT 14, for the test that owns it. */
const d14Found: string[] = [];

/** Runs a batch and returns every malformed case, with its input — one line per problem. */
function sweep(inputs: FlexInput[]): string[] {
  const bad: string[] = [];
  for (const i of inputs) {
    let r: FlexOutput;
    try {
      r = solveFlex(i);
    } catch (e) {
      bad.push(`THROW ${(e as Error).message} :: ${JSON.stringify(i)}`);
      continue;
    }
    for (const q of problems(i, r)) bad.push(`${q} :: ${describeInput(i)}`);
  }
  return bad;
}

function describeInput(i: FlexInput): string {
  const keep: Partial<Record<keyof FlexInput, unknown>> = {
    kase: i.kase, mode: i.mode, fc: i.fc, fy: i.fy, Mu: i.Mu, Pu: i.Pu,
  };
  if (i.kase === 'FSR' || i.kase === 'FCR' || i.kase === 'FCO') Object.assign(keep, { b: i.b, h: i.h });
  if (i.kase === 'FST') Object.assign(keep, { bf: i.bf, hf: i.hf, bw: i.bw, h: i.h });
  if (i.kase === 'FCR-CIR') Object.assign(keep, { D: i.D, Dint: i.Dint, barCount: i.barCount });
  if (i.kase === 'FCO') Object.assign(keep, { Muy: i.Muy, pct: [i.pctA1, i.pctA2, i.pctA3] });
  if (i.mode === 'verify') Object.assign(keep, { AstGiven: i.AstGiven });
  Object.assign(keep, { dPrime: i.dPrime, dPrimeS: i.dPrimeS });
  return JSON.stringify(keep);
}

// ── 1. Seeded sweeps ─────────────────────────────────────────────────

describe('1 · seeded sweeps over realistic inputs', () => {
  it('FSR, design and verify, positive and negative Mu, zero included (200 cases)', () => {
    const g = rng(20260929);
    const cases: FlexInput[] = [];
    for (let k = 0; k < 200; k++) {
      const h = g.cm(20, 150);
      const b = g.cm(15, 100);
      const cover = g.cm(3, 7);
      const fc = Math.round(g.range(15, 50));
      const fy = g.pick([420, 500] as const);
      const d = h - cover;
      /* Up to ~1.6× what a singly-reinforced section at 5 ‰ carries, so
         some cases go doubly and some are refused. */
      const muTop = 0.9 * 0.32 * 0.85 * fc * 1000 * b * d * d * 1.6;
      const r = g.next();
      const Mu = r < 0.05 ? 0 : (r < 0.2 ? -1 : 1) * Math.round(g.range(1, muTop));
      const mode = g.next() < 0.3 ? 'verify' : 'design';
      cases.push({
        ...BASE, kase: 'FSR', mode, fc, fy, b, h, dPrime: cover, dPrimeS: cover, Mu,
        AstGiven: Math.round(g.range(0.5, 0.03 * b * h * 1e4) * 100) / 100,
      });
    }
    const found = sweep(cases);
    d14Found.push(...found.filter((x) => x.startsWith(D14)));
    expect(notD14(found).join('\n')).toBe('');
  });

  it('FST, design and verify, POSITIVE Mu only, flange and web blocks (150 cases)', () => {
    /* Negative Mu on a T (DEFECT 1, fixed) has its own sweep below. */
    const g = rng(4201);
    const cases: FlexInput[] = [];
    for (let k = 0; k < 150; k++) {
      const h = g.cm(30, 150);
      const bw = g.cm(15, 50);
      const bf = Math.max(bw + 0.05, g.cm(40, 250));
      const hf = Math.min(g.cm(8, 25), h / 2);
      const cover = g.cm(3, 7);
      const fc = Math.round(g.range(15, 50));
      const fy = g.pick([420, 500] as const);
      const d = h - cover;
      const muTop = 0.9 * 0.85 * fc * 1000 * bf * hf * (d - hf / 2) * 1.3;
      const Mu = g.next() < 0.05 ? 0 : Math.round(g.range(1, muTop));
      const mode = g.next() < 0.3 ? 'verify' : 'design';
      cases.push({
        ...BASE, kase: 'FST', mode, fc, fy, h, bw, bf, hf, dPrime: cover, dPrimeS: cover, Mu,
        AstGiven: Math.round(g.range(1, 0.02 * bw * h * 1e4) * 100) / 100,
      });
    }
    const found = sweep(cases);
    d14Found.push(...found.filter((x) => x.startsWith(D14)));
    expect(notD14(found).join('\n')).toBe('');
  });

  /*
   * DEFECT 14 as the sweeps met it — see §2 for the hand calculation. With
   * these seeds: a compression-controlled design (fy 500, εt 2.3 ‰), and
   * layered designs whose printed d was the flat d while the bars they
   * proposed sat higher (up to 4.4 cm on a 58 cm T), whose steel then failed
   * its own verification by ~4–10 %. Fixed: none left.
   */
  it('DEFECT 14 — the beam sweeps meet no non-ductile or inconsistent-d design', () => {
    expect(d14Found.join('\n')).toBe('');
  });

  it('FCR, design and verify, compression, tension, both signs of Mu (120 cases)', () => {
    /* Mu = 0 with Pu < 0 (DEFECT 2, fixed) has its own sweep below. */
    const g = rng(777);
    const cases: FlexInput[] = [];
    for (let k = 0; k < 120; k++) {
      const b = g.cm(20, 80);
      const h = g.cm(20, 100);
      const cover = g.cm(3, 6);
      const fc = Math.round(g.range(15, 50));
      const fy = g.pick([420, 500] as const);
      const Ag = b * h;
      const P0 = 0.52 * 0.85 * fc * 1000 * Ag;
      const Pu = g.next() < 0.25 ? -Math.round(g.range(10, 0.9 * 0.03 * Ag * fy * 1000))
        : Math.round(g.range(0, 1.1 * P0));
      const Mu = (g.next() < 0.2 ? -1 : 1) * Math.round(g.range(Pu < 0 ? 1 : 0, 0.15 * P0 * h + 20));
      const mode = g.next() < 0.3 ? 'verify' : 'design';
      cases.push({
        ...BASE, kase: 'FCR', mode, fc, fy, b, h, dPrime: cover, dPrimeS: cover,
        ratioAsPrime: 1, Pu, Mu,
        confinement: g.next() < 0.2 ? 'spiral' : 'ties',
        AstGiven: Math.round(g.range(0.01, 0.06) * Ag * 1e4 * 100) / 100,
      });
    }
    expect(sweep(cases).join('\n')).toBe('');
  });

  it('FCR-CIR, solid and hollow, design and verify, non-zero Mu (60 cases)', () => {
    /* Mu = 0 (DEFECT 3, fixed) has its own sweep below. `b`/`h` are cleared
       here; DEFECT 9 (fixed) pins that the hidden rectangle is ignored. */
    const g = rng(31415);
    const cases: FlexInput[] = [];
    for (let k = 0; k < 60; k++) {
      const D = g.cm(30, 150);
      const hollow = g.next() < 0.25;
      const Dint = hollow ? Math.round(D * g.range(0.3, 0.6) * 100) / 100 : 0;
      const cover = g.cm(4, 7);
      const fc = Math.round(g.range(15, 50));
      const fy = g.pick([420, 500] as const);
      const Ag = (Math.PI / 4) * (D * D - Dint * Dint);
      const P0 = 0.52 * 0.85 * fc * 1000 * Ag;
      const Pu = g.next() < 0.2 ? -Math.round(g.range(10, 0.9 * 0.02 * Ag * fy * 1000))
        : Math.round(g.range(0, P0));
      const Mu = (g.next() < 0.2 ? -1 : 1) * Math.round(g.range(1, 0.12 * P0 * D + 20));
      const mode = g.next() < 0.3 ? 'verify' : 'design';
      cases.push({
        ...BASE, kase: 'FCR-CIR', mode, fc, fy, D, Dint, dPrimeS: cover,
        b: NaN, h: NaN,
        barCount: g.pick([6, 8, 10, 12, 16] as const), barAtExtremeFibre: g.next() < 0.5,
        confinement: g.next() < 0.5 ? 'spiral' : 'ties', Pu, Mu,
        AstGiven: Math.round(g.range(0.01, 0.05) * Ag * 1e4 * 100) / 100,
      });
    }
    expect(sweep(cases).join('\n')).toBe('');
  });

  it('FCO, A1+A2+A3 = 100 %, both signs, design and verify (40 cases)', () => {
    /* Percentages that do not add to 100 (DEFECT 6, fixed) have their own sweep below. */
    const g = rng(99);
    const cases: FlexInput[] = [];
    const splits = [[50, 50, 0], [40, 40, 20], [34, 33, 33], [60, 40, 0], [25, 25, 50]] as const;
    for (let k = 0; k < 40; k++) {
      const b = g.cm(25, 70);
      const h = g.cm(25, 70);
      const cover = g.cm(4, 6);
      const fc = Math.round(g.range(20, 40));
      const Ag = b * h;
      const P0 = 0.52 * 0.85 * fc * 1000 * Ag;
      const [a1, a2, a3] = g.pick(splits);
      const mode = g.next() < 0.3 ? 'verify' : 'design';
      cases.push({
        ...BASE, kase: 'FCO', mode, fc, fy: 420, b, h, dPrimeH: cover, dPrimeV: cover,
        pctA1: a1, pctA2: a2, pctA3: a3, nA1: 4, nA2: 4, nA3: 4,
        Pu: Math.round(g.range(-0.2 * P0, 0.9 * P0)),
        Mu: (g.next() < 0.3 ? -1 : 1) * Math.round(g.range(1, 0.08 * P0 * h + 10)),
        Muy: (g.next() < 0.3 ? -1 : 1) * Math.round(g.range(0, 0.05 * P0 * b + 10)),
        AstGiven: Math.round(g.range(0.01, 0.05) * Ag * 1e4 * 100) / 100,
      });
    }
    expect(sweep(cases).join('\n')).toBe('');
  });

  it('the classes the sweeps used to exclude: hogging T, axial-only columns, Σ% ≠ 100 (80 cases)', () => {
    const g = rng(151515);
    const cases: FlexInput[] = [];
    for (let k = 0; k < 20; k++) {
      const h = g.cm(30, 120);
      const bw = g.cm(15, 45);
      const bf = Math.max(bw + 0.05, g.cm(40, 200));
      const hf = Math.min(g.cm(8, 20), h / 2);
      const cover = g.cm(3, 6);
      const fc = Math.round(g.range(20, 40));
      const d = h - cover;
      const muTop = 0.9 * 0.32 * 0.85 * fc * 1000 * bw * d * d * 1.4;
      cases.push({
        ...BASE, kase: 'FST', mode: g.next() < 0.3 ? 'verify' : 'design', fc, fy: 420,
        h, bw, bf, hf, dPrime: cover, dPrimeS: cover, Mu: -Math.round(g.range(1, muTop)),
        AstGiven: Math.round(g.range(1, 0.02 * bw * h * 1e4) * 100) / 100,
      });
    }
    for (let k = 0; k < 20; k++) {
      const b = g.cm(20, 60);
      const h = g.cm(20, 80);
      const Ag = b * h;
      const fc = Math.round(g.range(20, 40));
      const P0 = 0.52 * 0.85 * fc * 1000 * Ag;
      cases.push({
        ...BASE, kase: 'FCR', mode: g.next() < 0.3 ? 'verify' : 'design', fc, fy: 420, b, h,
        dPrime: 0.05, dPrimeS: 0.05, Mu: 0,
        Pu: g.next() < 0.5 ? -Math.round(g.range(10, 0.9 * 0.03 * Ag * 420e3)) : Math.round(g.range(10, P0)),
        AstGiven: Math.round(g.range(0.01, 0.05) * Ag * 1e4 * 100) / 100,
      });
    }
    for (let k = 0; k < 20; k++) {
      const D = g.cm(30, 100);
      const Ag = (Math.PI / 4) * D * D;
      const fc = Math.round(g.range(20, 40));
      const P0 = 0.52 * 0.85 * fc * 1000 * Ag;
      cases.push({
        ...BASE, kase: 'FCR-CIR', mode: g.next() < 0.3 ? 'verify' : 'design', fc, fy: 420, D, Dint: 0,
        dPrimeS: 0.05, b: NaN, h: NaN, barCount: g.pick([6, 8, 12] as const), Mu: 0,
        Pu: g.next() < 0.5 ? -Math.round(g.range(10, 0.9 * 0.03 * Ag * 420e3)) : Math.round(g.range(10, P0)),
        AstGiven: Math.round(g.range(0.01, 0.05) * Ag * 1e4 * 100) / 100,
      });
    }
    const splits = [[75, 75, 0], [25, 25, 0], [40, 40, 40], [30, 20, 10], [60, 60, 30]] as const;
    for (let k = 0; k < 20; k++) {
      const b = g.cm(25, 60);
      const h = g.cm(25, 60);
      const Ag = b * h;
      const P0 = 0.52 * 0.85 * 25e3 * Ag;
      const [a1, a2, a3] = g.pick(splits);
      cases.push({
        ...BASE, kase: 'FCO', mode: g.next() < 0.3 ? 'verify' : 'design', b, h, dPrimeH: 0.05, dPrimeV: 0.05,
        pctA1: a1, pctA2: a2, pctA3: a3, nA1: 4, nA2: 4, nA3: g.pick([2, 3, 4] as const),
        Pu: Math.round(g.range(0, 0.8 * P0)), Mu: Math.round(g.range(0, 0.06 * P0 * h)),
        Muy: Math.round(g.range(0, 0.04 * P0 * b)),
        AstGiven: Math.round(g.range(0.01, 0.05) * Ag * 1e4 * 100) / 100,
      });
    }
    const found = sweep(cases);
    expect(found.join('\n')).toBe('');
  });
});

// ── 2. Edge inputs a user can type ───────────────────────────────────

/**
 * What the panel hands the engine when a number field is EMPTY: Svelte's
 * `bind:value` on `type="number"` yields `null`, and `null / 100` is 0.
 */
const EMPTY = null as unknown as number;

describe('2 · edge inputs — refusals that work', () => {
  it('b = 0 on a beam is refused, not designed', () => {
    const r = solve({ b: 0 });
    expect(r.ok).toBe(false);
    expect(r.impossible).toBe(true);
  });

  it('a moment past what the section can take says so (beam)', () => {
    const r = solve({ Mu: 5000 });
    expect(r.impossible).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.impossible');
    const rows = sheetRows({ kase: 'FSR', mode: 'design', r, fc: 25, fy: 420, spiral: false, barCount: 0, Pu: 0, Mu: 5000 });
    expect(rows.headline).not.toMatch(/^As =/);
    expect(rows.beam[0][1]).toBe('—');
    expect(rows.bars).toEqual([]);
  });

  it('a moment past what the column can take says so', () => {
    const r = solve({ kase: 'FCR', b: 0.3, h: 0.3, Pu: 2600, Mu: 50 });
    expect(r.impossible).toBe(true);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.noneWorks');
  });

  it('Mu = 0 on a beam gives the minimum steel, and a finite, well-formed answer', () => {
    const r = solve({ Mu: 0 });
    expect(problems({ ...BASE, Mu: 0 }, r)).toEqual([]);
    expect(r.AsCm2).toBeCloseTo(minFlexuralSteelCm2(25, 420, 0.30, 0.55), 6);
    expect(r.ratio).toBe(0);
  });

  it('an EMPTY Mu field behaves as Mu = 0', () => {
    const r = solve({ Mu: EMPTY });
    expect(r.AsCm2).toBeCloseTo(solve({ Mu: 0 }).AsCm2!, 9);
  });

  it('over-reinforcement in design goes to compression steel, keeping εt ≥ 5 ‰', () => {
    const r = solve({ b: 0.25, h: 0.50, Mu: 330 });
    expect(r.ok).toBe(true);
    expect(r.AsPrimeCm2!).toBeGreaterThan(0);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.doubly');
    expect(r.epsilonT!).toBeGreaterThanOrEqual(0.005 - 1e-4);
  });

  it('shallow section, d′ past c at 5 ‰: refused rather than a compression-controlled design', () => {
    const r = solve({ b: 0.3, h: 0.5, dPrime: 0.2, Mu: 450 });
    expect(r.impossible).toBe(true);
  });

  it('huge but finite numbers do not throw or print NaN', () => {
    for (const o of [
      { Mu: 1e7 }, { AstGiven: 1e5, mode: 'verify' as const },
      { kase: 'FCR' as const, Pu: 1e8, Mu: 1e7 }, { kase: 'FCO' as const, Pu: 1e8, Mu: 1e6, Muy: 1e6 },
    ]) {
      const i = { ...BASE, ...o };
      expect(() => solveFlex(i)).not.toThrow();
      const r = solveFlex(i);
      expect(Number.isFinite(r.AstCm2), JSON.stringify(o)).toBe(true);
      expect(r.ok, JSON.stringify(o)).toBe(false);
    }
    /* An absurd f'c is still a number: it designs, finitely. */
    expect(notD14(problems({ ...BASE, fc: 1e4 }, solve({ fc: 1e4 }))).join('; ')).toBe('');
  });
});

describe('2 · edge inputs — the audit\'s defects, fixed', () => {
  /*
   * DEFECT 1 — a T beam under NEGATIVE moment is designed as if the flange
   * were compressed.
   *
   * `solveFlex` takes |Mu| and always bends with the top face compressed
   * (θ = π/2, cirsoc-flex.ts:357–359 and :379), so for a hogging moment on a T
   * the flange is credited as the compression zone while it is really in
   * tension. The workbook's own T (bf 137, hf 10, bw 12, h 40, d′s 3.2,
   * f'c 25, fy 420) under Mu = −80 kN·m:
   *
   *   correct: compression in the 12 cm web → rectangle bw = 0.12, d = 0.368
   *     Rn = (80/0.9)/(0.12·0.368²) = 5470 kPa
   *     As = 0.85·25·0.12·0.368/420 · (1 − √(1 − 2·5.470/21.25)) = 6.78 cm²
   *   engine: 5.82 cm², the same as Mu = +80 — 14 % short.
   *
   * The T's As,min under hogging (§10.5.2, flange in tension) is not applied
   * either; it takes the web alone.
   *
   * FIXED: hogging bends the T the other way up (θ = −π/2, tension steel at
   * the top, compression in the web) and As,min takes min(2·bw, bf).
   */
  it('DEFECT 1 — FST with Mu < 0 must not credit the flange in compression', () => {
    const T = { kase: 'FST' as const, h: 0.40, bf: 1.37, hf: 0.10, bw: 0.12, dPrime: 0.032, dPrimeS: 0.032 };
    const neg = solve({ ...T, Mu: -80 });
    const asRectWeb = solve({ kase: 'FSR', b: 0.12, h: 0.40, dPrime: 0.032, dPrimeS: 0.032, Mu: 80 }).AsCm2!;
    expect(asRectWeb).toBeCloseTo(6.78, 1);
    /* Either refuse the sign, or design the web: not the flange. It designs the web. */
    expect(neg.impossible).toBe(false);
    if (!neg.impossible) expect(neg.AsCm2!).toBeGreaterThanOrEqual(asRectWeb * 0.995);
    /* §10.5.2: As,min with the lesser of 2·bw and bf, flange in tension. */
    expect(neg.AsMinCm2!).toBeCloseTo((1.4 / 420) * Math.min(2 * 0.12, 1.37) * 0.368 * 1e4, 6);
  });

  /*
   * DEFECT 2 — FCR under pure axial TENSION (Mu = 0, Pu < 0) is checked
   * against its COMPRESSION capacity.
   *
   * In `utilisation` (cirsoc-flex.ts:236–244) the ray slope is Mres/Pu = −0,
   * so `onRay` reduces to the moment alone and the first curve point — the
   * fully compressed section, c = 10·h, whose moment is exactly zero on a
   * symmetric rectangle — is taken as the intersection. 30 × 30, Pu = −500 kN:
   *
   *   tension capacity at the 1 % minimum (9 cm²): φ·As·fy = 0.9·9e-4·420e3 = 340 kN < 500
   *   required: 500 / (0.9·420e3) = 13.23 cm²
   *   engine: "minEnough", Ast = 9 cm², φPn = +1181 kN (compression), ratio 0.42, ok.
   *
   * Mu = 1 kN·m on the same section gives 13.40 cm², so the answer jumps by
   * half at Mu = 0. FCO takes the same demand correctly (13.23 cm²).
   *
   * FIXED: a demand with no moment is measured against the end of the
   * diagram on its own side (`axialLimit`): here pure tension, φ = 0.90.
   */
  it('DEFECT 2 — FCR pure tension: Mu = 0, Pu = −500 kN needs ≥ 13.2 cm²', () => {
    const r = solve({ kase: 'FCR', b: 0.3, h: 0.3, Pu: -500, Mu: 0 });
    expect(r.AstCm2).toBeGreaterThanOrEqual(500 / (0.9 * 42) - 0.05);
  });
  it('DEFECT 2 — FCR verify, 9 cm² against Pu = −500 kN must NOT verify', () => {
    const r = solve({ kase: 'FCR', mode: 'verify', AstGiven: 9, b: 0.3, h: 0.3, Pu: -500, Mu: 0 });
    expect(r.ok).toBe(false);
  });

  /*
   * DEFECT 3 — a circular column with Mu = 0 cannot be designed or verified
   * at all, in compression or tension.
   *
   * Same function (cirsoc-flex.ts:236–255). On the 360-gon the moment at the
   * fully compressed point is a rounding residue, not exactly 0, and `cap` is
   * a hypot (never negative), so `onRay` never changes sign: no crossing is
   * found and the fallback returns ratio = ∞. D = 40, f'c 25, fy 420, ties,
   * Pu = +1000 kN, Mu = 0:
   *
   *   Ag = 0.12566 m², As,min (1 %) = 12.57 cm²
   *   φPn,max = 0.65·0.80·(0.85·25e3·(0.12566 − 0.001257) + 420e3·0.001257) = 1649 kN > 1000
   *   → the minimum should do. Engine: "noneWorks" at 8 % (100.5 cm²), impossible,
   *     and the memo prints "Relación demanda/capacidad = Infinity".
   *
   * Pu = −800 kN (tension) likewise refuses, where 800/(0.9·42) = 21.2 cm² works.
   *
   * FIXED with DEFECT 2: no crossing is searched for when there is no moment.
   */
  it('DEFECT 3 — FCR-CIR, Pu = 1000 kN, Mu = 0 is designable with the minimum', () => {
    const r = solve({ kase: 'FCR-CIR', D: 0.4, dPrimeS: 0.05, Pu: 1000, Mu: 0, b: NaN, h: NaN });
    const Ag = Math.PI * 0.04;
    expect(axialCap(25, 420, Ag, 0.01 * Ag, 'ties')).toBeGreaterThan(1000);
    expect(r.impossible).toBe(false);
    expect(r.AstCm2).toBeCloseTo(0.01 * Ag * 1e4, 1);
  });
  it('DEFECT 3 — FCR-CIR, Pu = −800 kN, Mu = 0 is designable (≈ 21.2 cm²)', () => {
    const r = solve({ kase: 'FCR-CIR', D: 0.4, dPrimeS: 0.05, Pu: -800, Mu: 0, b: NaN, h: NaN });
    expect(r.impossible).toBe(false);
    expect(r.AstCm2).toBeCloseTo(800 / (0.9 * 42), 0);
  });

  /*
   * DEFECT 4 — invalid materials are designed instead of refused.
   *
   * No validation anywhere in `solveFlex`; the panel's `min="15"` does not stop
   * typing. With f'c = 0 (or an EMPTY f'c field, which arrives as null) the
   * concrete carries nothing and the beam is "designed" as a pure steel
   * couple — As 14.70 + A′s 14.65 cm², ok = true — with the memo saying the
   * singly-reinforced maximum is 0 kN·m. With fy = 0 (or empty) every area is
   * NaN, the bar label is "NaN Ø10" and the memo prints "As,mín = Infinity cm²".
   *
   * FIXED: `validate` refuses an f′c or fy that is not a positive number
   * (`invalid`, memo `flex.step.badMaterial`, headline "Revisá los datos").
   */
  it('DEFECT 4 — f′c = 0 (or empty) must be refused', () => {
    for (const fc of [0, EMPTY, -25]) {
      const r = solve({ fc });
      expect(r.ok, `fc = ${fc}`).toBe(false);
    }
  });
  it('DEFECT 4 — fy = 0 (or empty) must be refused cleanly, without NaN', () => {
    for (const fy of [0, EMPTY]) {
      const i = { ...BASE, fy };
      expect(problems(i, solveFlex(i)), `fy = ${fy}`).toEqual([]);
    }
  });

  /*
   * DEFECT 5 — impossible geometry is accepted.
   *
   *  - b < 0 on FSR: designed, ok = true, with As,min = −5.2 cm² printed
   *    (`minFlexuralSteelCm2` is linear in bw; the polygon area is abs()).
   *  - h = 0, or cover d′s ≥ h: As,min negative (−0.5 and −0.17 cm²) is
   *    printed as the minimum.
   *  - hf > h on FST: `teePolygon` (section-polygon.ts:125) builds a flange
   *    deeper than the beam, so the "40 cm" beam is designed as 80 cm deep:
   *    bf 1.0, hf 0.8, h 0.6 at Mu 200 gives 7.12 cm², while no section 60 cm
   *    deep with d = 0.55 can carry it on less than
   *    (200/0.9)/(420e3·0.55) = 9.62 cm² (lever arm ≤ d).
   *  - a hole larger than the rectangle, or D int ≥ D: gross area negative,
   *    and "Ast = −56.546 cm²" is printed.
   *
   * FIXED: each is refused by `validate`, naming the input (`badDimension`,
   * `badCover`, `badFlange`, `badHole`, `badDint`). Nothing is computed, so
   * no As,min is printed at all.
   */
  it('DEFECT 5 — b < 0 must be refused', () => {
    const r = solve({ b: -0.3 });
    expect(r.ok).toBe(false);
  });
  it('DEFECT 5 — h = 0 or d′s ≥ h: no negative As,min printed', () => {
    for (const o of [{ h: 0 }, { dPrimeS: 0.6 }]) {
      const r = solve(o);
      /* Refused before anything is computed, so there is no As,min to print at all. */
      expect(r.ok, JSON.stringify(o)).toBe(false);
      expect(r.invalid, JSON.stringify(o)).toBe(true);
      if (r.AsMinCm2 !== undefined) expect(r.AsMinCm2, JSON.stringify(o)).toBeGreaterThanOrEqual(0);
      expect(problems({ ...BASE, ...o }, r)).toEqual([]);
    }
  });
  it('DEFECT 5 — FST with hf > h is not designed deeper than h', () => {
    const r = solve({ kase: 'FST', bf: 1.0, hf: 0.8, bw: 0.25, h: 0.6, Mu: 200 });
    const lowerBound = (200 / 0.9) / (420e3 * 0.55) * 1e4;
    if (!r.impossible) expect(r.AsCm2!).toBeGreaterThanOrEqual(lowerBound);
    /* It refuses, and says which input. */
    expect(r.ok).toBe(false);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.badFlange');
  });
  it('DEFECT 5 — a void bigger than the section never prints a negative Ast', () => {
    for (const o of [
      { kase: 'FCR' as const, b: 0.3, h: 0.3, holeB: 0.4, holeH: 0.4, Pu: 500, Mu: 100 },
      { kase: 'FCR-CIR' as const, D: 0.4, Dint: 0.5, Pu: 1000, Mu: 100 },
    ]) {
      const r = solve(o);
      expect(r.AstCm2, o.kase).toBeGreaterThanOrEqual(0);
    }
  });

  /*
   * DEFECT 6 — FCO with A1 + A2 + A3 ≠ 100 % is silently scaled.
   *
   * `facesA1A2A3` (cirsoc201-layouts.ts:120–141) places Ast·pct/100 per face,
   * so the bars carry Ast·Σpct/100 while the answer reported is Ast. The panel
   * shows a warning under the fields, but prints the number anyway. 30 × 30,
   * Pu 500, Mxu 100, Myu 50, n = 4/4/4:
   *
   *   50/50/0  → Ast = 45.90 cm²  (the reference)
   *   75/75/0  → Ast = 30.60 cm² = 45.90/1.5 — a reader placing 30.6 cm² split
   *              half and half is 33 % short: UNCONSERVATIVE
   *   25/25/0  → "noneWorks" at 72 cm² — a false refusal of a section that works.
   *
   * FIXED by reading the shares the way the workbook's own verification
   * sheet reads its areas: each face's part of the total, over the faces that
   * have bars. At Σ = 100 that is the old arithmetic, so every workbook value
   * stands; otherwise the memo says what was taken (`flex.step.pctNormalised`).
   */
  it('DEFECT 6 — FCO: Σ% = 150 must not report less steel than Σ% = 100', () => {
    const d = { kase: 'FCO' as const, b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 50 };
    const ref = solve({ ...d, pctA1: 50, pctA2: 50, pctA3: 0 }).AstCm2;
    const over = solve({ ...d, pctA1: 75, pctA2: 75, pctA3: 0 });
    expect(over.ok && over.AstCm2 < ref * 0.99).toBe(false);
  });
  it('DEFECT 6 — FCO: Σ% = 50 must not refuse a section that works at 100 %', () => {
    const d = { kase: 'FCO' as const, b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 50 };
    const under = solve({ ...d, pctA1: 25, pctA2: 25, pctA3: 0 });
    expect(under.impossible).toBe(false);
  });

  /*
   * DEFECT 7 — the proposed bars under-provide the heavier face.
   *
   * (a) FCR with A′s/As < 1: `chooseBarsPerLevel(AstCm2 / 2, …)`
   *     (cirsoc-flex.ts:663) sizes each level for HALF the total, but the
   *     tension level carries Ast/(1 + r). b 30, h 50, Pu 300, Mu 150,
   *     r = 0.5 → As = 10.00, A′s = 5.00 cm²; proposal "4 Ø16 per level"
   *     = 8.04 cm² on the tension face (−20 %). r = 0 → As = 15, proposal
   *     8.04 (−46 %).
   * (b) FCO with unequal percentages: `chooseBarsForCount(AstCm2, bars.length)`
   *     (cirsoc-flex.ts:673) gives every bar the AVERAGE share. 80/20/0,
   *     n = 4/4, Pu 500, Mxu 100: Ast = 35.52 → A1 needs 28.42 cm² on 4 bars
   *     (7.1 each); proposal "8 Ø25" puts 19.63 cm² on A1 (−31 %).
   *
   * FIXED: FCR sizes the As level for Ast/(1 + r) and, when r < 1, the A′s
   * level on its own line; FCO sizes each face for its own share (`barFaces`,
   * label "4 Ø32 (A1) + 4 Ø16 (A2)").
   */
  it('DEFECT 7a — FCR bars per level cover the TENSION level when A′s/As < 1', () => {
    for (const ratioAsPrime of [0.5, 0]) {
      const r = solve({ kase: 'FCR', b: 0.3, h: 0.5, Pu: ratioAsPrime ? 300 : 100, Mu: 150, ratioAsPrime });
      expect(r.barChoice!.areaCm2, `r = ${ratioAsPrime}`).toBeGreaterThanOrEqual(r.AsCm2! - 1e-6);
    }
  });
  it('DEFECT 7b — FCO bars cover each face’s own share', () => {
    const r = solve({ kase: 'FCO', b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 0, pctA1: 80, pctA2: 20, pctA3: 0 });
    const a1Need = r.AstCm2 * 0.8;
    const a2Need = r.AstCm2 * 0.2;
    const a1 = r.barFaces!.find((f) => f.face === 'A1')!;
    const a2 = r.barFaces!.find((f) => f.face === 'A2')!;
    expect(a1.needCm2).toBeCloseTo(a1Need, 9);
    /* A1's own four bars carry A1's 80 %; A2's carry its 20 %. */
    expect(a1.choice.count).toBe(4);
    expect(a1.choice.areaCm2).toBeGreaterThanOrEqual(a1Need - 1e-6);
    expect(a2.choice.areaCm2).toBeGreaterThanOrEqual(a2Need - 1e-6);
    expect(r.barChoice!.areaCm2).toBeGreaterThanOrEqual(r.AstCm2 - 1e-6);
  });

  /*
   * DEFECT 8 — a beam VERIFICATION passes an over-reinforced section.
   *
   * CIRSOC 201-2005 §10.3.5: a flexural member (Pu < 0.1 f'c Ag) must have
   * εt ≥ 0.004 at nominal strength. Design holds 5 ‰, but verify
   * (cirsoc-flex.ts:469–475, :521–523) checks only φMn ≥ Mu. 50 × 50,
   * 60 cm² (8 Ø32 in 7+1, centroid 5.7 cm, d = 0.443), Mu = 100:
   *
   *   c ≈ 0.266 m, εt = 0.003·(0.443 − 0.266)/0.266 = 2.0 ‰ < 4 ‰, φ = 0.65
   *   engine: ok = true, no warning line.
   *
   * FIXED: εt < 4 ‰ does not verify, and says so (`flex.step.notDuctile`).
   */
  it('DEFECT 8 — FSR verify with εt < 4 ‰ must not read "verifica"', () => {
    const r = solve({ mode: 'verify', b: 0.5, h: 0.5, AstGiven: 60, Mu: 100 });
    expect(r.epsilonT!).toBeLessThan(0.004);
    expect(r.ok).toBe(false);
  });

  /*
   * DEFECT 9 — the circular column prints an As,min computed on the HIDDEN
   * rectangular fields.
   *
   * cirsoc-flex.ts:719–721 guards on `Number.isFinite(i.b) && Number.isFinite(i.h)`
   * because "a circular section has neither", but the panel ALWAYS sends b and
   * h (CirsocFlexPanel.svelte, `input`: `b: b / 100, h: h / 100`). With the
   * panel's defaults (b 12, h 40, d′s 3) a D = 40 column gets
   * "As,mín = 1.48 cm²" in 4.2, a beam rule on a rectangle the reader cannot
   * see, which changes when they edit a different case.
   *
   * FIXED: As,min is reported on the rectangular column sheets only.
   */
  it('DEFECT 9 — FCR-CIR does not print a rectangle’s As,min', () => {
    const i: FlexInput = { ...BASE, kase: 'FCR-CIR', b: 0.12, h: 0.40, D: 0.4, dPrimeS: 0.03, Pu: 1000, Mu: 300 };
    const r = solveFlex(i);
    expect(r.AsMinCm2).toBeUndefined();
  });

  /*
   * DEFECT 10 — FCO with no bars at all (every % at 0, or every count at 0)
   * is reported as "the section does not work even at the maximum", which
   * sends the reader to enlarge a section whose real problem is an empty
   * distribution. The message key `flex.step.noBars` exists in the locales
   * but nothing emits it.
   *
   * FIXED: `validate` emits it and refuses the layout.
   */
  it('DEFECT 10 — FCO with an empty distribution says so', () => {
    const r = solve({ kase: 'FCO', b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 50, pctA1: 0, pctA2: 0, pctA3: 0 });
    expect(r.steps.map((s) => s.key)).toContain('flex.step.noBars');
  });

  /*
   * DEFECT 11 — bar counts the layout cannot honour are changed silently.
   *
   *  - FCR-CIR with barCount 0: `ring` uses max(n, 1) — a ring of ONE bar —
   *    and the column is designed ok with it.
   *  - FCO with an odd N° A3 (1 or 3): `facesA1A2A3` places floor(n/2) per
   *    side with a minimum of 1, so 1 and 3 both become 2 bars.
   *
   * FIXED: a ring count below 1 (or not an integer) is refused; an odd
   * N° A3 is placed as typed, the extra bar on the left face, and the memo
   * says so (`flex.step.a3Split`).
   */
  it('DEFECT 11 — FCR-CIR with 0 bars is refused', () => {
    const r = solve({ kase: 'FCR-CIR', D: 0.4, barCount: 0, Pu: 1000, Mu: 100 });
    expect(r.ok).toBe(false);
  });
  it('DEFECT 11 — FCO N° A3 = 3 places three A3 bars', () => {
    const r = solve({ kase: 'FCO', b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 50, pctA1: 40, pctA2: 40, pctA3: 20, nA3: 3 });
    expect(r.bars.length).toBe(4 + 4 + 3);
  });

  /*
   * DEFECT 12 — a zero-moment column prints φ = 0.
   *
   * `biaxialUtilisation` (cirsoc-flex.ts:267–274) returns φ = 0, c = 0, εt = 0
   * for Mres = 0, and the memo prints "c = 0 cm, a = 0 cm, εt = 0 ‰ → φ = 0";
   * φ is never 0 under CIRSOC 201 (0.65 compression-controlled here).
   *
   * FIXED with DEFECT 2: the state is read at the axial limit itself.
   */
  it('DEFECT 12 — FCO with Mxu = Myu = 0 reports a real φ', () => {
    const r = solve({ kase: 'FCO', b: 0.3, h: 0.3, Pu: 1000, Mu: 0, Muy: 0 });
    expect(r.phi!).toBeGreaterThanOrEqual(0.65);
  });

  /*
   * DEFECT 13 — the flange narrower than the web is accepted as a T.
   *
   * bf < bw is not a flanged section; the engine clips an inverted shape
   * and designs it without a word. Not unsafe (the polygon is what it is),
   * but the reader typed a T and got something else.
   *
   * FIXED: refused, pointing at the rectangular sheet (`flex.step.flangeNarrow`).
   */
  it('DEFECT 13 — FST with bf < bw is flagged', () => {
    const r = solve({ kase: 'FST', bf: 0.15, bw: 0.25 });
    expect(r.ok).toBe(false);
  });

  /*
   * DEFECT 14 — just below the singly-reinforced ceiling, the design lands on
   * the OVER-REINFORCED root: a compression-controlled "design", ok = true.
   *
   * `bisect` (cirsoc-flex.ts:380–388) searches [0.05, AstMaxHere] and assumes
   * φMn grows with As ("monotone in its steel", :308). It does not: past
   * εt = 5 ‰ φ falls from 0.9 toward 0.65 faster than Mn grows, so φMn(As)
   * peaks at the singly limit, dips, and climbs again on the φ = 0.65 branch.
   * When φMn at the first midpoint (AstMax/2) already exceeds Mu, the bisection
   * converges on that second branch. Seen with fy = 500 within ~3 % below the
   * ceiling (57 of 882 scanned cases, b 12–40 cm).
   *
   * b 30, h 60, d 0.55, f'c 20, fy 500, Mu = 372.0 kN·m (ceiling 372.04):
   *   correct: c = 3/8·0.55 = 0.20625, a = 0.1753, As = 0.85·20·0.30·0.1753/500
   *            = 17.88 cm², φMn = 0.9·894.1·(0.55 − 0.0877) = 372.0 ✓
   *   engine:  31.61 cm², εt = 2.18 ‰, φ = 0.65 — 77 % more steel, below
   *            §10.3.5's 4 ‰; at Mu = 372.1 it answers 17.88 cm² again.
   *
   * With layering it is worse, because the layer loop (:479–487) then
   * oscillates between two covers and exits after 8 passes on a pair that do
   * not agree. b 15, h 30, d′s 5, f'c 20, fy 500, Mu = 38.1 kN·m:
   *   engine: 6.88 cm² → "3 Ø20 (2+1)", memo "d = 25 cm" — but those bars
   *   put d at 23.5 cm; verifying the very steel it proposed gives
   *   φMn = 34.09 kN·m < 38.1 (ratio 1.118): the design is UNCONSERVATIVE.
   *   Correct: ≈ 4.03 cm² (2 Ø20, one layer, εt ≥ 5 ‰).
   *
   * The same bisection also fails the other way, well below the ceiling and
   * with fy 420 too: when φMn at the midpoint is on the φ = 0.65 branch and
   * BELOW Mu, it walks up to AstMaxHere. T bf 225, hf 18, bw 45, h 58, d′s 3,
   * f'c 29, fy 500, Mu 2976 (ceiling 4018):
   *   pass 0, cover 3.00 cm → 135.23 cm², 17 Ø32 (7+7+3), centroid 7.36 cm
   *   pass 1, cover 7.36 cm → 468.00 cm² (= 8 %, ceiling 3407 > Mu!) → >30 bars,
   *           no centroid, falls back to d′s = 3.00 → pass 2 = pass 0 …
   *   exits after 8 passes at cover 3.00 with bars at 7.36: the memo reads
   *   "d = 55 cm al baricentro de 3 capas (7+7+3), no 55 cm", and verifying
   *   the 135.23 cm² it proposes gives ratio 1.098 — 10 % unconservative.
   *   Same on b 95, h 104, f'c 31, fy 420, Mu 7833 ("d = 100 … no 100 cm").
   *
   * Fix direction: bisect the singly branch on [0.05, AsAtLimit], where φMn is
   * monotone, and check convergence after the layer loop.
   *
   * FIXED that way: the bisection is bounded by the singly-reinforced limit,
   * and the layer loop only moves the cover up, stopping once the bars sit at
   * or below the cover they were sized for; d is then read from the bars.
   */
  it('DEFECT 14 — FSR fy 500, Mu just under the singly ceiling: ductile, least steel', () => {
    const r = solve({ b: 0.3, h: 0.6, fc: 20, fy: 500, Mu: 372.0 });
    expect(r.epsilonT!).toBeGreaterThanOrEqual(0.005 - 1e-4);
    const c = 0.375 * 0.55;
    const As = (0.85 * 20 * 0.3 * 0.85 * c) / 500 * 1e4;
    expect(As).toBeCloseTo(17.88, 2);
    expect(r.AsCm2!).toBeCloseTo(As, 1);
  });
  it('DEFECT 14 — the bars a design proposes must verify for the same Mu', () => {
    const s = { b: 0.15, h: 0.3, fc: 20, fy: 500 };
    const r = solve({ ...s, Mu: 38.1 });
    const v = solve({ ...s, mode: 'verify', AstGiven: r.AsCm2!, Mu: 38.1 });
    expect(v.ratio).toBeLessThanOrEqual(1.001);
  });
  it('DEFECT 14 — layered T: the steel it proposes verifies, and d is the bars’ d', () => {
    const T = { kase: 'FST' as const, fc: 29, fy: 500, bf: 2.25, hf: 0.18, bw: 0.45, h: 0.58, dPrime: 0.03, dPrimeS: 0.03 };
    const r = solve({ ...T, Mu: 2976 });
    expect(r.ok).toBe(true);
    const d = r.steps.find((s) => s.key === 'flex.step.dLayers')!.params!.d as number;
    expect(d).toBeCloseTo((0.58 - r.barChoice!.centroidFromFaceM!) * 100, 1);
    const v = solve({ ...T, mode: 'verify', AstGiven: r.AsCm2!, Mu: 2976 });
    expect(v.ratio).toBeLessThanOrEqual(1.001);
  });
  it('DEFECT 14 — more Mu → more steel, fy = 500 (As jumps 4.01 → 6.88 → 4.09 cm²)', () => {
    const s = { b: 0.15, h: 0.3, fc: 20, fy: 500 };
    let prev = 0;
    for (let Mu = 36; Mu <= 40; Mu += 0.1) {
      const r = solve({ ...s, Mu });
      expect(r.AstCm2, `Mu ${Mu.toFixed(1)}`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = r.AstCm2;
    }
  });

  /*
   * DEFECT 15 — a floating-point floor in `barsPerLayer`
   * (cirsoc201-bars.ts:98–101): (0.15 − 2·0.05)·1000 = 49.999999999999986,
   * so on a 15 cm web with d′s = 5 cm two Ø25 (pitch 25 + 25 = 50 mm, clear
   * gap exactly 25 mm) are counted as ONE per layer. The chooser then stacks
   * them, or reaches for 3 Ø20 (2+1): 6.3 cm² in that web comes out as two
   * layers where 2 Ø25 fits in one.
   *
   * FIXED: the floor carries a 1e-6 tolerance.
   */
  it('DEFECT 15 — 2 Ø25 fit one layer of a 15 cm web at d′s = 5 cm', () => {
    expect(barsPerLayer(0.15, 0.05, 25)).toBe(2);
  });
});

// ── 3. Physics against hand calculations ─────────────────────────────

/** Singly-reinforced rectangle: As for φMn = Mu, closed form. m, MPa, kN·m → cm². */
function handSinglyAs(b: number, d: number, fc: number, fy: number, Mu: number): number {
  const Rn = Mu / 0.9 / (b * d * d); // kPa
  const k = 1 - Math.sqrt(1 - (2 * Rn) / (0.85 * fc * 1000));
  return ((0.85 * fc * b * d) / fy) * k * 1e4;
}

describe('3 · physics — rectangular, singly reinforced', () => {
  /* b 30, h 60, d′s 5 → d = 0.55; f'c 25, fy 420; Mu = 200 kN·m. */
  const r = solve({});
  const d = 0.55;
  it('one layer, so d = h − d′s', () => {
    expect(r.barChoice!.layers).toBe(1);
  });
  it('As by the closed form: 10.249 cm²', () => {
    const As = handSinglyAs(0.3, d, 25, 420, 200);
    expect(As).toBeCloseTo(10.249, 3);
    expect(r.AsCm2!).toBeCloseTo(As, 3);
  });
  it('Whitney block a = As·fy / (0.85 f′c b), c = a/β1', () => {
    const a = (r.AsCm2! * 1e-4 * 420) / (0.85 * 25 * 0.3);
    expect(r.a!).toBeCloseTo(a, 5);
    expect(r.c!).toBeCloseTo(a / beta1(25), 5);
  });
  it('Mn = As fy (d − a/2), φ = 0.9 at εt ≥ 5 ‰', () => {
    const a = r.a!;
    const Mn = r.AsCm2! * 1e-4 * 420e3 * (d - a / 2);
    const epsT = (0.003 * (d - r.c!)) / r.c!;
    expect(r.epsilonT!).toBeCloseTo(epsT, 6);
    expect(epsT).toBeGreaterThan(0.005);
    expect(r.phi).toBe(0.9);
    expect(r.phiMn!).toBeCloseTo(0.9 * Mn, 4);
    expect(r.phiMn!).toBeCloseTo(200, 3);
  });
  it('cmax = 3/8 d (εt = 5 ‰)', () => {
    expect(r.cMax!).toBeCloseTo((0.003 / 0.008) * d, 9);
  });
  it('β1 above 28 MPa (f′c 40 → 0.764) enters c', () => {
    const q = solve({ fc: 40 });
    expect(beta1(40)).toBeCloseTo(0.85 - 0.05 * 12 / 7, 9);
    expect(q.c!).toBeCloseTo(q.a! / beta1(40), 6);
    expect(q.AsCm2!).toBeCloseTo(handSinglyAs(0.3, d, 40, 420, 200), 3);
  });
});

describe('3 · physics — φ from εt, in verification', () => {
  /*
   * 50 × 50, d′s 5 → d = 0.45 (5 Ø32, one layer); f'c 25, fy 420; As = 40 cm².
   *   a = 40e-4·420 / (0.85·25·0.5) = 0.15812 m, c = a/0.85 = 0.18602 m
   *   εt = 0.003·(0.45 − 0.18602)/0.18602 = 4.257 ‰  → transition
   *   φ = 0.65 + 0.25·(4.257 − 2.1)/(5 − 2.1) = 0.8360
   *   φMn = 0.8360 · 40e-4·420e3·(0.45 − 0.07906) = 520.96 kN·m
   */
  it('transition zone: φ = 0.836, φMn = 520.96 kN·m', () => {
    const r = solve({ mode: 'verify', b: 0.5, h: 0.5, AstGiven: 40, Mu: 100 });
    expect(r.barChoice!.layers).toBe(1);
    const a = (40e-4 * 420) / (0.85 * 25 * 0.5);
    const c = a / 0.85;
    const eps = (0.003 * (0.45 - c)) / c;
    const phi = 0.65 + 0.25 * (eps - 0.0021) / (0.005 - 0.0021);
    expect(r.a!).toBeCloseTo(a, 5);
    expect(r.epsilonT!).toBeCloseTo(eps, 6);
    expect(r.phi!).toBeCloseTo(phi, 4);
    expect(r.phi!).toBeCloseTo(0.836, 3);
    expect(r.phiMn!).toBeCloseTo(phi * 40e-4 * 420e3 * (0.45 - a / 2), 2);
    expect(r.ratio).toBeCloseTo(100 / r.phiMn!, 6);
  });

  it('compression-controlled (εt < εy): steel below yield, φ = 0.65', () => {
    /*
     * 60 cm² in 50 × 50 goes in two layers; the engine lumps them at their
     * centroid, and so does the hand calculation, with d = h − centroid.
     * With fs = Es·0.003·(d − c)/c < fy, equilibrium is the quadratic
     *   0.85 f'c b β1 c² + As Es εcu c − As Es εcu d = 0.
     */
    const r = solve({ mode: 'verify', b: 0.5, h: 0.5, AstGiven: 60, Mu: 100 });
    const d = 0.5 - r.barChoice!.centroidFromFaceM!;
    const A = 0.85 * 25e3 * 0.5 * 0.85;
    const B = 60e-4 * 200e6 * 0.003;
    const c = (-B + Math.sqrt(B * B + 4 * A * B * d)) / (2 * A);
    const eps = (0.003 * (d - c)) / c;
    expect(eps).toBeLessThan(420 / 200000);
    const fs = 200e6 * eps; // kPa
    const Mn = 60e-4 * fs * (d - (0.85 * c) / 2);
    expect(r.c!).toBeCloseTo(c, 4);
    expect(r.phi).toBeCloseTo(0.65, 9);
    expect(r.phiMn!).toBeCloseTo(0.65 * Mn, 0);
  });

  it('phiFromStrain matches §9.3.2 at the three anchors', () => {
    expect(phiFromStrain(0.0021, 420)).toBeCloseTo(0.65, 9);
    expect(phiFromStrain(0.005, 420)).toBe(0.9);
    expect(phiFromStrain(0.0035, 420)).toBeCloseTo(0.65 + 0.25 * (0.0014 / 0.0029), 9);
    expect(phiFromStrain(0.0025, 500)).toBeCloseTo(0.65, 9);
    expect(phiFromStrain(0.001, 420, 'spiral')).toBe(0.70);
  });
});

describe('3 · physics — T sections', () => {
  it('block in the flange: a rectangle of width bf', () => {
    /* bf 1.00, hf 0.10, bw 0.25, h 0.60, d 0.55, Mu 200 → As = 9.792 cm², a = 1.94 cm < hf. */
    const r = solve({ kase: 'FST', bf: 1.0, hf: 0.10, bw: 0.25, h: 0.6, Mu: 200 });
    const As = handSinglyAs(1.0, 0.55, 25, 420, 200);
    expect(r.AsCm2!).toBeCloseTo(As, 3);
    expect(r.a!).toBeLessThan(0.10);
    expect(r.a!).toBeCloseTo((As * 1e-4 * 420) / (0.85 * 25 * 1.0), 5);
    /* As,min on the WEB, §10.5.1. */
    expect(r.AsMinCm2!).toBeCloseTo((1.4 / 420) * 0.25 * 0.55 * 1e4, 6);
  });

  it('block in the web: flange overhangs plus web rectangle', () => {
    /*
     * bf 0.80, hf 0.08, bw 0.40, h 0.60, d′s 5; f'c 25, fy 420; Mu 800.
     *   Cf = 0.85·25e3·(0.80 − 0.40)·0.08 = 680 kN, Asf = 16.19 cm²
     *   Mnf = 680·(d − 0.04)
     *   web: Mu/φ − Mnf on a 0.40 rectangle → Asw by the closed form
     * with d taken from the bars the engine chose (one layer if they fit).
     */
    const r = solve({ kase: 'FST', bf: 0.8, hf: 0.08, bw: 0.4, h: 0.6, Mu: 800 });
    const d = 0.6 - (r.barChoice!.centroidFromFaceM ?? 0.05);
    const Cf = 0.85 * 25e3 * 0.4 * 0.08;
    const Mnf = Cf * (d - 0.04);
    const Mw = 800 / 0.9 - Mnf;
    const Asw = handSinglyAs(0.4, d, 25, 420, Mw * 0.9);
    const aw = (Asw * 1e-4 * 420) / (0.85 * 25 * 0.4);
    expect(aw).toBeGreaterThan(0.08);
    expect(r.AsCm2!).toBeCloseTo(Cf / 420e3 * 1e4 + Asw, 2);
    expect(r.a!).toBeCloseTo(aw, 4);
    expect(r.epsilonT!).toBeGreaterThanOrEqual(0.005);
    expect(r.phiMn!).toBeCloseTo(800, 2);
  });
});

describe('3 · physics — doubly reinforced', () => {
  /*
   * b 30, h 50, d′ = d′s = 5 → d = 0.45 (if one layer); f'c 25, fy 420; Mu 400.
   * The engine's rule, which is the textbook one: hold c at εt = 5 ‰,
   *   c = 3/8·d, a = β1 c, As1 = 0.85 f'c b a / fy, Mn1 = As1 fy (d − a/2)
   *   f′s = min(Es·0.003·(c − d′)/c, fy) − 0.85 f'c (displaced concrete)
   *   A′s = (Mu/0.9 − Mn1) / (f′s (d − d′)),  As = As1 + A′s f′s / fy
   */
  const r = solve({ b: 0.3, h: 0.5, Mu: 400 });
  const d = 0.5 - r.barChoice!.centroidFromFaceM!;
  const c = 0.375 * d;
  const a = 0.85 * c;
  const As1 = (0.85 * 25e3 * 0.3 * a) / 420e3;
  const Mn1 = As1 * 420e3 * (d - a / 2);
  const fsp = Math.min(200e6 * 0.003 * (c - 0.05) / c, 420e3) - 0.85 * 25e3;
  const Asp = (400 / 0.9 - Mn1) / (fsp * (d - 0.05));
  const As = As1 + (Asp * fsp) / 420e3;

  it('goes doubly', () => {
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.key)).toContain('flex.step.doubly');
  });
  it('A′s and As by the closed form (±0.5 %)', () => {
    expect(r.AsPrimeCm2! / (Asp * 1e4)).toBeCloseTo(1, 2);
    expect(r.AsCm2! / (As * 1e4)).toBeCloseTo(1, 2);
  });
  it('εt held at 5 ‰, φ = 0.9, φMn = Mu', () => {
    expect(r.epsilonT!).toBeCloseTo(0.005, 4);
    expect(r.phi).toBeCloseTo(0.9, 6);
    expect(r.phiMn!).toBeCloseTo(400, 2);
  });
  it('singly-reinforced ceiling printed in the memo = 0.9·Mn1', () => {
    const m = r.steps.find((s) => s.key === 'flex.step.singlyMax')!.params!.m as number;
    expect(m).toBeCloseTo(0.9 * Mn1, 1);
  });
});

describe('3 · physics — minimum steel, §10.5.1', () => {
  it('1.4/fy governs up to f′c ≈ 31.4 MPa; √f′c/(4 fy) above', () => {
    expect(minFlexuralSteelCm2(25, 420, 0.3, 0.55)).toBeCloseTo((1.4 / 420) * 0.3 * 0.55 * 1e4, 9);
    expect(minFlexuralSteelCm2(40, 420, 0.3, 0.55)).toBeCloseTo((Math.sqrt(40) / 4 / 420) * 0.3 * 0.55 * 1e4, 9);
  });
  it('a small moment is governed by As,min, and the capacity then exceeds Mu', () => {
    for (const fc of [20, 25, 40, 50]) {
      const r = solve({ fc, Mu: 20 });
      expect(r.AsCm2!, `fc ${fc}`).toBeCloseTo(r.AsMinCm2!, 9);
      expect(r.AsMinCm2!).toBeCloseTo(minFlexuralSteelCm2(fc, 420, 0.3, 0.55), 9);
      expect(r.phiMn!).toBeGreaterThan(20);
      expect(r.ok).toBe(true);
    }
  });
  it('verification below As,min says so', () => {
    const r = solve({ mode: 'verify', AstGiven: 3, Mu: 20 });
    expect(r.steps.map((s) => s.key)).toContain('flex.step.belowMin');
  });
});

describe('3 · design is the least steel, and monotonic', () => {
  /* fy = 500 near the singly-reinforced ceiling is pinned by the DEFECT 14 tests in §2. */
  const sections = [
    { b: 0.20, h: 0.50, fc: 25, fy: 420 },
    { b: 0.30, h: 0.70, fc: 35, fy: 420 },
    { b: 0.15, h: 0.30, fc: 20, fy: 420 },
    { b: 0.60, h: 1.20, fc: 45, fy: 420 },
  ];

  it('φMn ≥ Mu, and within 0.2 % of it when neither As,min nor bar layering decides', () => {
    for (const s of sections) {
      for (let k = 1; k <= 12; k++) {
        const Mu = k * 0.02 * 0.85 * s.fc * 1000 * s.b * s.h * s.h;
        const r = solve({ ...s, dPrime: 0.05, dPrimeS: 0.05, Mu });
        if (r.impossible) continue;
        expect(r.phiMn!, JSON.stringify({ ...s, Mu })).toBeGreaterThanOrEqual(Mu * 0.999);
        if (r.AsCm2! > r.AsMinCm2! * 1.001) {
          expect(r.phiMn! / Mu, JSON.stringify({ ...s, Mu })).toBeLessThan(1.002);
        }
      }
    }
  });

  it('more Mu → more steel (As + A′s), across the singly → doubly handover', () => {
    for (const s of sections) {
      let prev = 0;
      const top = 0.9 * 0.85 * s.fc * 1000 * s.b * s.h * s.h * 0.45;
      for (let Mu = 1; Mu <= top; Mu += top / 80) {
        const r = solve({ ...s, dPrime: 0.05, dPrimeS: 0.05, Mu });
        if (r.impossible) break;
        expect(r.AstCm2, `${JSON.stringify(s)} Mu ${Mu.toFixed(1)}`).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = r.AstCm2;
      }
    }
  });

  it('deeper section → less steel, while flexure (not As,min) governs', () => {
    for (const Mu of [80, 150, 300]) {
      let prev = Infinity;
      for (let h = 0.4; h <= 1.2 + 1e-9; h += 0.05) {
        const r = solve({ b: 0.3, h, Mu });
        if (r.impossible) continue;
        if (r.AsCm2! <= r.AsMinCm2! * 1.001) break;
        expect(r.AstCm2, `Mu ${Mu} h ${h.toFixed(2)}`).toBeLessThanOrEqual(prev + 1e-6);
        prev = r.AstCm2;
      }
    }
  });

  it('column: more Mu at fixed Pu → more Ast', () => {
    for (const Pu of [-200, 0, 400, 1000]) {
      let prev = 0;
      for (let Mu = 5; Mu <= 250; Mu += 5) {
        const r = solve({ kase: 'FCR', b: 0.3, h: 0.4, Pu, Mu });
        if (r.impossible) break;
        expect(r.AstCm2, `Pu ${Pu} Mu ${Mu}`).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = r.AstCm2;
      }
    }
  });

  it('column design: least steel — ratio ≈ 1 unless the 1 % minimum governs', () => {
    for (const o of [
      { kase: 'FCR' as const, b: 0.3, h: 0.3, Pu: 500, Mu: 100 },
      { kase: 'FCR-CIR' as const, D: 0.5, Pu: 1500, Mu: 200, b: NaN, h: NaN },
      { kase: 'FCO' as const, b: 0.4, h: 0.4, Pu: 800, Mu: 150, Muy: 80 },
    ]) {
      const r = solve(o);
      expect(r.ok, o.kase).toBe(true);
      expect(r.AstCm2).toBeGreaterThan(r.AstMinCm2! * 1.001);
      expect(r.ratio, o.kase).toBeGreaterThan(0.998);
      expect(r.ratio, o.kase).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

// ── 4. Units ─────────────────────────────────────────────────────────

describe('4 · units — m, MPa, kN, kN·m in; cm² and cm out', () => {
  const r = solve({});

  it('the memo reports d in cm and As,min in cm²', () => {
    const step = r.steps.find((s) => s.key === 'flex.step.d')!;
    expect(step.params!.d).toBeCloseTo(55, 9);
    expect(step.params!.asMin).toBeCloseTo(5.5, 9);
  });

  it('the printed rows turn a and c (m) into cm, and As into cm²', () => {
    const rows = sheetRows({ kase: 'FSR', mode: 'design', r, fc: 25, fy: 420, spiral: false, barCount: 0, Pu: 0, Mu: 200 });
    const cells = Object.fromEntries(rows.beam);
    const vals = Object.values(cells);
    expect(vals).toContain(`${(r.a! * 100).toFixed(2)} cm`);
    expect(vals).toContain(`${(r.c! * 100).toFixed(2)} cm`);
    expect(vals).toContain(`${r.AsCm2!.toFixed(3)} cm²`);
    expect(rows.headline).toBe(`As = ${r.AstCm2.toFixed(3)} cm²`);
  });

  it('φMn is in kN·m, the same unit as Mu', () => {
    /* As fy (d − a/2) with As in m² and fy in kPa is kN·m. */
    expect(r.phiMn! / 200).toBeCloseTo(1, 6);
  });

  it('ρ is dimensionless: Ast·1e-4 / Ag', () => {
    expect(r.rho).toBeCloseTo((r.AstCm2 * 1e-4) / (0.3 * 0.6), 12);
  });

  it('column Pu in kN against the §10.3.6 cap in kN', () => {
    const q = solve({ kase: 'FCR', b: 0.3, h: 0.3, Pu: 2600, Mu: 50 });
    const cap = axialCap(25, 420, 0.09, 72e-4, 'ties');
    expect(cap).toBeCloseTo(0.52 * (0.85 * 25e3 * (0.09 - 72e-4) + 420e3 * 72e-4), 6);
    expect(q.impossible).toBe(true); // 2600 > 2487 kN
    const ok = solve({ kase: 'FCR', b: 0.3, h: 0.3, Pu: 2400, Mu: 5 });
    expect(ok.impossible).toBe(false);
  });

  it('FCO Pu(max) in kN is the 8 % cap on the design sheet', () => {
    const q = solve({ kase: 'FCO', b: 0.3, h: 0.3, Pu: 500, Mu: 100, Muy: 50 });
    expect(q.puMax!).toBeCloseTo(axialCap(25, 420, 0.09, 0.08 * 0.09, 'ties'), 6);
  });

  it('the same beam typed in cm by the panel (÷ 100) and in m gives the same answer', () => {
    /* The panel's one conversion: `b: b / 100, h: h / 100, dPrimeS: dPrimeS / 100`. */
    const fromPanel = solve({ b: 30 / 100, h: 60 / 100, dPrimeS: 5 / 100, dPrime: 5 / 100 });
    expect(fromPanel.AsCm2).toBeCloseTo(r.AsCm2!, 12);
  });
});

describe('5 · FCR verify by levels — the fit is judged on each level\'s own cover', () => {
  const keys = (r: FlexOutput) => r.steps.map((s) => s.key);
  /*
   * 30 × 60, 19 cm² a level: 4 Ø25 a face. Four bars across b = 30 take
   * 4·2.5 + 3·2.5 = 17.5 cm of clear width, so they fit at 5 cm to the bar
   * centre (20 cm of room) and not at 9 (12). The panel does not ask d′/d′s
   * in this mode — whatever they hold is another case's leftover.
   */
  it('levels at 5 cm fit, although the leftover covers say 9', () => {
    const r = solve({
      kase: 'FCR', mode: 'verify', dPrime: 0.09, dPrimeS: 0.09,
      levels: [{ distanceFromBottom: 0.05, areaCm2: 19 }, { distanceFromBottom: 0.55, areaCm2: 19 }],
      AstGiven: 38, Pu: 500, Mu: 100,
    });
    expect(keys(r)).not.toContain('flex.step.wontFitColumn');
  });
  it('levels at 9 cm do not fit, although the leftover covers say 2', () => {
    const r = solve({
      kase: 'FCR', mode: 'verify', dPrime: 0.02, dPrimeS: 0.02,
      levels: [{ distanceFromBottom: 0.09, areaCm2: 19 }, { distanceFromBottom: 0.51, areaCm2: 19 }],
      AstGiven: 38, Pu: 500, Mu: 100,
    });
    expect(keys(r)).toContain('flex.step.wontFitColumn');
  });
  it('an intermediate level is laid out against the same side cover, not its distance to a face', () => {
    // Three levels of 2 Ø12 on 30 × 60. The middle one is 30 cm from either face; read as
    // its cover, it left 30 − 2·30 cm of width and every third level "did not fit".
    const r = solve({
      kase: 'FCR', mode: 'verify', dPrime: 0.05, dPrimeS: 0.05,
      levels: [
        { distanceFromBottom: 0.05, areaCm2: 2.26 },
        { distanceFromBottom: 0.30, areaCm2: 2.26 },
        { distanceFromBottom: 0.55, areaCm2: 2.26 },
      ],
      AstGiven: 6.78, Pu: 500, Mu: 50,
    });
    expect(keys(r)).not.toContain('flex.step.wontFitColumn');
  });
});
