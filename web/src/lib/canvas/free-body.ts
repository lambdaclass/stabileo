/**
 * The free-body diagram (the despiece), drawn on a 2D context in screen space: the same drawing
 * for the 2D view, the 3D view (over the WebGL canvas, with everything projected) and the
 * exported figures.
 *
 * What it draws, and why:
 * - Each member is cut back a fixed distance on the screen at every joint it shares with another
 *   member, so every joint has the same room whatever the members' lengths or the zoom. A joint a
 *   member has to itself is not cut: the reactions and the loads there act on it directly.
 * - An action is an arrow pointing the way it acts; its value is a magnitude, never a sign on top
 *   of an arrow that already shows the sense. A moment is an arc in the plane (2D) or, in space,
 *   a vector with a double head along its axis (the right-hand rule), or ⊙ / ⊗ when that axis
 *   points at the reader.
 * - The values of one cut read together, as one block (`N = …`, `V = …`, `M = …`) in the colours
 *   of their arrows, placed beside the piece just inside the cut and tied to it by a thin leader,
 *   so a block can always be traced to the end it belongs to. Blocks are placed one by one where
 *   they cover nothing already drawn: pieces, arrows, loads, other blocks.
 *
 * The forces come from the caller (the 2D and 3D despiece computations, which are tested for
 * equilibrium); this module only decides where they stand.
 */
import { ObstacleGrid, segmentToBoxes, type LabelCollector, type Obstacle } from './label-layout';

export interface P3 { x: number; y: number; z?: number }
interface S2 { x: number; y: number }

export interface FBAction {
  /** N, V, Vy, Vz, T, M, My, Mz, Fx…, Rx… */
  name: string;
  kind: 'force' | 'moment';
  /** World unit direction of the action (sign included). For a planar moment, unused. */
  dir: P3;
  /** In-plane moment sense, for `planar` drawings. */
  ccw?: boolean;
  magnitude: number;
  color: string;
}

export interface FBEnd { memberId: number; end: 'I' | 'J'; nodeId: number; side: 'member' | 'node'; actions: FBAction[] }
export interface FBSupport { nodeId: number; actions: FBAction[] }

/** An applied load, for drawings that draw their own loads (3D). */
export type FBLoad =
  | { kind: 'nodal'; nodeId: number; action?: 'force' | 'moment'; dir: P3; label: string }
  // A point moment on a member is `action: 'moment'`, `dir` its axis (the right-hand rule).
  | { kind: 'point'; memberId: number; t: number; action?: 'force' | 'moment'; dir: P3; label: string }
  // Endpoint intensities in world coordinates, not unit directions: retain the load profile.
  | { kind: 'dist'; memberId: number; t0: number; t1: number; qI: P3; qJ: P3; label: string };

export interface FreeBodyInput {
  ctx: CanvasRenderingContext2D;
  toScreen: (p: P3) => S2;
  /** How much a world direction points at the reader (+) or away (−); 0 in a planar drawing. */
  towardViewer?: (dir: P3) => number;
  members: Array<{ id: number; nodeI: number; nodeJ: number; i: P3; j: P3 }>;
  nodes: (id: number) => P3 | undefined;
  ends: FBEnd[];
  supports: FBSupport[];
  loads?: FBLoad[];
  /** Which pieces carry their actions. */
  mode: 'members' | 'nodes' | 'all';
  /** 0..1, the pull-apart: the cuts open with it. */
  sep: number;
  /** Moments in the drawing plane, as arcs. */
  planar: boolean;
  fmt: (v: number, q: 'force' | 'moment') => string;
  labelPx?: number;
  arrowPx?: number;
  /** Where labels drawn later (loads, in 2D) learn what to avoid. */
  labels?: LabelCollector;
  /** What is already drawn that the values must keep clear of (the caller's loads). */
  obstacles?: Obstacle[];
  /**
   * The members whose actions are shown; all when absent. A large model cannot carry every
   * value at once, so there the caller passes the selection (or nothing) and the rest of the
   * structure is drawn as its pieces only.
   */
  focus?: ReadonlySet<number>;
  /** Said at the top of the drawing when the focus is empty (what to do to see the values). */
  hint?: string;
  /**
   * Said at the top of the drawing whatever is selected: what the free body is not (an envelope's
   * or a magnitude's is no state of equilibrium, and the caller draws it without its actions).
   */
  note?: string;
  colors?: { member: string; joint: string; link: string; leader: string; load: string; text?: string };
}

