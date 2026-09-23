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
 * Reading them off the curve rather than solving for each: the curve is already
 * built, scanning it costs nothing, and every point here is a named state ON it.
 * The cost is discretisation — "nearest grid point to εt = 5 ‰" is not the same
 * as "where εt = 5 ‰" — so the curve is sampled finely and the residual error
 * stays under the workbook's own printed precision.
 *
 * Pure: no store, no runes, no i18n. The names are keys.
 */

import { interactionCurve, type Bar, type Outline, type Materials, type SectionPoint }
  from './cirsoc201-section';
import { EPSILON_TENSION_CONTROLLED, yieldStrain } from './cirsoc201-basis';

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
  /** kN·m, signed for the edge in compression. */
  phiMn: number;
  /** kN. */
  phiPn: number;
  phi: number;
  /** Strain in the far steel at this point, for the reader who wants to check. */
  epsilonT: number;
}

/** The nearest point on the curve to a target, by any measure. */
function nearest(curve: SectionPoint[], cost: (p: SectionPoint) => number): SectionPoint {
  let best = curve[0];
  let bestCost = cost(best);
  for (const p of curve) {
    const c = cost(p);
    if (c < bestCost) { best = p; bestCost = c; }
  }
  return best;
}

/**
 * The six, for the edge the curve was built against.
 *
 * `nPoints` is generous on purpose: three of the six are "nearest to a strain",
 * and the grid spacing is the whole of their error.
 */
export function characteristicPoints(
  outline: Outline, bars: readonly Bar[], mat: Materials,
  theta = Math.PI / 2, nPoints = 400,
): CharacteristicPoint[] {
  const curve = interactionCurve(outline, bars, mat, theta, nPoints);
  const cap = (p: SectionPoint) => Math.hypot(p.phiMnx, p.phiMny);
  const signed = (p: SectionPoint) => (p.phiMnx < 0 ? -cap(p) : cap(p));
  const ey = yieldStrain(mat.fy);

  const at = (key: CharacteristicKey, p: SectionPoint): CharacteristicPoint => ({
    key, phiMn: signed(p), phiPn: p.phiPn, phi: p.phi, epsilonT: p.epsilonT,
  });

  const maxPhiPn = curve.reduce((m, p) => Math.max(m, p.phiPn), -Infinity);
  const minP = curve.reduce((m, p) => (p.phiPn < m.phiPn ? p : m), curve[0]);

  /*
   * ── Two of the six are a REGION, not a point ───────────────────
   *
   * The axial cap is a plateau: φPn is clamped at 0,8 φPo over every neutral
   * axis deep enough to compress the whole section, and those points differ
   * only in their moment. Taking "the point with the greatest φPn" therefore
   * lands anywhere on that plateau — at its far end, where Mn is zero. The
   * sheet prints the moment the section still carries AT the cap, which is the
   * largest of them.
   *
   * Zero strain in the far steel is the same shape of problem from the other
   * side. `sectionPoint` reports εt as `|min(εt, 0)|`, so every point with that
   * steel in compression reads exactly zero — a whole region again, and
   * "nearest to zero" matches all of it. The state the sheet names is the
   * BOUNDARY: the neutral axis passing through that steel, which is the
   * lightest of the points still reading zero.
   */
  const atCap = curve.filter((p) => p.phiPn >= maxPhiPn - 1e-6);
  const capPoint = atCap.reduce((m, p) => (cap(p) > cap(m) ? p : m), atCap[0]);
  const zeroStrainPoints = curve.filter((p) => p.epsilonT <= 1e-9);
  const zeroPoint = zeroStrainPoints.length
    ? zeroStrainPoints.reduce((m, p) => (p.phiPn < m.phiPn ? p : m), zeroStrainPoints[0])
    : nearest(curve, (p) => Math.abs(p.epsilonT));

  /*
   * Pure flexure is interpolated rather than picked. The sheet prints φPn =
   * 0,00 exactly, and the nearest grid point sits a couple of kN off — small,
   * but it is the one row where the axial value is a definition rather than a
   * measurement, and a table that prints 2,46 where the sheet prints 0,00
   * invites the reader to wonder which of the two is wrong.
   */
  const flexure = (): CharacteristicPoint => {
    for (let i = 1; i < curve.length; i++) {
      const A = curve[i - 1];
      const B = curve[i];
      if ((A.phiPn >= 0 && B.phiPn < 0) || (A.phiPn <= 0 && B.phiPn > 0)) {
        const t = A.phiPn / (A.phiPn - B.phiPn);
        const lerp = (a: number, b: number) => a + t * (b - a);
        const m = lerp(cap(A), cap(B));
        return {
          key: 'pureFlexure',
          phiMn: (signed(A) < 0 ? -1 : 1) * m,
          phiPn: 0,
          phi: lerp(A.phi, B.phi),
          epsilonT: lerp(A.epsilonT, B.epsilonT),
        };
      }
    }
    return at('pureFlexure', nearest(curve, (p) => Math.abs(p.phiPn)));
  };

  /*
   * The two strain-named states are interpolated for the same reason pure
   * flexure is: the sheet names them by an EXACT strain — the yield strain, and
   * 0,005 — so the nearest grid point is an approximation of a definition. At
   * 4,94 ‰ instead of 5,00 ‰ the φ ramp has not quite finished, and the table
   * printed 0,895 where the sheet prints 0,90. Landing on the strain the sheet
   * asks for makes the φ column exact rather than nearly right.
   */
  const atStrain = (key: CharacteristicKey, target: number): CharacteristicPoint => {
    for (let i = 1; i < curve.length; i++) {
      const A = curve[i - 1];
      const B = curve[i];
      if ((A.epsilonT - target) * (B.epsilonT - target) <= 0 && A.epsilonT !== B.epsilonT) {
        const t = (target - A.epsilonT) / (B.epsilonT - A.epsilonT);
        const lerp = (a: number, b: number) => a + t * (b - a);
        const m = lerp(cap(A), cap(B));
        return {
          key,
          phiMn: (signed(A) < 0 ? -1 : 1) * m,
          phiPn: lerp(A.phiPn, B.phiPn),
          phi: lerp(A.phi, B.phi),
          epsilonT: target,
        };
      }
    }
    return at(key, nearest(curve, (p) => Math.abs(p.epsilonT - target)));
  };

  return [
    at('axialCap', capPoint),
    at('zeroStrain', zeroPoint),
    atStrain('yieldStrain', ey),
    atStrain('epsilon5', EPSILON_TENSION_CONTROLLED),
    flexure(),
    /* Pure tension carries no moment: the sheet prints 0,00 and so does this. */
    { key: 'maxTension', phiMn: 0, phiPn: minP.phiPn, phi: minP.phi, epsilonT: minP.epsilonT },
  ];
}

/**
 * Both halves of the sheet's table: this edge compressed, then the other.
 *
 * The workbook prints the second set with every moment's sign flipped and the
 * axial column unchanged, because a symmetric section reaches the same states
 * whichever face is in compression. Mirroring rather than re-scanning says that
 * out loud, and cannot drift from the first set.
 */
export function characteristicPointsBothEdges(
  outline: Outline, bars: readonly Bar[], mat: Materials, nPoints = 400,
): { bottomCompressed: CharacteristicPoint[]; topCompressed: CharacteristicPoint[] } {
  const bottomCompressed = characteristicPoints(outline, bars, mat, Math.PI / 2, nPoints);
  return {
    bottomCompressed,
    topCompressed: bottomCompressed.map((p) => ({ ...p, phiMn: -p.phiMn })),
  };
}
