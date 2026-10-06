/**
 * Bar-to-bar collision detection with a broad-phase spatial index.
 *
 * The question this answers is the one a section check cannot: "will this cage actually
 * assemble on site?" Two Ø25 bars whose centrelines pass 20 mm apart both satisfy every
 * strength check and physically cannot both exist.
 *
 * Design decisions worth stating:
 *
 *   * A bar is treated as a swept capsule around its sampled centreline, not as a line.
 *     Clearance is measured surface to surface, which is what the code's clear-spacing
 *     rules and a steel fixer both mean.
 *
 *   * Bars that share an owner element and the same role and layer are NOT exempt from
 *     checking. The layout code is exactly what this is meant to catch.
 *
 *   * A collision is reported with the pair, the location and the shortfall, never as a
 *     bare boolean. "There is a clash" is not actionable; "these two bars are 12 mm
 *     apart at x = 2.35 m and need 25 mm" is.
 *
 *   * When the engine cannot resolve a clash it emits an explicit unresolved conflict.
 *     Silently dropping a bar to make the cage fit would be inventing a design.
 *
 * Complexity: the broad phase is a uniform spatial hash, so the pair test is
 * O(n · k) with k the local density rather than O(n²). On a joint with 40 incident bars
 * that is the difference between 1600 and roughly 200 narrow-phase tests.
 *
 * Pure: no store, no runes.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import { samplePath } from '../../codes/cirsoc201/bar-geometry';
import type { PairClass, PairClassification } from './classify';

export interface CollisionTolerances {
  /**
   * Fabrication and placement tolerance, m. Bars are never where the drawing says, so
   * a clearance check that assumes they are will pass cages that do not assemble.
   * Subtracted from the available clearance.
   */
  placement: number;
  /** Required clear distance between bar surfaces, m. Comes from the code spacing rule. */
  requiredClear: number;
  /** Clearances closer than this to the requirement are reported as marginal, not failed. */
  marginalBand: number;
}

export const DEFAULT_TOLERANCES: CollisionTolerances = {
  // ZERO by default. CIRSOC's minimum clear spacing IS the construction requirement, and
  // the regulation prescribes no further margin between parallel bars. A hardcoded 10 mm
  // here was silently deducted from every measured clearance, so a cage drawn exactly at
  // the code minimum failed its own check by that amount — every pair, every model.
  // A project that wants a more conservative cage raises `placement`; nothing has to argue
  // the default back down to what the code says.
  placement: 0,
  requiredClear: 0.025,
  marginalBand: 0.005,
};

/**
 * Chord tolerance for the collision sampler, m.
 *
 * ── Why it is not `samplePath`'s 5 mm default ──────────────────────
 *
 * The narrow phase tests straight segments between consecutive samples, so an arc is only
 * ever as accurate as the polyline standing in for it, and every chord cuts INSIDE the true
 * curve. At the 5 mm default a 135° stirrup hook on a Ø8 bar (r = 20 mm) is sampled as TWO
 * chords of 67,5°, each dipping `r(1 − cos 33,75°) = 3,37 mm` inside the bend.
 *
 * That error lands directly in the clearance. Measured on `rc-design-qa-8`: a column corner
 * bar seated in a joint tie's bend — designed contact, true clearance +0,08 mm under dense
 * resampling — was reported as interpenetrating by 3,17 mm, eight times over. The steel was
 * right and the ruler was wrong.
 *
 * The default was harmless while `samplePath` interpolated arcs linearly, because the whole
 * arc was already replaced by its chord and no tolerance could have helped. Once arcs became
 * real geometry the sampling tolerance became a real measurement error, so it is set here to
 * half a millimetre: below any fabrication tolerance, and a quarter of `CONTACT_ALLOWANCE`,
 * so it can never manufacture a contact or a clash on its own.
 */
export const COLLISION_CHORD_TOLERANCE = 0.0005;

export type ConflictSeverity = 'overlap' | 'clearance' | 'marginal';

