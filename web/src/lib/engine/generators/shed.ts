/**
 * The shed: transverse frames repeated along the building, tied together.
 *
 * ── It composes, it does not re-derive ─────────────────────────────
 *
 * A shed is columns plus trusses plus longitudinal beams plus purlins, and the first three
 * of those already exist as their own generators. So this module places copies of them and
 * joins the copies; it contains no truss geometry and no lacing pattern of its own. A
 * second implementation of a Pratt web living in here is precisely how the preview and the
 * model come to disagree.
 *
 * ── Joining is by coordinate, not by index ─────────────────────────
 *
 * Pieces are built in their own frames, transformed into the building, and then merged on
 * position. Index arithmetic across four kinds of piece at two dozen placements is the sort
 * of thing that works until someone adds a parameter; a coordinate merge is decided by the
 * geometry itself and cannot drift out of step with it.
 *
 * The tolerance is 0.1 mm. Coarse enough that a truss bearing and a column cap generated
 * from the same height are one node; fine enough that nothing a user can dimension
 * collapses by accident.
 *
 * ── The building's axes ────────────────────────────────────────────
 *
 *   X  across the span            — VT, `spanM`
 *   Y  along the building         — VP, `bayM`, between frames
 *   Z  up                         — PD, `clearHeightM` to the underside of the truss
 *
 * Pure: no store, no runes, no i18n.
 */

import type { MemberRole } from './member-roles';
import { tallyRoles } from './member-roles';
import {
  DEFAULT_TRUSS_PARAMS, generateTruss, validateTrussParams,
  type GenMember, type GenNode, type GenSupport, type ParamProblem, type Topology,
  type TrussParams,
} from './truss-topology';
import {
  DEFAULT_LATTICE_COLUMN_PARAMS, generateLatticeColumn, validateLatticeColumnParams,
  type LatticeColumnParams,
} from './lattice-column';

// ─── Parameters ──────────────────────────────────────────────────────

export type ColumnKind = 'solid' | 'lattice';

/** Which bays of the building carry bracing. */
export const BRACING_BAYS = ['end', 'all'] as const;
export type BracingBays = (typeof BRACING_BAYS)[number];

