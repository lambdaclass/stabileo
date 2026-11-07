import { familyToShape, profileByName, type SteelProfile } from '../../data/steel-profiles';

export interface SectionProps {
  name: string;
  a: number;
  iz: number;
  iy: number;
  j?: number;
  h: number;
  b: number;
  tw: number;
  tf: number;
  shape: string;
}

export const AI_PROFILE_NAMES = [
  'IPE 200', 'IPE 300', 'IPE 400', 'IPE 500', 'IPE 600',
  'HEB 200', 'HEB 300', 'HEB 400', 'HEA 200', 'HEA 300',
  'UPN 200', 'L 80x80x8',
] as const;

export function fromCatalogue(p: SteelProfile): SectionProps {
  const t = (p.t ?? 0) * 1e-3;
  return {
    name: p.name,
    a: p.a * 1e-4,
    iz: p.iy * 1e-8,
    iy: p.iz * 1e-8,
    ...(p.j != null ? { j: p.j * 1e-8 } : {}),
    h: p.h * 1e-3,
    b: p.b * 1e-3,
    tw: p.tw != null ? p.tw * 1e-3 : t,
    tf: p.tf != null ? p.tf * 1e-3 : t,
    shape: familyToShape(p.family),
  };
}

export const SECTIONS: readonly SectionProps[] = AI_PROFILE_NAMES.map((name) => {
  const p = profileByName(name);
  if (!p) throw new Error(`AI section ${name} is not in the steel catalogue`);
  return fromCatalogue(p);
});

export function lookupSection(name: string): SectionProps | undefined {
  const normalized = name.trim().toUpperCase().replace(/\s+/g, ' ');
  return SECTIONS.find((s) => s.name.toUpperCase() === normalized);
}

export const defaultSection = (): SectionProps => SECTIONS[1];
export const defaultColumnSection = (): SectionProps => SECTIONS[6];
export const trussSection = (): SectionProps => SECTIONS[11];

export function defaultMaterial(): Record<string, unknown> {
  return { id: 1, name: 'Steel A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 };
}