export interface BarConflict {
  severity: ConflictSeverity;
  barA: string;
  barB: string;
  /** Midpoint between the two closest surface points, in model coordinates. */
  at: Point3;
  /** Surface-to-surface distance, m. Negative means the bars physically overlap. */
  clearance: number;
  /** Clearance the rule demanded at this point, m. */
  required: number;
  /** How far short, m. Always positive for a reported conflict. */
  shortfall: number;
  /** Element ids involved, for routing the conflict to a member in the UI. */
  elementIds: number[];
  /**
   * What the pair IS. Set when a classifier was supplied; without one every pair is
   * measured against a single rule, which is how ~11,000 "conflicts" on the flagship
   * turned out to include beam bars held to the column rule and crossing bars held to a
   * spacing rule that governs bars running alongside each other.
   */
  pairClass?: PairClass;
  /** i18n key naming the class, for the conflict list. */
  classLabelKey?: string;
}

const ZERO: Point3 = { x: 0, y: 0, z: 0 };

/** An axis-aligned box, in model coordinates. */
interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

/**
 * SQUARED gap between two boxes. Zero when they touch or overlap.
 *
 * Squared on purpose: this runs once per candidate segment pair — millions of times on the
 * flagship — and the caller only ever compares it against a threshold, so the square root is
 * pure cost. Measured, `Math.hypot` here ate most of what the rejection saved.
 */
function boxGapSq(a: Box, b: Box): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return dx * dx + dy * dy + dz * dz;
}

function boxOf(p: Point3, q: Point3): Box {
  return {
    minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x),
    minY: Math.min(p.y, q.y), maxY: Math.max(p.y, q.y),
    minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z),
  };
}

function boxUnion(boxes: readonly Box[]): Box {
  const out: Box = {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  };
  for (const b of boxes) {
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.minZ < out.minZ) out.minZ = b.minZ;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
    if (b.maxZ > out.maxZ) out.maxZ = b.maxZ;
  }
  return out;
}

/**
 * The largest clear distance any classification rule can demand, m.
 *
 * §25.2.3 is the strictest of them: `max(40 mm, 1,5·d_b, 4/3·d_agg)`. The aggregate term is
 * bounded here by 50 mm nominal, which is above any coarse aggregate the regulation
 * contemplates, so the result is an upper bound for every pair in the run rather than an
 * estimate. Used ONLY to decide what cannot possibly be reported — never as a requirement.
 */
function maxReportableClear(bars: readonly BarPath[], t: CollisionTolerances): number {
  const dMax = bars.reduce((m, b) => Math.max(m, b.diameterMm), 0) / 1000;
  return Math.max(0.040, 1.5 * dMax, (4 / 3) * 0.050, t.requiredClear);
}

interface SampledBar {
  path: BarPath;
  /** Chord-accurate samples. The narrow phase is exact on these segments. */
  points: Point3[];
  /**
   * The same polyline densified to one cell. Used ONLY to populate the spatial hash, so
   * a long segment occupies every cell it passes through. Feeding these to the narrow
   * phase instead would multiply the exact segment tests by ~50x for no added accuracy.
   */
  hashPoints: Point3[];
  radius: number;
  /** Box around each sampled segment, and around the whole bar. Built once, read many. */
  segBoxes: Box[];
  box: Box;
}

// ─── Broad phase ─────────────────────────────────────────────────

class SpatialHash {
  private readonly cells = new Map<number, { indices: number[]; lastQuery: number }>();
  private lastQuery = -1;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  bucketScans = 0;

  constructor(private readonly cell: number, private readonly deduplicateBuckets: boolean) {}

