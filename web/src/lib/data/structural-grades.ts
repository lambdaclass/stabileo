/**
 * structural-grades.ts — steel, aluminium and stainless grades, across codes.
 *
 * # The two axes, which are not the same axis
 *
 * A metal member is specified by TWO independent things, and conflating them is
 * the modelling error this file exists to prevent:
 *
 *   * a **grade**, fixed by a PRODUCT standard (EN 10025, ASTM A572, NBR 7007,
 *     IRAM-IAS U 500). This is what the mill certifies: E, nu, rho, fy, fu.
 *   * a **design code** (CIRSOC 301, AISC 360, EN 1993-1-1, NBR 8800). This is
 *     what the engineer applies: resistance factors, buckling curves, section
 *     classification.
 *
 * They vary independently. An A36 section can be checked to AISC 360 or to
 * CIRSOC 301; an S355 can be checked to EN 1993 with a German or a French
 * national annex. So a grade does not belong to a code, and this file keeps
 * them as separate tables joined by family rather than as one flat list.
 *
 * # Where these numbers come from, and what that obliges
 *
 * Every value here is a published characteristic value from the product
 * standard named in `productStandard`. They are the nominal values a code
 * checks against, not measured properties of any particular heat.
 *
 * Two consequences worth stating plainly rather than burying:
 *
 *   1. `fy` for hot-rolled steel FALLS with thickness. A grade quoted as "S355"
 *      is 355 MPa up to 40 mm and 335 MPa beyond it. Where the standard tabulates
 *      that, `byThickness` carries it and `fy` is the thin-plate value — so a
 *      caller that ignores thickness is unconservative, by about 6%, silently.
 *   2. Elastic constants differ BY CODE for the same metal: EN 1999 fixes
 *      aluminium at E = 70000 MPa and nu = 0.3, while ADM uses 69600 and 0.33.
 *      The values here follow the standard each grade is published under.
 *
 * These are reference values for modelling and teaching. A professional
 * verification should be checked against the governing standard's own table —
 * which is why `productStandard` is stored per grade rather than assumed.
 */

import { DESIGN_CODES } from './section-catalog';

export type GradeFamily = 'hot-rolled' | 'cold-formed' | 'aluminium' | 'stainless';

/** Where a grade's product standard comes from. */
export type GradeRegion = 'AR' | 'US' | 'EU' | 'BR' | 'AU' | 'IN' | 'ZA';

/**
 * The regions Basic mode offers.
 *
 * European and American cover most of what is specified anywhere. Argentine is
 * here because CIRSOC is the default and hiding its own grades would be
 * perverse — and CIRSOC leans on both anyway, being a verification code that
 * adopts AISC's method over locally normalised sections.
 *
 * Brazilian joins them for the same reason it matters in the Southern Cone: it
 * is the region an Argentine engineer is most likely to meet outside their own
 * code, the ABNT grades map cleanly onto the ASTM ones they already know
 * (MR-250 is A36, AR-350 is A572 Gr.50), and NBR 8800 uses the same 200 GPa
 * modulus — so nothing about mixing them surprises.
 *
 * With Brazil added, this list now covers every grade in the table, so the gate
 * currently withholds nothing — `MATERIAL_DESIGN_CODES` carries Australian,
 * Indian and South African CODES, but no grades of those regions are loaded
 * yet. Saying so plainly beats implying PRO holds a reserve it does not. The
 * gate stays because it is where the distinction belongs the moment such grades
 * are added, and a test asserts the current state so the change is noticed.
 */
export const BASIC_REGIONS: GradeRegion[] = ['AR', 'EU', 'US', 'BR'];

/** A yield/ultimate pair that applies over a thickness band. */
export interface ThicknessBand {
  /** Lower bound, exclusive, mm. */
  overMm: number;
  /** Upper bound, inclusive, mm. */
  upToMm: number;
  fy: number;
  fu: number;
}

export interface StructuralGrade {
  /** Stable identifier — this is what a saved model stores. */
  id: string;
  /** How the grade is written on a drawing. */
  designation: string;
  /** The PRODUCT standard that fixes the values below. */
  productStandard: string;
  /** Where that standard comes from — drives which modes offer the grade. */
  region: GradeRegion;
  family: GradeFamily;
  /** Young's modulus, MPa. */
  e: number;
  nu: number;
  /** Weight density, kN/m³. */
  rho: number;
  /** Yield (or 0.2% proof) strength, MPa — the thinnest band. */
  fy: number;
  /** Ultimate tensile strength, MPa. */
  fu: number;
  /**
   * Thickness dependence, where it is tabulated. Absent means the source
   * quotes a single value for the usual range, not that thickness has no
   * effect.
   *
   * Read `bandStandard` before quoting these anywhere: they do NOT come from
   * `productStandard`.
   */
  byThickness?: ThicknessBand[];
  /**
   * Which standard tabulates `byThickness` — and it is never `productStandard`.
   *
   * Every band in this file is a DESIGN code's table, not a product standard's:
   * EN 1993-1-1 table 3.1 for the EN steels, CIRSOC 301 for the IRAM ones,
   * EN 1999-1-1 table 3.2b for 6082-T6. The product standards do tabulate
   * thickness dependence, but more finely and with different numbers — EN
   * 10025-2 steps at 16/40/63/80 mm and gives S355 as 345 MPa above 16 mm,
   * where EN 1993-1-1 §3.2.1(1) permits the two-band simplification carried
   * here. Both are legitimate; they are not interchangeable.
   *
   * Recorded per grade because separating the product standard from the design
   * code is the entire point of this file, and a band displayed beside
   * `productStandard` without naming its own source quietly implies the
   * product standard tabulated it. A test requires this wherever `byThickness`
   * is present, so a banded grade cannot be added without saying where its
   * bands came from.
   */
  bandStandard?: string;
  /** Anything a user would otherwise have to know from outside the table. */
  note?: string;
  /**
   * Whether these numbers were read from the governing standard or carried
   * from general knowledge of the alloy.
   *
   * Recorded because the difference matters and is otherwise invisible. Every
   * steel here was checked against its standard; a few aluminium tempers were
   * not, because EN 1999-1-1's tables 3.2a/3.2b were only obtainable in part.
   * Marking them beats deleting them — they are ordinary alloys and the values
   * are the usual ones — and beats leaving them looking as settled as the rest.
   *
   * Shown in the preset picker as a small `~` badge on the grades marked
   * 'typical', with a tooltip saying what the mark means. The picker is the
   * one place the distinction is acted on: someone choosing a grade for a
   * calculation deserves to know which kind of number they are getting. The
   * field was filled in conservatively, so it currently marks 45 of 68 grades.
   */
  verification?: 'standard' | 'typical';
}

