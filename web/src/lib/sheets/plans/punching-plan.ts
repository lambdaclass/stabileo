/**
 * The punching plan of a slab: each slab-column connection with its critical perimeter at d/2,
 * its utilisation, and the shear reinforcement when one was designed (rails of studs or legs at
 * right angles to the column faces, first at s/2 and then every s, out to the extent).
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, rectAt, type PlanAxis } from './plan-common';
import type { Tr } from './details';

export interface PunchingJoint {
  name: string; at: { x: number; y: number };
  /** Half sizes of the critical perimeter, m. */
  halfX?: number; halfY?: number; d?: number;
  utilization: number; status: string;
  reinforcement?: { lines: number; spacing: number; extent: number; legDiameter: number };
}

const k = 1000;

export function punchingPlan(title: string, slab: { outline: Array<{ x: number; y: number }> } | null, joints: readonly PunchingJoint[], axes: readonly PlanAxis[], scale: number, tr: Tr, fmt: (v: number, d: number) => string): DrawingInput | null {
  if (joints.length === 0) return null;
  const out: Primitive[] = [], s = scale, pts: P[] = [];
  if (slab) { const o = slab.outline.map((p) => ({ x: p.x * k, y: p.y * k })); out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: o }); pts.push(...o); }
  for (const j of joints) {
    const c = { x: j.at.x * k, y: j.at.y * k }; pts.push(c);
    const hx = (j.halfX ?? 0.3) * k, hy = (j.halfY ?? 0.3) * k;
    out.push({ kind: 'polyline', layer: 'RC-PUNCHING', closed: true, points: rectAt(c, 2 * hx, 2 * hy) });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: c.x + hx + 1 * s, y: c.y + hy + 1 * s }, text: `${j.name} — ${fmt(j.utilization, 2)}`, height: 2.5 });
    const r = j.reinforcement;
    if (r && r.lines > 0 && r.spacing > 0) {
      // Rails at right angles to the faces, spread evenly over the four faces.
      const per = Math.max(1, Math.round(r.lines / 4)), d = (j.d ?? 0.2) * k / 2;
      const faceX = hx - d, faceY = hy - d;
      for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let i = 0; i < per; i++) {
          const t = per === 1 ? 0 : (i / (per - 1) - 0.5) * (nx ? faceY : faceX) * 1.2;
          const o = { x: c.x + nx * faceX + (ny ? t : 0), y: c.y + ny * faceY + (nx ? t : 0) };
          const L = r.extent * k;
          out.push({ kind: 'line', layer: 'RC-PUNCHING', a: o, b: { x: o.x + nx * L, y: o.y + ny * L } });
          for (let q = r.spacing * k / 2; q <= L + 1; q += r.spacing * k) out.push({ kind: 'circle', layer: 'RC-BAR', c: { x: o.x + nx * q, y: o.y + ny * q }, r: Math.max(r.legDiameter / 2, 0.4 * s), fill: true });
        }
      }
      out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: c.x + hx + 1 * s, y: c.y + hy - 3 * s }, text: tr('plan.punch.rails', { n: r.lines, d: r.legDiameter, s: Math.round(r.spacing * 100) }), height: 2.2 });
    }
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const all = boxOf([...pts, { x: box.x0 - 20 * s, y: box.y0 - 20 * s }, { x: box.x1 + 20 * s, y: box.y1 + 20 * s }]);
  return { key: `punching-${title}`, title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
}
