/**
 * CIRSOC 301-2018 Tabla B.4.1: the width-to-thickness limits of compressed elements.
 *
 * The table is an image in the shipped text, so it is transcribed here row by row. The case
 * numbers are the text's own, read off the clauses that cite them: E.7 names Cases 1 to 10 of
 * B.4.1a with the limit each uses (b/t ≤ 0,56·√(E/Fy) for Case 1, and so on); F.9 and F.10 print
 * the tee-stem and angle-leg limits of B.4.1b; Apéndice 1 groups Cases 11–12 (flanges), 16, 20
 * and 21 (webs), 18, 19 and 22 (box and tube flanges) and 23 (round tubes). The limits of the
 * remaining B.4.1b rows are those of the specification the text adopts, under those numbers.
 *
 *   B.4.1a  compression: λr only (nonslender / slender).
 *   B.4.1b  flexure: λp and λr (compact / noncompact / slender).
 *
 * E and Fy in MPa; kc = 4/√(h/tw) between 0,35 and 0,763; FL in MPa: case 12 is read with the
 * FL of Observación (b), min(Fyf − Fr, Fyw) with Fr = 114 MPa for a welded section, which the
 * caller passes (absent, 0,7·Fy, the value the observation gives for rolled sections).
 */

export interface LimitInput { E: number; Fy: number; kc?: number; FL?: number }

export interface B41Case {
  case: number;
  table: 'a' | 'b';
  /** What the row covers, in the text's words (a locale key). */
  labelKey: string;
  ratio: 'b/t' | 'h/tw' | 'd/t' | 'D/t' | 'h/t';
  /** Compact limit (flexure only). */
  lambdaP?: (i: LimitInput) => number;
  lambdaR: (i: LimitInput) => number;
}

const s = (k: number) => (i: LimitInput) => k * Math.sqrt(i.E / i.Fy);
/**
 * kc = 4/√(h/tw), bounded 0,35 ≤ kc ≤ 0,763 (Tabla B.4.1 Observación (a), E.7.1(b), F.3.2). The
 * upper bound read 0,76; the text prints 0,763 in all three places.
 */
export const kcOf = (h: number, tw: number): number => Math.min(0.763, Math.max(0.35, 4 / Math.sqrt(h / tw)));

export const TABLE_B41: readonly B41Case[] = [
  // ── B.4.1a: elements of members in axial compression ──
  { case: 1, table: 'a', labelKey: 'steel.b41.c1', ratio: 'b/t', lambdaR: s(0.56) },
  { case: 2, table: 'a', labelKey: 'steel.b41.c2', ratio: 'b/t', lambdaR: (i) => 0.64 * Math.sqrt(((i.kc ?? 0.76) * i.E) / i.Fy) },
  { case: 3, table: 'a', labelKey: 'steel.b41.c3', ratio: 'b/t', lambdaR: s(0.45) },
  { case: 4, table: 'a', labelKey: 'steel.b41.c4', ratio: 'd/t', lambdaR: s(0.75) },
  { case: 5, table: 'a', labelKey: 'steel.b41.c5', ratio: 'h/tw', lambdaR: s(1.49) },
  { case: 6, table: 'a', labelKey: 'steel.b41.c6', ratio: 'b/t', lambdaR: s(1.40) },
  { case: 7, table: 'a', labelKey: 'steel.b41.c7', ratio: 'b/t', lambdaR: s(1.40) },
  { case: 8, table: 'a', labelKey: 'steel.b41.c8', ratio: 'b/t', lambdaR: s(1.49) },
  { case: 9, table: 'a', labelKey: 'steel.b41.c9', ratio: 'b/t', lambdaR: s(1.86) },
  { case: 10, table: 'a', labelKey: 'steel.b41.c10', ratio: 'D/t', lambdaR: (i) => (0.11 * i.E) / i.Fy },
  // ── B.4.1b: elements of members in flexure ──
  { case: 11, table: 'b', labelKey: 'steel.b41.c11', ratio: 'b/t', lambdaP: s(0.38), lambdaR: s(1.0) },
  { case: 12, table: 'b', labelKey: 'steel.b41.c12', ratio: 'b/t', lambdaP: s(0.38), lambdaR: (i) => 0.95 * Math.sqrt(((i.kc ?? 0.76) * i.E) / (i.FL ?? 0.7 * i.Fy)) },
  { case: 13, table: 'b', labelKey: 'steel.b41.c13', ratio: 'b/t', lambdaP: s(0.54), lambdaR: s(0.91) },
  { case: 14, table: 'b', labelKey: 'steel.b41.c14', ratio: 'b/t', lambdaP: s(0.38), lambdaR: s(1.0) },
  { case: 15, table: 'b', labelKey: 'steel.b41.c15', ratio: 'd/t', lambdaP: s(0.84), lambdaR: s(1.03) },
  { case: 16, table: 'b', labelKey: 'steel.b41.c16', ratio: 'h/tw', lambdaP: s(3.76), lambdaR: s(5.70) },
  { case: 17, table: 'b', labelKey: 'steel.b41.c17', ratio: 'h/tw', lambdaP: s(3.76), lambdaR: s(5.70) },
  { case: 18, table: 'b', labelKey: 'steel.b41.c18', ratio: 'b/t', lambdaP: s(1.12), lambdaR: s(1.40) },
  { case: 19, table: 'b', labelKey: 'steel.b41.c19', ratio: 'b/t', lambdaP: s(1.12), lambdaR: s(1.40) },
  { case: 20, table: 'b', labelKey: 'steel.b41.c20', ratio: 'h/t', lambdaP: s(2.42), lambdaR: s(5.70) },
  { case: 21, table: 'b', labelKey: 'steel.b41.c21', ratio: 'h/t', lambdaP: s(2.42), lambdaR: s(5.70) },
  { case: 22, table: 'b', labelKey: 'steel.b41.c22', ratio: 'b/t', lambdaP: s(1.12), lambdaR: s(1.49) },
  { case: 23, table: 'b', labelKey: 'steel.b41.c23', ratio: 'D/t', lambdaP: (i) => (0.07 * i.E) / i.Fy, lambdaR: (i) => (0.31 * i.E) / i.Fy },
];

