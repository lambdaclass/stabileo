// Standard European steel profile database
// Properties from Euronorm / manufacturer catalogs
// All dimensions in mm, areas in cm², moments of inertia in cm⁴, weight in kg/m

export type ProfileFamily = 'IPE' | 'IPN' | 'HEB' | 'HEA' | 'UPN' | 'L' | 'RHS' | 'CHS';

export type SectionShape = 'I' | 'H' | 'U' | 'L' | 'RHS' | 'CHS' | 'rect' | 'generic' | 'T' | 'invL' | 'C';

export interface SteelProfile {
  family: ProfileFamily;
  name: string;
  /** Total height (mm) */
  h: number;
  /** Flange width (mm) */
  b: number;
  /** Cross-sectional area (cm²) */
  a: number;
  /** Moment of inertia about Y-axis (horizontal) — Iy (cm⁴) */
  iy: number;
  /** Moment of inertia about Z-axis (vertical) — Iz (cm⁴) */
  iz: number;
  /** Weight per meter (kg/m) */
  weight: number;
  /** Web thickness (mm) — for I/H/U sections */
  tw?: number;
  /** Flange thickness (mm) — for I/H/U sections */
  tf?: number;
  /** Wall thickness (mm) — for RHS, CHS, L sections */
  t?: number;
}

// IPE profiles (European I-beams)
const IPE: SteelProfile[] = [
  { family: 'IPE', name: 'IPE 80',  h: 80,  b: 46,  a: 7.64,   iy: 80.1,    iz: 8.49,   weight: 6.0,   tw: 3.8, tf: 5.2 },
  { family: 'IPE', name: 'IPE 100', h: 100, b: 55,  a: 10.3,   iy: 171,     iz: 15.9,   weight: 8.1,   tw: 4.1, tf: 5.7 },
  { family: 'IPE', name: 'IPE 120', h: 120, b: 64,  a: 13.2,   iy: 318,     iz: 27.7,   weight: 10.4,  tw: 4.4, tf: 6.3 },
  { family: 'IPE', name: 'IPE 140', h: 140, b: 73,  a: 16.4,   iy: 541,     iz: 44.9,   weight: 12.9,  tw: 4.7, tf: 6.9 },
  { family: 'IPE', name: 'IPE 160', h: 160, b: 82,  a: 20.1,   iy: 869,     iz: 68.3,   weight: 15.8,  tw: 5.0, tf: 7.4 },
  { family: 'IPE', name: 'IPE 180', h: 180, b: 91,  a: 23.9,   iy: 1317,    iz: 101,    weight: 18.8,  tw: 5.3, tf: 8.0 },
  { family: 'IPE', name: 'IPE 200', h: 200, b: 100, a: 28.5,   iy: 1943,    iz: 142,    weight: 22.4,  tw: 5.6, tf: 8.5 },
  { family: 'IPE', name: 'IPE 220', h: 220, b: 110, a: 33.4,   iy: 2772,    iz: 205,    weight: 26.2,  tw: 5.9, tf: 9.2 },
  { family: 'IPE', name: 'IPE 240', h: 240, b: 120, a: 39.1,   iy: 3892,    iz: 284,    weight: 30.7,  tw: 6.2, tf: 9.8 },
  { family: 'IPE', name: 'IPE 270', h: 270, b: 135, a: 45.9,   iy: 5790,    iz: 420,    weight: 36.1,  tw: 6.6, tf: 10.2 },
  { family: 'IPE', name: 'IPE 300', h: 300, b: 150, a: 53.8,   iy: 8356,    iz: 604,    weight: 42.2,  tw: 7.1, tf: 10.7 },
  { family: 'IPE', name: 'IPE 330', h: 330, b: 160, a: 62.6,   iy: 11770,   iz: 788,    weight: 49.1,  tw: 7.5, tf: 11.5 },
  { family: 'IPE', name: 'IPE 360', h: 360, b: 170, a: 72.7,   iy: 16270,   iz: 1043,   weight: 57.1,  tw: 8.0, tf: 12.7 },
  { family: 'IPE', name: 'IPE 400', h: 400, b: 180, a: 84.5,   iy: 23130,   iz: 1318,   weight: 66.3,  tw: 8.6, tf: 13.5 },
  { family: 'IPE', name: 'IPE 450', h: 450, b: 190, a: 98.8,   iy: 33740,   iz: 1676,   weight: 77.6,  tw: 9.4, tf: 14.6 },
  { family: 'IPE', name: 'IPE 500', h: 500, b: 200, a: 116,    iy: 48200,   iz: 2142,   weight: 90.7,  tw: 10.2, tf: 16.0 },
  { family: 'IPE', name: 'IPE 550', h: 550, b: 210, a: 134,    iy: 67120,   iz: 2668,   weight: 106,   tw: 11.1, tf: 17.2 },
  { family: 'IPE', name: 'IPE 600', h: 600, b: 220, a: 156,    iy: 92080,   iz: 3387,   weight: 122,   tw: 12.0, tf: 19.0 },
];

