/**
 * The picture beside a schedule row: what the bender actually bends.
 *
 * ── What a shape code is not ───────────────────────────────────────
 *
 * `shapeCode` returns `straight`, `LH90`, `UH135H135`, `bent3`. Those are grouping keys —
 * `assignMarks` needs them to decide which bars are the same fabricated item — and they are
 * what the schedule printed in its Shape column. As a fabrication instruction they say almost
 * nothing: `LH90` is one leg, one bend and a hook, and it does not say how long the leg is,
 * which way the hook turns, or how much steel is in it. A bender reading it has to open the
 * elevation, find a bar with that mark, and measure.
 *
 * A bending schedule's shape column is a DIAGRAM with the leg lengths on it. That is the whole
 * of what this module produces.
 *
 * ── Drawn in the bending plane, or not drawn ───────────────────────
 *
 * A bar is bent in one plane. The schedule diagram is that plane seen square on, which is why a
 * stirrup comes out as a rectangle rather than as the parallelogram an elevation gives it.
 *
 * Not every bar HAS one. A cranked bar that steps sideways as well as up is bent about two
 * axes, and there is no plane containing it. Flattening it anyway would put a shape on the
 * schedule that no bender can make and that a checker cannot tell from a real one — so this
 * measures the out-of-plane deviation and REFUSES when it is real, exactly as
 * `membersFromModel` refuses a section it cannot describe. The row then shows its shape code
 * and says the diagram is unavailable, which is a smaller loss than a wrong picture.
 *
 * ── The hooks are the exception, and it is the schedule's own ──────
 *
 * A closed tie's 135° hooks turn INTO the concrete core — out of the plane of the tie, by
 * design and by §25.7.2.3. Measured against the whole path, every stirrup in the model is
 * therefore non-planar, and the first version of this module refused all 8 212 of them: the
 * shapes a bender bends most were the ones with no picture.
 *
 * They are not a second bending axis. They are the ends, and every bending schedule ever
 * printed draws them folded into the plane of the body and dimensions them by their extension
 * — which is what a bender sets the machine to. So planarity is measured over the BODY, the
 * hooks are projected in, and the row SAYS they were folded. What is refused is a body that is
 * out of plane, which is the case the check was written for.
 *
 * ── Lengths are the drawn geometry's, not the schedule's ───────────
 *
 * Each leg is measured off the same `BarPath` the elevation draws and the clash check
 * measured. Their sum is the straight steel; the difference against `cuttingLength` is the
 * steel in the bends, which is stated rather than distributed into the legs — a bender cuts to
 * the cutting length and bends to the legs, and quietly padding the legs to make them add up
 * would produce a bar that is right on paper and long in the shop.
 *
 * Pure: no store, no runes, no DOM. Emits geometry; the component draws it.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import { hookDevelopedLength, samplePath } from '../../codes/cirsoc201/bar-geometry';
import type { Pt2 } from './drawings';

/**
 * How far out of its own plane a bar may wander and still be drawn flat, m.
 *
 * One millimetre. Bending geometry is authored in millimetres and `samplePath`'s own chord
 * tolerance is five, so anything under this is arithmetic noise rather than a second bending
 * axis. A cranked bar that steps 40 mm sideways is two orders of magnitude past it.
 */
export const PLANARITY_TOLERANCE = 0.001;

/** Why a bar has no schedule diagram. */
export type RcShapeRefusal = 'nonPlanar' | 'degenerate';

export interface RcShapeLeg {
  /** Length of the straight run, m. */
  lengthM: number;
  /** Where the label sits, in the diagram's own coordinates. */
  at: Pt2;
  /** True when the leg runs more across the diagram than up it. Drives label placement. */
  horizontal: boolean;
}

/** A hook, as the schedule dimensions it: by the angle turned and the tail left. */
export interface RcShapeHook {
  angleDeg: number;
  /** Straight tail beyond the bend, m. What a bender sets the machine to. */
  extensionM: number;
}

