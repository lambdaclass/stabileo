/**
 * The frame a prismatic member's section stands in, and its base rectangle: one convention for
 * which way a section faces, shared by the reinforcement scene, the sheets and the physical frame.
 *
 * Moved here from `scene-model.ts` (which re-exports it) so the physical frame can build on it
 * without importing the scene.
 *
 * Pure: no store, no runes.
 */
import type { Point3 } from '../../codes/cirsoc201/bar-geometry';

/** What a member needs to be swept: its axis ends, its section and the section's roll. */
export interface PrismaticMember {
  start: Point3;
  end: Point3;
  width: number;
  depth: number;
  rollDeg?: number;
}

/**
 * A prismatic member's base rectangle, in the plane normal to its own axis.
 *
 * Built from a frame rather than from world axes because a column is vertical and a beam is
 * not, and a single hard-coded "extrude in z" would put every beam's section in the wrong
 * plane. `up` is the world vertical unless the member IS vertical, in which case there is no
 * projection of it onto the section plane and the global x axis stands in — the same
 * degenerate case every framing convention has to name, made explicit here rather than
 * producing a zero-length cross product and a NaN.
 *
 * ── Why it is exported ─────────────────────────────────────────
 *
 * `sheet-geometry.ts` draws the same concrete on a 2-D sheet and needs the same frame. A
 * second copy of this arithmetic is a second convention for which way a rolled section faces,
 * and the two would agree until the first raking column — at which point the elevation and the
 * 3-D view would show the same member in two orientations with nothing to say which was right.
 */
export function memberBase(m: PrismaticMember): { base: Point3[]; extrude: Point3 } {
  const ax = { x: m.end.x - m.start.x, y: m.end.y - m.start.y, z: m.end.z - m.start.z };
  const len = Math.hypot(ax.x, ax.y, ax.z) || 1;
  const n = { x: ax.x / len, y: ax.y / len, z: ax.z / len };

  const vertical = Math.abs(n.z) > 0.999;
  const ref = vertical ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  // u = ref × n, normalised; v = n × u. Right-handed and orthonormal by construction.
  let u = {
    x: ref.y * n.z - ref.z * n.y,
    y: ref.z * n.x - ref.x * n.z,
    z: ref.x * n.y - ref.y * n.x,
  };
  const ul = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };

  const t = ((m.rollDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const hw = m.width / 2;
  const hd = m.depth / 2;
  const base = ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([a, b]) => {
    const p = a * c - b * s;
    const q = a * s + b * c;
    return {
      x: m.start.x + u.x * p + v.x * q,
      y: m.start.y + u.y * p + v.y * q,
      z: m.start.z + u.z * p + v.z * q,
    };
  });
  return { base, extrude: ax };
}