// IPN profiles (European standard I-beams with tapered flanges, DIN 1025-1)
const IPN: SteelProfile[] = [
  { family: 'IPN', name: 'IPN 80',  h: 80,  b: 42,  a: 7.57,  iy: 77.8,    iz: 6.29,   weight: 5.94,  tw: 3.9, tf: 5.9 },
  { family: 'IPN', name: 'IPN 100', h: 100, b: 50,  a: 10.6,  iy: 171,     iz: 12.2,   weight: 8.34,  tw: 4.5, tf: 6.8 },
  { family: 'IPN', name: 'IPN 120', h: 120, b: 58,  a: 14.2,  iy: 328,     iz: 21.5,   weight: 11.1,  tw: 5.1, tf: 7.7 },
  { family: 'IPN', name: 'IPN 140', h: 140, b: 66,  a: 18.2,  iy: 573,     iz: 35.2,   weight: 14.3,  tw: 5.7, tf: 8.6 },
  { family: 'IPN', name: 'IPN 160', h: 160, b: 74,  a: 22.8,  iy: 935,     iz: 54.7,   weight: 17.9,  tw: 6.3, tf: 9.5 },
  { family: 'IPN', name: 'IPN 180', h: 180, b: 82,  a: 27.9,  iy: 1450,    iz: 81.3,   weight: 21.9,  tw: 6.9, tf: 10.4 },
  { family: 'IPN', name: 'IPN 200', h: 200, b: 90,  a: 33.4,  iy: 2140,    iz: 117,    weight: 26.2,  tw: 7.5, tf: 11.3 },
  { family: 'IPN', name: 'IPN 220', h: 220, b: 98,  a: 39.5,  iy: 3060,    iz: 162,    weight: 31.1,  tw: 8.1, tf: 12.2 },
  { family: 'IPN', name: 'IPN 240', h: 240, b: 106, a: 46.1,  iy: 4250,    iz: 221,    weight: 36.2,  tw: 8.7, tf: 13.1 },
  { family: 'IPN', name: 'IPN 260', h: 260, b: 113, a: 53.3,  iy: 5740,    iz: 288,    weight: 41.9,  tw: 9.4, tf: 14.1 },
  { family: 'IPN', name: 'IPN 280', h: 280, b: 119, a: 61.0,  iy: 7590,    iz: 364,    weight: 47.9,  tw: 10.1, tf: 15.2 },
  { family: 'IPN', name: 'IPN 300', h: 300, b: 125, a: 69.0,  iy: 9800,    iz: 451,    weight: 54.2,  tw: 10.8, tf: 16.2 },
  { family: 'IPN', name: 'IPN 320', h: 320, b: 131, a: 77.7,  iy: 12510,   iz: 555,    weight: 61.0,  tw: 11.5, tf: 17.3 },
  { family: 'IPN', name: 'IPN 340', h: 340, b: 137, a: 86.7,  iy: 15700,   iz: 674,    weight: 68.0,  tw: 12.2, tf: 18.3 },
  { family: 'IPN', name: 'IPN 360', h: 360, b: 143, a: 97.0,  iy: 19610,   iz: 818,    weight: 76.1,  tw: 13.0, tf: 19.5 },
  { family: 'IPN', name: 'IPN 380', h: 380, b: 149, a: 107,   iy: 24010,   iz: 975,    weight: 84.0,  tw: 13.7, tf: 20.5 },
  { family: 'IPN', name: 'IPN 400', h: 400, b: 155, a: 118,   iy: 29210,   iz: 1160,   weight: 92.4,  tw: 14.4, tf: 21.6 },
  { family: 'IPN', name: 'IPN 450', h: 450, b: 170, a: 147,   iy: 45850,   iz: 1730,   weight: 115,   tw: 16.2, tf: 24.3 },
  { family: 'IPN', name: 'IPN 500', h: 500, b: 185, a: 179,   iy: 68740,   iz: 2480,   weight: 141,   tw: 18.0, tf: 27.0 },
  { family: 'IPN', name: 'IPN 550', h: 550, b: 200, a: 212,   iy: 99180,   iz: 3490,   weight: 166,   tw: 19.0, tf: 30.0 },
  { family: 'IPN', name: 'IPN 600', h: 600, b: 215, a: 254,   iy: 139000,  iz: 4670,   weight: 199,   tw: 21.6, tf: 32.4 },
];