export const FB_GAP_PX = 58;
/**
 * With both sides drawn, a cut holds two sets of arrows, the member's at the cut and the joint's
 * at the joint, so it opens wider, and each set keeps to its half.
 */
export const FB_GAP_PX_BOTH = 104;

/** How far the cuts open, on the screen, for a mode and a pull-apart. */
export function freeBodyGap(mode: FreeBodyInput['mode'], sep: number): number {
  return (mode === 'all' ? FB_GAP_PX_BOTH : FB_GAP_PX) * Math.max(0, Math.min(1, sep));
}
/** Above this many members only the selected ones show their actions. */
export const FB_FOCUS_ABOVE = 40;

/**
 * Below this share of `negligible` of the largest action of its kind in the whole drawing, a
 * component is round-off whatever it acts on: hundredths of a kN where the structure carries
 * nothing (a 3D solve leaves them), which "T = 0.0 kN·m" at every cut would bury the rest under.
 */
export const FB_NOISE_SHARE = 0.05;

/**
 * Whether the despiece draws an end action's or a reaction's component, the same rule in 2D and
 * 3D. A free body drawn without a component it needs does not balance, so the share is taken of
 * the piece's own actions, not of the largest in the model: a fixed portal with 1000 kN on each
 * column and 15 kN of sway lost its 7.5 kN column shears and reactions (0.75 % of 1000 kN) at 2 %
 * of the model, and every column and joint was out of balance by them.
 *
 *   noise        below `share · FB_NOISE_SHARE` of the model's largest of its kind: left out;
 *   own          at least `share` of the largest of its kind on the same piece (a member's two
 *                ends; for a reaction, the same component at every support): drawn;
 *   lever        a force whose arm across the member (`lever`, m) makes it at least `share` of the
 *                member's largest end moment: drawn, the member's moments do not balance without
 *                it (a column's shear against its end moments, small beside its axial force).
 */
export function freeBodyKeeps(
  value: number, kind: 'force' | 'moment', share: number,
  base: { own: { force: number; moment: number }; model: { force: number; moment: number } },
  lever = 0,
): boolean {
  const v = Math.abs(value);
  if (share <= 0) return true;
  if (v < share * FB_NOISE_SHARE * base.model[kind]) return false;
  if (v >= share * base.own[kind]) return true;
  return kind === 'force' && lever > 0 && v * lever >= share * base.own.moment;
}

/** The members a large model details: the selected ones and those at selected nodes. */
export function freeBodyFocus(
  members: ReadonlyArray<{ id: number; nodeI: number; nodeJ: number }>,
  selectedElements: ReadonlySet<number>, selectedNodes: ReadonlySet<number>,
): Set<number> | undefined {
  if (members.length <= FB_FOCUS_ABOVE) return undefined;
  const f = new Set<number>();
  for (const m of members) if (selectedElements.has(m.id) || selectedNodes.has(m.nodeI) || selectedNodes.has(m.nodeJ)) f.add(m.id);
  return f;
}
const HEAD = 7;

/** How many members meet at each node. */
export function valence(members: Iterable<{ nodeI: number; nodeJ: number }>): Map<number, number> {
  const v = new Map<number, number>();
  for (const e of members) {
    v.set(e.nodeI, (v.get(e.nodeI) ?? 0) + 1);
    v.set(e.nodeJ, (v.get(e.nodeJ) ?? 0) + 1);
  }
  return v;
}

/** A piece on the screen: from its cut at I to its cut at J. */
export interface ScreenPiece { a: S2; b: S2; sI: S2; sJ: S2 }

/** Where each member's piece runs on the screen, cut back `gap` px at its shared joints. */
export function screenPieces(
  members: FreeBodyInput['members'], toScreen: (p: P3) => S2, gap: number,
): Map<number, ScreenPiece> {
  const val = valence(members);
  const out = new Map<number, ScreenPiece>();
  for (const m of members) {
    const sI = toScreen(m.i), sJ = toScreen(m.j);
    const len = Math.hypot(sJ.x - sI.x, sJ.y - sI.y);
    const ux = len > 1e-9 ? (sJ.x - sI.x) / len : 1, uy = len > 1e-9 ? (sJ.y - sI.y) / len : 0;
    const g = Math.min(gap, len / 3);
    const gi = (val.get(m.nodeI) ?? 0) > 1 ? g : 0, gj = (val.get(m.nodeJ) ?? 0) > 1 ? g : 0;
    out.set(m.id, { sI, sJ, a: { x: sI.x + ux * gi, y: sI.y + uy * gi }, b: { x: sJ.x - ux * gj, y: sJ.y - uy * gj } });
  }
  return out;
}