export interface ShedParams {
  /** VT — transverse span, column centreline to column centreline, m. */
  spanM: number;
  /** VP — spacing between frames, m. */
  bayM: number;
  /** How many transverse frames. Two is the minimum that makes a building. */
  frames: number;
  /** PD — clear height, ground to the underside of the roof structure, m. */
  clearHeightM: number;
  columnKind: ColumnKind;
  /** Lattice column geometry. Ignored when the columns are solid. */
  column: Pick<LatticeColumnParams, 'widthM' | 'divisions' | 'lacing' | 'fixedBase'>;
  /** Longitudinal beams tying the column heads along the building. */
  longitudinalBeams: boolean;
  /** Roof structure. Without it the shed is columns and whatever ties them. */
  roof: boolean;
  /** Truss parameters, minus the span, which the shed owns. */
  truss: Omit<TrussParams, 'spanM'>;
  /** Purlins spanning between the frames on the top chord. */
  purlins: boolean;
  /**
   * Cross-bracing in the WALL planes, tying each column line along the building.
   *
   * The element PR21 recorded as missing and did not place. A latticed column is braced in its
   * own plane by its lacing and in no other, which is why a shed's bases default to fixed: with
   * a pin under each chord the pair can rotate about the line joining them. A real shed resists
   * that with longitudinal bracing, and this is it.
   *
   * Placed in the plane of the OUTER chord, which is where a facade brace goes and — not
   * incidentally — the only plane whose top and bottom nodes both already exist. Two crossing
   * diagonals per braced bay per wall, pin-ended, which is how a brace is detailed and how it
   * is modelled.
   */
  wallBracing: boolean;
  /**
   * Cross-bracing in the ROOF plane between the top chords of adjacent frames.
   *
   * The wind girder every shed has and this generator did not. It carries longitudinal load
   * from the roof to the braced walls, and it triangulates a roof plane that purlins and chords
   * otherwise leave as a grid of quadrilaterals.
   *
   * It is NOT a substitute for purlins, and a test says so rather than leaving it to be
   * assumed: braced end bays restrain the frames they connect and leave the interior ones with
   * nothing holding them sideways, so `purlins: false` stays a mechanism however much bracing
   * is added at the ends. Only bracing EVERY bay reaches every frame — which is what a purlin
   * line does, one member at a time.
   */
  roofBracing: boolean;
  /**
   * Vertical cross-bracing BETWEEN adjacent trusses, tying the top-chord line down to the
   * bearing line.
   *
   * This is the member the roof plane's load path was missing, and the measurement that
   * identifies it is in `shed-bracing.test.ts`: restraining translation along the building at
   * every node above the eaves reduces the response to exactly zero, while restraining the eave
   * line itself changes nothing. So the free body is the roof, and it is free because a planar
   * truss with a pin-jointed web has no out-of-plane stiffness — the whole top chord, tied frame
   * to frame by the purlins, translates sideways as one piece.
   *
   * Bracing the roof PLANE does not fix that. Diagonals between top-chord nodes triangulate the
   * plane and leave the plane free to slide; what anchors it is a member from the top chord of
   * one frame to the bearing of the next, in a vertical plane along the building. That is the
   * vertical bracing every shed carries between its trusses, and it is what turns roof bracing
   * from a triangulated plate into a load path.
   *
   * Placed in three vertical planes per braced bay — the two eaves and the middle station —
   * which is where it is detailed, and enough to make the tie statically determinate without
   * filling the building with steel.
   */
  trussBracing: boolean;
  /**
   * Which bays carry the bracing.
   *
   * `end` is practice: the first and last bay, so the braced bay is reachable and the rest of
   * the building hangs off it through the purlins. `all` exists because it is the configuration
   * that answers "would more bracing have fixed this", and a generator that cannot express the
   * alternative cannot be used to test the claim.
   */
  bracingBays: BracingBays;
  /**
   * Whether the column bases are fixed.
   *
   * ── Why this defaults to TRUE, unlike the standalone column ──────
   *
   * A latticed column is braced in its OWN plane by its lacing and nothing else. Out of
   * that plane its two chords are a pair of vertical members, and with a pin under each one
   * the pair can rotate about the line joining them: a real mechanism, which the solver
   * correctly reports as a singular system. A real shed resists it with longitudinal
   * bracing, which this generator does not place, or with base fixity, which it can.
   *
   * The standalone lattice column keeps a pinned default because on its own it solves — the
   * difference is that a shed's columns carry a roof whose weight has nowhere to go if the
   * frame can fold sideways.
   *
   * Setting this false is allowed and is disclosed: the model then has no out-of-plane
   * restraint at all, and `generator.assume.latticeBasesPinnedNoOutOfPlane` says so.
   */
  fixedBase: boolean;
}

export const DEFAULT_SHED_PARAMS: ShedParams = Object.freeze({
  spanM: 10,
  bayM: 5,
  frames: 6,
  clearHeightM: 6,
  columnKind: 'lattice',
  column: { widthM: 0.6, divisions: 6, lacing: 'zigzag' as const, fixedBase: false },
  longitudinalBeams: false,
  roof: true,
  truss: { ...DEFAULT_TRUSS_PARAMS, kind: 'trapezoidal' } as Omit<TrussParams, 'spanM'>,
  purlins: true,
  // Off, both of them, so the shed a user gets by pressing Generate is exactly the one PR21
  // measured and pinned. Bracing is an addition to that model, not a change to it.
  wallBracing: false,
  roofBracing: false,
  trussBracing: false,
  bracingBays: 'end' as const,
  fixedBase: true,
});