export interface DesignCode {
  id: string;
  /** As cited in a calculation report. */
  name: string;
  region: string;
  /** Which families this code covers. */
  families: GradeFamily[];
  /** The safety format the code is written in. */
  format: 'LRFD' | 'ASD' | 'LRFD+ASD' | 'partial-factors' | 'allowable';
  /**
   * Which regions' grades this code is normally applied to.
   *
   * Not a restriction the code imposes — nothing stops an engineer checking an
   * EN grade to AISC, and the arithmetic works. It is what the code's own
   * tables are written around, and it is what makes the picker useful rather
   * than exhaustive: choosing CIRSOC should surface the steels an Argentine
   * drawing actually specifies, not all sixty-eight.
   *
   * CIRSOC lists two regions because that is the honest answer: it adopts
   * AISC's method, so IRAM and ASTM grades sit side by side in local practice.
   */
  gradeRegions: GradeRegion[];
}

// ─────────────────────────────────────────────────────────────────────
// Hot-rolled structural steel
//
// E = 210 000 MPa under EN, 200 000 MPa under ASTM/NBR — a real difference in
// the standards, not a rounding, and it moves a deflection by 5%.
// ─────────────────────────────────────────────────────────────────────

const EN_STEEL = { e: 210000, nu: 0.3, rho: 78.5 } as const;
const US_STEEL = { e: 200000, nu: 0.3, rho: 78.5 } as const;
// CIRSOC 301 chapter 2 fixes E = 210 000 N/mm2, G = 81 000, nu = 0,296 and
// gamma = 78,5 kN/m3 for the IRAM grades — the European modulus, not the
// American one, which is easy to assume from Argentina's use of AISC's method.
// nu is rounded to 0,30 as every table does; the difference is below the
// precision of anything downstream.
const IRAM_STEEL = { e: 210000, nu: 0.3, rho: 78.5 } as const;

