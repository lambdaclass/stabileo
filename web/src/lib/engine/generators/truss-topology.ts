/**
 * Truss geometry: nodes, connectivity and roles. No profiles, no materials, no loads.
 *
 * ── What a generator may and may not claim ─────────────────────────
 *
 * This module produces GEOMETRY. It states where the nodes are, what connects to what, and
 * what each member is for. It says nothing about whether any of it verifies — a generated
 * truss arrives with every member undesigned, and that is the honest state for it to be in.
 *
 * That separation is what makes this part finishable today while steel DESIGN is not: a
 * node position is a fact this app can establish and test, and a capacity is not, because
 * there is no usable metallic authority behind it yet.
 *
 * ── The plane ──────────────────────────────────────────────────────
 *
 * Everything is generated in the XZ plane at y = 0, with Z up and the span along X. That
 * is the app's 2-D convention — `buildSolverInput` projects 2-D models to XZ — so a single
 * generated truss is a valid 2-D model as it stands, and the shed generator gets its
 * transverse frames by repeating this along Y without re-deriving anything.
 *
 * ── Parameter meanings are stated, not implied ─────────────────────
 *
 * Truss vocabulary is not standard across catalogues, and a parameter whose meaning a user
 * has to infer from a preview is a parameter they will eventually get wrong. Each field
 * says what it measures and between which two points.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { MemberRole } from './member-roles';
import { tallyRoles } from './member-roles';

// ─── Parameters ──────────────────────────────────────────────────────

export const TRUSS_KINDS = [
  'trapezoidal',
  'parallelChord',
  'pratt',
  'arch',
  'rolledPortal',
] as const;

export type TrussKind = (typeof TRUSS_KINDS)[number];

export const ARCH_CURVES = ['semiArch', 'parallelChord', 'concave'] as const;
export type ArchCurve = (typeof ARCH_CURVES)[number];

/**
 * Which way the diagonals lean.
 *
 * ── Pratt and Howe, and which is which ──────────────────────────────
 *
 * Under gravity on a simply supported truss the two put the web into opposite actions, and
 * the orientation that produces each is decidable by statics rather than by convention:
 *
 * Cut a panel in the LEFT half and take the left free body. The support reaction is upward,
 * so whatever the diagonal does to that body, its vertical component must be DOWNWARD. A
 * diagonal running from the top chord down to the bottom chord as it moves inward pulls the
 * body down-and-right when it is in tension — so that diagonal is in TENSION, and it
 * **descends toward midspan**. That is **Pratt**: diagonals in tension, posts in compression.
 *
 * Run the diagonal the other way — rising toward midspan — and tension would pull the free
 * body UP, adding to the reaction instead of balancing it. It cannot be in tension, so it is
 * in compression. That is **Howe**.
 *
 * This header used to say the opposite ("Pratt diagonals rise towards midspan and go into
 * tension"), and the generator was built to match the header, so every Pratt truss the app
 * produced was a Howe. The test that covered this compared the two patterns to each other and
 * checked both were symmetric — true of a swapped pair — so nothing caught it. The test below
 * now pins the DIRECTION, which is the property a name refers to.
 *
 * ── Warren ─────────────────────────────────────────────────────────
 *
 * Alternating diagonals with no posts: the web is a row of triangles, each diagonal leaning
 * opposite its neighbour. Members alternate tension and compression under gravity, and the
 * absence of verticals is the point — it is what makes a Warren lighter and its panel points
 * fewer. Posts are not offered as a variant here; a Warren with verticals is a different
 * truss and should be asked for as one.
 */
export const WEB_PATTERNS = ['pratt', 'howe', 'warren'] as const;
export type WebPattern = (typeof WEB_PATTERNS)[number];

