/**
 * The drawings the app already builds (`Sheet` of `drawings.ts`, in model metres) as primitives in
 * model millimetres, ready to be placed on paper at a scale. Text keeps its printed height: a label
 * the drawing made 2,5 mm tall at 1:50 prints 2,5 mm at the scale it is placed at.
 */
import { drawnText, type Sheet } from '../engine/detailing/drawings';
import type { Primitive } from './primitives';

export function drawingPrimitives(sheet: Sheet, locale = 'es'): { primitives: Primitive[]; width: number; height: number; origin: { x: number; y: number } } {
  const k = 1000, base = sheet.title.scale || 50;
  const P = (p: { x: number; y: number }) => ({ x: p.x * k, y: p.y * k });
  const out: Primitive[] = [];
  for (const pl of sheet.polylines) out.push({ kind: 'polyline', layer: pl.layer, points: pl.points.map(P), closed: pl.closed });
  for (const c of sheet.circles) out.push({ kind: 'circle', layer: c.layer, c: P(c.centre), r: c.radius * k });
  // A text's height is model metres at the sheet's own scale: printed millimetres are h·1000/scale.
  for (const t of sheet.texts) out.push({ kind: 'text', layer: t.layer, at: P(t.at), text: drawnText(t, locale), height: Math.max(1.8, (t.height * k) / base) });
  for (const d of sheet.dimensions) {
    out.push({ kind: 'dimension', layer: d.layer, a: P(d.from), b: P(d.to), offset: (d.offset * k) / base, text: d.label, height: 2.5 });
  }
  const { min, max } = sheet.extents;
  return { primitives: out, width: (max.x - min.x) * k, height: (max.y - min.y) * k, origin: P(min) };
}
