/**
 * A curved member, as an arc the model can actually solve.
 *
 * ── Why this is discretisation and not a curved element ────────────
 *
 * The solver has straight frame elements and no curved beam. Adding one means
 * a new element formulation in the Rust engine, which is out of scope here and
 * would be the wrong first move anyway: every commercial package models a
 * curved member by SUBDIVIDING it, because a straight-element chain converges
 * to the arc quickly, carries the same section along it, and needs nothing the
 * rest of the pipeline does not already understand — diagrams, verification,
 * detailing and the results tables all work on straight members and keep
 * working.
 *
 * So an arc is authored once and MATERIALISED as `n` members. What the reader
 * chose is remembered on every segment (`arcId`, plus the arc's geometry), so
 * the curve can be re-meshed, edited or deleted as one thing later rather than
 * becoming twelve unrelated bars the moment it is drawn.
 *
 * ── Choosing the arc ───────────────────────────────────────────────
 *
 * Three points, because that is what an engineer has: the two ends, and a
 * point the curve must pass through. A radius is offered too — it is what a
 * drawing states — and the two are the same arc expressed differently. What
 * is NOT offered is a tangent-and-sweep form: it is exact, it is what a CAD
 * kernel wants, and it is not how anybody describes a curved beam.
 *
 * Does NOT touch the solver.
 */
import { computeLocalAxes3D } from '../engine/local-axes-3d';

export interface Vec3 { x: number; y: number; z: number }

export interface ArcSpec {
  /** Start, a point ON the arc between them, and the end. */
  start: Vec3;
  through: Vec3;
  end: Vec3;
  /** How many straight members the arc becomes. */
  segments: number;
}

export interface ArcGeometry {
  centre: Vec3;
  radius: number;
  /** Total swept angle, radians. */
  sweep: number;
  /** Arc length, m. */
  length: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len = (a: Vec3): number => Math.sqrt(dot(a, a));

/**
 * The circle through three points, in the plane they define.
 *
 * Null when they are collinear — which is not an error: three points in a line
 * describe a straight member, and the caller should draw one rather than an
 * arc of infinite radius.
 */
export function arcThroughThree(p1: Vec3, p2: Vec3, p3: Vec3): ArcGeometry | null {
  const u = sub(p2, p1);
  const v = sub(p3, p1);
  const n = cross(u, v);
  const n2 = dot(n, n);
  if (n2 < 1e-20) return null; // collinear: a straight member, not an arc

  /*
   * The circumcentre, by the standard vector construction:
   *
   *     C = A + ( |u|²(v × n) + |v|²(n × u) ) / 2|n|²
   *
   * It divides only by |n|², which is zero exactly when the points are
   * collinear — the case already refused above.
   */
  const u2 = dot(u, u);
  const v2 = dot(v, v);
  const centre = add(p1, mul(add(mul(cross(v, n), u2), mul(cross(n, u), v2)), 1 / (2 * n2)));
  const radius = len(sub(p1, centre));

  /* The swept angle from p1 to p3 THE WAY ROUND THAT PASSES THROUGH p2 —
     which is the whole reason the middle point is asked for. */
  const a = sub(p1, centre);
  const b = sub(p2, centre);
  const c = sub(p3, centre);
  const axis = mul(n, 1 / Math.sqrt(n2));
  const angle = (from: Vec3, to: Vec3): number => {
    const cosA = Math.max(-1, Math.min(1, dot(from, to) / (len(from) * len(to))));
    const raw = Math.acos(cosA);
    return dot(cross(from, to), axis) >= 0 ? raw : 2 * Math.PI - raw;
  };
  const sweep = angle(a, b) + angle(b, c);
  return { centre, radius, sweep, length: radius * sweep };
}

/**
 * The points along the arc, ends included.
 *
 * `segments + 1` of them, so `segments` members join them. Rotating the start
 * vector about the plane normal rather than interpolating positions: a linear
 * interpolation would put every intermediate point INSIDE the circle, which is
 * a chain of chords pretending to be an arc.
 */
export function arcPoints(spec: ArcSpec): Vec3[] {
  const n = Math.max(1, Math.floor(spec.segments));
  const geo = arcThroughThree(spec.start, spec.through, spec.end);
  if (!geo) {
    /* Collinear: the honest answer is the straight line, evenly divided. */
    const out: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({
        x: spec.start.x + (spec.end.x - spec.start.x) * t,
        y: spec.start.y + (spec.end.y - spec.start.y) * t,
        z: spec.start.z + (spec.end.z - spec.start.z) * t,
      });
    }
    return out;
  }

