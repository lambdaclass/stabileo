/**
 * The construction details Stabileo draws on every set: standard hooks, the closed tie with its
 * 135° hooks, the lap splice, column starters in a footing, top bars anchored at a slab edge and
 * the hoops through a beam-column joint. Drawn with the project's own diameters and covers and the
 * hook geometry of `standardHook` (CIRSOC 201 Tables 25.3.1 and 25.3.2), so the numbers on the
 * detail are the ones the bars were cut to. Model millimetres.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import type { DrawingInput } from '../compose';
import { bounds, type P, type Primitive } from '../primitives';

export type Tr = (key: string, params?: Record<string, string | number>) => string;

export interface DetailParams {
  /** The main bar diameter the details are drawn with, mm (the most used in the project). */
  bar: number;
  /** The tie diameter, mm. */
  tie: number;
  /** Clear cover, mm. */
  cover: number;
}

const BAR = 'RC-BAR', TIE = 'RC-STIRRUP', OUT = 'RC-OUTLINE', TXT = 'RC-TEXT', DIM = 'RC-DIM';
const fmt = (v: number) => String(Math.round(v));

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

const poly = (layer: string, points: P[], closed = false): Primitive => ({ kind: 'polyline', layer, points, closed });
const rect = (layer: string, x0: number, y0: number, x1: number, y1: number): Primitive => poly(layer, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], true);
const text = (at: P, s: string, h = 2.5, align: 'left' | 'center' | 'right' = 'left'): Primitive => ({ kind: 'text', layer: TXT, at, text: s, height: h, align });
const dim = (a: P, b: P, offset: number, label?: string): Primitive => ({ kind: 'dimension', layer: DIM, a, b, offset, ...(label ? { text: label } : {}) });

function drawing(key: string, title: string, ps: Primitive[], scale: number): DrawingInput {
  const b = bounds(ps, scale);
  return { key, title, primitives: ps, width: b.x1 - b.x0, height: b.y1 - b.y0, origin: { x: b.x0, y: b.y0 }, scale };
}

/** Standard 90° and 180° hooks of the main bar, dimensioned. */
function hooks(p: DetailParams, tr: Tr): DrawingInput {
  const out: Primitive[] = [];
  let x = 0;
  for (const angle of [90, 180] as const) {
    const h = standardHook(p.bar, angle, 'longitudinal');
    const r = h.centrelineRadius * 1000, ext = h.extension * 1000, run = 12 * p.bar + 60;
    const pts = hookPath({ x, y: 0 }, 0, run, r, angle, ext);
    out.push(poly(BAR, pts));
    const tail0 = pts[pts.length - 2]!, tail1 = pts[pts.length - 1]!;
    out.push(dim(tail0, tail1, angle === 90 ? 8 : -8, `${fmt(ext)}`));
    out.push(text({ x, y: -6 * 10 }, tr('plan.detail.hookAt', { angle, d: p.bar, D: fmt(h.mandrelDiameter * 1000) })));
    x += run + 2 * r + ext + 60;
  }
  out.push(text({ x: 0, y: -11 * 10 }, tr('plan.detail.hookRef'), 2));
  return drawing('detail-hooks', tr('plan.detail.hooks'), out, 10);
}

/** A closed tie with its two 135° hooks at one corner. */
function closedTie(p: DetailParams, tr: Tr): DrawingInput {
  const h = standardHook(p.tie, 135, 'transverse');
  const r = h.centrelineRadius * 1000, ext = h.extension * 1000, W = 250, H = 400;
  const out: Primitive[] = [rect(OUT, -p.cover - p.tie / 2, -p.cover - p.tie / 2, W + p.cover + p.tie / 2, H + p.cover + p.tie / 2)];
  out.push(rect(TIE, 0, 0, W, H));
  // The two hooks at the top left corner: parallel tails turned 135° into the core.
  const k = Math.SQRT1_2;
  out.push(poly(TIE, [{ x: 0, y: H - r }, { x: ext * k, y: H - r - ext * k }]));
  out.push(poly(TIE, [{ x: r, y: H }, { x: r + ext * k, y: H - ext * k }]));
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) out.push({ kind: 'circle', layer: BAR, c: { x: cx + (cx ? -1 : 1) * (p.tie / 2 + p.bar / 2), y: cy + (cy ? -1 : 1) * (p.tie / 2 + p.bar / 2) }, r: p.bar / 2 });
  out.push(text({ x: W + 5 * 10, y: H - 2 * 10 }, tr('plan.detail.tieHook', { ext: fmt(ext), d: p.tie })));
  out.push(text({ x: W + 5 * 10, y: H - 7 * 10 }, tr('plan.detail.tieRef'), 2));
  out.push(dim({ x: -p.cover - p.tie / 2, y: H + p.cover + p.tie / 2 }, { x: 0, y: H + p.cover + p.tie / 2 }, 5, `${p.cover}`));
  return drawing('detail-tie', tr('plan.detail.tie'), out, 10);
}

/** Two bars lapped, the lap named by its clause. */
function lap(p: DetailParams, tr: Tr): DrawingInput {
  const l = 50 * p.bar, out: Primitive[] = [];
  out.push(poly(BAR, [{ x: 0, y: 0 }, { x: l + 400, y: 0 }]));
  out.push(poly(BAR, [{ x: 400, y: p.bar * 1.6 }, { x: l + 800, y: p.bar * 1.6 }]));
  out.push(dim({ x: 400, y: 0 }, { x: l + 400, y: 0 }, -6, tr('plan.detail.lapLength')));
  out.push(text({ x: 0, y: -14 * 20 }, tr('plan.detail.lapRule'), 2.2));
  return drawing('detail-lap', tr('plan.detail.lap'), out, 20);
}

