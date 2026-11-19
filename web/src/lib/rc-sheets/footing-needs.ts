import type { Fmt } from './format';
import { withCriterion } from './criteria';
import { check, type CheckLine } from './types';
import { MIN_CONTACT, type ServiceBearing } from './footing-mechanics';

/** The allowable pressure a foundation needs where the soil's does not hold it at the plan the lines allow: what to ask the soil study for, or found deep instead (GA §4, §15.1). */
export const needsLine = (needs: number, allowable: number, fmt: Fmt): CheckLine =>
  check('rcSheets.v.footNeedsSoil', false, { clause: withCriterion('§13.3.1.1'), demand: `qadm ≥ ${fmt(needs, 0)} kPa`, capacity: `${fmt(allowable, 0)} kPa`, ratio: allowable > 0 ? needs / allowable : Infinity });

/** The allowable pressure a base needs to hold this service pressure, kPa, in steps of 5 kPa; none where it overturns or keeps less than the least contact, which no pressure mends. */
export function needsOf(s: ServiceBearing, edgeFactor: number): { needs?: number } {
  if (s.overturns || s.contact < MIN_CONTACT - 1e-9) return {};
  return { needs: Math.ceil(Math.max(s.qMean, s.qMax / edgeFactor) / 5 - 1e-9) * 5 };
}