export const HOT_ROLLED: StructuralGrade[] = [
  // ── Argentina — IRAM, the grades CIRSOC 301 is written around ──
  //
  // The F-nn number is the yield strength in kgf/mm², and the conversion is the
  // trap: CIRSOC 301 states `1 N/mm² = 1 MPa = 10 kgf/cm²`, so it works at
  // 1 kgf = 10 N, NOT 9,81. F-24 is therefore 240 MPa, not the 235 that the
  // physical conversion suggests — this table said 235 until IRAM-IAS
  // U 500-503 was read directly.
  //
  // CIRSOC 301 also notes that yield drops by 20 MPa above 30 mm thick, which
  // `byThickness` carries. F-20 and F-22 exist in CIRSOC's table 1 but its
  // ultimate strengths are not in the source consulted, so they are left out
  // rather than filled in with a plausible number.
  {
    id: 'iram-f24', designation: 'F-24', productStandard: 'IRAM-IAS U 500-503', region: 'AR', family: 'hot-rolled', ...IRAM_STEEL, fy: 240, fu: 370, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 30, fy: 240, fu: 370 }, { overMm: 30, upToMm: 100, fy: 220, fu: 370 }], bandStandard: 'CIRSOC 301',
    note: 'El grado más usado en perfiles argentinos (IPN, UPN, IPE, IPB, ángulos).',
  },
  {
    id: 'iram-f26', designation: 'F-26', productStandard: 'IRAM-IAS U 500-503', region: 'AR', family: 'hot-rolled', ...IRAM_STEEL, fy: 260, fu: 420, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 30, fy: 260, fu: 420 }, { overMm: 30, upToMm: 100, fy: 240, fu: 420 }], bandStandard: 'CIRSOC 301',
  },
  {
    id: 'iram-f36', designation: 'F-36', productStandard: 'IRAM-IAS U 500-503', region: 'AR', family: 'hot-rolled', ...IRAM_STEEL, fy: 360, fu: 520, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 30, fy: 360, fu: 520 }, { overMm: 30, upToMm: 100, fy: 340, fu: 520 }], bandStandard: 'CIRSOC 301',
    note: 'Perfiles W laminados y estructuras de alta solicitación.',
  },

  // ── ASTM ──
  { id: 'astm-a36', designation: 'A36', productStandard: 'ASTM A36', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 250, fu: 400, verification: 'standard' },
  { id: 'astm-a529-50', designation: 'A529 Gr.50', productStandard: 'ASTM A529', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 345, fu: 450, verification: 'typical' },
  { id: 'astm-a529-55', designation: 'A529 Gr.55', productStandard: 'ASTM A529', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 380, fu: 485, verification: 'typical' },
  { id: 'astm-a572-42', designation: 'A572 Gr.42', productStandard: 'ASTM A572', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 290, fu: 415, verification: 'typical' },
  { id: 'astm-a572-50', designation: 'A572 Gr.50', productStandard: 'ASTM A572', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 345, fu: 450, verification: 'standard' },
  { id: 'astm-a572-55', designation: 'A572 Gr.55', productStandard: 'ASTM A572', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 380, fu: 485, verification: 'typical' },
  { id: 'astm-a572-60', designation: 'A572 Gr.60', productStandard: 'ASTM A572', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 415, fu: 520, verification: 'standard' },
  { id: 'astm-a572-65', designation: 'A572 Gr.65', productStandard: 'ASTM A572', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 450, fu: 550, verification: 'typical' },
  {
    id: 'astm-a992', designation: 'A992', productStandard: 'ASTM A992', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 345, fu: 450, verification: 'standard',
    note: 'W shapes. fy is capped at 450 MPa and fy/fu is limited to 0.85 — the ductility requirement that A36 lacked.',
  },
  { id: 'astm-a588', designation: 'A588', productStandard: 'ASTM A588', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 345, fu: 485, verification: 'typical', note: 'Weathering steel.' },
  { id: 'astm-a913-50', designation: 'A913 Gr.50', productStandard: 'ASTM A913', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 345, fu: 450, verification: 'typical' },
  { id: 'astm-a913-65', designation: 'A913 Gr.65', productStandard: 'ASTM A913', region: 'US', family: 'hot-rolled', ...US_STEEL, fy: 450, fu: 550, verification: 'typical' },

  // ── EN 10025-2, with the thickness bands of EN 1993-1-1 table 3.1 ──
  //
  // The bands below are the DESIGN code's, not the product standard's, and the
  // `fu` values are the tell: EN 10025-2 quotes Rm as a range (470–630 MPa for
  // S355), never the single 490 that EN 1993-1-1 table 3.1 gives. EN 10025-2's
  // own ReH table steps at 16/40/63/80 mm — S355 is 355 MPa only to 16 mm and
  // 345 above it — while §3.2.1(1) permits the two-band simplification used
  // here. `bandStandard` says so per grade so nothing downstream can show a
  // 40 mm step beside the label "EN 10025-2" and imply that is where it came
  // from.
  {
    id: 'en-s235', designation: 'S235', productStandard: 'EN 10025-2', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 235, fu: 360, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 40, fy: 235, fu: 360 }, { overMm: 40, upToMm: 80, fy: 215, fu: 360 }], bandStandard: 'EN 1993-1-1 t.3.1',
  },
  {
    id: 'en-s275', designation: 'S275', productStandard: 'EN 10025-2', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 275, fu: 430, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 40, fy: 275, fu: 430 }, { overMm: 40, upToMm: 80, fy: 255, fu: 410 }], bandStandard: 'EN 1993-1-1 t.3.1',
  },
  {
    id: 'en-s355', designation: 'S355', productStandard: 'EN 10025-2', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 355, fu: 490, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 40, fy: 355, fu: 490 }, { overMm: 40, upToMm: 80, fy: 335, fu: 470 }], bandStandard: 'EN 1993-1-1 t.3.1',
  },
  {
    id: 'en-s450', designation: 'S450', productStandard: 'EN 10025-2', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 440, fu: 550, verification: 'standard',
    byThickness: [{ overMm: 0, upToMm: 40, fy: 440, fu: 550 }, { overMm: 40, upToMm: 80, fy: 410, fu: 550 }], bandStandard: 'EN 1993-1-1 t.3.1',
  },
  // EN 10025-3, normalised fine-grain — the grades used where toughness governs.
  { id: 'en-s275n', designation: 'S275N', productStandard: 'EN 10025-3', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 275, fu: 390, verification: 'typical' },
  { id: 'en-s355n', designation: 'S355N', productStandard: 'EN 10025-3', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 355, fu: 490, verification: 'typical' },
  { id: 'en-s420n', designation: 'S420N', productStandard: 'EN 10025-3', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 420, fu: 520, verification: 'typical' },
  { id: 'en-s460n', designation: 'S460N', productStandard: 'EN 10025-3', region: 'EU', family: 'hot-rolled', ...EN_STEEL, fy: 460, fu: 540, verification: 'typical' },

  // ── Brazil — NBR 7007, the grades in the CalcSteel list ──
  { id: 'nbr-mr250', designation: 'MR-250', productStandard: 'NBR 7007', region: 'BR', family: 'hot-rolled', ...US_STEEL, fy: 250, fu: 400, verification: 'standard' },
  { id: 'nbr-ar350', designation: 'AR-350', productStandard: 'NBR 7007', region: 'BR', family: 'hot-rolled', ...US_STEEL, fy: 350, fu: 450, verification: 'standard' },
  { id: 'nbr-ar350cor', designation: 'AR-350 COR', productStandard: 'NBR 7007', region: 'BR', family: 'hot-rolled', ...US_STEEL, fy: 350, fu: 485, verification: 'standard', note: 'Weathering steel.' },
  { id: 'nbr-ar415', designation: 'AR-415', productStandard: 'NBR 7007', region: 'BR', family: 'hot-rolled', ...US_STEEL, fy: 415, fu: 520, verification: 'standard' },
];

// ─────────────────────────────────────────────────────────────────────
// Cold-formed steel
//
// Thin-walled sections buckle locally before they yield, so these grades are
// only half the story: the design code's effective-width rules are the other
// half, and they differ more between codes than the grades do.
// ─────────────────────────────────────────────────────────────────────

