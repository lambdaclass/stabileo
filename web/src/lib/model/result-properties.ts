import type { Material, Section } from '../store/model.svelte';
import { canonicalExactJson } from '../provenance/exact-hash';

type PropertyPolicy<T> = { [K in keyof T]-?: true | { nonResult: string } };

export const RESULT_PROPERTY_POLICY = {
  material: {
    id: true,
    name: { nonResult: 'Display label; material families use gradeId and numeric properties.' },
    e: true,
    nu: true,
    rho: true,
    fy: true,
    fu: true,
    fc: true,
    alpha: true,
    gradeId: true,
    timber: true,
    maxAggregateSizeMm: true,
    spacingMarginMm: true,
    shotcrete: true,
  } satisfies PropertyPolicy<Material>,
  section: {
    id: true,
    name: true,
    a: true,
    iz: true,
    b: true,
    h: true,
    shape: true,
    tw: true,
    tf: true,
    t: true,
    tl: true,
    iy: true,
    j: true,
    rotation: true,
    shearAreas: true,
    declared: true,
    profileFamily: true,
    fabrication: true,
    built: { nonResult: 'Editor input history; section geometry and properties are authoritative.' },
    composition: true,
    polygon: true,
    holes: true,
    drawn: true,
    canonical: true,
  } satisfies PropertyPolicy<Section>,
} as const;

export function resultPropertyFingerprint(kind: 'material', value: Material): Record<string, string>;
export function resultPropertyFingerprint(kind: 'section', value: Section): Record<string, string>;
export function resultPropertyFingerprint(kind: keyof typeof RESULT_PROPERTY_POLICY, value: Material | Section): Record<string, string> {
  const policy: Record<string, true | { nonResult: string }> = RESULT_PROPERTY_POLICY[kind];
  const out: Record<string, string> = {};
  for (const [field, property] of Object.entries(value)) {
    if ((!Object.hasOwn(policy, field) || policy[field] === true) && property !== undefined) out[`${kind}[${value.id}].${field}`] = canonicalExactJson(property);
  }
  return out;
}
