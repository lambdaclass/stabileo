/**
 * The pen the construction details are drawn with: model millimetres at the detail's scale, the
 * reinforcement layers of the sheets, texts sized in paper millimetres. Each detail is a sketch
 * turned into a `DrawingInput` with its code in the title and its technical note under it.
 */
import type { DrawingInput } from '../compose';
import { bounds, dimensionGeometry, type P, type Primitive } from '../primitives';

export const BAR = 'RC-BAR', TIE = 'RC-STIRRUP', OUT = 'RC-OUTLINE', TXT = 'RC-TEXT', DIM = 'RC-DIM', HID = 'RC-PROJECTED', AXIS = 'FW-AXIS', COVER = 'RC-COVER', MARK = 'RC-MARK';

const fmt = (v: number) => String(Math.round(v));
export { fmt as mm };

export class Sketch {
  readonly ps: Primitive[] = [];
  /** `s`: model millimetres per paper millimetre (the detail's 1:s). */
  constructor(readonly s: number) {}
  /** A paper length in model millimetres. */
  p(mm: number): number { return mm * this.s; }

  line(a: P, b: P, layer = OUT, dia?: number): this { this.ps.push({ kind: 'line', layer, a, b, ...(dia ? { dia } : {}) }); return this; }
  poly(points: P[], layer = OUT, closed = false, dia?: number): this { this.ps.push({ kind: 'polyline', layer, points, closed, ...(dia ? { dia } : {}) }); return this; }
  rect(x0: number, y0: number, x1: number, y1: number, layer = OUT): this { return this.poly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], layer, true); }
  /** A bar along its centreline. */
  bar(points: P[], d: number): this { return this.poly(points, BAR, false, d); }
  /** A bar cut in section. */
  dot(x: number, y: number, d: number): this { this.ps.push({ kind: 'circle', layer: BAR, c: { x, y }, r: d / 2, fill: true, dia: d }); return this; }
  tie(points: P[], d: number, closed = false): this { return this.poly(points, TIE, closed, d); }
  /**
   * A closed hoop of centreline x0..x1 × y0..y1 with its two 135° hooks at the top left corner,
   * tails `ext` long turned into the core.
   */
  hoop(x0: number, y0: number, x1: number, y1: number, d: number, ext: number): this {
    this.tie([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], d, true);
    const k = Math.SQRT1_2, r = 2.5 * d;
    this.tie([{ x: x0, y: y1 - r }, { x: x0 + ext * k, y: y1 - r - ext * k }], d);
    this.tie([{ x: x0 + r, y: y1 }, { x: x0 + r + ext * k, y: y1 - ext * k }], d);
    return this;
  }
  /** Bars cut in section along the inside of a hoop's centreline, `n` per face with the corners shared. */
  hoopBars(x0: number, y0: number, x1: number, y1: number, tie: number, d: number, nx: number, ny: number): this {
    const o = tie / 2 + d / 2, X0 = x0 + o, X1 = x1 - o, Y0 = y0 + o, Y1 = y1 - o;
    for (let i = 0; i < nx; i++) { const x = nx === 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * i) / (nx - 1); this.dot(x, Y0, d).dot(x, Y1, d); }
    for (let j = 1; j < ny - 1; j++) { const y = Y0 + ((Y1 - Y0) * j) / (ny - 1); this.dot(X0, y, d).dot(X1, y, d); }
    return this;
  }
  /** A dimension: `off` in paper mm (positive to the left of a → b). */
  dim(a: P, b: P, off: number, label?: string): this { this.ps.push({ kind: 'dimension', layer: DIM, a, b, offset: off, ...(label ? { text: label } : {}) }); return this; }
  text(x: number, y: number, s: string, h = 2.5, align: 'left' | 'center' | 'right' = 'left', layer = TXT): this { this.ps.push({ kind: 'text', layer, at: { x, y }, text: s, height: h, align }); return this; }
  /** A leader from a point of the drawing to a label at `to` (the label's left end). */
  label(from: P, to: P, s: string, h = 2.2): this {
    const right = to.x >= from.x;
    this.line(from, to, TXT).line(to, { x: to.x + (right ? 1 : -1) * this.p(2), y: to.y }, TXT);
    return this.text(to.x + (right ? 1 : -1) * this.p(2.8), to.y - this.p(h / 2.4), s, h, right ? 'left' : 'right');
  }
  axis(a: P, b: P): this { return this.line(a, b, AXIS); }
  hidden(points: P[], closed = false): this { return this.poly(points, HID, closed); }
  /** A zigzag break across a cut member, from a to b. */
  breakLine(a: P, b: P): this {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const n = { x: -dy / L, y: dx / L }, z = this.p(1.6), t = { x: dx / L, y: dy / L };
    return this.poly([a, { x: m.x - t.x * z, y: m.y - t.y * z }, { x: m.x - t.x * z * 0.3 + n.x * z, y: m.y - t.y * z * 0.3 + n.y * z }, { x: m.x + t.x * z * 0.3 - n.x * z, y: m.y + t.y * z * 0.3 - n.y * z }, { x: m.x + t.x * z, y: m.y + t.y * z }, b], OUT);
  }
  /** Ground under a footing: short slanted strokes along y from x0 to x1. */
  ground(x0: number, x1: number, y: number): this {
    const st = this.p(4);
    this.line({ x: x0, y }, { x: x1, y }, OUT);
    for (let x = x0 + st / 2; x < x1; x += st) this.line({ x, y }, { x: x - st * 0.6, y: y - st * 0.6 }, HID);
    return this;
  }
  /** A bar bent with a hook: from `start` along `dir` (radians) for `run`, a bend of `angleDeg` to the left (side 1) or right (−1), then `tail`. */
  hooked(start: P, dir: number, run: number, radius: number, angleDeg: number, tail: number, side: 1 | -1, d: number): this {
    return this.bar(hookPath(start, dir, run, radius, angleDeg, tail, side), d);
  }

  /** The finished detail: its code before the title and the note's lines under the drawing. */
  drawing(key: string, title: string, note?: string, opts: { code?: string } = {}): DrawingInput {
    const ps = [...this.ps];
    if (note) {
      const b = modelBounds(ps, this.s), widthPaper = Math.max(70, (b.x1 - b.x0) / this.s), h = 2;
      const lines = wrap(note, Math.floor(widthPaper / (h * 0.55)));
      lines.forEach((l, i) => ps.push({ kind: 'text', layer: TXT, at: { x: b.x0, y: b.y0 - this.p(4 + (i + 1) * h * 1.6) }, text: l, height: h }));
    }
    const b = modelBounds(ps, this.s);
    return { key, title: opts.code ? `${opts.code} · ${title}` : title, primitives: ps, width: b.x1 - b.x0, height: b.y1 - b.y0, origin: { x: b.x0, y: b.y0 }, scale: this.s };
  }
}

