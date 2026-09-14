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
 *
 * ── When one layer is not enough ───────────────────────────────────
 *
 * A beam that needs more steel than fits across its web does not stop being
 * designable — it gets a second layer. That is ordinary detailing, and the
 * first version of this module did not know it: it kept cramming one layer
 * and reported arrangements with NEGATIVE clear spacing, bars overlapping in
 * a web too narrow to hold them, while still calling the design verified.
 *
 * Layers are not free. Steel in a second layer sits further from the tension
 * face, so the group's centroid moves up, `d` shrinks and the section is
 * worth less than the one-layer arithmetic promised. That feedback is why
 * the choice cannot be made after sizing and bolted on: `solveFlex` sizes,
 * lays the bars out, takes the centroid back as the new effective cover and
 * sizes again until the two agree.
 *
 * ── One place the old check was simply wrong ───────────────────────
 *
 * It took the cover to the bar CENTRE and then subtracted the stirrup
 * diameter again, as though the centre still had to clear it. The bar centre
 * is already inside the stirrup by construction. Double-counting it made
 * every arrangement look ~16 mm tighter than it is, which is what turned a
 * perfectly buildable 3 Ø32 into a failure.
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
  /** How many layers the bars are stacked in. 1 unless the width forced more. */
  layers?: number;
  /** Bars in each layer, counted from the tension face outward. */
  perLayer?: number[];
  /**
   * The bar group's centroid, measured from the tension FACE, in metres.
   * This is what `d` must be taken from — not the cover, once there is more
   * than one layer.
   */
  centroidFromFaceM?: number;
  /**
   * Whether the arrangement can be placed in the section at all: it fits
   * across the width in the layers it needs, and those layers fit within the
   * depth. `fitsInOneLayer` answers a narrower question and stays for the
   * callers that only care about congestion.
   */
  placeable?: boolean;
}

/**
 * How many bars of one diameter fit across a single layer.
 *
 * `coverToBarCentreM` is exactly what the panel collects (d′s), so the bar
 * centres span `width − 2·cover` and the only question is how finely that
 * span may be divided: centre-to-centre must be at least the bar plus its
 * required clear gap.
 */
export function barsPerLayer(
  widthM: number,
  coverToBarCentreM: number,
  diameter: number,
): number {
  const spanMm = (widthM - 2 * coverToBarCentreM) * 1000;
  if (spanMm <= 0) return 1;
  const pitch = diameter + minClearSpacingMm(diameter);
  return Math.max(1, Math.floor(spanMm / pitch) + 1);
}

/**
 * Stack `n` bars into layers of at most `perLayer`, fullest layer nearest the
 * tension face.
 *
 * Filling from the face is both what a detailer does and the arrangement with
 * the smallest centroid, so it is the one that keeps the most `d`.
 */
function stack(n: number, perLayer: number): number[] {
  const layers: number[] = [];
  let left = n;
  while (left > 0) {
    const take = Math.min(left, perLayer);
    layers.push(take);
    left -= take;
  }
  return layers;
}

/**
 * The centroid of a stack, from the tension face, in metres.
 *
 * Layers are spaced by the bar plus 25 mm of clear vertical gap — §25.2.2,
 * which also wants the upper bars directly above the lower ones, and that is
 * the arrangement assumed here.
 */
function stackCentroidM(
  perLayer: number[],
  coverToBarCentreM: number,
  diameter: number,
): number {
  const pitchM = (diameter + 25) / 1000;
  let moment = 0;
  let total = 0;
  perLayer.forEach((count, k) => {
    moment += count * (coverToBarCentreM + k * pitchM);
    total += count;
  });
  return total > 0 ? moment / total : coverToBarCentreM;
}

/** §25.2.1 for a beam: the bar, 25 mm, and (unknown here) 4/3 of the aggregate. */
function minClearSpacingMm(diameter: number): number {
  return Math.max(diameter, 25);
}

/**
 * The fewest, largest bars that cover `AsCm2`, in as few layers as it takes.
 *
 * Fewest-and-largest rather than smallest-diameter because that is what a
 * detailer reaches for: fewer bars is less congestion at the joints and less
 * to place. But a SECOND LAYER beats a tighter first one — three Ø25 in two
 * layers is buildable and four Ø32 jammed into a 20 cm web is not — so the
 * ordering puts layer count ahead of bar count.
 *
 * `minCount` exists for columns, where §10.9.2 wants at least four bars in a
 * rectangular tied arrangement whatever the area says.
 *
 * `maxLayers` bounds what counts as placeable. Two is the usual practical
 * limit in a beam and three is the most anyone details without asking for a
 * bigger section; past it the caller is told `placeable: false` rather than
 * handed a stack nobody would build.
 */
