/**
 * The six characteristic points the verification sheets print.
 *
 * FCR-VERIF and FCR-CIR-VERIF do not stop at a verdict: they tabulate the whole
 * shape of the interaction diagram as six named states, each with its φMn, its
 * φPn and the φ that applies there — and then print the same six again for the
 * opposite edge in compression. That table is the most checkable thing in the
 * workbook, because a method that agrees at one point by luck cannot agree at
 * six.
 *
 * ── Solved, not looked up ─────────────────────────────────────────
 *
 * The first version read them off a sampled curve — nearest grid point, or a
 * straight line between two — and spent its comments explaining why each row
 * needed a different patch to land on the sheet. None is needed: every one of
 * the six is DEFINED by a neutral-axis depth, and a depth can be computed.
 *
 *   zero strain in the far steel     c = dt
 *   yield strain in the far steel    c = 0,003·dt / (0,003 + εy)
 *   εt = 5 ‰                          c = 0,003·dt / 0,008
 *   pure flexure                     φPn = 0, bisected on c
 *   the axial cap, at its widest     φ·Pn = φPn(max), bisected on c
 *   maximum tension                  every bar yielding, no concrete
 *
 * `dt` is the depth of the steel furthest from the compressed edge, measured
 * along the axis — the same `max − s` that `sectionPoint` uses for strain.
 *
 * Pure: no store, no runes, no i18n. The names are keys.
 */

import { withSection, type Bar, type Outline, type Materials } from './cirsoc201-section';

/** Which named state on the diagram this is. `key` is an i18n key suffix. */
export type CharacteristicKey =
  /** φPn at 0,8 Po — the ceiling a column may be loaded to. */
  | 'axialCap'
  /** Zero strain in the steel furthest from the compressed edge. */
  | 'zeroStrain'
  /** That steel at its yield strain. */
  | 'yieldStrain'
  /** Tension-controlled: εt = 5 ‰ (2005), εty + 3 ‰ (2025), where φ has reached 0,90. */
  | 'epsilon5'
  /** φPn = 0 — pure flexure. */
  | 'pureFlexure'
  /** Every bar yielding in tension. */
  | 'maxTension';

export interface CharacteristicPoint {
  key: CharacteristicKey;
  /** kN·m, signed as the sheet signs it: positive with the top face compressed. */
  phiMn: number;
  /** kN. */
  phiPn: number;
  phi: number;
  /** Strain in the far steel at this point, for the reader who wants to check. */
  epsilonT: number;
}

/**
 * The six, for the edge whose outward normal is `theta` — −π/2 is the bottom
 * face compressed, the sheet's first table and so the default; π/2 the top.
 */
export function characteristicPoints(
  outline: Outline, bars: readonly Bar[], mat: Materials,
  theta = -Math.PI / 2,
): CharacteristicPoint[] {
  /* Computed by the engine (`Section::characteristic_points`), in the sheet's order. */
  const keys: CharacteristicKey[] = ['axialCap', 'zeroStrain', 'yieldStrain', 'epsilon5', 'pureFlexure', 'maxTension'];
  const v = withSection(outline, bars, mat, (s) => s.characteristicPoints(theta));
  return keys.map((key, i) => ({ key, phiMn: v[i][0], phiPn: v[i][1], phi: v[i][2], epsilonT: v[i][3] }));
}

export function characteristicPointsBothEdges(
  outline: Outline, bars: readonly Bar[], mat: Materials,
): { bottomCompressed: CharacteristicPoint[]; topCompressed: CharacteristicPoint[] } {
  return {
    bottomCompressed: characteristicPoints(outline, bars, mat, -Math.PI / 2),
    topCompressed: characteristicPoints(outline, bars, mat, Math.PI / 2),
  };
}
