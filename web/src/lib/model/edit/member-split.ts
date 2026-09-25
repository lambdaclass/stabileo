/**
 * Splitting one member into consecutive segments: what each segment inherits.
 *
 * Every geometry command that cuts a member — split at a point, subdivide, split where another
 * member crosses, a bar dropped perpendicular onto it — reduces to this. The store used to carry
 * two independent copies, and each lost something different: one left 3D loads on the deleted
 * member and dropped its joints and curve tag, the other replicated a partial load along the
 * whole length and deleted point loads outright.
 *
 * ── The rule for loads ─────────────────────────────────────────────
 *
 * A distributed load is a trapezoid on [a, b] measured from node I. Segment k spans
 * [s_k, s_k+1]. It receives the overlap of the two, with the load's intensity interpolated at the
 * overlap's ends and the positions re-measured from the segment's own start; an end that
 * coincides with the segment's is left unstated, which is how the model stores a full-length
 * load. A point load goes to the segment that contains it — the later one when it sits exactly
 * on a cut. A thermal load is a state of the whole member and goes to every segment.
 *
 * The sum of the pieces is the original load, force and moment: that is what the tests assert.
 *
 * ── The rule for the member's properties ───────────────────────────
 *
 * Material, section, type, local axes, roll and the curve tag belong to the whole member and go
 * to every segment. What belongs to an END goes to the segment at that end and nowhere else: the
 * I-end release and joint to the first segment, the J-end ones to the last. Offsets are
 * interpolated at each cut so every flexible segment stays on the original line. An
 * interior cut is a rigid continuous connection, which is what cutting a continuous member means.
 *
 * Reinforcement does not follow. Bars are laid out against a member's length and supports, and
 * a segment is neither; the segments are left undesigned and the caller reports it.
 *
 * Pure: no store.
 */

import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { offsetVecToSolver } from '../../engine/member-offsets';

import type {
  Element, Load, Release, DistributedLoad, PointLoadOnElement, ThermalLoad,
  DistributedLoad3D, PointLoadOnElement3D,
} from '../../store/model.svelte';

const EPS = 1e-9;

/** Cut positions, as distances from node I, turned into segment boundaries [0, …, L]. */
export function segmentBounds(L: number, ts: readonly number[]): number[] {
  const inner = [...ts].filter((t) => t > EPS && t < 1 - EPS).sort((a, b) => a - b);
  return [0, ...inner.map((t) => t * L), L];
}

function lerp(qa: number, qb: number, a: number, b: number, s: number): number {
  return b - a > EPS ? qa + (qb - qa) * (s - a) / (b - a) : qa;
}

/**
 * A trapezoid on [a, b], clipped to one segment and re-measured from its start.
 *
 * `values` are the intensities at a and at b, as pairs, one pair per component, so the same
 * clipping serves the 2D load (one component) and the 3D one (two).
 */
function clipTrapezoid(
  a: number, b: number, values: ReadonlyArray<readonly [number, number]>, s0: number, s1: number,
): { a?: number; b?: number; values: Array<[number, number]> } | null {
  const lo = Math.max(a, s0), hi = Math.min(b, s1);
  if (hi - lo <= EPS) return null;
  const segL = s1 - s0;
  const out: { a?: number; b?: number; values: Array<[number, number]> } = {
    values: values.map(([qa, qb]) => [lerp(qa, qb, a, b, lo), lerp(qa, qb, a, b, hi)]),
  };
  if (lo - s0 > EPS) out.a = lo - s0;
  if (segL - (hi - s0) > EPS) out.b = hi - s0;
  return out;
}

const segmentOf = (bounds: readonly number[], x: number): number => {
  // The later segment when x sits on a cut, within a micron.
  for (let k = bounds.length - 2; k >= 0; k--) if (x >= bounds[k]! - 1e-6) return k;
  return 0;
};

/**
 * The element's loads, redistributed over its segments.
 *
 * Returns the loads that do not belong to the element untouched, and the new ones. `newId` hands
 * out load ids.
 */
