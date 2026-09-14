/**
 * A stair flight, modelled the way a stair is analysed rather than the way it
 * is drawn.
 *
 * ── The one decision this module makes ─────────────────────────────
 *
 * A staircase is NOT a stack of little slabs. It is an inclined slab — the
 * *waist*, the garganta — spanning between its supports, and the steps sitting
 * on top of it are dead LOAD, not stiffness. Every code check of a stair
 * (CIRSOC 201 §9, ACI 318 one-way slabs) is run on the waist; the treads
 * contribute weight and nothing else, because a triangular fillet of concrete
 * cast monolithically on top of a slab carries no bending across its own
 * joints.
 *
 * Modelling the steps as geometry would therefore be worse than useless: it
 * would add stiffness the real stair does not have, and the deflection would
 * come back too small with no symptom saying so.
 *
 * So what this builds is a strip of inclined quads with the right slope, and a
 * surface load carrying the steps' weight. Both halves are needed — an
 * inclined slab with no step weight under-loads the flight by about a third of
 * the concrete in it.
 *
 * ── What needed no work at all ─────────────────────────────────────
 *
 * The solver. `engine/__tests__/inclined-shell.test.ts` already locks that a
 * MITC4 quad with its top edge out of the XY plane solves and recovers
 * stresses. A stair flight is exactly that, so this module is geometry and
 * load arithmetic on top of a capability that was already there.
 */

import { msg, type EngineMessage } from '../codes/message';

export interface Vec3 { x: number; y: number; z: number }

export interface StairSpec {
  /** Contrahuella, m. The height of one step. */
  riser: number;
  /** Pedada, m. The depth of one step. */
  tread: number;
  /**
   * How many RISERS the flight has.
   *
   * A flight that lands flush with the floor above has one tread fewer than it
   * has risers — the last riser arrives at the landing, which is not a tread of
   * this flight. That is the convention here, and it is the difference between
   * a correct run and one a whole tread too long.
   */
  steps: number;
  /** Waist (garganta) thickness measured perpendicular to the slope, m. */
  waist: number;
}

export interface FlightGeometry {
  /** Total height climbed, m. */
  rise: number;
  /** Horizontal projection of the flight, m. */
  run: number;
  angleRad: number;
  angleDeg: number;
  /** Length along the slope, m — what the waist actually spans. */
  slope: number;
}

/** Number of treads in a flight of `steps` risers. */
export function treadCount(steps: number): number {
  return Math.max(0, Math.round(steps) - 1);
}

export function flightGeometry(spec: StairSpec): FlightGeometry {
  const rise = spec.steps * spec.riser;
  const run = treadCount(spec.steps) * spec.tread;
  const angleRad = Math.atan2(rise, run);
  return {
    rise,
    run,
    angleRad,
    angleDeg: (angleRad * 180) / Math.PI,
    slope: Math.hypot(rise, run),
  };
}

/** The tread a fixed horizontal run implies, for a flight of `steps` risers. */
export function treadForRun(run: number, steps: number): number {
  const n = treadCount(steps);
  return n > 0 ? run / n : 0;
}

/* ── Comfort limits ────────────────────────────────────────────────
 *
 * Stated as what they are. CIRSOC prescribes none of this: stair geometry is a
 * matter for the local building code (código de edificación), and the rule
 * everyone actually uses is Blondel's, which is a rule of the human stride and
 * not of any regulation. Warned about, never enforced — a stair inside an
 * existing shaft is sometimes the stair you have.
 */
export const BLONDEL_MIN = 0.60;
export const BLONDEL_MAX = 0.65;
/** Riser above which a stair reads as steep in common practice, m. */
export const RISER_MAX = 0.19;
/** Tread below which a foot no longer lands on the step, m. */
export const TREAD_MIN = 0.25;

/** Blondel's stride: 2 risers plus one tread, in metres. */
export function blondel(spec: StairSpec): number {
  return 2 * spec.riser + spec.tread;
}

/**
 * Everything wrong with a spec, as messages the boundary translates.
 *
 * Split in two on purpose: `errors` stop the flight being built (a geometry
 * that cannot exist), `warnings` never do (a stair that is legal arithmetic and
 * uncomfortable to climb).
 */