  const u = sub(spec.through, spec.start);
  const v = sub(spec.end, spec.start);
  const normal = cross(u, v);
  const axis = mul(normal, 1 / len(normal));
  const r0 = sub(spec.start, geo.centre);

  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (geo.sweep * i) / n;
    /* Rodrigues' rotation of the start radius about the plane normal. */
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const rot = add(
      add(mul(r0, cosA), mul(cross(axis, r0), sinA)),
      mul(axis, dot(axis, r0) * (1 - cosA)),
    );
    out.push(add(geo.centre, rot));
  }
  /* The ends are exact by construction; make them exact in floating point too,
     so a member drawn to an existing node lands ON it. */
  out[0] = { ...spec.start };
  out[out.length - 1] = { ...spec.end };
  return out;
}

/**
 * The local-y reference every member of an arc takes: the same section orientation relative to
 * the curve on all of them (#418, SP-15).
 *
 * A curved member is one bar bent in its plane, so its section does not roll along it. Each
 * member gets local y = a·n + b·(n × ex), n the unit normal of the arc's plane and ex the member's
 * axis: the angle between local y and the plane normal is the same on every member. (a, b) are
 * those of the default rule (local z = global up projected off the axis) on the arc's tangent at
 * the middle of its sweep. A plan curve so keeps local z vertical on every member, as the default
 * rule gives it, and an arch keeps local y normal to its plane on every member — the default rule
 * alone turns the near-vertical members at the springings of an arch by 90° (it switches to a
 * global-X reference within 2.56° of vertical), swapping Iy and Iz on them unless the arch lies
 * in the X–Z plane. Mirrors `ArcSectionFrame` in engine/src/element/curved_beam.rs.
 *
 * Null for collinear points (a straight member keeps the default axes) or a member with no
 * length in the plane.
 */
export function arcMemberLocalY(spec: Pick<ArcSpec, 'start' | 'through' | 'end'>, nodeI: Vec3, nodeJ: Vec3): Vec3 | null {
  const geo = arcThroughThree(spec.start, spec.through, spec.end);
  if (!geo) return null;
  const nRaw = cross(sub(spec.through, spec.start), sub(spec.end, spec.start));
  const n = mul(nRaw, 1 / len(nRaw));
  // Tangent at the middle of the sweep: the start radius turned by sweep/2 about n, then n × it.
  const r0 = sub(spec.start, geo.centre);
  const h = geo.sweep / 2;
  const rMid = add(add(mul(r0, Math.cos(h)), mul(cross(n, r0), Math.sin(h))), mul(n, dot(n, r0) * (1 - Math.cos(h))));
  const tRaw = cross(n, rMid);
  const t = mul(tRaw, 1 / len(tRaw));
  let a: number, b: number;
  if (Math.abs(t.z) > 0.999) {
    // The default rule's near-vertical branch depends on the plan orientation; a plane holding
    // a vertical tangent is vertical, and an arch in it has local y along the plane normal.
    a = 1; b = 0;
  } else {
    // Default rule on t: ez = up projected off t, ey = ez × t.
    const ez0 = sub({ x: 0, y: 0, z: 1 }, mul(t, t.z));
    const ey0 = cross(mul(ez0, 1 / len(ez0)), t);
    const m = cross(n, t);
    a = dot(ey0, n); b = dot(ey0, m);
    const l = Math.hypot(a, b);
    a /= l; b /= l;
  }
  const d = sub(nodeJ, nodeI);
  // A member whose ends are no longer on the arc (its nodes were moved) is not a segment of it.
  const offArc = (p: Vec3) => {
    const r = sub(p, geo.centre);
    return !(Math.abs(dot(r, n)) <= 1e-3 * geo.radius && Math.abs(len(r) - geo.radius) <= 1e-3 * geo.radius);
  };
  if (offArc(nodeI) || offArc(nodeJ)) return null;
  const ex0 = sub(d, mul(n, dot(d, n)));
  const l = len(ex0);
  if (!(l > 1e-12)) return null;
  const mi = cross(n, mul(ex0, 1 / l));
  // Exactly perpendicular to the actual member, which may sit off the plane by the tolerance.
  const y = add(mul(n, a), mul(mi, b));
  const dh = mul(d, 1 / len(d));
  const yp = sub(y, mul(dh, dot(y, dh)));
  return mul(yp, 1 / len(yp));
}

