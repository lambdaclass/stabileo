/**
 * Deflections of the beams and slabs the sheets design, under each code's own rules: the depth
 * that needs no calculation, and otherwise the deflection on the cracked section under the
 * unfactored loads, immediate and long-term, against the code's limit. A code's rules arrive
 * through `codes/index.ts`; this module only knows their shape.
 *
 * The analysis gives the service response. A beam's comes from its own moment diagram: the chord
 * deflection of a span is ∫∫M/EI, so `k = ∫∫M` (kN·m³) under each load group is what the span
 * carries, and on an effective inertia Ie it deflects k/(Ec·Ie). A slab's comes from its shells'
 * displacements, `k = δ·E·h³/12` per metre. Both stay put when the section changes, which is what
 * lets a resize ask a smaller or deeper member the same question.
 */
import type { BeamDemand, BeamRow } from './beam-row';
import type { SlabDemand, SlabFace, SlabRow } from './slab-row';
import type { Fmt } from './format';
import { faceLayout, groupsArea, meshArea, proposeBeamFace, proposeMesh } from './bars';
import { DEFLECTION_SUPPORTS, LOAD_MONTHS, type DeflectionSettings, type DeflectionSupport, type LoadMonths } from './design-options';
import { check, isGenerous, type BeamAdopted, type CheckLine, type SlabAdopted, type Step, type StepGroup } from './types';

export { DEFLECTION_SUPPORTS, LOAD_MONTHS, type DeflectionSettings, type DeflectionSupport, type LoadMonths };

export const DEFAULT_SUPPORTS: DeflectionSupport = 'nonFragile';
export const DEFAULT_MONTHS: LoadMonths = 60;
/** The live load's sustained share where neither the design data nor a sustained service combination states one: EN 1990 Table A1.1's ψ2 for dwellings and offices. */
export const DEFAULT_SUSTAINED = 0.3;
/** φ(∞, 28 d) indoors (RH 50 %), h0 150–300 mm, C25–C35, from EN 1992-1-1 Figure 3.1. */
export const DEFAULT_CREEP = 2.5;

/** One load group on a span: `k` its chord deflection times the flexural stiffness (kN·m³ for a beam, kN·m³/m for a slab strip), `m` its moment where the effective inertia is read (kN·m, or kN·m/m). */
export interface LoadState { k: number; m: number }

/** The unfactored response of a span by load group: dead, live, and roof live, snow and rain. */
export interface ServiceSpan {
  dead: LoadState; live: LoadState; roof: LoadState;
  /** The load cases of each group, as the steps name them. */
  names: { dead: string; live: string; roof: string };
  /** The live load's sustained share in the project's sustained service combination, where it has one. */
  psiCombo?: number;
  /** A slab: the strip whose bars the effective inertia reads, and the reference its sag was measured from. */
  strip?: { face: SlabFace; reference: 'edges' | 'corners' | 'root' };
}

/** A slab edge: shared with another panel, and what holds it (its stiffness ratio αf, §8.10.2.7; 0 where nothing, large for a wall). */
export interface SlabEdge { continuous: boolean; kind: 'beam' | 'wall' | 'columns' | 'free'; alpha: number; half: number }
export interface SlabEdges { x0: SlabEdge; x1: SlabEdge; y0: SlabEdge; y1: SlabEdge }

/** What a demand carries for its deflection: absent, the member is not checked (a foundation on the ground). */
export interface Serviceable { service?: ServiceSpan; edges?: SlabEdges; serviceOff?: true }

export type SpanEnds = 'simple' | 'oneEnd' | 'both' | 'cantilever';

/** The section the effective inertia is read at, m and m²: midspan, or the root of a cantilever. */
export interface DeflectionSection { b: number; h: number; d: number; dPrime: number; As: number; AsPrime: number; AsReq: number }

export interface DeflectionInput {
  member: 'beam' | 'slab';
  section: DeflectionSection;
  /** The span the tables and the limit read, m. */
  L: number;
  ends: SpanEnds;
  /** A two-way slab panel. */
  twoWay?: TwoWay;
  /** Flange width over web for EN 1992 §7.4.2(2). */
  flangeRatio?: number;
  fc: number; fy: number;
  service?: ServiceSpan;
  settings: DeflectionSettings;
}

export interface TwoWay {
  /** Clear spans, m: the longer and the shorter. */
  lnLong: number; lnShort: number;
  /** Mean αf of the edges where all four have beams or walls; null otherwise. */
  alphaFm: number | null;
  exterior: boolean; edgeBeams: boolean;
  /** Discontinuous edges with no beam of αf ≥ 0.8 (§8.3.1.2.1). */
  bareEdges: number;
  /** No beam or wall on any edge. */
  flat: boolean;
  /** Share of the perimeter that is continuous (TS 500 αs). */
  continuousShare: number;
}

export interface DeflectionOutcome { line: CheckLine; group: StepGroup; ok: boolean; computed: boolean }

export interface DeflectionMechanics {
  /** The cracked transformed inertia of a rectangular section, m⁴. */
  crackedInertia(i: { b: number; h: number; d: number; dPrime: number; As: number; AsPrime: number; n: number }): { Icr: number; kd: number };
  /** The effective inertia of ACI 318-19 and CIRSOC 201-2025 Table 24.2.3.5 (Bischoff). */
  effectiveInertia(Ig: number, Icr: number, Mcr: number, Ma: number): number;
}

export interface DeflectionCode {
  check(x: DeflectionInput, fmt: Fmt): DeflectionOutcome;
}

const ES = 200000;
const XI: Record<LoadMonths, number> = { 3: 1.0, 6: 1.2, 12: 1.4, 60: 2.0 };

/** The settings with their defaults, the sustained share from the service combination when the design data state none. */
export function resolved(s: DeflectionSettings | undefined, service?: ServiceSpan): Required<Omit<DeflectionSettings, 'always'>> & { always: boolean; sustainedFrom: 'option' | 'combination' | 'default' } {
  const own = s?.sustained;
  const sustainedFrom = own !== undefined ? 'option' : service?.psiCombo !== undefined ? 'combination' : 'default';
  return {
    supports: s?.supports ?? DEFAULT_SUPPORTS, months: s?.months ?? DEFAULT_MONTHS,
    sustained: own ?? service?.psiCombo ?? DEFAULT_SUSTAINED, creep: s?.creep ?? DEFAULT_CREEP, always: s?.always === true, sustainedFrom,
  };
}

/** The sustained and total states: D + ψ·L, and D + L + (Lr, S, R) at 1.0. */
export function combinedStates(sv: ServiceSpan, psi: number): { dead: LoadState; sustained: LoadState; total: LoadState } {
  const add = (...xs: Array<[LoadState, number]>): LoadState => ({ k: xs.reduce((s, [x, f]) => s + f * x.k, 0), m: xs.reduce((s, [x, f]) => s + f * x.m, 0) });
  return { dead: sv.dead, sustained: add([sv.dead, 1], [sv.live, psi]), total: add([sv.dead, 1], [sv.live, 1], [sv.roof, 1]) };
}