// HEB profiles (European wide-flange H-beams)
const HEB: SteelProfile[] = [
  { family: 'HEB', name: 'HEB 100', h: 100, b: 100, a: 26.0,  iy: 450,     iz: 167,    weight: 20.4,  tw: 6.0, tf: 10.0 },
  { family: 'HEB', name: 'HEB 120', h: 120, b: 120, a: 34.0,  iy: 864,     iz: 318,    weight: 26.7,  tw: 6.5, tf: 11.0 },
  { family: 'HEB', name: 'HEB 140', h: 140, b: 140, a: 43.0,  iy: 1509,    iz: 550,    weight: 33.7,  tw: 7.0, tf: 12.0 },
  { family: 'HEB', name: 'HEB 160', h: 160, b: 160, a: 54.3,  iy: 2492,    iz: 889,    weight: 42.6,  tw: 8.0, tf: 13.0 },
  { family: 'HEB', name: 'HEB 180', h: 180, b: 180, a: 65.3,  iy: 3831,    iz: 1363,   weight: 51.2,  tw: 8.5, tf: 14.0 },
  { family: 'HEB', name: 'HEB 200', h: 200, b: 200, a: 78.1,  iy: 5696,    iz: 2003,   weight: 61.3,  tw: 9.0, tf: 15.0 },
  { family: 'HEB', name: 'HEB 220', h: 220, b: 220, a: 91.0,  iy: 8091,    iz: 2843,   weight: 71.5,  tw: 9.5, tf: 16.0 },
  { family: 'HEB', name: 'HEB 240', h: 240, b: 240, a: 106,   iy: 11260,   iz: 3923,   weight: 83.2,  tw: 10.0, tf: 17.0 },
  { family: 'HEB', name: 'HEB 260', h: 260, b: 260, a: 118,   iy: 14920,   iz: 5135,   weight: 93.0,  tw: 10.0, tf: 17.5 },
  { family: 'HEB', name: 'HEB 280', h: 280, b: 280, a: 131,   iy: 19270,   iz: 6595,   weight: 103,   tw: 10.5, tf: 18.0 },
  { family: 'HEB', name: 'HEB 300', h: 300, b: 300, a: 149,   iy: 25170,   iz: 8563,   weight: 117,   tw: 11.0, tf: 19.0 },
  { family: 'HEB', name: 'HEB 320', h: 320, b: 300, a: 161,   iy: 30820,   iz: 9239,   weight: 127,   tw: 11.5, tf: 20.5 },
  { family: 'HEB', name: 'HEB 340', h: 340, b: 300, a: 171,   iy: 36660,   iz: 9690,   weight: 134,   tw: 12.0, tf: 21.5 },
  { family: 'HEB', name: 'HEB 360', h: 360, b: 300, a: 181,   iy: 43190,   iz: 10140,  weight: 142,   tw: 12.5, tf: 22.5 },
  { family: 'HEB', name: 'HEB 400', h: 400, b: 300, a: 198,   iy: 57680,   iz: 10820,  weight: 155,   tw: 13.5, tf: 24.0 },
  { family: 'HEB', name: 'HEB 450', h: 450, b: 300, a: 218,   iy: 79890,   iz: 11720,  weight: 171,   tw: 14.0, tf: 26.0 },
  { family: 'HEB', name: 'HEB 500', h: 500, b: 300, a: 239,   iy: 107200,  iz: 12620,  weight: 187,   tw: 14.5, tf: 28.0 },
  { family: 'HEB', name: 'HEB 550', h: 550, b: 300, a: 254,   iy: 136700,  iz: 13080,  weight: 199,   tw: 15.0, tf: 29.0 },
  { family: 'HEB', name: 'HEB 600', h: 600, b: 300, a: 270,   iy: 171000,  iz: 13530,  weight: 212,   tw: 15.5, tf: 30.0 },
];

