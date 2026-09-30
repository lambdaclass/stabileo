/**
 * en-hem.ts — HE M wide-flange sections, EN 10365:2017 dimensions.
 *
 * Source: ArcelorMittal Orange Book, "Wide flange beams - HE, 1. Section properties" (S355
 * table, Eurocode 3 UK edition), orangebook.arcelormittal.com/index.php/node/16, read
 * 2026-09-27. Every column below is transcribed, none is derived: h, b, tw, tf and the root
 * radius r give the outline; A, Iy, Iz and IT are the producer's values the outline is checked
 * against in `en-hem-angles.test.ts`.
 *
 * A second source was compared and rejected for this table: a mill datasheet listing HE 320 M
 * with tw = 12 mm, which its own mass contradicts (245 kg/m needs the 21 mm web). The producer's
 * table is internally consistent throughout.
 *
 * Units: dimensions mm, area cm², inertia cm⁴, mass kg/m.
 */
import type { SteelProfile } from './steel-profiles';

export const EN_HEM: SteelProfile[] = [
  { family: 'HEM', name: 'HEM 100', h: 120, b: 106, a: 53.2, iy: 1140, iz: 399, weight: 41.8, tw: 12, tf: 20, r: 12, j: 67.2 },
  { family: 'HEM', name: 'HEM 120', h: 140, b: 126, a: 66.4, iy: 2020, iz: 703, weight: 52.1, tw: 12.5, tf: 21, r: 12, j: 90.5 },
  { family: 'HEM', name: 'HEM 140', h: 160, b: 146, a: 80.6, iy: 3290, iz: 1140, weight: 63.2, tw: 13, tf: 22, r: 12, j: 119 },
  { family: 'HEM', name: 'HEM 160', h: 180, b: 166, a: 97.1, iy: 5100, iz: 1760, weight: 76.2, tw: 14, tf: 23, r: 15, j: 161 },
  { family: 'HEM', name: 'HEM 180', h: 200, b: 186, a: 113, iy: 7480, iz: 2580, weight: 88.9, tw: 14.5, tf: 24, r: 15, j: 201 },
  { family: 'HEM', name: 'HEM 200', h: 220, b: 206, a: 131, iy: 10600, iz: 3650, weight: 103, tw: 15, tf: 25, r: 18, j: 258 },
  { family: 'HEM', name: 'HEM 220', h: 240, b: 226, a: 149, iy: 14600, iz: 5010, weight: 117, tw: 15.5, tf: 26, r: 18, j: 313 },
  { family: 'HEM', name: 'HEM 240', h: 270, b: 248, a: 200, iy: 24300, iz: 8150, weight: 157, tw: 18, tf: 32, r: 21, j: 626 },
  { family: 'HEM', name: 'HEM 260', h: 290, b: 268, a: 220, iy: 31300, iz: 10400, weight: 172, tw: 18, tf: 32.5, r: 24, j: 720 },
  { family: 'HEM', name: 'HEM 280', h: 310, b: 288, a: 240, iy: 39600, iz: 13200, weight: 189, tw: 18.5, tf: 33, r: 24, j: 807 },
  { family: 'HEM', name: 'HEM 300', h: 340, b: 310, a: 303, iy: 59200, iz: 19400, weight: 238, tw: 21, tf: 39, r: 27, j: 1410 },
  { family: 'HEM', name: 'HEM 320', h: 359, b: 309, a: 312, iy: 68100, iz: 19700, weight: 245, tw: 21, tf: 40, r: 27, j: 1510 },
  { family: 'HEM', name: 'HEM 340', h: 377, b: 309, a: 316, iy: 76400, iz: 19700, weight: 248, tw: 21, tf: 40, r: 27, j: 1510 },
  { family: 'HEM', name: 'HEM 360', h: 395, b: 308, a: 319, iy: 84900, iz: 19500, weight: 250, tw: 21, tf: 40, r: 27, j: 1510 },
  { family: 'HEM', name: 'HEM 400', h: 432, b: 307, a: 326, iy: 104000, iz: 19300, weight: 256, tw: 21, tf: 40, r: 27, j: 1520 },
  { family: 'HEM', name: 'HEM 450', h: 478, b: 307, a: 335, iy: 132000, iz: 19300, weight: 263, tw: 21, tf: 40, r: 27, j: 1530 },
  { family: 'HEM', name: 'HEM 500', h: 524, b: 306, a: 344, iy: 162000, iz: 19200, weight: 270, tw: 21, tf: 40, r: 27, j: 1540 },
  { family: 'HEM', name: 'HEM 550', h: 572, b: 306, a: 354, iy: 198000, iz: 19200, weight: 278, tw: 21, tf: 40, r: 27, j: 1560 },
  { family: 'HEM', name: 'HEM 600', h: 620, b: 305, a: 364, iy: 237000, iz: 19000, weight: 285, tw: 21, tf: 40, r: 27, j: 1570 },
  { family: 'HEM', name: 'HEM 650', h: 668, b: 305, a: 374, iy: 282000, iz: 19000, weight: 293, tw: 21, tf: 40, r: 27, j: 1580 },
  { family: 'HEM', name: 'HEM 700', h: 716, b: 304, a: 383, iy: 329000, iz: 18800, weight: 301, tw: 21, tf: 40, r: 27, j: 1600 },
  { family: 'HEM', name: 'HEM 800', h: 814, b: 303, a: 404, iy: 443000, iz: 18600, weight: 317, tw: 21, tf: 40, r: 30, j: 1660 },
  { family: 'HEM', name: 'HEM 900', h: 910, b: 302, a: 424, iy: 570000, iz: 18400, weight: 333, tw: 21, tf: 40, r: 30, j: 1680 },
  { family: 'HEM', name: 'HEM 1000', h: 1008, b: 302, a: 444, iy: 722000, iz: 18500, weight: 349, tw: 21, tf: 40, r: 30, j: 1710 },
];