export function checkStairSpec(spec: StairSpec): { errors: EngineMessage[]; warnings: EngineMessage[] } {
  const errors: EngineMessage[] = [];
  const warnings: EngineMessage[] = [];

  if (!Number.isFinite(spec.steps) || spec.steps < 2) errors.push(msg('stair.errSteps'));
  if (!(spec.riser > 0)) errors.push(msg('stair.errRiser'));
  if (!(spec.tread > 0)) errors.push(msg('stair.errTread'));
  if (!(spec.waist > 0)) errors.push(msg('stair.errWaist'));
  if (errors.length > 0) return { errors, warnings };

  /* Params are rounded here rather than at the boundary: 2·0.175 + 0.28 is
     0.6299999999999999 in binary floating point, and a warning that prints it
     that way is a warning the reader stops believing. */
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const b = blondel(spec);
  if (b < BLONDEL_MIN || b > BLONDEL_MAX) {
    warnings.push(msg('stair.warnBlondel', { value: r3(b), min: BLONDEL_MIN, max: BLONDEL_MAX }));
  }
  if (spec.riser > RISER_MAX) warnings.push(msg('stair.warnRiser', { value: r3(spec.riser), max: RISER_MAX }));
  if (spec.tread < TREAD_MIN) warnings.push(msg('stair.warnTread', { value: r3(spec.tread), min: TREAD_MIN }));

  /* CIRSOC 201 Tabla 9.3.1.1 gives a one-way slab L/20 simply supported and
     L/28 continuous at both ends before a deflection calculation is owed. A
     stair waist spans its SLOPE, not its plan run, and L/25 sits between those
     two — so this fires only on a flight that would need the calculation under
     any of the three, and never claims to have done it. */
  const g = flightGeometry(spec);
  if (g.slope > 0 && spec.waist < g.slope / 25) {
    warnings.push(msg('stair.warnWaist', { waist: r3(spec.waist), span: r3(g.slope) }));
  }
  return { errors, warnings };
}

/* ── Loads ─────────────────────────────────────────────────────────
 *
 * `surface3d` applies q over the element's TRUE area and resolves it down
 * global Z (`solver-shells.convertSurfaceLoad`). So every number below is per
 * square metre of INCLINED surface, and anything a code gives per square metre
 * of plan has to be turned into one — which is what `planToInclined` is for,
 * and forgetting it under-loads a 30° flight by 13 %.
 */

/**
 * The steps' own weight, per m² of inclined surface.
 *
 * Over one tread of plan the step is a triangle of height `riser`, so its mean
 * height is `riser / 2` — the classic result, and the reason a stair is heavier
 * than the slab under it looks. Spread over the inclined area rather than the
 * plan area, that is `γ · riser / 2 · cos α`.
 *
 * The waist is NOT in here: the solver already takes its weight from the
 * material density when self-weight is on, and adding it twice is the kind of
 * error that passes every check because the number is merely large.
 */
export function stepWeightPerInclinedArea(spec: StairSpec, densityKNm3: number): number {
  const { angleRad } = flightGeometry(spec);
  return densityKNm3 * (spec.riser / 2) * Math.cos(angleRad);
}

/** Convert a load given per m² of plan into one per m² of inclined surface. */
export function planToInclined(qPlan: number, angleRad: number): number {
  return qPlan * Math.cos(angleRad);
}

/* ── Geometry ──────────────────────────────────────────────────────*/

/**
 * The four corners of a flight rising from the edge a→b.
 *
 * a→b is the bottom edge, across the WIDTH of the stair. The flight runs
 * horizontally perpendicular to it — two directions satisfy that, so `flip`
 * picks, and the caller is expected to show the reader which one was taken
 * rather than leaving it to be discovered in the viewport.
 *
 * Returned in quad order (a, b, top-of-b, top-of-a), which is what `addQuad`
 * wants and what keeps the normal consistent with the bottom edge.
 */
export function flightCorners(
  a: Vec3, b: Vec3, spec: StairSpec, flip = false,
): [Vec3, Vec3, Vec3, Vec3] | null {
  const ex = b.x - a.x, ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return null; // a vertical edge has no horizontal run direction
  // Rotate the edge +90° about Z: (x, y) → (−y, x).
  const dx = (flip ? ey : -ey) / len;
  const dy = (flip ? -ex : ex) / len;
  const g = flightGeometry(spec);
  return [
    a,
    b,
    { x: b.x + dx * g.run, y: b.y + dy * g.run, z: b.z + g.rise },
    { x: a.x + dx * g.run, y: a.y + dy * g.run, z: a.z + g.rise },
  ];
}

