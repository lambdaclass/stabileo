import { resultComponents } from '../axes/result-components';
import { axesStore } from '../axes/axes.svelte';
// Despiece / member free-body view (Basic 2D).
//
// Educational, solver-free overlay: each member is pulled away from its joints
// (animated). The SOLID separated member is drawn only between its shrunken ends;
// the gap between a shrunken end and its original node is shown as a faint dashed
// "remnant" (the normal solid member is suppressed while this view is active, so
// the remnant is the only thing in the gap).
//
// Three distinct vector concepts:
//   - member action: the internal force acting ON the member, anchored AT the
//     shrunken member end, drawn on the gap side so it never lies on the member;
//   - node action: the equal/opposite force acting ON the joint, anchored on the
//     node side of the remnant (a small fraction out from the node along the
//     member, so high-valence joints don't stack);
//   - support reaction: a one-sided EXTERNAL action at a support — drawn ONCE,
//     never paired/mirrored.
//
// Arrows are FIXED-SIZE symbols (scalable via vectorSize, not magnitude-scaled);
// the value lives in the label (scalable via labelSize). A small perpendicular
// stagger keeps the collinear member/node pair readable.
//
// Basis:
//   - 'local'  → member-local N (axial), V (shear), M (moment).
//   - 'global' → end force decomposed into world Fx, Fz (+ M).
//
// Sign convention (local): N along the member axis (sign baked into direction);
// V and M in the DRAWN axes, as the results store publishes them (see
// transverse-sign-2d.ts). Node action is the exact opposite.
//
// The engine's own end-action convention (solver axes, ŷ = x̂ turned 90° CCW):
// the joint acts on the member with −N·x̂ + V·ŷ and a CCW moment +M at I, and
// with +N·x̂ − V·ŷ and a CCW moment −M at J. A fixed-fixed beam under gravity
// reports M = +wL²/12 at both ends: the left wall turns the member CCW, the
// right one CW. The published V and M of a member drawn right to left, or of
// a column drawn upward, are those of the solver times −1 (transverseSign), so
// both are composed here with the DRAWN transverse axis zs·ŷ and the drawn
// rotation sense zs·CCW. That is what makes every isolated member and every
// joint of the view balance, whichever way the member was drawn.

import { computeLoadDirection } from './draw-loads';
import { twoD } from '../axes/display';
import { TWO_D_NODAL_LOAD_LABELS, TWO_D_REACTION_LABELS } from '../geometry/coordinate-system';
import { transverseSign } from '../engine/transverse-sign-2d';
import { pointResultants } from '../engine/member-loads';

export interface DespieceNode { x: number; y: number; }

export interface DespieceElementForces {
  elementId: number;
  nStart: number; nEnd: number;
  vStart: number; vEnd: number;
  mStart: number; mEnd: number;
}

export interface DespieceReaction { rx: number; rz: number; my: number; }

export interface DespieceElement { id: number; nodeI: number; nodeJ: number; }

export type DespieceVectorMode = 'all' | 'members' | 'nodes';
export type DespieceBasis = 'local' | 'global';

/** Member shrink per end at full separation (fraction of member length). */
export const DESPIECE_MAX_GAP_FRAC = 0.28;
/** Node action anchor: this fraction out from the node toward the member end. */
const NODE_ANCHOR_FRAC = 0.18;
/** Dotted ghost remnant starts this fraction out from the node (so it begins
 *  AFTER the node-side vector at NODE_ANCHOR_FRAC, not under it) and runs to the
 *  shrunken member end. */
const REMNANT_START_FRAC = 0.35;

// ─── Pure geometry/force helpers (unit-tested) ──────────────────────

/**
 * Unit direction i→j, the in-plane perpendicular (rotated +90° CCW — the
 * solver's transverse axis) and `zs`, the sign that turns it into the DRAWN
 * transverse axis (transverseSign: −1 for a member drawn right to left or a
 * column drawn upward). The drawn z is (zs·px, zs·py).
 */
