// Preset materials for quick selection
// Properties in SI units: E (MPa), ν, ρ (kN/m³), fy (MPa)

import { t } from '../i18n';

export interface MaterialPreset {
  name: string;
  category: 'acero' | 'hormigon' | 'madera' | 'aluminio';
  e: number;    // MPa
  nu: number;
  rho: number;  // kN/m³
  fy?: number;  // MPa
}

/** Returns material presets with translated names (call inside reactive context) */
export function getMaterialPresets(): MaterialPreset[] {
  return [
    // ─── Aceros estructurales ───
    { name: t('material.steelA36'),       category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 250 },
    { name: t('material.steelA572Gr50'),  category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
    { name: t('material.steelA992'),      category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
    { name: t('material.steelA500GrC'),   category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 317 },
    { name: t('material.steelADN420'),    category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 420 },

    // ─── Hormigones argentinos (CIRSOC 201) ───
    // E = 4700 √f'c (MPa), ν ≈ 0.2, ρ ≈ 24 kN/m³
    { name: t('material.concreteH20'), category: 'hormigon', e: 21019, nu: 0.2, rho: 24.0, fy: 20 },
    { name: t('material.concreteH25'), category: 'hormigon', e: 23500, nu: 0.2, rho: 24.0, fy: 25 },
    { name: t('material.concreteH30'), category: 'hormigon', e: 25743, nu: 0.2, rho: 24.0, fy: 30 },
    { name: t('material.concreteH35'), category: 'hormigon', e: 27806, nu: 0.2, rho: 24.0, fy: 35 },
    { name: t('material.concreteH40'), category: 'hormigon', e: 29725, nu: 0.2, rho: 24.5, fy: 40 },
    { name: t('material.concreteH45'), category: 'hormigon', e: 31529, nu: 0.2, rho: 24.5, fy: 45 },
    { name: t('material.concreteH50'), category: 'hormigon', e: 33234, nu: 0.2, rho: 25.0, fy: 50 },

    // ─── Maderas estructurales ───
    { name: t('material.woodPine'),       category: 'madera', e: 10000, nu: 0.3, rho: 5.0 },
    { name: t('material.woodEucalyptus'), category: 'madera', e: 15000, nu: 0.3, rho: 8.0 },

    // ─── Aluminio ───
    { name: t('material.aluminum6061T6'), category: 'aluminio', e: 69000, nu: 0.33, rho: 27.0, fy: 276 },
  ];
}

/** @deprecated Use getMaterialPresets() instead */
export const MATERIAL_PRESETS: MaterialPreset[] = [
  { name: 'Acero A36',       category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 250 },
  { name: 'Acero A572 Gr50', category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
  { name: 'Acero A992',      category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 345 },
  { name: 'Acero A500 Gr C', category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 317 },
  { name: 'Acero ADN 420',   category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 420 },
  { name: 'Hormigón H-20', category: 'hormigon', e: 21019, nu: 0.2, rho: 24.0, fy: 20 },
  { name: 'Hormigón H-25', category: 'hormigon', e: 23500, nu: 0.2, rho: 24.0, fy: 25 },
  { name: 'Hormigón H-30', category: 'hormigon', e: 25743, nu: 0.2, rho: 24.0, fy: 30 },
  { name: 'Hormigón H-35', category: 'hormigon', e: 27806, nu: 0.2, rho: 24.0, fy: 35 },
  { name: 'Hormigón H-40', category: 'hormigon', e: 29725, nu: 0.2, rho: 24.5, fy: 40 },
  { name: 'Hormigón H-45', category: 'hormigon', e: 31529, nu: 0.2, rho: 24.5, fy: 45 },
  { name: 'Hormigón H-50', category: 'hormigon', e: 33234, nu: 0.2, rho: 25.0, fy: 50 },
  { name: 'Madera (pino)',   category: 'madera', e: 10000, nu: 0.3, rho: 5.0 },
  { name: 'Madera (eucalipto)', category: 'madera', e: 15000, nu: 0.3, rho: 8.0 },
  { name: 'Aluminio 6061-T6', category: 'aluminio', e: 69000, nu: 0.33, rho: 27.0, fy: 276 },
];

export const MATERIAL_CATEGORIES = [
  { id: 'acero', label: 'matCat.steel' },
  { id: 'hormigon', label: 'matCat.concrete' },
  { id: 'madera', label: 'matCat.wood' },
  { id: 'aluminio', label: 'matCat.aluminum' },
] as const;

export function searchPresets(query: string, category?: string): MaterialPreset[] {
  let source = getMaterialPresets();
  if (category) source = source.filter(p => p.category === category);
  if (!query.trim()) return source;
  const q = query.trim().toLowerCase();
  return source.filter(p => p.name.toLowerCase().includes(q));
}
