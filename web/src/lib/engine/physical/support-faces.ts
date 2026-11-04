/**
 * Where a beam meets the columns at a node, and the band its joint makes: the two readings the
 * detailing and the physical geometry share.
 *
 * ── Why these left `runDetailing` ──────────────────────────────────
 *
 * They were closures inside `runDetailing`, so the only code that could ask "where does this
 * beam meet its column" was the detailing. The 3-D views, the IFC and the quantities each drew
 * the concrete from node to node instead, and the concrete of every joint was stood in the same
 * place two or three times. Out here, pure, they are called by the detailing and by
 * `physical-frame.ts`, which is the one geometry the views, the IFC and the quantities read.
 *
 * ── Two readings of one column, on purpose ─────────────────────────
 *
 * `supportFacesAt` is the face the ANCHORAGE counts from: half the smaller side of the widest
 * column at the node, moved by the column's declared insertion (`columnFacesAlong`). Where the
 * column's long side lies along the beam, it puts the face nearer the node than the concrete
 * does, which shortens the length a bar may develop in the column: the conservative side for a
 * bar, and the reading every verified anchorage in the app was checked on. The geometry needs
 * where the concrete really ends, which is the footprint's own boundary (`physical-frame.ts`).
 * Both read the same column through the same insertion; neither is a second opinion of the
 * other, and the detailing's results do not move by a bit for this extraction.
 *
 * Pure: no store, no runes.
 */

import { columnFacesAlong } from '../detailing/support-anchorage';

export interface Vec3 { x: number; y: number; z: number }

/** A column framing in at the node, as the anchorage reads it. */
export interface FaceColumn {
  /** Its section's two sides, m. */
  b: number;
  h: number;
  /** Node to the column's axis at this node, global, m (its declared insertion; zero where none). */
  offset: Vec3;
}

/**
 * The face of the widest column at a node along a beam, m from the beam's axis end, and the far
 * face when the column's insertion moves it: half the column's smaller side either way of its
 * axis (`columnFacesAlong`), read against the beam's own axis. No column: face 0, no far face.
 *
 * `w` is the unit vector from the node into the beam's span; `beamOffset` the beam's own
 * insertion at the node.
 */
export function supportFacesAt(
  columns: readonly FaceColumn[], beamOffset: Vec3, w: Vec3,
): { face: number; far?: number } {
  let half = 0, widest: FaceColumn | undefined;
  for (const c of columns) {
    const h = Math.min(c.b, c.h) / 2;
    if (h > half) { half = h; widest = c; }
  }
  if (!widest) return { face: half };
  const c = widest.offset, o = beamOffset;
  return columnFacesAlong(half, { x: c.x - o.x, y: c.y - o.y, z: 0 }, w);
}

/** A beam framing in at a node, as its joint band reads it: its axis height there and its depth. */
export interface BandBeam {
  /** The node's elevation, m. */
  nodeZ: number;
  /** Node to the beam's axis, vertical part, m (its declared insertion). */
  dz: number;
  /** Section depth, m. */
  h: number;
}

/**
 * The band the beams framing in at a node make, from the lowest soffit to the highest top face,
 * each on its own axis. `depth` is the deepest beam; `moved` whether any insertion moved an axis
 * off the node, which is when the detailing hands the band over explicitly rather than taking the
 * node ± half the deepest beam (`generate-column.ts` `jointBand`). Null band with no beam.
 */
export function jointBandOf(beams: readonly BandBeam[]): { depth: number; lo: number; hi: number; moved: boolean } | null {
  let depth = 0, lo = Infinity, hi = -Infinity, moved = false;
  for (const b of beams) {
    depth = Math.max(depth, b.h);
    if (Math.abs(b.dz) > 1e-9) moved = true;
    lo = Math.min(lo, b.nodeZ + b.dz - b.h / 2);
    hi = Math.max(hi, b.nodeZ + b.dz + b.h / 2);
  }
  return depth > 0 ? { depth, lo, hi, moved } : null;
}