  /**
   * Cell key as a NUMBER, not a string.
   *
   * The key used to be `${cx},${cy},${cz}`. Every insert built one and every neighbourhood
   * lookup built twenty-seven more, which on the flagship is a million inserts and thirty
   * million string constructions per sweep — more than the geometry itself cost.
   *
   * This is the standard spatial hash mix. It can collide, and a collision is SAFE here: two
   * distant cells sharing a bucket only offer extra candidates, which the bounding-box
   * rejection and then the exact segment test discard. It can never hide a pair, which is the
   * only direction that would matter.
   */
  private key(x: number, y: number, z: number): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const cz = Math.floor(z / this.cell);
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) | 0;
  }

  private cellKey(cx: number, cy: number, cz: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) | 0;
  }

  insert(index: number, p: Point3): void {
    const k = this.key(p.x, p.y, p.z);
    const bucket = this.cells.get(k);
    if (bucket) {
      if (bucket.indices[bucket.indices.length - 1] !== index) bucket.indices.push(index);
    } else {
      this.cells.set(k, { indices: [index], lastQuery: -1 });
    }
  }

  /**
   * Add the candidates in the 27 cells around `p` to `out`, keeping only indices above
   * `above` so each pair is produced once.
   *
   * Appends each candidate once, using a sweep-local stamp array. This avoids repeated
   * Set insertions when a bar occupies many neighbouring buckets and preserves the
   * first-encounter order used by the narrow phase.
   */
  collectNear(p: Point3, above: number, out: number[], seen: Uint32Array): void {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const cz = Math.floor(p.z / this.cell);
    const previous = this.deduplicateBuckets && this.lastQuery === above;
    const px = this.lastX, py = this.lastY, pz = this.lastZ;
    this.lastQuery = above;
    this.lastX = cx; this.lastY = cy; this.lastZ = cz;
    // Consecutive samples often occupy the same cell (especially around bends).
    if (previous && cx === px && cy === py && cz === pz) return;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          // The preceding sample already queried these spatial cells. Avoid even the
          // hash lookup; bucket stamps below cover nonconsecutive revisits as well.
          if (previous && Math.abs(cx + dx - px) <= 1
            && Math.abs(cy + dy - py) <= 1 && Math.abs(cz + dz - pz) <= 1) continue;
          const bucket = this.cells.get(this.cellKey(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          // The hash is fully built before querying. Overlapping neighbourhoods can
          // therefore visit each bucket once per bar, preserving first-encounter order.
          // Hash collisions are safe too: the shared bucket contains BOTH cells' bars.
          if (this.deduplicateBuckets && bucket.lastQuery === above) continue;
          bucket.lastQuery = above;
          this.bucketScans++;
          for (const i of bucket.indices) {
            if (i <= above || seen[i] === above + 1) continue;
            seen[i] = above + 1;
            out.push(i);
          }
        }
      }
    }
  }
}

/**
 * Insert intermediate points so no gap exceeds `maxGap`.
 *
 * The narrow phase tests segments and is exact regardless; this exists purely so the
 * broad phase cannot miss a candidate pair. Points are added on the straight chord
 * between existing samples, which is where the bar already is for straight segments and
 * within the sampling chord error for arcs.
 */
function densify(points: readonly Point3[], maxGap: number): Point3[] {
  if (points.length === 0) return [];
  const out: Point3[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / maxGap));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  return out;
}

// ─── Narrow phase ────────────────────────────────────────────────

/** Unit direction of the sampled segment starting at `i`, or undefined if degenerate. */
function tangent(points: readonly Point3[], i: number): Point3 | undefined {
  const p = points[i];
  const q = points[i + 1];
  if (!p || !q) return undefined;
  const d = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
  const L = Math.hypot(d.x, d.y, d.z);
  return L < 1e-12 ? undefined : { x: d.x / L, y: d.y / L, z: d.z / L };
}

/** Squared distance between two segments, plus the midpoint of the closest approach. */
function segmentDistance(
  p1: Point3, q1: Point3, p2: Point3, q2: Point3,
): { distance: number; at: Point3 } {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;

  const EPS = 1e-12;
  let s = 0;
  let t = 0;

  if (a <= EPS && e <= EPS) {
    // Both degenerate to points.
    s = 0; t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= EPS) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const denom = a * e - b * b;
      s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }

  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  return {
    distance: Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z),
    at: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2, z: (c1.z + c2.z) / 2 },
  };
}

/** The closest approach between two bars, measured surface to surface. */
export interface SurfaceApproach {
  /** Surface-to-surface distance, m. Negative means the surfaces interpenetrate. */
  clearance: number;
  /** Midpoint between the two closest surface points, in model coordinates. */
  at: Point3;
  /** Unit tangents of the two bars AT that point, so a caller can tell a crossing from a run. */
  tangentA: Point3 | undefined;
  tangentB: Point3 | undefined;
}

