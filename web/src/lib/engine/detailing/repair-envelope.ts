/**
 * The room a repair move has: the section a longitudinal bar must stay inside, and the lever
 * arm the design verified it at.
 *
 * ── Why the repair ladder needs this ───────────────────────────────
 *
 * `repairConflicts` separates two clashing bars by translating one of them (with its layer),
 * and until this module nothing bounded the translation by the concrete. Measured before it
 * existed (at f8fb3883): 28 beam bars of the 408-member frame (`rc-design-frame`) and 3 of the
 * two-bay span building at a 0,5 m mesh were left outside their section. Two mechanisms, both in
 * the ladder:
 *
 *   - a rung translated the SAME layer once per conflict it took part in, so a six-bar top mat
 *     at a joint with four clashes was lifted four times in one rung (e381's support mat:
 *     +3,5 mm, then +29,7 + 2,7 + 10,5 mm, 46 mm up against 43 of room, ending 0,333 m above
 *     the axis of a beam whose bars may sit 0,290 m above it);
 *   - the push is "away from the other bar", which for a bottom bar of a 20 cm beam crossed by
 *     the perpendicular beam's top bars at a roof joint is sideways: two 14,8 mm pushes took
 *     `e37-bot-cont-1` from 0,060 to 0,089 m off the axis against 0,063 of room.
 *
 * So every candidate move is judged here BEFORE it is accepted, against two limits:
 *
 *   section   every sampled point of the moved bar (hooks and bends included) inside the
 *             rectangle a bar of its diameter can occupy within the stirrup: cover to the
 *             outside of the transverse steel, the stirrup, half the bar — the face extents of
 *             `seatedLongitudinalHalfExtents`, with the corner bend cut off at the corner seat.
 *             Beams by their width and height about their axis; columns by b along x and h
 *             along y, the convention the column cage is built with. A point beyond a beam's
 *             ends is in the joint and is held to the column's plan and the beam's top.
 *   depth     no move of a flexural bar toward the member's interior: the design verified the
 *             steel at the effective depth it had when coordination began (`reverify` ran on
 *             it), and a translation that raises a bottom bar or lowers a top one takes lever arm
 *             the certificate never saw. Columns are judged on both plan axes. Translation never
 *             changes a bar's area, and a bar that cannot move inward cannot change face, so the
 *             area per face the design verified is kept by construction.
 *
 * A point that was already outside when the ladder received the bar (generator or user
 * placement, which `detailing.cover.violated` reports) may not get further out; it does not make
 * every move of that bar inadmissible, which would hide the generator's defect behind the
 * ladder's refusal.
 *
 * Pure: no store, no runes.
 */

import { samplePath, type BarPath, type Point3 } from '../../codes/cirsoc201/bar-geometry';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';

/** A member the envelope can bound a bar by. */
export interface EnvelopeMember {
  elementId: number;
  kind: 'beam' | 'column';
  /** Axis end points, m: the node coordinates the section is centred on. */
  start: Point3;
  end: Point3;
  /** Section width (b) and height (h), m. */
  b: number;
  h: number;
  cover: number;
  stirrupDiaMm: number;
}

/** Why a repair candidate was not accepted. */
export interface RepairRejection {
  /**
   * `outsideSection` a bar of the moved layer leaves the section; `depthReduced` it moves toward
   * the member's interior and gives up verified lever arm; `clearance` the move breaks or worsens
   * a §25.2 clearance to another bar; `locked` both bars were pinned; `cagePiece` one of them is a
   * stirrup or tie, which is never translated.
   */
  reason: 'outsideSection' | 'depthReduced' | 'clearance' | 'locked' | 'cagePiece';
  /** The bar that failed the test. */
  bar: string;
  /** The member it was judged against, when there is one. */
  element?: number;
  /** For `clearance`: the bar it would clash with. */
  with?: string;
  /** How much: m outside the section, m of depth given up, m of clearance short. */
  by: number;
}

/** The bound a repair move has to respect, for the bars of a set of members. */
export interface RepairEnvelope {
  /**
   * Why translating `bar` to `offset` is not admissible, or null when it is.
   *
   * `bar` is the bar as the ladder RECEIVED it — the geometry the design verified — and `offset`
   * the total translation the candidate would leave it at, so repeated moves are judged by where
   * the bar ends up, not one step at a time.
   */
  reject(bar: BarPath, offset: Point3): RepairRejection | null;
  /**
   * `dir` with its component toward the member's interior removed, for a flexural bar (not
   * normalised; zero when every component was inward).
   *
   * The ladder pushes a bar "away from the other one", and where the two sit at slightly
   * different heights that direction carries a vertical part: measured on the 408-member frame,
   * 1,3 to 7,8 mm of a bottom bar's push went UP, toward the neutral axis, on a move whose job
   * was lateral. Pushing within the layer's own plane separates the same pair without touching
   * the lever arm, so the ladder asks for the admissible part first and judges that.
   */
  admissible(bar: BarPath, dir: Point3): Point3;
}

