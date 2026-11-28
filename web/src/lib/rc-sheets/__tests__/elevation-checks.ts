import type { LineLayout } from '../beam-line';
import { elevationLayout, layoutBoxes, overlaps, type ElevationLayout } from '../elevation-layout';
import { annotationPrimitives, planLayout } from '../plans/beam-annotations';
import { lineSections } from '../line-geometry';
import { scheduleElements } from '../schedule/pieces';
import { dimensionGeometry, type Primitive } from '../../sheets/primitives';
import { makeFmt } from '../format';

export const fmt = makeFmt(',');
export const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k} ${Object.values(p).join(' ')}` : k);

const cutsOf = (line: LineLayout) => lineSections(line, [], fmt, true).flatMap((g) => g.at.map((x) => ({ x, label: g.label })));

export function screenLayout(line: LineLayout, zeros = true): ElevationLayout {
  const x0 = Math.min(0, line.ends.from), x1 = Math.max(line.length, line.ends.to), sx = 1088 / Math.max(x1 - x0, 1e-6);
  const hMax = Math.max(...line.spans.map((s) => s.h));
  return elevationLayout({ line, X: (x) => 56 + (x - x0) * sx, depth: (k) => (line.spans[k]!.h * 84) / hMax, t: 9.5, below: 10, marks: true, fmt, tr, cuts: cutsOf(line), zeros });
}

export function overlapping(l: ElevationLayout): string[] {
  const all = layoutBoxes(l), out: string[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlaps(all[i]!.box, all[j]!.box, -1e-6)) out.push(`${all[i]!.what} × ${all[j]!.what}`);
  return out;
}

export function planOverlapping(line: LineLayout, scale: number): { count: number; pairs: string[] } {
  const c = { scale, fmt, tr };
  const ps = annotationPrimitives(planLayout(line, cutsOf(line), c, 150), c).ps;
  const boxes = ps.flatMap((p: Primitive) => {
    if (p.kind === 'text') {
      const w = p.text.length * p.height * 0.6, x = p.at.x / scale, dx = p.align === 'center' ? -w / 2 : p.align === 'right' ? -w : 0;
      return [{ what: p.text, box: { x0: x + dx, x1: x + dx + w, y0: p.at.y / scale, y1: p.at.y / scale + p.height } }];
    }
    if (p.kind === 'dimension') {
      const paper = { ...p, a: { x: p.a.x / scale, y: p.a.y / scale }, b: { x: p.b.x / scale, y: p.b.y / scale } };
      const g = dimensionGeometry(paper), h = p.height ?? 2.5, w = (p.text ?? '').length * h * 0.6;
      return [{ what: `dim ${p.text}`, box: { x0: g.textAt.x - w / 2, x1: g.textAt.x + w / 2, y0: g.textAt.y, y1: g.textAt.y + h } }];
    }
    return [];
  });
  const pairs: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i]!.box, boxes[j]!.box, -1e-6)) pairs.push(`${boxes[i]!.what} × ${boxes[j]!.what}`);
  return { count: boxes.length, pairs };
}

export function zoneCounts(line: LineLayout): { labels: number[]; schedule: number[] } {
  const labels = screenLayout(line, false).zones.map((z) => Number(z.text.split(' ')[0]));
  const schedule = scheduleElements({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 })[0]!.pieces.filter((p) => p.kind === 'stirrup').map((p) => p.count);
  return { labels: labels.filter((n) => n > 0), schedule };
}