export function memberAxes(ni: DespieceNode, nj: DespieceNode): { ux: number; uy: number; px: number; py: number; zs: 1 | -1; len: number } {
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { ux: 1, uy: 0, px: 0, py: 1, zs: 1, len: 0 };
  const ux = dx / len, uy = dy / len;
  return { ux, uy, px: -uy, py: ux, zs: transverseSign(dx, dy), len };
}

type Axes = { ux: number; uy: number; px: number; py: number; zs: 1 | -1 };

function memberEnd(ax: Axes, forces: DespieceElementForces, end: 'I' | 'J', side: 'member' | 'node') {
  const [n, v, m, towardJ] = end === 'I'
    ? [forces.nStart, forces.vStart, forces.mStart, 1]
    : [forces.nEnd, forces.vEnd, forces.mEnd, -1];
  const axialFace = side === 'member' ? towardJ : -towardJ;
  const transverseFace = ax.zs * axialFace;
  const axial = -n * axialFace;
  const shear = v * transverseFace;
  return {
    n, v, m, axialFace, transverseFace,
    action: {
      fx: ax.ux * axial + ax.px * shear,
      fz: ax.uy * axial + ax.py * shear,
      moment: m * transverseFace,
    },
  };
}

type MemberEnd = ReturnType<typeof memberEnd>;

/**
 * Shrink a member toward its own midpoint by fraction `g` (0..~0.28) at each end,
 * opening a gap at every joint. `sep` (0..1) animates the pull-apart.
 */
export function shrinkMember(
  ni: DespieceNode, nj: DespieceNode, sep: number, maxGapFrac = DESPIECE_MAX_GAP_FRAC,
): { i: DespieceNode; j: DespieceNode } {
  const g = Math.max(0, Math.min(1, sep)) * maxGapFrac;
  const mx = (ni.x + nj.x) / 2, my = (ni.y + nj.y) / 2;
  return {
    i: { x: ni.x + (mx - ni.x) * g, y: ni.y + (my - ni.y) * g },
    j: { x: nj.x + (mx - nj.x) * g, y: nj.y + (my - nj.y) * g },
  };
}

/** Largest |N|,|V| and |M| across all element ends — used to scale arrows/arcs. */
export function despieceScales(forces: Iterable<DespieceElementForces>): { maxF: number; maxM: number } {
  let maxF = 1e-9, maxM = 1e-9;
  for (const f of forces) {
    maxF = Math.max(maxF, Math.abs(f.nStart), Math.abs(f.nEnd), Math.abs(f.vStart), Math.abs(f.vEnd));
    maxM = Math.max(maxM, Math.abs(f.mStart), Math.abs(f.mEnd));
  }
  return { maxF, maxM };
}

// ─── Vector model (pure, unit-tested) ───────────────────────────────

const COL = { axial: '#ff7070', shear: '#7fd4cc', moment: '#ffd166', reaction: '#00e676', member: '#9aa7c7', remnant: '#5a6478' };
const ARC_A1 = Math.PI * 0.25;

export interface DespieceVector {
  side: 'member' | 'node' | 'reaction';
  glyph: 'force' | 'moment';
  origin: DespieceNode;          // world anchor (the cut/end the vector references)
  dirx?: number; diry?: number;  // world unit force direction (force only)
  outx?: number; outy?: number;  // world unit "outward" (toward the gap) — keeps the arrow off the piece
  perpSign?: number;             // +1 member / −1 node / 0 reaction → small perpendicular stagger
  ccw?: boolean;                 // rotation sense (moment only)
  value: number;
  labelText: string;             // '' = no label
  color: string;
  elementId?: number;
  end?: 'I' | 'J';
  nodeId?: number;
  component?: string;            // 'N' | 'V' | 'M' | 'Fx' | 'Fz' | 'Rx' | 'Rz' | 'My'
}

/** Dashed remnant from an original node to its shrunken member end. */
export interface DespieceSegment { from: DespieceNode; to: DespieceNode; elementId: number; end: 'I' | 'J'; nodeId: number; }