/** Column starters seated on the footing's bottom mat, lapped above its top. */
function starters(p: DetailParams, tr: Tr): DrawingInput {
  const B = 1600, Hf = 600, b = 400, c = 50, out: Primitive[] = [];
  out.push(poly(OUT, [{ x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: Hf }, { x: B / 2 + b / 2, y: Hf }, { x: B / 2 + b / 2, y: Hf + 1200 }]));
  out.push(poly(OUT, [{ x: 0, y: 0 }, { x: 0, y: Hf }, { x: B / 2 - b / 2, y: Hf }, { x: B / 2 - b / 2, y: Hf + 1200 }]));
  out.push(poly(BAR, [{ x: c, y: c + 12 }, { x: B - c, y: c + 12 }]));
  for (let x = c + 100; x < B - c; x += 150) out.push({ kind: 'circle', layer: BAR, c: { x, y: c + 12 + 16 }, r: 6 });
  const h = standardHook(p.bar, 90, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000;
  for (const side of [-1, 1] as const) {
    const x0 = B / 2 + side * (b / 2 - c - p.tie - p.bar / 2), top = Hf + 1200, seat = c + 12 + 30;
    // Down to the mat, then bent outward along it: a right turn for the bar on the right.
    out.push(poly(BAR, hookPath({ x: x0, y: top }, -Math.PI / 2, top - seat - r, r, 90, ext, side === 1 ? 1 : -1)));
  }
  for (const y of [Hf - 100, Hf - 300]) out.push(poly(TIE, [{ x: B / 2 - b / 2 + c, y }, { x: B / 2 + b / 2 - c, y }]));
  out.push(dim({ x: B / 2 + b / 2, y: Hf }, { x: B / 2 + b / 2, y: Hf + 50 * p.bar > Hf + 1200 ? Hf + 1200 : Hf + 50 * p.bar }, 8, tr('plan.detail.lapLength')));
  out.push(text({ x: B + 4 * 20, y: Hf - 100 }, tr('plan.detail.startersTies')));
  out.push(text({ x: B + 4 * 20, y: c }, tr('plan.detail.startersSeat', { ext: fmt(ext) })));
  return drawing('detail-starters', tr('plan.detail.starters'), out, 20);
}

/** Top bars of a slab anchored with a 90° hook in the edge beam. */
function slabEdge(p: DetailParams, tr: Tr): DrawingInput {
  const hb = 500, bw = 200, t = 150, out: Primitive[] = [];
  out.push(poly(OUT, [{ x: 1200, y: 0 }, { x: bw, y: 0 }, { x: bw, y: -(hb - t) }, { x: 0, y: -(hb - t) }, { x: 0, y: t }, { x: 1200, y: t }]));
  const h = standardHook(10, 90, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000;
  const yTop = t - p.cover - 5;
  const pts = hookPath({ x: 1150, y: yTop }, Math.PI, 1150 - (p.cover + p.tie + 5) - r, r, 90, ext);
  out.push(poly(BAR, pts));
  out.push(poly(BAR, [{ x: bw / 2, y: p.cover + 5 }, { x: 1150, y: p.cover + 5 }]));
  for (const x of [p.cover + p.tie + 8, bw - p.cover - p.tie - 8]) out.push({ kind: 'circle', layer: BAR, c: { x, y: p.cover + p.tie + 8 - (hb - t) }, r: 8 });
  out.push(poly(TIE, [{ x: p.cover, y: t - p.cover }, { x: bw - p.cover, y: t - p.cover }, { x: bw - p.cover, y: p.cover - (hb - t) }, { x: p.cover, y: p.cover - (hb - t) }], true));
  out.push(text({ x: 400, y: t + 4 * 10 }, tr('plan.detail.slabEdgeNote', { ext: fmt(ext) })));
  return drawing('detail-slab-edge', tr('plan.detail.slabEdge'), out, 10);
}

/** Column hoops carried through the depth of a beam-column joint. */
function joint(p: DetailParams, tr: Tr): DrawingInput {
  const bc = 400, hb = 600, out: Primitive[] = [];
  out.push(poly(OUT, [{ x: 0, y: 0 }, { x: 0, y: 2400 }]), poly(OUT, [{ x: bc, y: 0 }, { x: bc, y: 900 }]), poly(OUT, [{ x: bc, y: 900 + hb }, { x: bc, y: 2400 }]));
  out.push(poly(OUT, [{ x: bc, y: 900 }, { x: bc + 1200, y: 900 }]), poly(OUT, [{ x: bc, y: 900 + hb }, { x: bc + 1200, y: 900 + hb }]));
  for (const x of [p.cover + p.tie, bc - p.cover - p.tie]) out.push(poly(BAR, [{ x, y: 0 }, { x, y: 2400 }]));
  for (let y = 100; y < 2400; y += y > 750 && y < 1650 ? 100 : 150) out.push(poly(TIE, [{ x: p.cover, y }, { x: bc - p.cover, y }]));
  out.push(text({ x: bc + 5 * 20, y: 900 + hb / 2 }, tr('plan.detail.jointNote')));
  out.push(text({ x: bc + 5 * 20, y: 900 + hb / 2 - 5 * 20 }, tr('plan.detail.jointRef'), 2));
  return drawing('detail-joint', tr('plan.detail.joint'), out, 20);
}

/** Text offsets are written as paper millimetres times the detail's scale (1:10 or 1:20). */
/** Every detail, in the order a reader looks for them. */
export function constructionDetails(p: DetailParams, tr: Tr): DrawingInput[] {
  return [hooks(p, tr), closedTie(p, tr), lap(p, tr), starters(p, tr), slabEdge(p, tr), joint(p, tr)];
}
