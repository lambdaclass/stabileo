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
 * Under gravity on a simply supported truss the two put the web into opposite actions:
 * Pratt diagonals rise towards midspan and go into tension, Howe diagonals fall towards
 * midspan and go into compression. That is a real engineering choice with a real
 * consequence for the sections, so it is offered rather than decided here.
 */
export const WEB_PATTERNS = ['pratt', 'howe'] as const;
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
  // A truss whose chords run through the panel points is how they are actually built and
  // how they are actually detailed; pin-ending every chord segment is a teaching
  // idealisation. The web is the opposite: gusseted diagonals are close enough to pinned
  // that modelling them as moment-carrying overstates the joints.
  chordContinuity: 'frame',
  webContinuity: 'truss',
});

/**
 * The most panels per half the generator will build. Two hundred panels is already a
 * truss of ~800 members — far past anything the shipped examples ask for — and past it
 * the panel spends minutes on a model nobody can solve on screen.
 */
export const MAX_PANELS_PER_HALF = 100;

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
  } else if (p.panelsPerHalf > MAX_PANELS_PER_HALF) {
    // A count, not a proportion: past this the tab spends minutes building a truss nobody
    // can solve on screen. Refused here rather than hung on.
    bad('panelsPerHalf', 'generator.problem.tooManyPanels');
  }
  // `!(x >= 0)`, not `x < 0`: NaN fails the first and passes the second, and a NaN depth
  // would sail through into the geometry.
  if (!(p.endDepthM >= 0)) bad('endDepthM', 'generator.problem.negative');
  if (!(p.riseM >= 0)) bad('riseM', 'generator.problem.negative');
  if (!(p.plateauM >= 0)) bad('plateauM', 'generator.problem.negative');

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

  // Posts at every station, including the two ends. An end post of zero length would be a
  // degenerate member, so it is skipped where the chords meet — which is exactly the
  // pointed-bearing case the depth check allows.
  for (let i = 0; i < stations.length; i++) {
    if (Math.abs(top[i] - bottom[i]) < 1e-9) continue;
    web(bottomIdx[i], topIdx[i], 'post');
  }

  // Diagonals, mirrored about midspan so the web is symmetric. Asymmetric bracing on a
  // symmetric truss under symmetric load is a modelling accident, not a design.
  for (let i = 0; i < panels; i++) {
    const leftOfCentre = p.halfTruss ? true : (i < panels / 2);
    const risesToCentre = (p.webPattern === 'pratt') === leftOfCentre;
    if (risesToCentre) web(bottomIdx[i], topIdx[i + 1], 'diagonal');
    else web(topIdx[i], bottomIdx[i + 1], 'diagonal');
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
  let run = p.halfTruss ? p.spanM : p.spanM / 2;
  // The plateau shortens the run the rise is climbed over — `pitchRise` spends it on
  // `half − flatHalf`, so the reported slope has to be measured over the same run or the
  // number and the roof disagree (and the purlins roll to the roof, not to the number).
  if (!p.halfTruss && p.kind === 'trapezoidal') {
    run -= Math.min(p.plateauM, p.spanM * 0.999) / 2;
  }
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