/**
 * Measure the closest approach between two bars.
 *
 * ── Why this is exported rather than re-derived by callers ──────────
 *
 * `detectCollisions` only ever REPORTS pairs a classifier called reportable, and the two
 * relationships this codebase most needs to state positively — an orthogonal crossing and a
 * hook seated on the bar that carries it — are precisely the ones it drops. A caller that
 * wants to assert "these two surfaces touch, and do not interpenetrate" therefore has no
 * number to assert it with, and the obvious fix is to write a second sampler and a second
 * segment routine. Two rulers in one project eventually disagree, and they disagree about
 * contact, which is the measurement with the least margin in it.
 *
 * So the measurement is one function, used by the sweep above and by any caller that needs
 * the distance itself: same `samplePath`, same `COLLISION_CHORD_TOLERANCE`, same exact
 * segment-to-segment routine. A contact this reports at 0,0 mm is a contact the collision
 * pass measures at 0,0 mm.
 *
 * No tolerance of any kind is applied. This is the geometry; deciding what it MEANS —
 * `CONTACT_ALLOWANCE`, a placement allowance, a clause minimum — belongs to the caller.
 */
export function minSurfaceClearance(a: BarPath, b: BarPath): SurfaceApproach {
  const pa = samplePath(a, COLLISION_CHORD_TOLERANCE);
  const pb = samplePath(b, COLLISION_CHORD_TOLERANCE);
  const radii = a.diameterMm / 2000 + b.diameterMm / 2000;
  let worst: { clearance: number; at: Point3; m: number; n: number } | null = null;
  for (let m = 0; m + 1 < pa.length; m++) {
    for (let n = 0; n + 1 < pb.length; n++) {
      const { distance, at } = segmentDistance(pa[m], pa[m + 1], pb[n], pb[n + 1]);
      const clearance = distance - radii;
      if (worst === null || clearance < worst.clearance) worst = { clearance, at, m, n };
    }
  }
  if (worst === null) {
    return { clearance: Infinity, at: ZERO, tangentA: undefined, tangentB: undefined };
  }
  return {
    clearance: worst.clearance,
    at: worst.at,
    tangentA: tangent(pa, worst.m),
    tangentB: tangent(pb, worst.n),
  };
}

export interface CollisionResult {
  conflicts: BarConflict[];
  /** Bars checked. */
  barCount: number;
  /** Segment-pair tests actually performed. */
  narrowPhaseTests: number;
  /**
   * Bar pairs that reached the narrow phase. This is the number that measures the broad
   * phase: against n bars the naive count is n(n-1)/2.
   */
  barPairsTested: number;
  /** Nonempty spatial buckets scanned, including repeats when deduplication is disabled. */
  bucketScans: number;
  /** True when nothing worse than `marginal` was found. */
  constructible: boolean;
}

/**
 * Detect collisions in an assembly of bars.
 *
 * `requiredClearFor` lets the caller supply the code rule per pair, because the
 * requirement is not constant: two column longitudinal bars need
 * `max(40 mm, 1.5 d_b, 4/3 d_agg)` while a stirrup passing a main bar needs only
 * physical clearance. Defaults to the flat `tolerances.requiredClear`.
 */
/**
 * Everything `detectCollisions` can be told, by NAME.
 *
 * ── Why an options object and not positional parameters ────────────
 *
 * Because the positional form produced a real defect twice. `classifyFor` was inserted
 * ahead of `placementFor` in a later change, and `floor-design.ts` went on calling the
 * function with four arguments — so `placementFor` landed in the classifier's slot, every
 * pair returned a number where a `PairClassification` was expected, and the whole
 * whole-floor check silently inverted. Nothing failed loudly; the callback signatures are
 * close enough that TypeScript accepted the swap at the call site.
 *
 * Two callbacks of similar shape, in adjacent slots, where the wrong one still typechecks,
 * is a defect class rather than a defect. Naming the fields removes it: there is no
 * position to get wrong, and adding a fifth option can never re-order the other four.
 */
