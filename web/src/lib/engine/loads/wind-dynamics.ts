/**
 * The dynamic side of a load plan's wind: where each direction's fundamental frequency comes from,
 * and the gust effect factor's inputs it gives (CIRSOC 102-2025 §1.9, `codes/cirsoc102/gust.ts`).
 *
 *   modal          the structure's own modal analysis, with the plan's masses (§1.9.2): the
 *                  lowest mode with a tenth of the mass along each wind direction;
 *   typed          the reader's numbers;
 *   approximate    the lower bounds of §1.9.3, for a building within the limits of §1.9.2.1;
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
import type { OtherStructure } from './wind-other';

export type FrequencySource = 'modal' | 'typed' | 'approximate' | 'declaredRigid';

export interface WindDynamics {
  n1Source: FrequencySource;
  /** Hz per wind axis: filled after the modal solve, or typed. */
  n1?: { x?: number; y?: number };
  /** For `approximate`: which of Eqs. (1.9-2) to (1.9-4). */
  system?: ApproximateSystem;
  /** Damping ratio, a fraction of critical (0,02 = 2 %). The code fixes none (§1.9.5): `defaultBeta`. */
  beta: number;
  /** A rigid structure's G: 0,85 (§1.9.1) or Eq. (1.9-6). */
  rigidG: RigidG;
  /** Shear centre to mass centre, per wind axis, m, for Eq. (2.4-5). Absent: 0. */
  eR?: { x?: number; y?: number };
  /**
   * For `modal`, filled with `n1` after the solve: the lowest frequency of any mode, Hz, which
   * trigger III of C 1.1.2 reads, and what the reading of the modes named (`fundamentalFrequencies`).
   */
  modal?: { lowest?: number; notes?: readonly EngineMessage[] };
}

export type StructureKind = 'building' | OtherStructure['kind'];

/**
 * A free roof is an open building (§2.4.3, chapter 2); chimneys, towers and signs are the other
 * structures of §4.4 and §4.5. What §1.9.2.1 and §1.9.3 say of buildings stops at the latter.
 */
export function isBuildingKind(kind: StructureKind | undefined): boolean {
  return kind === undefined || kind === 'building' || kind === 'freeRoof';
}

/**
 * β by default, by the kind of structure. The code fixes none (§1.9.5); commentary C 1.9 gives
 * 1 % and 2 % for steel and concrete buildings in service, 2,5 % to 3 % near strength, and 0,15 %
 * to 0,5 % for the steel supports of signs, chimneys and towers (0,2 % to 1 % for steel stacks).
 * A building of unknown material takes 2 %, what the generator always used; a chimney, tower or
 * sign 0,5 %, the top of its range: 2 % read G_f 1,013 for a steel chimney that is 1,299 at 0,5 %.
 * A steel building, or a bare steel stack, is for the reader to lower.
 */
export function defaultBeta(kind: StructureKind = 'building'): number {
  return isBuildingKind(kind) ? 0.02 : 0.005;
}
export function defaultWindDynamics(kind: StructureKind = 'building'): WindDynamics {
  return { n1Source: 'modal', beta: defaultBeta(kind), rigidG: 'default' };
}
export const DEFAULT_WIND_DYNAMICS: WindDynamics = Object.freeze(defaultWindDynamics('building')) as WindDynamics;

/** Low rise (art. 1.2): enclosed or partly so, h ≤ 20 m and no more than the least plan dimension. */
export function isLowRise(h: number, bx: number, by: number, enclosure: Enclosure, kind: StructureKind = 'building'): boolean {
  return kind === 'building' && enclosure !== 'open' && h <= 20 && h <= Math.min(bx, by);
}

/**
 * The gust inputs of one wind axis, or the reason there are none. `levels` are the plan's levels,
 * for L_ef of the approximate frequency (Eq. 1.9-1), with each level's extent along the wind.
 */
export function gustInputsFor(
  d: WindDynamics | undefined, axis: 'x' | 'y', h: number,
  levels: ReadonlyArray<{ elevation: number; along: number }>, lowRise: boolean, kind: StructureKind = 'building',
): { n1?: number; beta: number; rigidG: RigidG; lowRise?: boolean } | { refused: EngineMessage } | undefined {
  if (!d) return undefined;
  const base = { beta: d.beta, rigidG: d.rigidG, ...(lowRise ? { lowRise: true } : {}) };
  if (lowRise || d.n1Source === 'declaredRigid') return base;
  if (d.n1Source === 'approximate') {
    // Eqs. (1.9-2) to (1.9-4) are for steel, concrete or masonry buildings (§1.9.2.1, §1.9.3):
    // a 30 m lattice tower read 0,762 Hz off them.
    if (!isBuildingKind(kind)) return { refused: msg('loads.cirsoc102.gust.approxNotBuilding') };
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
 * A mode carries a direction when it moves at least a tenth of the mass along it. Below that the
 * wind along the direction hardly excites it: the same tenth below which a first mode is read as
 * torsion here. Coupled modes split a direction's mass, 40 % and 45 % say, so "the most mass" is
 * not the fundamental one.
 */
const SIGNIFICANT_MASS = 0.1;

export type ModalPick = { n1: number; mode: number; mass: number };

/**
 * Each wind direction's fundamental frequency from a modal result. n₁ is the lowest natural
 * frequency in the wind's direction (commentary C 1.9, Tabla C 1.9-1): the lowest mode with a
 * tenth of the mass along it, and the lower n₁ is the safe side of G_f. Where no mode reaches a
 * tenth (too few modes, or masses that do not move that way), the mode with the most is taken and
 * named. A first mode that is mostly torsion below 1 Hz is named: its amplification is outside G_f
 * (C 1.9). `lowest` is the lowest frequency of any mode, for trigger III of C 1.1.2.
 */
export function fundamentalFrequencies(modes: readonly ModeLike[]): {
  x?: ModalPick; y?: ModalPick; lowest?: number; notes: EngineMessage[];
} {
  const notes: EngineMessage[] = [];
  const pick = (k: 'massRatioX' | 'massRatioY'): ModalPick | undefined => {
    const at = (i: number): ModalPick => ({ n1: modes[i]!.frequency, mode: i + 1, mass: modes[i]![k] ?? 0 });
    let lowest = -1, most = -1;
    modes.forEach((m, i) => {
      const mass = m[k] ?? 0;
      if (mass >= SIGNIFICANT_MASS && (lowest < 0 || m.frequency < modes[lowest]!.frequency)) lowest = i;
      if (mass > (most < 0 ? 0 : (modes[most]![k] ?? 0))) most = i;
    });
    if (lowest >= 0) return at(lowest);
    if (most < 0) return undefined;
    const p = at(most);
    notes.push(msg('loads.cirsoc102.gust.weakModalMass', { axis: k === 'massRatioX' ? 'X' : 'Y', mode: p.mode, mass: Math.round(p.mass * 100) }));
    return p;
  };
  const lowest = modes.reduce<{ m: ModeLike; i: number } | null>((acc, m, i) => (!acc || m.frequency < acc.m.frequency ? { m, i } : acc), null);
  if (lowest && lowest.m.frequency < 1 && (lowest.m.massRatioX ?? 0) + (lowest.m.massRatioY ?? 0) < SIGNIFICANT_MASS) {
    notes.push(msg('loads.cirsoc102.gust.torsionalFirstMode', { mode: lowest.i + 1, f: lowest.m.frequency }));
  }
  const x = pick('massRatioX'), y = pick('massRatioY');
  return { x, y, ...(lowest ? { lowest: lowest.m.frequency } : {}), notes };
}
