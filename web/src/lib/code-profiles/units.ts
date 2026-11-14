export const UNITS = ['-', 'kN/m2', 'kN', 'm', 'm2', 'mm', 'm/s', 'MPa', 'g', 's', 'deg', 'kg/m3', 'psf', 'lbf', 'mph'] as const;
export type Unit = typeof UNITS[number];

export const FT = 0.3048;
export const LBF_KN = 4.4482216152605e-3;
export const PSF = LBF_KN / (FT * FT);
export const MPH = 0.44704;

const TO_SI: Partial<Record<Unit, { unit: Unit; factor: number }>> = {
  psf: { unit: 'kN/m2', factor: PSF },
  lbf: { unit: 'kN', factor: LBF_KN },
  mph: { unit: 'm/s', factor: MPH },
};

export const isUnit = (u: unknown): u is Unit => typeof u === 'string' && (UNITS as readonly string[]).includes(u);

/** The unit a value is stored in once loaded: the app works in SI, with bar diameters in mm and stresses in MPa. */
export const siUnitOf = (u: Unit): Unit => TO_SI[u]?.unit ?? u;

export function toSI(value: number, unit: Unit): number {
  const c = TO_SI[unit];
  return c ? value * c.factor : value;
}
