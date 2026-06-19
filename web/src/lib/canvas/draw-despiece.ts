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
// V signed by the shear; M CCW for +M. Node action is the exact opposite.

import { computeLoadDirection } from './draw-loads';

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
/** Small perpendicular stagger (screen px) so the member/node pair don't overlap. */
const PERP_PX = 7;

// ─── Pure geometry/force helpers (unit-tested) ──────────────────────

/** Unit direction i→j and the in-plane perpendicular (rotated +90° CCW). */
export function memberAxes(ni: DespieceNode, nj: DespieceNode): { ux: number; uy: number; px: number; py: number; len: number } {
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { ux: 1, uy: 0, px: 0, py: 1, len: 0 };
  const ux = dx / len, uy = dy / len;
  return { ux, uy, px: -uy, py: ux, len };
}

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

const COL = { axial: '#ff7070', shear: '#4ecdc4', moment: '#ffd166', reaction: '#00e676', member: '#9aa7c7', remnant: '#5a6478' };
const AXIAL_PX = 34, SHEAR_PX = 34, ARC_R = 16;
const ARC_A0 = -Math.PI * 0.75, ARC_A1 = Math.PI * 0.25;

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
  fmt: (v: number) => string;
}

interface ForceComp { label: string; value: number; dirx: number; diry: number; }