export function validateShedParams(p: ShedParams): ParamProblem[] {
  const out: ParamProblem[] = [];
  if (!(p.spanM > 0)) out.push({ field: 'spanM', key: 'generator.problem.spanPositive' });
  if (!(p.bayM > 0)) out.push({ field: 'spanM', key: 'generator.problem.bayPositive' });
  if (!Number.isInteger(p.frames) || p.frames < 2) {
    out.push({ field: 'panelsPerHalf', key: 'generator.problem.framesAtLeastTwo' });
  }
  if (!(p.clearHeightM > 0)) out.push({ field: 'riseM', key: 'generator.problem.heightPositive' });
  if (p.roof) out.push(...validateTrussParams({ ...p.truss, spanM: p.spanM } as TrussParams));
  if (p.columnKind === 'lattice') {
    out.push(...validateLatticeColumnParams({
      ...DEFAULT_LATTICE_COLUMN_PARAMS, ...p.column, heightM: p.clearHeightM,
    }));
  }
  return out;
}

// ─── Assembly primitives ─────────────────────────────────────────────

/** Tolerance for deciding two generated nodes are the same node, m. */
const MERGE_TOL = 1e-4;

interface Builder {
  nodes: GenNode[];
  members: GenMember[];
  supports: GenSupport[];
  assumptions: Set<string>;
  index: Map<string, number>;
}

function newBuilder(): Builder {
  return { nodes: [], members: [], supports: [], assumptions: new Set(), index: new Map() };
}

/** Quantised position key. Rounds to the tolerance, so two near-coincident points collide. */
function key(x: number, y: number, z: number): string {
  const q = (v: number) => Math.round(v / MERGE_TOL);
  // `-0` and `0` quantise to different strings without the `+ 0` normalisation, which would
  // leave a column head and a truss bearing generated from opposite directions unmerged.
  return `${q(x) + 0},${q(y) + 0},${q(z) + 0}`;
}

/** Add a node, or return the existing one at that position. */
function addNode(b: Builder, x: number, y: number, z: number): number {
  const k = key(x, y, z);
  const hit = b.index.get(k);
  if (hit !== undefined) return hit;
  const i = b.nodes.length;
  b.nodes.push({ i, x, y, z });
  b.index.set(k, i);
  return i;
}

/**
 * The node at a position, or -1.
 *
 * Distinct from `addNode` on purpose. Bracing has to attach to nodes that already exist —
 * a chord foot, a chord head, a top-chord panel point — and `addNode` would happily invent one
 * at a position where nothing is, leaving a node held by two diagonals and nothing else. That
 * is a free node, which is to say a mechanism, introduced by the member meant to remove one.
 *
 * So the anchors are looked up, a brace whose anchor is missing is not drawn, and the member
 * counts are asserted in `shed-bracing.test.ts` — a silent skip fails there rather than
 * shipping a wall with no brace in it.
 */
function findNode(b: Builder, x: number, y: number, z: number): number {
  return b.index.get(key(x, y, z)) ?? -1;
}

/** Place a whole topology into the building, mapping its local frame through `at`. */
function place(
  b: Builder,
  t: Topology,
  at: (n: GenNode) => { x: number; y: number; z: number },
  opts: { withSupports?: boolean; roleOverride?: Partial<Record<MemberRole, MemberRole>> } = {},
): number[] {
  const map = t.nodes.map((n) => {
    const p = at(n);
    return addNode(b, p.x, p.y, p.z);
  });
  for (const m of t.members) {
    b.members.push({
      ...m,
      a: map[m.a],
      b: map[m.b],
      role: opts.roleOverride?.[m.role] ?? m.role,
    });
  }
  if (opts.withSupports) {
    for (const s of t.supports) b.supports.push({ node: map[s.node], type: s.type });
  }
  for (const a of t.assumptions) b.assumptions.add(a);
  return map;
}

