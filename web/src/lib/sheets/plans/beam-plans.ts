/**
 * What the beam drawings add to each frame line's elevation: the stirrup zones of every span,
 * dimensioned along it («eØ6 c/10» over the support length, «eØ6 c/20» over the rest), and the
 * bar breakdown of the line, every mark with its bent shape, count, diameter and cutting length.
 */
import type { DrawingInput } from '../compose';
import type { Primitive } from '../primitives';
import { shapeFigure } from './bending-schedule';
import type { Tr } from './details';

export interface StirrupSpan { name: string; length: number; support?: { diameter: number; spacing: number; length: number }; span?: { diameter: number; spacing: number } }
export interface BreakdownMark { mark: string; count: number; diameter: number; cut: number; shape?: { points: Array<{ x: number; y: number }>; legs: Array<{ lengthM: number; at: { x: number; y: number }; horizontal: boolean }>; extent: { min: { x: number; y: number }; max: { x: number; y: number } } } }

const k = 1000, cm = (v: number) => String(Math.round(v * 100));

/** The spans of one line laid end to end at 1:50, each with its stirrup zones dimensioned. */
export function stirrupZones(line: string, spans: readonly StirrupSpan[], tr: Tr): DrawingInput | null {
  const withZones = spans.filter((s) => s.support || s.span);
  if (withZones.length === 0) return null;
  const out: Primitive[] = [];
  let x = 0;
  const H = 500;
  for (const s of spans) {
    const L = s.length * k;
    out.push({ kind: 'polyline', layer: 'RC-OUTLINE', closed: true, points: [{ x, y: 0 }, { x: x + L, y: 0 }, { x: x + L, y: H }, { x, y: H }] });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: x + L / 2, y: H + 250 }, text: s.name, height: 2.5, align: 'center' });
    const sup = s.support, mid = s.span;
    const lz = sup ? Math.min(sup.length * k, L / 2) : 0;
    const zones: Array<[number, number, { diameter: number; spacing: number } | undefined]> = sup
      ? [[x, x + lz, sup], [x + lz, x + L - lz, mid], [x + L - lz, x + L, sup]]
      : [[x, x + L, mid]];
    for (const [a, b, z] of zones) {
      if (!z || b - a < 1) continue;
      // Ticks at the stirrups, to scale.
      for (let p = a + (z.spacing * k) / 2; p < b; p += z.spacing * k) out.push({ kind: 'line', layer: 'RC-STIRRUP', a: { x: p, y: 40 }, b: { x: p, y: H - 40 } });
      out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: a, y: 0 }, b: { x: b, y: 0 }, offset: -8, text: `${cm((b - a) / k)}` });
      out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: (a + b) / 2, y: -800 }, text: `eØ${z.diameter} c/${cm(z.spacing)}`, height: 2.2, align: 'center' });
    }
    x += L + 300;
  }
  return { key: `stirrups-${line}`, title: tr('plan.beam.stirrups', { line }), primitives: out, width: x, height: H + 1600, origin: { x: 0, y: -1100 }, scale: 50 };
}

/** The line's marks one under another: shape, then «B3 — 2Ø16 — L 5,40». Paper millimetres. */
export function barBreakdown(line: string, marks: readonly BreakdownMark[], tr: Tr, fmt: (v: number, d: number) => string): DrawingInput | null {
  if (marks.length === 0) return null;
  const out: Primitive[] = [], rowH = 16;
  marks.forEach((m, i) => {
    const y = (marks.length - 1 - i) * rowH;
    if (m.shape) {
      // shapeFigure draws in a 60 × 30 box; halved here for the row.
      const fig = shapeFigure(m.shape.points, m.shape.legs, m.shape.extent).map((p) => scaleHalf(p, { x: 0, y: y + 2 }));
      out.push(...fig);
    } else out.push({ kind: 'line', layer: 'RC-BAR', a: { x: 0, y: y + 6 }, b: { x: 30, y: y + 6 } });
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: 38, y: y + 5 }, text: `${m.mark} — ${m.count}Ø${m.diameter} — L ${fmt(m.cut, 2)} m`, height: 2.5 });
  });
  return { key: `breakdown-${line}`, title: tr('plan.beam.breakdown', { line }), primitives: out, width: 110, height: marks.length * rowH, origin: { x: 0, y: 0 }, paper: true };
}

function scaleHalf(p: Primitive, o: { x: number; y: number }): Primitive {
  const f = (q: { x: number; y: number }) => ({ x: o.x + q.x / 2, y: o.y + q.y / 2 });
  switch (p.kind) {
    case 'polyline': return { ...p, points: p.points.map(f) };
    case 'line': return { ...p, a: f(p.a), b: f(p.b) };
    case 'text': return { ...p, at: f(p.at), height: Math.min(p.height, 1.8) };
    case 'circle': case 'arc': return { ...p, c: f(p.c), r: p.r / 2 };
    case 'dimension': return { ...p, a: f(p.a), b: f(p.b) };
  }
}
