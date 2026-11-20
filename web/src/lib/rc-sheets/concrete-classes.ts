/**
 * The concrete classes each code names, by their specified strength, MPa: what an alternative of
 * a stronger concrete is chosen among. CIRSOC 201-2025's H-classes (§19.2), EN 1992-1-1's Table
 * 3.1 (cylinder/cube), TS 500's Table 3.1 and, for ACI 318-19, which names none, the strengths
 * specified in psi in steps of 1000 psi.
 */
import type { SheetCode } from './types';

export interface ConcreteClass { fc: number; name: string; cube?: number }

const EN: ConcreteClass[] = ([[12, 15], [16, 20], [20, 25], [25, 30], [30, 37], [35, 45], [40, 50], [45, 55], [50, 60], [55, 67], [60, 75], [70, 85], [80, 95], [90, 105]] as const)
  .map(([fc, cube]) => ({ fc, cube, name: `C${fc}/${cube}` }));

const CLASSES: Record<SheetCode, ConcreteClass[]> = {
  'cirsoc201-2025': [20, 25, 30, 35, 40, 45, 50, 60].map((fc) => ({ fc, name: `H-${fc}` })),
  'aci318-19': [3000, 4000, 5000, 6000, 7000, 8000].map((psi) => ({ fc: Math.round(psi * 0.00689476 * 10) / 10, name: `f'c ${psi} psi` })),
  'en1992-1-1': EN,
  'bs-en1992-1-1': EN,
  'ts500-2000': [16, 18, 20, 25, 30, 35, 40, 45, 50].map((fc) => ({ fc, name: `C${fc}` })),
};

export const concreteClasses = (code: SheetCode): readonly ConcreteClass[] => CLASSES[code];

/** The class of `code` with that strength, or a name for it when the code names none. */
export function concreteClassOf(code: SheetCode, fc: number): ConcreteClass {
  return CLASSES[code].find((k) => Math.abs(k.fc - fc) < 0.05) ?? { fc, name: `f'c ${Math.round(fc * 10) / 10} MPa` };
}

/** The modulus a new material of that class takes, MPa: EN 1992-1-1 Table 3.1 from fcm, TS 500 3250·√fck + 14000, else 4700·√f'c (§19.2.2.1). */
export function concreteModulus(code: SheetCode, fc: number): number {
  if (code === 'en1992-1-1' || code === 'bs-en1992-1-1') return Math.round(22000 * ((fc + 8) / 10) ** 0.3);
  if (code === 'ts500-2000') return Math.round(3250 * Math.sqrt(fc) + 14000);
  return Math.round(4700 * Math.sqrt(fc));
}

/** The strongest concrete an alternative proposes when the project states none, MPa. */
export const DEFAULT_FC_MAX = 50;
