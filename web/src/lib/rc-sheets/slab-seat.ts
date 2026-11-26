/**
 * Where a beam's slab meets it, as the sheets read it: flush with its top (how it is usually
 * cast, the slab then a compression flange where the project lets it), lower down, or at its
 * soffit (an upturned beam); or taken flush because the model does not place it.
 */
import type { BeamDemand } from './beam-row';

export type SlabSeat = { kind: 'top' | 'below' | 'bottom' | 'assumed'; below: number };

export function slabSeat(d: Pick<BeamDemand, 'slabs'>, h: number): SlabSeat | null {
  const slabs = d.slabs ?? [];
  if (!slabs.length) return null;
  if (!slabs.some((s) => s.placed)) return { kind: 'assumed', below: 0 };
  const lowest = slabs.reduce((w, s) => (-s.top > -w.top ? s : w));
  const below = Math.max(0, -lowest.top);
  if (below < 0.005) return { kind: 'top', below: 0 };
  if (Math.abs(below - (h - lowest.hf)) < 0.005) return { kind: 'bottom', below };
  return { kind: 'below', below };
}
