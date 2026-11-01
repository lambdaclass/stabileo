export interface SectionProps {
  name: string;
  a: number;
  iz: number;
  iy: number;
  j: number;
  h: number;
  b: number;
  tw: number;
  tf: number;
  shape: string;
}

export const SECTIONS: readonly SectionProps[] = [
  { name: 'IPE 200', a: 28.5e-4, iz: 1943e-8, iy: 142e-8, j: 7.0e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, shape: 'I' },
  { name: 'IPE 300', a: 53.8e-4, iz: 8356e-8, iy: 604e-8, j: 2.0e-7, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, shape: 'I' },
  { name: 'IPE 400', a: 84.5e-4, iz: 23130e-8, iy: 1318e-8, j: 5.1e-7, h: 0.4, b: 0.18, tw: 0.0086, tf: 0.0135, shape: 'I' },
  { name: 'IPE 500', a: 116e-4, iz: 48200e-8, iy: 2142e-8, j: 1.07e-6, h: 0.5, b: 0.2, tw: 0.0102, tf: 0.016, shape: 'I' },
  { name: 'IPE 600', a: 156e-4, iz: 92080e-8, iy: 3387e-8, j: 2.09e-6, h: 0.6, b: 0.22, tw: 0.012, tf: 0.019, shape: 'I' },
  { name: 'HEB 200', a: 78.1e-4, iz: 5696e-8, iy: 2003e-8, j: 5.9e-7, h: 0.2, b: 0.2, tw: 0.009, tf: 0.015, shape: 'H' },
  { name: 'HEB 300', a: 149e-4, iz: 25170e-8, iy: 8563e-8, j: 1.85e-6, h: 0.3, b: 0.3, tw: 0.011, tf: 0.019, shape: 'H' },
  { name: 'HEB 400', a: 198e-4, iz: 57680e-8, iy: 10820e-8, j: 3.68e-6, h: 0.4, b: 0.3, tw: 0.0135, tf: 0.024, shape: 'H' },
  { name: 'HEA 200', a: 53.8e-4, iz: 3692e-8, iy: 1336e-8, j: 2.1e-7, h: 0.19, b: 0.2, tw: 0.0065, tf: 0.01, shape: 'I' },
  { name: 'HEA 300', a: 113e-4, iz: 18260e-8, iy: 6310e-8, j: 8.5e-7, h: 0.29, b: 0.3, tw: 0.0085, tf: 0.014, shape: 'H' },
  { name: 'UPN 200', a: 32.2e-4, iz: 1910e-8, iy: 148e-8, j: 1.2e-7, h: 0.2, b: 0.075, tw: 0.0085, tf: 0.0115, shape: 'U' },
  { name: 'L 80x80x8', a: 12.3e-4, iz: 80e-8, iy: 80e-8, j: 2.6e-8, h: 0.08, b: 0.08, tw: 0.008, tf: 0.008, shape: 'L' },
];

export function lookupSection(name: string): SectionProps | undefined {
  const normalized = name.trim().toUpperCase().replaceAll('  ', ' ');
  return SECTIONS.find((s) => s.name.toUpperCase() === normalized);
}

export const defaultSection = (): SectionProps => SECTIONS[1];
export const defaultColumnSection = (): SectionProps => SECTIONS[6];
export const trussSection = (): SectionProps => SECTIONS[11];

export function defaultMaterial(): Record<string, unknown> {
  return { id: 1, name: 'Steel A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 };
}
