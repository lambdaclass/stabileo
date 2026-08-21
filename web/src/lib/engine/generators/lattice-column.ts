/**
 * Lattice column geometry: two chords, battens and lacing.
 *
 * ── The shape ──────────────────────────────────────────────────────
 *
 * Two vertical chords separated by `widthM`, divided into `divisions` panels, with a
 * horizontal batten at every panel point and one diagonal per panel. That gives
 *
 *   chords    2 · divisions
 *   posts     divisions + 1
 *   diagonals divisions
 *
 * which is `4·divisions + 1` members in total — 25 for six divisions.
 *
 * ── Why the lacing alternates ──────────────────────────────────────
 *
 * A laced column with every diagonal leaning the same way is a real thing, but it is not
 * the usual one: under axial load the parallel arrangement puts a net shear into the
 * battens and racks the panel, while alternating lacing balances it panel to panel. So
 * zig-zag is the default and the parallel arrangement is offered rather than assumed,
 * because someone detailing a specific column may genuinely want it.
 *
 * ── The plane ──────────────────────────────────────────────────────
 *
 * XZ at y = 0, Z up, the chord separation along X — the same convention as the truss
 * generator, so the shed generator can place either without re-deriving anything.
 *
 * Pure: no store, no runes, no i18n.
 */

import { tallyRoles } from './member-roles';
import type { GenMember, GenNode, GenSupport, ParamProblem, Topology } from './truss-topology';

export const LACING_PATTERNS = ['zigzag', 'parallel'] as const;
export type LacingPattern = (typeof LACING_PATTERNS)[number];

export interface LatticeColumnParams {
  /** Overall height, base to top, m. */
  heightM: number;
  /** Centre-to-centre distance between the two chords, m. */
  widthM: number;
  /** Panels up the height. Battens sit at every panel point, ends included. */
  divisions: number;
  lacing: LacingPattern;
  chordContinuity: 'frame' | 'truss';
  webContinuity: 'frame' | 'truss';
  /**
   * Whether the base is fixed.
   *
   * A latticed column's two chords land on two separate anchor points, and pinning each
   * of them ALREADY restrains the column against rotation in its own plane — the couple
   * is carried by the pair, not by either base. So pinned chords are the honest default,
   * and fixing them additionally restrains out-of-plane rotation, which is a different
   * claim about the foundation and is therefore a choice.
   */
  fixedBase: boolean;
  /**
   * Add a node on the column's centreline at the top, tied to both chord heads.
   *
   * A latticed column has no material on its own axis, so a truss bearing on it has
   * nowhere to land: the two chord heads are `widthM` apart and the centreline between
   * them is empty. The cap is the node that makes the joint expressible — the truss
   * reaction arrives on the axis and is shared to the two chords through a pair of short
   * members, which is what a real cap plate does.
   *
   * Off by default: a column generated on its own has nothing to carry, and an unused
   * cap would be two members and a node that exist for no reason.
   */
  capTop: boolean;
}

export const DEFAULT_LATTICE_COLUMN_PARAMS: LatticeColumnParams = Object.freeze({
  heightM: 8,
  widthM: 0.6,
  divisions: 6,
  lacing: 'zigzag',
  chordContinuity: 'frame',
  webContinuity: 'truss',
  fixedBase: false,
  capTop: false,
});

export function validateLatticeColumnParams(p: LatticeColumnParams): ParamProblem[] {
  const out: ParamProblem[] = [];
  if (!(p.heightM > 0)) out.push({ field: 'spanM', key: 'generator.problem.heightPositive' });
  if (!(p.widthM > 0)) out.push({ field: 'depthM', key: 'generator.problem.widthPositive' });
  if (!Number.isInteger(p.divisions) || p.divisions < 1) {
    out.push({ field: 'panelsPerHalf', key: 'generator.problem.divisionsAtLeastOne' });
  }
  return out;
}

/**
 * Build the column.
 *
 * Node order is chord-by-chord — the whole left chord bottom to top, then the whole right
 * one — so that the shed generator can splice a column into a frame by index arithmetic
 * instead of by searching for coordinates.
 */
