// Preset materials for quick selection
// Properties in SI units: E (MPa), ν, ρ (kN/m³), fy (MPa)

export interface MaterialPreset {
  name: string;
  category: 'acero' | 'hormigon' | 'madera' | 'aluminio';
  e: number;    // MPa
  nu: number;
  rho: number;  // kN/m³
  fy?: number;  // MPa
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  // ─── Aceros estructurales ───
  { name: 'Acero A36',       category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 250 },
  { name: 'Acero A572 Gr50', category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
  { name: 'Acero A992',      category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
  { name: 'Acero A500 Gr C', category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 317 },
  { name: 'Acero ADN 420',   category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 420 },

  // ─── Hormigones argentinos (CIRSOC 201) ───
  // E = 4700 √f'c (MPa), ν ≈ 0.2, ρ ≈ 24 kN/m³
  { name: 'Hormigón H-20', category: 'hormigon', e: 21019, nu: 0.2, rho: 24.0, fy: 20 },
  { name: 'Hormigón H-25', category: 'hormigon', e: 23500, nu: 0.2, rho: 24.0, fy: 25 },
  { name: 'Hormigón H-30', category: 'hormigon', e: 25743, nu: 0.2, rho: 24.0, fy: 30 },
  { name: 'Hormigón H-35', category: 'hormigon', e: 27806, nu: 0.2, rho: 24.0, fy: 35 },
  { name: 'Hormigón H-40', category: 'hormigon', e: 29725, nu: 0.2, rho: 24.5, fy: 40 },
  { name: 'Hormigón H-45', category: 'hormigon', e: 31529, nu: 0.2, rho: 24.5, fy: 45 },
  { name: 'Hormigón H-50', category: 'hormigon', e: 33234, nu: 0.2, rho: 25.0, fy: 50 },

  // ─── Maderas estructurales ───
  { name: 'Madera (pino)',   category: 'madera', e: 10000, nu: 0.3, rho: 5.0 },
  { name: 'Madera (eucalipto)', category: 'madera', e: 15000, nu: 0.3, rho: 8.0 },

  // ─── Aluminio ───
  { name: 'Aluminio 6061-T6', category: 'aluminio', e: 69000, nu: 0.33, rho: 27.0, fy: 276 },
];

export const MATERIAL_CATEGORIES = [
  { id: 'acero', label: 'Aceros' },
  { id: 'hormigon', label: 'Hormigones' },
  { id: 'madera', label: 'Maderas' },
  { id: 'aluminio', label: 'Aluminio' },
] as const;

export function searchPresets(query: string, category?: string): MaterialPreset[] {
  let source = MATERIAL_PRESETS;
  if (category) source = source.filter(p => p.category === category);
  if (!query.trim()) return source;
  const q = query.trim().toLowerCase();
  return source.filter(p => p.name.toLowerCase().includes(q));
}
