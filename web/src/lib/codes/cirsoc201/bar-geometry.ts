/**
 * Physical reinforcing-bar geometry — CIRSOC 201-2025 Chapter 25.
 *
 * The app has, until now, described reinforcement as counts and diameters: "5Ø20 bottom
 * span". That is enough to verify a section and nowhere near enough to draw one, order
 * one or check that it fits. A bar on site is a polyline with bends of a specific
 * radius, hooks with specific extensions, and a cutting length that is neither the span
 * nor the sum of its legs.
 *
 * This module is the headless geometric truth. It produces `BarPath` objects in model
 * coordinates, with no rendering, no store and no Three.js — the viewport consumes it
 * for display, the DXF writer for output, the collision engine for clash detection and
 * the schedule for cutting lengths. One representation, four consumers, so a bar that
 * is drawn is by construction the same bar that was checked and scheduled.
 *
 * ── Normative geometry, verbatim ───────────────────────────────
 *
 * Table 25.3.1 — standard hooks for anchoring deformed bars in tension:
 *   90° hook   Ø10–25 → mandrel 6d_b, straight extension 12d_b
 *              Ø32    → mandrel 8d_b
 *              Ø40+   → mandrel 10d_b
 *   180° hook  Ø10–25 → mandrel 6d_b, straight extension max(4d_b, 65 mm)
 *              Ø32    → mandrel 8d_b
 *              Ø40+   → mandrel 10d_b
 *
 * Table 25.3.2 — minimum bend diameters and hook geometry for stirrups and ties:
 *   90° hook   Ø10–16 → mandrel 4d_be, extension max(6d_be, 75 mm)
 *              Ø20–25 → mandrel 6d_be, extension 12d_be
 *   135° hook  Ø10–16 → mandrel 4d_be, extension max(6d_be, 75 mm)
 *              Ø20–25 → mandrel 6d_be
 *   180° hook  Ø10–16 → mandrel 4d_be
 *              Ø20–25 → mandrel 6d_be
 *
 * The mandrel diameter is the INSIDE diameter of the bend, so the bar centreline
 * radius is (mandrel + d_b)/2. Getting that wrong by d_b/2 is the classic detailing
 * error that makes a bar cage that will not close.
 *
 * All lengths in metres unless the name says `Mm`. Pure: no store, no runes.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../regulation';

// ─── Bend and hook geometry ──────────────────────────────────────

export type HookAngle = 90 | 135 | 180;
export type BarRole = 'longitudinal' | 'transverse';

export interface HookGeometry {
  angle: HookAngle;
  /** Inside diameter of the bend, m. */
  mandrelDiameter: number;
  /** Centreline radius of the bend arc, m — (mandrel + d_b)/2. */
  centrelineRadius: number;
  /** Straight extension beyond the end of the bend, m. */
  extension: number;
  refs: ClauseRef[];
}

const T2531 = clause('cirsoc-201', '2025', 'Tabla 25.3.1',
  'geometría del gancho normal para el anclaje de barras conformadas en tracción');
const T2532 = clause('cirsoc-201', '2025', 'Tabla 25.3.2',
  'diámetro mínimo interior de doblado y geometría del gancho para estribos');

/**
 * Minimum mandrel (inside bend) diameter, in metres.
 *
 * `barRole` matters: a Ø16 longitudinal bar bends around 6d_b while a Ø16 stirrup bends
 * around 4d_b. Using the longitudinal value for a stirrup produces a cage that is too
 * big for its section; using the stirrup value for a main bar is a code violation.
 */
export function minMandrelDiameter(
  diameterMm: number, role: BarRole,
): { value: number; refs: ClauseRef[] } {
  const db = diameterMm / 1000;
  if (role === 'transverse') {
    // Table 25.3.2, verified against the rendered page: Ø10–16 → 4·d_be, Ø20–25 → 6·d_be.
    const factor = diameterMm <= 16 ? 4 : 6;
    return { value: factor * db, refs: [T2532] };
  }
  // Table 25.3.1, verified against the rendered page: Ø10–25 → 6·d_b, Ø32 → 8·d_b,
  // Ø40 and larger → 10·d_b.
  let factor: number;
  if (diameterMm <= 25) factor = 6;
  else if (diameterMm <= 32) factor = 8;
  else factor = 10;
  return { value: factor * db, refs: [T2531] };
}

/** Centreline bend radius from the inside mandrel diameter. */
export function centrelineRadius(mandrelDiameter: number, diameterMm: number): number {
  return (mandrelDiameter + diameterMm / 1000) / 2;
}