export interface RcShapeDiagram {
  /** The centreline in the bending plane, normalised to fit a unit-height box. */
  points: Pt2[];
  /**
   * The end hooks, when there are any — start first.
   *
   * Dimensioned rather than measured off the drawing, because they are drawn FOLDED into the
   * plane of the body and a folded hook is foreshortened. The number is the one a bender uses.
   */
  hooks: { start: RcShapeHook | null; end: RcShapeHook | null };
  /**
   * True when a hook really did have to be folded to be drawn.
   *
   * Stated on the row. Every closed tie's 135° hooks turn into the core, so this is the common
   * case rather than an exception — and a diagram that quietly flattened them would be showing
   * a flat hook where the steel turns out of the page.
   */
  hooksFolded: boolean;
  /** The straight runs, in order along the bar, with their true lengths. */
  legs: RcShapeLeg[];
  /** Sum of the legs, m. Straight steel only. */
  straightM: number;
  /**
   * Steel in the bends, m: the cutting length less the straight runs.
   *
   * Stated separately rather than folded into the legs. A bender cuts to the cutting length
   * and bends to the leg dimensions, and padding the legs so the two agree would produce a bar
   * that is right on the schedule and long in the shop.
   */
  bendsM: number;
  /** The box `points` occupies, so a caller can size a viewBox without re-scanning. */
  extent: { min: Pt2; max: Pt2 };
}

export type RcShapeResult =
  | { ok: true; diagram: RcShapeDiagram }
  | { ok: false; reason: RcShapeRefusal };

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Point3, b: Point3): Point3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function norm(a: Point3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/**
 * The plane a bar is bent in: an origin and two orthonormal axes.
 *
 * ── Why the axes are chosen and not assumed ────────────────────────
 *
 * The first axis runs along the bar's longest straight, so a stirrup's diagram comes out with
 * its long side across the page and a hooked bar with its shaft along it. Picking the first
 * segment instead would rotate every diagram by whatever the generator happened to emit first,
 * and two marks of the same shape would be drawn at two angles.
 *
 * The normal is the largest cross product found against that axis — largest, not first,
 * because a nearly-parallel pair gives a normal made almost entirely of floating-point noise,
 * and the planarity test below would then be measuring the noise.
 *
 * `null` when no two directions in the bar are independent, which is a straight bar: it is
 * planar in every plane, and the caller handles it without needing one chosen.
 */
function bendingPlane(pts: readonly Point3[]): { u: Point3; v: Point3 } | null {
  // The longest straight run decides the first axis.
  let u: Point3 | null = null;
  let best = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = sub(pts[i + 1], pts[i]);
    const l = norm(d);
    if (l > best) { best = l; u = { x: d.x / l, y: d.y / l, z: d.z / l }; }
  }
  if (!u || best < 1e-9) return null;

  let n: Point3 | null = null;
  let bestN = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = cross(u, sub(pts[i + 1], pts[i]));
    const l = norm(c);
    if (l > bestN) { bestN = l; n = { x: c.x / l, y: c.y / l, z: c.z / l }; }
  }
  if (!n || bestN < 1e-9) return null;

  return { u, v: cross(n, u) };
}

/** The end hooks a bar declares, as the schedule dimensions them. */
function hooksOf(bar: BarPath): { start: RcShapeHook | null; end: RcShapeHook | null } {
  const of = (t: BarPath['startTreatment']): RcShapeHook | null =>
    (t.kind === 'hook'
      ? { angleDeg: t.hook.angle, extensionM: t.hook.extension }
      : null);
  return { start: of(bar.startTreatment), end: of(bar.endTreatment) };
}

/**
 * The path with each declared hook's developed length trimmed off its end.
 *
 * Trimmed by ARC LENGTH along the sampled centreline, because that is the quantity
 * `hookDevelopedLength` reports — arc plus extension — so what comes off is exactly the hook.
 * Returns the whole path when the trim would leave fewer than two points: a bar that is all
 * hook has no body to fit a plane to, and fitting one to nothing is how a refusal turns into a
 * random answer.
 */