export function generateLatticeColumn(params: Partial<LatticeColumnParams> = {}): Topology {
  const p: LatticeColumnParams = { ...DEFAULT_LATTICE_COLUMN_PARAMS, ...params };
  const problems = validateLatticeColumnParams(p);
  if (problems.length > 0) {
    throw new Error(`generateLatticeColumn: invalid parameters — ${problems.map((x) => x.key).join(', ')}`);
  }

  const n = p.divisions;
  const dz = p.heightM / n;
  const halfW = p.widthM / 2;

  const nodes: GenNode[] = [];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= n; i++) {
    left.push(nodes.length);
    nodes.push({ i: nodes.length, x: -halfW, y: 0, z: i * dz });
  }
  for (let i = 0; i <= n; i++) {
    right.push(nodes.length);
    nodes.push({ i: nodes.length, x: halfW, y: 0, z: i * dz });
  }

  const members: GenMember[] = [];
  for (let i = 0; i < n; i++) {
    members.push({ a: left[i], b: left[i + 1], role: 'chord', type: p.chordContinuity });
    members.push({ a: right[i], b: right[i + 1], role: 'chord', type: p.chordContinuity });
  }
  for (let i = 0; i <= n; i++) {
    members.push({ a: left[i], b: right[i], role: 'post', type: p.webContinuity });
  }
  for (let i = 0; i < n; i++) {
    const leansRight = p.lacing === 'parallel' ? true : i % 2 === 0;
    members.push(leansRight
      ? { a: left[i], b: right[i + 1], role: 'diagonal', type: p.webContinuity }
      : { a: right[i], b: left[i + 1], role: 'diagonal', type: p.webContinuity });
  }

  // The cap: one node on the axis at the head, tied to both chord tops.
  //
  // ── Why these two are `frame` and not `webContinuity` ──────────────
  //
  // They were `truss`, like the rest of the web, and that made the cap node a mechanism.
  // The two cap members are COLLINEAR — chord top, axis, chord top, all at z = heightM —
  // so a pair of pin-ended bars gives the node stiffness along that one line and nothing
  // else: no transverse stiffness, no rotational stiffness. The node was free to move in
  // the two directions perpendicular to the cap and to spin about it.
  //
  // Measured on the default shed, which is where it showed: singular stiffness matrix, at
  // every frame count from 2 to 7. With longitudinal beams switched on the matrix stopped
  // being singular and started returning 2·10^11 m of displacement — a mechanism wearing a
  // number. Rigid here, the same shed deflects 4.0 mm, against 3.2 mm for the same shed on
  // solid columns. Two independent column types agreeing to within a millimetre is the
  // check that this is a stiffness, not a coincidence.
  //
  // It is also what the doc comment on `capTop` already claimed the cap was: a cap PLATE.
  // A plate is a rigid connection. Two pin-ended bars were never a model of one.
  //
  // The rest of the web keeps `webContinuity`. Posts and diagonals are triangulated, so
  // pinning them is both conventional and stable; the cap is not triangulated, and that is
  // the whole difference.
  if (p.capTop) {
    const cap = nodes.length;
    nodes.push({ i: cap, x: 0, y: 0, z: p.heightM });
    members.push({ a: left[n], b: cap, role: 'post', type: 'frame' });
    members.push({ a: right[n], b: cap, role: 'post', type: 'frame' });
  }

  const baseType = p.fixedBase ? 'fixed' as const : 'pinned' as const;
  const supports: GenSupport[] = [
    { node: left[0], type: baseType },
    { node: right[0], type: baseType },
  ];

  const assumptions = [
    p.fixedBase ? 'generator.assume.baseFixed' : 'generator.assume.baseChordsPinned',
    p.webContinuity === 'truss' ? 'generator.assume.webPinned' : 'generator.assume.webContinuous',
    p.lacing === 'zigzag' ? 'generator.assume.lacingZigzag' : 'generator.assume.lacingParallel',
  ];
  if (p.capTop) assumptions.push('generator.assume.columnCapSharesReaction');

  let totalLengthM = 0;
  for (const m of members) {
    const a = nodes[m.a];
    const b = nodes[m.b];
    totalLengthM += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }

  return {
    nodes,
    members,
    supports,
    counts: tallyRoles(members),
    totalLengthM,
    slopePercent: null,
    assumptions,
  };
}

/*
 * No index helpers for the chord heads or the cap.
 *
 * An earlier version exported `latticeTopNodes` and `latticeCapNode`, computing positions
 * from `divisions`. Nothing used them: `generateShed` joins pieces by COORDINATE, which the
 * geometry decides rather than the node ordering. Keeping them would have been worse than
 * useless — they encode an ordering assumption a change to the layout would silently
 * invalidate, handing a caller the wrong nodes instead of an error.
 *
 * The ordering is still a documented property, and `lattice-column.test.ts` asserts it by
 * position.
 */