/** Standard hook geometry per Tables 25.3.1 / 25.3.2. */
export function standardHook(
  diameterMm: number, angle: HookAngle, role: BarRole,
): HookGeometry {
  const db = diameterMm / 1000;
  const mandrel = minMandrelDiameter(diameterMm, role);

  let extension: number;
  if (role === 'transverse') {
    // Table 25.3.2.
    if (angle === 90) extension = diameterMm <= 16 ? Math.max(6 * db, 0.075) : 12 * db;
    else if (angle === 135) extension = Math.max(6 * db, 0.075);
    else extension = Math.max(4 * db, 0.065);
  } else {
    // Table 25.3.1. A 135° hook is not tabulated for longitudinal anchorage; the 180°
    // requirement is the conservative neighbour and is used, flagged in the ref note.
    if (angle === 90) extension = 12 * db;
    else extension = Math.max(4 * db, 0.065);
  }

  const refs = [...mandrel.refs];
  if (role === 'longitudinal' && angle === 135) {
    refs.push(clause('cirsoc-201', '2025', 'Tabla 25.3.1', undefined,
      'La Tabla 25.3.1 no tabula el gancho a 135° para anclaje longitudinal. Se adopta ' +
      'la prolongación del gancho a 180°, que es la más exigente de las tabuladas.'));
  }

  return {
    angle,
    mandrelDiameter: mandrel.value,
    centrelineRadius: centrelineRadius(mandrel.value, diameterMm),
    extension,
    refs,
  };
}

/**
 * Developed length of a hook, measured along the bar centreline from the tangent point
 * to the free end: the arc plus the straight extension.
 *
 * This is what the cutting length needs. A schedule that adds the hook as a straight
 * `extension` alone under-orders steel by the arc, which for a 180° hook on a Ø25 bar
 * is ~70 mm per hook.
 */
export function hookDevelopedLength(hook: HookGeometry): number {
  const arc = hook.centrelineRadius * (hook.angle * Math.PI) / 180;
  return arc + hook.extension;
}

// ─── Bar paths ───────────────────────────────────────────────────

/**
 * A point on a bar centreline, in model coordinates (m).
 *
 * 3D from the start: a beam bottom bar and the column bar it clashes with are not
 * coplanar, and a 2D model of bar geometry cannot answer the question the collision
 * engine exists to answer.
 */
export interface Point3 { x: number; y: number; z: number }

export type SegmentKind = 'straight' | 'arc';

export interface BarSegment {
  kind: SegmentKind;
  start: Point3;
  end: Point3;
  /** Arc only: centreline radius, m. */
  radius?: number;
  /** Arc only: swept angle, degrees, positive. */
  sweepDeg?: number;
  /**
   * Arc only: the centre the arc turns about.
   *
   * ── Why the centre has to be stored ────────────────────────────────
   *
   * `start`, `end`, `radius` and `sweepDeg` do not determine an arc in three dimensions.
   * Two centres satisfy them in any given plane, and the plane itself is free. Without the
   * centre the only thing a consumer can reconstruct is the CHORD — which is exactly what
   * `samplePath` was doing, for every bend in the model, while its own comment claimed the
   * subdivision count kept the deviation under `maxChord`. It did not: linear interpolation
   * between two endpoints never leaves the chord however finely you subdivide it, so the
   * deviation was the full sagitta every time.
   *
   * For a 90° corner of a Ø8 stirrup (r = 20 mm) that is 5,9 mm of steel in the wrong place;
   * for a 135° hook it is 12,3 mm. Both are larger than the bars being checked against, so
   * every conflict measured at a bend was measured against geometry that is not there.
   *
   * Optional because a caller that genuinely does not know the centre is better off saying
   * so than inventing one — `samplePath` falls back to the chord and the approximation is at
   * least visible rather than claimed to be exact.
   */
  centre?: Point3;
  /** Length along the centreline, m. */
  length: number;
}

export type BarEndTreatment =
  | { kind: 'straight' }
  | { kind: 'hook'; hook: HookGeometry }
  | { kind: 'continuous' };

