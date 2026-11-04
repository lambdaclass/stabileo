/**
 * The concrete of a frame member, read from the analysis model.
 *
 * ── The seam this module is ────────────────────────────────────────
 *
 * `buildSceneModel` will not go looking for concrete. It takes what it is given and reports
 * what it is not given, because a projection that reached into live state could show a
 * section edited after the steel was designed — concrete from now wrapped round bars from
 * before, with nothing on screen to reveal it.
 *
 * This is the module that does the reaching, in one place, in the open. It converts nodes,
 * elements and sections into the shape the scene consumes, and it REFUSES rather than guesses:
 * a member whose section states no b and no h produces nothing, lands in the scene's
 * `unresolvedMembers`, and is shown to the user as a member whose concrete is unknown.
 *
 * That refusal is the point. The alternative — falling back to a square of area `a` — would
 * put a plausible box on screen that no one specified, and a plausible wrong box is worse
 * than a visible gap.
 *
 * Pure: no store, no runes. The caller passes snapshots.
 */

import type { MemberGeometry } from './scene-model';
import { memberReferenceLine, type OffsetCarrier } from '../member-offsets';

/** The minimum this module needs from a node. */
export interface MemberNode { id: number; x: number; y: number; z?: number }

/** The minimum it needs from an element. */
export interface MemberElement extends OffsetCarrier {
  id: number;
  nodeI: number;
  nodeJ: number;
  sectionId: number;
}

/** The minimum it needs from a section. */
export interface MemberSection {
  id: number;
  /** Width across the member, m. Absent on a section that states no rectangle. */
  b?: number;
  /** Depth, m. */
  h?: number;
  /** Rotation of the profile about the member axis, degrees. */
  rotation?: number;
  shape?: string;
}

/**
 * How vertical a member must be before it is called a column.
 *
 * ── Why the classification exists at all ───────────────────────────
 *
 * Only to label the solid, and through the label to colour and group it. Nothing geometric
 * depends on it: the section frame is built from the member's real axis either way, so a
 * raking column and a sloping beam are both drawn correctly whichever bucket they fall in.
 * Which is why a plain angle threshold is adequate here and would not be if the kind drove a
 * calculation.
 */
const COLUMN_COS = Math.cos((30 * Math.PI) / 180);

export interface MemberGeometryResult {
  members: MemberGeometry[];
  /**
   * Members that were asked for and could not be built, with the reason.
   *
   * Returned rather than logged. The view names them to the user, because "why is there no
   * beam round these bars" is a question the app should answer rather than leave to be
   * guessed at.
   */
  refused: Array<{ elementId: number; reason: 'noSection' | 'noRectangle' | 'noNodes' | 'zeroLength' }>;
}

/**
 * Build member concrete for the elements named, in the order named.
 *
 * `elementIds` is the caller's list — normally the union of what the document's assemblies
 * claim — so this module never has to decide what is interesting.
 */
export function membersFromModel(input: {
  elementIds: readonly number[];
  nodes: readonly MemberNode[];
  elements: readonly MemberElement[];
  sections: readonly MemberSection[];
}): MemberGeometryResult {
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const elementById = new Map(input.elements.map((e) => [e.id, e]));
  const sectionById = new Map(input.sections.map((s) => [s.id, s]));

  const members: MemberGeometry[] = [];
  const refused: MemberGeometryResult['refused'] = [];

  for (const id of input.elementIds) {
    const el = elementById.get(id);
    if (!el) {
      refused.push({ elementId: id, reason: 'noNodes' });
      continue;
    }
    const ni = nodeById.get(el.nodeI);
    const nj = nodeById.get(el.nodeJ);
    if (!ni || !nj) {
      refused.push({ elementId: id, reason: 'noNodes' });
      continue;
    }
    const sec = sectionById.get(el.sectionId);
    if (!sec) {
      refused.push({ elementId: id, reason: 'noSection' });
      continue;
    }
    if (!(sec.b! > 0) || !(sec.h! > 0)) {
      // A steel profile or a generic section states area and inertia, not a rectangle. There
      // is no honest concrete outline to draw for it.
      refused.push({ elementId: id, reason: 'noRectangle' });
      continue;
    }

    // The concrete stands on the member's axis — the nodes plus its declared insertion
    // (`memberReferenceLine`), the line the analysis and the bars use — so a top-flush beam's
    // box is flush with the node and its bars inside it. On the nodes where it declares none.
    const line = memberReferenceLine(el, ni, nj, sectionById);
    const start = line.i;
    const end = line.j;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) {
      refused.push({ elementId: id, reason: 'zeroLength' });
      continue;
    }

    members.push({
      elementId: id,
      kind: Math.abs(dz) / len >= COLUMN_COS ? 'column' : 'beam',
      start,
      end,
      width: sec.b!,
      depth: sec.h!,
      rollDeg: sec.rotation,
    });
  }

  return { members, refused };
}