/**
 * `arcMemberLocalY`, but only where it differs from the default axes; null where the default rule
 * already gives the arc's orientation (every member of a plan curve, most members of an arch).
 *
 * The arc tool and the migration store only these, so a member keeps automatic axes wherever they
 * are right. That matters beyond tidiness: a flat model drawn in X–Y is embedded in X–Z for the
 * 3D solve, where automatic axes follow the projection and a stored X–Y reference would not.
 */
export function arcMemberLocalYOverride(
  spec: Pick<ArcSpec, 'start' | 'through' | 'end'>, nodeI: Vec3, nodeJ: Vec3,
  /** Only where the axes are turned (Iy and Iz swapped), not merely reversed. */
  onlyTurned = false,
): Vec3 | null {
  const ly = arcMemberLocalY(spec, nodeI, nodeJ);
  if (!ly) return null;
  try {
    const [ni, nj] = [{ id: 0, ...nodeI }, { id: 1, ...nodeJ }];
    const d = computeLocalAxes3D(ni, nj).ey;
    const a = computeLocalAxes3D(ni, nj, ly).ey;
    const c = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
    return (onlyTurned ? Math.abs(c) : c) > 1 - 1e-9 ? null : ly;
  } catch {
    return null; // a zero-length member: validation reports it
  }
}

/** End releases, semi-rigid ends, offsets or stiffness factors: all given in local axes. */
function hasOwnLocalData(e: ArcMember): boolean {
  const released = (r?: object) => !!r && Object.values(r).some((v) => v === true);
  return released(e.releaseI) || released(e.releaseJ) || e.semiRigid != null || e.offset != null || e.stiffness != null;
}

/** What `migrateArcLocalAxes` reads and writes of a member. */
interface ArcMember {
  nodeI: number; nodeJ: number;
  arc?: { spec: ArcSpec; axes?: 1 };
  /** Member data given in its local axes: a member with any of it is not migrated. */
  releaseI?: object; releaseJ?: object;
  semiRigid?: unknown; offset?: unknown; stiffness?: unknown;
  localYx?: number; localYy?: number; localYz?: number;
  rollAngle?: number;
}

/**
 * Read-migration for arcs drawn before #418: their members were left on the default local axes,
 * which turns the near-vertical members of an arch by 90° (Iy and Iz swapped on them). Each
 * member tagged with an arc and with no orientation of its own (no local y, no roll) takes
 * `arcMemberLocalY` — only where its axes are turned (Iy and Iz swapped), so a plan curve, whose
 * axes the default rule already gives, and a member whose axes are merely reversed are left as
 * they are; members whose ends are no longer on the arc, and members with local data
 * (`hasLocalData`), too. Runs once per member: every arc member it looks at is
 * marked `arc.axes = 1` (as the arc tool marks the members it builds), and marked members are
 * never looked at again, so a member later set back to automatic axes stays so through undo, redo
 * and reopening. Returns how many members changed. Mutates `elements`.
 */
export function migrateArcLocalAxes(
  elements: Iterable<[number, ArcMember]>,
  nodes: ReadonlyMap<number, { x: number; y?: number; z?: number }>,
  /**
   * Members that local data refers to (a member load, a support in member axes). Left as they
   * are, like members with releases, semi-rigid ends, offsets or stiffness factors of their own:
   * that data is in local axes and would turn with them, so the loading or the connections would
   * change on reopening. The re-check notice (`arc-member-local-axes`) still names the change.
   */
  hasLocalData: (id: number) => boolean = () => false,
): number {
  let changed = 0;
  const pos = (id: number): Vec3 | undefined => {
    const n = nodes.get(id);
    return n ? { x: n.x, y: n.y ?? 0, z: n.z ?? 0 } : undefined;
  };
  for (const [id, e] of elements) {
    if (!e.arc?.spec || e.arc.axes === 1) continue;
    e.arc = { ...e.arc, axes: 1 };
    if (hasLocalData(id) || hasOwnLocalData(e)) continue;
    if (e.localYx !== undefined || e.localYy !== undefined || e.localYz !== undefined) continue;
    if (e.rollAngle !== undefined && e.rollAngle !== 0) continue;
    const pi = pos(e.nodeI), pj = pos(e.nodeJ);
    if (!pi || !pj) continue;
    // Only members whose axes are turned: one merely reversed (local y and z both negated, e.g. the
    // springings of an X–Z arch) has the right stiffness, and flipping it would reverse the local
    // loads already on it.
    const ly = arcMemberLocalYOverride(e.arc.spec, pi, pj, true);
    if (!ly) continue;
    e.localYx = ly.x; e.localYy = ly.y; e.localYz = ly.z;
    changed++;
  }
  return changed;
}