export interface BarPath {
  /** Stable identifier within the assembly. */
  id: string;
  diameterMm: number;
  role: BarRole;
  segments: BarSegment[];
  startTreatment: BarEndTreatment;
  endTreatment: BarEndTreatment;
  /**
   * Cutting length, m: the developed length along the centreline including bends and
   * hooks. This is the number that goes on the bar schedule and to the supplier.
   */
  cuttingLength: number;
  /** Members this bar belongs to. A continuous bar over a support belongs to both. */
  ownerElementIds: number[];
  /**
   * Stable physical layer identity, e.g. `e184:bottom:0`.
   *
   * ── Why an ID rather than a computed elevation ─────────────────────
   *
   * Layer membership was being recovered downstream by clustering bar elevations. That is
   * inference, and inference has failure modes the truth does not: a fixed 20 mm grid split
   * a Ø32 and a Ø20 in one mat across a boundary (405 phantom overlaps), and single-linkage
   * clustering chains 0 / 15 / 30 mm into one layer when §25.2.2 says the outer two are
   * plainly separate.
   *
   * The generator KNOWS which layer it put each bar in. Carrying that knowledge costs one
   * string and removes the whole class of problem: materialisation, collision, verification,
   * drawings and the schedule all read the same identity rather than each re-deriving it.
   *
   * `face` distinguishes top from bottom because the two are independent problems — they
   * are referenced from opposite surfaces and cross different steel.
   *
   * Optional only for bars that predate this field or arrive from an importer; the
   * clustering fallback still handles those, and is documented as a fallback.
   */
  layerId?: string;
  /**
   * Which longitudinal bars this piece's closed perimeter ENCLOSES.
   *
   * ── Why the relationship is declared rather than inferred ──────────
   *
   * "A stirrup may touch the bars it confines" is true, and for one commit the collision
   * classifier implemented it as `role === 'transverse' && sharesMember(a, b)`. That is not
   * the clause. It exempted every transverse-to-longitudinal pair in the member from every
   * check, so a stirrup driven straight THROUGH a longitudinal bar — surfaces
   * interpenetrating, physically unbuildable — was reported as required containment and
   * hidden from the conflict list.
   *
   * The generator KNOWS which bars each piece was built around. Recording that turns the
   * exemption from a role test into a checkable claim: containment is allowed only between
   * bars that are actually in the relationship, and even then only when the geometry is
   * valid. Interpenetration is never excused by a declared relationship.
   *
   * Enclosure and restraint are DIFFERENT claims and are recorded separately. A closed
   * stirrup encloses every bar inside its perimeter; it restrains only the ones its bends
   * grip. §25.7.1.2 is about the second, and conflating them would let a cage claim
   * compliance because a bar happened to be somewhere inside it.
   */
  enclosesBarIds?: string[];
  /**
   * Which longitudinal bars a bend of this piece physically grips — §25.7.1.2 for a closed
   * stirrup's corners, §25.3.5(d) for a crosstie's two hooks.
   */
  restrainsBarIds?: string[];
  /** Which longitudinal bars this piece's hook EXTENSIONS touch along their length. */
  hookContactsBarIds?: string[];
  /** The cage this piece belongs to — one per member. Absent on longitudinal steel. */
  cageId?: string;
  /** The stirrup zone this piece belongs to, e.g. `e162:support:0`. */
  zoneId?: string;
  /** Distance along the owning member's axis, m, from its i end. */
  station?: number;
  /** Where the bar came from, for the provenance trail. */
  source: 'generated' | 'manual' | 'coordinated';
  /** True when the user pinned this bar; the coordinator treats it as a hard constraint. */
  locked: boolean;
  refs: ClauseRef[];
}

