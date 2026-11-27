/**
 * Where the members stand on the lines they are modelled on, as one statement for the project:
 * the level reference of the beams and slabs (the plane their nodes lie in) and each column
 * stack's fixed point. The model holds both as the offsets it already has (`Element.offset`,
 * a plate's `surface.offset`), which the analysis, the 3D view and the sheets read; this says
 * which offsets those are.
 *
 * - `slabTop`: the nodes on the top of the floor. The slabs hang half their thickness below
 *   them and the concrete beams their whole depth, all tops on the level; a column is cast up to it.
 * - `slabAxis`: the nodes on the slabs' mid-plane. The slabs stay on it and each concrete beam
 *   drops until its top meets the top of the slabs beside it.
 * A steel beam carries its slab on its top flange in either: its top on the slab's soffit.
 * - `axes`: every member on its own axis, none moved.
 */
import { FIXED_POINT_KINDS, fixedPointsOf, fixedSigns, type FixedPointKind } from '../rc-sheets/fixed-points';

export type LevelReference = 'slabTop' | 'slabAxis' | 'axes';
export const LEVEL_REFERENCES: readonly LevelReference[] = ['slabTop', 'slabAxis', 'axes'];

export interface Placement {
  /** Absent: the project never stated one, and the offsets are left as they are. */
  reference?: LevelReference;
  /** Each column stack's fixed point by `stackKey`: the point of its section on its axis, every storey. */
  columns?: Record<string, FixedPointKind>;
  /** The columns and beams on the floor's edge flush with the slab's edge: a column with no point of its own held by its outer face or corner, a beam with slab on one side moved toward it. */
  edges?: boolean;
}

/** The placement a project states, what it names that is known. */
export function placementOf(v: unknown): { placement?: Placement } {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const reference = LEVEL_REFERENCES.includes(o.reference as LevelReference) ? o.reference as LevelReference : undefined;
  const columns = o.columns && typeof o.columns === 'object'
    ? Object.fromEntries(Object.entries(o.columns as Record<string, unknown>).filter((e): e is [string, FixedPointKind] => FIXED_POINT_KINDS.includes(e[1] as FixedPointKind)))
    : {};
  const out: Placement = { ...(reference ? { reference } : {}), ...(Object.keys(columns).length ? { columns } : {}), ...(o.edges === true ? { edges: true } : {}) };
  return Object.keys(out).length ? { placement: out } : {};
}

export function placementWithLegacy(placement: unknown, sheetsFixed: unknown): { placement?: Placement } {
  const own = placementOf(placement).placement, legacy = fixedPointsOf(sheetsFixed).fixedPoints;
  const columns = own?.columns ?? legacy;
  const out = { ...own, ...(columns ? { columns } : {}) };
  return Object.keys(out).length ? { placement: out } : {};
}

/**
 * How far a beam's axis stands off its nodes, m (negative: below): `h` its depth, `slab` the
 * thickness of the slabs on it (0 where none). A concrete beam is cast with its slab, their tops
 * flush; a steel beam carries the slab on its top flange (deck and studs on it), its top on the
 * slab's soffit.
 */
export function beamDrop(ref: LevelReference, h: number, slab: number, under = false): number {
  if (ref === 'axes') return 0;
  const slabTop = ref === 'slabTop' ? 0 : slab / 2;
  const top = under ? slabTop - slab : slabTop;
  return Math.min(0, top - h / 2);
}

/** How far a slab's mid-plane stands off its nodes, m. */
export const slabDrop = (ref: LevelReference, t: number): number => (ref === 'slabTop' ? -t / 2 : 0);

/** How far the top of the floor stands above the nodes, m: where a column is cast up to and its bars wait for the storey above. */
export const floorTopRise = (ref: LevelReference, slab: number): number => (ref === 'slabAxis' ? slab / 2 : 0);

type P2 = [number, number];
const turn = (v: P2, deg: number): P2 => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

/** A column storey's offset off its axis, m in plan, so the point `kind` of its section, `b` × `h` turned `rotDeg`, stands on the axis. */
export function columnShift(kind: FixedPointKind, own: { b: number; h: number; rotDeg: number }): P2 {
  const [sx, sy] = fixedSigns(kind);
  const p = turn([(sx * own.b) / 2, (sy * own.h) / 2], own.rotDeg);
  return [Math.round(-p[0] * 1e6) / 1e6 + 0, Math.round(-p[1] * 1e6) / 1e6 + 0];
}

/** The fixed point of a section turned `rotDeg` whose outside, in plan, lies toward `out` (each −1, 0 or 1 along global X and Y): its outer face, or its corner where two sides are out. */
export function outerKind(out: P2, rotDeg: number): FixedPointKind {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const sb = Math.round(out[0] * c + out[1] * s), sh = Math.round(-out[0] * s + out[1] * c);
  return FIXED_POINT_KINDS.find((k) => { const [a, b] = fixedSigns(k); return a === Math.sign(sb) && b === Math.sign(sh); }) ?? 'c';
}
