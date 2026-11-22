import type { Fmt } from './format';
import { withCriterion } from './criteria';
import { check, type CheckLine } from './types';
import { MIN_CONTACT, UPLIFT_WEIGHT_FACTOR, upliftHolds, type bearingReading, type ServiceBearing, type UpliftReading } from './footing-mechanics';
import type { FootingDemand } from './footing-types';

/** The allowable pressure a foundation needs where the soil's does not hold it at the plan the lines allow: what to ask the soil study for, or found deep instead (GA §4, §15.1). */
export const needsLine = (needs: number, allowable: number, fmt: Fmt): CheckLine =>
  check('rcSheets.v.footNeedsSoil', false, { clause: withCriterion('§13.3.1.1'), demand: `qadm ≥ ${fmt(needs, 0)} kPa`, capacity: `${fmt(allowable, 0)} kPa`, ratio: allowable > 0 ? needs / allowable : Infinity });

/** The allowable pressure a base needs to hold this service pressure, kPa, in steps of 5 kPa; none where it overturns or keeps less than the least contact, which no pressure mends. */
export function needsOf(s: ServiceBearing, edgeFactor: number): { needs?: number } {
  if (s.overturns || s.contact < MIN_CONTACT - 1e-9) return {};
  return { needs: Math.ceil(Math.max(s.qMean, s.qMax / edgeFactor) / 5 - 1e-9) * 5 };
}

/** The soil's lines for a base: no soil, no service load, or its bearing and contact, and the pressure it would need. */
export function soilChecks(d: Pick<FootingDemand, 'soil'>, b: ReturnType<typeof bearingReading> | null, fmt: Fmt, needs: number | undefined, clause = '§13.3.1.1'): CheckLine[] {
  if (!d.soil) return [check('rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' })];
  if (!b) return [check('rcSheets.v.footNoService', false, { clause: '§13.3.1.1' })];
  return [
    check('rcSheets.v.footBearing', !b.overturns && b.use <= 1 + 1e-9, { clause, demand: `${fmt(b.qMax, 0)} · ${fmt(b.qMean, 0)} kPa`, capacity: `${fmt(b.edgeFactor * (b.allowable ?? 0), 0)} · ${fmt(b.allowable ?? 0, 0)} kPa`, ratio: b.use }),
    check('rcSheets.v.footContact', !b.overturns && b.contact >= MIN_CONTACT - 1e-9, { clause: '§13.2.6.1', demand: `${fmt(b.contact * 100, 0)} %`, capacity: `≥ ${fmt(MIN_CONTACT * 100, 0)} %` }),
    ...(needs !== undefined && !b.ok ? [needsLine(needs, b.allowable ?? 0, fmt)] : []),
  ];
}

/** A combination that pulls the base up: held when 0,9 of its weight and of the fill over it outweighs the pull, and told by name with neither where its axial force is missing. */
export const upliftChecks = (u: UpliftReading | null, fmt: Fmt): CheckLine[] => (u ? [check('rcSheets.v.footUplift', upliftHolds(u), {
  demand: Number.isFinite(u.N) ? `${fmt(-u.N, 0)} kN · ${u.combo}` : `— · ${u.combo}`,
  capacity: `${fmt(UPLIFT_WEIGHT_FACTOR, 1)} G = ${fmt(UPLIFT_WEIGHT_FACTOR * u.weight, 0)} kN`,
  ratio: Number.isFinite(u.N) && u.weight > 0 ? -u.N / (UPLIFT_WEIGHT_FACTOR * u.weight) : Infinity,
})] : []);
