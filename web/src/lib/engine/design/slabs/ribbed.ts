/**
 * Ribbed and waffle slabs (joist construction, CIRSOC 201-2025 8.8): the geometry of a rib and its
 * share of topping, what a square metre of it weighs and how stiff it is, the limits of 8.8.1 and
 * 8.8.2/8.8.3, and the design of one rib from the moments and shears per metre width the analysis
 * gives (the slab is modelled with its equivalent solid thickness, so its moments are per metre).
 *
 * A rib is designed as a T in positive moment (its share of topping is the flange) and as its own
 * web in negative moment; shear without stirrups by 22.5.5.1(c), times 1,1 (8.8.1.5). m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { slabVc } from './one-way-shear';

export interface RibbedGeometry {
  /** Total depth and topping thickness, m. */
  h: number; c: number;
  /** Rib spacing (centre to centre) in x and y; y absent for a one-way system. */
  spacingX: number; spacingY?: number;
  /** Rib width at the bottom and at the underside of the topping, m (equal for a straight rib). */
  ribBottom: number; ribTop?: number;
  /** Permanent fillers as strong as the ribs (8.8.2) or removable forms (8.8.3). */
  filler: 'permanent' | 'removable';
}

export const CONCRETE_WEIGHT = 25;

/** One rib with its share of topping: area, centroid from the top, second moment, m. */
export function ribSection(g: RibbedGeometry, spacing: number) {
  const hw = g.h - g.c, bTop = g.ribTop ?? g.ribBottom;
  const webA = ((g.ribBottom + bTop) / 2) * hw;
  // The web's centroid below the topping, from the bottom (trapezoid).
  const webYb = (hw * (2 * g.ribBottom + bTop)) / (3 * (g.ribBottom + bTop));
  const flA = spacing * g.c, flY = g.c / 2;
  const webY = g.h - webYb;
  const A = webA + flA, y = (flA * flY + webA * webY) / A;
  const bw = (g.ribBottom + bTop) / 2;
  const I = (spacing * g.c ** 3) / 12 + flA * (y - flY) ** 2 + (bw * hw ** 3) / 12 + webA * (webY - y) ** 2;
  return { A, y, I, webA };
}

/** Per square metre: concrete, self weight, and the solid thickness of equal stiffness. */
export function ribbedProperties(g: RibbedGeometry) {
  const sx = ribSection(g, g.spacingX);
  const ribs = g.spacingY ? 2 : 1;
  // Concrete per m²: the topping plus the ribs in each direction, the crossings counted once.
  const webPerM = sx.webA / g.spacingX;
  const crossing = g.spacingY ? (((g.ribBottom + (g.ribTop ?? g.ribBottom)) / 2) ** 2 * (g.h - g.c)) / (g.spacingX * g.spacingY) : 0;
  const volume = g.c + webPerM + (g.spacingY ? ribSection(g, g.spacingY).webA / g.spacingY : 0) - crossing;
  const hEq = Math.cbrt((12 * sx.I) / g.spacingX);
  return { volume, selfWeight: volume * CONCRETE_WEIGHT, hEq, ribs, iPerRib: sx.I };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
/** A limit as a ratio: the demand over what is allowed, or the minimum required over what is provided. */
const rule = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[]): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.ribbed.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio) };
};

/** The limits of joist construction. Outside them, 8.8.1.8: design as slabs and beams. */
export function ribbedRules(g: RibbedGeometry): CheckRow[] {
  const bMin = Math.min(g.ribBottom, g.ribTop ?? g.ribBottom);
  const clear = Math.max(g.spacingX, g.spacingY ?? 0) - Math.min(g.ribBottom, g.ribTop ?? g.ribBottom);
  const clearTop = Math.max(g.spacingX, g.spacingY ?? 0) - (g.ribTop ?? g.ribBottom);
  const minC = Math.max(clearTop / 12, g.filler === 'permanent' ? 0.04 : 0.05);
  return [
    rule('ribWidth', 'Rib width', '8.8.1.2', 'bw ≥ 100 mm', 0.1, bMin, 'm', [inp('bw', bMin * 1000, 'mm')]),
    rule('ribDepth', 'Rib depth', '8.8.1.3', 'h ≤ 3,5·bw,min', g.h, 3.5 * bMin, 'm', [inp('h', g.h * 1000, 'mm'), inp('bw,min', bMin * 1000, 'mm')]),
    rule('clearSpacing', 'Clear spacing', '8.8.1.4', 's,clear ≤ 750 mm', clear, 0.75, 'm', [inp('s,clear', clear * 1000, 'mm')]),
    rule('topping', 'Topping thickness', g.filler === 'permanent' ? '8.8.2.1.1' : '8.8.3.1', g.filler === 'permanent' ? 'c ≥ max(s,clear/12; 40 mm)' : 'c ≥ max(s,clear/12; 50 mm)', minC, g.c, 'm', [inp('c', g.c * 1000, 'mm'), inp('c,min', minC * 1000, 'mm')]),
  ];
}