/**
 * The box of a drawing in model millimetres at 1:s: a dimension's offset and its text are paper
 * millimetres, so they reach `s` times further in the model than `bounds` alone measures.
 */
export function modelBounds(ps: readonly Primitive[], s: number) {
  const b = bounds(ps.filter((p) => p.kind !== 'dimension' && p.kind !== 'text'), s);
  let { x0, y0, x1, y1 } = b;
  const empty = !ps.some((p) => p.kind !== 'dimension' && p.kind !== 'text');
  if (empty) { x0 = y0 = Infinity; x1 = y1 = -Infinity; }
  for (const p of ps) {
    if (p.kind === 'text') {
      // A text reaches left, right or both ways from its point as it is aligned.
      const w = p.text.length * p.height * 0.6 * s, from = p.align === 'right' ? p.at.x - w : p.align === 'center' ? p.at.x - w / 2 : p.at.x;
      x0 = Math.min(x0, from); x1 = Math.max(x1, from + w); y0 = Math.min(y0, p.at.y); y1 = Math.max(y1, p.at.y + p.height * s);
      continue;
    }
    if (p.kind !== 'dimension') continue;
    const h = (p.height ?? 2.5) * s, g = dimensionGeometry({ ...p, offset: p.offset * s, height: h });
    const label = (p.text ?? '').length * h * 0.3;
    for (const q of [p.a, p.b, ...g.line, { x: g.textAt.x - label, y: g.textAt.y - h }, { x: g.textAt.x + label, y: g.textAt.y + h }]) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  }
  return { x0, y0, x1, y1 };
}

/** Words into lines of at most `n` characters. */
export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** A bar's centreline: a straight run, then a bend of `angle` and a straight tail. `side` 1 turns
 *  left of the heading `dir` (radians), −1 right. */
export function hookPath(start: P, dir: number, run: number, radius: number, angleDeg: number, tail: number, side: 1 | -1 = 1): P[] {
  const c = Math.cos(dir), s = Math.sin(dir);
  const at = (x: number, y0: number): P => { const y = y0 * side; return { x: start.x + x * c - y * s, y: start.y + x * s + y * c }; };
  const pts: P[] = [at(0, 0), at(run, 0)];
  const n = Math.max(4, Math.ceil(angleDeg / 15)), th = (angleDeg * Math.PI) / 180;
  for (let i = 1; i <= n; i++) {
    const a = -Math.PI / 2 + (th * i) / n;
    pts.push(at(run + radius * Math.cos(a), radius + radius * Math.sin(a)));
  }
  const d = { x: Math.cos(th), y: Math.sin(th) };
  pts.push(at(run + radius * Math.cos(-Math.PI / 2 + th) + d.x * tail, radius + radius * Math.sin(-Math.PI / 2 + th) + d.y * tail));
  return pts;
}