interface ComputeArgs {
  elements: Iterable<DespieceElement>;
  getNode: (id: number) => DespieceNode | undefined;
  getElementForces: (id: number) => DespieceElementForces | undefined;
  reactions: Map<number, DespieceReaction>;
  sep: number;
  vectorMode: DespieceVectorMode;
  basis: DespieceBasis;
  showReactions: boolean;
  resultant?: boolean;
  /** A value for a label; told whether it is a force or a moment so it can carry its unit. */
  fmt: (v: number, q?: 'force' | 'moment') => string;
}

interface ForceComp { label: string; key: string; value: number; dirx: number; diry: number; }

function forceComponents(ax: Axes, end: MemberEnd, basis: DespieceBasis): ForceComp[] {
  if (basis === 'global') {
    const { fx, fz } = end.action;
    return [
      { label: TWO_D_NODAL_LOAD_LABELS.horizontal, key: 'Fx', value: twoD.x(fx), dirx: Math.sign(fx) || 1, diry: 0 },
      { label: TWO_D_NODAL_LOAD_LABELS.vertical, key: 'Fz', value: twoD.z(fz), dirx: 0, diry: Math.sign(fz) || 1 },
    ];
  }
  const { n, v, axialFace, transverseFace } = end;
  const axial = -Math.sign(n) * axialFace;
  const shear = Math.sign(v) * transverseFace;
  return [
    { label: 'N', key: 'N', value: n, dirx: ax.ux * axial, diry: ax.uy * axial },
    { label: 'V', key: 'V', value: v, dirx: ax.px * shear, diry: ax.py * shear },
  ];
}

function momentComponent(end: MemberEnd, basis: DespieceBasis): { label: string; value: number } {
  if (basis === 'local') return { label: 'M', value: end.m };
  return {
    label: __PUBLIC_FEATURES__.globalAxes ? TWO_D_NODAL_LOAD_LABELS.moment : 'M',
    value: twoD.rot(end.action.moment),
  };
}

/**
 * Compute the despiece vectors in WORLD space with rich metadata. Pure/
 * deterministic → unit-testable. Member actions anchor at the shrunken member
 * end; node actions anchor near the node (opposite direction); support reactions
 * are one-sided (never mirrored).
 */