export function splitElementLoads(
  loads: readonly Load[],
  elementId: number,
  bounds: readonly number[],
  segmentIds: readonly number[],
  newId: () => number,
): { kept: Load[]; added: Load[] } {
  const kept: Load[] = [];
  const added: Load[] = [];
  const L = bounds[bounds.length - 1]!;
  const onThis = (l: Load) => (l.data as { elementId?: number }).elementId === elementId
    && (l.type === 'distributed' || l.type === 'pointOnElement' || l.type === 'thermal'
      || l.type === 'distributed3d' || l.type === 'pointOnElement3d');

  for (const l of loads) {
    if (!onThis(l)) { kept.push(l); continue; }
    switch (l.type) {
      case 'distributed': {
        const d = l.data as DistributedLoad;
        for (let k = 0; k < segmentIds.length; k++) {
          const c = clipTrapezoid(d.a ?? 0, d.b ?? L, [[d.qI, d.qJ]], bounds[k]!, bounds[k + 1]!);
          if (!c) continue;
          const { id: _id, elementId: _e, a: _a, b: _b, qI: _qi, qJ: _qj, ...meta } = d;
          const data: DistributedLoad = { ...meta, id: newId(), elementId: segmentIds[k]!, qI: c.values[0]![0], qJ: c.values[0]![1] };
          if (c.a !== undefined) data.a = c.a;
          if (c.b !== undefined) data.b = c.b;
          added.push({ type: 'distributed', data });
        }
        break;
      }
      case 'distributed3d': {
        const d = l.data as DistributedLoad3D;
        for (let k = 0; k < segmentIds.length; k++) {
          const c = clipTrapezoid(d.a ?? 0, d.b ?? L, [[d.qYI, d.qYJ], [d.qZI, d.qZJ]], bounds[k]!, bounds[k + 1]!);
          if (!c) continue;
          const { id: _id, elementId: _e, a: _a, b: _b, ...meta } = d;
          const data: DistributedLoad3D = {
            ...meta, id: newId(), elementId: segmentIds[k]!,
            qYI: c.values[0]![0], qYJ: c.values[0]![1], qZI: c.values[1]![0], qZJ: c.values[1]![1],
          };
          if (c.a !== undefined) data.a = c.a;
          if (c.b !== undefined) data.b = c.b;
          added.push({ type: 'distributed3d', data });
        }
        break;
      }
      case 'pointOnElement': {
        const d = l.data as PointLoadOnElement;
        const k = segmentOf(bounds, d.a);
        added.push({ type: 'pointOnElement', data: { ...d, id: newId(), elementId: segmentIds[k]!, a: Math.max(0, d.a - bounds[k]!) } });
        break;
      }
      case 'pointOnElement3d': {
        const d = l.data as PointLoadOnElement3D;
        const k = segmentOf(bounds, d.a);
        added.push({ type: 'pointOnElement3d', data: { ...d, id: newId(), elementId: segmentIds[k]!, a: Math.max(0, d.a - bounds[k]!) } });
        break;
      }
      case 'thermal': {
        const d = l.data as ThermalLoad;
        for (const sid of segmentIds) added.push({ type: 'thermal', data: { ...d, id: newId(), elementId: sid } });
        break;
      }
    }
  }
  return { kept, added };
}

const NO_RELEASE: Release = { my: false, mz: false, t: false };

/**
 * The fields segment `k` of `count` takes from the original member, node ids aside.
 *
 * `reinforcement` is left out on purpose; see the module note.
 */
export function segmentFields(elem: Element, k: number, count: number, t0 = k / count, t1 = (k + 1) / count): Omit<Element, 'id' | 'nodeI' | 'nodeJ'> {
  const first = k === 0, last = k === count - 1;
  const { id: _id, nodeI: _i, nodeJ: _j, reinforcement: _r, releaseI, releaseJ, jointI, jointJ, offset, ...whole } = elem;
  const out: Omit<Element, 'id' | 'nodeI' | 'nodeJ'> = {
    ...whole,
    releaseI: first ? { ...(releaseI ?? NO_RELEASE) } : { ...NO_RELEASE },
    releaseJ: last ? { ...(releaseJ ?? NO_RELEASE) } : { ...NO_RELEASE },
  };
  if (first && jointI) out.jointI = JSON.parse(JSON.stringify(jointI));
  if (last && jointJ) out.jointJ = JSON.parse(JSON.stringify(jointJ));
  if (offset) {
    const o: NonNullable<Element['offset']> = { frame: offset.frame };
    const at = (t: number) => ({
      x: (1 - t) * (offset.i?.x ?? 0) + t * (offset.j?.x ?? 0),
      y: (1 - t) * (offset.i?.y ?? 0) + t * (offset.j?.y ?? 0),
      z: (1 - t) * (offset.i?.z ?? 0) + t * (offset.j?.z ?? 0),
    });
    const i = at(t0), j = at(t1);
    if (Math.hypot(i.x, i.y, i.z) > EPS) o.i = i;
    if (Math.hypot(j.x, j.y, j.z) > EPS) o.j = j;
    if (o.i || o.j) out.offset = o;
  }
  if (whole.arc) out.arc = JSON.parse(JSON.stringify(whole.arc));
  return out;
}

/** Loads are measured along the flexible segment, which may differ from the node-to-node line. */
export function flexibleMemberLength(
  elem: Element,
  ni: { id: number; x: number; y: number; z?: number },
  nj: { id: number; x: number; y: number; z?: number },
  sectionRotation = 0,
): number {
  const a = { ...ni, z: ni.z ?? 0 }, b = { ...nj, z: nj.z ?? 0 };
  if (elem.offset) {
    const localY = elem.localYx === undefined ? undefined
      : { x: elem.localYx, y: elem.localYy ?? 0, z: elem.localYz ?? 0 };
    const axes = computeLocalAxes3D(a, b, localY, (elem.rollAngle ?? 0) + sectionRotation);
    for (const [point, offset] of [[a, elem.offset.i], [b, elem.offset.j]] as const) {
      if (!offset) continue;
      const v = offsetVecToSolver(offset, elem.offset.frame, axes);
      point.x += v.x; point.y += v.y; point.z += v.z;
    }
  }
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
