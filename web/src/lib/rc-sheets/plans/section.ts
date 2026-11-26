/**
 * A rectangular section to scale from the drawing the workspace shows (`SectionDrawing`): the
 * concrete, the hoop at the cover, the inner legs and ties, every bar at its diameter, width and
 * depth dimensioned, the marks beside each face and the bars written under it. A beam's slabs are
 * drawn beside it, seen from the line's start (its left side on the left): cut and hatched at the
 * level they stand, broken off, their thickness dimensioned and, where they are not cast with the
 * beam's top, how far below or above it. Model mm from the section's lower left corner.
 */
import type { Primitive } from '../../sheets/primitives';
import type { SectionDrawing } from '../drawing';
import { HORM, TEXTO, arm, breakLine, cm, dim, hatch, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';

const K = 1000;

export function sectionPrimitives(d: SectionDrawing, c: PlanCtx, marks?: { top: string[]; bottom: string[] }, notes: readonly string[] = [], barLayer: (y: number) => ArmLayer = (y) => (y > d.h / 2 ? 'SUP' : 'INF'), slabs: ReadonlyArray<{ side: 1 | -1; hf: number; top: number }> = []): Primitive[] {
  const s = c.scale, b = d.b * K, h = d.h * K, inset = d.cover * K + d.tieDia / 2;
  const est = arm('EST', d.tieDia);
  const poly = (pts: ReadonlyArray<[number, number]>): Primitive => ({ kind: 'polyline', layer: est, points: pts.map(([x, y]) => pt(x * K, y * K)), dia: d.tieDia });
  const ps: Primitive[] = [rect(HORM, 0, 0, b, h), d.hoop ? poly(d.hoop.pts) : rect(est, inset, inset, b - inset, h - inset, d.tieDia)];
  for (const t of d.ties) ps.push(seg(est, pt(t.x1 * K, t.y1 * K), pt(t.x2 * K, t.y2 * K), d.tieDia));
  for (const t of d.crossties ?? []) {
    ps.push(poly(t.pts));
    if (t.mark) { const [mx, my] = t.across === 'h' ? [t.leg[0][0], (t.leg[0][1] + t.leg[1][1]) / 2] : [(t.leg[0][0] + t.leg[1][0]) / 2, t.leg[0][1]]; ps.push(label(pt(mx * K + 1.2 * s, my * K + 1.2 * s), t.mark, 2.2)); }
  }
  if (d.hoop) {
    ps.push(dim(pt(inset, h - inset), pt(b - inset, h - inset), 5 + inset / s, cm(c.fmt, d.hoop.w)), dim(pt(b - inset, inset), pt(b - inset, h - inset), -(5 + inset / s), cm(c.fmt, d.hoop.h)));
    if (d.hoop.mark) ps.push(label(pt(0, h + 9 * s), `${d.hoop.mark} Ø${d.tieDia} ${cm(c.fmt, d.hoop.w)}×${cm(c.fmt, d.hoop.h)}`, 2.5));
  }
  for (const bar of d.bars) ps.push({ kind: 'circle', layer: arm(barLayer(bar.y), bar.dia), c: pt(bar.x * K, bar.y * K), r: bar.dia / 2, fill: true, dia: bar.dia });
  const left = slabs.find((x) => x.side === 1), right = slabs.find((x) => x.side === -1);
  const own = (x: { side: 1 | -1 }) => (d.flange ? (x.side === 1 ? d.flange.left : d.flange.right) * K : 0);
  const reach = (x: { side: 1 | -1; hf: number } | undefined) => (x ? own(x) || Math.min(Math.max(b, 2 * x.hf * K), 2.5 * b) : 0);
  if (d.flange) ps.push(dim(pt(-d.flange.left * K, h), pt(b + d.flange.right * K, h), 6, `be = ${cm(c.fmt, d.flange.bf)}`));
  if (d.flange && !slabs.length) ps.push(rect(HORM, -d.flange.left * K, h - d.flange.hf * K, b + d.flange.right * K, h));
  for (const sl of slabs) {
    const L = reach(sl), yt = h + sl.top * K, yb = yt - sl.hf * K, x0 = sl.side === 1 ? -L : b, x1 = sl.side === 1 ? 0 : b + L, far = sl.side === 1 ? x0 : x1;
    ps.push(seg(HORM, pt(x0, yt), pt(x1, yt)), seg(HORM, pt(x0, yb), pt(x1, yb)), ...hatch(x0, yb, x1, yt, 2 * s), breakLine(far, yb, yt, s));
    ps.push(dim(pt(far, yb), pt(far, yt), sl.side === 1 ? 4 : -4, cm(c.fmt, sl.hf)));
    if (Math.abs(sl.top) > 1e-4) { const face = sl.side === 1 ? 0 : b; ps.push(dim(pt(face, Math.min(h, yt)), pt(face, Math.max(h, yt)), sl.side === 1 ? -3 : 3, `${sl.top < 0 ? '−' : '+'}${cm(c.fmt, Math.abs(sl.top))}`)); }
  }
  ps.push(dim(pt(0, 0), pt(b, 0), -5, cm(c.fmt, d.b)));
  if (!left) ps.push(dim(pt(0, 0), pt(0, h), 5, cm(c.fmt, d.h)));
  else if (!right) ps.push(dim(pt(b, 0), pt(b, h), -5, cm(c.fmt, d.h)));
  else ps.push(dim(pt(0, 0), pt(0, h), 5 + reach(left) / s + 8, cm(c.fmt, d.h)));
  if (marks) {
    const faceY = (top: boolean) => {
      const ys = d.bars.filter((x) => (top ? x.y > d.h / 2 : x.y <= d.h / 2)).map((x) => x.y * K);
      return ys.length ? (top ? Math.max(...ys) : Math.min(...ys)) : top ? h : 0;
    };
    for (const [top, list] of [[true, marks.top], [false, marks.bottom]] as const) {
      if (!list.length) continue;
      const y = faceY(top);
      if (right && !left) ps.push(seg(TEXTO, pt(inset, y), pt(-3 * s, y)), label(pt(-4 * s, y - 1 * s), list.join(' '), 2.5, 'right'));
      else { const out = right ? reach(right) + 10 * s : 3 * s; ps.push(seg(TEXTO, pt(b - inset, y), pt(b + out, y)), label(pt(b + out + s, y - 1 * s), list.join(' '), 2.5)); }
    }
  }
  notes.forEach((n, i) => ps.push(label(pt(0, -(12 + i * 4) * s), n, 2.2)));
  return ps;
}
