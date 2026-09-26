/**
 * The section properties the steel checkers read, in m, from the section as the model holds it.
 *
 * The engine's AISC and EN 1993 member checks are written for doubly symmetric I and H shapes
 * and for closed tubes; their flexural and lateral-torsional expressions are not those of a
 * channel, an angle or a tee. So those three families are what this reads, and any other shape
 * is refused with its reason rather than checked with the wrong formula.
 *
 * Axes: the app's `iy` is the strong axis (the b·h³/12 term) and `iz` the weak one, and both
 * checkers call the strong axis `y` too — nothing crosses here, unlike the CIRSOC 301 checker.
 */
import type { Section } from '../../../store/model.svelte';
import { steelSectionConstants } from '../../steel/section-constants';

export type SteelShape = 'I' | 'RHS' | 'CHS';

export interface SteelProps {
  shape: SteelShape;
  A: number;
  /** Strong and weak second moments, m⁴. */
  Iy: number; Iz: number;
  J: number; Cw: number;
  /** Plastic and elastic moduli about the strong (y) and weak (z) axes, m³. */
  Zy: number; Zz: number; Sy: number; Sz: number;
  /** Radii of gyration, m. */
  ry: number; rz: number;
  h: number; b: number;
  /** Web and flange (or wall) thickness, m. */
  tw: number; tf: number;
  /** Area resisting shear along the web, m². */
  Aw: number;
}

const isI = (s: Section) => s.shape === 'I' || s.shape === 'H';

/** The properties, or the i18n key of why this section cannot be read. */
export function steelProps(sec: Section): SteelProps | { skip: string } {
  const Iy = sec.iy ?? 0, Iz = sec.iz, A = sec.a;
  if (!(A > 0 && Iy > 0 && Iz > 0)) return { skip: 'otherCodes.skip.noProperties' };
  const h = sec.h ?? 0, b = sec.b ?? 0;
  if (!(h > 0 && b > 0)) return { skip: 'otherCodes.skip.noDimensions' };
  // `steelSectionConstants` names axes as CIRSOC does: Zx strong, Zy weak.
  const k = steelSectionConstants(sec as never);
  let shape: SteelShape, tw: number, tf: number, Aw: number, Zy: number, Zz: number, Cw: number;
  let J = k.J;
  if (isI(sec)) {
    if (!(sec.tw && sec.tf)) return { skip: 'otherCodes.skip.noThickness' };
    shape = 'I'; tw = sec.tw; tf = sec.tf;
    Aw = h * tw;
    // The geometry's own moduli when the section engine resolves them; else the plate sums.
    Zy = k.Zx ?? b * tf * (h - tf) + (tw * (h - 2 * tf) ** 2) / 4;
    Zz = k.Zy ?? (tf * b * b) / 2 + ((h - 2 * tf) * tw * tw) / 4;
    Cw = k.Cw ?? (Iz * (h - tf) ** 2) / 4;
  } else if (sec.shape === 'RHS') {
    if (!sec.t) return { skip: 'otherCodes.skip.noThickness' };
    shape = 'RHS'; tw = sec.t; tf = sec.t;
    Aw = 2 * h * sec.t;
    Zy = k.Zx ?? b * h * h / 4 - (b - 2 * sec.t) * (h - 2 * sec.t) ** 2 / 4;
    Zz = k.Zy ?? h * b * b / 4 - (h - 2 * sec.t) * (b - 2 * sec.t) ** 2 / 4;
    Cw = 0; // closed section: warping is negligible and the checkers take it as zero
    // Bredt, thin-walled, when the section states none: a closed tube with J = 0 would buckle
    // laterally-torsionally in the checker, which a tube does not.
    if (!(J > 0)) { const t = sec.t, bm = b - t, hm = h - t; J = (2 * t * bm * bm * hm * hm) / (bm + hm); }
  } else if (sec.shape === 'CHS') {
    if (!sec.t) return { skip: 'otherCodes.skip.noThickness' };
    shape = 'CHS'; tw = sec.t; tf = sec.t;
    Aw = A / 2;
    const D = h, d = D - 2 * sec.t;
    Zy = k.Zx ?? (D ** 3 - d ** 3) / 6;
    Zz = k.Zy ?? Zy;
    Cw = 0;
    if (!(J > 0)) J = Iy + Iz; // the polar moment, exact for a circular tube
  } else {
    return { skip: 'otherCodes.skip.shapeNotCovered' };
  }
  return {
    shape, A, Iy, Iz, J, Cw, Zy, Zz,
    Sy: Iy / (h / 2), Sz: Iz / (b / 2),
    ry: Math.sqrt(Iy / A), rz: Math.sqrt(Iz / A),
    h, b, tw, tf, Aw,
  };
}
