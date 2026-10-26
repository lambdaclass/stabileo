/**
 * What every plan view shares: the named structural axes with their bubbles and chained
 * dimensions, the level mark, and the scale a plan of a given extent is drawn at. Model
 * millimetres; anything that must print at a fixed paper size (a bubble, a tag offset) is sized
 * through the drawing's scale.
 */
import { fittingScale, formatGeometry, type SheetFormat } from '../formats';
import type { P, Primitive } from '../primitives';

export interface PlanAxis { name: string; axis: 'x' | 'y'; at: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** The standard scale, 1:`min` or smaller, that holds `box` plus the axis margin on the format's drawable area. */
export function planScale(box: Box, format: SheetFormat, margin = 25, min = 50): number {
  const g = formatGeometry(format), W = g.drawable.x1 - g.drawable.x0 - 2 * margin, H = g.drawable.y1 - g.drawable.y0 - 2 * margin - 8;
  // Plans are read at 1:50 and smaller; a small building does not get a 1:20 plan.
  return Math.max(min, fittingScale(box.x1 - box.x0 || 1, box.y1 - box.y0 || 1, W, H) ?? 500);
}

/**
 * Axes across the box (those that fall on it), each with a bubble at both ends, and a chain of dimensions between
 * consecutive axes below and to the left. `axis: 'x'` names an axis at constant x (a vertical line
 * on the plan).
 */
export function drawAxes(all: readonly PlanAxis[], box: Box, scale: number): Primitive[] {
  const out: Primitive[] = [];
  // Only the axes over what is drawn (a metre of slack): a plan of one base plate does not carry
  // the whole building's grid.
  const slack = 1000;
  const axes = all.filter((a) => (a.axis === 'x' ? a.at * 1000 >= box.x0 - slack && a.at * 1000 <= box.x1 + slack : a.at * 1000 >= box.y0 - slack && a.at * 1000 <= box.y1 + slack));
  const ext = 12 * scale, r = 4 * scale, th = 3;
  for (const a of axes) {
    const v = a.at * 1000;
    const [p0, p1]: [P, P] = a.axis === 'x'
      ? [{ x: v, y: box.y0 - ext }, { x: v, y: box.y1 + ext }]
      : [{ x: box.x0 - ext, y: v }, { x: box.x1 + ext, y: v }];
    out.push({ kind: 'line', layer: 'FW-AXIS', a: p0, b: p1 });
    for (const [p, s] of [[p0, -1], [p1, 1]] as const) {
      const c = a.axis === 'x' ? { x: p.x, y: p.y + s * r } : { x: p.x + s * r, y: p.y };
      out.push({ kind: 'circle', layer: 'FW-AXIS', c, r });
      out.push({ kind: 'text', layer: 'FW-TAG', at: { x: c.x, y: c.y - th / 2 * scale }, text: a.name, height: th, align: 'center' });
    }
  }
  for (const dir of ['x', 'y'] as const) {
    const vs = [...new Set(axes.filter((a) => a.axis === dir).map((a) => a.at * 1000))].sort((p, q) => p - q);
    for (let i = 1; i < vs.length; i++) {
      const [a, b] = dir === 'x'
        ? [{ x: vs[i - 1]!, y: box.y0 - ext * 0.75 }, { x: vs[i]!, y: box.y0 - ext * 0.75 }]
        : [{ x: box.x0 - ext * 0.75, y: vs[i]! }, { x: box.x0 - ext * 0.75, y: vs[i - 1]! }];
      out.push({ kind: 'dimension', layer: 'RC-DIM', a, b, offset: 0 });
    }
  }
  return out;
}

/** A level mark: a small triangle and the level, in metres with two decimals. */
export function levelMark(at: P, z: number, scale: number, fmt: (v: number) => string): Primitive[] {
  const s = 2 * scale;
  return [
    { kind: 'polyline', layer: 'FW-LEVEL', closed: true, points: [at, { x: at.x - s, y: at.y + s }, { x: at.x + s, y: at.y + s }] },
    { kind: 'text', layer: 'FW-LEVEL', at: { x: at.x + 1.5 * s, y: at.y + s * 0.4 }, text: `${z >= 0 ? '+' : ''}${fmt(z)}`, height: 2.5 },
  ];
}

/** The rectangle of a b × h section centred on `c`, turned `rotDeg`. */
export function rectAt(c: P, b: number, h: number, rotDeg = 0): P[] {
  const t = (rotDeg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]].map(([u, v]) => ({ x: c.x + u! * cs - v! * sn, y: c.y + u! * sn + v! * cs }));
}

export function boxOf(points: readonly P[]): Box {
  return points.reduce<Box>((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
}
