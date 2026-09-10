/**
 * Where the workbook puts the bars, reproduced exactly.
 *
 * ── Why the layout is its own file ─────────────────────────────────
 *
 * `cirsoc201-section.ts` takes a list of bars and does not care how they got
 * there. That separation is what lets one engine serve every sheet — but it
 * means the sheets' own conventions have to live somewhere, and they are
 * conventions rather than physics: which face A1 is, whether the first bar
 * of a ring sits at the top, how four bars distribute across a face.
 *
 * Getting one of them wrong produces a section that is right in every clause
 * and wrong in its answer, so each is written down with the sheet it comes
 * from.
 *
 * Coordinates are metres from the section centroid, matching `Bar`.
 */

import type { Bar } from './cirsoc201-section';

/** Steel spread evenly over a list of positions. */
function spread(positions: Array<{ x: number; y: number }>, totalM2: number): Bar[] {
  const each = totalM2 / Math.max(positions.length, 1);
  return positions.map((p) => ({ ...p, area: each }));
}

/**
 * FCR — two levels, one in tension and one in compression.
 *
 * `ratio` is the sheet's `A's/As`, from 0 to 1: the compression steel as a
 * fraction of the tension steel. At 1 the section is symmetric, which is what
 * a column carrying reversible moment needs and what the sheet ships with.
 *
 * `dPrime` is measured to the bar CENTRE from the nearer face, which is the
 * sheet's `d'` and `d's` — it offers both because they can differ, and they
 * are the same number in every example it ships.
 */
export function twoLevels(
  h: number,
  dPrime: number,
  dPrimeS: number,
  AstCm2: number,
  ratio: number,
): Bar[] {
  /*
   * Ast is the TOTAL. With A's = ratio·As and As + A's = Ast, the tension
   * steel is Ast/(1+ratio) — solving for As rather than assuming a half
   * each, which is only right when ratio is 1.
   */
  const r = Math.max(0, Math.min(1, ratio));
  const AsT = (AstCm2 * 1e-4) / (1 + r);
  const AsC = AsT * r;
  return [
    { x: 0, y: -(h / 2 - dPrimeS), area: AsT },
    { x: 0, y: h / 2 - dPrime, area: AsC },
  ];
}

/**
 * FCR-VERIF — up to five levels at arbitrary heights.
 *
 * The sheet gives each level a distance from the section's BOTTOM face and an
 * area, and says the lowest level may not be empty. Distances arrive as the
 * sheet states them and are shifted to the centroid here, in one place,
 * because a caller doing it would be a second convention.
 */
export function levelsFromBottom(
  h: number,
  levels: ReadonlyArray<{ distanceFromBottom: number; areaCm2: number }>,
): Bar[] {
  return levels
    .filter((l) => l.areaCm2 > 0)
    .map((l) => ({ x: 0, y: l.distanceFromBottom - h / 2, area: l.areaCm2 * 1e-4 }));
}

/**
 * FCO — the A1 / A2 / A3 distribution.
 *
 * The sheet splits the steel between three positions by percentage and gives
 * each a bar count, up to twenty bars. Reading its published coordinates for
 * the shipped example tells us what the positions are:
 *
 *   A1  the BOTTOM face, bars spread across the width
 *   A2  the TOP face, the same
 *   A3  the two SIDE faces, between the corners
 *
 * Bars on a face are spread from corner to corner INCLUSIVE — the example's
 * four bars land at x = ±0.10 and ±0.0333 on a 0.30 section with 0.05 cover,
 * which is the corners plus two evenly between them, not four bars inset from
 * the corners. That detail is the difference between reproducing the sheet
 * and being three per cent off it.
 */
export function facesA1A2A3(
  b: number,
  h: number,
  dPrimeH: number,
  dPrimeV: number,
  AstCm2: number,
  pct: { a1: number; a2: number; a3: number },
  counts: { n1: number; n2: number; n3: number },
): Bar[] {
  const Ast = AstCm2 * 1e-4;
  const xEdge = b / 2 - dPrimeH;
  const yEdge = h / 2 - dPrimeV;

  /** n positions from `-edge` to `+edge`, both ends included. */
  const along = (edge: number, n: number): number[] => {
    if (n <= 0) return [];
    if (n === 1) return [0];
    return Array.from({ length: n }, (_, i) => -edge + (2 * edge * i) / (n - 1));
  };

  const bars: Bar[] = [];
  if (pct.a1 > 0 && counts.n1 > 0) {
    bars.push(...spread(along(xEdge, counts.n1).map((x) => ({ x, y: -yEdge })),
      (Ast * pct.a1) / 100));
  }
  if (pct.a2 > 0 && counts.n2 > 0) {
    bars.push(...spread(along(xEdge, counts.n2).map((x) => ({ x, y: yEdge })),
      (Ast * pct.a2) / 100));
  }
  if (pct.a3 > 0 && counts.n3 > 0) {
    /*
     * The sides, and the corners are NOT repeated — they already belong to
     * A1 and A2. So the interior positions only, which for n3 bars split
     * between two faces is n3/2 per side.
     */
    const perSide = Math.max(Math.floor(counts.n3 / 2), 1);
    const ys = along(yEdge, perSide + 2).slice(1, -1);
    const pos = [...ys.map((y) => ({ x: -xEdge, y })), ...ys.map((y) => ({ x: xEdge, y }))];
    bars.push(...spread(pos, (Ast * pct.a3) / 100));
  }
  return bars;
}

/**
 * FCR-CIR — a ring of bars.
 *
 * `barAtExtremeFibre` is the sheet's favourable/unfavourable switch, named
 * for what it DOES rather than for which of the two is better, because that
 * turned out not to be obvious.
 *
 *   true   a bar sits at the top and another at the bottom, so the extreme
 *          tension bar has the longest possible lever arm
 *   false  the ring is rotated half a division and straddles both extremes
 *
 * Physically the first needs slightly LESS steel — the opposite of what the
 * word "favourable" suggested to me, which is why the parameter no longer
 * uses it. Against the workbook's own circular example the two bracket its
 * published answer: 86.06 and 86.84 against 86.56, so with twelve bars the
 * whole question is worth 0.9 % and the sheet's convention cannot be pinned
 * down from one case. Both are offered, and neither is claimed to be theirs.
 */
export function ring(
  D: number,
  cover: number,
  barCount: number,
  AstCm2: number,
  barAtExtremeFibre = true,
): Bar[] {
  const Rs = D / 2 - cover;
  const n = Math.max(barCount, 1);
  const each = (AstCm2 * 1e-4) / n;
  const theta0 = barAtExtremeFibre ? 0 : Math.PI / n;
  return Array.from({ length: n }, (_, i) => {
    const a = theta0 + (2 * Math.PI * i) / n;
    return { x: Rs * Math.sin(a), y: Rs * Math.cos(a), area: each };
  });
}

/**
 * FSR / FST — flexural steel, tension at the bottom and optional compression
 * on top.
 *
 * A beam's tension steel is one layer at `d`, which is what the flexural
 * engine assumes when it puts all of it there. Drawn as one bar because the
 * calculation treats it as one: spreading it across the width would suggest
 * a precision about placement the method does not have.
 */
export function flexural(
  h: number,
  dPrimeS: number,
  AsCm2: number,
  dPrime = 0,
  AsCompCm2 = 0,
): Bar[] {
  const bars: Bar[] = [{ x: 0, y: -(h / 2 - dPrimeS), area: AsCm2 * 1e-4 }];
  if (AsCompCm2 > 0) bars.push({ x: 0, y: h / 2 - dPrime, area: AsCompCm2 * 1e-4 });
  return bars;
}
