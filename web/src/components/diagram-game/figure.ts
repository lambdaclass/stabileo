import { memberSign, type GameModel } from './game-model';
import { drawnOrdinate, memberAxis, peak, sampleDiagram, type Diagram, type Vec } from './traces';

export type Ink = 'member' | 'support' | 'hinge' | 'load' | 'fill' | 'curve' | 'ghost' | 'tension' | 'compression' | 'zero';

export interface Shape { d: string; ink: Ink; width?: number }
export interface Label { x: number; y: number; text: string; ink: Ink }
export interface Figure { viewBox: string; shapes: Shape[]; labels: Label[]; unit: number }

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(3));
const pt = ([x, y]: Vec) => `${fmt(x)} ${fmt(-y)}`;
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + k * b[0], a[1] + k * b[1]];
const polyline = (pts: Vec[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join(' ');

function size(m: GameModel) {
  const xs = m.nodes.map((n) => n[0]), ys = m.nodes.map((n) => n[1]);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { box, S: Math.max(box.maxX - box.minX, box.maxY - box.minY, 1) };
}

function arrow(tip: Vec, dir: Vec, length: number, head: number): string {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const u: Vec = [dir[0] / n, dir[1] / n], p: Vec = [-u[1], u[0]];
  const tail = add(tip, u, -length);
  const b = add(tip, u, -head);
  return `${polyline([tail, tip])} M${pt(add(b, p, head * 0.45))} L${pt(tip)} L${pt(add(b, p, -head * 0.45))}`;
}

function couple(at: Vec, ccw: boolean, r: number): string {
  const a0 = ccw ? -0.6 : 0.6, a1 = ccw ? Math.PI + 0.6 : -Math.PI - 0.6;
  const pts: Vec[] = Array.from({ length: 13 }, (_, k) => { const a = a0 + (a1 - a0) * k / 12; return [at[0] + r * Math.cos(a), at[1] + r * Math.sin(a)]; });
  const end = pts[pts.length - 1]!, before = pts[pts.length - 2]!;
  return `${polyline(pts)} ${arrow(end, [end[0] - before[0], end[1] - before[1]], 0, r * 0.55)}`;
}

function hatch(from: Vec, to: Vec, out: Vec, h: number): string {
  const parts = [polyline([from, to])];
  for (let k = 0; k <= 4; k++) {
    const p = add(from, add(to, from, -1), k / 4);
    parts.push(polyline([p, add(add(p, out, h), add(to, from, -1), -0.12)]));
  }
  return parts.join(' ');
}

function supportShape(m: GameModel, node: number, type: string, s: number): string {
  const at = m.nodes[node]! as Vec;
  if (type === 'fixed') {
    const e = m.elements.findIndex(([i, j]) => i === node || j === node);
    const { dir } = memberAxis(m, e);
    const into: Vec = m.elements[e]![0] === node ? dir : [-dir[0], -dir[1]];
    const across: Vec = [-into[1], into[0]];
    return hatch(add(at, across, -1.2 * s), add(at, across, 1.2 * s), [-into[0], -into[1]], 0.6 * s);
  }
  const side = type === 'rollerY';
  const down: Vec = side ? [-1, 0] : [0, -1], along: Vec = side ? [0, 1] : [1, 0];
  const base = add(at, down, 1.3 * s);
  const tri = `M${pt(at)} L${pt(add(base, along, s))} L${pt(add(base, along, -s))} Z`;
  if (type === 'pinned') return `${tri} ${hatch(add(base, along, -1.4 * s), add(base, along, 1.4 * s), down, 0.45 * s)}`;
  const r = 0.22 * s;
  const wheels = [-0.55, 0.55].map((k) => { const c = add(add(base, along, k * s), down, r); return `M${pt(add(c, along, -r))} a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r * along[0])} ${fmt(-2 * r * along[1])} a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r * along[0])} ${fmt(2 * r * along[1])}`; }).join(' ');
  const ground = add(base, down, 2 * r);
  return `${tri} ${wheels} ${hatch(add(ground, along, -1.4 * s), add(ground, along, 1.4 * s), down, 0.45 * s)}`;
}

function loadShapes(m: GameModel, S: number): string[] {
  const out: string[] = [];
  const len = 0.16 * S, head = 0.045 * S;
  const forces = [...(m.nodalLoads ?? [])];
  const peakQ = Math.max(1e-9, ...(m.distributedLoads ?? []).flatMap((d) => [Math.abs(d.qI), Math.abs(d.qJ ?? d.qI)]));
  for (const l of forces) {
    const at = m.nodes[l.node]! as Vec;
    const f: Vec = [l.fx ?? 0, l.fy ?? 0], nf = Math.hypot(f[0], f[1]);
    if (nf > 1e-9) {
      const u: Vec = [f[0] / nf, f[1] / nf];
      const blocked = m.elements.some(([i, j]) => {
        if (i !== l.node && j !== l.node) return false;
        const o = m.nodes[i === l.node ? j : i]!, d: Vec = [o[0] - at[0], o[1] - at[1]], nd = Math.hypot(d[0], d[1]);
        return -(d[0] * u[0] + d[1] * u[1]) / nd > 0.9;
      });
      out.push(blocked ? arrow(add(at, u, len), u, len, head) : arrow(at, f, len, head));
    }
    if (l.mz) out.push(couple(at, l.mz > 0, 0.07 * S));
  }
  for (const l of m.pointLoads ?? []) {
    const { start, dir, normal } = memberAxis(m, l.element);
    const at = add(start, dir, l.a);
    const s = memberSign(m, l.element);
    if (l.p) out.push(arrow(at, [normal[0] * s * l.p, normal[1] * s * l.p], len, head));
    if (l.m) out.push(couple(at, l.m > 0, 0.07 * S));
  }
  for (const l of m.distributedLoads ?? []) {
    const { start, dir, normal, length } = memberAxis(m, l.element);
    const s = memberSign(m, l.element);
    const qJ = l.qJ ?? l.qI;
    const count = Math.max(2, Math.round(8 * length / S));
    const tails: Vec[] = [];
    for (let k = 0; k <= count; k++) {
      const t = k / count, q = l.qI + (qJ - l.qI) * t;
      const at = add(start, dir, t * length);
      const f: Vec = [normal[0] * s * q, normal[1] * s * q];
      const h = 0.11 * S * Math.abs(q) / peakQ;
      const nf = Math.hypot(f[0], f[1]);
      tails.push(nf > 1e-9 ? add(at, f, -h / nf) : at);
      if (h > head * 0.6) out.push(arrow(at, f, h, head * 0.8));
    }
    out.push(polyline(tails));
  }
  return out;
}

function stations(breaks: number[]): number[] {
  const ts = Array.from({ length: 41 }, (_, k) => k / 40);
  for (const b of breaks) ts.push(b - 1e-5, b + 1e-5);
  return ts.filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
}

function diagramShapes(m: GameModel, d: Diagram, S: number): { shapes: Shape[]; labels: Label[] } {
  const shapes: Shape[] = [], labels: Label[] = [];
  const top = peak(sampleDiagram(d)) || 1;
  const k = (d.kind === 'D' ? 0.12 : 0.2) * S / top;
  d.traces.forEach((tr, e) => {
    const { start, dir, length } = memberAxis(m, e);
    const ts = stations(tr.breaks);
    const base = (t: number) => add(start, dir, t * length);
    const curve = ts.map((t) => add(base(t), tr.at(t), k));
    if (d.kind === 'D') {
      shapes.push({ d: polyline([start, base(1)]), ink: 'ghost' }, { d: polyline(curve), ink: 'curve' });
      return;
    }
    if (m.allTruss) {
      const n = drawnOrdinate(m, e, tr.at(0.5), 'N');
      const zero = Math.abs(n) < 1e-6 * top;
      shapes.push({ d: polyline([start, base(1)]), ink: zero ? 'zero' : n > 0 ? 'tension' : 'compression', width: zero ? 1 : 2 + 6 * Math.abs(n) / top });
      if (!zero) {
        const { normal } = memberAxis(m, e);
        const q = add(base(0.5), normal, 0.07 * S);
        labels.push({ x: q[0], y: -q[1], text: n > 0 ? '+' : '−', ink: n > 0 ? 'tension' : 'compression' });
      }
      return;
    }
    shapes.push({ d: `${polyline([base(0), ...curve, base(1)])} Z`, ink: 'fill' }, { d: polyline(curve), ink: 'curve' });
    if (d.kind === 'M') return;
    let run: { t: number; v: number } | null = null as { t: number; v: number } | null;
    const flush = () => {
      if (run && Math.abs(run.v) > 0.12 * top) {
        const p = add(base(run.t), tr.at(run.t), k);
        const off = tr.at(run.t), n = Math.hypot(off[0], off[1]) || 1;
        const q = add(p, off, 0.07 * S / n);
        labels.push({ x: q[0], y: -q[1], text: run.v > 0 ? '+' : '−', ink: 'curve' });
      }
      run = null;
    };
    for (const t of ts) {
      const v = drawnOrdinate(m, e, tr.at(t), d.kind);
      if (Math.abs(v) < 1e-9 * top) continue;
      if (run && Math.sign(v) !== Math.sign(run.v)) flush();
      if (!run || Math.abs(v) > Math.abs(run.v)) run = { t, v };
    }
    flush();
  });
  return { shapes, labels };
}

/** `bare` draws only the members and the diagram: supports, hinges and loads would give away which structure it came from. */
export function figure(m: GameModel, d: Diagram | null, bare = false): Figure {
  const { box, S } = size(m);
  const pad = 0.27 * S;
  const sym = 0.07 * S;
  const shapes: Shape[] = [];
  const drawn = d ? diagramShapes(m, d, S) : { shapes: [], labels: [] };
  const labels = drawn.labels;
  shapes.push(...drawn.shapes);
  if (!(d && m.allTruss)) m.elements.forEach(([i, j]) => shapes.push({ d: polyline([m.nodes[i] as Vec, m.nodes[j] as Vec]), ink: 'member' }));
  const viewBox = [box.minX - pad, -(box.maxY + pad), box.maxX - box.minX + 2 * pad, box.maxY - box.minY + 2 * pad].map(fmt).join(' ');
  if (bare) return { viewBox, shapes, labels, unit: S };
  for (const s of m.supports) shapes.push({ d: supportShape(m, s.node, s.type, sym), ink: 'support' });
  for (const n of m.allTruss ? m.nodes.map((_, k) => k) : m.nodeHinges ?? []) {
    const [x, y] = m.nodes[n]!, r = 0.022 * S;
    shapes.push({ d: `M${fmt(x - r)} ${fmt(-y)} a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`, ink: 'hinge' });
  }
  for (const l of loadShapes(m, S)) shapes.push({ d: l, ink: 'load' });
  return { viewBox, shapes, labels, unit: S };
}

/** Width over height of the drawing `figure` makes of this model. */
export function figureAspect(m: GameModel): number {
  const [, , w, h] = figure(m, null, true).viewBox.split(' ').map(Number);
  return w! / h!;
}
