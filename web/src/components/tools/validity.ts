export const MESH_TOLERANCE = 1e-6;
export const MIN_EI = 1e-6;
export const DEFLECTION_LIMIT = 1 / 50;
export const REFERENCE_LIMIT = 0.01;
export const MIN_SLENDERNESS = 20;
export const NEAR_ZERO_REFERENCE = 1e-6;

export type Warning = { key: string; values?: Record<string, string | number> };

export function validityWarnings(o: { displacement?: number; length?: number; difference?: number | null; slenderness?: number }): Warning[] {
  const warnings: Warning[] = [];
  if (o.displacement !== undefined && o.length && o.displacement > DEFLECTION_LIMIT * o.length) warnings.push({ key: 'tools.warnDeflection', values: { ratio: o.displacement / o.length } });
  if (o.difference !== undefined && o.difference !== null && o.difference > REFERENCE_LIMIT) warnings.push({ key: 'tools.warnReference', values: { difference: o.difference * 100 } });
  if (o.slenderness !== undefined && o.slenderness < MIN_SLENDERNESS) warnings.push({ key: 'tools.warnSlenderness', values: { slenderness: o.slenderness } });
  return warnings;
}

/** Merge points closer than the mesh tolerance; earlier points win, so list required nodes first. */
export function meshPoints(points: number[], length: number): number[] {
  const kept: number[] = [];
  for (const x of points) if (!kept.some(k => Math.abs(k - x) <= length * MESH_TOLERANCE)) kept.push(x);
  return kept.sort((a, b) => a - b);
}

/** Relative difference, or difference relative to the group's largest reference when this one is near zero. */
export function comparisonDifference(engine: number, reference: number, scale: number): { difference: number | null; absolute: boolean } {
  if (Math.abs(reference) > NEAR_ZERO_REFERENCE * scale && reference !== 0) return { difference: Math.abs(engine - reference) / Math.abs(reference), absolute: false };
  return { difference: scale > 0 ? Math.abs(engine - reference) / scale : null, absolute: true };
}