/** Unit run direction of a flight built on a→b, for showing the reader. */
export function runDirection(a: Vec3, b: Vec3, flip = false): Vec3 | null {
  const ex = b.x - a.x, ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return null;
  return { x: (flip ? ey : -ey) / len, y: (flip ? -ex : ex) / len, z: 0 };
}

/**
 * Tilt an existing quad into a flight by raising one of its edges.
 *
 * `lowEdge` is the index of the corner the edge starts at, so 0 means the edge
 * (corners[0] → corners[1]) stays put and the opposite one rises. The
 * FOOTPRINT is kept: the plan outline is the slab the reader already drew, and
 * only z changes. That makes the tread a derived quantity rather than an input
 * — returned alongside, because a conversion that silently re-proportions the
 * stair is a conversion the reader cannot check.
 */
export function tiltQuadToFlight(
  corners: [Vec3, Vec3, Vec3, Vec3], lowEdge: 0 | 1 | 2 | 3, rise: number,
): [Vec3, Vec3, Vec3, Vec3] {
  const out = corners.map((c) => ({ ...c })) as [Vec3, Vec3, Vec3, Vec3];
  // The two corners NOT on the low edge are the ones that rise.
  const low = new Set([lowEdge, (lowEdge + 1) % 4]);
  for (let i = 0; i < 4; i++) if (!low.has(i)) out[i].z += rise;
  return out;
}

/** Mean horizontal length of the two sides running away from `lowEdge`. */
export function quadRunLength(corners: [Vec3, Vec3, Vec3, Vec3], lowEdge: 0 | 1 | 2 | 3): number {
  const i0 = lowEdge, i1 = (lowEdge + 1) % 4, i2 = (lowEdge + 2) % 4, i3 = (lowEdge + 3) % 4;
  const h = (p: Vec3, q: Vec3) => Math.hypot(q.x - p.x, q.y - p.y);
  return (h(corners[i1], corners[i2]) + h(corners[i0], corners[i3])) / 2;
}

/* ── Building it ───────────────────────────────────────────────────*/

export interface StairHost {
  /** An existing node at this point, or null. Welding, so a flight joins what it lands on. */
  findNode(x: number, y: number, z: number): number | null;
  addNode(x: number, y: number, z: number): number;
  addQuad(nodes: [number, number, number, number]): number;
}

export interface BuiltFlight {
  nodeIds: number[];
  quadIds: number[];
  /** Node ids along the bottom edge and the top edge, for supports and landings. */
  bottomEdge: [number, number];
  topEdge: [number, number];
}

/**
 * Mesh the flight into `divisions` quads along its run and create them.
 *
 * One quad per flight would solve, and would be a bad answer: a single MITC4
 * over a 4 m span reports the bending of a four-node element, not of a slab.
 * The default is one quad per step, which costs nothing at this size and puts
 * the mesh at the scale the geometry already has.
 *
 * Every point is welded through `findNode` first, so a flight built onto an
 * existing landing shares its nodes instead of laying a second set on top of
 * them — two coincident nodes analyse as a cut, with no visible symptom.
 */
export function buildFlight(
  host: StairHost, corners: [Vec3, Vec3, Vec3, Vec3], divisions: number,
): BuiltFlight {
  const n = Math.max(1, Math.round(divisions));
  const [a, b, c, d] = corners;
  const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => ({
    x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t,
  });
  const at = (p: Vec3): number => host.findNode(p.x, p.y, p.z) ?? host.addNode(p.x, p.y, p.z);

  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    left.push(at(lerp(a, d, t)));
    right.push(at(lerp(b, c, t)));
  }

  const quadIds: number[] = [];
  for (let i = 0; i < n; i++) {
    quadIds.push(host.addQuad([left[i], right[i], right[i + 1], left[i + 1]]));
  }

  return {
    nodeIds: [...new Set([...left, ...right])],
    quadIds,
    bottomEdge: [left[0], right[0]],
    topEdge: [left[n], right[n]],
  };
}
