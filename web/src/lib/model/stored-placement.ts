export type FixedPointKind = 'c' | 'px' | 'nx' | 'py' | 'ny' | 'pxpy' | 'pxny' | 'nxpy' | 'nxny';
export const FIXED_POINT_KINDS: readonly FixedPointKind[] = ['c', 'px', 'nx', 'py', 'ny', 'pxpy', 'pxny', 'nxpy', 'nxny'];

export function fixedPointsOf(v: unknown): { fixedPoints?: Record<string, FixedPointKind> } {
  if (!v || typeof v !== 'object') return {};
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, FixedPointKind] => FIXED_POINT_KINDS.includes(e[1] as FixedPointKind)));
  return Object.keys(out).length ? { fixedPoints: out } : {};
}

export type LevelReference = 'slabTop' | 'slabAxis' | 'axes';
export const LEVEL_REFERENCES: readonly LevelReference[] = ['slabTop', 'slabAxis', 'axes'];

export interface Placement {
  reference?: LevelReference;
  columns?: Record<string, FixedPointKind>;
  edges?: boolean;
}

export function placementOf(v: unknown): { placement?: Placement } {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const reference = LEVEL_REFERENCES.includes(o.reference as LevelReference) ? o.reference as LevelReference : undefined;
  const columns = fixedPointsOf(o.columns).fixedPoints;
  const out: Placement = { ...(reference ? { reference } : {}), ...(columns ? { columns } : {}), ...(o.edges === true ? { edges: true } : {}) };
  return Object.keys(out).length ? { placement: out } : {};
}

export function placementWithLegacy(placement: unknown, sheetsFixed: unknown): { placement?: Placement } {
  const own = placementOf(placement).placement, legacy = fixedPointsOf(sheetsFixed).fixedPoints;
  const columns = own?.columns ?? legacy;
  const out = { ...own, ...(columns ? { columns } : {}) };
  return Object.keys(out).length ? { placement: out } : {};
}