// HEA profiles (European wide-flange H-beams, light series)
const HEA: SteelProfile[] = [
  { family: 'HEA', name: 'HEA 100', h: 96,  b: 100, a: 21.2,  iy: 349,     iz: 134,    weight: 16.7,  tw: 5.0, tf: 8.0 },
  { family: 'HEA', name: 'HEA 120', h: 114, b: 120, a: 25.3,  iy: 606,     iz: 231,    weight: 19.9,  tw: 5.0, tf: 8.0 },
  { family: 'HEA', name: 'HEA 140', h: 133, b: 140, a: 31.4,  iy: 1033,    iz: 389,    weight: 24.7,  tw: 5.5, tf: 8.5 },
  { family: 'HEA', name: 'HEA 160', h: 152, b: 160, a: 38.8,  iy: 1673,    iz: 616,    weight: 30.4,  tw: 6.0, tf: 9.0 },
  { family: 'HEA', name: 'HEA 180', h: 171, b: 180, a: 45.3,  iy: 2510,    iz: 925,    weight: 35.5,  tw: 6.0, tf: 9.5 },
  { family: 'HEA', name: 'HEA 200', h: 190, b: 200, a: 53.8,  iy: 3692,    iz: 1336,   weight: 42.3,  tw: 6.5, tf: 10.0 },
  { family: 'HEA', name: 'HEA 220', h: 210, b: 220, a: 64.3,  iy: 5410,    iz: 1955,   weight: 50.5,  tw: 7.0, tf: 11.0 },
  { family: 'HEA', name: 'HEA 240', h: 230, b: 240, a: 76.8,  iy: 7763,    iz: 2769,   weight: 60.3,  tw: 7.5, tf: 12.0 },
  { family: 'HEA', name: 'HEA 260', h: 250, b: 260, a: 86.8,  iy: 10450,   iz: 3668,   weight: 68.2,  tw: 7.5, tf: 12.5 },
  { family: 'HEA', name: 'HEA 280', h: 270, b: 280, a: 97.3,  iy: 13670,   iz: 4763,   weight: 76.4,  tw: 8.0, tf: 13.0 },
  { family: 'HEA', name: 'HEA 300', h: 290, b: 300, a: 113,   iy: 18260,   iz: 6310,   weight: 88.3,  tw: 8.5, tf: 14.0 },
  { family: 'HEA', name: 'HEA 320', h: 310, b: 300, a: 124,   iy: 22930,   iz: 6985,   weight: 97.6,  tw: 9.0, tf: 15.5 },
  { family: 'HEA', name: 'HEA 340', h: 330, b: 300, a: 133,   iy: 27690,   iz: 7436,   weight: 105,   tw: 9.5, tf: 16.5 },
  { family: 'HEA', name: 'HEA 360', h: 350, b: 300, a: 143,   iy: 33090,   iz: 7887,   weight: 112,   tw: 10.0, tf: 17.5 },
  { family: 'HEA', name: 'HEA 400', h: 390, b: 300, a: 159,   iy: 45070,   iz: 8564,   weight: 125,   tw: 11.0, tf: 19.0 },
  { family: 'HEA', name: 'HEA 450', h: 440, b: 300, a: 178,   iy: 63720,   iz: 9465,   weight: 140,   tw: 11.5, tf: 21.0 },
  { family: 'HEA', name: 'HEA 500', h: 490, b: 300, a: 198,   iy: 86970,   iz: 10370,  weight: 155,   tw: 12.0, tf: 23.0 },
  { family: 'HEA', name: 'HEA 550', h: 540, b: 300, a: 212,   iy: 111900,  iz: 10820,  weight: 166,   tw: 12.5, tf: 24.0 },
  { family: 'HEA', name: 'HEA 600', h: 590, b: 300, a: 226,   iy: 141200,  iz: 11270,  weight: 178,   tw: 13.0, tf: 25.0 },
];