/**
 * How far the chord of one segment falls inside the true arc, in metres.
 *
 * The number that answers "is twelve segments enough". A reader asked for a
 * curve and got a polygon; this says by how much, in the units the model is
 * drawn in, so the choice is informed rather than a feeling.
 */
export function chordError(geo: ArcGeometry, segments: number): number {
  const half = geo.sweep / (2 * Math.max(1, segments));
  return geo.radius * (1 - Math.cos(half));
}

/**
 * The fewest segments that keep the chord error under a tolerance.
 *
 * Bounded at 64: past that the member count costs more than the accuracy buys,
 * and a reader who genuinely needs more can say so.
 */
export function segmentsForTolerance(geo: ArcGeometry, toleranceM: number): number {
  for (let n = 1; n <= 64; n++) if (chordError(geo, n) <= toleranceM) return n;
  return 64;
}

/** What a materialised arc leaves in the model, so it can be found again. */
export interface ArcTag {
  /** Shared by every member of one curve. */
  arcId: number;
  /** The three points it was drawn from, so it can be re-meshed exactly. */
  spec: ArcSpec;
}

export interface ArcBuildTarget {
  addNode: (x: number, y: number, z: number) => number;
  addElement: (nodeI: number, nodeJ: number) => number;
  /** Called once per created member, with the tag to remember. */
  tag: (elementId: number, tag: ArcTag) => void;
  /**
   * Called for each created member whose automatic axes differ from the arc's orientation, with
   * its local-y reference (`arcMemberLocalYOverride`), so every member of the arc has the same
   * section orientation relative to the curve (#418). Not called where the automatic axes are
   * already right (a plan curve, most of an arch) nor for a straight (collinear) arc.
   */
  setLocalY?: (elementId: number, localY: Vec3) => void;
  /** Where a node is, for the local axes of the members joining existing nodes. */
  nodePosition?: (id: number) => Vec3 | undefined;
  /**
   * An existing node at this point, if there is one.
   *
   * Optional, and the reason it exists is not a nicety. The arc passes
   * THROUGH the middle point by construction, so an even segment count puts a
   * generated point exactly on the node that was picked to define it — and
   * two nodes in the same place analyse as two nodes. The arch would be cut
   * at its crown, the solve would succeed, and nothing on screen would say
   * so. Reusing whatever is already there is how that is avoided rather than
   * discovered.
   */
  nodeAt?: (x: number, y: number, z: number) => number | null;
}

/** Two points closer than this are the same point, in metres. */
export const NODE_MERGE_TOL = 1e-6;

/**
 * Materialise an arc as members.
 *
 * `startNode`/`endNode` let a curve begin and end on nodes that already exist,
 * which is the ordinary case: an arch springs from columns that are already
 * there, and creating a second node in the same place would leave the
 * structure cut where it looks joined.
 */
export function buildArc(
  spec: ArcSpec,
  target: ArcBuildTarget,
  arcId: number,
  startNode?: number,
  endNode?: number,
): number[] {
  /*
   * An odd count puts no generated point on the middle one, so a node picked there was left
   * beside the arc joined to nothing. When one is there, the count goes up to the next even
   * number, and the arc passes through it.
   */
  if (spec.segments % 2 === 1 && (target.nodeAt?.(spec.through.x, spec.through.y, spec.through.z) ?? null) !== null) {
    spec = { ...spec, segments: spec.segments + 1 };
  }
  const pts = arcPoints(spec);
  const ids: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && startNode !== undefined) { ids.push(startNode); continue; }
    if (i === pts.length - 1 && endNode !== undefined) { ids.push(endNode); continue; }
    const existing = target.nodeAt?.(pts[i].x, pts[i].y, pts[i].z) ?? null;
    ids.push(existing ?? target.addNode(pts[i].x, pts[i].y, pts[i].z));
  }
  const made: number[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const id = target.addElement(ids[i], ids[i + 1]);
    target.tag(id, { arcId, spec });
    if (target.setLocalY) {
      const pi = target.nodePosition?.(ids[i]) ?? pts[i];
      const pj = target.nodePosition?.(ids[i + 1]) ?? pts[i + 1];
      const ly = arcMemberLocalYOverride(spec, pi, pj);
      if (ly) target.setLocalY(id, ly);
    }
    made.push(id);
  }
  return made;
}