function trimHooks(pts: readonly Point3[], bar: BarPath): readonly Point3[] {
  const startLen = bar.startTreatment.kind === 'hook'
    ? hookDevelopedLength(bar.startTreatment.hook) : 0;
  const endLen = bar.endTreatment.kind === 'hook'
    ? hookDevelopedLength(bar.endTreatment.hook) : 0;
  if (startLen <= 0 && endLen <= 0) return pts;

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + norm(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  const from = startLen;
  const to = total - endLen;
  if (!(to > from)) return pts;

  const body = pts.filter((_, i) => cum[i] >= from - 1e-9 && cum[i] <= to + 1e-9);
  return body.length >= 2 ? body : pts;
}

/**
 * The diagram for one bar, or the reason there is none.
 *
 * `sampled` is `samplePath`'s output — the same polyline the elevation draws and the clash
 * check measured. Taken as an argument rather than resampled so a caller that already has it
 * does not pay twice, and so a test can hand in a shape without building a `BarPath`.
 */
export function rcShapeDiagram(bar: BarPath, sampled?: readonly Point3[]): RcShapeResult {
  const pts = sampled ?? samplePath(bar);
  if (pts.length < 2) return { ok: false, reason: 'degenerate' };

  /*
   * The BODY: the path with the hook lengths trimmed off each end.
   *
   * `hookDevelopedLength` is the arc plus the tail, measured along the centreline, so trimming
   * that much of the sampled path removes exactly the hook and nothing else. Falls back to the
   * whole path when trimming would leave fewer than two points — a bar that is all hook, which
   * is not a shape worth fitting a plane to.
   */
  const body = trimHooks(pts, bar);
  const plane = bendingPlane(body);

  /*
   * A straight bar has no second direction, so no plane is chosen and none is needed: it is
   * one leg, drawn as one line. Handled here rather than falling through, because the general
   * path would divide by a zero-height extent.
   */
  if (!plane) {
    const lengthM = norm(sub(pts[pts.length - 1], pts[0]));
    if (lengthM < 1e-9) return { ok: false, reason: 'degenerate' };
    return {
      ok: true,
      diagram: {
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        hooks: hooksOf(bar),
        hooksFolded: false,
        legs: [{ lengthM, at: { x: 0.5, y: 0 }, horizontal: true }],
        straightM: lengthM,
        bendsM: Math.max(0, bar.cuttingLength - lengthM),
        extent: { min: { x: 0, y: 0 }, max: { x: 1, y: 0 } },
      },
    };
  }

  /*
   * Out of plane by more than a millimetre is a second bending axis, not noise — measured over
   * the BODY. The hooks are allowed to leave the plane and are folded into it below, which is
   * what a bending schedule does with them and why every stirrup in the model was being refused
   * before this distinction existed.
   */
  const origin = body[0];
  const n = cross(plane.u, plane.v);
  for (const p of body) {
    if (Math.abs(dot(sub(p, origin), n)) > PLANARITY_TOLERANCE) {
      return { ok: false, reason: 'nonPlanar' };
    }
  }
  const hooksFolded = pts.some(
    (p) => Math.abs(dot(sub(p, origin), n)) > PLANARITY_TOLERANCE);

  const flat: Pt2[] = pts.map((p) => {
    const d = sub(p, origin);
    return { x: dot(d, plane.u), y: dot(d, plane.v) };
  });

  /*
   * The legs: the STRAIGHT segments of the path, in order.
   *
   * Read off `bar.segments` and not off the sampled polyline. The polyline subdivides every
   * arc into chords, and a leg list built from it would report a 90° bend as eight legs of
   * three millimetres each — which is what a bender would then be asked to fabricate.
   */
  const legs: RcShapeLeg[] = [];
  let straightM = 0;
  for (const seg of bar.segments) {
    if (seg.kind !== 'straight') continue;
    const lengthM = norm(sub(seg.end, seg.start));
    if (lengthM < 1e-6) continue;
    straightM += lengthM;
    const mid = {
      x: (seg.start.x + seg.end.x) / 2,
      y: (seg.start.y + seg.end.y) / 2,
      z: (seg.start.z + seg.end.z) / 2,
    };
    const d = sub(mid, origin);
    const dir = sub(seg.end, seg.start);
    legs.push({
      lengthM,
      at: { x: dot(d, plane.u), y: dot(d, plane.v) },
      horizontal: Math.abs(dot(dir, plane.u)) >= Math.abs(dot(dir, plane.v)),
    });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of flat) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {
    ok: true,
    diagram: {
      points: flat,
      hooks: hooksOf(bar),
      hooksFolded,
      legs,
      straightM,
      bendsM: Math.max(0, bar.cuttingLength - straightM),
      extent: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } },
    },
  };
}

/**
 * The diagram for a MARK, from a representative bar.
 *
 * A mark groups identical fabricated items — same diameter, same cut length, same shape code —
 * so any one of them draws the schedule row and they cannot disagree about it. Which one is
 * `barIds[0]`, deterministically, because `assignMarks` sorts before it groups: a diagram that
 * changed with the iteration order would make two exports of one project differ.
 *
 * `null` when the mark names no bar this assembly holds — the same honest gap `rcConflictSide`
 * reports rather than papering over.
 */
export function rcShapeForMark(
  barIds: readonly string[],
  barOf: (id: string) => BarPath | undefined,
): RcShapeResult | null {
  for (const id of barIds) {
    const bar = barOf(id);
    if (bar) return rcShapeDiagram(bar);
  }
  return null;
}