export function chooseBars(
  AsCm2: number,
  opts: {
    widthM?: number;
    /** Cover to the bar CENTRE (d′s), in metres — what the panel collects. */
    coverM?: number;
    minCount?: number;
    maxLayers?: number;
    /** Depth available for the stack, m. Bars may not run past the section. */
    heightM?: number;
  } = {},
): BarChoice {
  const minCount = opts.minCount ?? 2;
  const maxLayers = opts.maxLayers ?? 3;
  const candidates: BarChoice[] = [];

  for (const bar of REBAR_DB) {
    if (bar.diameter < 10) continue; // not used as longitudinal steel
    const n = Math.max(Math.ceil(AsCm2 / bar.area), minCount);
    if (n > 30) continue; // past this it is a bundle problem, not a bar count

    let perRow = n;
    let rows = [n];
    let centroid: number | undefined;
    let spacing: number | null = null;
    let fitsOne: boolean | null = null;
    let placeable = true;

    if (opts.widthM !== undefined && opts.coverM !== undefined) {
      perRow = barsPerLayer(opts.widthM, opts.coverM, bar.diameter);
      rows = stack(n, perRow);
      centroid = stackCentroidM(rows, opts.coverM, bar.diameter);
      fitsOne = rows.length === 1;

      /*
       * The spacing actually achieved in the fullest layer — the binding one.
       * With `perRow` computed from the same rule this is always at or above
       * the minimum, so it is reported as a fact rather than a verdict.
       */
      const widest = Math.max(...rows);
      const spanMm = (opts.widthM - 2 * opts.coverM) * 1000;
      spacing = widest > 1 ? spanMm / (widest - 1) - bar.diameter : spanMm;

      placeable = rows.length <= maxLayers;
      if (placeable && opts.heightM !== undefined) {
        /* The top layer's centre must still sit inside the section. */
        const topM = opts.coverM + (rows.length - 1) * ((bar.diameter + 25) / 1000);
        placeable = topM < opts.heightM / 2;
      }
    }

    candidates.push({
      count: n,
      diameter: bar.diameter,
      areaCm2: n * bar.area,
      label: rows.length > 1 ? `${n} \u00d8${bar.diameter} (${rows.join('+')})` : `${n} \u00d8${bar.diameter}`,
      fitsInOneLayer: fitsOne,
      clearSpacingMm: spacing,
      layers: rows.length,
      perLayer: rows,
      centroidFromFaceM: centroid,
      placeable,
    });
  }

  if (candidates.length === 0) {
    const big = REBAR_DB[REBAR_DB.length - 1];
    const n = Math.max(Math.ceil(AsCm2 / big.area), minCount);
    return {
      count: n, diameter: big.diameter, areaCm2: n * big.area,
      label: `${n} \u00d8${big.diameter}`, fitsInOneLayer: false, clearSpacingMm: null,
      layers: 1, perLayer: [n], placeable: false,
    };
  }

  /*
   * Placeable first — an arrangement that cannot be built is not a candidate
   * while one that can exists. Then the fewest LAYERS.
   *
   * Then, among arrangements with the same number of layers, the one whose
   * centroid sits CLOSEST to the tension face, because that is the one with
   * the most effective depth and therefore the most capacity per bar. On a
   * single layer every candidate has the same centroid, so this tiebreak
   * costs nothing there and the familiar fewest-and-largest rule still
   * decides — it only speaks where it matters.
   *
   * It matters more than it looks. In a 12 cm web, 3 Ø25 stacked 2+1 sit
   * 51 mm from the face and 2 Ø32 stacked 1+1 sit 63 mm: same two layers,
   * but the "fewer bars" answer throws away 12 mm of `d`.
   */
  candidates.sort((a, bq) => {
    const ap = a.placeable === false ? 1 : 0;
    const bp = bq.placeable === false ? 1 : 0;
    const ac = a.centroidFromFaceM ?? 0;
    const bc = bq.centroidFromFaceM ?? 0;
    return ap - bp
      || (a.layers ?? 1) - (bq.layers ?? 1)
      || (Math.abs(ac - bc) > 1e-6 ? ac - bc : 0)
      || a.count - bq.count
      || a.diameter - bq.diameter;
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
  opts: { widthM?: number; coverM?: number; heightM?: number } = {},
): BarChoice {
  /* Two per level is the floor: two levels of two is §10.9.2's four. */
  return chooseBars(AsLevelCm2, { ...opts, minCount: 2 });
}