/**
 * The deflection relative to the chord along a span times its flexural stiffness, from the
 * moments `ms` at `xs` (sagging positive), positive downward: ∫ G(x, ξ)·M(ξ) dξ with the simple
 * span's influence function; for a cantilever held at `root`, from the tangent at the root.
 */
export function chordDeflectionEI(xs: readonly number[], ms: readonly number[], L: number, root?: 'start' | 'end'): number[] {
  const n = xs.length;
  if (n < 2 || !(L > 0)) return xs.map(() => 0);
  const trap = (f: (i: number) => number, a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += ((f(i) + f(i + 1)) / 2) * (xs[i + 1]! - xs[i]!);
    return s;
  };
  if (root) {
    return xs.map((x, j) => {
      const [a, b] = root === 'start' ? [0, j] : [j, n - 1];
      return -trap((i) => Math.abs(x - xs[i]!) * ms[i]!, a, b);
    });
  }
  const x0 = xs[0]!;
  return xs.map((x, j) => {
    const u = x - x0;
    const left = trap((i) => (xs[i]! - x0) * ms[i]!, 0, j);
    const right = trap((i) => (L - (xs[i]! - x0)) * ms[i]!, j, n - 1);
    return ((L - u) * left + u * right) / L;
  });
}

const xiOf = (m: LoadMonths) => XI[m] ?? 2;
const cm = (f: Fmt, v: number) => `${f(v * 100, 1)} cm`;
const mm = (f: Fmt, v: number) => `${f(v * 1000, 1)} mm`;
const reading = (s: DeflectionSupport) => (s === 'none' ? 360 : s === 'nonFragile' ? 240 : 480);

/**
 * The FIUBA course's two readings of the immediate deflection (§18.3, §18.4): a camber equal and
 * opposite to the dead load's, and the floor's natural frequency f ≈ 5.6/√δ, δ in cm, to compare
 * with what excites it.
 */
function courseSteps(deadImmediate: number, sustainedImmediate: number, f: Fmt): Step[] {
  const cmS = sustainedImmediate * 100;
  return [
    { label: 'rcSheets.s.defl.camber', formula: 'Δi(D) (FIUBA §18.3)', value: mm(f, deadImmediate) },
    ...(cmS > 1e-6 ? [{ label: 'rcSheets.s.defl.frequency', formula: 'f ≈ 5.6/√δ(D + ψL), δ [cm] (FIUBA §18.4)', value: `${f(5.6 / Math.sqrt(cmS), 1)} Hz` }] : []),
  ];
}

/** Why the deflection is calculated where the depth table would spare it. */
function whyStep(tableOk: boolean, s: ReturnType<typeof resolved>): Step | null {
  if (!tableOk) return { label: 'rcSheets.s.defl.why.short', value: '' };
  if (s.supports === 'fragile') return { label: 'rcSheets.s.defl.why.fragile', value: '' };
  if (s.always) return { label: 'rcSheets.s.defl.why.always', value: '' };
  return null;
}

function loadsStep(x: DeflectionInput, s: ReturnType<typeof resolved>, f: Fmt): Step {
  const n = x.service!.names;
  return {
    label: `rcSheets.s.defl.loads.${s.sustainedFrom}`,
    formula: `D = ${n.dead || '—'}; L = ${n.live || '—'}${n.roof ? `; Lr/S/R = ${n.roof}` : ''}`,
    value: `ψ = ${f(s.sustained, 2)}`,
  };
}

function methodStep(x: DeflectionInput): Step {
  const strip = x.service?.strip;
  if (x.member === 'beam') return { label: x.ends === 'cantilever' ? 'rcSheets.s.defl.method.cantilever' : 'rcSheets.s.defl.method.beam', value: '' };
  return { label: `rcSheets.s.defl.method.slab.${strip?.reference ?? 'corners'}`, formula: strip ? `${strip.face}` : '', value: '' };
}

/** A failing line for a member whose depth does not spare the calculation and whose service response is unknown. */
function noService(label: string, clause: string, steps: Step[]): DeflectionOutcome {
  return { line: check(label, false, { clause }), group: { title: 'rcSheets.g.deflection', steps: [...steps, { label: 'rcSheets.s.defl.noService', value: '', ok: false }] }, ok: false, computed: false };
}

/** The minimum depth tables of ACI 318-19 and CIRSOC 201-2025: Tables 9.3.1.1 (beams), 7.3.1.1 (one-way slabs), 8.3.1.1 and 8.3.1.2 (two-way slabs). */
function aciMinDepth(x: DeflectionInput, cirsoc: boolean, f: Fmt): { h: number; formula: string; clause: string } {
  const fyF = 0.4 + x.fy / 700;
  const t = (en: string, es: string) => (cirsoc ? es : en);
  if (x.member === 'beam' || !x.twoWay) {
    const beam = x.member === 'beam';
    const den = beam ? { simple: 16, oneEnd: 18.5, both: 21, cantilever: 8 }[x.ends] : { simple: 20, oneEnd: 24, both: 28, cantilever: 10 }[x.ends];
    return { h: (x.L / den) * fyF, formula: `ℓ/${f(den, den % 1 ? 1 : 0)}·(0.4 + fy/700) = ${f(x.L, 2)}/${f(den, den % 1 ? 1 : 0)}·${f(fyF, 2)}`, clause: beam ? t('Table 9.3.1.1', 'Tabla 9.3.1.1') : t('Table 7.3.1.1', 'Tabla 7.3.1.1') };
  }
  const w = x.twoWay;
  const floorB = cirsoc ? 0.12 : 0.125;
  if (w.alphaFm !== null && w.alphaFm > 0.2) {
    const beta = w.lnLong / Math.max(w.lnShort, 1e-6);
    const top = w.lnLong * (0.8 + x.fy / 1400);
    const raw = w.alphaFm <= 2 ? top / (36 + 5 * beta * (w.alphaFm - 0.2)) : top / (36 + 9 * beta);
    const floor = w.alphaFm <= 2 ? floorB : 0.09;
    const bump = w.bareEdges > 0 ? 1.1 : 1;
    const h = Math.max(raw * bump, floor);
    const shape = w.alphaFm <= 2 ? `ℓn·(0.8 + fy/1400)/(36 + 5β(αfm − 0.2))` : `ℓn·(0.8 + fy/1400)/(36 + 9β)`;
    return { h, formula: `${shape}${bump > 1 ? '·1.1' : ''} ≥ ${f(floor * 1000, 0)} mm; αfm = ${f(w.alphaFm, 2)}, β = ${f(beta, 2)}, ℓn = ${f(w.lnLong, 2)} m`, clause: t('Table 8.3.1.2, §8.3.1.2.1', 'Tabla 8.3.1.2, §8.3.1.2.1') };
  }
  const rows: Array<[number, [number, number, number]]> = [[280, [33, 36, 36]], [420, [30, 33, 33]], [550, [27, 30, 30]]];
  const col = !w.exterior ? 2 : w.edgeBeams ? 1 : 0;
  const at = (fy: number) => {
    const [a, b] = fy <= 420 ? [rows[0]!, rows[1]!] : [rows[1]!, rows[2]!];
    return a[1][col]! + ((b[1][col]! - a[1][col]!) * (fy - a[0])) / (b[0] - a[0]);
  };
  const den = at(x.fy);
  const h = Math.max(w.lnLong / den, floorB);
  return { h, formula: `ℓn/${f(den, 1)} ≥ ${f(floorB * 1000, 0)} mm; ℓn = ${f(w.lnLong, 2)} m`, clause: t('Table 8.3.1.1', 'Tabla 8.3.1.1') };
}