export interface DetectCollisionsOptions {
  tolerances?: CollisionTolerances;
  requiredClearFor?: (a: BarPath, b: BarPath) => number;
  /**
   * Classifies a pair given whether their surfaces interpenetrate. When supplied it
   * REPLACES `requiredClearFor` and can also declare a pair not reportable at all —
   * required containment and orthogonal crossings are relationships, not defects.
   */
  classifyFor?: (
    a: BarPath, b: BarPath, surfaceClearance: number,
    /**
     * Unit tangents of the two bars AT the closest approach.
     *
     * Whether two bars "run alongside each other" is a local question, and for anything but a
     * straight bar the whole-path chord does not answer it. A closed stirrup's first and last
     * points are its two hook tips, a few centimetres apart at one corner, so its end-to-end
     * direction is a 45° diagonal that describes no part of the bar. Measured: that made every
     * stirrup read as parallel to the column bars it crosses at a joint, and eight crossings
     * were held to §25.2.3's 40 mm column spacing instead of being recognised as crossings.
     */
    tangentA?: Point3, tangentB?: Point3,
  ) => PairClassification;
  /**
   * Per-pair placement tolerance override.
   *
   * The flat tolerance models two bars that are supposed to be a set distance apart and
   * might each be out of position. It does NOT model two bars that are supposed to be in
   * CONTACT — a slab mat's crossing bars are tied together, so there is no independent
   * placement error to allow for between them. Charging one turns every tie point into a
   * 10 mm interpenetration.
   */
  placementFor?: (a: BarPath, b: BarPath) => number;
  /**
   * Escape hatch for the equivalence gate, NOT a production knob.
   *
   * `prune: false` disables the bounding-box rejection and tests every segment pair
   * exhaustively, which is what this function did before the rejection existed.
   * `collision-equivalence.test.ts` runs both over the same inputs and requires identical
   * output, so the optimisation can never drift from the geometry it is supposed to preserve.
   */
  prune?: boolean;
  /** Equivalence-test escape hatch: restore repeated bucket scans without changing geometry. */
  deduplicateBuckets?: boolean;
  /** Test/reference path: enumerate every bar pair without the spatial hash. */
  broadPhase?: boolean;
}

