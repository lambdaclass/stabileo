/**
 * en-unequal-angles.ts — unequal-leg angles, EN 10056-1 dimensions.
 *
 * Source: ArcelorMittal Orange Book, "Unequal leg angles - L, 1. Section properties -
 * Dimensions and properties" (S355 table), orangebook.arcelormittal.com/index.php/node/225,
 * read 2026-09-27. Transcribed: legs h × b, thickness t, root radius r (the toe radius is r/2
 * in the table, which is the rule the outline builder applies), mass, A, the second moments
 * about the leg-parallel axes and IT.
 *
 * `h` is the long leg, drawn vertical, so `iy` is about the axis parallel to the short leg.
 *
 * Units: dimensions mm, area cm², inertia cm⁴, mass kg/m.
 */
import type { SteelProfile } from './steel-profiles';

export const EN_L_UNEQUAL: SteelProfile[] = [
  { family: 'L', name: 'L 250x90x16', h: 250, b: 90, a: 52.1, iy: 3330, iz: 239, weight: 40.9, t: 16, r: 18, j: 47.9 },
  { family: 'L', name: 'L 250x90x14', h: 250, b: 90, a: 46, iy: 2950, iz: 214, weight: 36.1, t: 14, r: 18, j: 32.6 },
  { family: 'L', name: 'L 250x90x12', h: 250, b: 90, a: 39.7, iy: 2560, iz: 187, weight: 31.2, t: 12, r: 18, j: 20.9 },
  { family: 'L', name: 'L 200x100x16', h: 200, b: 100, a: 45.7, iy: 1860, iz: 316, weight: 35.9, t: 16, r: 15, j: 41.4 },
  { family: 'L', name: 'L 200x100x15', h: 200, b: 100, a: 43, iy: 1760, iz: 299, weight: 33.8, t: 15, r: 15, j: 34.3 },
  { family: 'L', name: 'L 200x100x14', h: 200, b: 100, a: 40.3, iy: 1650, iz: 282, weight: 31.6, t: 14, r: 15, j: 28.1 },
  { family: 'L', name: 'L 200x100x12', h: 200, b: 100, a: 34.8, iy: 1440, iz: 247, weight: 27.3, t: 12, r: 15, j: 18 },
  { family: 'L', name: 'L 200x100x10', h: 200, b: 100, a: 29.2, iy: 1220, iz: 210, weight: 23, t: 10, r: 15, j: 10.7 },
  { family: 'L', name: 'L 150x100x14', h: 150, b: 100, a: 33.2, iy: 744, iz: 265, weight: 26.1, t: 14, r: 12, j: 22.9 },
  { family: 'L', name: 'L 150x100x12', h: 150, b: 100, a: 28.7, iy: 651, iz: 233, weight: 22.5, t: 12, r: 12, j: 14.6 },
  { family: 'L', name: 'L 150x100x10', h: 150, b: 100, a: 24.2, iy: 553, iz: 199, weight: 19, t: 10, r: 12, j: 8.63 },
  { family: 'L', name: 'L 150x90x12', h: 150, b: 90, a: 27.5, iy: 627, iz: 171, weight: 21.6, t: 12, r: 12, j: 14.1 },
  { family: 'L', name: 'L 150x90x11', h: 150, b: 90, a: 25.3, iy: 581, iz: 159, weight: 19.9, t: 11, r: 12, j: 10.9 },
  { family: 'L', name: 'L 150x90x10', h: 150, b: 90, a: 23.2, iy: 533, iz: 146, weight: 18.2, t: 10, r: 12, j: 8.3 },
  { family: 'L', name: 'L 140x90x14', h: 140, b: 90, a: 30.4, iy: 592, iz: 191, weight: 23.8, t: 14, r: 11, j: 20.8 },
  { family: 'L', name: 'L 140x90x12', h: 140, b: 90, a: 26.3, iy: 518, iz: 168, weight: 20.6, t: 12, r: 11, j: 13.3 },
  { family: 'L', name: 'L 140x90x10', h: 140, b: 90, a: 22.1, iy: 441, iz: 144, weight: 17.4, t: 10, r: 11, j: 7.87 },
  { family: 'L', name: 'L 140x90x8', h: 140, b: 90, a: 17.9, iy: 360, iz: 118, weight: 14, t: 8, r: 11, j: 4.13 },
  { family: 'L', name: 'L 130x90x14', h: 130, b: 90, a: 29, iy: 481, iz: 188, weight: 22.8, t: 14, r: 11, j: 19.9 },
  { family: 'L', name: 'L 130x90x12', h: 130, b: 90, a: 25.1, iy: 420, iz: 164, weight: 19.7, t: 12, r: 11, j: 12.8 },
  { family: 'L', name: 'L 130x90x10', h: 130, b: 90, a: 21.2, iy: 360, iz: 142, weight: 16.6, t: 10, r: 11, j: 7.54 },
  { family: 'L', name: 'L 120x80x12', h: 120, b: 80, a: 22.7, iy: 323, iz: 114, weight: 17.8, t: 12, r: 11, j: 11.6 },
  { family: 'L', name: 'L 120x80x10', h: 120, b: 80, a: 19.1, iy: 276, iz: 98.1, weight: 15, t: 10, r: 11, j: 6.87 },
  { family: 'L', name: 'L 120x80x8', h: 120, b: 80, a: 15.5, iy: 226, iz: 80.8, weight: 12.2, t: 8, r: 11, j: 3.62 },
  { family: 'L', name: 'L 110x70x12', h: 110, b: 70, a: 20.3, iy: 242, iz: 75.5, weight: 15.9, t: 12, r: 10, j: 10.3 },
  { family: 'L', name: 'L 110x70x10', h: 110, b: 70, a: 17.1, iy: 207, iz: 65.1, weight: 13.4, t: 10, r: 10, j: 6.11 },
  { family: 'L', name: 'L 100x65x12', h: 100, b: 65, a: 18.5, iy: 180, iz: 59.1, weight: 14.5, t: 12, r: 10, j: 9.47 },
  { family: 'L', name: 'L 100x65x11', h: 100, b: 65, a: 17, iy: 167, iz: 55.1, weight: 13.4, t: 11, r: 10, j: 7.38 },
  { family: 'L', name: 'L 100x65x10', h: 100, b: 65, a: 15.6, iy: 154, iz: 51, weight: 12.3, t: 10, r: 10, j: 5.61 },
  { family: 'L', name: 'L 100x65x9', h: 100, b: 65, a: 14.1, iy: 141, iz: 46.7, weight: 11.1, t: 9, r: 10, j: 4.15 },
  { family: 'L', name: 'L 100x65x8', h: 100, b: 65, a: 12.7, iy: 127, iz: 42.2, weight: 9.94, t: 8, r: 10, j: 2.96 },
  { family: 'L', name: 'L 100x65x7', h: 100, b: 65, a: 11.2, iy: 113, iz: 37.6, weight: 8.77, t: 7, r: 10, j: 2.02 },
];