// UPN profiles (European U-channels)
const UPN: SteelProfile[] = [
  { family: 'UPN', name: 'UPN 80',  h: 80,  b: 45,  a: 11.0,  iy: 106,     iz: 19.4,   weight: 8.64,  tw: 6.0, tf: 8.0 },
  { family: 'UPN', name: 'UPN 100', h: 100, b: 50,  a: 13.5,  iy: 206,     iz: 29.3,   weight: 10.6,  tw: 6.0, tf: 8.5 },
  { family: 'UPN', name: 'UPN 120', h: 120, b: 55,  a: 17.0,  iy: 364,     iz: 43.2,   weight: 13.4,  tw: 7.0, tf: 9.0 },
  { family: 'UPN', name: 'UPN 140', h: 140, b: 60,  a: 20.4,  iy: 605,     iz: 62.7,   weight: 16.0,  tw: 7.0, tf: 10.0 },
  { family: 'UPN', name: 'UPN 160', h: 160, b: 65,  a: 24.0,  iy: 925,     iz: 85.3,   weight: 18.8,  tw: 7.5, tf: 10.5 },
  { family: 'UPN', name: 'UPN 180', h: 180, b: 70,  a: 28.0,  iy: 1350,    iz: 114,    weight: 22.0,  tw: 8.0, tf: 11.0 },
  { family: 'UPN', name: 'UPN 200', h: 200, b: 75,  a: 32.2,  iy: 1910,    iz: 148,    weight: 25.3,  tw: 8.5, tf: 11.5 },
  { family: 'UPN', name: 'UPN 220', h: 220, b: 80,  a: 37.4,  iy: 2690,    iz: 197,    weight: 29.4,  tw: 9.0, tf: 12.5 },
  { family: 'UPN', name: 'UPN 240', h: 240, b: 85,  a: 42.3,  iy: 3600,    iz: 248,    weight: 33.2,  tw: 9.5, tf: 13.0 },
  { family: 'UPN', name: 'UPN 260', h: 260, b: 90,  a: 48.3,  iy: 4820,    iz: 317,    weight: 37.9,  tw: 10.0, tf: 14.0 },
  { family: 'UPN', name: 'UPN 280', h: 280, b: 95,  a: 53.3,  iy: 6280,    iz: 399,    weight: 41.8,  tw: 10.0, tf: 15.0 },
  { family: 'UPN', name: 'UPN 300', h: 300, b: 100, a: 58.8,  iy: 8030,    iz: 495,    weight: 46.2,  tw: 10.0, tf: 16.0 },
];

// L profiles (Equal-leg angles)
const L: SteelProfile[] = [
  { family: 'L', name: 'L 30x30x3',  h: 30,  b: 30,  a: 1.74,  iy: 1.60,   iz: 1.60,   weight: 1.36, t: 3 },
  { family: 'L', name: 'L 40x40x4',  h: 40,  b: 40,  a: 3.08,  iy: 5.05,   iz: 5.05,   weight: 2.42, t: 4 },
  { family: 'L', name: 'L 50x50x5',  h: 50,  b: 50,  a: 4.80,  iy: 12.2,   iz: 12.2,   weight: 3.77, t: 5 },
  { family: 'L', name: 'L 60x60x6',  h: 60,  b: 60,  a: 6.91,  iy: 25.3,   iz: 25.3,   weight: 5.42, t: 6 },
  { family: 'L', name: 'L 70x70x7',  h: 70,  b: 70,  a: 9.40,  iy: 46.8,   iz: 46.8,   weight: 7.38, t: 7 },
  { family: 'L', name: 'L 80x80x8',  h: 80,  b: 80,  a: 12.3,  iy: 80.0,   iz: 80.0,   weight: 9.63, t: 8 },
  { family: 'L', name: 'L 90x90x9',  h: 90,  b: 90,  a: 15.5,  iy: 127,    iz: 127,    weight: 12.2, t: 9 },
  { family: 'L', name: 'L 100x100x10', h: 100, b: 100, a: 19.2, iy: 193,   iz: 193,    weight: 15.0, t: 10 },
  { family: 'L', name: 'L 120x120x12', h: 120, b: 120, a: 27.5, iy: 400,   iz: 400,    weight: 21.6, t: 12 },
  { family: 'L', name: 'L 150x150x15', h: 150, b: 150, a: 43.0, iy: 985,   iz: 985,    weight: 33.8, t: 15 },
];