export interface TrussParams {
  kind: TrussKind;
  /** Span between supports, measured along X between the two bottom-chord ends, m. */
  spanM: number;
  /**
   * Depth at the support: the vertical distance between the chords at x = 0, m.
   *
   * Zero gives a truss that comes to a point at the bearing. Not used by `pratt`, whose
   * chords are parallel and horizontal, nor by `rolledPortal`, which has one chord.
   */
  endDepthM: number;
  /**
   * Rise: how much higher the ridge is than the eaves, m.
   *
   * Measured on the TOP chord, from x = 0 to midspan. The roof slope follows from it and
   * the span; it is not an independent input.
   */
  riseM: number;
  /**
   * Constant depth between the chords, m. `parallelChord` and `pratt` only.
   *
   * For those two the chords stay parallel, so one depth describes the whole truss and
   * `endDepthM` would be the same number said twice.
   */
  depthM: number;
  /**
   * Flat length of the top chord centred on the ridge, m. `trapezoidal` only.
   *
   * Zero gives an apex. A non-zero plateau is what makes the shape trapezoidal rather
   * than triangular, which is where the kind gets its name.
   */
  plateauM: number;
  /**
   * Panels per half. The full truss has twice this many, so the geometry is symmetric by
   * construction and a user cannot ask for an odd number that has no midspan node.
   *
   * For a half truss this is the panel count over the WHOLE span, since there are no
   * halves to be symmetric about.
   */
  panelsPerHalf: number;
  /** Monopitch: one slope across the whole span, no mirror. */
  halfTruss: boolean;
  /** `arch` only. */
  archCurve: ArchCurve;
  webPattern: WebPattern;
  /**
   * Subdivide each diagonal, for long panels.
   *
   * Adds a post and a sub-diagonal per panel around two new panel points, halving the main
   * diagonal's buckling length and the bottom chord's unbraced length. Only meaningful for a
   * pattern that HAS diagonals to subdivide and more than one panel per half — see
   * `subdivisionApplies`, which the interface uses to decide whether to offer the control at
   * all rather than showing an inert checkbox.
   */
  subdivideDiagonals: boolean;
  /** Chords continuous (`frame`) or pin-ended (`truss`). */
  chordContinuity: 'frame' | 'truss';
  /** Posts and diagonals continuous (`frame`) or pin-ended (`truss`). */
  webContinuity: 'frame' | 'truss';
}

export const DEFAULT_TRUSS_PARAMS: TrussParams = Object.freeze({
  kind: 'trapezoidal',
  spanM: 10,
  endDepthM: 0.6,
  riseM: 1,
  depthM: 1,
  plateauM: 0,
  panelsPerHalf: 5,
  halfTruss: false,
  archCurve: 'semiArch',
  webPattern: 'pratt',
  // Off by default: it is a decision about a long span, not a shape most trusses want.
  subdivideDiagonals: false,
  // A truss whose chords run through the panel points is how they are actually built and
  // how they are actually detailed; pin-ending every chord segment is a teaching
  // idealisation. The web is the opposite: gusseted diagonals are close enough to pinned
  // that modelling them as moment-carrying overstates the joints.
  chordContinuity: 'frame',
  webContinuity: 'truss',
});

// ─── Output ──────────────────────────────────────────────────────────

export interface GenNode {
  /** Index within this generated piece, 0-based. Not a model id. */
  i: number;
  x: number;
  y: number;
  z: number;
}

export interface GenMember {
  /** Index into `nodes`. */
  a: number;
  b: number;
  role: MemberRole;
  type: 'frame' | 'truss';
  /**
   * Roll of the profile about the member axis, degrees, when the GENERATOR knows it.
   *
   * A purlin laid across a pitched roof has to be rolled by the roof's own slope for its
   * web to stand perpendicular to the sheeting, and only the generator that placed it
   * knows that angle. It is stored rather than recomputed at draw time on purpose: change
   * the pitch afterwards and the purlin is already fixed to the rafters — recomputing
   * would silently re-lay a roof that has been built.
   *
   * Absent means no roll, which is the answer for every member whose orientation is fully
   * described by its own direction.
   */
  rollAngleDeg?: number;
}

