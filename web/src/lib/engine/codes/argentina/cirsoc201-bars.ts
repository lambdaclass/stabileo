/**
 * From an area of steel to bars you could actually tie.
 *
 * ── Why an area is not an answer ───────────────────────────────────
 *
 * "As = 21.35 cm²" is a number, not a design. What a person needs to know
 * next is how many bars of what diameter, and whether they fit across the
 * face — and that last question is the one an area cannot answer. A 20 cm
 * web that needs 21 cm² can take 7 Ø20 by area and not by width.
 *
 * The workbook stops at areas for its column sheets, which is a real gap
 * rather than a decision worth copying: it prints coordinates for the bars it
 * assumed, so it knows the count, and leaves the diameter to the reader.
 * Reporting both, and saying when they do not fit, is the small thing this
 * calculator can add without changing any clause.
 *
 * ── What "fits" means ──────────────────────────────────────────────
 *
 * §25.2's clear spacing: at least the bar diameter, 25 mm, and 4/3 of the
 * aggregate size — the last of which this module does not know, so it takes
 * the first two and says so. That makes the check necessary and not
 * sufficient, which is the honest half: it will reject arrangements that
 * cannot work and it will not certify the ones that pass.
 */

import { REBAR_DB } from './cirsoc201';

export interface BarChoice {
  count: number;
  /** mm. */
  diameter: number;
  /** cm², what the bars actually give. */
  areaCm2: number;
  /** e.g. `4 Ø20`. */
  label: string;
  /**
   * Whether `count` bars of this diameter fit in one layer across `width`,
   * or null when no width was supplied.
   */
  fitsInOneLayer: boolean | null;
  /** Clear spacing the arrangement achieves, mm. Null when unchecked. */
  clearSpacingMm: number | null;
}

/** §25.2.1 for a beam: the bar, 25 mm, and (unknown here) 4/3 of the aggregate. */
function minClearSpacingMm(diameter: number): number {
  return Math.max(diameter, 25);
}

/**
 * The fewest, largest bars that cover `AsCm2`.
 *
 * Fewest-and-largest rather than smallest-diameter because that is what a
 * detailer reaches for: fewer bars is less congestion at the joints and less
 * to place. Where they do not fit, the caller is told rather than silently
 * given a smaller diameter — a design that does not fit is information.
 *
 * `minCount` exists for columns, where §10.9.2 wants at least four bars in a
 * rectangular tied arrangement whatever the area says.
 */
export function chooseBars(
  AsCm2: number,
  opts: { widthM?: number; coverM?: number; stirrupMm?: number; minCount?: number } = {},
): BarChoice {
  const minCount = opts.minCount ?? 2;
  const candidates: BarChoice[] = [];

  for (const bar of REBAR_DB) {
    if (bar.diameter < 10) continue; // not used as longitudinal steel
    const n = Math.max(Math.ceil(AsCm2 / bar.area), minCount);
    if (n > 24) continue; // past this it is a bundle problem, not a bar count

    let fits: boolean | null = null;
    let spacing: number | null = null;
    if (opts.widthM !== undefined && n > 1) {
      /*
       * The room between the outermost bar centres, minus the bars
       * themselves, shared out between the gaps.
       */
      const clearWidthMm =
        (opts.widthM - 2 * (opts.coverM ?? 0)) * 1000 - 2 * (opts.stirrupMm ?? 0) - n * bar.diameter;
      spacing = clearWidthMm / (n - 1);
      fits = spacing >= minClearSpacingMm(bar.diameter);
    }

    candidates.push({
      count: n,
      diameter: bar.diameter,
      areaCm2: n * bar.area,
      label: `${n} Ø${bar.diameter}`,
      fitsInOneLayer: fits,
      clearSpacingMm: spacing,
    });
  }

  if (candidates.length === 0) {
    const big = REBAR_DB[REBAR_DB.length - 1];
    const n = Math.max(Math.ceil(AsCm2 / big.area), minCount);
    return {
      count: n, diameter: big.diameter, areaCm2: n * big.area,
      label: `${n} Ø${big.diameter}`, fitsInOneLayer: false, clearSpacingMm: null,
    };
  }

  /*
   * Prefer an arrangement that fits. Among those, the fewest bars, and among
   * equals the smaller diameter — which is the one with more spare spacing.
   */
  candidates.sort((a, bq) => {
    const af = a.fitsInOneLayer === false ? 1 : 0;
    const bf = bq.fitsInOneLayer === false ? 1 : 0;
    return af - bf || a.count - bq.count || a.diameter - bq.diameter;
  });
  return candidates[0];
}

/**
 * The same, for a column whose bar COUNT is already fixed by the layout.
 *
 * A ring of twelve or a face of four is decided before the area is known —
 * the reader chose it — so the question is only which diameter covers the
 * share each bar carries. Rounding up per bar rather than in total, because
 * bars come in one size.
 *
 * ── When the count the reader chose cannot hold the steel ──────────
 *
 * The first version fell back to the largest bar and returned. On a 30×30
 * column needing 21.31 cm² over two levels that produced "2 Ø32 = 16.08 cm²"
 * — a proposal 25 % LIGHTER than the area printed directly above it, offered
 * without a word. A calculator that contradicts its own previous line is
 * worse than one that stops at areas, because the contradiction is quiet.
 *
 * So when Ø32 is not enough, the count goes up instead of the area going
 * down: the multiplier keeps the arrangement recognisable — a ring of 12
 * becomes a ring of 24, not an arbitrary 19 — and the invariant that matters
 * is restored, which is that `areaCm2 >= AstCm2`.
 */
export function chooseBarsForCount(AstCm2: number, count: number): BarChoice {
  const base = Math.max(count, 1);
  const largest = REBAR_DB[REBAR_DB.length - 1];

  /*
   * How many times the layout has to repeat before the largest bar covers a
   * share.
   *
   * Deliberately UNCAPPED. The first version stopped at eight multiples, on
   * the reasoning that past a few the answer is a bigger section — true, but
   * it made the cap silently break the one thing this function promises. A
   * section that needs an absurd count is already flagged `impossible` by
   * §10.9.1's 8 % ceiling, and that flag is what should be speaking; a
   * proposal that quietly comes up short says the opposite.
   */
  const multiple = Math.max(Math.ceil(AstCm2 / (base * largest.area)), 1);
  const n = base * multiple;

  const per = AstCm2 / n;
  const bar = REBAR_DB.find((r) => r.diameter >= 10 && r.area >= per) ?? largest;
  return {
    count: n,
    diameter: bar.diameter,
    areaCm2: n * bar.area,
    label: `${n} \u00d8${bar.diameter}`,
    fitsInOneLayer: null,
    clearSpacingMm: null,
  };
}

/**
 * FCR — two levels, so the count is a count of LEVELS.
 *
 * `twoLevels` returns two entries because the workbook's sheet models the
 * section as a level in tension and a level in compression, each carrying a
 * lumped area. Handing those two entries to `chooseBarsForCount` reads them
 * as two BARS, which is both wrong arithmetic and an illegal column: §10.9.2
 * wants at least four longitudinal bars in a rectangular tied arrangement.
 *
 * What a reader needs here is the per-level answer — how many bars across the
 * top face and across the bottom — so this sizes one level and reports it,
 * leaving the caller to say it applies to each.
 */
export function chooseBarsPerLevel(
  AsLevelCm2: number,
  opts: { widthM?: number; coverM?: number; stirrupMm?: number } = {},
): BarChoice {
  /* Two per level is the floor: two levels of two is §10.9.2's four. */
  return chooseBars(AsLevelCm2, { ...opts, minCount: 2 });
}
