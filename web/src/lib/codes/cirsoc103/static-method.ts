/**
 * INPRES-CIRSOC 103 Parte I (2018) Capítulo 6 — the static method.
 *
 * §2.7.2 Tabla 2.5   when the static method may be used at all
 * §6.2.1 [6.1]       Vo = C·W
 * §6.2.2 [6.3]–[6.6] the design seismic coefficient C, and its two floors
 * §6.2.3 [6.7]       T ≤ Cu·Ta, with Cu from Tabla 6.1
 * §6.2.3.1 [6.8]     Ta = Cr·H^x, with Cr and x from Tabla 6.2
 * §6.2.4.1 [6.11]    the distribution in height, and [6.12]/[6.13] when T > 2 T2
 *
 * ── What the old path did ──────────────────────────────────────
 *
 * `load-plan.ts` took the seismic coefficient C as a NUMBER the user typed, multiplied
 * the level weights by it, and distributed the result as Wk·hk. Two of those three steps
 * were right. The missing one is the whole of this file: C is not an input, it is the
 * design spectrum divided by the behaviour factor of the structure that carries the
 * shear, and a reader typing 0,15 into a box has already done — or not done — the
 * calculation the regulation is about.
 *
 * ── What is deliberately NOT implemented ───────────────────────
 *
 * The dynamic methods of Capítulo 7, which §2.7.3 makes MANDATORY above T > 3 T2 and for
 * anything failing Tabla 2.5 — `staticMethodApplicable` reports that rather than
 * producing a static answer anyway. Also: accidental torsion §6.2.4.2, vertical seismic
 * action §6.3, the rotational masses of §6.4, and §6.2.3.2's wall-building period, which
 * needs a wall inventory (Awi, Lwi, hwi, AB) that the model does not carry.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';
import { loadsRequest } from '../../engine/wasm-solver';
import {
  engineSpectrum,
  type DesignSpectrum, type DestinationGroup, type SeismicZone,
} from './spectrum';

const ED = '2018';

const REF_VO = clause('inpres-cirsoc-103-i', ED, '6.2.1', 'esfuerzo de corte en la base');
const REF_C = clause('inpres-cirsoc-103-i', ED, '6.2.2', 'coeficiente sísmico de diseño');
const REF_TA = clause('inpres-cirsoc-103-i', ED, '6.2.3.1', 'período fundamental aproximado');
const REF_CU = clause('inpres-cirsoc-103-i', ED, 'Tabla 6.1', 'coeficiente para el límite superior del período de cálculo');
const REF_T62 = clause('inpres-cirsoc-103-i', ED, 'Tabla 6.2', 'valores de Cr y x');
const REF_DIST = clause('inpres-cirsoc-103-i', ED, '6.2.4.1', 'distribución en altura');
const REF_T25 = clause('inpres-cirsoc-103-i', ED, 'Tabla 2.5', 'condiciones para la aplicación del método estático');
const REF_DYN = clause('inpres-cirsoc-103-i', ED, '2.7.3', 'métodos dinámicos');

// ─── §6.2.3.1 — the approximate period ───────────────────────────

/** Tabla 6.2 — the structural types the period formula distinguishes. */
export type PeriodSystem =
  /** Steel moment frames taking 100 % of the base shear, undamped by infill or bracing. */
  | 'steelMomentFrame'
  /** Reinforced-concrete moment frames on the same terms. */
  | 'concreteMomentFrame'
  /** Steel frames with eccentric or buckling-restrained braces. */
  | 'steelEccentricOrBRB'
  /** Every other structural system. */
  | 'other';

export const PERIOD_COEFFICIENTS: Readonly<Record<PeriodSystem, { cr: number; x: number }>> =
  Object.freeze({
    steelMomentFrame: { cr: 0.0724, x: 0.80 },
    concreteMomentFrame: { cr: 0.0466, x: 0.90 },
    steelEccentricOrBRB: { cr: 0.0731, x: 0.75 },
    other: { cr: 0.0488, x: 0.75 },
  });

/** [6.8] — Ta = Cr·H^x, with H the total height above the reference level, m. */
export function approximatePeriod(heightM: number, system: PeriodSystem): number {
  return designPeriod({ heightM, system }, 0.35).ta;
}

/**
 * Tabla 6.1 — Cu, the cap on the calculated period, interpolated on as.
 *
 * The table prints four rows and says intermediate values may be interpolated, so this
 * interpolates linearly between them and holds the end values flat outside the range,
 * which is what "≥ 0,35" and "≤ 0,08" mean.
 */

export function periodCapFactor(as: number): number {
  return designPeriod({ heightM: 0, system: 'other' }, as).cu;
}

export interface PeriodInputs {
  heightM: number;
  system: PeriodSystem;
  /** A period from a modal analysis, s. Capped at Cu·Ta by [6.7] when given. */
  computedT?: number;
}