/** Point tolerance, m: well under a millimetre, above floating-point noise on a 50 m model. */
const TOL = 1e-4;
/** A bar this close to an axis is on it: it has no inward side along that axis. */
const ON_AXIS = 1e-3;

interface Frame {
  m: EnvelopeMember;
  o: Point3;
  /** Along the axis, unit. */
  u: Point3;
  /** Across (b), unit. */
  t: Point3;
  /** Up (h), unit. */
  w: Point3;
  L: number;
  vertical: boolean;
}

const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

function frameOf(m: EnvelopeMember): Frame | null {
  const d = sub(m.end, m.start);
  const L = Math.hypot(d.x, d.y, d.z);
  if (!(L > 1e-9) || !(m.b > 0) || !(m.h > 0)) return null;
  const u = { x: d.x / L, y: d.y / L, z: d.z / L };
  const vertical = Math.abs(u.z) > 0.999;
  if (vertical) {
    // A column: b along x, h along y, as `liftBarPositions` and the joint ties lay the cage.
    return { m, o: m.start, u, t: { x: 1, y: 0, z: 0 }, w: { x: 0, y: 1, z: 0 }, L, vertical };
  }
  // A beam: across is horizontal and normal to the axis; up completes the frame.
  const th = Math.hypot(u.y, u.x);
  const t = { x: u.y / th, y: -u.x / th, z: 0 };
  const w = { x: t.y * u.z - t.z * u.y, y: t.z * u.x - t.x * u.z, z: t.x * u.y - t.y * u.x };
  return { m, o: m.start, u, t, w: w.z < 0 ? { x: -w.x, y: -w.y, z: -w.z } : w, L, vertical };
}

/**
 * How far a bar centre at (across, up) is outside the room a bar of this diameter has in the
 * section, m (≤ 0 inside): past a face's straight leg, or into the corner bend.
 */
function excess(f: Frame, diaMm: number, across: number, up: number): number {
  const seat = seatedLongitudinalHalfExtents(f.m.b, f.m.h, f.m.cover, f.m.stirrupDiaMm, diaMm);
  const a = Math.abs(across), v = Math.abs(up);
  return Math.max(
    a - seat.face.halfAcross,
    v - seat.face.halfUp,
    Math.min(a - seat.corner.halfAcross, v - seat.corner.halfUp),
  );
}

/**
 * The repair envelope of a set of members.
 *
 * Bars owned by no member here (slabs, walls, footings) are not bounded by it: the ladder
 * moves beam and column steel, and a bound invented for a family this module does not model
 * would reject or accept on nothing.
 */