const overlaps = (a: Obstacle, b: Obstacle) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const area = (a: Obstacle, b: Obstacle) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, double = false): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (!Number.isFinite(a) || len < 0.5) return;
  const headSize = Math.min(HEAD, len / (double ? 2 : 1));
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * headSize * 0.6, y1 - Math.sin(a) * headSize * 0.6); ctx.stroke();
  const head = (hx: number, hy: number) => {
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - headSize * Math.cos(a - 0.38), hy - headSize * Math.sin(a - 0.38));
    ctx.lineTo(hx - headSize * Math.cos(a + 0.38), hy - headSize * Math.sin(a + 0.38));
    ctx.closePath(); ctx.fill();
  };
  head(x1, y1);
  // A moment vector: the second head a little behind the first.
  if (double) head(x1 - Math.cos(a) * headSize * 0.9, y1 - Math.sin(a) * headSize * 0.9);
}

/** An in-plane moment: a 270° arc with its head, counter-clockwise when `ccw`. */
function arc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ccw: boolean, color: string): void {
  const a0 = ccw ? -Math.PI * 0.25 : -Math.PI * 0.75, a1 = ccw ? Math.PI * 0.25 : Math.PI * 0.75;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, ccw); ctx.stroke();
  const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
  const tx = ccw ? Math.sin(a1) : -Math.sin(a1), ty = ccw ? -Math.cos(a1) : Math.cos(a1);
  const nx = -ty, ny = tx;
  ctx.beginPath();
  ctx.moveTo(ex + tx * HEAD, ey + ty * HEAD);
  ctx.lineTo(ex + nx * 3.2, ey + ny * 3.2);
  ctx.lineTo(ex - nx * 3.2, ey - ny * 3.2);
  ctx.closePath(); ctx.fill();
}