export interface RibDemand { mPos: number; mNeg: number; v: number; comboName?: string; at?: string }

/** As for Mu on a rectangular block of width b, m²; null when the section cannot carry it. */
export function flexuralSteel(mu: number, b: number, d: number, fc: number, fy: number, phi = 0.9): number | null {
  const k = 1 - (2 * mu) / (phi * 0.85 * fc * 1000 * b * d * d);
  if (k < 0) return null;
  return ((0.85 * fc * b * d) / fy) * (1 - Math.sqrt(k));
}

/** One rib: steel for positive and negative moment, and shear, from demands per metre width. */
export function ribDesign(g: RibbedGeometry, demand: RibDemand, mat: { fc: number; fy: number; cover: number; barDia: number }, spacing = g.spacingX): { rows: CheckRow[]; asPos: number | null; asNeg: number | null } {
  const bw = g.ribBottom, db = mat.barDia / 1000;
  const dPos = g.h - mat.cover - db / 2, dNeg = g.h - mat.cover - db / 2;
  const muPos = demand.mPos * spacing, muNeg = demand.mNeg * spacing, vu = demand.v * spacing;
  // Positive: the topping in compression, the T's flange as wide as the rib's share.
  let asPos = flexuralSteel(muPos, spacing, dPos, mat.fc, mat.fy);
  if (asPos !== null && (asPos * mat.fy) / (0.85 * mat.fc * spacing) > g.c) asPos = null; // the block leaves the topping
  const asNeg = flexuralSteel(muNeg, bw, dNeg, mat.fc, mat.fy);
  const asMin = Math.max((0.25 * Math.sqrt(mat.fc)) / mat.fy, 1.4 / mat.fy) * bw * dPos;
  // Shear without stirrups, 22.5.5.1(c), with the 1,1 of 8.8.1.5.
  const rho = Math.max(asPos ?? 0, asMin) / (bw * dPos);
  const { vc, lambdaS } = slabVc(mat.fc, bw, dPos, rho);
  const phiVc = 0.75 * 1.1 * vc;
  const at = { ...(demand.comboName ? { combination: demand.comboName } : {}), ...(demand.at ? { location: demand.at } : {}) };
  const steelRow = (key: string, title: string, mu: number, as: number | null, b: number, d: number): CheckRow => {
    const cap = as === null ? 0 : as;
    return { code: 'cirsoc-201', edition: '2025', clause: '22.3', title, titleKey: `check.ribbed.${key}`, formula: 'Mu ≤ φ·Mn (per rib)',
      inputs: [inp('Mu', mu, 'kN·m'), inp('b', b * 1000, 'mm'), inp('d', d * 1000, 'mm'), ...(as !== null ? [inp('As,req', Math.max(as, asMin) * 1e4, 'cm²')] : [])],
      ratio: null, status: as === null ? 'fail' : 'ok', ...at,
      derivation: as === null ? ['the compression block does not fit the section'] : [`As = ${(Math.max(cap, asMin) * 1e4).toFixed(2)} cm² per rib (As,min = ${(asMin * 1e4).toFixed(2)} cm², 9.6.1.2)`] };
  };
  const rows: CheckRow[] = [
    steelRow('positive', 'Positive moment, rib as T', muPos, asPos, spacing, dPos),
    steelRow('negative', 'Negative moment, rib web', muNeg, asNeg, bw, dNeg),
    { code: 'cirsoc-201', edition: '2025', clause: '8.8.1.5', title: 'Rib shear', titleKey: 'check.ribbed.shear', formula: 'Vu ≤ φ·1,1·Vc (22.5.5.1c)',
      inputs: [inp('Vu', vu, 'kN'), inp('λs', lambdaS), inp('ρw', rho), inp('Vc', vc, 'kN')], demand: r3(vu), capacity: r3(phiVc), unit: 'kN', ratio: r3(vu / phiVc), status: statusOfRatio(vu / phiVc), ...at },
  ];
  return { rows, asPos: asPos === null ? null : Math.max(asPos, asMin), asNeg: asNeg === null ? null : Math.max(asNeg, asMin) };
}
