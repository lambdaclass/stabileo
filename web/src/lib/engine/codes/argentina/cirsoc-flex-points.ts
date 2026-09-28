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

import { interactionCurve, sectionPoint, outlineRings, type Bar, type Outline, type Materials, type SectionPoint }
  from './cirsoc201-section';
import { EPSILON_TENSION_CONTROLLED, EPSILON_CU, yieldStrain } from './cirsoc201-basis';
import { refine } from './cirsoc-flex-surface';

/** Which named state on the diagram this is. `key` is an i18n key suffix. */
export type CharacteristicKey =
  /** φPn at 0,8 Po — the ceiling a column may be loaded to. */
  | 'axialCap'
  /** Zero strain in the steel furthest from the compressed edge. */
  | 'zeroStrain'
  /** That steel at its yield strain. */
  | 'yieldStrain'
  /** εt = 5 ‰, where φ has reached 0,90. */
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
  const nx = Math.cos(theta);
  const ny = Math.sin(theta);
  const top = Math.max(...outlineRings(outline).outer.map((p) => nx * p.x + ny * p.y));
  const dt = bars.length
    ? top - Math.min(...bars.map((b) => nx * b.x + ny * b.y))
    : 0;

  const state = (c: number) => sectionPoint(outline, bars, mat, theta, c);
  /* The sheet's sign: `sectionPoint` calls a compressed top a negative Mnx. */
  const at = (key: CharacteristicKey, p: SectionPoint): CharacteristicPoint => ({
    key, phiMn: -p.phiMnx, phiPn: p.phiPn, phi: p.phi, epsilonT: p.epsilonT,
  });

  const curve = interactionCurve(outline, bars, mat, theta, 120);
  /** Bracket a sign change of `f` along the curve and bisect it on c. */
  const solve = (f: (p: SectionPoint) => number): SectionPoint | null => {
    for (let i = 1; i < curve.length; i++) {
      const fa = f(curve[i - 1]);
      const fb = f(curve[i]);
      if (fa === 0) return curve[i - 1];
      if (fa * fb < 0) return refine(outline, bars, mat, theta, curve[i - 1].c, curve[i].c, f);
    }
    return null;
  };

  /*
   * The cap is a plateau — φPn is clamped over every axis deep enough — and
   * the moment on it grows as the axis rises. The sheet prints the widest
   * point, which is where the UNCAPPED φ·Pn comes down to the ceiling.
   */
  const phiPnMax = Math.max(...curve.map((p) => p.phiPn));
  const capPoint = solve((p) => p.phi * p.Pn - phiPnMax) ?? curve[0];

  const flexure = solve((p) => p.phiPn);
  /* Pure tension carries no moment: the sheet prints 0,00 and so does this. */
  const tension = state(1e-7);

  return [
    at('axialCap', capPoint),
    at('zeroStrain', state(dt)),
    at('yieldStrain', state((EPSILON_CU * dt) / (EPSILON_CU + yieldStrain(mat.fy)))),
    at('epsilon5', state((EPSILON_CU * dt) / (EPSILON_CU + EPSILON_TENSION_CONTROLLED))),
    flexure ? { ...at('pureFlexure', flexure), phiPn: 0 } : at('pureFlexure', tension),
    { ...at('maxTension', tension), phiMn: 0 },
  ];
}

/**
 * Both halves of the sheet's table: the bottom edge compressed, then the top.
 *
 * Each computed from its own edge. Mirroring one set into the other — as this
 * used to — is only true of a section symmetric about its bending axis, and
 * FCR-VERIF exists precisely to check sections that are not: five levels at
 * arbitrary heights.
 */
export function characteristicPointsBothEdges(
  outline: Outline, bars: readonly Bar[], mat: Materials,
): { bottomCompressed: CharacteristicPoint[]; topCompressed: CharacteristicPoint[] } {
  return {
    bottomCompressed: characteristicPoints(outline, bars, mat, -Math.PI / 2),
    topCompressed: characteristicPoints(outline, bars, mat, Math.PI / 2),
  };
}