// RHS profiles (Rectangular Hollow Sections)
const RHS: SteelProfile[] = [
  { family: 'RHS', name: 'RHS 60x40x3',   h: 60,  b: 40,  a: 5.41, iy: 24.9,  iz: 13.3,  weight: 4.25, t: 3 },
  { family: 'RHS', name: 'RHS 80x40x3',   h: 80,  b: 40,  a: 6.61, iy: 52.7,  iz: 18.0,  weight: 5.19, t: 3 },
  { family: 'RHS', name: 'RHS 100x50x4',  h: 100, b: 50,  a: 10.9, iy: 138,   iz: 48.5,  weight: 8.59, t: 4 },
  { family: 'RHS', name: 'RHS 100x60x4',  h: 100, b: 60,  a: 11.7, iy: 152,   iz: 70.2,  weight: 9.22, t: 4 },
  { family: 'RHS', name: 'RHS 120x60x4',  h: 120, b: 60,  a: 13.3, iy: 239,   iz: 82.7,  weight: 10.5, t: 4 },
  { family: 'RHS', name: 'RHS 120x80x5',  h: 120, b: 80,  a: 18.4, iy: 355,   iz: 190,   weight: 14.4, t: 5 },
  { family: 'RHS', name: 'RHS 150x100x5', h: 150, b: 100, a: 23.4, iy: 700,   iz: 381,   weight: 18.4, t: 5 },
  { family: 'RHS', name: 'RHS 160x80x5',  h: 160, b: 80,  a: 22.4, iy: 718,   iz: 244,   weight: 17.6, t: 5 },
  { family: 'RHS', name: 'RHS 200x100x6', h: 200, b: 100, a: 33.4, iy: 1590,  iz: 555,   weight: 26.2, t: 6 },
  { family: 'RHS', name: 'RHS 200x120x6', h: 200, b: 120, a: 36.4, iy: 1760,  iz: 823,   weight: 28.6, t: 6 },
  { family: 'RHS', name: 'RHS 250x150x8', h: 250, b: 150, a: 59.2, iy: 4680,  iz: 2150,  weight: 46.5, t: 8 },
  { family: 'RHS', name: 'RHS 300x200x10',h: 300, b: 200, a: 93.3, iy: 11400, iz: 6120,  weight: 73.2, t: 10 },
];

