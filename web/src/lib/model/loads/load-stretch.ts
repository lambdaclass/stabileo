/**
 * Where a member load sits: the stretch a–b of a distributed load and the position a of a point
 * load, measured from the member's end I. One rule for every place that writes them (the write
 * card, the load tables, `modelStore.updateLoad`), so none can store what another refuses.
 *
 *   · a stretch goes forward and stays on the member: 0 ≤ a < b ≤ L. A stretch of no length
 *     carries nothing, and one past the member's end is drawn where no load acts;
 *   · a point stays on the member: 0 ≤ a ≤ L.
 *
 * What does not fit is refused, never clamped: a = 4, b = 3 clamped to a = b = 3 is a load that was
 * "added" and acts nowhere.
 *
 * L is the length the engine measures a and b on (`loadedLength`): the member's flexible part, its
 * rigid end offsets taken off, as `member-loads.ts` reads an absent b.
 */
import { memberRef3D, type ModelData } from '../../engine/solver-service';

/** Within a micrometre of an end, a value is at that end: a length shown to six decimals and typed back. */
export const STRETCH_TOL = 1e-6;

export type StretchVerdict =
  /** As stored: an end at the member's own end is absent (`a` at 0, `b` at L). */
  | { ok: true; a: number | undefined; b: number | undefined }
  /** `order`: a ≥ b or a negative end; `outside`: past the member's length. */
  | { ok: false; reason: 'order' | 'outside' };

/**
 * Whether the ends given go forward whatever the member: neither negative nor at the start, and
 * a before b when both are given. The part of `checkStretch` that needs no length.
 */
export function stretchForward(a: number | undefined, b: number | undefined): boolean {
  if (a !== undefined && !(Number.isFinite(a) && a >= -STRETCH_TOL)) return false;
  if (b !== undefined && !(Number.isFinite(b) && b > STRETCH_TOL)) return false;
  return a === undefined || b === undefined || b - a > STRETCH_TOL;
}

/** The stretch a–b on a member of length `L`; an absent end is the member's own. */
export function checkStretch(a: number | undefined, b: number | undefined, L: number): StretchVerdict {
  if (!stretchForward(a, b)) return { ok: false, reason: 'order' };
  const A = a ?? 0, B = b ?? L;
  // An end given alone past the other, which is the member's own: the member is too short for it.
  if (A >= L - STRETCH_TOL || B > L + STRETCH_TOL || B - A <= STRETCH_TOL) return { ok: false, reason: 'outside' };
  return { ok: true, a: A > STRETCH_TOL ? A : undefined, b: B < L - STRETCH_TOL ? B : undefined };
}

/** A point load's position on a member of length `L`, or null when it is off the member. */
export function checkPosition(a: number, L: number): number | null {
  if (!Number.isFinite(a) || a < -STRETCH_TOL || a > L + STRETCH_TOL) return null;
  return Math.min(L, Math.max(0, a));
}

/**
 * The segment a member load is placed on, in model coordinates: the flexible part the engine loads,
 * from the end of the rigid offset at I (where a = 0) to the end of the one at J (b = L), and its
 * length. Node to node on a member with no offsets. The handles, the drawing and the stretch rule
 * all measure on it, so a handle sits where the load acts and a drag ends where the member does.
 */
export function loadedSegment(model: ModelData, elementId: number): { I: [number, number, number]; J: [number, number, number]; L: number } | null {
  const e = model.elements.get(elementId);
  const i = e && model.nodes.get(e.nodeI), j = e && model.nodes.get(e.nodeJ);
  if (!i || !j) return null;
  // A frame the engine cannot build (a local y along the member) is the node-to-node segment.
  let ref: ReturnType<typeof memberRef3D> = null;
  try { ref = memberRef3D(model, elementId); } catch { /* node to node below */ }
  const aI = ref?.armI ?? [0, 0, 0], aJ = ref?.armJ ?? [0, 0, 0];
  const I: [number, number, number] = [i.x + aI[0], i.y + aI[1], (i.z ?? 0) + aI[2]];
  const J: [number, number, number] = [j.x + aJ[0], j.y + aJ[1], (j.z ?? 0) + aJ[2]];
  const L = ref ? ref.axes.L : Math.hypot(J[0] - I[0], J[1] - I[1], J[2] - I[2]);
  return L > 0 ? { I, J, L } : null;
}

/** The length a member load's a and b are measured on: the flexible segment the engine loads. */
export function loadedLength(model: ModelData, elementId: number): number {
  return loadedSegment(model, elementId)?.L ?? 0;
}

/**
 * Whether an edit keeps a member load where it can act: a distributed load's a or b (the other end
 * as stored), a point load's a. Any other edit, or another type, keeps it.
 */
export function editKeepsPlace(
  load: { type: string; data: { a?: number; b?: number } }, edit: Record<string, unknown>, L: number,
): boolean {
  const n = (v: unknown) => (typeof v === 'number' ? v : undefined);
  if (load.type === 'distributed3d' && (n(edit.a) !== undefined || n(edit.b) !== undefined)) {
    return checkStretch(n(edit.a) ?? load.data.a, n(edit.b) ?? load.data.b, L).ok;
  }
  if (load.type === 'pointOnElement3d' && n(edit.a) !== undefined) return checkPosition(n(edit.a)!, L) !== null;
  return true;
}