/** A vector along the reader's line of sight: ⊙ toward them, ⊗ away. */
function pointing(ctx: CanvasRenderingContext2D, x: number, y: number, toward: boolean, color: string, moment: boolean): void {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
  const r = moment ? 7 : 6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (moment) { ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
  if (toward) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
}

export function drawFreeBody(d: FreeBodyInput): Map<number, ScreenPiece> {
  const { ctx } = d;
  const C = { member: '#c7d3dd', joint: '#8fa3b3', link: '#5a6478', leader: '#8fa3b3', load: '#d9a441', ...d.colors };
  const L = d.arrowPx ?? 32;
  const fontPx = d.labelPx ?? 10.5;
  const font = `bold ${fontPx}px sans-serif`;
  const sep = Math.max(0, Math.min(1, d.sep));
  const gap = freeBodyGap(d.mode, sep);
  const pieces = screenPieces(d.members, d.toScreen, gap);
  // An arrow along a member keeps to its own half of the cut, so the member's and the joint's
  // never run into each other.
  const alongMax = Math.max(14, gap * 0.42);
  const val = valence(d.members);
  const taken = new ObstacleGrid(d.obstacles ?? []);
  const blockSeg = (x1: number, y1: number, x2: number, y2: number, pad = 3) => {
    for (const b of segmentToBoxes({ x1, y1, x2, y2, pad })) taken.push(b);
  };
  const toward = (v: P3) => d.towardViewer?.(v) ?? 0;

  /** A world direction on the screen, at a point, as a unit vector and how much of it shows. */
  function screenDir(at: P3, dir: P3): { x: number; y: number; shown: number } {
    const s0 = d.toScreen(at);
    const k = 1e-3;
    const s1 = d.toScreen({ x: at.x + dir.x * k, y: at.y + dir.y * k, z: (at.z ?? 0) + (dir.z ?? 0) * k });
    const dx = s1.x - s0.x, dy = s1.y - s0.y, l = Math.hypot(dx, dy);
    // How much of the direction shows, against a direction across the screen at the same point.
    const ref = Math.max(...[{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map((u) => {
      const s2 = d.toScreen({ x: at.x + u.x * k, y: at.y + u.y * k, z: (at.z ?? 0) + u.z * k });
      return Math.hypot(s2.x - s0.x, s2.y - s0.y);
    }));
    return l > 1e-12 ? { x: dx / l, y: dy / l, shown: ref > 0 ? Math.min(1, l / ref) : 1 } : { x: 0, y: 0, shown: 0 };
  }

  // ── The pieces ──
  ctx.save();
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = C.link;
  for (const p of pieces.values()) {
    for (const [s, c] of [[p.sI, p.a], [p.sJ, p.b]] as const) {
      if (Math.hypot(c.x - s.x, c.y - s.y) < 2) continue;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.setLineDash([]);
  for (const p of pieces.values()) {
    ctx.strokeStyle = C.member; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(p.b.x, p.b.y); ctx.stroke();
    blockSeg(p.a.x, p.a.y, p.b.x, p.b.y, 4);
  }
  ctx.lineCap = 'butt';
  for (const [nid, k] of val) {
    if (k < 2) continue;
    const n = d.nodes(nid); if (!n) continue;
    const s = d.toScreen(n);
    ctx.fillStyle = C.joint;
    ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
    taken.push({ x: s.x - 6, y: s.y - 6, width: 12, height: 12 });
  }

  const blocks: Array<{ anchor: S2; inward: S2; side: S2; lines: Array<{ text: string; color: string }> }> = [];
  const centre = (() => {
    let x = 0, y = 0, k = 0;
    for (const p of pieces.values()) { x += p.sI.x + p.sJ.x; y += p.sI.y + p.sJ.y; k += 2; }
    return k ? { x: x / k, y: y / k } : { x: 0, y: 0 };
  })();
  const lineOf = (a: FBAction) => ({ text: `${a.name} = ${d.fmt(a.magnitude, a.kind)}`, color: a.color });

  /** Draw one action standing at screen point `at` (world `w`), the piece lying along `inward`. */
  function drawAction(a: Pick<FBAction, 'kind' | 'dir' | 'ccw' | 'color'>, at: S2, w: P3, inward: S2 | null, external: boolean, slot: number, onJoint = false): { x: number; y: number } | null {
    if (a.kind === 'moment' && d.planar) {
      const r = external ? 18 : 12;
      arc(ctx, at.x, at.y, r, !!a.ccw, a.color);
      taken.push({ x: at.x - r - 3, y: at.y - r - 3, width: 2 * r + 6, height: 2 * r + 6 });
      return null;
    }
    const sd = screenDir(w, a.dir);
    // Seen end on: a symbol, set a little off the point so several can sit side by side.
    if (sd.shown < 0.28) {
      const off = inward ? { x: -inward.y, y: inward.x } : { x: 1, y: 0 };
      const px = at.x + off.x * (14 + slot * 16), py = at.y + off.y * (14 + slot * 16);
      pointing(ctx, px, py, toward(a.dir) > 0, a.color, a.kind === 'moment');
      taken.push({ x: px - 10, y: py - 10, width: 20, height: 20 });
      return null;
    }
    const len = L * (0.55 + 0.45 * sd.shown);
    let x0: number, y0: number, x1: number, y1: number;
    if (a.kind === 'moment') {
      // A moment vector leaves the point along its axis, staggered off the force arrows.
      const st = inward ? { x: -inward.y * 5 * (slot % 2 ? -1 : 1), y: inward.x * 5 * (slot % 2 ? -1 : 1) } : { x: 0, y: 0 };
      x0 = at.x + st.x; y0 = at.y + st.y; x1 = x0 + sd.x * len; y1 = y0 + sd.y * len;
      arrow(ctx, x0, y0, x1, y1, a.color, true);
    } else if (external) {
      // An external action arrives at the point from outside.
      x1 = at.x; y1 = at.y; x0 = at.x - sd.x * len * 1.1; y0 = at.y - sd.y * len * 1.1;
      arrow(ctx, x0, y0, x1, y1, a.color);
    } else {
      const along = inward ? sd.x * inward.x + sd.y * inward.y : 0;
      const isAlong = !!inward && Math.abs(along) > 0.7;
      const l = isAlong ? Math.min(len, alongMax) : len;
      if (onJoint && isAlong) {
        // On the joint itself, `inward` pointing at the member: pulled toward the member, the
        // arrow leaves the joint; pushed from the member's side, its head is at the joint.
        if (along > 0) { x0 = at.x; y0 = at.y; x1 = at.x + sd.x * l; y1 = at.y + sd.y * l; }
        else { x1 = at.x; y1 = at.y; x0 = at.x - sd.x * l; y0 = at.y - sd.y * l; }
      } else if (isAlong && along < 0) {
        // Along the piece and pulling it: drawn leaving the face, in the gap.
        x0 = at.x; y0 = at.y; x1 = at.x + sd.x * l; y1 = at.y + sd.y * l;
      } else {
        // Pushing the face, or across it: the head on the face.
        x1 = at.x; y1 = at.y; x0 = at.x - sd.x * l; y0 = at.y - sd.y * l;
      }
      arrow(ctx, x0, y0, x1, y1, a.color);
    }
    blockSeg(x0, y0, x1, y1, 3);
    return { x: x1 - x0, y: y1 - y0 };
  }

  // ── The cuts ──
  const wantMember = d.mode !== 'nodes', wantNode = d.mode !== 'members';
  const inFocus = (id: number) => !d.focus || d.focus.has(id);
  const focusNodes = new Set<number>();
  if (d.focus) for (const m of d.members) if (d.focus.has(m.id)) { focusNodes.add(m.nodeI); focusNodes.add(m.nodeJ); }
  for (const e of d.ends) {
    // A joint a selected member reaches is drawn whole: every member's action on it, or its free
    // body does not balance. The other members' own pieces stay without their values.
    if (!inFocus(e.memberId) && !(e.side === 'node' && focusNodes.has(e.nodeId))) continue;
    if ((val.get(e.nodeId) ?? 0) < 2) continue;
    if (e.side === 'member' && !wantMember) continue;
    if (e.side === 'node' && !wantNode) continue;
    const p = pieces.get(e.memberId); const m = d.members.find((x) => x.id === e.memberId);
    const node = d.nodes(e.nodeId);
    if (!p || !m || !node) continue;
    const sn = e.end === 'I' ? p.sI : p.sJ, cut = e.end === 'I' ? p.a : p.b;
    const gx = cut.x - sn.x, gy = cut.y - sn.y, gl = Math.hypot(gx, gy);
    const far = e.end === 'I' ? p.b : p.a;
    const inward = gl > 1 ? { x: gx / gl, y: gy / gl } : (() => { const l = Math.hypot(far.x - sn.x, far.y - sn.y) || 1; return { x: (far.x - sn.x) / l, y: (far.y - sn.y) / l }; })();
    // On the joint's side the axial forces stand on the joint itself (a joint's forces meet at
    // it); its shears and moments a little along the member, where each can be told apart.
    const onJointAt = { x: sn.x + inward.x * 6, y: sn.y + inward.y * 6 };
    // The joint's shears and moments stand in its half of the cut: the middle of it when only
    // the joints are drawn, the third nearest the joint when the members' share the cut.
    const jointAt = gl * (d.mode === 'all' ? 0.3 : 0.55);
    const at = e.side === 'member' ? cut : { x: sn.x + inward.x * jointAt, y: sn.y + inward.y * jointAt };
    // The world point of the cut, for projecting directions (the joint is close enough).
    const w = node;
    let shear: { x: number; y: number } | null = null;
    e.actions.forEach((a, k) => {
      const axialOnJoint = e.side === 'node' && a.kind === 'force' && (() => {
        const sd = screenDir(w, a.dir);
        return Math.abs(sd.x * inward.x + sd.y * inward.y) > 0.7;
      })();
      const v = axialOnJoint
        ? drawAction(a, onJointAt, w, inward, false, k, true)
        : drawAction(a, at, w, e.side === 'member' ? inward : { x: -inward.x, y: -inward.y }, false, k);
      if (v && a.kind === 'force') {
        const l = Math.hypot(v.x, v.y) || 1;
        const across = Math.abs((v.x / l) * inward.x + (v.y / l) * inward.y) < 0.7;
        if (across && !shear) shear = { x: -v.x / l, y: -v.y / l };
      }
    });
    // The joint's actions are the member's, opposite: written once, on the member's side.
    if (e.side === 'node' && wantMember && inFocus(e.memberId)) continue;
    const perp = { x: -inward.y, y: inward.x };
    const out = (perp.x * (at.x - centre.x) + perp.y * (at.y - centre.y)) >= 0 ? 1 : -1;
    const side: S2 = shear ?? { x: perp.x * out, y: perp.y * out };
    // Toward the member in both cases: a joint's actions stand on the member's side of the joint,
    // so their values go there too, next to the arrows they belong to, not across the joint.
    blocks.push({ anchor: at, inward, side, lines: e.actions.map(lineOf) });
  }

  // ── The supports ──
  for (const s of d.supports) {
    // Nothing selected in a large model: the rest is drawn as pieces only, reactions included.
    if (d.focus && !focusNodes.has(s.nodeId)) continue;
    const n = d.nodes(s.nodeId); if (!n) continue;
    const at = d.toScreen(n);
    s.actions.forEach((a, k) => drawAction(a, at, n, null, true, k));
    if (s.actions.length) blocks.push({ anchor: at, inward: { x: 0, y: 1 }, side: { x: at.x >= centre.x ? 1 : -1, y: 0 }, lines: s.actions.map(lineOf) });
  }

  // ── Loads, when the drawing carries its own ──
  for (const ld of d.loads ?? []) {
    if (d.focus && (ld.kind === 'nodal' ? !focusNodes.has(ld.nodeId) : !d.focus.has(ld.memberId))) continue;
    if (ld.kind === 'nodal') {
      const n = d.nodes(ld.nodeId); if (!n) continue;
      const at = d.toScreen(n);
      const sd = screenDir(n, ld.dir);
      const moment = ld.action === 'moment';
      drawAction({ kind: ld.action ?? 'force', dir: ld.dir, color: C.load }, at, n, null, true, moment ? 1 : 0);
      const out = sd.shown < 0.28 ? { x: 1, y: 0 } : { x: sd.x * (moment ? 1 : -1), y: sd.y * (moment ? 1 : -1) };
      blocks.push({ anchor: at, inward: out, side: { x: -out.y, y: out.x }, lines: [{ text: ld.label, color: C.load }] });
      continue;
    }
    const p = pieces.get(ld.memberId); const m = d.members.find((x) => x.id === ld.memberId);
    if (!p || !m) continue;
    const pointAt = (t: number) => ({ x: p.a.x + (p.b.x - p.a.x) * t, y: p.a.y + (p.b.y - p.a.y) * t });
    const worldAt = (t: number): P3 => ({ x: m.i.x + (m.j.x - m.i.x) * t, y: m.i.y + (m.j.y - m.i.y) * t, z: (m.i.z ?? 0) + ((m.j.z ?? 0) - (m.i.z ?? 0)) * t });
    if (ld.kind === 'point' && ld.action === 'moment') {
      // A moment on the member, drawn as a nodal one is: a vector with a double head, or ⊙ / ⊗.
      const at = pointAt(ld.t);
      const along = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, l = Math.hypot(along.x, along.y) || 1;
      drawAction({ kind: 'moment', dir: ld.dir, color: C.load }, at, worldAt(ld.t), { x: along.x / l, y: along.y / l }, true, 1);
      const sd = screenDir(worldAt(ld.t), ld.dir);
      const out = sd.shown < 0.28 ? { x: -along.y / l, y: along.x / l } : { x: sd.x, y: sd.y };
      blocks.push({ anchor: at, inward: out, side: { x: -out.y, y: out.x }, lines: [{ text: ld.label, color: C.load }] });
      continue;
    }
    const ts = ld.kind === 'point' ? [ld.t] : Array.from({ length: 6 }, (_, k) => ld.t0 + ((ld.t1 - ld.t0) * k) / 5);
    const norm = (v: P3) => Math.hypot(v.x, v.y, v.z ?? 0);
    const maxQ = ld.kind === 'dist' ? Math.max(norm(ld.qI), norm(ld.qJ)) : 1;
    if (maxQ <= 1e-12) continue;
    const tails: S2[] = [];
    let labelSide: S2 = { x: 0, y: -1 };
    for (const [k, t] of ts.entries()) {
      const f = ts.length === 1 ? 0 : k / (ts.length - 1);
      const q = ld.kind === 'point' ? ld.dir : {
        x: ld.qI.x + (ld.qJ.x - ld.qI.x) * f,
        y: ld.qI.y + (ld.qJ.y - ld.qI.y) * f,
        z: (ld.qI.z ?? 0) + ((ld.qJ.z ?? 0) - (ld.qI.z ?? 0)) * f,
      };
      const mag = norm(q), h = pointAt(t);
      if (mag <= 1e-12) { tails.push(h); continue; }
      const dir = { x: q.x / mag, y: q.y / mag, z: (q.z ?? 0) / mag };
      const sd = screenDir(worldAt(t), dir);
      if (sd.shown < 0.28) {
        pointing(ctx, h.x, h.y, toward(dir) > 0, C.load, false);
        taken.push({ x: h.x - 8, y: h.y - 8, width: 16, height: 16 });
        tails.push(h);
      } else {
        const len = L * 0.8 * mag / maxQ;
        const tail = { x: h.x - sd.x * len, y: h.y - sd.y * len };
        arrow(ctx, tail.x, tail.y, h.x, h.y, C.load);
        blockSeg(tail.x, tail.y, h.x, h.y, 2);
        tails.push(tail);
        labelSide = { x: -sd.x, y: -sd.y };
      }
    }
    if (tails.length > 1) {
      ctx.strokeStyle = C.load; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tails[0]!.x, tails[0]!.y);
      for (let k = 1; k < tails.length; k++) {
        ctx.lineTo(tails[k]!.x, tails[k]!.y);
        blockSeg(tails[k - 1]!.x, tails[k - 1]!.y, tails[k]!.x, tails[k]!.y, 2);
      }
      ctx.stroke();
    }
    const mid = tails[Math.floor(tails.length / 2)]!;
    blocks.push({ anchor: mid, inward: labelSide, side: labelSide, lines: [{ text: ld.label, color: C.load }] });
  }

  // ── The values: one block per cut, beside its piece, with its leader ──
  ctx.font = font;
  const lineH = fontPx + 3;
  for (const b of blocks) {
    if (!b.lines.length) continue;
    const w = Math.max(...b.lines.map((l) => ctx.measureText(l.text).width)) + 4;
    const h = b.lines.length * lineH + 2;
    const ext = (u: S2) => Math.abs(u.x) * w + Math.abs(u.y) * h;
    const sides = [b.side, { x: -b.side.x, y: -b.side.y }];
    // Every candidate is scored: covering anything costs most, then distance from the cut, then
    // the less preferred side. The first free spot near the cut on the preferred side wins.
    let best: { r: Obstacle; cost: number } | null = null;
    sides.forEach((sd, si) => {
      for (const t of [10, 24, 40, 60, 85, 115, 150]) {
        // Further out from the piece too: the second end of a short piece stacks under the first.
        for (const off of [8, 22, 40, 60, 85]) {
          const cx = b.anchor.x + b.inward.x * (t + ext(b.inward) / 2) + sd.x * (off + ext(sd) / 2);
          const cy = b.anchor.y + b.inward.y * (t + ext(b.inward) / 2) + sd.y * (off + ext(sd) / 2);
          const base = t * 0.5 + off * 0.6 + si * 15;
          // Covering only adds: a spot that cannot beat the best so far is not measured, nor finished.
          if (best && base >= best.cost) continue;
          const r = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
          let cost = base;
          const bound = best?.cost ?? Infinity;
          taken.visit(r, (o) => {
            if (overlaps(r, o)) cost += area(r, o) * 50;
            return cost >= bound;
          });
          if (!best || cost < best.cost) best = { r, cost };
        }
      }
    });
    const r = best!.r;
    taken.push({ x: r.x - 2, y: r.y - 2, width: r.width + 4, height: r.height + 4 });
    d.labels?.block({ x1: r.x, y1: r.y + r.height / 2, x2: r.x + r.width, y2: r.y + r.height / 2, pad: r.height / 2 + 2 });
    // The leader: from the cut to the nearest point of the block.
    const nx = Math.max(r.x, Math.min(b.anchor.x, r.x + r.width)), ny = Math.max(r.y, Math.min(b.anchor.y, r.y + r.height));
    if (Math.hypot(nx - b.anchor.x, ny - b.anchor.y) > 9) {
      ctx.save();
      ctx.strokeStyle = C.leader; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(b.anchor.x, b.anchor.y); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = font;
    b.lines.forEach((l, k) => {
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, r.x + 2, r.y + (k + 1) * lineH - 2);
    });
  }
  const said = [d.note, d.hint && d.focus && d.focus.size === 0 ? d.hint : undefined].filter((x): x is string => !!x);
  if (said.length) {
    ctx.save();
    ctx.font = `${fontPx + 1}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = C.text ?? C.member;
    said.forEach((text, k) => ctx.fillText(text, 14, 12 + k * (fontPx + 6)));
    ctx.restore();
  }
  return pieces;
}
