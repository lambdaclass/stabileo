/**
 * iram-hp-m.ts — bearing-pile (HP) and lightweight (M) I-sections per
 * IRAM-IAS U 500-215-7 and -8, tabulated for CIRSOC 301-EL / 302-EL.
 *
 * Same shape and same caveat as the W series: parallel flanges with a root
 * fillet, dimensions marked nominal in the source, so the outline does not
 * reproduce the published properties exactly and the gap is declared per
 * profile. HP sits inside 1.3 %; M inside 2.2 %. M5x18.9's printed Iz (327)
 * was one its own dimensions do not support — the built outline is 11 % above
 * it, a hand check of two 127 x 10.6 mm flanges agrees with the outline, and
 * AISC v16.0 gives 362 cm⁴ — so the row carries AISC's value.
 *
 * The root radius is solved from the published clear web depth through
 * `hw = d - 2(tf + r)`, as for W — see iram-wf.ts for why that inversion is
 * sound and how it is corroborated.
 *
 * Units: dimensions mm, area cm2, inertia cm4, mass kg/m.
 */

import type { SteelProfile } from './steel-profiles';

/** Bearing piles — web and flange of equal thickness by design. */
export const IRAM_HP: SteelProfile[] = [
  { family: 'HP', name: 'HP14x117', h: 361, b: 378, a: 221.9, iy: 50780, iz: 18439, weight: 174.1, tw: 20.45, tf: 20.45, r: 17.05 },
  { family: 'HP', name: 'HP14x102', h: 356, b: 376, a: 193.5, iy: 43704, iz: 15817, weight: 151.8, tw: 17.91, tf: 17.91, r: 17.09 },
  { family: 'HP', name: 'HP14x89', h: 351, b: 373, a: 168.4, iy: 37627, iz: 13569, weight: 132.4, tw: 15.62, tf: 15.62, r: 16.88 },
  { family: 'HP', name: 'HP14x73', h: 346, b: 370, a: 138.1, iy: 30343, iz: 10864, weight: 108.6, tw: 12.83, tf: 12.83, r: 17.17 },
  { family: 'HP', name: 'HP12x84', h: 312, b: 312, a: 158.7, iy: 27055, iz: 8866, weight: 125, tw: 17.4, tf: 17.4, r: 18.1 },
  { family: 'HP', name: 'HP12x74', h: 308, b: 310, a: 140.6, iy: 23684, iz: 7742, weight: 110.1, tw: 15.37, tf: 15.49, r: 18.01 },
  { family: 'HP', name: 'HP12x63', h: 303, b: 308, a: 118.7, iy: 19646, iz: 6368, weight: 93.8, tw: 13.08, tf: 13.08, r: 17.92 },
  { family: 'HP', name: 'HP12x53', h: 299, b: 306, a: 100, iy: 16358, iz: 5286, weight: 78.9, tw: 11.05, tf: 11.05, r: 17.95 },
  { family: 'HP', name: 'HP10x57', h: 254, b: 260, a: 108.4, iy: 12237, iz: 4204, weight: 84.8, tw: 14.35, tf: 14.35, r: 15.65 },
  { family: 'HP', name: 'HP10x42', h: 246, b: 256, a: 80, iy: 8741, iz: 2984, weight: 62.5, tw: 10.54, tf: 10.67, r: 15.33 },
  { family: 'HP', name: 'HP8x36', h: 204, b: 207, a: 68.39, iy: 4953, iz: 1677, weight: 53.6, tw: 11.3, tf: 11.3, r: 12.7 },
];

/** Lightweight I-sections. */
export const IRAM_M: SteelProfile[] = [
  { family: 'M', name: 'M12x11,8', h: 303, b: 78, a: 22.45, iy: 2984, iz: 45.4, weight: 17.6, tw: 4.5, tf: 5.72, r: 6.78 },
  { family: 'M', name: 'M12x10,8', h: 301, b: 78, a: 20.65, iy: 2739, iz: 41.4, weight: 16.1, tw: 4.11, tf: 5.23, r: 7.27 },
  { family: 'M', name: 'M10x9', h: 250, b: 68, a: 17.23, iy: 1602, iz: 28, weight: 13.4, tw: 3.99, tf: 5.23, r: 7.27 },
  { family: 'M', name: 'M10x8', h: 249, b: 68, a: 15.35, iy: 1428, iz: 24.8, weight: 11.9, tw: 3.53, tf: 4.65, r: 7.85 },
  { family: 'M', name: 'M8x6,5', h: 199, b: 58, a: 12.39, iy: 753, iz: 15.4, weight: 9.67, tw: 3.38, tf: 4.72, r: 7.28 },
  // iz: the IRAM table prints 327, which its own dimensions do not support (the outline gives
  // 363) and the AISC Shapes Database v16.0 does not either (8.70 in⁴ = 362 cm⁴). Corrected to
  // AISC's value — two independent sources against one apparent misprint.
  { family: 'M', name: 'M5x18,9', h: 127, b: 127, a: 35.81, iy: 1003, iz: 362, weight: 28.1, tw: 8.03, tf: 10.6, r: 11.63 },
];