function dist(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function straightSegment(start: Point3, end: Point3): BarSegment {
  return { kind: 'straight', start, end, length: dist(start, end) };
}

export function arcSegment(
  start: Point3, end: Point3, radius: number, sweepDeg: number, centre?: Point3,
): BarSegment {
  return {
    kind: 'arc', start, end, radius, sweepDeg, centre,
    length: radius * (Math.abs(sweepDeg) * Math.PI) / 180,
  };
}

/** Total developed length of a segment list. */
export function developedLength(segments: readonly BarSegment[]): number {
  return segments.reduce((s, seg) => s + seg.length, 0);
}

/**
 * Build a straight bar with optional standard hooks at either end.
 *
 * The hooks are represented geometrically — an arc plus a straight leg — rather than as
 * a length added to a number, so the same object answers "how long is it to cut?" and
 * "does the hook hit the column bar?".
 *
 * `axis` is the unit vector along the bar; `hookNormal` is the unit vector the hook
 * turns toward (typically "into the section", i.e. away from the nearest face).
 */
export function buildStraightBarWithHooks(opts: {
  id: string;
  diameterMm: number;
  role: BarRole;
  start: Point3;
  end: Point3;
  axis: Point3;
  hookNormal: Point3;
  startHook?: HookAngle;
  endHook?: HookAngle;
  ownerElementIds: number[];
  /**
   * Retained so callers keep declaring the edition their bar belongs to, and so a future
   * sourced edition can dispatch here. It is NOT used to choose hook or mandrel geometry:
   * Tables 25.3.1 and 25.3.2 are 2025 identifiers and are the only bend rules implemented,
   * so passing '2005' used to produce refs reading "CIRSOC 201 2005 Tabla 25.3.1" — a 2025
   * table stamped with an edition that does not contain it.
   */
  edition?: RegulationEdition;
  source?: BarPath['source'];
  locked?: boolean;
  layerId?: string;
}): BarPath {
  const segments: BarSegment[] = [];
  const refs: ClauseRef[] = [];

  let startTreatment: BarEndTreatment = { kind: 'straight' };
  let endTreatment: BarEndTreatment = { kind: 'straight' };

  const add = (p: Point3, v: Point3, k: number): Point3 =>
    ({ x: p.x + v.x * k, y: p.y + v.y * k, z: p.z + v.z * k });

  // Leading hook, turning from the bar axis toward hookNormal.
  if (opts.startHook) {
    const hook = standardHook(opts.diameterMm, opts.startHook, opts.role);
    startTreatment = { kind: 'hook', hook };
    refs.push(...hook.refs);
    // Free end of the extension, then the arc back to the tangent point at `start`.
    const tangentOffset = hook.centrelineRadius;
    const extStart = add(add(opts.start, opts.hookNormal, tangentOffset + hook.extension),
      opts.axis, -tangentOffset);
    const extEnd = add(extStart, opts.hookNormal, -hook.extension);
    segments.push(straightSegment(extStart, extEnd));
    // Centre of the bend: perpendicular to the bar axis at `start`, one radius along the
    // hook normal. Both `extEnd` and `start` are exactly that far from it.
    segments.push(arcSegment(extEnd, opts.start, hook.centrelineRadius, opts.startHook,
      add(opts.start, opts.hookNormal, tangentOffset)));
  }

  segments.push(straightSegment(opts.start, opts.end));

  if (opts.endHook) {
    const hook = standardHook(opts.diameterMm, opts.endHook, opts.role);
    endTreatment = { kind: 'hook', hook };
    refs.push(...hook.refs);
    const tangentOffset = hook.centrelineRadius;
    const arcEnd = add(add(opts.end, opts.axis, tangentOffset), opts.hookNormal, tangentOffset);
    segments.push(arcSegment(opts.end, arcEnd, hook.centrelineRadius, opts.endHook,
      add(opts.end, opts.hookNormal, tangentOffset)));
    segments.push(straightSegment(arcEnd, add(arcEnd, opts.hookNormal, hook.extension)));
  }

  return {
    id: opts.id,
    diameterMm: opts.diameterMm,
    role: opts.role,
    segments,
    startTreatment,
    endTreatment,
    cuttingLength: developedLength(segments),
    ownerElementIds: opts.ownerElementIds,
    layerId: opts.layerId,
    source: opts.source ?? 'generated',
    locked: opts.locked ?? false,
    refs,
  };
}

/**
 * Sample a bar path into points, for collision testing and for drawing.
 *
 * `maxChord` bounds the chord error on arcs, so a hook is never approximated by a
 * single straight line when the question is whether it clashes with something.
 */
export function samplePath(path: BarPath, maxChord = 0.005): Point3[] {
  const out: Point3[] = [];
  for (const seg of path.segments) {
    if (out.length === 0) out.push(seg.start);
    if (seg.kind === 'straight') {
      out.push(seg.end);
      continue;
    }
    const r = seg.radius ?? 0;
    const sweep = Math.abs(seg.sweepDeg ?? 0);
    // Chord error e = r(1 - cos(θ/2)); solve for the number of subdivisions.
    const n = Math.max(2, Math.ceil(sweep / Math.max(1, (180 / Math.PI) * 2 * Math.acos(
      Math.max(-1, Math.min(1, 1 - maxChord / Math.max(r, 1e-9)))))));

    // ── Sample the ARC, when the segment says where its centre is ──
    //
    // The previous implementation interpolated linearly between the two endpoints and
    // asserted that `n` kept the deviation under `maxChord`. It does not: every point of a
    // linear interpolation lies ON the chord, so the deviation is the sagitta regardless of
    // `n`. Every bend in the model was being collision-checked as a straight line cutting
    // its own corner — 5,9 mm inboard for a Ø8 stirrup's 90° corner, 12,3 mm for its 135°
    // hook, both larger than the bars the check compares them against.
    const c = seg.centre;
    const v0 = c && { x: seg.start.x - c.x, y: seg.start.y - c.y, z: seg.start.z - c.z };
    const v1 = c && { x: seg.end.x - c.x, y: seg.end.y - c.y, z: seg.end.z - c.z };
    const cross = v0 && v1 && {
      x: v0.y * v1.z - v0.z * v1.y,
      y: v0.z * v1.x - v0.x * v1.z,
      z: v0.x * v1.y - v0.y * v1.x,
    };
    const crossLen = cross ? Math.hypot(cross.x, cross.y, cross.z) : 0;
    if (c && v0 && v1 && crossLen > 1e-12) {
      const axis = { x: cross!.x / crossLen, y: cross!.y / crossLen, z: cross!.z / crossLen };
      const dot = v0.x * v1.x + v0.y * v1.y + v0.z * v1.z;
      // The angle between the two radii is always the SHORT way round. A sweep past 180°
      // means the arc takes the long way, which is the same rotation about the opposite
      // axis — a reflex bend is rare in rebar but a 180° hook sits right at the boundary.
      let theta = Math.atan2(crossLen, dot);
      let n3 = axis;
      if (sweep > 180 + 1e-9) {
        theta = 2 * Math.PI - theta;
        n3 = { x: -axis.x, y: -axis.y, z: -axis.z };
      }
      for (let i = 1; i <= n; i++) {
        const a = theta * (i / n);
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        // Rodrigues: v cosθ + (n × v) sinθ + n (n·v)(1 − cosθ).
        const nd = n3.x * v0.x + n3.y * v0.y + n3.z * v0.z;
        const nx = n3.y * v0.z - n3.z * v0.y;
        const ny = n3.z * v0.x - n3.x * v0.z;
        const nz = n3.x * v0.y - n3.y * v0.x;
        out.push({
          x: c.x + v0.x * cosA + nx * sinA + n3.x * nd * (1 - cosA),
          y: c.y + v0.y * cosA + ny * sinA + n3.y * nd * (1 - cosA),
          z: c.z + v0.z * cosA + nz * sinA + n3.z * nd * (1 - cosA),
        });
      }
      continue;
    }

    // No centre recorded: the chord is all this segment determines. Approximate, and do not
    // pretend otherwise.
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      out.push({
        x: seg.start.x + (seg.end.x - seg.start.x) * t,
        y: seg.start.y + (seg.end.y - seg.start.y) * t,
        z: seg.start.z + (seg.end.z - seg.start.z) * t,
      });
    }
  }
  return out;
}

