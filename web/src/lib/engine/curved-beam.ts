// Curved-beam (arc) → straight-frame expansion, computed WEB-side.
//
// The Rust engine has a curved_beams preprocessor, but it expands the arc into
// frames with engine-internal node/element ids that cannot be mapped back to
// the web model — so its diagrams/results would not render. To expose curved
// beams honestly (full rendering + results via the existing frame machinery),
// we do the arc expansion here, producing real model nodes + frame elements.
//
// Fits the unique circle through 3 points (start, mid, end) and samples the arc
// from start to end (through mid) into `segments` straight chords. Collinear or
// degenerate input falls back to a straight line.

export interface V3 { x: number; y: number; z: number }

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V3): number => Math.sqrt(dot(a, a));

/**
 * Sample the arc through (start, mid, end) into `segments` chords. Returns
 * `segments + 1` points from start to end (inclusive). Straight-line fallback
 * for collinear/degenerate input. `segments` is clamped to ≥ 1.
 */
export function arcPolyline(start: V3, mid: V3, end: V3, segments: number): V3[] {
  const n = Math.max(1, Math.floor(segments));
  const lerp = (): V3[] => Array.from({ length: n + 1 }, (_, i) => add(start, scale(sub(end, start), i / n)));

  const ab = sub(mid, start);
  const ac = sub(end, start);
  const abXac = cross(ab, ac);
  const denom = 2 * dot(abXac, abXac);
  if (denom < 1e-18) return lerp(); // collinear → straight

  // Circumcenter (3D): center = start + (|ac|²(abXac×ab) + |ab|²(ac×abXac)) / (2|abXac|²)
  const term1 = scale(cross(abXac, ab), dot(ac, ac));
  const term2 = scale(cross(ac, abXac), dot(ab, ab));
  const toCenter = scale(add(term1, term2), 1 / denom);
  const center = add(start, toCenter);
  const radius = len(toCenter);
  if (radius < 1e-9) return lerp();

  // Orthonormal arc frame: u = start-dir, normal of the 3-point plane, v = n×u.
  const u = scale(sub(start, center), 1 / radius);
  let normal = abXac;
  const nl = len(normal);
  if (nl < 1e-12) return lerp();
  normal = scale(normal, 1 / nl);
  const v = cross(normal, u); // unit (u ⟂ normal)

  // Total sweep start→end, taking the direction that passes through mid.
  const ang = (p: V3): number => {
    const w = sub(p, center);
    return Math.atan2(dot(w, v), dot(w, u));
  };
  const wrap = (a: number): number => { let x = a; while (x < 0) x += 2 * Math.PI; while (x >= 2 * Math.PI) x -= 2 * Math.PI; return x; };
  const aEnd = wrap(ang(end));
  const aMid = wrap(ang(mid));
  // start is at angle 0 by construction (u points to start). Sweep must include mid.
  let sweep = aEnd;
  if (!(aMid <= aEnd + 1e-9)) sweep = aEnd - 2 * Math.PI; // go the other way through mid

  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (sweep * i) / n;
    const dir = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
    pts.push(add(center, scale(dir, radius)));
  }
  // Pin exact endpoints (avoid FP drift).
  pts[0] = { ...start };
  pts[n] = { ...end };
  return pts;
}