export function computeDespieceVectors(args: ComputeArgs): DespieceVector[] {
  const { elements, getNode, getElementForces, reactions, sep, vectorMode, basis, showReactions, resultant, fmt } = args;
  const out: DespieceVector[] = [];
  if (sep <= 0.05) return out;
  const sides = vectorMode === 'all' ? ['member', 'node'] as const
    : [vectorMode === 'nodes' ? 'node' : 'member'] as const;

  for (const el of elements) {
    const ni = getNode(el.nodeI), nj = getNode(el.nodeJ);
    const ef = getElementForces(el.id);
    if (!ni || !nj || !ef) continue;
    const ax = memberAxes(ni, nj);
    if (ax.len < 1e-9) continue;
    const { i: aI, j: aJ } = shrinkMember(ni, nj, sep);

    const ends = [
      { end: 'I', nodeId: el.nodeI, node: ni, memberEndPoint: aI },
      { end: 'J', nodeId: el.nodeJ, node: nj, memberEndPoint: aJ },
    ] as const;
    for (const { end, nodeId, node, memberEndPoint } of ends) {
      const glen = Math.hypot(memberEndPoint.x - node.x, memberEndPoint.y - node.y) || 1;
      const ugx = (memberEndPoint.x - node.x) / glen, ugy = (memberEndPoint.y - node.y) / glen;
      const nodeAnchor = { x: node.x + ugx * glen * NODE_ANCHOR_FRAC, y: node.y + ugy * glen * NODE_ANCHOR_FRAC };

      for (const side of sides) {
        const action = memberEnd(ax, ef, end, side);
        const onMember = side === 'member';
        const anchor = {
          side, elementId: el.id, end, nodeId,
          origin: onMember ? memberEndPoint : nodeAnchor,
        };
        const label = onMember || vectorMode === 'nodes';
        const { fx, fz, moment } = action.action;
        const mag = resultant ? Math.hypot(fx, fz) : 0;
        const comps: ForceComp[] = resultant
          ? mag > 1e-6 ? [{ label: 'F', key: 'F', value: mag, dirx: fx / mag, diry: fz / mag }] : []
          : forceComponents(ax, action, basis);

        for (const c of comps) {
          if (Math.abs(c.value) <= 1e-6) continue;
          out.push({
            ...anchor, glyph: 'force', dirx: c.dirx, diry: c.diry,
            outx: onMember ? -ax.ux * action.axialFace : -ugx,
            outy: onMember ? -ax.uy * action.axialFace : -ugy,
            perpSign: onMember ? 1 : -1,
            value: c.value, labelText: label ? `${c.label} ${fmt(c.value, 'force')}` : '',
            color: c.label === 'V' ? COL.shear : COL.axial, component: c.key,
          });
        }

        if (Math.abs(moment) > 1e-6) {
          const { label: name, value } = momentComponent(action, basis);
          out.push({
            ...anchor, glyph: 'moment', ccw: moment > 0, value,
            labelText: label ? `${name} ${fmt(value, 'moment')}` : '',
            color: COL.moment, component: 'M',
          });
        }
      }
    }
  }

  // Support reactions: one-sided EXTERNAL actions — drawn once, never mirrored.
  if (showReactions) {
    for (const [nodeId, r] of reactions) {
      const node = getNode(nodeId);
      if (!node) continue;
      if (Math.abs(r.rx) > 1e-6) out.push({ side: 'reaction', glyph: 'force', origin: node, dirx: Math.sign(r.rx), diry: 0, perpSign: 0, value: r.rx, labelText: `${TWO_D_REACTION_LABELS.horizontal} ${fmt(resultComponents(axesStore.frame, undefined).plane(r.rx, 'x'), 'force')}`, color: COL.reaction, nodeId, component: 'Rx' });
      if (Math.abs(r.rz) > 1e-6) out.push({ side: 'reaction', glyph: 'force', origin: node, dirx: 0, diry: Math.sign(r.rz), perpSign: 0, value: r.rz, labelText: `${TWO_D_REACTION_LABELS.vertical} ${fmt(resultComponents(axesStore.frame, undefined).plane(r.rz, 'z'), 'force')}`, color: COL.reaction, nodeId, component: 'Rz' });
      if (Math.abs(r.my) > 1e-6) out.push({ side: 'reaction', glyph: 'moment', origin: node, ccw: r.my > 0, value: r.my, labelText: `${TWO_D_REACTION_LABELS.moment} ${fmt(resultComponents(axesStore.frame, undefined).plane(r.my, 'rot'), 'moment')}`, color: COL.reaction, nodeId, component: 'My' });
    }
  }
  return out;
}

/** Dashed remnant segments — start a bit out from the node (REMNANT_START_FRAC,
 *  past the node-side vector) and run to the shrunken member end, one per end. */
export function computeDespieceSegments(args: Pick<ComputeArgs, 'elements' | 'getNode' | 'sep'>): DespieceSegment[] {
  const { elements, getNode, sep } = args;
  const out: DespieceSegment[] = [];
  if (sep <= 0.05) return out;
  const startAt = (node: DespieceNode, end: DespieceNode): DespieceNode =>
    ({ x: node.x + (end.x - node.x) * REMNANT_START_FRAC, y: node.y + (end.y - node.y) * REMNANT_START_FRAC });
  for (const el of elements) {
    const ni = getNode(el.nodeI), nj = getNode(el.nodeJ);
    if (!ni || !nj) continue;
    const { i: aI, j: aJ } = shrinkMember(ni, nj, sep);
    out.push({ from: startAt(ni, aI), to: aI, elementId: el.id, end: 'I', nodeId: el.nodeI });
    out.push({ from: startAt(nj, aJ), to: aJ, elementId: el.id, end: 'J', nodeId: el.nodeJ });
  }
  return out;
}

// ─── Loads in free-body mode (external actions, drawn once) ─────────