export function detectCollisions(
  bars: readonly BarPath[],
  opts: DetectCollisionsOptions = {},
): CollisionResult {
  const tolerances = opts.tolerances ?? DEFAULT_TOLERANCES;
  const { requiredClearFor, classifyFor, placementFor } = opts;
  const raw = bars.map((path) => samplePath(path, COLLISION_CHORD_TOLERANCE));
  const maxRadius = bars.reduce((m, b) => Math.max(m, b.diameterMm / 2000), 0);

  // Larger cells reduce hash lookups and allocations along long bars. Exact distances
  // still use the original chord-accurate samples, never these broad-phase samples.
  const cell = 4 * Math.max(0.05, 2 * maxRadius + tolerances.requiredClear + tolerances.placement + 0.02);

  const sampled: SampledBar[] = bars.map((path, i) => {
    const pts = raw[i];
    const segBoxes: Box[] = [];
    for (let k = 0; k + 1 < pts.length; k++) segBoxes.push(boxOf(pts[k], pts[k + 1]));
    return {
      path,
      points: pts,
      // Half-cell spacing leaves room for the interaction distance: each closest point
      // is at most cell/4 from a hash sample. Their combined sampling displacement is
      // at most cell/2, leaving the other half for radii, clearance and placement.
      hashPoints: opts.broadPhase === false ? [] : densify(pts, cell / 2),
      radius: path.diameterMm / 2000,
      segBoxes,
      box: segBoxes.length > 0 ? boxUnion(segBoxes) : boxOf(pts[0] ?? ZERO, pts[0] ?? ZERO),
    };
  });

  const hash = new SpatialHash(cell, opts.deduplicateBuckets !== false);
  for (let i = 0; i < sampled.length; i++) {
    for (const p of sampled[i].hashPoints) hash.insert(i, p);
  }

  const prune = opts.prune !== false;
  /** Everything except the two radii, which vary per pair. */
  const maxClear = maxReportableClear(bars, tolerances);

  const conflicts = new Map<string, BarConflict>();
  let narrowPhaseTests = 0;
  let barPairsTested = 0;

  const seen = new Uint32Array(sampled.length);
  const candidates: number[] = [];
  for (let i = 0; i < sampled.length; i++) {
    const a = sampled[i];
    candidates.length = 0;
    if (opts.broadPhase === false) {
      for (let j = i + 1; j < sampled.length; j++) candidates.push(j);
    } else {
      for (const p of a.hashPoints) hash.collectNear(p, i, candidates, seen);
    }
    barPairsTested += candidates.length;

    for (const j of candidates) {
      const b = sampled[j];
      // Placement is needed before the sweep; `required` is resolved after the pair has
      // been classified, because the class chooses the rule.
      const placement = placementFor
        ? placementFor(a.path, b.path)
        : tolerances.placement;

      // ── Reject what cannot be reported, before measuring it ──
      //
      // A conflict is only ever raised when `clearance < required`, i.e. when the centreline
      // distance is under `required + placement + rA + rB`. `maxClear` is an upper bound on
      // `required` for every pair in the run, so two boxes further apart than this cannot
      // produce one — whatever the exact distance turns out to be.
      //
      // The bound is built from THIS pair's placement rather than the global one. A caller
      // may hand back a larger allowance for some pairs than `tolerances.placement`, and a
      // cutoff derived from the global value would then reject a pair that was reportable.
      // Per-pair costs one addition and is sound for any `placementFor`.
      //
      // That matters because the narrow phase was O(nA × nB) over every sampled segment of
      // both bars with no early exit. Two six-metre bars that touch at one point still had
      // every one of their segment pairs measured: 7,6 million segment tests for 151 000 bar
      // pairs on the flagship, about fifty per pair. Skipping provably-irrelevant pairs
      // changes no result — it removes work whose answer was already known.
      const cutoff = maxClear + placement + a.radius + b.radius;
      const cutoffSq = cutoff * cutoff;
      if (prune && boxGapSq(a.box, b.box) > cutoffSq) continue;

      let worst: {
        clearance: number; at: Point3; surface: number; m: number; n: number;
      } | null = null;

      for (let m = 0; m + 1 < a.points.length; m++) {
        const ab = a.segBoxes[m];
        // One segment of `a` against the whole of `b` first. A stirrup has tens of segments
        // and most of them are nowhere near the other bar, so this removes the inner loop
        // entirely rather than paying for it once per segment of `b`.
        if (prune && boxGapSq(ab, b.box) > cutoffSq) continue;
        for (let n = 0; n + 1 < b.points.length; n++) {
          if (prune && boxGapSq(ab, b.segBoxes[n]) > cutoffSq) continue;
          narrowPhaseTests++;
          const { distance, at } = segmentDistance(
            a.points[m], a.points[m + 1], b.points[n], b.points[n + 1]);
          // `surface` is the true geometry; `clearance` also carries this pair's
          // placement tolerance. The classifier must see only the former — a tolerance
          // allowance is not interpenetration, and treating it as one turns every tie
          // point into a clash.
          const surface = distance - a.radius - b.radius;
          const clearance = surface - placement;
          if (worst === null || clearance < worst.clearance) {
            worst = { clearance, at, surface, m, n };
          }
        }
      }
      if (worst === null) continue;

      // Classify BEFORE judging. The class decides the rule and whether a shortfall is a
      // defect at all; a tie around its own longitudinals is not a clash.
      const cls = classifyFor?.(a.path, b.path, worst.surface,
        tangent(a.points, worst.m), tangent(b.points, worst.n));
      if (cls && !cls.reportable) continue;
      const required = cls
        ? cls.requiredClear
        : requiredClearFor
          ? requiredClearFor(a.path, b.path)
          : tolerances.requiredClear;

      const shortfall = required - worst.clearance;
      // A micron of floating-point dust is not a clearance violation. A pair drawn to
      // exactly the code minimum computes to 0.024999999999999998 against 0.025 and would
      // otherwise be reported against the very requirement it satisfies — which, now that
      // the default additional margin is zero, is the commonest case in the model rather
      // than an edge case.
      if (shortfall <= 1e-9) continue;

      const severity: ConflictSeverity =
        worst.clearance < 0 ? 'overlap'
          : shortfall <= tolerances.marginalBand ? 'marginal'
            : 'clearance';

      // Canonicalise the pair by id, not by iteration index: keying on (i, j) made the
      // reported barA/barB depend on the order the caller happened to supply the bars,
      // which would make every golden drawing and schedule input-order sensitive.
      const [idA, idB] = [a.path.id, b.path.id].sort();
      const key = `${idA}|${idB}`;
      conflicts.set(key, {
        severity,
        barA: idA,
        barB: idB,
        at: worst.at,
        clearance: +worst.clearance.toFixed(5),
        required: +required.toFixed(5),
        pairClass: cls?.pairClass,
        classLabelKey: cls?.labelKey,
        shortfall: +shortfall.toFixed(5),
        elementIds: [...new Set([...a.path.ownerElementIds, ...b.path.ownerElementIds])].sort((x, y) => x - y),
      });
    }
  }

  const list = [...conflicts.values()].sort((x, y) =>
    // Deterministic: worst first, then by bar id, so golden outputs are stable.
    y.shortfall - x.shortfall || x.barA.localeCompare(y.barA) || x.barB.localeCompare(y.barB));

  return {
    conflicts: list,
    barCount: bars.length,
    narrowPhaseTests,
    barPairsTested,
    bucketScans: hash.bucketScans,
    constructible: list.every((c) => c.severity === 'marginal'),
  };
}

