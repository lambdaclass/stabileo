/**
 * The dynamic side of a load plan's wind: where each direction's fundamental frequency comes from,
 * and the gust effect factor's inputs it gives (CIRSOC 102-2025 §1.9, `codes/cirsoc102/gust.ts`).
 *
 *   modal          the structure's own modal analysis, with the plan's masses (§1.9.2): the
 *                  translational mode with the most mass along each wind direction;
 *   typed          the reader's numbers;
 *   approximate    the lower bounds of §1.9.3, within the limits of §1.9.2.1;
 *   declaredRigid  n₁ ≥ 1 Hz on the reader's word, which is how the generator read every building
 *                  before.
 *
 * A low-rise building (art. 1.2) is rigid without a frequency (§1.9.2).
 *
 * Pure: no store.
 */
import { approximateFrequency, effectiveLength, type ApproximateSystem, type RigidG } from '../../codes/cirsoc102/gust';
import { msg, type EngineMessage } from '../../codes/message';
import type { Enclosure } from '../../codes/cirsoc102/wind';

export type FrequencySource = 'modal' | 'typed' | 'approximate' | 'declaredRigid';

export interface WindDynamics {
  n1Source: FrequencySource;
  /** Hz per wind axis: filled after the modal solve, or typed. */
  n1?: { x?: number; y?: number };
  /** For `approximate`: which of Eqs. (1.9-2) to (1.9-4). */
  system?: ApproximateSystem;
  /** Damping ratio, a fraction of critical (0,02 = 2 %). The code fixes none (§1.9.5). */
  beta: number;
  /** A rigid structure's G: 0,85 (§1.9.1) or Eq. (1.9-6). */
  rigidG: RigidG;
  /** Shear centre to mass centre, per wind axis, m, for Eq. (2.4-5). Absent: 0. */
  eR?: { x?: number; y?: number };
}

export const DEFAULT_WIND_DYNAMICS: WindDynamics = Object.freeze({ n1Source: 'modal', beta: 0.02, rigidG: 'default' }) as WindDynamics;

/** Low rise (art. 1.2): enclosed or partly so, h ≤ 20 m and no more than the least plan dimension. */
export function isLowRise(h: number, bx: number, by: number, enclosure: Enclosure): boolean {
  return enclosure !== 'open' && h <= 20 && h <= Math.min(bx, by);
}

/**
 * The gust inputs of one wind axis, or the reason there are none. `levels` are the plan's levels,
 * for L_ef of the approximate frequency (Eq. 1.9-1), with each level's extent along the wind.
 */
export function gustInputsFor(
  d: WindDynamics | undefined, axis: 'x' | 'y', h: number,
  levels: ReadonlyArray<{ elevation: number; along: number }>, lowRise: boolean,
): { n1?: number; beta: number; rigidG: RigidG; lowRise?: boolean } | { refused: EngineMessage } | undefined {
  if (!d) return undefined;
  const base = { beta: d.beta, rigidG: d.rigidG, ...(lowRise ? { lowRise: true } : {}) };
  if (lowRise || d.n1Source === 'declaredRigid') return base;
  if (d.n1Source === 'approximate') {
    const lef = effectiveLength(levels.filter((l) => l.elevation > 0).map((l) => ({ h: l.elevation, L: l.along })));
    const r = approximateFrequency(d.system ?? 'otherSteelOrConcrete', h, lef);
    return 'refused' in r ? r : { ...base, n1: r.na };
  }
  const n1 = d.n1?.[axis];
  if (n1 === undefined || !(n1 > 0)) return { refused: msg(d.n1Source === 'modal' ? 'loads.cirsoc102.gust.noModalFrequency' : 'loads.cirsoc102.gust.noTypedFrequency', { axis: axis.toUpperCase() }) };
  return { ...base, n1 };
}

export interface ModeLike { frequency: number; massRatioX?: number; massRatioY?: number }

/**
 * Each wind direction's fundamental frequency from a modal result: the mode with the most mass
 * along it (the translational mode that direction excites). A first mode that is mostly torsion
 * below 1 Hz is named: its amplification is outside G_f (commentary C 1.9).
 */
export function fundamentalFrequencies(modes: readonly ModeLike[]): {
  x?: { n1: number; mode: number; mass: number }; y?: { n1: number; mode: number; mass: number }; notes: EngineMessage[];
} {
  const notes: EngineMessage[] = [];
  const pick = (k: 'massRatioX' | 'massRatioY') => {
    let best = -1;
    modes.forEach((m, i) => { if ((m[k] ?? 0) > (best < 0 ? 0 : (modes[best]![k] ?? 0))) best = i; });
    return best < 0 ? undefined : { n1: modes[best]!.frequency, mode: best + 1, mass: modes[best]![k] ?? 0 };
  };
  const lowest = modes.reduce<{ m: ModeLike; i: number } | null>((acc, m, i) => (!acc || m.frequency < acc.m.frequency ? { m, i } : acc), null);
  if (lowest && lowest.m.frequency < 1 && (lowest.m.massRatioX ?? 0) + (lowest.m.massRatioY ?? 0) < 0.1) {
    notes.push(msg('loads.cirsoc102.gust.torsionalFirstMode', { mode: lowest.i + 1, f: lowest.m.frequency }));
  }
  return { x: pick('massRatioX'), y: pick('massRatioY'), notes };
}