/** Distinct load color — separate from axial/shear/moment/reaction. */
export const DESPIECE_LOAD_COLOR = '#d9a441';

export interface DespieceElementSpan { aI: DespieceNode; aJ: DespieceNode; lenOrig: number; lenShrunk: number; }

/** Shrunken endpoints + original/shrunk lengths for a member at separation `sep`. */
export function despieceElementSpan(ni: DespieceNode, nj: DespieceNode, sep: number): DespieceElementSpan {
  const { i: aI, j: aJ } = shrinkMember(ni, nj, sep);
  return { aI, aJ, lenOrig: Math.hypot(nj.x - ni.x, nj.y - ni.y), lenShrunk: Math.hypot(aJ.x - aI.x, aJ.y - aI.y) };
}

/**
 * Remap a member-load span [a,b] (metres from node I on the ORIGINAL member) onto
 * the shrunken visible segment, so the load glyph runs along the shortened member
 * and never extends past it. Proportional: full-span (0..L) → whole shrunk segment;
 * a partial range maps to the same fraction of the shrunk segment.
 */
export function remapLoadSpanToShrunk(a: number, b: number, lenOrig: number, lenShrunk: number): { a: number; b: number } {
  if (lenOrig < 1e-9) return { a: 0, b: lenShrunk };
  const s = lenShrunk / lenOrig;
  return { a: a * s, b: b * s };
}

/**
 * Equivalent resultant of a (possibly trapezoidal, possibly partial) distributed
 * member load with intensities qI at position `a` and qJ at position `b` (metres
 * from node I). Returns the signed total magnitude and the centroid position
 * (metres from node I, always inside [a,b]). Trapezoidal centroid:
 *   x̄ = a + (L/3)·(qI + 2·qJ)/(qI + qJ),  L = b − a.
 * For a near-zero net load (qI ≈ −qJ) the centroid falls back to the span middle.
 */
export function distributedResultant(qI: number, qJ: number, a: number, b: number): { magnitude: number; centroid: number } {
  const L = b - a;
  const magnitude = (qI + qJ) / 2 * L;
  const sum = qI + qJ;
  let centroid = Math.abs(sum) < 1e-9 ? a + L / 2 : a + (L / 3) * (qI + 2 * qJ) / sum;
  // A sign-reversing trapezoid (qI, qJ opposite signs → small-but-not-tiny sum)
  // can place the centroid far outside [a, b]; clamp so the resultant arrow
  // stays on the member span.
  centroid = Math.min(b, Math.max(a, centroid));
  return { magnitude, centroid };
}

/**
 * Resultant of an APPLIED distributed member load as a world-space force VECTOR
 * (the direction the load physically pushes — same sense `drawDistributedLoads`
 * renders, NOT an equilibrium/end-action arrow), plus magnitude and centroid.
 *
 * `cosT/sinT` are the member's i→j unit direction. The load force direction is
 * `sign(magnitude) · forceDir`, where forceDir comes from the load's own
 * angle/isGlobal (so a downward load → downward vector). Uses ONLY the load and
 * geometry — never solver `ElementForces`.
 */
export function distributedResultantVector(
  qI: number, qJ: number, a: number, b: number,
  angle: number, isGlobal: boolean, cosT: number, sinT: number,
): { wx: number; wy: number; magnitude: number; centroid: number } {
  const { magnitude, centroid } = distributedResultant(qI, qJ, a, b);
  const fdir = computeLoadDirection(angle ?? 0, isGlobal ?? false, cosT, sinT);
  const s = magnitude >= 0 ? 1 : -1;
  return { wx: s * fdir.dx, wy: s * fdir.dy, magnitude, centroid };
}

/**
 * The point forces a distributed member load amounts to, for the 'resultant' load mode: one at the
 * centroid, or, for a trapezoid that changes sign, one per triangle (`pointResultants`), so the
 * drawn forces keep the load's moment. A single force at a clamped centroid moved it: −10 → +6
 * kN/m on 6 m (12 kN·m about I) was drawn as 12 kN at I, and −10 → +10 (a pure couple of 60)
 * as nothing. Each force pushes the way the load does (`distributedResultantVector`).
 */