/**
 * Check that every bar sits inside the concrete, respecting cover.
 *
 * A bar that clears every other bar and pokes out of the section is still not buildable,
 * and this is the check that catches a hook turned the wrong way.
 */
export interface CoverBreach {
  barId: string;
  at: Point3;
  /** Distance from the bar surface to the nearest section face, m. Negative = outside. */
  actualCover: number;
  requiredCover: number;
  elementIds: number[];
}

export interface SectionPrism {
  elementId: number;
  /** Section corners in the plane normal to the member axis, as (u, v) half-extents. */
  halfWidth: number;
  halfHeight: number;
  /** Member axis origin and unit direction. */
  origin: Point3;
  axis: Point3;
  /** Unit vectors spanning the section plane. */
  uAxis: Point3;
  vAxis: Point3;
  requiredCover: number;
}

function dot(a: Point3, b: Point3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function sub(a: Point3, b: Point3): Point3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

/** Cover breaches for bars against the prism of the member they belong to. */
export function checkCover(
  bars: readonly BarPath[], prisms: readonly SectionPrism[],
): CoverBreach[] {
  const byElement = new Map<number, SectionPrism>();
  for (const p of prisms) byElement.set(p.elementId, p);
  const out: CoverBreach[] = [];

  for (const bar of bars) {
    for (const elementId of bar.ownerElementIds) {
      const prism = byElement.get(elementId);
      if (!prism) continue;
      const r = bar.diameterMm / 2000;
      let worst: { cover: number; at: Point3 } | null = null;

      for (const p of samplePath(bar)) {
        const rel = sub(p, prism.origin);
        const u = dot(rel, prism.uAxis);
        const v = dot(rel, prism.vAxis);
        const t = dot(rel, prism.axis);
        // Only judge points that lie within the member's own length. A continuous bar
        // legitimately leaves the prism at a support, and flagging that would report a
        // breach on every coordinated bar.
        if (t < -1e-9) continue;
        const coverU = prism.halfWidth - Math.abs(u) - r;
        const coverV = prism.halfHeight - Math.abs(v) - r;
        const cover = Math.min(coverU, coverV);
        if (worst === null || cover < worst.cover) worst = { cover, at: p };
      }

      if (worst && worst.cover < prism.requiredCover - 1e-6) {
        out.push({
          barId: bar.id,
          at: worst.at,
          actualCover: +worst.cover.toFixed(5),
          requiredCover: prism.requiredCover,
          elementIds: [elementId],
        });
      }
    }
  }
  return out.sort((a, b) => a.actualCover - b.actualCover || a.barId.localeCompare(b.barId));
}
