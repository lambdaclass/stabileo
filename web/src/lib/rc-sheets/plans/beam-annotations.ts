import type { P, Primitive } from '../../sheets/primitives';
import type { LineBar, LineLayout } from '../beam-line';
import { elevationLayout, textBox, type ElevationLayout, type LDim, type LText, type LTrack } from '../elevation-layout';
import { COTA, HORM, TEXTO, arm, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';

const K = 1000;
export const PLAN_TEXT = 2.5;

const barLayer = (b: Pick<LineBar, 'kind' | 'face'>): ArmLayer => (b.kind === 'bent' ? 'LEV' : b.face === 'top' ? 'SUP' : 'INF');
const ALIGN = { start: 'left', middle: 'center', end: 'right' } as const;

export function planLayout(line: LineLayout, cuts: ReadonlyArray<{ x: number; label: string }>, c: PlanCtx, below: number, above = 0): ElevationLayout {
  return elevationLayout({ line, X: (x) => (x * K) / c.scale, depth: (k) => (line.spans[k]!.h * K) / c.scale, t: PLAN_TEXT, below: below / c.scale, above: above / c.scale, marks: true, fmt: c.fmt, tr: c.tr, cuts });
}

function trackLabel(tr: LTrack, c: PlanCtx, ps: Primitive[], dx = 0): void {
  const s = c.scale, P_ = (x: number, y: number): P => pt((x + dx) * s, -y * s);
  ps.push(label(P_(tr.label.x, tr.label.y), tr.label.text, tr.label.size, ALIGN[tr.label.anchor]));
  if (!tr.bubble) return;
  const h = tr.bubble.mark.length > 2 ? 1.8 : 2.2;
  ps.push({ kind: 'circle', layer: TEXTO, c: P_(tr.bubble.x, tr.bubble.y), r: tr.bubble.r * s }, label(P_(tr.bubble.x, tr.bubble.y + h / 2), tr.bubble.mark, h, 'center'));
}

export function trackLabelsWithin(l: ElevationLayout, c: PlanCtx, x0: number, x1: number): Primitive[] {
  const s = c.scale, ps: Primitive[] = [];
  for (const tr of l.tracks) {
    const lo = tr.bubble ? tr.bubble.x - tr.bubble.r : textBox(tr.label).x0, hi = textBox(tr.label).x1;
    const inBand = (x: number) => x * s >= x0 && x * s <= x1;
    if (inBand(tr.label.x) || (tr.bubble && inBand(tr.bubble.x))) continue;
    const a = Math.max(tr.x0, x0 / s), b = Math.min(tr.x1, x1 / s);
    if (b - a < (hi - lo) * 1.2) continue;
    trackLabel(tr, c, ps, (a + b) / 2 - (lo + hi) / 2);
  }
  return ps;
}

export function annotationPrimitives(l: ElevationLayout, c: PlanCtx): { ps: Primitive[]; top: number; bottom: number } {
  const s = c.scale, ps: Primitive[] = [];
  const P_ = (x: number, y: number): P => pt(x * s, -y * s);
  const text = (q: LText) => {
    if (q.leader) ps.push(seg(TEXTO, P_(q.leader[0], q.leader[1]), P_(q.leader[2], q.leader[3])));
    ps.push(label(P_(q.x, q.y), q.text, q.size, ALIGN[q.anchor]));
  };
  const dimension = (d: LDim) => {
    if (d.text.anchor === 'middle') {
      ps.push({ kind: 'dimension', layer: COTA, a: P_(d.x0, d.from), b: P_(d.x1, d.from), offset: -(d.y - d.from), text: d.text.text, height: d.text.size });
      return;
    }
    ps.push(seg(COTA, P_(d.x0, d.y), P_(d.x1, d.y)), seg(COTA, P_(d.x0, d.from), P_(d.x0, d.y)), seg(COTA, P_(d.x1, d.from), P_(d.x1, d.y)));
    for (const x of [d.x0, d.x1]) ps.push(seg(COTA, P_(x - 0.8, d.y + 0.8), P_(x + 0.8, d.y - 0.8)));
    ps.push(label(P_(d.text.x, d.text.y), d.text.text, d.text.size, ALIGN[d.text.anchor]));
  };
  for (const tr of l.tracks) {
    trackLabel(tr, c, ps);
    const layer = arm(barLayer(tr.bar), tr.bar.bars.dia);
    const pts = tr.shape
      ? tr.shape.map(([x, y]) => P_(x, y))
      : [
        ...(tr.hooks[0] ? [P_(tr.x0 + tr.back[0], tr.y + tr.hooks[0]), P_(tr.x0, tr.y + tr.hooks[0])] : []),
        P_(tr.x0, tr.y), P_(tr.x1, tr.y),
        ...(tr.hooks[1] ? [P_(tr.x1, tr.y + tr.hooks[1]), P_(tr.x1 + tr.back[1], tr.y + tr.hooks[1])] : []),
      ];
    ps.push({ kind: 'polyline', layer, points: pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1]!.x, q.y - pts[i - 1]!.y) > 1e-6), dia: tr.bar.bars.dia });
    tr.dims.forEach(dimension);
    tr.legs.forEach(text);
  }
  for (const p of l.posts) {
    if (p.rect) ps.push(rect(HORM, p.rect.x0 * s, -p.rect.y1 * s, p.rect.x1 * s, -p.rect.y0 * s));
    if (p.name) text(p.name);
    if (p.size) text(p.size);
  }
  for (const cut of l.cuts) {
    ps.push(seg(TEXTO, P_(cut.x, cut.top.y + 0.3), P_(cut.x, cut.bottom.y - cut.bottom.size - 0.3)));
    text(cut.top); text(cut.bottom);
  }
  l.splices.forEach(text);
  l.zoneDims.forEach(dimension);
  l.zones.forEach(text);
  return { ps, top: -l.top * s, bottom: -l.bottom * s };
}