/** End force components in the requested basis (world-space direction, sign baked in). */
function forceComponents(
  ax: { ux: number; uy: number; px: number; py: number }, towardJ: 1 | -1, n: number, v: number, basis: DespieceBasis,
): ForceComp[] {
  // FREE-BODY END-FACE CONVENTION. ElementForces are internal DIAGRAM values
  // (section stress resultants): for a member I→J, axial is the same sign at both
  // ends, but shear is opposite-signed at the two ends (e.g. SS beam vStart=+wL/2,
  // vEnd=−wL/2). The member-side end ACTION is the diagram-assembled local vector
  // multiplied by `towardJ` (+1 at I, −1 at J), which encodes the opposite outward
  // face normals at the two cuts. With that single factor:
  //   • axial (same-sign values)  → points OUT of both ends for tension;
  //   • shear (opposite-sign vals) → points the SAME physical way at both ends
  //     (e.g. both up under gravity ⇒ the separated member is in equilibrium).
  // Per the requested convention: at I, Qz>0 → +local z; at J, Qz>0 → −local z.
  if (basis === 'global') {
    const fx = (-ax.ux * n + ax.px * v) * towardJ;
    const fz = (-ax.uy * n + ax.py * v) * towardJ;
    return [
      { label: 'Fx', value: fx, dirx: Math.sign(fx) || 1, diry: 0 },
      { label: 'Fz', value: fz, dirx: 0, diry: Math.sign(fz) || 1 },
    ];
  }
  return [
    { label: 'N', value: n, dirx: -ax.ux * Math.sign(n) * towardJ, diry: -ax.uy * Math.sign(n) * towardJ },
    { label: 'V', value: v, dirx: ax.px * Math.sign(v) * towardJ, diry: ax.py * Math.sign(v) * towardJ },
  ];
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
  const wantMember = vectorMode !== 'nodes';
  const wantNode = vectorMode !== 'members';
  const labelNode = vectorMode === 'nodes';

  for (const el of elements) {
    const ni = getNode(el.nodeI), nj = getNode(el.nodeJ);
    const ef = getElementForces(el.id);
    if (!ni || !nj || !ef) continue;
    const ax = memberAxes(ni, nj);
    if (ax.len < 1e-9) continue;
    const { i: aI, j: aJ } = shrinkMember(ni, nj, sep);

    const ends: Array<['I' | 'J', number, DespieceNode, DespieceNode, 1 | -1, number, number, number]> = [
      ['I', el.nodeI, ni, aI, 1, ef.nStart, ef.vStart, ef.mStart],
      ['J', el.nodeJ, nj, aJ, -1, ef.nEnd, ef.vEnd, ef.mEnd],
    ];
    for (const [end, nodeId, node, memberEnd, towardJ, n, v, m] of ends) {
      const glen = Math.hypot(memberEnd.x - node.x, memberEnd.y - node.y) || 1;
      const ugx = (memberEnd.x - node.x) / glen, ugy = (memberEnd.y - node.y) / glen; // node → member end
      const nodeAnchor = { x: node.x + ugx * glen * NODE_ANCHOR_FRAC, y: node.y + ugy * glen * NODE_ANCHOR_FRAC };
      // Outward (toward the gap) for each side: member-end → node, and node → away from member.
      const mOutx = -ax.ux * towardJ, mOuty = -ax.uy * towardJ;
      const nOutx = -ugx, nOuty = -ugy;

      // Resultant mode: ONE composed force vector (N+V) instead of separate
      // components; the moment stays a single arc → the end shows 2 glyphs.
      const comps: ForceComp[] = resultant
        ? (() => {
            const fx = (-ax.ux * n + ax.px * v) * towardJ;
            const fy = (-ax.uy * n + ax.py * v) * towardJ;
            const mag = Math.hypot(fx, fy);
            return mag > 1e-6 ? [{ label: 'F', value: mag, dirx: fx / mag, diry: fy / mag }] : [];
          })()
        : forceComponents(ax, towardJ, n, v, basis);
      for (const c of comps) {
        if (Math.abs(c.value) <= 1e-6) continue;
        const color = c.label === 'V' ? COL.shear : COL.axial;
        if (wantMember) out.push({ side: 'member', glyph: 'force', origin: memberEnd, dirx: c.dirx, diry: c.diry, outx: mOutx, outy: mOuty, perpSign: 1, value: c.value, labelText: `${c.label} ${fmt(c.value)}`, color, elementId: el.id, end, nodeId, component: c.label });
        if (wantNode) out.push({ side: 'node', glyph: 'force', origin: nodeAnchor, dirx: -c.dirx, diry: -c.diry, outx: nOutx, outy: nOuty, perpSign: -1, value: c.value, labelText: labelNode ? `${c.label} ${fmt(c.value)}` : '', color, elementId: el.id, end, nodeId, component: c.label });
      }

      if (Math.abs(m) > 1e-6) {
        // Moment follows the same per-end face convention: at I (towardJ=+1) a
        // positive end moment reads clockwise; at J (towardJ=−1) it reads
        // counter-clockwise (same physical bending ⇒ opposite glyph sense at the
        // two faces, so the separated member balances). ccw = (m·towardJ) < 0.
        // Node-side is the equal/opposite action on the joint.
        const memberCcw = m * towardJ < 0;
        if (wantMember) out.push({ side: 'member', glyph: 'moment', origin: memberEnd, ccw: memberCcw, value: m, labelText: `M ${fmt(m)}`, color: COL.moment, elementId: el.id, end, nodeId, component: 'M' });
        if (wantNode) out.push({ side: 'node', glyph: 'moment', origin: nodeAnchor, ccw: !memberCcw, value: m, labelText: labelNode ? `M ${fmt(m)}` : '', color: COL.moment, elementId: el.id, end, nodeId, component: 'M' });
      }
    }
  }

  // Support reactions: one-sided EXTERNAL actions — drawn once, never mirrored.
  if (showReactions) {
    for (const [nodeId, r] of reactions) {
      const node = getNode(nodeId);
      if (!node) continue;
      if (Math.abs(r.rx) > 1e-6) out.push({ side: 'reaction', glyph: 'force', origin: node, dirx: Math.sign(r.rx), diry: 0, perpSign: 0, value: r.rx, labelText: `Rx ${fmt(r.rx)}`, color: COL.reaction, nodeId, component: 'Rx' });
      if (Math.abs(r.rz) > 1e-6) out.push({ side: 'reaction', glyph: 'force', origin: node, dirx: 0, diry: Math.sign(r.rz), perpSign: 0, value: r.rz, labelText: `Rz ${fmt(r.rz)}`, color: COL.reaction, nodeId, component: 'Rz' });
      if (Math.abs(r.my) > 1e-6) out.push({ side: 'reaction', glyph: 'moment', origin: node, ccw: r.my > 0, value: r.my, labelText: `My ${fmt(r.my)}`, color: COL.reaction, nodeId, component: 'My' });
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
export const DESPIECE_LOAD_COLOR = '#ffa726';

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

// ─── Click inspection (pure aggregation) ────────────────────────────

export interface DespieceEndAction {
  elementId: number; end: 'I' | 'J'; nodeId: number;
  components: Array<{ label: string; value: number }>;
}

function endComponents(
  ax: { ux: number; uy: number; px: number; py: number }, towardJ: 1 | -1, n: number, v: number, m: number, basis: DespieceBasis,
): Array<{ label: string; value: number }> {
  if (basis === 'global') {
    // Use the SAME decomposition as the drawn arrows (forceComponents): the whole
    // local end-action vector (−N along axis + V along the perp) is multiplied by
    // towardJ. The previous form (+ax.ux*n, towardJ on n only) flipped the axial
    // sign and dropped towardJ from the shear, so the inspected value contradicted
    // the rendered arrow at both ends.
    const fx = (-ax.ux * n + ax.px * v) * towardJ;
    const fz = (-ax.uy * n + ax.py * v) * towardJ;
    return [{ label: 'Fx', value: fx }, { label: 'Fz', value: fz }, { label: 'M', value: m }];
  }
  return [{ label: 'N', value: n }, { label: 'V', value: v }, { label: 'M', value: m }];
}

type InspectArgs = Pick<ComputeArgs, 'elements' | 'getNode' | 'getElementForces' | 'basis'>;

function endActionFor(args: InspectArgs, el: DespieceElement, end: 'I' | 'J'): DespieceEndAction | null {
  const ni = args.getNode(el.nodeI), nj = args.getNode(el.nodeJ);
  const ef = args.getElementForces(el.id);
  if (!ni || !nj || !ef) return null;
  const ax = memberAxes(ni, nj);
  const [towardJ, n, v, m, nodeId]: [1 | -1, number, number, number, number] =
    end === 'I' ? [1, ef.nStart, ef.vStart, ef.mStart, el.nodeI] : [-1, ef.nEnd, ef.vEnd, ef.mEnd, el.nodeJ];
  return { elementId: el.id, end, nodeId, components: endComponents(ax, towardJ, n, v, m, args.basis) };
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

// ─── Drawing ────────────────────────────────────────────────────────

export interface DespieceCtx {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  elements: Iterable<DespieceElement>;
  getNode: (id: number) => DespieceNode | undefined;
  getElementForces: (id: number) => DespieceElementForces | undefined;
  reactions: Map<number, DespieceReaction>;
  sep: number;
  fmt: (v: number) => string;
  vectorMode?: DespieceVectorMode;
  basis?: DespieceBasis;
  showReactions?: boolean;
  resultant?: boolean;
  vectorSize?: number;
  labelSize?: number;
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, headScale = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return;
  const ux = dx / d, uy = dy / d, h = 6 * headScale;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const a = Math.atan2(uy, ux);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4));
  ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, color: string, fontPx = 10) {
  ctx.font = `bold ${fontPx}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,24,0.85)'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

/** Moment arc with a tangent arrowhead at the tip (no circular dot endpoint). */
function momentArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, ccw: boolean, color: string, r = ARC_R) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(cx, cy, r, ARC_A0, ARC_A1, ccw); ctx.stroke();
  const { tip, barbs } = momentArrowhead(cx, cy, r, ccw);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y); ctx.lineTo(barbs[0].x, barbs[0].y);
  ctx.moveTo(tip.x, tip.y); ctx.lineTo(barbs[1].x, barbs[1].y);
  ctx.stroke();
}

/** Render the full despiece view. */
export function drawDespiece(d: DespieceCtx): void {
  const vectorMode = d.vectorMode ?? 'all';
  const basis = d.basis ?? 'local';
  const showReactions = d.showReactions ?? true;
  const resultant = d.resultant ?? false;
  const vSize = Math.max(0.3, d.vectorSize ?? 1);
  const lSize = Math.max(0.3, d.labelSize ?? 1);
  const axialLen = AXIAL_PX * vSize, shearLen = SHEAR_PX * vSize, arcR = ARC_R * vSize;
  const fontPx = 10 * lSize;

  // Faint dashed remnants (original node → shrunken end). The normal solid member
  // is suppressed by the caller while despiece is active, so the gap shows only
  // this ghost connection.
  const segments = computeDespieceSegments({ elements: d.elements, getNode: d.getNode, sep: d.sep });
  d.ctx.save();
  d.ctx.strokeStyle = COL.remnant; d.ctx.lineWidth = 1; d.ctx.setLineDash([3, 4]); d.ctx.globalAlpha = 0.5;
  for (const seg of segments) {
    const a = d.worldToScreen(seg.from.x, seg.from.y), b = d.worldToScreen(seg.to.x, seg.to.y);
    d.ctx.beginPath(); d.ctx.moveTo(a.x, a.y); d.ctx.lineTo(b.x, b.y); d.ctx.stroke();
  }
  d.ctx.restore();
  d.ctx.setLineDash([]);

  // Solid separated members (between shrunken ends only).
  for (const el of d.elements) {
    const ni = d.getNode(el.nodeI), nj = d.getNode(el.nodeJ);
    if (!ni || !nj) continue;
    const { i: aI, j: aJ } = shrinkMember(ni, nj, d.sep);
    const sI = d.worldToScreen(aI.x, aI.y), sJ = d.worldToScreen(aJ.x, aJ.y);
    d.ctx.strokeStyle = COL.member; d.ctx.lineWidth = 2.5;
    d.ctx.beginPath(); d.ctx.moveTo(sI.x, sI.y); d.ctx.lineTo(sJ.x, sJ.y); d.ctx.stroke();
  }

  // Force/moment vectors.
  const vectors = computeDespieceVectors({
    elements: d.elements, getNode: d.getNode, getElementForces: d.getElementForces,
    reactions: d.reactions, sep: d.sep, vectorMode, basis, showReactions, resultant, fmt: d.fmt,
  });
  for (const vec of vectors) {
    const s = d.worldToScreen(vec.origin.x, vec.origin.y);
    if (vec.glyph === 'force') {
      const len = (vec.component === 'V') ? shearLen : axialLen;
      const ex = vec.dirx ?? 0, ey = -(vec.diry ?? 0);                 // screen force unit
      const flen = Math.hypot(ex, ey) || 1;
      // Small perpendicular stagger so the collinear member/node pair don't merge.
      const ppx = -ey / flen, ppy = ex / flen;
      const so = (vec.perpSign ?? 0) * PERP_PX;
      const ax0 = s.x + ppx * so, ay0 = s.y + ppy * so;
      // Keep the arrow on the OUTWARD (gap) side of the anchor: if the force points
      // into the piece, draw it with the HEAD at the anchor (tail in the gap).
      const ox = vec.outx ?? -ex, oy = vec.outx != null ? -(vec.outy ?? 0) : ey;
      const pointsOut = (ex * ox + ey * oy) >= 0;
      let tx0: number, ty0: number, tx1: number, ty1: number;
      if (pointsOut) { tx0 = ax0; ty0 = ay0; tx1 = ax0 + ex * len; ty1 = ay0 + ey * len; }
      else { tx0 = ax0 - ex * len; ty0 = ay0 - ey * len; tx1 = ax0; ty1 = ay0; }
      arrow(d.ctx, tx0, ty0, tx1, ty1, vec.color, vSize);
      if (vec.labelText) label(d.ctx, vec.labelText, tx1 + ex * 12, ty1 + ey * 12, vec.color, fontPx);
    } else {
      momentArc(d.ctx, s.x, s.y, !!vec.ccw, vec.color, arcR);
      if (vec.labelText) label(d.ctx, vec.labelText, s.x, s.y - arcR - 8, vec.color, fontPx);
    }
  }
}
