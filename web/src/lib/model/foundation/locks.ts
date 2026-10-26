/**
 * What the design may not change on a footing: its plan and thickness, and its bars. Bars fixed
 * by hand are stated per layer as a diameter and a spacing, and the design checks them instead of
 * laying its own.
 */
export interface MatSpec { diameterMm: number; spacing: number }
export interface FootingMats { bottomX: MatSpec; bottomY: MatSpec; topX?: MatSpec; topY?: MatSpec }
export interface FootingLocks { dimensions?: boolean; reinforcement?: boolean }

const spec = (v: unknown): MatSpec | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const d = o.diameterMm, s = o.spacing;
  return typeof d === 'number' && d > 0 && typeof s === 'number' && s > 0 ? { diameterMm: d, spacing: s } : undefined;
};

/** The locks and fixed bars of a stored footing, keeping only what is well formed. */
export function migrateFootingLocks(e: Record<string, unknown>): { locked?: FootingLocks; mats?: FootingMats } {
  const out: { locked?: FootingLocks; mats?: FootingMats } = {};
  if (e.locked && typeof e.locked === 'object') {
    const l = e.locked as Record<string, unknown>;
    const locked: FootingLocks = { ...(l.dimensions === true ? { dimensions: true } : {}), ...(l.reinforcement === true ? { reinforcement: true } : {}) };
    if (locked.dimensions || locked.reinforcement) out.locked = locked;
  }
  if (e.mats && typeof e.mats === 'object') {
    const m = e.mats as Record<string, unknown>;
    const bx = spec(m.bottomX), by = spec(m.bottomY), tx = spec(m.topX), ty = spec(m.topY);
    if (bx && by) out.mats = { bottomX: bx, bottomY: by, ...(tx ? { topX: tx } : {}), ...(ty ? { topY: ty } : {}) };
  }
  return out;
}