export const b41Case = (n: number): B41Case => TABLE_B41.find((c) => c.case === n)!;

export type FlexureClass = 'compact' | 'noncompact' | 'slender';
export type CompressionClass = 'nonslender' | 'slender';

export interface ElementClass<C> { case: number; ratio: number; lambdaP?: number; lambdaR: number; class: C }

export function classifyCompression(n: number, ratio: number, i: LimitInput): ElementClass<CompressionClass> {
  const c = b41Case(n), lr = c.lambdaR(i);
  return { case: n, ratio, lambdaR: lr, class: ratio <= lr + 1e-9 ? 'nonslender' : 'slender' };
}

export function classifyFlexure(n: number, ratio: number, i: LimitInput): ElementClass<FlexureClass> {
  const c = b41Case(n), lp = c.lambdaP!(i), lr = c.lambdaR(i);
  return { case: n, ratio, lambdaP: lp, lambdaR: lr, class: ratio <= lp + 1e-9 ? 'compact' : ratio <= lr + 1e-9 ? 'noncompact' : 'slender' };
}

export type SteelShape = 'I' | 'U' | 'T' | 'L' | 'RHS' | 'CHS' | 'other';

export interface ShapeDims { h: number; b: number; tw: number; tf: number; welded?: boolean }

/**
 * The elements of a section and their classes. Half the flange of an I or a T (b = bf/2), the
 * whole flange of a channel; the web between the flanges (h = d − 2tf) for rolled shapes as the
 * text allows; a tube's flat widths less three times the wall.
 */
export function classifySection(shape: SteelShape, d: ShapeDims, i: LimitInput) {
  const hw = d.h - 2 * d.tf, kc = kcOf(hw, d.tw);
  const L = { ...i, kc };
  switch (shape) {
    case 'I': {
      const bt = d.b / 2 / d.tf, ht = hw / d.tw;
      return {
        flangeCompression: classifyCompression(d.welded ? 2 : 1, bt, L), webCompression: classifyCompression(5, ht, L),
        flangeFlexure: classifyFlexure(d.welded ? 12 : 11, bt, L), webFlexure: classifyFlexure(16, ht, L), flangeMinor: classifyFlexure(14, bt, L),
      };
    }
    case 'U': {
      // A welded channel's flanges are case 2 in compression (E.7.1(b), «alas de perfiles
      // soldados») and case 12 in flexure (F.3.2, «secciones armadas»), like a welded I's.
      const bt = d.b / d.tf, ht = hw / d.tw;
      return {
        flangeCompression: classifyCompression(d.welded ? 2 : 1, bt, L), webCompression: classifyCompression(5, ht, L),
        flangeFlexure: classifyFlexure(d.welded ? 12 : 11, bt, L), webFlexure: classifyFlexure(16, ht, L), flangeMinor: classifyFlexure(14, bt, L),
      };
    }
    case 'T': {
      // A tee has one flange: its web is d − tf tall, and that is the h of kc (E.7.1(b)).
      const bt = d.b / 2 / d.tf, dt = d.h / d.tw;
      const T = { ...i, kc: kcOf(d.h - d.tf, d.tw) };
      return { flangeCompression: classifyCompression(d.welded ? 2 : 1, bt, T), webCompression: classifyCompression(4, dt, T), flangeFlexure: classifyFlexure(11, bt, T), webFlexure: classifyFlexure(15, dt, T) };
    }
    case 'L': {
      const bt = Math.max(d.h, d.b) / d.tf;
      return { flangeCompression: classifyCompression(3, bt, L), flangeFlexure: classifyFlexure(13, bt, L) };
    }
    case 'RHS': {
      const t = d.tf, bt = (d.b - 3 * t) / t, ht = (d.h - 3 * t) / t;
      return { flangeCompression: classifyCompression(6, bt, L), webCompression: classifyCompression(6, ht, L), flangeFlexure: classifyFlexure(18, bt, L), webFlexure: classifyFlexure(20, ht, L) };
    }
    case 'CHS': {
      const Dt = d.h / d.tf;
      return { flangeCompression: classifyCompression(10, Dt, L), flangeFlexure: classifyFlexure(23, Dt, L) };
    }
    default: return {};
  }
}