export interface PeriodResult {
  /** The period used for the coefficient, s. */
  t: number;
  ta: number;
  cu: number;
  /** True when [6.7] cut a computed period down to Cu·Ta. */
  capped: boolean;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/**
 * The period to use, §6.2.3 with the cap of [6.7].
 *
 * With no computed period, Ta is it. With one, the regulation lets the reader use the
 * real dynamic period — which is longer, and therefore gives a SMALLER coefficient — but
 * only down to Cu·Ta, because a model's period is as long as its assumed stiffness is
 * low. The cap is the clause that stops a soft model from designing its own load away.
 */
export function designPeriod(i: PeriodInputs, as: number): PeriodResult {
  const r = loadsRequest({
    op: 'cirsoc103Period', height: i.heightM, system: i.system, as,
    ...(i.computedT !== undefined ? { computedT: i.computedT } : {}),
  }) as { t: number; ta: number; cu: number; cr: number; x: number; limit: number; capped: boolean; computed: boolean };
  const { ta, cu, limit, capped } = r;
  if (!r.computed) {
    return {
      t: ta, ta, cu, capped: false, refs: [REF_TA, REF_T62],
      derivation: msg('seismic.derivation.taOnly', { cr: r.cr, x: r.x, h: round(i.heightM, 2), ta: round(ta, 3) }),
    };
  }
  return {
    t: r.t, ta, cu, capped,
    refs: [REF_TA, REF_T62, REF_CU, clause('inpres-cirsoc-103-i', ED, '6.2.3', 'período fundamental de vibración')],
    derivation: msg(capped ? 'seismic.derivation.tCapped' : 'seismic.derivation.tComputed', {
      computed: round(i.computedT!, 3), cu: round(cu, 2), ta: round(ta, 3),
      limit: round(limit, 3),
    }),
  };
}

// ─── §6.2.2 — the design seismic coefficient ─────────────────────

export interface CoefficientInputs {
  spectrum: DesignSpectrum;
  group: DestinationGroup;
  /** Global reduction factor R, from Tabla 5.1. */
  r: number;
  /** The period used, s. */
  t: number;
}

export interface CoefficientResult {
  c: number;
  /** Which expression produced it. */
  basis: 'plateau' | 'spectrum';
  /** The floor that governed, if one did. */
  floorApplied: 'nearFault' | 'lowZone' | null;
  gammaR: number;
  sa: number;
  refs: ClauseRef[];
  derivation: EngineMessage[];
}

/**
 * [6.3]–[6.6] — C, with both floors applied.
 *
 * The floors are the part most easily lost: a long-period building in zone 4 can come
 * out of [6.4] below `0,8·as·Nv/R`, and the regulation does not let it. They are
 * reported when they bind, because a coefficient that came from a floor is a different
 * fact about the building than one that came from the spectrum.
 */
export function designSeismicCoefficient(i: CoefficientInputs): CoefficientResult {
  const s = i.spectrum;
  const e = loadsRequest({ op: 'cirsoc103Coefficient', spectrum: engineSpectrum(s), group: i.group, r: i.r, t: i.t }) as {
    c: number; cSpectral: number; plateau: boolean; floorApplied?: 'nearFault' | 'lowZone'; gammaR: number; sa: number; r: number;
  };
  const { gammaR, sa, r, plateau } = e;
  const derivation: EngineMessage[] = [msg(plateau ? 'seismic.derivation.cPlateau' : 'seismic.derivation.cSpectrum', {
    sa: round(sa, 4), gammaR, r: round(r, 2), t: round(i.t, 3),
    t2: round(s.t2, 3), c: round(e.cSpectral, 4),
  })];
  if (e.floorApplied === 'nearFault') {
    derivation.push(msg('seismic.derivation.cFloorNearFault', { as: s.as, nv: round(s.nv, 2), r: round(r, 2), c: round(e.c, 4) }));
  } else if (e.floorApplied === 'lowZone') {
    derivation.push(msg('seismic.derivation.cFloorLowZone', { ca: round(s.ca, 3), gammaR, c: round(e.c, 4) }));
  }
  return {
    c: e.c, basis: plateau ? 'plateau' : 'spectrum', floorApplied: e.floorApplied ?? null, gammaR, sa,
    refs: [REF_C, ...s.refs], derivation,
  };
}

/** [6.1] — Vo = C·W. */
export function baseShear(c: number, weightKN: number): number {
  return c * weightKN;
}

export const BASE_SHEAR_REF = REF_VO;

// ─── §6.2.4.1 — distribution in height ───────────────────────────

export interface MassLevel {
  /** Height above the reference level, m. */
  h: number;
  /** Gravity load concentrated at this level, kN. */
  w: number;
}

export interface DistributedForce {
  h: number;
  w: number;
  /** Horizontal seismic force at this level, kN. */
  f: number;
}

export interface DistributionResult {
  forces: DistributedForce[];
  /** True when [6.12]/[6.13] were used instead of [6.11]. */
  topHeavy: boolean;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/**
 * [6.11], or [6.12]+[6.13] when the period is long.
 *
 * The inverted triangle of [6.11] assumes the first mode dominates. Past T > 2·T2 the
 * regulation stops assuming it: nine tenths of the shear is distributed as before and
 * the remaining tenth is placed entirely on the topmost mass, which is the higher-mode
 * whip that the triangle misses. The `t` compared against `2·T2` is explicitly the
 * period WITHOUT the [6.7] cap — the clause says so, and using the capped one would
 * shorten the period and silently skip the extra force.
 */
export function distributeInHeight(
  levels: readonly MassLevel[], baseShearKN: number,
  uncappedT: number, t2: number,
): DistributionResult {
  const r = loadsRequest({
    // T2 = ∞ (no spectrum) crosses as null: never top-heavy.
    op: 'cirsoc103Distribution', levels: levels.map((l) => ({ h: l.h, w: l.w })), baseShear: baseShearKN, uncappedT,
    t2: Number.isFinite(t2) ? t2 : null,
  }) as { forces: Array<[number, number, number]>; topHeavy: boolean; sumWh: number };
  const forces = r.forces.map(([h, w, f]) => ({ h, w, f }));
  if (r.sumWh <= 0) {
    return { forces, topHeavy: r.topHeavy, refs: [REF_DIST], derivation: msg('seismic.derivation.distNoMass') };
  }
  return {
    forces, topHeavy: r.topHeavy, refs: [REF_DIST],
    derivation: msg(r.topHeavy ? 'seismic.derivation.distTopHeavy' : 'seismic.derivation.dist', {
      levels: forces.length, sumWh: round(r.sumWh, 1), v0: round(baseShearKN, 1),
      t: round(uncappedT, 3), t2: round(t2, 3),
    }),
  };
}

// ─── §2.7.2 — may the static method be used at all? ──────────────

export type PlanRegularity = 'regular' | 'medium' | 'irregular';

export interface ApplicabilityInputs {
  zone: SeismicZone;
  group: DestinationGroup;
  /** Total height measured to the last mass, m. */
  heightM: number;
  /** Number of levels or masses. */
  levels: number;
  regularity: PlanRegularity;
  /** The period without the [6.7] cap, s, and the spectrum's T2. */
  t?: number;
  t2?: number;
}

export interface Applicability {
  allowed: boolean;
  /** True when Capítulo 7 is not merely permitted but required. */
  dynamicRequired: boolean;
  reasons: EngineMessage[];
  refs: ClauseRef[];
}

/* Tabla 2.5's height limits live in the engine (`static_method_applicable`). */

/**
 * Whether Capítulo 6 may be used, and whether Capítulo 7 is mandatory.
 *
 * §2.7.2 admits the static method unconditionally for anything up to 3 levels or under
 * 9 m; above that it is the Tabla 2.5 limits. §2.7.3 makes the dynamic methods
 * obligatory when T > 3·T2, and that is a refusal rather than a warning: a static answer
 * for such a building is a number the regulation does not accept.
 */
export function staticMethodApplicable(i: ApplicabilityInputs): Applicability {
  const refs: ClauseRef[] = [REF_T25, clause('inpres-cirsoc-103-i', ED, '2.7.2', 'método estático')];
  const r = loadsRequest({
    op: 'cirsoc103Applicability', zone: i.zone, group: i.group, height: i.heightM, levels: i.levels, regularity: i.regularity,
    ...(i.t !== undefined ? { t: i.t } : {}), ...(i.t2 !== undefined ? { t2: i.t2 } : {}),
  }) as { allowed: boolean; dynamicRequired: boolean; reasons: string[]; heightLimit?: number };
  const reasons: EngineMessage[] = r.reasons.map((k) => {
    switch (k) {
      case 'dynamicRequired': return msg('seismic.blocked.dynamicRequired', { t: round(i.t!, 3), t2: round(i.t2!, 3), limit: round(3 * i.t2!, 3) });
      case 'heightOverTable25': return msg('seismic.blocked.heightOverTable25', { h: round(i.heightM, 2), limit: r.heightLimit!, zone: i.zone, group: i.group });
      case 'irregular': return msg('seismic.blocked.irregular');
      case 'aoIrregular': return msg('seismic.blocked.aoIrregular');
      case 'groupCAsB': return msg('seismic.assumed.groupCAsB');
      default: throw new Error(`unknown applicability reason from the engine: ${k}`);
    }
  });
  return { allowed: r.allowed, dynamicRequired: r.dynamicRequired, reasons, refs: r.dynamicRequired ? [...refs, REF_DYN] : refs };
}