export interface GenSupport {
  /** Index into `nodes`. */
  node: number;
  type: 'pinned' | 'rollerX' | 'fixed';
}

export interface Topology {
  nodes: GenNode[];
  members: GenMember[];
  supports: GenSupport[];
  counts: Record<MemberRole, number>;
  totalLengthM: number;
  /** Roof slope as a percentage, when the shape has one. */
  slopePercent: number | null;
  /** i18n keys for what the generator assumed. Travel onto the model's provenance. */
  assumptions: string[];
}

// ─── Validation ──────────────────────────────────────────────────────

export interface ParamProblem {
  field: keyof TrussParams;
  /** i18n key. */
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Everything wrong with a parameter set, all at once.
 *
 * All of them rather than the first, because a dialog that reports one problem per attempt
 * makes the user discover the constraints by trial. The generator refuses to run while
 * this is non-empty, so no caller can reach the geometry with impossible input.
 */
export function validateTrussParams(p: TrussParams): ParamProblem[] {
  const out: ParamProblem[] = [];
  const bad = (field: keyof TrussParams, key: string, params?: Record<string, string | number>) =>
    out.push({ field, key, params });

  if (!(p.spanM > 0)) bad('spanM', 'generator.problem.spanPositive');
  if (!Number.isInteger(p.panelsPerHalf) || p.panelsPerHalf < 1) {
    bad('panelsPerHalf', 'generator.problem.panelsAtLeastOne');
  }
  if (p.endDepthM < 0) bad('endDepthM', 'generator.problem.negative');
  if (p.riseM < 0) bad('riseM', 'generator.problem.negative');
  if (p.plateauM < 0) bad('plateauM', 'generator.problem.negative');

  if (p.kind === 'trapezoidal' && p.plateauM >= p.spanM) {
    bad('plateauM', 'generator.problem.plateauExceedsSpan');
  }
  if ((p.kind === 'parallelChord' || p.kind === 'pratt') && !(p.depthM > 0)) {
    bad('depthM', 'generator.problem.depthPositive');
  }
  // An arch with no rise is a straight line, and its radius is infinite. Refused rather
  // than degenerating into a parallel-chord truss under an arch label.
  if (p.kind === 'arch' && !(p.riseM > 0)) bad('riseM', 'generator.problem.archNeedsRise');
  if (p.kind === 'rolledPortal' && !(p.riseM > 0)) bad('riseM', 'generator.problem.portalNeedsRise');
  // A truss with no depth anywhere has coincident chords and no web to speak of.
  if (p.kind === 'trapezoidal' && p.endDepthM === 0 && p.riseM === 0) {
    bad('riseM', 'generator.problem.trussHasNoDepth');
  }
  return out;
}

// ─── Generation ──────────────────────────────────────────────────────

/**
 * Build the topology.
 *
 * Throws on invalid parameters rather than returning a degenerate truss: every caller has
 * `validateTrussParams` available, and a generator that quietly produces a two-node
 * "truss" from nonsense input is worse than one that stops.
 */
/**
 * Whether subdividing the diagonals means anything for these parameters.
 *
 * Two conditions, and both are about the geometry rather than about taste:
 *
 *   · the pattern must have diagonals arranged in panels to subdivide. All three do, but the
 *     check is written against the pattern rather than assumed so a future pattern with no
 *     diagonals cannot silently inherit the option;
 *   · there must be more than one panel per half. Subdividing the single panel of a
 *     two-panel truss puts a new panel point on top of the existing midspan one.
 *
 * Exported so the interface can hide the control instead of offering one that does nothing,
 * which is what the brief asks for by "sólo mostrarlo cuando sea aplicable".
 */
export function subdivisionApplies(p: Pick<TrussParams, 'webPattern' | 'panelsPerHalf'>): boolean {
  return WEB_PATTERNS.includes(p.webPattern) && p.panelsPerHalf > 1;
}

export function generateTruss(params: Partial<TrussParams> = {}): Topology {
  const p: TrussParams = { ...DEFAULT_TRUSS_PARAMS, ...params };
  const problems = validateTrussParams(p);
  if (problems.length > 0) {
    throw new Error(`generateTruss: invalid parameters — ${problems.map((x) => `${x.field}:${x.key}`).join(', ')}`);
  }

  const assumptions: string[] = [];
  if (p.kind === 'rolledPortal') return rolledPortal(p, assumptions);

  const panels = p.halfTruss ? p.panelsPerHalf : p.panelsPerHalf * 2;
  const stations: number[] = [];
  for (let i = 0; i <= panels; i++) stations.push((i * p.spanM) / panels);

  const { top, bottom } = chordProfiles(p, stations);

  // Nodes: bottom chord first, then top, so a reader of the emitted model finds the
  // load-bearing line first and the indices stay predictable across kinds.
  const nodes: GenNode[] = [];
  const bottomIdx: number[] = [];
  const topIdx: number[] = [];
  for (let i = 0; i < stations.length; i++) {
    bottomIdx.push(nodes.length);
    nodes.push({ i: nodes.length, x: stations[i], y: 0, z: bottom[i] });
  }
  for (let i = 0; i < stations.length; i++) {
    topIdx.push(nodes.length);
    nodes.push({ i: nodes.length, x: stations[i], y: 0, z: top[i] });
  }

  const members: GenMember[] = [];
  const chord = (a: number, b: number) => members.push({ a, b, role: 'chord', type: p.chordContinuity });
  const web = (a: number, b: number, role: MemberRole) => members.push({ a, b, role, type: p.webContinuity });

  for (let i = 0; i < panels; i++) {
    chord(bottomIdx[i], bottomIdx[i + 1]);
    chord(topIdx[i], topIdx[i + 1]);
  }

  /*
   * Posts at every station, including the two ends — except in a Warren, which has none.
   *
   * An end post of zero length would be a degenerate member, so it is skipped where the
   * chords meet, which is exactly the pointed-bearing case the depth check allows.
   *
   * The Warren exclusion is not cosmetic. Its diagonals alternate direction, so consecutive
   * ones already meet at each panel point and the triangle closes without a vertical; adding
   * posts would make it a different truss with different member actions.
   */
  if (p.webPattern !== 'warren') {
    for (let i = 0; i < stations.length; i++) {
      if (Math.abs(top[i] - bottom[i]) < 1e-9) continue;
      web(bottomIdx[i], topIdx[i], 'post');
    }
  } else {
    /*
     * The two end posts stay. Without them the end panel point carries a chord and a single
     * diagonal, the bearing has nothing transferring the reaction into the top chord, and the
     * solver finds a mechanism — measured, not assumed: the mechanism test below fails
     * without these two members.
     */
    for (const i of [0, stations.length - 1]) {
      if (Math.abs(top[i] - bottom[i]) < 1e-9) continue;
      web(bottomIdx[i], topIdx[i], 'post');
    }
  }

  // Diagonals, mirrored about midspan so the web is symmetric. Asymmetric bracing on a
  // symmetric truss under symmetric load is a modelling accident, not a design.
  for (let i = 0; i < panels; i++) {
    const leftOfCentre = p.halfTruss ? true : (i < panels / 2);
    if (p.webPattern === 'warren') {
      /*
       * Alternate on the panel index, not on the half. Mirroring a Warren about midspan the
       * way Pratt and Howe are mirrored would put two same-leaning diagonals side by side at
       * the centre, which breaks the alternation the pattern is named for. With an even panel
       * count — and `panelsPerHalf` guarantees one — plain alternation is already symmetric.
       */
      if (i % 2 === 0) web(bottomIdx[i], topIdx[i + 1], 'diagonal');
      else web(topIdx[i], bottomIdx[i + 1], 'diagonal');
      continue;
    }
    /*
     * A Pratt diagonal DESCENDS toward midspan — top at the outer station, bottom at the
     * inner one — which is what puts it in tension. See the statics in the `WEB_PATTERNS`
     * header. Howe is the mirror of that.
     */
    const descendsToCentre = (p.webPattern === 'pratt') === leftOfCentre;
    if (descendsToCentre) web(topIdx[i], bottomIdx[i + 1], 'diagonal');
    else web(bottomIdx[i], topIdx[i + 1], 'diagonal');
  }

  /*
   * Optional sub-division of the diagonals, for long panels.
   *
   * ── What it builds, and why each piece is needed ────────────────────
   *
   * Per panel it adds the set the brief asks for — a post and a diagonal — around two new
   * nodes:
   *
   *   · **M**, the midpoint of the main diagonal. The main diagonal is SPLIT there, so M is a
   *     real panel point and not a member crossing another member.
   *   · **B′**, on the bottom chord at mid-panel. The bottom chord is SPLIT there too.
   *   · a **post** B′→M, which is what halves the main diagonal's buckling length;
   *   · a **sub-diagonal** B′→(inner top panel point), which closes the second triangle.
   *
   * Splitting rather than crossing is the part that matters. A member laid across another
   * without a shared node transfers nothing at the crossing: the model would look subdivided
   * and behave exactly as it did before, which is the worst of the three possible outcomes.
   *
   * ── Why this cannot introduce a mechanism ──────────────────────────
   *
   * A pin-jointed node in 2-D is held by two non-collinear member directions. M has three
   * members — the two halves of the split diagonal, which are collinear and so count once,
   * plus the post. B′ likewise: two collinear chord halves, plus the post, plus the
   * sub-diagonal. Both clear the bar with a member to spare, and `generated-models-solve`
   * checks it on the solver rather than trusting the argument.
   */
  if (p.subdivideDiagonals && subdivisionApplies(p)) {
    // The diagonals are the last `panels` members pushed, in panel order.
    const firstDiagonal = members.length - panels;
    const added: GenMember[] = [];
    for (let i = 0; i < panels; i++) {
      const d = members[firstDiagonal + i];
      if (!d || d.role !== 'diagonal') continue;

      // Which end of the main diagonal is on the top chord. Either orientation occurs —
      // Pratt descends inward on the left half and rises on the right — so it is read off
      // the member rather than assumed from the pattern.
      const aIsTop = topIdx.includes(d.a);
      const topEnd = aIsTop ? d.a : d.b;
      const botEnd = aIsTop ? d.b : d.a;

      const mIdx = nodes.length;
      nodes.push({
        i: mIdx,
        x: (nodes[d.a].x + nodes[d.b].x) / 2,
        y: 0,
        z: (nodes[d.a].z + nodes[d.b].z) / 2,
      });

      // The bottom chord at mid-panel, interpolated between its two panel points rather
      // than assumed level: a pitched bottom chord is a shape this generator supports.
      const bx = (nodes[bottomIdx[i]].x + nodes[bottomIdx[i + 1]].x) / 2;
      const bz = (bottom[i] + bottom[i + 1]) / 2;
      const bIdx = nodes.length;
      nodes.push({ i: bIdx, x: bx, y: 0, z: bz });

      /*
       * Split the main diagonal in place — and the two halves are CONTINUOUS, not pinned,
       * whatever `webContinuity` says about the web as a whole.
       *
       * This is not a preference, it is what the member is. A sub-strut landing on a diagonal
       * does not turn that diagonal into two members meeting at a gusset; it is one piece of
       * steel with something attached partway along, exactly as `chordContinuity` already
       * treats a chord passing through its panel points.
       *
       * And modelling it the other way does not merely overstate a joint — it fails. M is a
       * node whose only members are the two collinear halves and the post. Pin all three and
       * nothing restrains M out of plane or against rotation about the diagonal's own axis,
       * and the 3-D solver returns "Singular stiffness matrix — structure is a mechanism".
       * That is measured: the first version of this block used `p.webContinuity` here and all
       * three web patterns failed to solve.
       */
      members[firstDiagonal + i] = { a: topEnd, b: mIdx, role: 'diagonal', type: 'frame' };
      added.push({ a: mIdx, b: botEnd, role: 'diagonal', type: 'frame' });

      const chordAt = members.findIndex(
        (m) => m.role === 'chord' && ((m.a === bottomIdx[i] && m.b === bottomIdx[i + 1]) || (m.a === bottomIdx[i + 1] && m.b === bottomIdx[i])),
      );
      if (chordAt >= 0) {
        // Same reasoning, and the same reason it cannot be `truss`: B' is a point on a
        // continuous bottom chord, and a pinned pair there leaves it free out of plane.
        const c = members[chordAt];
        members[chordAt] = { a: c.a, b: bIdx, role: 'chord', type: 'frame' };
        added.push({ a: bIdx, b: c.b, role: 'chord', type: 'frame' });
      }

      // The set: a post up to the diagonal's midpoint, and a sub-diagonal to the top panel
      // point on the other side of the panel from the one the main diagonal already reaches.
      added.push({ a: bIdx, b: mIdx, role: 'post', type: p.webContinuity });
      const otherTop = topEnd === topIdx[i] ? topIdx[i + 1] : topIdx[i];
      added.push({ a: bIdx, b: otherTop, role: 'diagonal', type: p.webContinuity });
    }
    members.push(...added);
    assumptions.push('generator.assume.subdividedDiagonals');
  }

  const supports: GenSupport[] = [
    { node: bottomIdx[0], type: 'pinned' },
    { node: bottomIdx[panels], type: 'rollerX' },
  ];

  assumptions.push(
    p.chordContinuity === 'frame'
      ? 'generator.assume.chordsContinuous'
      : 'generator.assume.chordsPinned',
    p.webContinuity === 'truss'
      ? 'generator.assume.webPinned'
      : 'generator.assume.webContinuous',
    'generator.assume.supportsSimple',
  );

  return finish(nodes, members, supports, slopeOf(p), assumptions);
}

/** Top and bottom chord elevations at each station, per kind. */
function chordProfiles(p: TrussParams, stations: number[]): { top: number[]; bottom: number[] } {
  const top: number[] = [];
  const bottom: number[] = [];

  for (const x of stations) {
    switch (p.kind) {
      case 'trapezoidal': {
        bottom.push(0);
        top.push(p.endDepthM + pitchRise(p, x));
        break;
      }
      case 'parallelChord': {
        const base = pitchRise(p, x);
        bottom.push(base);
        top.push(base + p.depthM);
        break;
      }
      case 'pratt': {
        bottom.push(0);
        top.push(p.depthM);
        break;
      }
      case 'arch': {
        const a = archRise(p, x);
        if (p.archCurve === 'parallelChord') {
          // Both chords bent to the same radius, so the depth stays constant along the
          // arc. `endDepthM` is that depth — for a curved truss the depth AT the springing
          // and the depth everywhere are the same number, so there is nothing else to ask.
          bottom.push(a);
          top.push(a + p.endDepthM);
        } else if (p.archCurve === 'concave') {
          // The chord that curves is the bottom one, hanging below a straight top.
          bottom.push(-a);
          top.push(p.endDepthM);
        } else {
          bottom.push(0);
          top.push(p.endDepthM + a);
        }
        break;
      }
      default:
        throw new Error(`chordProfiles: unhandled kind ${p.kind}`);
    }
  }
  return { top, bottom };
}

/**
 * Rise of the pitched top chord at x, above its height at the support.
 *
 * A half truss climbs across the whole span; a full one climbs to midspan and mirrors. The
 * plateau flattens the central length, which is what distinguishes a trapezoid from a
 * triangle — outside it the slope is steeper for the same rise, and that is correct: a
 * flat top over the ridge has to be paid for by the slope that reaches it.
 */
function pitchRise(p: TrussParams, x: number): number {
  if (p.riseM === 0) return 0;
  if (p.halfTruss) return (p.riseM * x) / p.spanM;

  const half = p.spanM / 2;
  // The plateau belongs to the trapezoid and to nothing else: a parallel-chord truss with
  // a flat central length is a different shape that nobody asked for, and honouring the
  // field there would make a stale value from a previous kind silently change the result.
  const plateau = p.kind === 'trapezoidal' ? p.plateauM : 0;
  const flatHalf = Math.min(plateau, p.spanM * 0.999) / 2;
  const slopeRun = half - flatHalf;
  const d = Math.abs(x - half);
  if (d <= flatHalf) return p.riseM;
  if (slopeRun <= 0) return p.riseM;
  return p.riseM * (1 - (d - flatHalf) / slopeRun);
}

/**
 * Height of a circular arc above its springing line at x.
 *
 * Circular rather than parabolic because that is what gets rolled: a bent chord comes off
 * a roller with a constant radius, and a parabola would be a shape nobody fabricates.
 * `R = (L²/4 + f²) / (2f)` is the exact radius through the three points (0,0), (L/2, f),
 * (L,0), so the arc passes through the springings and the crown by construction.
 */
function archRise(p: TrussParams, x: number): number {
  const L = p.halfTruss ? p.spanM * 2 : p.spanM;
  const f = p.riseM;
  const R = (L * L / 4 + f * f) / (2 * f);
  const dx = x - L / 2;
  const inside = R * R - dx * dx;
  return Math.sqrt(Math.max(0, inside)) - (R - f);
}

/** Two rafters and an apex. No web, so no roles beyond `rafter`. */
function rolledPortal(p: TrussParams, assumptions: string[]): Topology {
  const nodes: GenNode[] = p.halfTruss
    ? [
        { i: 0, x: 0, y: 0, z: 0 },
        { i: 1, x: p.spanM, y: 0, z: p.riseM },
      ]
    : [
        { i: 0, x: 0, y: 0, z: 0 },
        { i: 1, x: p.spanM / 2, y: 0, z: p.riseM },
        { i: 2, x: p.spanM, y: 0, z: 0 },
      ];
  const members: GenMember[] = nodes.slice(1).map((_, k) => ({
    a: k, b: k + 1, role: 'rafter' as MemberRole, type: 'frame' as const,
  }));
  const supports: GenSupport[] = [
    { node: 0, type: 'pinned' },
    { node: nodes.length - 1, type: 'rollerX' },
  ];
  assumptions.push('generator.assume.raftersContinuous', 'generator.assume.supportsSimple');
  return finish(nodes, members, supports, slopeOf(p), assumptions);
}

/**
 * Roof slope in percent, or null when the shape does not have one.
 *
 * Null for a level top chord, and null for an ARCH — a curved chord's slope varies
 * continuously from the springing to the crown, so a single percentage is not a property it
 * has. Reporting rise/half-span there would put a number beside a label the number does not
 * mean, which the preview would then display as fact.
 */
function slopeOf(p: TrussParams): number | null {
  if (p.kind === 'pratt' || p.kind === 'arch') return null;
  if (p.riseM === 0) return null;
  const run = p.halfTruss ? p.spanM : p.spanM / 2;
  if (run <= 0) return null;
  return (p.riseM / run) * 100;
}

/** Common tail: totals, tallies, and the assumption list, computed the one way. */
function finish(
  nodes: GenNode[],
  members: GenMember[],
  supports: GenSupport[],
  slopePercent: number | null,
  assumptions: string[],
): Topology {
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
    slopePercent,
    assumptions,
  };
}
