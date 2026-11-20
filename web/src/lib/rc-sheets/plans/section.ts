/**
 * A rectangular section to scale from the drawing the workspace shows (`SectionDrawing`): the
 * concrete, the hoop at the cover, the inner legs and ties, every bar at its diameter, width and
 * depth dimensioned, the marks beside each face and the bars written under it. Model mm from the
 * section's lower left corner.
 */
import type { Primitive } from '../../sheets/primitives';
import type { SectionDrawing } from '../drawing';
import { HORM, TEXTO, arm, cm, dim, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';

const K = 1000;

export function sectionPrimitives(d: SectionDrawing, c: PlanCtx, marks?: { top: string[]; bottom: string[] }, notes: readonly string[] = [], barLayer: (y: number) => ArmLayer = (y) => (y > d.h / 2 ? 'SUP' : 'INF')): Primitive[] {
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
  ps.push(dim(pt(0, 0), pt(b, 0), -5, cm(c.fmt, d.b)), dim(pt(0, 0), pt(0, h), 5, cm(c.fmt, d.h)));
  if (marks) {
    const faceY = (top: boolean) => {
      const ys = d.bars.filter((x) => (top ? x.y > d.h / 2 : x.y <= d.h / 2)).map((x) => x.y * K);
      return ys.length ? (top ? Math.max(...ys) : Math.min(...ys)) : top ? h : 0;
    };
    for (const [top, list] of [[true, marks.top], [false, marks.bottom]] as const) {
      if (!list.length) continue;
      const y = faceY(top);
      ps.push(seg(TEXTO, pt(b - inset, y), pt(b + 3 * s, y)), label(pt(b + 4 * s, y - 1 * s), list.join(' '), 2.5));
    }
  }
  notes.forEach((n, i) => ps.push(label(pt(0, -(12 + i * 4) * s), n, 2.2)));
  return ps;
}