// ─── Stock lengths and offcuts ───────────────────────────────────

/**
 * Default commercial stock length for ADN 420 bars in Argentina, in metres.
 *
 * 12 m, per the approved decision. The previous `bar-marks.ts` assumed 6 m, which
 * contradicts what Acindar actually supplies and roughly doubles the computed number
 * of splices. Configurable per project.
 */
export const DEFAULT_STOCK_LENGTH_M = 12;

export interface CuttingPlan {
  /** Bars per stock length. */
  perStock: number;
  /** Stock bars required. */
  stockCount: number;
  /** Offcut per stock bar, m. */
  offcut: number;
  /** Total wasted length, m. */
  totalWaste: number;
  /** True when a single bar exceeds the stock length and must be spliced. */
  requiresSplice: boolean;
}

/**
 * How many stock bars a set of identical cut lengths needs.
 *
 * Deliberately the simple same-length nesting, not a general 1-D bin-packing: mixing
 * different marks on one stock bar is a fabrication-shop decision, and presenting an
 * optimal nesting the shop will not follow would understate the order.
 */
export function planCuts(
  cutLength: number, quantity: number, stockLength = DEFAULT_STOCK_LENGTH_M,
): CuttingPlan {
  if (cutLength > stockLength) {
    return {
      perStock: 0, stockCount: quantity, offcut: 0, totalWaste: 0, requiresSplice: true,
    };
  }
  const perStock = Math.max(1, Math.floor(stockLength / cutLength));
  const stockCount = Math.ceil(quantity / perStock);
  const offcut = stockLength - perStock * cutLength;
  return {
    perStock,
    stockCount,
    offcut,
    totalWaste: stockCount * offcut,
    requiresSplice: false,
  };
}

/** Steel mass, kg, from length and diameter. Density 7850 kg/m³. */
export function barMass(lengthM: number, diameterMm: number): number {
  const area = Math.PI * (diameterMm / 2000) ** 2;
  return area * lengthM * 7850;
}
