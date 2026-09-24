/**
 * The rows the calculator prints, sheet by sheet, and the sheet's own section
 * numbers — pure functions of the result, so the panel only lays them out.
 *
 * ── Why it is written sheet by sheet ───────────────────────────
 *
 * The panel exists so a reader can check it against CIRSOC FLEX, and that
 * only works if the two print the same rows under the same names. They did
 * not: A′s was dropped whenever it came out zero — which is every singly
 * reinforced beam, so the row a reader went looking for was missing exactly
 * when its answer was "none" — Ast was in the headline but never in the
 * table, the circular sheet's Asi was nowhere, and the biaxial sheet's bar
 * table and Pu(max) did not exist.
 *
 * What the sheets do NOT print is not printed in these tables either. The bar
 * count and diameter proposal is gone: the workbook sizes an AREA and stops,
 * and a suggestion of "6 Ø16" beside it invited a comparison that has no other
 * side. Anything this tool computes beyond the sheet goes to `extra`, under
 * its own heading, so it can never be mistaken for the sheet's answer.
 */
import { t } from '../../lib/i18n';
import type { FlexCase, FlexMode, FlexOutput } from '../../lib/engine/codes/argentina/cirsoc-flex';
import {
  beta1, yieldStrain, ES_MPA, COLUMN_STEEL_RATIO,
  PHI_TENSION, PHI_COMPRESSION_TIED, PHI_COMPRESSION_SPIRAL,
} from '../../lib/engine/codes/argentina/cirsoc201-basis';

export type Row = [string, string];

