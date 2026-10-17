/**
 * EN 1993-1-1 section class (Table 5.2) and buckling curves (Tables 6.2 and 6.4) for the shapes
 * `steel-props.ts` reads.
 *
 * The engine's EC3 checker takes the class and the curves as inputs: they are the code's
 * statement about the shape, not something the checker derives. So they are derived here, from
 * the dimensions, on the conservative side where the model lacks a detail:
 *
 *   · the root radius is not stored, so the flat widths c are taken without subtracting it —
 *     a wider c can only raise the class number;
 *   · a member with any compression is classified with the web in compression, the stricter row
 *     of Table 5.2, not with the actual stress distribution;
 *   · I and H shapes are read as rolled only when picked from a rolled catalogue family
 *     (`profileFamily`, as the CIRSOC 301 verification reads it); a parametric or declared I is
 *     taken as welded, whose curves are the less favourable ones. Curve a0 of steels above S420
 *     is read as a, the next less favourable;
 *   · tubes are read as cold-formed, curve c: the catalogue's are IRAM-IAS U 500-218 and
 *     EN 10219, both cold-formed, and the model does not record a hot-finished one.
 *
 * Class 4: the engine computes the effective I or RHS section from the plates (EN 1993-1-5 4.4);
 * a Class 4 CHS (EN 1993-1-6) is reported and not checked.
 */
import type { SteelProps } from './steel-props';

export type Ec3Class = 1 | 2 | 3 | 4;
export type Ec3Curve = 'a' | 'b' | 'c' | 'd';

const classOf = (ratio: number, limits: readonly [number, number, number]): Ec3Class =>
  ratio <= limits[0] ? 1 : ratio <= limits[1] ? 2 : ratio <= limits[2] ? 3 : 4;

/** The section class, with the web in compression when `compressed`. */
export function ec3Class(p: SteelProps, fyMPa: number, compressed: boolean): Ec3Class {
  const eps = Math.sqrt(235 / fyMPa);
  if (p.shape === 'CHS') return classOf(p.h / p.tw, [50 * eps * eps, 70 * eps * eps, 90 * eps * eps]);
  const internal = compressed ? [33 * eps, 38 * eps, 42 * eps] as const : [72 * eps, 83 * eps, 124 * eps] as const;
  if (p.shape === 'RHS') {
    // Both walls are internal parts; c = width − 3t (Table 5.2 note for hollow sections).
    const flange = classOf((p.b - 3 * p.tf) / p.tf, [33 * eps, 38 * eps, 42 * eps]);
    const web = classOf((p.h - 3 * p.tw) / p.tw, internal);
    return Math.max(flange, web) as Ec3Class;
  }
  const flange = classOf((p.b - p.tw) / 2 / p.tf, [9 * eps, 10 * eps, 14 * eps]);
  const web = classOf((p.h - 2 * p.tf) / p.tw, internal);
  return Math.max(flange, web) as Ec3Class;
}

/**
 * Flexural buckling curves about y and z, Table 6.2: rolled I/H when `rolled`, else welded I
 * (tf ≤ 40 mm: b/c, above: c/d); tubes cold-formed, c.
 */
export function ec3Curves(p: SteelProps, rolled: boolean): { y: Ec3Curve; z: Ec3Curve } {
  if (p.shape !== 'I') return { y: 'c', z: 'c' };
  const tfMm = p.tf * 1000;
  if (!rolled) return tfMm <= 40 ? { y: 'b', z: 'c' } : { y: 'c', z: 'd' };
  if (p.h / p.b > 1.2) return tfMm <= 40 ? { y: 'a', z: 'b' } : { y: 'b', z: 'c' };
  return tfMm <= 100 ? { y: 'b', z: 'c' } : { y: 'd', z: 'd' };
}

/** Lateral-torsional buckling curve, Table 6.4 (general case): rolled I a/b, welded I c/d at h/b = 2. */
export function ec3CurveLt(p: SteelProps, rolled: boolean): Ec3Curve {
  if (p.shape !== 'I') return 'd';
  if (!rolled) return p.h / p.b <= 2 ? 'c' : 'd';
  return p.h / p.b <= 2 ? 'a' : 'b';
}
