/**
 * Where the members stand on the lines they are modelled on, as one statement for the project:
 * the level reference of the beams and slabs (the plane their nodes lie in) and each column
 * stack's fixed point. The model holds both as the offsets it already has (`Element.offset`,
 * a plate's `surface.offset`), which the analysis, the 3D view and the sheets read; this says
 * which offsets those are.
 *
 * - `slabTop`: the nodes on the top of the floor. The slabs hang half their thickness below
 *   them and the beams their whole depth, all tops on the level; a column is cast up to it.
 * - `slabAxis`: the nodes on the slabs' mid-plane. The slabs stay on it and each beam drops
 *   until its top meets the top of the slabs beside it.
 * - `axes`: every member on its own axis, none moved.
 */
import { FIXED_POINT_KINDS, fixedSigns, type FixedPointKind } from '../rc-sheets/fixed-points';

export type LevelReference = 'slabTop' | 'slabAxis' | 'axes';
export const LEVEL_REFERENCES: readonly LevelReference[] = ['slabTop', 'slabAxis', 'axes'];

export interface Placement {
  /** Absent: the project never stated one, and the offsets are left as they are. */
  reference?: LevelReference;
  /** Each column stack's fixed point by `stackKey`; absent, the stack is centred on its axis. */
  columns?: Record<string, FixedPointKind>;
}

/** The placement a project states, what it names that is known. */
export function placementOf(v: unknown): { placement?: Placement } {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const reference = LEVEL_REFERENCES.includes(o.reference as LevelReference) ? o.reference as LevelReference : undefined;
  const columns = o.columns && typeof o.columns === 'object'
    ? Object.fromEntries(Object.entries(o.columns as Record<string, unknown>).filter((e): e is [string, FixedPointKind] => FIXED_POINT_KINDS.includes(e[1] as FixedPointKind)))
    : {};
  const out: Placement = { ...(reference ? { reference } : {}), ...(Object.keys(columns).length ? { columns } : {}) };
  return Object.keys(out).length ? { placement: out } : {};
}

/** How far a beam's axis stands off its nodes, m (negative: below): `h` its depth, `slab` the thickness of the slabs beside it (0 where none). */
export function beamDrop(ref: LevelReference, h: number, slab: number): number {
  if (ref === 'slabTop') return -h / 2;
  if (ref === 'slabAxis') return Math.min(0, slab / 2 - h / 2);
  return 0;
}

/** How far a slab's mid-plane stands off its nodes, m. */
export const slabDrop = (ref: LevelReference, t: number): number => (ref === 'slabTop' ? -t / 2 : 0);

/** How far the top of the floor stands above the nodes, m: where a column is cast up to and its bars wait for the storey above. */
export const floorTopRise = (ref: LevelReference, slab: number): number => (ref === 'slabAxis' ? slab / 2 : 0);

type P2 = [number, number];
const turn = (v: P2, deg: number): P2 => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

/**
 * A column storey's offset off its axis, m in plan, so its section's fixed point falls on the
 * lowest storey's: `base` the lowest storey's section and offset, `own` this storey's section.
 */
export function columnShift(kind: FixedPointKind, base: { b: number; h: number; rotDeg: number; offset: P2 }, own: { b: number; h: number; rotDeg: number }): P2 {
  const [sx, sy] = fixedSigns(kind);
  const pb = turn([(sx * base.b) / 2, (sy * base.h) / 2], base.rotDeg), po = turn([(sx * own.b) / 2, (sy * own.h) / 2], own.rotDeg);
  const x = base.offset[0] + pb[0] - po[0], y = base.offset[1] + pb[1] - po[1];
  return [Math.round(x * 1e6) / 1e6 + 0, Math.round(y * 1e6) / 1e6 + 0];
}