export const fmt = (v: number | undefined, digits = 2, unit = '') =>
  v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit ? ' ' + unit : ''}`;
export const cmOf = (m: number | undefined) => (m === undefined ? '—' : `${(m * 100).toFixed(2)} cm`);
const cmOfRow = (label: string, v: number | undefined): Row => [label, cmOf(v)];
const cm2 = (v: number | undefined) => fmt(v, 3, 'cm²');
const permil = (e: number) => `${(e * 1000).toFixed(2)} ‰`;

/*
 * ── The sheet's own section numbers, sheet by sheet ─────────────
 *
 * The workbook does not number its sheets alike. FCR-VERIF puts the safety
 * condition at 5 and the characteristic points at 6; FCR-CIR-VERIF, which
 * has no results block, puts them at 4 and 5; FCO-VERIF jumps from 5 to 9.
 * A reader following "4.2" from the sheet to the panel has to land on the
 * same block, so the numbers are looked up rather than shared. A heading
 * with no number is one the sheet does not have under that name here.
 */
export type Sec = 'general' | 'geometry' | 'distribution' | 'demand' | 'results' | 'needed'
  | 'minmax' | 'diagram' | 'safety' | 'points' | 'cut' | 'modulus' | 'positioning';
const BEAM_NUMBERS: Partial<Record<Sec, string>> = { general: '1', geometry: '2', demand: '3', results: '4' };
const SECTION_NUMBERS: Record<string, Partial<Record<Sec, string>>> = {
  'FSR:design': BEAM_NUMBERS, 'FST:design': BEAM_NUMBERS,
  'FSR:verify': BEAM_NUMBERS, 'FST:verify': BEAM_NUMBERS,
  'FCR:design': { general: '1', geometry: '2', demand: '3', needed: '4.1', minmax: '4.2', diagram: '5' },
  'FCR-CIR:design': { general: '1', geometry: '2', demand: '3', needed: '4.1', minmax: '4.2', diagram: '5' },
  'FCO:design': { general: '1', geometry: '2', demand: '3', needed: '4.1', minmax: '4.2', cut: '5' },
  'FCR:verify': { general: '1', geometry: '2', distribution: '3', results: '4', safety: '5', points: '6' },
  'FCR-CIR:verify': { general: '1', geometry: '2', distribution: '3', safety: '4', points: '5' },
  'FCO:verify': {
    general: '1', geometry: '2', demand: '3', modulus: '4.1', minmax: '4.2', cut: '5', positioning: '9',
  },
};

/** "4.2 · " for a section the sheet numbers, "" for one it does not. */
export function sectionNumber(kase: FlexCase, mode: FlexMode, k: Sec): string {
  const n = SECTION_NUMBERS[`${kase}:${mode}`]?.[k];
  return n ? `${n} · ` : '';
}

export interface SheetContext {
  kase: FlexCase;
  mode: FlexMode;
  r: FlexOutput | null | undefined;
  fc: number;
  fy: number;
  spiral: boolean;
  /** Bars in the ring, for FCR-CIR's one-bar area. */
  barCount: number;
  Pu: number;
  Mu: number;
}

export interface SheetRows {
  /** "4 · Resultados" of the beam sheets. */
  beam: Row[];
  /** 4.1 on the column design sheets. */
  needed: Row[];
  /** 4.2 — on the design sheets and on FCO-VERIF. */
  minMax: Row[];
  printsMinMax: boolean;
  /** FCR-VERIF's "4.- Resultados": the steel it was given, summed. */
  verifyResult: Row[];
  /** What this tool computes and the sheet does not print here. */
  extra: Row[];
  /** "1 · Datos generales". */
  general: Row[];
  /** "Condición de seguridad", as FCR-VERIF and FCR-CIR-VERIF state it. */
  safety: Row[];
  headline: string;
}

export function sheetRows(c: SheetContext): SheetRows {
  const { kase, mode, r } = c;
  const isBeam = kase === 'FSR' || kase === 'FST';
  const printsMinMax = !isBeam && (mode === 'design' || kase === 'FCO');

  const beam: Row[] = [];
  if (r && isBeam) {
    /* A′s ALWAYS — a singly reinforced beam answers 0,000, which is an answer. */
    beam.push(
      [t('flex.out.asComp'), cm2(r.AsPrimeCm2 ?? 0)],
      [mode === 'verify' ? t('flex.in.asGiven') : t('flex.out.asTension'), cm2(r.AsCm2 ?? r.AstCm2)],
    );
    if (Number.isFinite(r.AsMinCm2)) beam.push([t('flex.out.asMin'), cm2(r.AsMinCm2)]);
    beam.push(cmOfRow(t('flex.out.aReq'), r.a), cmOfRow(t('flex.out.c'), r.c));
    if (r.cMax !== undefined) beam.push(cmOfRow(t('flex.out.cMax'), r.cMax));
    if (r.epsilonT !== undefined) beam.push([t('flex.out.epsT'), permil(r.epsilonT)]);
  }

  let needed: Row[] = [];
  if (r && !isBeam) {
    if (kase === 'FCR') {
      needed = [
        [t('flex.out.asComp'), cm2(r.AsPrimeCm2 ?? 0)],
        [t('flex.out.asTension'), cm2(r.AsCm2 ?? 0)],
        [t('flex.out.astTotal'), cm2(r.AstCm2)],
        [t('flex.out.rho'), r.rho.toFixed(6)],
      ];
    } else if (kase === 'FCR-CIR') {
      needed = [
        [t('flex.out.astTotal'), cm2(r.AstCm2)],
        /* The sheet prints ONE bar of the ring beside the total. */
        [t('flex.out.asiBar'), cm2(c.barCount > 0 ? r.AstCm2 / c.barCount : undefined)],
        [t('flex.out.rho'), r.rho.toFixed(6)],
      ];
    } else {
      /* FCO prints the ratio first, then the area. */
      needed = [[t('flex.out.rho'), r.rho.toFixed(6)], [t('flex.out.astTotal'), cm2(r.AstCm2)]];
    }
  }

  const minMax: Row[] = [];
  if (r && !isBeam) {
    if (Number.isFinite(r.AsMinCm2)) minMax.push([t('flex.out.asMin'), cm2(r.AsMinCm2)]);
    if (r.AstMinCm2 !== undefined) minMax.push([t('flex.out.astMin'), cm2(r.AstMinCm2)]);
    if (r.AstMaxCm2 !== undefined) minMax.push([t('flex.out.astMax'), cm2(r.AstMaxCm2)]);
    if (r.puMax !== undefined) minMax.push([t('flex.out.puMax'), fmt(r.puMax, 2, 'kN')]);
  }

  const verifyResult: Row[] = r && kase === 'FCR' && mode === 'verify'
    ? [[t('flex.out.astTotal'), cm2(r.AstCm2)], [t('flex.out.rho'), r.rho.toFixed(6)]]
    : [];

  /*
   * Kept, and kept SEPARATE: φ and the state at the answer are how a reader
   * sees why the number came out as it did, and the column bounds are worth
   * knowing on a check even where the verification sheet leaves them out.
   */
  const extra: Row[] = [];
  if (r) {
    if (!printsMinMax && !isBeam) {
      if (Number.isFinite(r.AsMinCm2)) extra.push([t('flex.out.asMin'), cm2(r.AsMinCm2)]);
      if (r.AstMinCm2 !== undefined) extra.push([t('flex.out.astMin'), cm2(r.AstMinCm2)]);
      if (r.AstMaxCm2 !== undefined) extra.push([t('flex.out.astMax'), cm2(r.AstMaxCm2)]);
    }
    if (!isBeam) {
      extra.push(cmOfRow(t('flex.out.aReq'), r.a), cmOfRow(t('flex.out.c'), r.c));
      if (r.epsilonT !== undefined) extra.push([t('flex.out.epsT'), permil(r.epsilonT)]);
    }
    if (r.phi !== undefined) extra.push([t('flex.out.phi'), r.phi.toFixed(3)]);
    if (r.phiPn !== undefined && !isBeam) extra.push([t('flex.out.phiPn'), fmt(r.phiPn, 1, 'kN')]);
    if (r.phiMn !== undefined) extra.push([t('flex.out.phiMn'), fmt(r.phiMn, 2, 'kN·m')]);
  }

  /* The constants every later number is built on. */
  const general: Row[] = [
    ['Es', `${ES_MPA.toLocaleString()} MPa`],
    ['εy', permil(yieldStrain(c.fy))],
    ['β1', beta1(c.fc).toFixed(3)],
  ];
  if (isBeam) {
    general.push([t('flex.out.phiTension'), PHI_TENSION.toFixed(2)]);
  } else {
    general.push(
      [t('flex.out.phiCompression'), (c.spiral ? PHI_COMPRESSION_SPIRAL : PHI_COMPRESSION_TIED).toFixed(2)],
      [t('flex.out.phiTension'), PHI_TENSION.toFixed(2)],
      [t('flex.out.rhoColumnBounds'),
        `${(COLUMN_STEEL_RATIO.min * 100).toFixed(0)} % – ${(COLUMN_STEEL_RATIO.max * 100).toFixed(0)} %`],
    );
  }

  /*
   * The eccentricity, the two resistant components at that eccentricity, the
   * two vector moduli and their ratio.
   */
  const safety: Row[] = [];
  if (r && mode === 'verify' && !isBeam && kase !== 'FCO' && r.phiMn !== undefined) {
    const puRes = r.phiPn ?? 0;
    const muRes = Math.sign(c.Mu || 1) * r.phiMn;
    const mvSol = Math.hypot(c.Pu, c.Mu);
    const mvRes = Math.hypot(puRes, muRes);
    if (mvSol >= 1e-9) {
      safety.push(
        ['Pu res', fmt(puRes, 2, 'kN')],
        ['Mu res', fmt(muRes, 2, 'kN·m')],
        ['MV sol', fmt(mvSol, 2, '')],
        ['MV res', fmt(mvRes, 2, '')],
        [t('flex.out.mvRatio'), (mvRes / mvSol).toFixed(4)],
      );
    }
  }

  /*
   * In `verify` the ratio already has its own row right below, with the
   * verdict beside it. Repeating it as the headline printed the same number
   * twice in a row and said nothing new. The capacity is the other half of
   * that comparison, and the number a reader wants next.
   */
  const headline = !r ? t('flex.out.checkInputs')
    : r.impossible ? t('flex.out.sectionTooSmall')
    : mode === 'verify' ? `φMn = ${(r.phiMn ?? 0).toFixed(2)} kN·m`
    : `${isBeam ? 'As' : 'Ast'} = ${r.AstCm2.toFixed(3)} cm²`;

  return { beam, needed, minMax, printsMinMax, verifyResult, extra, general, safety, headline };
}