export function buildRepairEnvelope(members: Iterable<EnvelopeMember>): RepairEnvelope {
  const frames = new Map<number, Frame>();
  const columnsAt = new Map<string, Frame[]>();
  const key = (p: Point3) => `${Math.round(p.x * 1e4)}|${Math.round(p.y * 1e4)}|${Math.round(p.z * 1e4)}`;
  for (const m of members) {
    const f = frameOf(m);
    if (!f) continue;
    frames.set(m.elementId, f);
    if (f.vertical) for (const p of [m.start, m.end]) columnsAt.set(key(p), [...(columnsAt.get(key(p)) ?? []), f]);
  }
  const samples = new WeakMap<BarPath, Point3[]>();
  const sampled = (bar: BarPath) => {
    let s = samples.get(bar);
    if (!s) { s = samplePath(bar, 0.01); samples.set(bar, s); }
    return s;
  };

  /** Worst excess of a point among the members that hold it, and the member; null if none does. */
  const judge = (owners: Frame[], p: Point3, diaMm: number): { e: number; element: number } | null => {
    let best: { e: number; element: number } | null = null;
    const take = (e: number, element: number) => { if (!best || e < best.e) best = { e, element }; };
    for (const f of owners) {
      const r = sub(p, f.o);
      const s = dot(r, f.u);
      if (f.vertical) {
        // A column holds the points within its own storey; a lap or a dowel past it belongs to the
        // next lift, judged by that lift's own member when it owns the bar.
        if (s < -TOL || s > f.L + TOL) continue;
        take(excess(f, diaMm, dot(r, f.t), dot(r, f.w)), f.m.elementId);
        continue;
      }
      if (s >= -TOL && s <= f.L + TOL) { take(excess(f, diaMm, dot(r, f.t), dot(r, f.w)), f.m.elementId); continue; }
      // Past the beam's end: inside the joint. Held to the column's plan and to the beam's top;
      // below the beam the column continues, and a hook turned down into it is where it belongs.
      const node = s < 0 ? f.m.start : f.m.end;
      const cols = columnsAt.get(key(node)) ?? [];
      const top = dot(r, f.w) - seatedLongitudinalHalfExtents(f.m.b, f.m.h, f.m.cover, f.m.stirrupDiaMm, diaMm).face.halfUp;
      if (cols.length === 0) { take(excess(f, diaMm, dot(r, f.t), dot(r, f.w)), f.m.elementId); continue; }
      for (const c of cols) {
        const rc = sub(p, c.o);
        take(Math.max(excess(c, diaMm, dot(rc, c.t), dot(rc, c.w)), top), c.m.elementId);
      }
    }
    return best;
  };

  /**
   * The lever-arm axes of a bar, with the side of each it sits on: vertical for a beam, both plan
   * axes for a column. Read at the middle of the bar's longest straight, which is the bar's run.
   */
  const leverAxes = (bar: BarPath, owners: Frame[]): { f: Frame; axes: Array<{ ax: Point3; side: number }> } | null => {
    const run = bar.segments.filter((sg) => sg.kind === 'straight')
      .sort((p, q) => Math.hypot(q.end.x - q.start.x, q.end.y - q.start.y, q.end.z - q.start.z)
        - Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y, p.end.z - p.start.z))[0];
    if (!run) return null;
    const mid = { x: (run.start.x + run.end.x) / 2, y: (run.start.y + run.end.y) / 2, z: (run.start.z + run.end.z) / 2 };
    for (const f of owners) {
      const r = sub(mid, f.o);
      const s = dot(r, f.u);
      if (s < -TOL || s > f.L + TOL) continue;
      const axes = (f.vertical ? [f.t, f.w] : [f.w])
        .map((ax) => ({ ax, at: dot(r, ax) }))
        .filter((a) => Math.abs(a.at) > ON_AXIS)
        .map((a) => ({ ax: a.ax, side: Math.sign(a.at) }));
      return { f, axes };
    }
    return null;
  };
  const ownersOf = (bar: BarPath) => bar.ownerElementIds.map((id) => frames.get(id)).filter((f): f is Frame => !!f);

  return {
    reject(bar, offset) {
      if (bar.role !== 'longitudinal') return null;
      const owners = ownersOf(bar);
      if (owners.length === 0) return null;

      // ── Section ──
      // samplePath emits only the endpoints of a straight. A fused run can end in
      // two wide columns while crossing several narrower beams: checking only those
      // endpoints lets a lateral move leave every intervening span. Probe each owned
      // span's interval, using the candidate position so along-axis moves are bounded too.
      const points = [...sampled(bar)];
      for (const segment of bar.segments) {
        if (segment.kind !== 'straight') continue;
        const direction = sub(segment.end, segment.start);
        for (const f of owners) {
          if (f.vertical) continue;
          const start = dot(sub(add(segment.start, offset), f.o), f.u);
          const slope = dot(direction, f.u);
          let lo = 0, hi = 1;
          if (Math.abs(slope) < 1e-12) {
            if (start < 0 || start > f.L) continue;
          } else {
            const a = -start / slope, b = (f.L - start) / slope;
            lo = Math.max(0, Math.min(a, b)); hi = Math.min(1, Math.max(a, b));
            if (hi <= lo) continue;
          }
          for (const t of [lo, (lo + hi) / 2, hi]) points.push({
            x: segment.start.x + t * direction.x,
            y: segment.start.y + t * direction.y,
            z: segment.start.z + t * direction.z,
          });
        }
      }
      let worst: { by: number; element: number } | null = null;
      for (const p of points) {
        const after = judge(owners, add(p, offset), bar.diameterMm);
        if (!after || after.e <= TOL) continue;
        const before = judge(owners, p, bar.diameterMm);
        // Already outside where the ladder received it: it may stay, not get further out.
        if (before && after.e <= Math.max(TOL, before.e) + 1e-9) continue;
        if (!worst || after.e > worst.by) worst = { by: after.e, element: after.element };
      }
      if (worst) return { reason: 'outsideSection', bar: bar.id, element: worst.element, by: worst.by };

      // ── Depth: no move toward the interior of the member the design verified ──
      // The translation is rigid, so every point moves by the same amount.
      const lever = leverAxes(bar, owners);
      for (const { ax, side } of lever?.axes ?? []) {
        const inward = -side * dot(offset, ax);
        if (inward > 1e-6) return { reason: 'depthReduced', bar: bar.id, element: lever!.f.m.elementId, by: inward };
      }
      return null;
    },
    admissible(bar, dir) {
      if (bar.role !== 'longitudinal') return dir;
      const lever = leverAxes(bar, ownersOf(bar));
      let d = dir;
      for (const { ax, side } of lever?.axes ?? []) {
        const along = dot(d, ax);
        if (-side * along > 0) d = { x: d.x - along * ax.x, y: d.y - along * ax.y, z: d.z - along * ax.z };
      }
      return d;
    },
  };
}