export const COLD_FORMED: StructuralGrade[] = [
  // ── EN 10346, structural galvanised sheet ──
  { id: 'en-s220gd', designation: 'S220GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 220, fu: 300, verification: 'typical' },
  { id: 'en-s250gd', designation: 'S250GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 250, fu: 330, verification: 'typical' },
  { id: 'en-s280gd', designation: 'S280GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 280, fu: 360, verification: 'typical' },
  { id: 'en-s320gd', designation: 'S320GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 320, fu: 390, verification: 'typical' },
  { id: 'en-s350gd', designation: 'S350GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 350, fu: 420, verification: 'typical' },
  {
    id: 'en-s550gd', designation: 'S550GD+Z', productStandard: 'EN 10346', region: 'EU', family: 'cold-formed', ...EN_STEEL, fy: 550, fu: 560, verification: 'typical',
    note: 'High strength, low ductility: fu/fy is only 1.02, so no plastic redistribution is available.',
  },

  // ── ASTM ──
  { id: 'astm-a653-33', designation: 'A653 SS Gr.33', productStandard: 'ASTM A653', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 230, fu: 310, verification: 'typical', note: 'Galvanised.' },
  { id: 'astm-a653-37', designation: 'A653 SS Gr.37', productStandard: 'ASTM A653', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 255, fu: 360, verification: 'typical', note: 'Galvanised.' },
  { id: 'astm-a653-40', designation: 'A653 SS Gr.40', productStandard: 'ASTM A653', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 275, fu: 380, verification: 'typical', note: 'Galvanised.' },
  { id: 'astm-a653-50', designation: 'A653 SS Gr.50 Cl.1', productStandard: 'ASTM A653', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 345, fu: 450, verification: 'typical', note: 'Galvanised.' },
  { id: 'astm-a653-80', designation: 'A653 SS Gr.80', productStandard: 'ASTM A653', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 550, fu: 570, verification: 'typical', note: 'Galvanised, high strength, low ductility.' },
  { id: 'astm-a1011-50', designation: 'A1011 SS Gr.50', productStandard: 'ASTM A1011', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 345, fu: 450, verification: 'typical' },
  { id: 'astm-a1003-h', designation: 'A1003 Type H (ST33H)', productStandard: 'ASTM A1003', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 230, fu: 310, verification: 'typical', note: 'Framing members.' },

  // ── Structural hollow sections, cold-formed ──
  //
  // A500's yield depends on the SHAPE, not only the grade: the corners of a
  // square tube are worked harder than a round one. Both are listed because
  // picking the wrong one is a 9% error on the strength.
  { id: 'astm-a500b-round', designation: 'A500 Gr.B (circular)', productStandard: 'ASTM A500', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 290, fu: 400, verification: 'typical' },
  { id: 'astm-a500b-shaped', designation: 'A500 Gr.B (rect./cuadrado)', productStandard: 'ASTM A500', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 315, fu: 400, verification: 'typical' },
  { id: 'astm-a500c-round', designation: 'A500 Gr.C (circular)', productStandard: 'ASTM A500', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 317, fu: 427, verification: 'typical' },
  { id: 'astm-a500c-shaped', designation: 'A500 Gr.C (rect./cuadrado)', productStandard: 'ASTM A500', region: 'US', family: 'cold-formed', ...US_STEEL, fy: 345, fu: 427, verification: 'typical' },

  // ── Brazil — NBR 7008 (the ZAR grades NBR 14762 designs with) ──
  { id: 'nbr-zar250', designation: 'ZAR-250', productStandard: 'NBR 7008', region: 'BR', family: 'cold-formed', ...US_STEEL, fy: 250, fu: 360, verification: 'standard' },
  { id: 'nbr-zar280', designation: 'ZAR-280', productStandard: 'NBR 7008', region: 'BR', family: 'cold-formed', ...US_STEEL, fy: 280, fu: 380, verification: 'standard' },
  { id: 'nbr-zar345', designation: 'ZAR-345', productStandard: 'NBR 7008', region: 'BR', family: 'cold-formed', ...US_STEEL, fy: 345, fu: 430, verification: 'standard' },
];

// ─────────────────────────────────────────────────────────────────────
// Structural aluminium
//
// `fy` is the 0.2% PROOF stress: aluminium has no yield plateau, so there is
// no yield point to quote and the value is defined by a permanent set. Its
// modulus is a third of steel's, which is why aluminium structures are almost
// always governed by deflection and buckling rather than by strength.
// ─────────────────────────────────────────────────────────────────────

const EN_ALU = { e: 70000, nu: 0.3, rho: 27.0 } as const;

export const ALUMINIUM: StructuralGrade[] = [
  // 5xxx — magnesium alloys: weldable, marine, work-hardened tempers.
  { id: 'alu-5052-h32', designation: '5052-H32', productStandard: 'EN AW-5052', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 195, fu: 230, verification: 'typical' },
  {
    id: 'alu-5083-h111', designation: '5083-H111', productStandard: 'EN AW-5083', region: 'EU', family: 'aluminium', ...EN_ALU,
    // Table 3.2b, extruded, O/H111/F/H112, t <= 200. Held 125/275 before the
    // audit — the alloy's typical values rather than the code's characteristic
    // ones, which are lower because they are guaranteed minima.
    fy: 110, fu: 270, verification: 'standard', note: 'Naval. Valores de extrusión, EN 1999-1-1 tabla 3.2b.',
  },
  { id: 'alu-5083-h116', designation: '5083-H116', productStandard: 'EN AW-5083', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 215, fu: 305, verification: 'typical', note: 'Naval.' },
  { id: 'alu-5086-h32', designation: '5086-H32', productStandard: 'EN AW-5086', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 195, fu: 275, verification: 'typical' },
  { id: 'alu-5754-h22', designation: '5754-H22', productStandard: 'EN AW-5754', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 130, fu: 220, verification: 'typical' },

  // 6xxx — magnesium-silicon: extrudable and heat-treatable, the structural
  // workhorses. A welded 6xxx member loses roughly half its proof stress in the
  // heat-affected zone, which the design code handles and this table does not.
  {
    id: 'alu-6060-t6', designation: '6060-T6', productStandard: 'EN AW-6060', region: 'EU', family: 'aluminium', ...EN_ALU,
    // Table 3.2b, extruded profile/tube/rod, t <= 15. Held 150/190.
    fy: 140, fu: 170, verification: 'standard', note: 'Extrusión, t ≤ 15 mm.',
  },
  { id: 'alu-6061-t6', designation: '6061-T6', productStandard: 'EN AW-6061', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 240, fu: 260, verification: 'typical' },
  { id: 'alu-6063-t6', designation: '6063-T6', productStandard: 'EN AW-6063', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 170, fu: 205, verification: 'typical', note: 'Extrusion.' },
  {
    id: 'alu-6082-t6', designation: '6082-T6', productStandard: 'EN AW-6082', region: 'EU', family: 'aluminium', ...EN_ALU,
    fy: 250, fu: 290, verification: 'standard',
    // Table 3.2b. 6082 runs the OTHER way from every other alloy here: it gets
    // STRONGER with thickness, because a thin extrusion develops a coarser
    // grain. Eurocode 9's commentary flags it explicitly as not a misprint, so
    // the bands are carried rather than smoothed over.
    byThickness: [
      { overMm: 0, upToMm: 5, fy: 250, fu: 290 },
      { overMm: 5, upToMm: 15, fy: 260, fu: 310 },
    ],
    bandStandard: 'EN 1999-1-1 t.3.2b',
    note: 'Extrusión. La resistencia SUBE con el espesor, al revés que las demás.',
  },
  { id: 'alu-7020-t6', designation: '7020-T6', productStandard: 'EN AW-7020', region: 'EU', family: 'aluminium', ...EN_ALU, fy: 280, fu: 350, verification: 'typical' },
];

// ─────────────────────────────────────────────────────────────────────
// Stainless steel
//
// The reason it gets its own design code: stainless has NO yield plateau
// either — its stress-strain curve rounds off gradually, so a member reaches
// its proof stress progressively rather than at once. Carbon-steel buckling
// curves do not apply, which is what EN 1993-1-4 exists to replace.
// ─────────────────────────────────────────────────────────────────────

const AUSTENITIC = { e: 200000, nu: 0.3, rho: 79.0 } as const;
const FERRITIC = { e: 220000, nu: 0.3, rho: 77.0 } as const;
const DUPLEX = { e: 200000, nu: 0.3, rho: 78.0 } as const;

export const STAINLESS: StructuralGrade[] = [
  { id: 'ss-1.4301', designation: '1.4301 / 304', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 230, fu: 540, verification: 'typical', note: 'Austenítico.' },
  { id: 'ss-1.4306', designation: '1.4306 / 304L', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 220, fu: 520, verification: 'typical', note: 'Austenítico, bajo carbono.' },
  { id: 'ss-1.4318', designation: '1.4318 / 301LN', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 350, fu: 650, verification: 'typical', note: 'Austenítico al N, alta resistencia.' },
  { id: 'ss-1.4401', designation: '1.4401 / 316', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 240, fu: 530, verification: 'typical', note: 'Austenítico al Mo.' },
  { id: 'ss-1.4404', designation: '1.4404 / 316L', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 240, fu: 530, verification: 'typical', note: 'Austenítico al Mo, bajo carbono.' },
  { id: 'ss-1.4541', designation: '1.4541 / 321', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 220, fu: 520, verification: 'typical', note: 'Austenítico al Ti.' },
  { id: 'ss-1.4571', designation: '1.4571 / 316Ti', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...AUSTENITIC, fy: 240, fu: 540, verification: 'typical', note: 'Austenítico al Ti.' },
  { id: 'ss-1.4003', designation: '1.4003 / 3CR12', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...FERRITIC, fy: 280, fu: 450, verification: 'standard', note: 'Ferrítico.' },
  { id: 'ss-1.4016', designation: '1.4016 / 430', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...FERRITIC, fy: 260, fu: 450, verification: 'standard', note: 'Ferrítico.' },
  { id: 'ss-1.4362', designation: '1.4362 / 2304', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...DUPLEX, fy: 400, fu: 600, verification: 'typical', note: 'Dúplex.' },
  { id: 'ss-1.4462', designation: '1.4462 / 2205', productStandard: 'EN 10088-4', region: 'EU', family: 'stainless', ...DUPLEX, fy: 480, fu: 660, verification: 'typical', note: 'Dúplex.' },
];

export const ALL_GRADES: StructuralGrade[] = [
  ...HOT_ROLLED,
  ...COLD_FORMED,
  ...ALUMINIUM,
  ...STAINLESS,
];

// ─────────────────────────────────────────────────────────────────────
// Design codes
// ─────────────────────────────────────────────────────────────────────

/**
 * Design codes, seen from the MATERIALS side.
 *
 * `section-catalog.ts` carries a list under the same concept, seen from the
 * PROFILES side: which dimensional families a code can be applied to. These are
 * two projections of one thing, and they share ids on purpose — `cirsoc-301`
 * here and `cirsoc-301` there are the same code.
 *
 * They are deliberately NOT merged today. The profile list answers "which
 * series does this code ship", the grade list answers "which metal families
 * does it cover", and folding them together would force every profile family to
 * declare a material family it has no opinion about. What is enforced instead
 * is that they cannot disagree where they overlap — see the cross-check in
 * `__tests__/structural-grades.test.ts`, which fails if the same id is given
 * two different regions.
 */
export const MATERIAL_DESIGN_CODES: DesignCode[] = [
  // Hot-rolled
  { id: 'cirsoc-301', name: 'CIRSOC 301:2005', region: 'AR', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['AR', 'US'] },
  { id: 'aisc-360-16', name: 'AISC 360-16', region: 'US', families: ['hot-rolled'], format: 'LRFD+ASD', gradeRegions: ['US'] },
  { id: 'aisc-360-22', name: 'AISC 360-22', region: 'US', families: ['hot-rolled'], format: 'LRFD+ASD', gradeRegions: ['US'] },
  { id: 'en-1993-1-1', name: 'EN 1993-1-1:2005', region: 'EU', families: ['hot-rolled'], format: 'partial-factors', gradeRegions: ['EU'] },
  { id: 'nbr-8800', name: 'NBR 8800:2008', region: 'BR', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['BR'] },
  { id: 'as-4100', name: 'AS 4100:2020', region: 'AU', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['AU', 'EU'] },
  { id: 'csa-s16', name: 'CSA S16:19', region: 'CA', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['US'] },
  { id: 'sans-10162-1', name: 'SANS 10162-1:2011', region: 'ZA', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['ZA', 'EU'] },
  { id: 'is-800', name: 'IS 800:2007', region: 'IN', families: ['hot-rolled'], format: 'LRFD', gradeRegions: ['IN', 'EU'] },

  // Cold-formed
  { id: 'cirsoc-303', name: 'CIRSOC 303:2009', region: 'AR', families: ['cold-formed'], format: 'LRFD', gradeRegions: ['AR', 'US'] },
  { id: 'aisi-s100-16', name: 'AISI S100-16', region: 'US', families: ['cold-formed'], format: 'LRFD+ASD', gradeRegions: ['US'] },
  { id: 'en-1993-1-3', name: 'EN 1993-1-3:2006', region: 'EU', families: ['cold-formed'], format: 'partial-factors', gradeRegions: ['EU'] },
  { id: 'nbr-14762', name: 'NBR 14762:2010', region: 'BR', families: ['cold-formed'], format: 'LRFD', gradeRegions: ['BR'] },
  { id: 'as-nzs-4600', name: 'AS/NZS 4600:2018', region: 'AU/NZ', families: ['cold-formed'], format: 'LRFD', gradeRegions: ['AU', 'US'] },
  { id: 'is-811', name: 'IS 811:1987', region: 'IN', families: ['cold-formed'], format: 'allowable', gradeRegions: ['IN', 'EU'] },

  // Aluminium
  { id: 'en-1999-1-1', name: 'EN 1999-1-1:2007', region: 'EU', families: ['aluminium'], format: 'partial-factors', gradeRegions: ['EU'] },
  { id: 'adm-2020', name: 'ADM 2020', region: 'US', families: ['aluminium'], format: 'LRFD+ASD', gradeRegions: ['US', 'EU'] },
  { id: 'cirsoc-701', name: 'CIRSOC 701:2010', region: 'AR', families: ['aluminium'], format: 'LRFD', gradeRegions: ['AR', 'EU'] },
  { id: 'as-1664-1', name: 'AS 1664.1:1997', region: 'AU', families: ['aluminium'], format: 'LRFD', gradeRegions: ['AU', 'EU'] },

  // Stainless
  { id: 'en-1993-1-4', name: 'EN 1993-1-4:2006', region: 'EU', families: ['stainless'], format: 'partial-factors', gradeRegions: ['EU'] },
  { id: 'aisc-dg27', name: 'AISC Design Guide 27', region: 'US', families: ['stainless'], format: 'LRFD+ASD', gradeRegions: ['US', 'EU'] },
  { id: 'as-nzs-4673', name: 'AS/NZS 4673:2001', region: 'AU/NZ', families: ['stainless'], format: 'LRFD', gradeRegions: ['AU', 'EU'] },
];

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

export function gradesForFamily(family: GradeFamily): StructuralGrade[] {
  return ALL_GRADES.filter((g) => g.family === family);
}

/**
 * The code a picker should start on.
 *
 * CIRSOC wherever the family has one — this is an Argentine tool and the local
 * code is the right default, not an option buried among twenty-two. Families
 * CIRSOC does not cover fall back to the first code that does, so the picker
 * always opens on something real rather than on an empty selection.
 */
export function defaultCodeFor(family: GradeFamily): DesignCode | undefined {
  const codes = codesForFamily(family);
  return codes.find((c) => c.id.startsWith('cirsoc')) ?? codes[0];
}

/**
 * Grades a design code would normally be applied to.
 *
 * A code with no match returns the whole family rather than nothing: an empty
 * picker looks broken, and the association here is a convenience for finding
 * grades, not a rule about which are legal.
 */
export function gradesForCode(code: DesignCode, family: GradeFamily): StructuralGrade[] {
  const pool = gradesForFamily(family);
  const matching = pool.filter((g) => code.gradeRegions.includes(g.region));
  return matching.length > 0 ? matching : pool;
}

/**
 * Restrict to what a mode offers.
 *
 * Basic ships European, American and Brazilian grades — plus Argentine, which
 * is the default and cannot sensibly be hidden. PRO adds the rest, which are
 * already loaded here rather than fetched later: the data is small, and gating
 * it at the query keeps one database instead of two that can disagree.
 */
export function gradesForMode<T extends { region: GradeRegion }>(items: T[], pro: boolean): T[] {
  return pro ? items : items.filter((g) => BASIC_REGIONS.includes(g.region));
}

/** Design codes a mode offers, by the same rule. */
export function codesForMode(codes: DesignCode[], pro: boolean): DesignCode[] {
  if (pro) return codes;
  return codes.filter((c) => c.gradeRegions.some((r) => BASIC_REGIONS.includes(r)));
}

export function codesForFamily(family: GradeFamily): DesignCode[] {
  return MATERIAL_DESIGN_CODES.filter((c) => c.families.includes(family));
}

export function gradeById(id: string): StructuralGrade | undefined {
  return ALL_GRADES.find((g) => g.id === id);
}

/**
 * The strength that applies at a given plate thickness.
 *
 * Falls back to the grade's headline values when the standard quotes no bands,
 * and clamps to the thickest band rather than refusing: a caller asking about
 * 100 mm plate is better served by the 80 mm value plus a note than by
 * nothing. Returning the THIN value there would be unconservative, which is
 * the failure mode worth designing against.
 */
export function strengthAtThickness(
  grade: StructuralGrade,
  thicknessMm: number,
): { fy: number; fu: number; extrapolated: boolean } {
  const bands = grade.byThickness;
  if (!bands || bands.length === 0) {
    return { fy: grade.fy, fu: grade.fu, extrapolated: false };
  }
  for (const b of bands) {
    if (thicknessMm > b.overMm && thicknessMm <= b.upToMm) {
      return { fy: b.fy, fu: b.fu, extrapolated: false };
    }
  }
  const last = bands[bands.length - 1];
  const first = bands[0];
  // Below the first band means thinner than tabulated: the thin value governs.
  if (thicknessMm <= first.overMm) return { fy: first.fy, fu: first.fu, extrapolated: false };
  return { fy: last.fy, fu: last.fu, extrapolated: true };
}

/** Free-text search over designation, standard and note. */
export function searchGrades(query: string, family?: GradeFamily): StructuralGrade[] {
  const pool = family ? gradesForFamily(family) : ALL_GRADES;
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter((g) =>
    g.designation.toLowerCase().includes(q) ||
    g.productStandard.toLowerCase().includes(q) ||
    (g.note?.toLowerCase().includes(q) ?? false),
  );
}

// ─────────────────────────────────────────────────────────────────────
// What each profile family is actually rolled in
// ─────────────────────────────────────────────────────────────────────

/**
 * The grade a profile family is commercially produced in, by region.
 *
 * A section and a material look like independent choices in a modelling tool,
 * and physically they are: nothing stops anyone specifying an IPN in F-36. But
 * a mill rolls each family in a particular grade, and ordering anything else
 * means a special production run — so the pairing a drawing shows is usually
 * not a free choice, it is what the supplier ships.
 *
 * Recording it does two things. It gives a sensible default, so a section
 * carries the steel it is really made of instead of whatever material happened
 * to be selected. And it lets the app say — without blocking anything — when a
 * combination departs from what is stocked, which is a question of cost and
 * lead time rather than of correctness.
 *
 * # Why a family has SEVERAL grades, not one
 *
 * This used to record exactly one grade per family and region, and that shape
 * was wrong about how mills actually work. A W section is rolled in A992 today
 * and was rolled in A36 for decades; both turn up on drawings, both are stocked,
 * and a tool that calls one of them unusual is wrong about half the buildings
 * in the country. The same holds for A500 Gr.B beside Gr.C in tubes, and for
 * MR-250 beside AR-350 in Brazil.
 *
 * So each family lists every grade that is ordinary practice there. The first
 * is the DEFAULT — what a new section gets — and the rest are simply not
 * flagged. A warning that fires on a standard combination is worse than no
 * warning at all, because it teaches the reader to ignore it.
 *
 * European practice was previously left out entirely on the grounds that there
 * is no single default. That was the right observation and the wrong
 * conclusion: with a list, "S235 and S355 are both ordinary" is a fact this can
 * hold rather than a reason to hold nothing. S275 is in the list for the same
 * reason — it is stocked across Europe, and omitting it would flag an ordinary
 * choice.
 *
 * Only entries confirmed against a mill catalogue or a product standard are
 * listed. Where the product standard for a family is not in this file at all —
 * European structural hollow sections, EN 10210/10219 — nothing is recorded,
 * because pairing a tube with a grade whose standard covers plate would be
 * inventing a fact rather than recording one.
 */
export interface CommercialPairing {
  gradeId: string;
  /** i18n key naming where this comes from. */
  sourceKey: string;
}

/**
 * Ordinary grades per family and region, most typical first.
 *
 * The first entry is the default a new section takes; every entry is exempt
 * from the "unusual pairing" note.
 */
/** Acindar's F-24, the grade most Argentine rolled sections are supplied in. */
const F24 = (src: string): CommercialPairing => ({ gradeId: 'iram-f24', sourceKey: `grade.src.${src}` });
/** The next grade up in the same IRAM standard, ordered when the design needs it. */
const F26 = (): CommercialPairing => ({ gradeId: 'iram-f26', sourceKey: 'grade.src.iram' });

/** EN 10025-2, most prevalent in current practice first. */
const EN_ROLLED: CommercialPairing[] = [
  { gradeId: 'en-s355', sourceKey: 'grade.src.en10025' },
  { gradeId: 'en-s275', sourceKey: 'grade.src.en10025' },
  { gradeId: 'en-s235', sourceKey: 'grade.src.en10025' },
];

/** The ordinary American grades for channels and angles. */
const US_MILD: CommercialPairing[] = [
  { gradeId: 'astm-a36', sourceKey: 'grade.src.astmA36' },
  { gradeId: 'astm-a572-50', sourceKey: 'grade.src.aisc' },
];

/** The Brazilian equivalents, from NBR 7007. */
const BR_MILD: CommercialPairing[] = [
  { gradeId: 'nbr-mr250', sourceKey: 'grade.src.nbr7007' },
  { gradeId: 'nbr-ar350', sourceKey: 'grade.src.nbr7007' },
];

const COMMERCIAL: Record<string, Partial<Record<GradeRegion, CommercialPairing[]>>> = {
  /*
   * Argentina — Acindar's catalogue, which cites IRAM-IAS U 500-503 per family.
   * F-24 is what the mill rolls; F-26 is the next grade up in the same standard
   * and is ordered when the design needs it, so it is ordinary rather than a
   * special run.
   */
  IPN: { AR: [F24('iramAcindar'), F26()], EU: EN_ROLLED },
  UPN: { AR: [F24('iramAcindar'), F26()], EU: EN_ROLLED },
  T:   { AR: [F24('iramAcindar')] },
  L:   { AR: [F24('iramAcindarAngle'), F26()], EU: EN_ROLLED, US: US_MILD },

  /*
   * Europe — EN 10025-2, the hot-rolled structural standard.
   *
   * All three are stocked. S235 is the historic default and still what most
   * textbook tables and Eurocode worked examples use; S355 dominates new
   * steelwork; S275 sits between them and is common across the continent. The
   * order is by prevalence in current practice, so a new section defaults to
   * S355 while neither of the others is ever flagged.
   */
  IPE: { EU: EN_ROLLED, AR: [F24('iramAcindar')] },
  HEA: { EU: EN_ROLLED, AR: [F24('iramAcindar')] },
  HEB: { EU: EN_ROLLED, AR: [F24('iramAcindar')] },
  // The heavy series of the same family, added with the catalogue's HE M sections.
  HEM: { EU: EN_ROLLED, AR: [F24('iramAcindar')] },

  /*
   * The wide-flange series, where the three regions genuinely differ.
   *
   * A992 was introduced in 1998 specifically for W shapes and is what a US mill
   * ships today; A36 is what every W rolled before that was, and both appear on
   * current drawings — one for new work, one for the assessment of existing
   * buildings, which is half of what a structural engineer does.
   *
   * Brazil: Gerdau quotes perfis W in ASTM A572 Gr.50, and NBR 7007 gives the
   * domestic equivalents — AR-350 at the same strength, MR-250 as the mild
   * grade that corresponds to A36.
   */
  W: {
    AR: [{ gradeId: 'iram-f36', sourceKey: 'grade.src.iramW' }],
    BR: [
      { gradeId: 'astm-a572-50', sourceKey: 'grade.src.gerdau' },
      { gradeId: 'nbr-ar350', sourceKey: 'grade.src.nbr7007' },
      { gradeId: 'nbr-mr250', sourceKey: 'grade.src.nbr7007' },
    ],
    US: [
      { gradeId: 'astm-a992', sourceKey: 'grade.src.aisc' },
      { gradeId: 'astm-a36', sourceKey: 'grade.src.aiscLegacy' },
    ],
  },
  HP: {
    BR: [
      { gradeId: 'astm-a572-50', sourceKey: 'grade.src.gerdau' },
      { gradeId: 'nbr-ar350', sourceKey: 'grade.src.nbr7007' },
    ],
    US: [
      { gradeId: 'astm-a992', sourceKey: 'grade.src.aisc' },
      { gradeId: 'astm-a36', sourceKey: 'grade.src.aiscLegacy' },
    ],
  },
  /*
   * American channels, angles and the light M series.
   *
   * These were missing: only W, HP and the tubes were recorded, so a C or an L
   * in any steel at all drew no comment. A36 remains the ordinary grade for
   * them — A992 is specified for W shapes, not for channels — with A572 Gr.50
   * where higher strength is wanted.
   */
  /*
   * The Argentine entry matters as much as the other two. Without it a channel
   * in F-24 — the ordinary local choice, the same steel every other Acindar
   * section is rolled in — would be flagged as a departure the moment the
   * American practice was recorded, which is the false positive this whole
   * mechanism exists to avoid.
   */
  C:  { AR: [F24('iramAcindar')], US: US_MILD, BR: BR_MILD },
  MC: { AR: [F24('iramAcindar')], US: US_MILD, BR: BR_MILD },
  M:  { US: US_MILD },

  /*
   * Hollow sections are a different product standard entirely.
   *
   * Gr.C is what mills ship now and Gr.B is the long-standing grade still
   * quoted on drawings and in older tables; flagging Gr.B would flag a great
   * many perfectly ordinary tubes. Round and shaped are separate entries
   * because A500 gives them different yields.
   *
   * Nothing is recorded for Europe: EN 10210/10219 are not in this file, and
   * pairing a tube with a grade whose standard covers plate would be inventing
   * a fact rather than recording one.
   */
  RHS: {
    US: [
      { gradeId: 'astm-a500c-shaped', sourceKey: 'grade.src.astmTube' },
      { gradeId: 'astm-a500b-shaped', sourceKey: 'grade.src.astmTubeLegacy' },
    ],
  },
  SHS: {
    US: [
      { gradeId: 'astm-a500c-shaped', sourceKey: 'grade.src.astmTube' },
      { gradeId: 'astm-a500b-shaped', sourceKey: 'grade.src.astmTubeLegacy' },
    ],
  },
  CHS: {
    US: [
      { gradeId: 'astm-a500c-round', sourceKey: 'grade.src.astmTube' },
      { gradeId: 'astm-a500b-round', sourceKey: 'grade.src.astmTubeLegacy' },
    ],
  },
};

/**
 * The grade a family is normally supplied in, or null if none is recorded.
 *
 * The FIRST of the region's list: the one a new section should take. Callers
 * that need to know whether some other grade is also ordinary want
 * `commercialGradesFor` instead.
 */
export function commercialGrade(family: string, region: GradeRegion): CommercialPairing | null {
  return COMMERCIAL[family]?.[region]?.[0] ?? null;
}

/** Every grade recorded as ordinary for a family in one region. */
export function commercialGradesForRegion(family: string, region: GradeRegion): CommercialPairing[] {
  return COMMERCIAL[family]?.[region] ?? [];
}

/**
 * Every region for which a family has a recorded pairing.
 *
 * A caller with no particular region — the common case, since the model does
 * not carry one — uses this for the default a new section takes and for the
 * list of ordinary grades the pairing note names. Judging whether a chosen
 * grade is unusual wants `isUnusualPairing`, which is region-scoped.
 */
export function commercialGradesFor(family: string): CommercialPairing[] {
  const byRegion = COMMERCIAL[family];
  if (!byRegion) return [];
  // Flattened across regions, de-duplicated: the same grade can be ordinary in
  // more than one place, and listing it twice in the note would read as two
  // separate pieces of evidence for the same fact.
  const seen = new Set<string>();
  const out: CommercialPairing[] = [];
  for (const list of Object.values(byRegion)) {
    for (const p of list ?? []) {
      if (seen.has(p.gradeId)) continue;
      seen.add(p.gradeId);
      out.push(p);
    }
  }
  return out;
}

/**
 * Whether a section/grade pairing departs from the recorded practice of the
 * GRADE'S OWN region.
 *
 * The judgement is region-scoped because recording that America rolls a family
 * in A500 says nothing about Europe's tubes, whose product standards
 * (EN 10210/10219) are not in this file. But region scoping alone went too far
 * the other way: an IPN in A992 drew no comment because America records no IPN
 * practice — when the real fact is that America OFFERS no IPN at all, so the
 * pairing departs from every practice on record. Whether a region offers a
 * family is the catalogue's knowledge (`DESIGN_CODES` in `section-catalog.ts`),
 * and it is the second half of the rule:
 *
 *   * the grade is recorded as ordinary for the family ANYWHERE → false. Mills
 *     sell across borders: Gerdau quotes perfis W in ASTM A572, an American
 *     grade under Brazilian practice.
 *   * no practice is recorded for the family anywhere → null. Silence is not a
 *     claim that something is unusual.
 *   * the grade's region does not offer the family in its catalogue → true.
 *     Whatever steel it is, that family is not rolled there, and the recorded
 *     practices are all someone else's — the case of an IPN (a DIN/CIRSOC
 *     series) in A992.
 *   * the region offers the family and records a practice for it, and this
 *     grade is not in it → true: a special run, like an Argentine W in F-24.
 *   * the region offers the family but records nothing for it → null. Europe's
 *     tubes in S235 are the case: EN 10210/10219 are not in this file, and
 *     unknown is not unusual.
 *
 * A grade that is not in the catalogue at all returns null.
 */
export function isUnusualPairing(family: string, gradeId: string | undefined): boolean | null {
  if (!gradeId) return null;
  const byRegion = COMMERCIAL[family];
  if (byRegion) {
    for (const list of Object.values(byRegion)) {
      if (list?.some((p) => p.gradeId === gradeId)) return false;
    }
  }
  const grade = gradeById(gradeId);
  if (!grade) return null;
  const anyRecorded =
    byRegion !== undefined &&
    Object.values(byRegion).some((list) => (list?.length ?? 0) > 0);
  if (!anyRecorded) return null;
  const offered = DESIGN_CODES.some(
    (c) => c.region === grade.region && (c.families as string[]).includes(family),
  );
  if (!offered) return true;
  const local = byRegion?.[grade.region];
  return local && local.length > 0 ? true : null;
}
