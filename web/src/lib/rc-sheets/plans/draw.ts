/**
 * What the reinforcement drawings are drawn with: the layers (`ST-ARM-<layer>-Ø<d>` for the bars,
 * `ST-COTA`, `ST-TEXTO`, `ST-HORM`, `ST-EJES`), primitives in model millimetres, and a drawing
 * framed by what it holds. Texts and symbols that print at a fixed paper size are sized through
 * the drawing's scale.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { P, Primitive } from '../../sheets/primitives';
import type { Tr } from '../../sheets/details/def';
import type { Fmt } from '../format';

export type { Tr };

export const COTA = 'ST-COTA', TEXTO = 'ST-TEXTO', HORM = 'ST-HORM', EJES = 'ST-EJES', RAYADO = 'ST-RAYADO';

/** Top and bottom bars, bent-up bars, stirrups and ties, column bars, the four slab layers, a wall's verticals, horizontals and edge bars. */
export type ArmLayer = 'SUP' | 'INF' | 'LEV' | 'EST' | 'LONG' | 'INFX' | 'INFY' | 'SUPX' | 'SUPY' | 'VERT' | 'HOR' | 'BORDE';
export const arm = (layer: ArmLayer, dia: number): string => `ST-ARM-${layer}-Ø${dia}`;

export interface PlanCtx { scale: number; fmt: Fmt; tr: Tr }

export const pt = (x: number, y: number): P => ({ x, y });

export const rect = (layer: string, x0: number, y0: number, x1: number, y1: number, dia?: number): Primitive =>
  ({ kind: 'polyline', layer, closed: true, points: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], ...(dia ? { dia } : {}) });

export const seg = (layer: string, a: P, b: P, dia?: number): Primitive => ({ kind: 'line', layer, a, b, ...(dia ? { dia } : {}) });

export const label = (at: P, s: string, height = 2.5, align: 'left' | 'center' | 'right' = 'left', rotation = 0): Primitive =>
  ({ kind: 'text', layer: TEXTO, at, text: s, height, align, ...(rotation ? { rotation } : {}) });

export const dim = (a: P, b: P, offset: number, s?: string): Primitive => ({ kind: 'dimension', layer: COTA, a, b, offset, ...(s !== undefined ? { text: s } : {}) });

/** A mark in its circle, 5 mm across on paper. */
export function bubble(c: P, mark: string, scale: number): Primitive[] {
  const h = mark.length > 2 ? 1.8 : 2.2;
  return [{ kind: 'circle', layer: TEXTO, c, r: 2.6 * scale }, label(pt(c.x, c.y - (h / 2) * scale), mark, h, 'center')];
}

/** Text at a paper height as it extends in model units. */
function textBox(p: Extract<Primitive, { kind: 'text' }>, scale: number): P[] {
  const w = p.text.length * p.height * 0.6 * scale, h = p.height * scale;
  const dx = p.align === 'center' ? -w / 2 : p.align === 'right' ? -w : 0;
  if (Math.abs(Math.abs(p.rotation ?? 0) - 90) < 1) return [pt(p.at.x - h, p.at.y + dx), pt(p.at.x, p.at.y + dx + w)];
  return [pt(p.at.x + dx, p.at.y), pt(p.at.x + dx + w, p.at.y + h)];
}

export function extent(ps: readonly Primitive[], scale: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (q: P) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); };
  for (const p of ps) {
    if (p.kind === 'line') { add(p.a); add(p.b); }
    else if (p.kind === 'polyline') p.points.forEach(add);
    else if (p.kind === 'circle' || p.kind === 'arc') { add(pt(p.c.x - p.r, p.c.y - p.r)); add(pt(p.c.x + p.r, p.c.y + p.r)); }
    else if (p.kind === 'text') textBox(p, scale).forEach(add);
    else {
      const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y, L = Math.hypot(dx, dy) || 1, o = (p.offset + Math.sign(p.offset || 1) * 4) * scale;
      const n = pt((-dy / L) * o, (dx / L) * o);
      add(p.a); add(p.b); add(pt(p.a.x + n.x, p.a.y + n.y)); add(pt(p.b.x + n.x, p.b.y + n.y));
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

/** A drawing at 1:`scale` framed by what it holds and a margin of `margin` paper mm. */
export function framed(key: string, title: string, primitives: Primitive[], scale: number, group: string, margin = 4): DrawingInput {
  const b = extent(primitives, scale), m = margin * scale;
  return { key, title, primitives, width: b.x1 - b.x0 + 2 * m, height: b.y1 - b.y0 + 2 * m, origin: pt(b.x0 - m, b.y0 - m), scale, group };
}

/** Lines at 45° every `gap` across a rectangle, the hatching of concrete cut. */
export function hatch(x0: number, y0: number, x1: number, y1: number, gap: number): Primitive[] {
  const out: Primitive[] = [];
  for (let c = x0 - (y1 - y0) + gap / 2; c < x1; c += gap) {
    const a = pt(Math.max(x0, c), y0 + Math.max(0, x0 - c)), b = pt(Math.min(x1, c + (y1 - y0)), y0 + Math.min(y1 - y0, x1 - c));
    if (b.x - a.x > 1e-6) out.push(seg(RAYADO, a, b));
  }
  return out;
}

/** A break line across a cut member from `y0` to `y1` at `x`: straight, with a Z at its middle, `s` the drawing's scale. */
export function breakLine(x: number, y0: number, y1: number, s: number): Primitive {
  const m = (y0 + y1) / 2, z = Math.min(1.2 * s, Math.abs(y1 - y0) / 4);
  return { kind: 'polyline', layer: HORM, points: [pt(x, y0 - s), pt(x, m - z), pt(x + z, m - z / 3), pt(x - z, m + z / 3), pt(x, m + z), pt(x, y1 + s)] };
}

/** Centimetres, as the dimensions of a reinforcement drawing read. */
export const cm = (fmt: Fmt, m: number): string => fmt(m * 100, 0);