// CHS profiles (Circular Hollow Sections)
const CHS: SteelProfile[] = [
  { family: 'CHS', name: 'CHS 42.4x3.2',  h: 42.4,  b: 42.4,  a: 3.93, iy: 8.05,   iz: 8.05,   weight: 3.09, t: 3.2 },
  { family: 'CHS', name: 'CHS 48.3x3.2',  h: 48.3,  b: 48.3,  a: 4.53, iy: 12.3,   iz: 12.3,   weight: 3.56, t: 3.2 },
  { family: 'CHS', name: 'CHS 60.3x3.6',  h: 60.3,  b: 60.3,  a: 6.41, iy: 27.0,   iz: 27.0,   weight: 5.03, t: 3.6 },
  { family: 'CHS', name: 'CHS 76.1x4',    h: 76.1,  b: 76.1,  a: 9.06, iy: 59.9,   iz: 59.9,   weight: 7.11, t: 4 },
  { family: 'CHS', name: 'CHS 88.9x4',    h: 88.9,  b: 88.9,  a: 10.7, iy: 97.8,   iz: 97.8,   weight: 8.38, t: 4 },
  { family: 'CHS', name: 'CHS 101.6x5',   h: 101.6, b: 101.6, a: 15.2, iy: 178,    iz: 178,    weight: 11.9, t: 5 },
  { family: 'CHS', name: 'CHS 114.3x5',   h: 114.3, b: 114.3, a: 17.2, iy: 257,    iz: 257,    weight: 13.5, t: 5 },
  { family: 'CHS', name: 'CHS 139.7x6',   h: 139.7, b: 139.7, a: 25.2, iy: 564,    iz: 564,    weight: 19.8, t: 6 },
  { family: 'CHS', name: 'CHS 168.3x6',   h: 168.3, b: 168.3, a: 30.6, iy: 1004,   iz: 1004,   weight: 24.0, t: 6 },
  { family: 'CHS', name: 'CHS 193.7x8',   h: 193.7, b: 193.7, a: 46.6, iy: 2039,   iz: 2039,   weight: 36.6, t: 8 },
  { family: 'CHS', name: 'CHS 219.1x8',   h: 219.1, b: 219.1, a: 53.0, iy: 2951,   iz: 2951,   weight: 41.6, t: 8 },
  { family: 'CHS', name: 'CHS 273x10',    h: 273,   b: 273,   a: 82.6, iy: 7122,   iz: 7122,   weight: 64.9, t: 10 },
];

/** All profiles indexed by family */
export const PROFILE_FAMILIES: Record<ProfileFamily, SteelProfile[]> = {
  IPE, IPN, HEB, HEA, UPN, L, RHS, CHS,
};

/** All families available */
export const FAMILY_LIST: ProfileFamily[] = ['IPN', 'IPE', 'HEB', 'HEA', 'UPN', 'L', 'RHS', 'CHS'];

/** All profiles flat list */
export const ALL_PROFILES: SteelProfile[] = [
  ...IPE, ...IPN, ...HEB, ...HEA, ...UPN, ...L, ...RHS, ...CHS,
];

/** Map from ProfileFamily to SectionShape */
export function familyToShape(family: ProfileFamily): SectionShape {
  switch (family) {
    case 'IPE': return 'I';
    case 'IPN': return 'I';
    case 'HEB': return 'H';
    case 'HEA': return 'I';
    case 'UPN': return 'U';
    case 'L': return 'L';
    case 'RHS': return 'RHS';
    case 'CHS': return 'CHS';
  }
}

/**
 * Search profiles by query string (matches against name) and optional family filter.
 */
export function searchProfiles(query: string, family?: ProfileFamily): SteelProfile[] {
  const source = family ? PROFILE_FAMILIES[family] : ALL_PROFILES;
  if (!query.trim()) return source;

  const q = query.trim().toLowerCase();
  return source.filter(p => p.name.toLowerCase().includes(q));
}

/**
 * Convert profile to model-compatible section properties.
 * Returns values in SI units: area in m², inertias in m⁴, h and b in m.
 * iy = about Y (horizontal), iz = about Z (vertical).
 */
export function profileToSection(p: SteelProfile): { a: number; iy: number; iz: number; b: number; h: number } {
  return {
    a: p.a * 1e-4,        // cm² → m²
    iy: p.iy * 1e-8,      // cm⁴ → m⁴ — about Y (horizontal)
    iz: p.iz * 1e-8,      // cm⁴ → m⁴ — about Z (vertical)
    b: p.b * 1e-3,        // mm → m
    h: p.h * 1e-3,        // mm → m
  };
}

/**
 * Convert profile to extended section properties including shape and thickness data.
 * iy = about Y (horizontal), iz = about Z (vertical).
 */
export function profileToSectionFull(p: SteelProfile): {
  a: number; iy: number; iz: number; j?: number; b: number; h: number;
  shape: SectionShape;
  tw?: number; tf?: number; t?: number;
} {
  return {
    ...profileToSection(p),
    shape: familyToShape(p.family),
    tw: p.tw ? p.tw * 1e-3 : undefined,   // mm → m
    tf: p.tf ? p.tf * 1e-3 : undefined,   // mm → m
    t: p.t ? p.t * 1e-3 : undefined,      // mm → m
  };
}
