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
import {
  RISK_FACTOR, spectralOrdinate,
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
  const { cr, x } = PERIOD_COEFFICIENTS[system];
  return cr * Math.pow(Math.max(heightM, 0), x);
}

/**
 * Tabla 6.1 — Cu, the cap on the calculated period, interpolated on as.
 *
 * The table prints four rows and says intermediate values may be interpolated, so this
 * interpolates linearly between them and holds the end values flat outside the range,
 * which is what "≥ 0,35" and "≤ 0,08" mean.
 */
const CU_TABLE: ReadonlyArray<{ as: number; cu: number }> = Object.freeze([
  { as: 0.08, cu: 1.70 },
  { as: 0.15, cu: 1.60 },
  { as: 0.25, cu: 1.45 },
  { as: 0.35, cu: 1.40 },
]);

export function periodCapFactor(as: number): number {
  if (as <= CU_TABLE[0].as) return CU_TABLE[0].cu;
  const last = CU_TABLE[CU_TABLE.length - 1];
  if (as >= last.as) return last.cu;
  for (let i = 1; i < CU_TABLE.length; i++) {
    const a = CU_TABLE[i - 1];
    const b = CU_TABLE[i];
    if (as <= b.as) {
      const t = (as - a.as) / (b.as - a.as);
      return a.cu + t * (b.cu - a.cu);
    }
  }
  return last.cu;
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
  const ta = approximatePeriod(i.heightM, i.system);
  const cu = periodCapFactor(as);
  const limit = cu * ta;
  if (i.computedT === undefined || !(i.computedT > 0)) {
    return {
      t: ta, ta, cu, capped: false, refs: [REF_TA, REF_T62],
      derivation: msg('seismic.derivation.taOnly', {
        cr: PERIOD_COEFFICIENTS[i.system].cr, x: PERIOD_COEFFICIENTS[i.system].x,
        h: round(i.heightM, 2), ta: round(ta, 3),
      }),
    };
  }
  const capped = i.computedT > limit;
  return {
    t: capped ? limit : i.computedT, ta, cu, capped,
    refs: [REF_TA, REF_T62, REF_CU, clause('inpres-cirsoc-103-i', ED, '6.2.3', 'período fundamental de vibración')],
    derivation: msg(capped ? 'seismic.derivation.tCapped' : 'seismic.derivation.tComputed', {
      computed: round(i.computedT, 3), cu: round(cu, 2), ta: round(ta, 3),
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
  const gammaR = RISK_FACTOR[i.group];
  const r = Math.max(i.r, 1e-9);
  const derivation: EngineMessage[] = [];

  const plateau = i.t <= s.t2;
  const sa = plateau ? 2.5 * s.ca : spectralOrdinate(i.t, s);
  let c = (sa * gammaR) / r;
  derivation.push(msg(plateau ? 'seismic.derivation.cPlateau' : 'seismic.derivation.cSpectrum', {
    sa: round(sa, 4), gammaR, r: round(r, 2), t: round(i.t, 3),
    t2: round(s.t2, 3), c: round(c, 4),
  }));

  let floorApplied: CoefficientResult['floorApplied'] = null;
  if (s.zone >= 3) {
    // [6.5] — C ≥ 0,8·as·Nv/R in zones 3 and 4.
    const floor = (0.8 * s.as * s.nv) / r;
    if (floor > c) {
      c = floor;
      floorApplied = 'nearFault';
      derivation.push(msg('seismic.derivation.cFloorNearFault', {
        as: s.as, nv: round(s.nv, 2), r: round(r, 2), c: round(c, 4),
      }));
    }
  } else {
    // [6.6] — C ≥ 0,11·Ca·γr in zones 0, 1 and 2. Note: no R in this one.
    const floor = 0.11 * s.ca * gammaR;
    if (floor > c) {
      c = floor;
      floorApplied = 'lowZone';
      derivation.push(msg('seismic.derivation.cFloorLowZone', {
        ca: round(s.ca, 3), gammaR, c: round(c, 4),
      }));
    }
  }

  return {
    c, basis: plateau ? 'plateau' : 'spectrum', floorApplied, gammaR, sa,
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
  const usable = levels.filter((l) => l.w > 0 && l.h > 0);
  const sumWh = usable.reduce((s, l) => s + l.w * l.h, 0);
  const topHeavy = uncappedT > 2 * t2;

  if (sumWh <= 0) {
    return {
      forces: usable.map((l) => ({ h: l.h, w: l.w, f: 0 })),
      topHeavy, refs: [REF_DIST],
      derivation: msg('seismic.derivation.distNoMass'),
    };
  }

  // The topmost mass by height; [6.13] places the extra tenth there.
  let topIndex = 0;
  for (let i = 1; i < usable.length; i++) if (usable[i].h > usable[topIndex].h) topIndex = i;

  const factor = topHeavy ? 0.9 : 1.0;
  const forces = usable.map((l, idx) => {
    let f = (factor * l.w * l.h * baseShearKN) / sumWh;
    if (topHeavy && idx === topIndex) f += 0.1 * baseShearKN;
    return { h: l.h, w: l.w, f };
  });

  return {
    forces, topHeavy, refs: [REF_DIST],
    derivation: msg(topHeavy ? 'seismic.derivation.distTopHeavy' : 'seismic.derivation.dist', {
      levels: usable.length, sumWh: round(sumWh, 1), v0: round(baseShearKN, 1),
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

/**
 * Tabla 2.5 — the height the static method reaches, by zone and destination group.
 *
 * Group C is not a column of Tabla 2.5. It is the least demanding group (γr = 0,8), so
 * it is read here against group B's row — stated rather than silently assumed, and never
 * used to raise a limit.
 */
const MAX_HEIGHT: Readonly<Record<'high' | 'low', Record<DestinationGroup, number>>> =
  Object.freeze({
    // Zones 3 and 4
    high: { Ao: 12, A: 30, B: 45, C: 45 },
    // Zones 0, 1 and 2
    low: { Ao: 16, A: 45, B: 60, C: 60 },
  });

/**
 * Whether Capítulo 6 may be used, and whether Capítulo 7 is mandatory.
 *
 * §2.7.2 admits the static method unconditionally for anything up to 3 levels or under
 * 9 m; above that it is the Tabla 2.5 limits. §2.7.3 makes the dynamic methods
 * obligatory when T > 3·T2, and that is a refusal rather than a warning: a static answer
 * for such a building is a number the regulation does not accept.
 */
export function staticMethodApplicable(i: ApplicabilityInputs): Applicability {
  const reasons: EngineMessage[] = [];
  const refs: ClauseRef[] = [REF_T25, clause('inpres-cirsoc-103-i', ED, '2.7.2', 'método estático')];

  if (i.t !== undefined && i.t2 !== undefined && i.t > 3 * i.t2) {
    return {
      allowed: false, dynamicRequired: true,
      reasons: [msg('seismic.blocked.dynamicRequired', {
        t: round(i.t, 3), t2: round(i.t2, 3), limit: round(3 * i.t2, 3),
      })],
      refs: [...refs, REF_DYN],
    };
  }

  // "Se admite para todas las construcciones hasta 3 niveles o de altura menor que 9 m."
  if (i.levels <= 3 || i.heightM < 9) {
    return { allowed: true, dynamicRequired: false, reasons, refs };
  }

  const band = i.zone >= 3 ? 'high' : 'low';
  const limit = MAX_HEIGHT[band][i.group];
  if (i.heightM > limit) {
    reasons.push(msg('seismic.blocked.heightOverTable25', {
      h: round(i.heightM, 2), limit, zone: i.zone, group: i.group,
    }));
  }
  if (i.regularity === 'irregular') {
    reasons.push(msg('seismic.blocked.irregular'));
  }
  if (i.group === 'C') {
    reasons.push(msg('seismic.assumed.groupCAsB'));
  }

  const blocking = reasons.filter((r) => r.key.startsWith('seismic.blocked.'));
  return {
    allowed: blocking.length === 0, dynamicRequired: blocking.length > 0,
    reasons, refs: blocking.length > 0 ? [...refs, REF_DYN] : refs,
  };
}