/** ACI 318-19 and CIRSOC 201-2025 §24.2: Ie of Table 24.2.3.5 at midspan (§24.2.3.7), λΔ = ξ/(1 + 50ρ′) (§24.2.4.1), the limits of Table 24.2.2. */
export function aciDeflection(mech: DeflectionMechanics, edition: 'aci' | 'cirsoc'): DeflectionCode {
  const cirsoc = edition === 'cirsoc';
  const T = (en: string, es: string) => (cirsoc ? es : en);
  return {
    check(x, f) {
      const s = resolved(x.settings, x.service);
      const min = aciMinDepth(x, cirsoc, f);
      const sec = x.section;
      const tableOk = sec.h >= min.h - 1e-6;
      const depthStep: Step = { label: 'rcSheets.s.defl.minDepth', formula: `h ≥ ${min.formula} (${min.clause})`, value: `${cm(f, sec.h)} ≥ ${cm(f, min.h)}`, ok: tableOk };
      const why = whyStep(tableOk, s);
      if (!why) {
        return {
          line: check('rcSheets.v.deflectionDepth', true, { clause: `${min.clause}, §24.2.1`, demand: `${cm(f, min.h)}`, capacity: `h = ${cm(f, sec.h)}`, ratio: min.h / sec.h }),
          group: { title: 'rcSheets.g.deflection', steps: [depthStep, { label: 'rcSheets.s.defl.spared', value: '' }] }, ok: true, computed: false,
        };
      }
      const clause = T('§24.2, Table 24.2.2', '§24.2, Tabla 24.2.2');
      if (!x.service) return noService('rcSheets.v.deflectionNoService', clause, [depthStep, why]);
      const st = combinedStates(x.service, s.sustained);
      const Ec = 4700 * Math.sqrt(x.fc) * 1000;
      const n = ES / (Ec / 1000);
      const Ig = (sec.b * sec.h ** 3) / 12;
      const fr = 0.62 * Math.sqrt(x.fc) * 1000;
      const Mcr = (fr * Ig) / (sec.h / 2);
      const { Icr } = mech.crackedInertia({ b: sec.b, h: sec.h, d: sec.d, dPrime: sec.dPrime, As: sec.As, AsPrime: sec.AsPrime, n });
      const IeT = mech.effectiveInertia(Ig, Icr, Mcr, Math.abs(st.total.m)), IeD = mech.effectiveInertia(Ig, Icr, Mcr, Math.abs(st.dead.m));
      const dT = Math.max(0, st.total.k / (Ec * IeT)), dD = Math.max(0, st.dead.k / (Ec * IeD)), dS = Math.max(0, st.sustained.k / (Ec * IeT));
      const rhoP = sec.AsPrime / (sec.b * sec.d);
      const xi = xiOf(s.months), lambda = xi / (1 + 50 * rhoP);
      const dL = Math.max(0, dT - dD);
      const after = lambda * dS + Math.max(0, dT - dS);
      const nLim = reading(s.supports);
      const delta = s.supports === 'none' ? dL : after;
      const limit = x.L / nLim;
      const ok = delta <= limit + 1e-9;
      const steps: Step[] = [
        depthStep, why, methodStep(x), loadsStep(x, s, f),
        { label: 'rcSheets.s.defl.ec', formula: `Ec = 4700·√f'c (§19.2.2.1); n = Es/Ec`, value: `${f(Ec / 1000, 0)} MPa; n = ${f(n, 2)}` },
        { label: 'rcSheets.s.defl.mcr', formula: `Mcr = fr·Ig/yt; fr = 0.62·√f'c (§19.2.3.1); Ig = b·h³/12`, value: `${f(Mcr, 1)} kN·m${x.member === 'slab' ? '/m' : ''}; Ig = ${f(Ig * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.icr', formula: `As = ${f(sec.As * 1e4, 2)} cm², A's = ${f(sec.AsPrime * 1e4, 2)} cm², d = ${cm(f, sec.d)}`, value: `Icr = ${f(Icr * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.ie', formula: `Ie = Icr/(1 − (⅔·Mcr/Ma)²·(1 − Icr/Ig)) ≤ Ig (${T('Table 24.2.3.5', 'Tabla 24.2.3.5')})`, value: `Ma(D + L) = ${f(Math.abs(st.total.m), 1)} → Ie = ${f(IeT * 1e8, 0)} cm⁴; Ma(D) = ${f(Math.abs(st.dead.m), 1)} → ${f(IeD * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.immediate', formula: 'Δi = K/(Ec·Ie)', value: `Δ(D + L) = ${mm(f, dT)}; Δ(D) = ${mm(f, dD)}; Δ(D + ψL) = ${mm(f, dS)}; Δ(L) = ${mm(f, dL)}` },
        { label: 'rcSheets.s.defl.longTerm', formula: `λΔ = ξ/(1 + 50ρ'); ξ = ${f(xi, 1)} (${s.months} ${T('months', 'meses')}, ${T('Table 24.2.4.1.3', 'Tabla 24.2.4.1.3')}); ρ' = ${f(rhoP * 100, 2)} %`, value: `λΔ = ${f(lambda, 2)}` },
        {
          label: `rcSheets.s.defl.reading.${s.supports}`,
          formula: s.supports === 'none' ? 'Δ(L) ≤ ℓ/360' : `λΔ·Δ(D + ψL) + [Δ(D + L) − Δ(D + ψL)] ≤ ℓ/${nLim}`,
          value: `${mm(f, delta)} ≤ ${mm(f, limit)}`, ok,
        },
        ...courseSteps(dD, dS, f),
      ].filter((v): v is Step => !!v);
      return {
        line: check('rcSheets.v.deflection', ok, { clause, demand: `Δ = ${mm(f, delta)}`, capacity: `≤ ℓ/${nLim} = ${mm(f, limit)}`, ratio: delta / limit }),
        group: { title: 'rcSheets.g.deflection', steps }, ok, computed: true,
      };
    },
  };
}

/** EN 1992-1-1 §7.4: the span-to-depth ratio of §7.4.2 (Table 7.4N), else the interpolation of §7.4.3 (7.18) with the effective modulus for creep, against span/250 (§7.4.1(4)) and, under brittle partitions, span/500 after construction (§7.4.1(5)). */
export function ec2Deflection(mech: DeflectionMechanics): DeflectionCode {
  return {
    check(x, f) {
      const s = resolved(x.settings, x.service);
      const sec = x.section;
      const fck = x.fc, fyk = x.fy;
      const flat = !!x.twoWay?.flat;
      const K = x.ends === 'cantilever' ? 0.4 : flat ? 1.2 : { simple: 1.0, oneEnd: 1.3, both: 1.5 }[x.ends];
      const rho0 = 1e-3 * Math.sqrt(fck);
      const rho = Math.max(sec.AsReq, 1e-9) / (sec.b * sec.d);
      const base = rho <= rho0
        ? K * (11 + (1.5 * Math.sqrt(fck) * rho0) / rho + 3.2 * Math.sqrt(fck) * Math.max(0, rho0 / rho - 1) ** 1.5)
        : K * (11 + (1.5 * Math.sqrt(fck) * rho0) / rho);
      const steel = Math.min(1.5, (500 / fyk) * (sec.As / Math.max(sec.AsReq, 1e-12)));
      const flange = (x.flangeRatio ?? 1) > 3 ? 0.8 : 1;
      const longSpan = s.supports === 'fragile' ? (flat ? (x.L > 8.5 ? 8.5 / x.L : 1) : x.L > 7 ? 7 / x.L : 1) : 1;
      const limitLd = base * steel * flange * longSpan;
      const ld = x.L / sec.d;
      const tableOk = ld <= limitLd + 1e-9;
      const depthStep: Step = {
        label: 'rcSheets.s.defl.ld',
        formula: `l/d ≤ K·[11 + 1.5√fck·ρ0/ρ + 3.2√fck·(ρ0/ρ − 1)^1.5]·(310/σs)${flange < 1 ? '·0.8' : ''}${longSpan < 1 ? `·${flat ? '8.5' : '7'}/l` : ''} (7.16a, 7.17); K = ${f(K, 1)}, ρ0 = ${f(rho0 * 100, 2)} %, ρ = ${f(rho * 100, 2)} %, 310/σs = ${f(steel, 2)}`,
        value: `${f(ld, 1)} ≤ ${f(limitLd, 1)}`, ok: tableOk,
      };
      const spare = tableOk && !s.always;
      if (spare) {
        return {
          line: check('rcSheets.v.deflectionDepth', true, { clause: '7.4.2', demand: `l/d = ${f(ld, 1)}`, capacity: `≤ ${f(limitLd, 1)}`, ratio: ld / limitLd }),
          group: { title: 'rcSheets.g.deflection', steps: [depthStep, { label: 'rcSheets.s.defl.spared', value: '' }] }, ok: true, computed: false,
        };
      }
      const why: Step = tableOk ? { label: 'rcSheets.s.defl.why.always', value: '' } : { label: 'rcSheets.s.defl.why.short', value: '' };
      const clause = '7.4.1, 7.4.3';
      if (!x.service) return noService('rcSheets.v.deflectionNoService', clause, [depthStep, why]);
      const st = combinedStates(x.service, s.sustained);
      const fcm = fck + 8;
      const Ecm = 22000 * (fcm / 10) ** 0.3 * 1000;
      const fctm = (fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + fcm / 10)) * 1000;
      const Eeff = Ecm / (1 + s.creep);
      const Ig = (sec.b * sec.h ** 3) / 12;
      const Mcr = (fctm * Ig) / (sec.h / 2);
      const cracked = (E: number) => mech.crackedInertia({ b: sec.b, h: sec.h, d: sec.d, dPrime: sec.dPrime, As: sec.As, AsPrime: sec.AsPrime, n: ES / (E / 1000) }).Icr;
      const IIeff = cracked(Eeff), II0 = cracked(Ecm);
      const zeta = (m: number, beta: number) => (Math.abs(m) > Mcr ? 1 - beta * (Mcr / Math.abs(m)) ** 2 : 0);
      const defl = (k: number, E: number, III: number, z: number) => Math.max(0, (k / E) * (z / III + (1 - z) / Ig));
      const zQ = zeta(st.sustained.m, 0.5), zD = zeta(st.dead.m, 1);
      const dQ = defl(st.sustained.k, Eeff, IIeff, zQ);
      const dD = defl(st.dead.k, Ecm, II0, zD);
      const after = Math.max(0, dQ - dD);
      const limQ = x.L / 250, limA = x.L / 500;
      const okQ = dQ <= limQ + 1e-9, okA = s.supports !== 'fragile' || after <= limA + 1e-9;
      const ok = okQ && okA;
      const ratio = Math.max(dQ / limQ, s.supports === 'fragile' ? after / limA : 0);
      const steps: Step[] = [
        depthStep, why, methodStep(x), loadsStep(x, s, f),
        { label: 'rcSheets.s.defl.ecm', formula: `Ecm = 22·(fcm/10)^0.3; fctm (Table 3.1); Ec,eff = Ecm/(1 + φ) (7.20); φ = ${f(s.creep, 2)}`, value: `${f(Ecm / 1000, 0)} · ${f(fctm / 1000, 2)} · ${f(Eeff / 1000, 0)} MPa` },
        { label: 'rcSheets.s.defl.mcr', formula: 'Mcr = fctm·Ig/yt', value: `${f(Mcr, 1)} kN·m${x.member === 'slab' ? '/m' : ''}` },
        { label: 'rcSheets.s.defl.icr', formula: `As = ${f(sec.As * 1e4, 2)} cm², A's = ${f(sec.AsPrime * 1e4, 2)} cm², d = ${cm(f, sec.d)}`, value: `III(Ec,eff) = ${f(IIeff * 1e8, 0)}; III(Ecm) = ${f(II0 * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.zeta', formula: 'δ = ζ·δII + (1 − ζ)·δI; ζ = 1 − β·(Mcr/M)² (7.18, 7.19)', value: `ζ(qp, β = 0.5) = ${f(zQ, 2)}; ζ(G, β = 1) = ${f(zD, 2)}` },
        { label: 'rcSheets.s.defl.shrinkage', value: '' },
        { label: 'rcSheets.s.defl.reading.ec2Total', formula: 'δ(G + ψ2·Q, ∞) ≤ l/250 (7.4.1(4))', value: `${mm(f, dQ)} ≤ ${mm(f, limQ)}`, ok: okQ },
        ...(s.supports === 'fragile' ? [{ label: 'rcSheets.s.defl.reading.ec2After', formula: 'δ(∞) − δ(G, t0) ≤ l/500 (7.4.1(5))', value: `${mm(f, after)} ≤ ${mm(f, limA)}`, ok: okA }] : []),
      ];
      return {
        line: check('rcSheets.v.deflection', ok, { clause, demand: `δ = ${mm(f, s.supports === 'fragile' && after / limA > dQ / limQ ? after : dQ)}`, capacity: s.supports === 'fragile' && after / limA > dQ / limQ ? `≤ l/500 = ${mm(f, limA)}` : `≤ l/250 = ${mm(f, limQ)}`, ratio }),
        group: { title: 'rcSheets.g.deflection', steps }, ok, computed: true,
      };
    },
  };
}

/**
 * TS 500 §13.2, as far as read: Branson's effective inertia with Mcr from fctk, the long-term
 * factor 2 − 1.2·A′s/As ≥ 0.6, the limits of ACI 318's table; the slabs' thickness that needs no
 * calculation of §11.2 (one-way) and §11.4 (two-way, (11.1)). Beams have no such table here: their
 * deflection is always calculated. Each line says it is to be confirmed with the text.
 */
export function ts500Deflection(mech: Pick<DeflectionMechanics, 'crackedInertia'>): DeflectionCode {
  return {
    check(x, f) {
      const s = resolved(x.settings, x.service);
      const sec = x.section;
      let min: { h: number; formula: string } | null = null;
      if (x.member === 'slab' && x.twoWay) {
        const m = x.twoWay.lnLong / Math.max(x.twoWay.lnShort, 1e-6);
        min = { h: Math.max(0.08, (x.twoWay.lnShort / (15 + 20 / m)) * (1 - x.twoWay.continuousShare / 4)), formula: `ℓsn/(15 + 20/m)·(1 − αs/4) ≥ 80 mm; m = ${f(m, 2)}, αs = ${f(x.twoWay.continuousShare, 2)}` };
      } else if (x.member === 'slab') {
        const den = { simple: 25, oneEnd: 30, both: 35, cantilever: 12 }[x.ends];
        min = { h: Math.max(0.08, x.L / den), formula: `ℓn/${den} ≥ 80 mm` };
      }
      const tableOk = !!min && sec.h >= min.h - 1e-6;
      const depthStep: Step = min ? { label: 'rcSheets.s.defl.minDepth', formula: `h ≥ ${min.formula}`, value: `${cm(f, sec.h)} ≥ ${cm(f, min.h)}`, ok: tableOk } : { label: 'rcSheets.s.defl.noTable', value: '' };
      const why = min ? whyStep(tableOk, s) : { label: 'rcSheets.s.defl.why.noTable', value: '' };
      if (!why) {
        return {
          line: check('rcSheets.ts500.u.deflectionDepth', true, { clause: x.twoWay ? '11.4' : '11.2', demand: cm(f, min!.h), capacity: `h = ${cm(f, sec.h)}`, ratio: min!.h / sec.h }),
          group: { title: 'rcSheets.g.deflection', steps: [depthStep, { label: 'rcSheets.s.defl.spared', value: '' }] }, ok: true, computed: false,
        };
      }
      if (!x.service) return noService('rcSheets.ts500.u.deflectionNoService', '13.2', [depthStep, why]);
      const st = combinedStates(x.service, s.sustained);
      const Ec = (3250 * Math.sqrt(x.fc) + 14000) * 1000;
      const n = ES / (Ec / 1000);
      const Ig = (sec.b * sec.h ** 3) / 12;
      const fctk = 0.35 * Math.sqrt(x.fc) * 1000;
      const Mcr = (fctk * Ig) / (sec.h / 2);
      const { Icr } = mech.crackedInertia({ b: sec.b, h: sec.h, d: sec.d, dPrime: sec.dPrime, As: sec.As, AsPrime: sec.AsPrime, n });
      const branson = (M: number) => { const r = Math.abs(M) > Mcr ? (Mcr / Math.abs(M)) ** 3 : 1; return Math.min(Ig, r * Ig + (1 - r) * Icr); };
      const IeT = branson(st.total.m), IeD = branson(st.dead.m);
      const dT = Math.max(0, st.total.k / (Ec * IeT)), dD = Math.max(0, st.dead.k / (Ec * IeD)), dS = Math.max(0, st.sustained.k / (Ec * IeT));
      const lambda = Math.max(0.6, 2 - (1.2 * sec.AsPrime) / Math.max(sec.As, 1e-12));
      const dL = Math.max(0, dT - dD);
      const after = lambda * dS + Math.max(0, dT - dS);
      const nLim = reading(s.supports);
      const delta = s.supports === 'none' ? dL : after;
      const limit = x.L / nLim;
      const ok = delta <= limit + 1e-9;
      const steps: Step[] = [
        depthStep, why, methodStep(x), loadsStep(x, s, f),
        { label: 'rcSheets.s.defl.ec', formula: 'Ec = 3250·√fck + 14000; n = Es/Ec', value: `${f(Ec / 1000, 0)} MPa; n = ${f(n, 2)}` },
        { label: 'rcSheets.s.defl.mcr', formula: 'Mcr = fctk·Ig/yt; fctk = 0.35·√fck', value: `${f(Mcr, 1)} kN·m${x.member === 'slab' ? '/m' : ''}` },
        { label: 'rcSheets.s.defl.icr', formula: `As = ${f(sec.As * 1e4, 2)} cm², A's = ${f(sec.AsPrime * 1e4, 2)} cm², d = ${cm(f, sec.d)}`, value: `Icr = ${f(Icr * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.ieBranson', formula: 'Ie = (Mcr/Ma)³·Ig + [1 − (Mcr/Ma)³]·Icr ≤ Ig', value: `${f(IeT * 1e8, 0)} · ${f(IeD * 1e8, 0)} cm⁴` },
        { label: 'rcSheets.s.defl.immediate', formula: 'Δi = K/(Ec·Ie)', value: `Δ(D + L) = ${mm(f, dT)}; Δ(D) = ${mm(f, dD)}; Δ(D + ψL) = ${mm(f, dS)}; Δ(L) = ${mm(f, dL)}` },
        { label: 'rcSheets.s.defl.longTerm', formula: "λ = 2 − 1.2·A's/As ≥ 0.6", value: `λ = ${f(lambda, 2)}` },
        { label: `rcSheets.s.defl.reading.${s.supports}`, formula: s.supports === 'none' ? 'Δ(L) ≤ ℓ/360' : `λ·Δ(D + ψL) + [Δ(D + L) − Δ(D + ψL)] ≤ ℓ/${nLim}`, value: `${mm(f, delta)} ≤ ${mm(f, limit)}`, ok },
        ...courseSteps(dD, dS, f),
      ].filter((v): v is Step => !!v);
      return {
        line: check('rcSheets.ts500.u.deflection', ok, { clause: '13.2', demand: `Δ = ${mm(f, delta)}`, capacity: `≤ ℓ/${nLim} = ${mm(f, limit)}`, ratio: delta / limit }),
        group: { title: 'rcSheets.g.deflection', steps }, ok, computed: true,
      };
    },
  };
}

type Ctx = { deflection?: DeflectionSettings; mat: { fc: number; fy: number }; cover: number; diameters: readonly number[] };
type BeamCtx = Ctx & { stirrupDia: number };
type BeamFn = (d: BeamDemand, c: never, adopted: BeamAdopted | undefined, fmt: Fmt) => BeamRow;
type SlabFn = (d: SlabDemand, c: never, adopted: SlabAdopted | undefined, fmt: Fmt) => SlabRow;

/** A beam span's ends as the depth tables read them: continuous where the line goes on past it, free at a cantilever's tip. */
export function beamEnds(d: Pick<BeamDemand, 'ends' | 'line'>): SpanEnds {
  if (d.ends?.start.kind === 'free' || d.ends?.end.kind === 'free') return 'cantilever';
  const l = d.line;
  const n = (l && l.index > 0 ? 1 : 0) + (l && l.index < l.spans - 1 ? 1 : 0);
  return n === 2 ? 'both' : n === 1 ? 'oneEnd' : 'simple';
}

/** The bisection finds the least steel at the depth of the bars proposed; the bars that carry it may sit a little higher. */
const MARGINS = [1, 1.1, 1.25];

const atSpan = (a: BeamAdopted, s: 'start' | 'span' | 'end') => a.at?.[s] ?? { top: a.top, bottom: a.bottom };

/** The section a beam's Ie is read at with bars `a`: midspan, or the root of a cantilever where its top bars are in tension. */
export function beamSection(d: BeamDemand, c: BeamCtx, a: BeamAdopted, reqBottom: number, reqTop: number): DeflectionSection {
  const ends = beamEnds(d);
  const sd = a.stirrups.dia;
  if (ends === 'cantilever') {
    const root = d.ends?.start.kind === 'free' ? 'end' : 'start';
    const g = atSpan(a, root);
    return { b: d.b, h: d.h, d: d.h - faceLayout(g.top, d.b, c.cover, sd).centroidFromFace, dPrime: faceLayout(g.bottom, d.b, c.cover, sd).centroidFromFace, As: groupsArea(g.top) * 1e-4, AsPrime: groupsArea(g.bottom) * 1e-4, AsReq: reqTop * 1e-4 };
  }
  const g = atSpan(a, 'span');
  return { b: d.b, h: d.h, d: d.h - faceLayout(g.bottom, d.b, c.cover, sd).centroidFromFace, dPrime: faceLayout(g.top, d.b, c.cover, sd).centroidFromFace, As: groupsArea(g.bottom) * 1e-4, AsPrime: groupsArea(g.top) * 1e-4, AsReq: reqBottom * 1e-4 };
}

/** The row with its deflection: one more verification, its steps, and the status it then has. */
export function withOutcome<R extends { verifications: CheckLine[]; steps: StepGroup[]; status: string; generous: boolean }>(row: R, o: DeflectionOutcome): R {
  const verifications = [...row.verifications, o.line];
  const generous = isGenerous(verifications);
  const failed = row.status === 'fail' || !o.ok;
  const proposal = row.steps.findIndex((g) => g.title === 'rcSheets.g.proposal');
  const steps = proposal >= 0 ? [...row.steps.slice(0, proposal), o.group, ...row.steps.slice(proposal)] : [...row.steps, o.group];
  return { ...row, verifications, steps, generous, status: failed ? 'fail' : generous ? 'warn' : 'ok' };
}

const proposalNote = (row: { steps: StepGroup[] }, note: Step): StepGroup[] =>
  row.steps.map((g) => (g.title === 'rcSheets.g.proposal' ? { ...g, steps: [...g.steps.filter((s) => s.label !== 'rcSheets.s.adoptedByUser'), note] } : g));

/**
 * A code's beam rows with their deflection checked. A proposal that does not meet the deflection
 * takes more tension steel, and compression steel for the long term, the least of them that meets
 * it and keeps every other verification; where none does it fails, and resizing offers a deeper
 * section. The steel the deflection asks for is the span's requirement too, which a continuous
 * beam's run reads.
 */
export function withBeamDeflection(base: BeamFn, code: DeflectionCode): BeamFn {
  return (d, ctx, adopted, fmt) => {
    const row = base(d, ctx, adopted, fmt);
    const sv = d as BeamDemand & Serviceable;
    if (sv.serviceOff) return row;
    const c = ctx as unknown as BeamCtx;
    const ends = beamEnds(d);
    const input = (sec: DeflectionSection): DeflectionInput => ({
      member: 'beam', section: sec, L: d.length, ends, fc: c.mat.fc, fy: c.mat.fy, service: sv.service, settings: c.deflection ?? {},
      ...(d.flange ? { flangeRatio: d.flange.bf / d.b } : {}),
    });
    const sectionOf = (a: BeamAdopted) => beamSection(d, c, a, row.req.bottom, row.req.top);
    let out = code.check(input(sectionOf(row.adopted)), fmt);
    let chosen = row;
    let need: { tension: number; compression: number } | null = null;
    if (!adopted && !out.ok && out.computed) {
      const sec0 = sectionOf(row.proposed);
      const passes = (As: number, AsPrime: number) => code.check(input({ ...sec0, As, AsPrime }), fmt).ok;
      const cap = 0.04 * d.b * sec0.d;
      const tries: Array<{ tension: number; compression: number }> = [];
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        let lo = sec0.As, hi = cap;
        const AsP = (x: number) => Math.max(sec0.AsPrime, share * x);
        if (!passes(hi, AsP(hi))) continue;
        for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (passes(mid, AsP(mid))) hi = mid; else lo = mid; }
        tries.push({ tension: hi, compression: AsP(hi) });
      }
      tries.sort((p, q) => p.tension + p.compression - (q.tension + q.compression));
      const tensionFace = ends === 'cantilever' ? 'top' : 'bottom';
      for (const t of tries.slice(0, 3).flatMap((x) => MARGINS.map((k) => ({ tension: x.tension * k, compression: x.compression * k })))) {
        const face = (area: number) => proposeBeamFace(area * 1e4, d.b, d.h, c.cover, row.proposed.stirrups.dia, c.diameters);
        const p0 = row.proposed;
        const comp = tensionFace === 'bottom' ? p0.top : p0.bottom;
        const cand: BeamAdopted = {
          ...p0,
          [tensionFace]: face(t.tension),
          [tensionFace === 'bottom' ? 'top' : 'bottom']: groupsArea(comp) * 1e-4 >= t.compression - 1e-9 ? comp : face(t.compression),
        };
        delete cand.at;
        const r2 = base(d, ctx, cand, fmt);
        if (r2.status === 'fail') continue;
        const o2 = code.check(input(sectionOf(cand)), fmt);
        if (!o2.ok) continue;
        need = t;
        out = o2;
        chosen = { ...r2, isAdopted: false, proposed: cand, iterations: row.iterations + 1, steps: proposalNote(r2, { label: 'rcSheets.s.defl.proposal', formula: `As = ${fmt(t.tension * 1e4)} cm²; A's = ${fmt(t.compression * 1e4)} cm²`, value: '', ok: true }) };
        break;
      }
    }
    const result = withOutcome(chosen, out);
    if (!need) return result;
    const tCm = need.tension * 1e4, cCm = need.compression * 1e4;
    const req = { ...result.req, bySection: [...result.req.bySection] };
    if (ends === 'cantilever') {
      req.top = Math.max(req.top, tCm);
    } else {
      req.bottom = Math.max(req.bottom, tCm);
      req.bySection = req.bySection.map((s) => (s.section === 'span' && s.sign === 'pos' ? { ...s, req: Math.max(s.req, tCm) } : s));
      if (cCm > 1e-9) {
        const at = req.bySection.findIndex((s) => s.section === 'span' && s.sign === 'neg');
        if (at >= 0) req.bySection[at] = { ...req.bySection[at]!, req: Math.max(req.bySection[at]!.req, cCm) };
        else req.bySection.push({ section: 'span', sign: 'neg', req: cCm });
      }
    }
    return { ...result, req };
  };
}

/** The strip a slab's Ie is read in: the bottom face of the direction with the larger service moment, the top face of a cantilever's direction. */
export function slabStrip(d: SlabDemand & Serviceable, row: SlabRow): SlabFace {
  return d.service?.strip?.face ?? (row.oneWay ? (row.lx <= row.ly ? 'bottomX' : 'bottomY') : d.m.bottomX.value >= d.m.bottomY.value ? 'bottomX' : 'bottomY');
}

const SLAB_FACE_LIST: readonly SlabFace[] = ['bottomX', 'bottomY', 'topX', 'topY'];
const other = (f: SlabFace): SlabFace => (f.startsWith('bottom') ? `top${f.slice(6)}` : `bottom${f.slice(3)}`) as SlabFace;

/** How a slab panel spans for the depth tables, from its edges: the span and ends of a one-way panel, or a two-way panel's clear spans and beams. */
export function slabSpanInput(row: Pick<SlabRow, 'lx' | 'ly' | 'oneWay'>, edges: SlabEdges | undefined, cantilever?: { dir: 'x' | 'y'; length: number }): { L: number; ends: SpanEnds; twoWay?: TwoWay } {
  if (cantilever) return { L: cantilever.length, ends: 'cantilever' };
  const xMain = row.lx <= row.ly;
  const across = (dir: 'x' | 'y') => (edges ? (dir === 'x' ? [edges.x0, edges.x1] : [edges.y0, edges.y1]) : []);
  const endsOf = (dir: 'x' | 'y'): SpanEnds => {
    const n = across(dir).filter((e) => e.continuous).length;
    return n === 2 ? 'both' : n === 1 ? 'oneEnd' : 'simple';
  };
  if (row.oneWay || !edges) return { L: Math.min(row.lx, row.ly), ends: endsOf(xMain ? 'x' : 'y') };
  const all = [edges.x0, edges.x1, edges.y0, edges.y1];
  const clear = (dir: 'x' | 'y') => (dir === 'x' ? row.lx : row.ly) - across(dir).reduce((s, e) => s + e.half, 0);
  const lnX = clear('x'), lnY = clear('y');
  const held = all.every((e) => e.kind === 'beam' || e.kind === 'wall');
  const discontinuous = all.filter((e) => !e.continuous);
  return {
    L: Math.max(row.lx, row.ly), ends: endsOf(xMain ? 'x' : 'y'),
    twoWay: {
      lnLong: Math.max(lnX, lnY), lnShort: Math.min(lnX, lnY),
      alphaFm: held ? all.reduce((s, e) => s + e.alpha, 0) / 4 : null,
      exterior: discontinuous.length > 0, edgeBeams: discontinuous.length > 0 && discontinuous.every((e) => e.alpha >= 0.8),
      bareEdges: discontinuous.filter((e) => e.alpha < 0.8).length,
      flat: all.every((e) => e.kind !== 'beam' && e.kind !== 'wall'),
      continuousShare: (['x0', 'x1', 'y0', 'y1'] as const).reduce((s, k) => s + (edges[k].continuous ? (k.startsWith('x') ? row.ly : row.lx) : 0), 0) / (2 * (row.lx + row.ly)),
    },
  };
}

/** The limit's span of a two-way panel measured from its supporting edges is its shorter one; from its corners (no beams all round), its longer one. */
const slabLimitSpan = (row: Pick<SlabRow, 'lx' | 'ly'>, span: ReturnType<typeof slabSpanInput>, reference: 'edges' | 'corners' | 'root' | undefined) =>
  span.twoWay && reference === 'edges' ? Math.min(row.lx, row.ly) : span.L;

/** A code's slab rows with their deflection checked; a proposal short of it takes more steel in the strip the effective inertia reads. */
export function withSlabDeflection(base: SlabFn, code: DeflectionCode): SlabFn {
  return (d, ctx, adopted, fmt) => {
    const row = base(d, ctx, adopted, fmt);
    const sv = d as SlabDemand & Serviceable;
    if (sv.serviceOff) return row;
    const c = ctx as unknown as Ctx & { span?: { kind: 'cantilever'; dir: 'x' | 'y'; length: number } };
    const cant = c.span?.kind === 'cantilever' ? { dir: c.span.dir, length: c.span.length } : undefined;
    const face: SlabFace = cant ? (`top${cant.dir === 'x' ? 'X' : 'Y'}` as SlabFace) : slabStrip(sv, row);
    const span = slabSpanInput(row, sv.edges, cant);
    const service = !!cant === (sv.service?.strip?.reference === 'root') ? sv.service : undefined;
    const L = slabLimitSpan(row, span, service?.strip?.reference);
    const sectionOf = (r: SlabRow, a: SlabAdopted): DeflectionSection => ({
      b: 1, h: d.h, d: r.faces[face].d, dPrime: d.h - r.faces[other(face)].d, As: meshArea(a[face]) * 1e-4, AsPrime: 0, AsReq: r.faces[face].asReq * 1e-4,
    });
    const input = (sec: DeflectionSection): DeflectionInput => ({ member: 'slab', section: sec, L, ends: span.ends, ...(span.twoWay ? { twoWay: span.twoWay } : {}), fc: c.mat.fc, fy: c.mat.fy, service, settings: c.deflection ?? {} });
    let out = code.check(input(sectionOf(row, row.adopted)), fmt);
    let chosen = row;
    if (!adopted && !out.ok && out.computed) {
      const sec0 = sectionOf(row, row.proposed);
      const passes = (As: number) => code.check(input({ ...sec0, As }), fmt).ok;
      let lo = sec0.As, hi = 0.02 * sec0.d;
      if (passes(hi)) {
        for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (passes(mid)) hi = mid; else lo = mid; }
        for (const margin of MARGINS) {
          let cand: SlabAdopted = { ...row.proposed, [face]: proposeMesh(hi * margin * 1e4, row.faces[face].sMax, c.diameters) };
          let r2 = base(d, ctx, cand, fmt);
          for (let k = 0; k < 2 && r2.status === 'fail'; k++) {
            const short = SLAB_FACE_LIST.filter((g) => g !== face && meshArea(cand[g]) < r2.faces[g].asReq - 1e-6);
            if (!short.length) break;
            cand = { ...cand, ...Object.fromEntries(short.map((g) => [g, proposeMesh(r2.faces[g].asReq * 1.02, r2.faces[g].sMax, c.diameters)])) };
            r2 = base(d, ctx, cand, fmt);
          }
          const o2 = code.check(input(sectionOf(r2, cand)), fmt);
          if (r2.status === 'fail' || !o2.ok) continue;
          out = o2;
          chosen = { ...r2, isAdopted: false, proposed: cand, steps: proposalNote(r2, { label: 'rcSheets.s.defl.proposal', formula: `${face}: As = ${fmt(hi * 1e4)} cm²/m`, value: '', ok: true }) };
          break;
        }
      }
    }
    return withOutcome(chosen, out);
  };
}

/** A T beam's inertia about its centroid, m⁴: web `bw` by `hb` overall, flanges `p` wide each side on `sides` sides, `hf` thick at the top. */
function tInertia(bw: number, hb: number, hf: number, p: number, sides: number): number {
  const parts = [{ b: bw, h: hb, y: hb / 2 }, ...(sides > 0 && p > 0 ? [{ b: sides * p, h: hf, y: hb - hf / 2 }] : [])];
  const A = parts.reduce((s, q) => s + q.b * q.h, 0);
  const yc = parts.reduce((s, q) => s + q.b * q.h * q.y, 0) / A;
  return parts.reduce((s, q) => s + (q.b * q.h ** 3) / 12 + q.b * q.h * (q.y - yc) ** 2, 0);
}

/** αf of a wall edge: far stiffer than any slab, so it counts above every threshold of Table 8.3.1.2. */
const WALL_ALPHA = 10;

/**
 * A slab panel's four edges in plan: shared with a panel of its level over half its length or
 * more, and what holds it there (a beam or wall over half its length, columns on it, or nothing),
 * with the beam's αf = Ecb·Ib/(Ecs·Is) of §8.10.2.7: the beam with the slab beside it up to
 * min(hb − hf, 4hf) a side, against the slab half-way to the next panel's centre line.
 */
export function slabEdges(
  rect: { x0: number; x1: number; y0: number; y1: number }, h: number,
  others: ReadonlyArray<{ x0: number; x1: number; y0: number; y1: number }>,
  geom: { beams: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number; b: number; h?: number; kind: 'beam' | 'wall' }>; columns: ReadonlyArray<{ x: number; y: number; b: number; h: number }> },
): SlabEdges {
  const TOL = 0.05;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  /** Whether a beam or wall holds the panel's edge across `dir` at its `end`: a column there is that edge's support, not this one's. */
  const heldAcross = (dir: 'x' | 'y', end: 'lo' | 'hi') => {
    const [d2, at2, b0, b1] = dir === 'x' ? ['y' as const, end === 'lo' ? rect.y0 : rect.y1, rect.x0, rect.x1] : ['x' as const, end === 'lo' ? rect.x0 : rect.x1, rect.y0, rect.y1];
    return beamOn(d2, at2, b0, b1).covered >= 0.5 * (b1 - b0) - 1e-9;
  };
  const beamOn = (dir: 'x' | 'y', at: number, a0: number, a1: number) => {
    let covered = 0, best: (typeof geom.beams)[number] | null = null;
    for (const b of geom.beams) {
      const [p, q, s0, s1] = dir === 'x' ? [b.x1, b.x2, b.y1, b.y2] : [b.y1, b.y2, b.x1, b.x2];
      if (Math.abs(p - q) > TOL || Math.abs((p + q) / 2 - at) > Math.max(TOL, b.b / 2)) continue;
      const cov = overlap(Math.min(s0, s1), Math.max(s0, s1), a0, a1);
      if (cov <= 0) continue;
      covered += cov;
      if (!best || (b.kind === 'wall' && best.kind !== 'wall') || b.b > best.b) best = b;
    }
    return { covered, best };
  };
  const edge = (dir: 'x' | 'y', at: number, a0: number, a1: number, side: 'lo' | 'hi'): SlabEdge => {
    const len = a1 - a0;
    const perp = dir === 'x' ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
    const shared = others.reduce((s, q) => {
      const [qlo, qhi, q0, q1] = dir === 'x' ? [q.x0, q.x1, q.y0, q.y1] : [q.y0, q.y1, q.x0, q.x1];
      const touches = side === 'lo' ? Math.abs(qhi - at) <= TOL : Math.abs(qlo - at) <= TOL;
      return touches ? s + overlap(a0, a1, q0, q1) : s;
    }, 0);
    const continuous = shared >= 0.5 * len - 1e-9;
    const { covered, best } = beamOn(dir, at, a0, a1);
    if (best && covered >= 0.5 * len - 1e-9) {
      if (best.kind === 'wall') return { continuous, kind: 'wall', alpha: WALL_ALPHA, half: best.b / 2 };
      const hb = Math.max(best.h ?? h, h);
      const sides = continuous ? 2 : 1;
      const Ib = tInertia(best.b, hb, h, Math.min(hb - h, 4 * h), sides);
      const Is = ((continuous ? perp : perp / 2) * h ** 3) / 12;
      return { continuous, kind: 'beam', alpha: Is > 0 ? Ib / Is : 0, half: best.b / 2 };
    }
    const cols = geom.columns.filter((k) => {
      const [p, s, ext] = dir === 'x' ? [k.x, k.y, k.b] : [k.y, k.x, k.h];
      if (Math.abs(p - at) > Math.max(TOL, ext / 2) || s < a0 - TOL || s > a1 + TOL) return false;
      const end = Math.abs(s - a0) <= Math.max(TOL, ext / 2) ? 'lo' : Math.abs(s - a1) <= Math.max(TOL, ext / 2) ? 'hi' : null;
      return !end || !heldAcross(dir, end);
    });
    if (cols.length) return { continuous, kind: 'columns', alpha: 0, half: Math.max(...cols.map((k) => (dir === 'x' ? k.b : k.h))) / 2 };
    return { continuous, kind: 'free', alpha: 0, half: 0 };
  };
  return {
    x0: edge('x', rect.x0, rect.y0, rect.y1, 'lo'), x1: edge('x', rect.x1, rect.y0, rect.y1, 'hi'),
    y0: edge('y', rect.y0, rect.x0, rect.x1, 'lo'), y1: edge('y', rect.y1, rect.x0, rect.x1, 'hi'),
  };
}

/** A panel held along one edge, free at the opposite one and with nothing but neighbouring panels on the other two: a cantilever off that edge, as the level plan reads it. */
export function cantileverRoot(e: SlabEdges): keyof SlabEdges | null {
  const OPP = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' } as const;
  const SIDES = { x0: ['y0', 'y1'], x1: ['y0', 'y1'], y0: ['x0', 'x1'], y1: ['x0', 'x1'] } as const;
  const held = (k: keyof SlabEdges) => e[k].continuous || e[k].kind !== 'free';
  const roots = (Object.keys(OPP) as Array<keyof SlabEdges>).filter((k) =>
    held(k) && !held(OPP[k]) && SIDES[k].every((s) => e[s].kind === 'free'));
  return roots.length === 1 ? roots[0]! : null;
}