/** Finish: tally, total, and a stable ordering. */
function finish(b: Builder, slopePercent: number | null): Topology {
  // A merge can leave two identical members if two pieces both drew the same tie. Dropped
  // here rather than avoided at every call site, because "did I already draw this" is a
  // question the assembly can answer and the caller cannot.
  const seen = new Set<string>();
  const members: GenMember[] = [];
  for (const m of b.members) {
    if (m.a === m.b) continue;
    const k = m.a < m.b ? `${m.a}-${m.b}` : `${m.b}-${m.a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    members.push(m);
  }

  const supports: GenSupport[] = [];
  const seenSupport = new Set<number>();
  for (const s of b.supports) {
    if (seenSupport.has(s.node)) continue;
    seenSupport.add(s.node);
    supports.push(s);
  }

  let totalLengthM = 0;
  for (const m of members) {
    const a = b.nodes[m.a];
    const c = b.nodes[m.b];
    totalLengthM += Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
  }

  return {
    nodes: b.nodes,
    members,
    supports,
    counts: tallyRoles(members),
    totalLengthM,
    slopePercent,
    assumptions: [...b.assumptions].sort(),
  };
}

// ─── The shed ────────────────────────────────────────────────────────

export interface ShedTopology extends Topology {
  /** Footprint, m² — the area the building covers, for the preview. */
  areaM2: number;
  /** How many frames were placed. */
  frames: number;
}

export function generateShed(params: Partial<ShedParams> = {}): ShedTopology {
  const p: ShedParams = {
    ...DEFAULT_SHED_PARAMS,
    ...params,
    column: { ...DEFAULT_SHED_PARAMS.column, ...params.column },
    truss: { ...DEFAULT_SHED_PARAMS.truss, ...params.truss },
  };
  const problems = validateShedParams(p);
  if (problems.length > 0) {
    throw new Error(`generateShed: invalid parameters — ${problems.map((x) => `${x.field}:${x.key}`).join(', ')}`);
  }

  const b = newBuilder();
  const supportType = p.fixedBase ? 'fixed' : 'pinned';

  // Truss built once and reused: every frame is the same, and generating it per frame
  // would be the same arithmetic done `frames` times with a chance of differing.
  const truss = p.roof
    ? generateTruss({ ...p.truss, spanM: p.spanM } as TrussParams)
    : null;

  const latticeColumn = p.columnKind === 'lattice'
    ? generateLatticeColumn({
        ...p.column,
        heightM: p.clearHeightM,
        fixedBase: p.fixedBase || p.column.fixedBase,
        capTop: true,
      })
    : null;

  /** Column head nodes, per frame, per side — what the beams and the roof land on. */
  const heads: Array<[number, number]> = [];

  for (let f = 0; f < p.frames; f++) {
    const y = f * p.bayM;

    const sideHeads: number[] = [];
    for (const xc of [0, p.spanM]) {
      if (latticeColumn) {
        // The column's own X is its chord separation; it straddles the centreline.
        place(b, latticeColumn, (n) => ({ x: xc + n.x, y, z: n.z }), { withSupports: true });
        sideHeads.push(addNode(b, xc, y, p.clearHeightM));
      } else {
        const foot = addNode(b, xc, y, 0);
        const head = addNode(b, xc, y, p.clearHeightM);
        b.members.push({ a: foot, b: head, role: 'column', type: 'frame' });
        b.supports.push({ node: foot, type: supportType });
        sideHeads.push(head);
      }
    }
    heads.push([sideHeads[0], sideHeads[1]]);

    if (truss) {
      // The truss is generated with its bottom chord on z = 0; it bears at the clear
      // height, so its bearings merge with the column heads by coordinate.
      place(b, truss, (n) => ({ x: n.x, y, z: n.z + p.clearHeightM }));
    }
  }

  // ── Beams ──
  //
  // Along the building, the eave beams tie the heads bay by bay on both sides. Across it,
  // a head beam ties the two columns of a frame — and that one is placed ONLY when there
  // is no truss, because a truss already spans between the heads and a beam alongside it
  // would be a second load path drawn over the first. With no roof it is what makes the
  // two columns a portal instead of two cantilevers standing near each other.
  if (p.longitudinalBeams) {
    for (let f = 1; f < p.frames; f++) {
      for (const side of [0, 1] as const) {
        b.members.push({ a: heads[f - 1][side], b: heads[f][side], role: 'beam', type: 'frame' });
      }
    }
    if (!truss) {
      for (let f = 0; f < p.frames; f++) {
        b.members.push({ a: heads[f][0], b: heads[f][1], role: 'beam', type: 'frame' });
      }
      b.assumptions.add('generator.assume.headBeamMakesPortal');
    }
    b.assumptions.add('generator.assume.eaveBeamsContinuous');
  }

  // ── Purlins: every top-chord node, tied bay by bay ──
  if (p.purlins && truss) {
    const topNodes = topChordNodes(truss);
    for (let f = 1; f < p.frames; f++) {
      for (const local of topNodes) {
        const n = truss.nodes[local];
        const a = addNode(b, n.x, (f - 1) * p.bayM, n.z + p.clearHeightM);
        const c = addNode(b, n.x, f * p.bayM, n.z + p.clearHeightM);
        b.members.push({
          a, b: c, role: 'purlin', type: 'frame',
          // A purlin lies across the roof plane, so its web has to be rolled by the local
          // pitch to stand normal to the sheeting. Computed here because only the shed
          // knows the slope at this particular node, and stored because the roof, once
          // laid, does not re-lay itself when someone edits the pitch afterwards.
          rollAngleDeg: rollForSlope(truss, local),
        });
      }
    }
    b.assumptions.add('generator.assume.purlinsRolledToPitch');
  }

  // ── Bracing ──
  //
  // Placed after the purlins because both read the truss's top-chord nodes, and after the
  // columns because the wall braces attach to chord feet and heads the placement already made.
  const bays = bracedBays(p);

  if (p.wallBracing) {
    /*
     * The wall plane, and why it is the outer chord's.
     *
     * A latticed column has two chord lines and no material on its axis. A brace in the plane
     * of the OUTER chord is where a facade brace actually sits — flush with the cladding — and
     * it is the plane whose four corner nodes all exist already: chord feet at z = 0 and chord
     * heads at z = clearHeight, both generated by `place`. A brace to the column axis would
     * need a node on the axis at the base, where the column has nothing.
     *
     * A solid column has one line, so its own foot and head are the corners.
     */
    const halfW = p.column.widthM / 2;
    for (const f of bays) {
      for (const [side, xc] of ([[0, 0], [1, p.spanM]] as const)) {
        // Outward from the building on each side, so both walls are braced in their own plane.
        const x = p.columnKind === 'lattice' ? xc + (side === 0 ? -halfW : halfW) : xc;
        const yA = f * p.bayM;
        const yB = (f + 1) * p.bayM;
        const footA = findNode(b, x, yA, 0);
        const footB = findNode(b, x, yB, 0);
        const headA = findNode(b, x, yA, p.clearHeightM);
        const headB = findNode(b, x, yB, p.clearHeightM);
        if (footA < 0 || footB < 0 || headA < 0 || headB < 0) continue;
        // Two crossing diagonals, pin-ended. No node at the crossing: braces are detailed to
        // pass one in front of the other, and modelling an intersection would invent a joint.
        b.members.push({ a: footA, b: headB, role: 'bracing', type: 'truss' });
        b.members.push({ a: headA, b: footB, role: 'bracing', type: 'truss' });
      }
    }
    b.assumptions.add('generator.assume.wallBracingPinnedOuterChordPlane');
  }

  if (p.roofBracing && truss) {
    /*
     * The roof plane. Diagonals between consecutive top-chord panel points of adjacent frames,
     * which triangulates a grid the chords and purlins otherwise leave as quadrilaterals.
     *
     * One diagonal per panel, alternating direction along the span so the bay is laced rather
     * than leaning — the same reason the lattice column's default lacing zig-zags.
     */
    const topNodes = topChordNodes(truss);
    for (const f of bays) {
      for (let k = 0; k + 1 < topNodes.length; k++) {
        const n0 = truss.nodes[topNodes[k]];
        const n1 = truss.nodes[topNodes[k + 1]];
        const z0 = n0.z + p.clearHeightM;
        const z1 = n1.z + p.clearHeightM;
        const yA = f * p.bayM;
        const yB = (f + 1) * p.bayM;
        const a = k % 2 === 0
          ? findNode(b, n0.x, yA, z0)
          : findNode(b, n1.x, yA, z1);
        const c = k % 2 === 0
          ? findNode(b, n1.x, yB, z1)
          : findNode(b, n0.x, yB, z0);
        if (a < 0 || c < 0) continue;
        b.members.push({ a, b: c, role: 'bracing', type: 'truss' });
      }
    }
    b.assumptions.add('generator.assume.roofBracingPinnedInRoofPlane');
  }

  if (p.trussBracing && truss) {
    /*
     * The vertical planes, and why there are three of them.
     *
     * A cross in a vertical plane along the building ties the TOP chord of one frame to the
     * BEARING line of the next, which is the only tie that reaches a restrained line: the eave
     * beams tie the bearings frame to frame, and the wall bracing takes them to the ground.
     *
     * The two eave stations are where this is detailed in practice and are where the truss is
     * shallowest; the middle station is the deepest and does the most work. Every other station
     * would add members without adding a path.
     *
     * Both nodes of each pair are looked up, never created: the pair exists because the truss
     * put a top-chord node and a bearing node at the same station, and a station where it did
     * not is skipped rather than invented.
     */
    const topNodes = topChordNodes(truss);
    const stations = [0, Math.floor((topNodes.length - 1) / 2), topNodes.length - 1]
      .filter((v, i, a) => a.indexOf(v) === i);
    for (const f of bays) {
      for (const st of stations) {
        const n = truss.nodes[topNodes[st]];
        const zTop = n.z + p.clearHeightM;
        const zBot = lowestZAt(b, n.x, f * p.bayM, zTop);
        if (zBot === null) continue;
        const yA = f * p.bayM;
        const yB = (f + 1) * p.bayM;
        const topA = findNode(b, n.x, yA, zTop);
        const topB = findNode(b, n.x, yB, zTop);
        const botA = findNode(b, n.x, yA, zBot);
        const botB = findNode(b, n.x, yB, zBot);
        if (topA < 0 || topB < 0 || botA < 0 || botB < 0) continue;
        b.members.push({ a: topA, b: botB, role: 'bracing', type: 'truss' });
        b.members.push({ a: botA, b: topB, role: 'bracing', type: 'truss' });
      }
    }
    b.assumptions.add('generator.assume.trussBracingTiesRoofToBearing');
  }

  if (!p.roof) b.assumptions.add('generator.assume.noRoofStructure');
  /*
   * A roof with no purlins is a set of planar trusses with nothing holding them sideways.
   *
   * Demonstrated rather than assumed: restraining `ty` — translation along the building — at
   * the 33 roof nodes of a 3-frame shed turns a singular stiffness matrix into a 4.0 mm
   * deflection, while restraining ANY combination of rotations at those same nodes leaves it
   * singular. So what is missing is out-of-plane TRANSLATIONAL restraint at the truss nodes,
   * and purlins are precisely the members that supply it — the eave beams do not, because
   * they tie the column heads and every truss node sits above them.
   *
   * No bracing is invented here. Purlins are already a switch on this generator, and the user
   * turned them off; the model records what that costs, and the panel says it before Generate.
   */
  if (p.roof && !p.purlins) b.assumptions.add('generator.assume.roofWithoutPurlins');
  if (p.columnKind === 'solid') b.assumptions.add('generator.assume.solidColumns');
  // Stated rather than left for the solver to discover: a latticed column on pinned chord
  // feet has no out-of-plane restraint, because the lacing only braces its own plane.
  if (p.columnKind === 'lattice' && !(p.fixedBase || p.column.fixedBase)) {
    b.assumptions.add('generator.assume.latticeBasesPinnedNoOutOfPlane');
  }

  const t = finish(b, truss?.slopePercent ?? null);
  return {
    ...t,
    areaM2: p.spanM * p.bayM * (p.frames - 1),
    frames: p.frames,
  };
}

/**
 * The lowest node already placed at a station, below a given height. Null when there is none.
 *
 * "Below the top chord and at the same x and y" is what makes a vertical plane along the
 * building expressible: the bottom of the pair is whatever the truss and the column left there
 * — a bottom-chord node at mid-span, a bearing at the eave — and reading it off the assembly
 * means the brace lands on real steel instead of on a computed position.
 */
function lowestZAt(b: Builder, x: number, y: number, belowZ: number): number | null {
  let best: number | null = null;
  for (const n of b.nodes) {
    if (Math.abs(n.x - x) > MERGE_TOL || Math.abs(n.y - y) > MERGE_TOL) continue;
    if (n.z >= belowZ - MERGE_TOL) continue;
    if (best === null || n.z < best) best = n.z;
  }
  return best;
}

/**
 * The bays that carry bracing, as the index of their FIRST frame.
 *
 * `end` gives the first and last bay — and gives one of them, not two, on a two-frame shed,
 * because there is only one bay to brace and drawing it twice would double every diagonal.
 */
function bracedBays(p: ShedParams): number[] {
  const lastBay = p.frames - 2;
  if (lastBay < 0) return [];
  if (p.bracingBays === 'all') {
    return Array.from({ length: lastBay + 1 }, (_, i) => i);
  }
  return lastBay === 0 ? [0] : [0, lastBay];
}

/**
 * The truss's top-chord node indices, in order along the span.
 *
 * Read off the members rather than assumed from the node ordering: a truss kind that lays
 * its nodes out differently would silently put purlins on the bottom chord otherwise.
 */
function topChordNodes(t: Topology): number[] {
  const onChord = new Set<number>();
  for (const m of t.members) {
    if (m.role !== 'chord' && m.role !== 'rafter') continue;
    onChord.add(m.a);
    onChord.add(m.b);
  }
  // At each x station the top chord is the higher of the nodes there.
  const byX = new Map<string, number>();
  for (const i of onChord) {
    const n = t.nodes[i];
    const k = String(Math.round(n.x / MERGE_TOL));
    const cur = byX.get(k);
    if (cur === undefined || t.nodes[cur].z < n.z) byX.set(k, i);
  }
  return [...byX.values()].sort((a, c) => t.nodes[a].x - t.nodes[c].x);
}

/**
 * The roll a purlin needs at this top-chord node, degrees.
 *
 * The local pitch, taken from the chord segments meeting at the node and averaged where
 * there are two — at the ridge that gives zero, which is right: a purlin on the apex sits
 * level between two opposing slopes.
 */
function rollForSlope(t: Topology, node: number): number {
  const slopes: number[] = [];
  for (const m of t.members) {
    if (m.role !== 'chord' && m.role !== 'rafter') continue;
    if (m.a !== node && m.b !== node) continue;
    const a = t.nodes[m.a];
    const c = t.nodes[m.b];
    if (t.nodes[node].z < Math.min(a.z, c.z) - MERGE_TOL) continue;
    const run = c.x - a.x;
    if (Math.abs(run) < MERGE_TOL) continue;
    slopes.push(Math.atan2(c.z - a.z, run) * 180 / Math.PI);
  }
  if (slopes.length === 0) return 0;
  const mean = slopes.reduce((s, v) => s + v, 0) / slopes.length;
  return Math.abs(mean) < 1e-9 ? 0 : mean;
}
