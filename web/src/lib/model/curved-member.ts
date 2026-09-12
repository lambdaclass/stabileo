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
    made.push(id);
  }
  return made;
}