export function distributedResultantForces(
  qI: number, qJ: number, a: number, b: number,
  angle: number, isGlobal: boolean, cosT: number, sinT: number,
): Array<{ wx: number; wy: number; magnitude: number; at: number }> {
  const fdir = computeLoadDirection(angle ?? 0, isGlobal ?? false, cosT, sinT);
  return pointResultants(qI, qJ, a, b).filter((r) => Math.abs(r.mag) > 1e-9).map((r) => {
    const s = r.mag >= 0 ? 1 : -1;
    return { wx: s * fdir.dx, wy: s * fdir.dy, magnitude: r.mag, at: r.at };
  });
}

// ─── Click inspection (pure aggregation) ────────────────────────────

export interface DespieceEndAction {
  elementId: number; end: 'I' | 'J'; nodeId: number;
  action: MemberEnd['action'];
  components: Array<{ label: string; value: number }>;
}

type InspectArgs = Pick<ComputeArgs, 'elements' | 'getNode' | 'getElementForces' | 'basis'>;

function endActionFor(args: InspectArgs, el: DespieceElement, end: 'I' | 'J'): DespieceEndAction | null {
  const ni = args.getNode(el.nodeI), nj = args.getNode(el.nodeJ);
  const ef = args.getElementForces(el.id);
  if (!ni || !nj || !ef) return null;
  const ax = memberAxes(ni, nj);
  const member = memberEnd(ax, ef, end, 'member');
  const forces = forceComponents(ax, member, args.basis).map(({ label, value }) => ({ label, value }));
  return {
    elementId: el.id, end, nodeId: end === 'I' ? el.nodeI : el.nodeJ,
    action: member.action,
    components: [...forces, momentComponent(member, args.basis)],
  };
}

/** Both end actions (I and J) of one member. */
export function inspectMember(args: InspectArgs, elementId: number): { elementId: number; ends: DespieceEndAction[] } | null {
  let target: DespieceElement | undefined;
  for (const el of args.elements) if (el.id === elementId) { target = el; break; }
  if (!target) return null;
  const ends = (['I', 'J'] as const).map(e => endActionFor(args, target!, e)).filter((x): x is DespieceEndAction => !!x);
  return { elementId, ends };
}

/** Every connected member-end action converging at a node. */
export function inspectNode(args: InspectArgs, nodeId: number): { nodeId: number; actions: DespieceEndAction[] } {
  const actions: DespieceEndAction[] = [];
  for (const el of args.elements) {
    if (el.nodeI === nodeId) { const a = endActionFor(args, el, 'I'); if (a) actions.push(a); }
    if (el.nodeJ === nodeId) { const a = endActionFor(args, el, 'J'); if (a) actions.push(a); }
  }
  return { nodeId, actions };
}

/**
 * Arrowhead geometry for a moment arc tip (pure, testable). Tip on the circle +
 * two barb endpoints forming a V tangent to the arc. Screen space (y-down).
 */
export function momentArrowhead(cx: number, cy: number, r: number, ccw: boolean): { tip: DespieceNode; barbs: [DespieceNode, DespieceNode] } {
  const tipA = ARC_A1;
  const tip = { x: cx + r * Math.cos(tipA), y: cy + r * Math.sin(tipA) };
  const tx = (ccw ? -1 : 1) * -Math.sin(tipA);
  const ty = (ccw ? -1 : 1) * Math.cos(tipA);
  const ta = Math.atan2(ty, tx);
  const h = 7;
  return {
    tip,
    barbs: [
      { x: tip.x - h * Math.cos(ta - 0.5), y: tip.y - h * Math.sin(ta - 0.5) },
      { x: tip.x - h * Math.cos(ta + 0.5), y: tip.y - h * Math.sin(ta + 0.5) },
    ],
  };
}

// The drawing itself is `free-body.ts`, shared with the 3D view and the exported figures; this
// module computes what acts where.
