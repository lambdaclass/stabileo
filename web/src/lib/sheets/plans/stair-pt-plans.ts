/**
 * The drawings of the stairs and of the post-tensioned slabs.
 *
 *  · A stair in section: the landings and the flight with its steps, the supports, the bars along
 *    the soffit with their marks (the bottom bars crossed at the head of the flight), the top bars
 *    over the supports and the distribution bars as dots; and its bar schedule.
 *  · A tendon's profile along its span, with the vertical scale enlarged so the drape reads, and
 *    the height of the chairs at the tenths of the span.
 *  · The tendons of each panel in plan, numbered in the order they are stressed.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, type PlanAxis } from './plan-common';
import { drawTable, type Cell } from './table';
import type { Tr } from './details';
import type { StairBar, StairDesign, StairDesignSpec } from '../../engine/design/slabs/stairs';
import { controlPoints, tendonProfile, type TendonLayout } from '../../engine/design/slabs/post-tensioned';
import { barMass } from '../../codes/cirsoc201/bar-geometry';

const k = 1000;
type Fmt = (v: number, d: number) => string;

/** A stair in section, at 1:25 unless the sheet asks otherwise. */
export function stairSection(key: string, title: string, spec: StairDesignSpec, d: StairDesign, cover: number, tr: Tr, fmt: Fmt, scale = 25): DrawingInput {
  const out: Primitive[] = [], s = scale;
  const Lb = spec.landingBottom * k, Lt = spec.landingTop * k, run = d.geometry.run * k, rise = d.geometry.rise * k;
  const tl = (spec.landingThickness ?? spec.waist) * k, r = spec.riser * k, t = spec.tread * k, n = Math.round(spec.steps);
  const end = Lb + run + Lt;
  // Outline: the top with its steps, then back along the soffit.
  const top: P[] = [{ x: 0, y: tl }, { x: Lb, y: tl }];
  for (let i = 0; i < n; i++) {
    const x = Lb + i * t, y = tl + i * r;
    top.push({ x, y: y + r });
    if (i < n - 1) top.push({ x: x + t, y: y + r });
  }
  top.push({ x: end, y: rise + tl });
  const soffit: P[] = [{ x: end, y: rise }, { x: Lb + run, y: rise }, { x: Lb, y: 0 }, { x: 0, y: 0 }];
  out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: [...top, ...soffit] });
  // Supports under each end.
  for (const x of [0, end]) {
    const y = x === 0 ? 0 : rise;
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: [{ x, y }, { x: x - 2 * s, y: y - 3.5 * s }, { x: x + 2 * s, y: y - 3.5 * s }] });
  }
  // Bars, offset by the cover.
  const c = cover * k, ang = d.geometry.angleRad, sin = Math.sin(ang), cos = Math.cos(ang);
  const along = (p: P, len: number, a: number): P => ({ x: p.x + len * Math.cos(a), y: p.y + len * Math.sin(a) });
  const label = (b: StairBar) => `${b.mark}  ${b.count} Ø${b.diameterMm} @ ${Math.round(b.spacing * 1000)}`;
  const bar = (pts: P[], b: StairBar, at: P) => {
    out.push({ kind: 'polyline', layer: 'RC-BAR', points: pts });
    out.push({ kind: 'text', layer: 'RC-TEXT', at, text: label(b), height: 2.2 });
  };
  const foot: P = { x: Lb + c * Math.tan(ang / 2), y: c };
  for (const b of d.bars) {
    if (b.role === 'bottom') {
      const p0 = Lb > 0 ? { x: c, y: c } : foot;
      const legs = b.legs.map((l) => ({ len: l.length * k, a: (l.angleDeg * Math.PI) / 180 }));
      const pts: P[] = [p0];
      for (const l of legs) pts.push(along(pts[pts.length - 1]!, l.len, l.a));
      bar(pts, b, { x: Lb + run / 3 + 3 * s * sin, y: (run / 3) * Math.tan(ang) - 6 * s * cos });
    } else if (b.role === 'bottomHead') {
      const kink: P = { x: Lb + run + c * Math.tan(ang / 2), y: rise + c };
      const start = along(kink, -b.legs[0]!.length * k, ang);
      bar([start, kink, { x: end - c, y: rise + c }], b, { x: Lb + run + 2 * s, y: rise - 6 * s });
    } else if (b.role === 'top') {
      // Over each support: along the landing, then down or up the flight for what is left.
      const L = b.legs[0]!.length * k, vt = (spec.waist * k) / cos;
      const footPts: P[] = [{ x: c, y: tl - c }];
      if (L <= Lb) footPts.push({ x: L, y: tl - c });
      else { footPts.push({ x: Lb, y: tl - c }); footPts.push(along({ x: Lb, y: vt - c }, L - Lb, ang)); }
      const headPts: P[] = [{ x: end - c, y: rise + tl - c }];
      if (L <= Lt) headPts.push({ x: end - L, y: rise + tl - c });
      else { headPts.push({ x: Lb + run, y: rise + tl - c }); headPts.push(along({ x: Lb + run, y: rise + vt - c }, -(L - Lt), ang)); }
      out.push({ kind: 'polyline', layer: 'RC-BAR', points: footPts });
      out.push({ kind: 'polyline', layer: 'RC-BAR', points: headPts });
      out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: c, y: tl + 3 * s }, text: label(b), height: 2.2 });
    } else {
      // Distribution bars as dots on the bottom bars, every spacing along the developed length.
      const step = b.spacing * k;
      for (let x = c; x < Lb; x += step) out.push({ kind: 'circle', layer: 'RC-BAR', c: { x, y: c + 8 }, r: Math.max(b.diameterMm / 2, 0.3 * s), fill: true });
      for (let q = step / 2; q < d.geometry.slope * k; q += step) { const p = along({ x: Lb, y: c }, q, ang); out.push({ kind: 'circle', layer: 'RC-BAR', c: { x: p.x - 8 * sin, y: p.y + 8 * cos }, r: Math.max(b.diameterMm / 2, 0.3 * s), fill: true }); }
      for (let x = Lb + run + step / 2; x < end - c; x += step) out.push({ kind: 'circle', layer: 'RC-BAR', c: { x, y: rise + c + 8 }, r: Math.max(b.diameterMm / 2, 0.3 * s), fill: true });
      out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: Lb + run / 2, y: rise / 2 - 14 * s }, text: label(b), height: 2.2 });
    }
  }
  // Dimensions: the landings and the run below, the rise at the head.
  const dims: Array<[P, P]> = [];
  if (Lb > 0) dims.push([{ x: 0, y: 0 }, { x: Lb, y: 0 }]);
  dims.push([{ x: Lb, y: 0 }, { x: Lb + run, y: 0 }]);
  if (Lt > 0) dims.push([{ x: Lb + run, y: 0 }, { x: end, y: 0 }]);
  for (const [a, b] of dims) out.push({ kind: 'dimension', layer: 'RC-DIM', a, b, offset: -8, text: fmt((b.x - a.x) / k, 2) });
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: end, y: 0 }, b: { x: end, y: rise }, offset: -10, text: fmt(rise / k, 2) });
  out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: Lb, y: rise + tl + 6 * s }, text: tr('plan.stair.steps', { n, r: Math.round(r), t: Math.round(t), w: Math.round(spec.waist * k) }), height: 2.5 });
  const box = boxOf([{ x: -6 * s, y: -20 * s }, { x: end + 16 * s, y: rise + tl + 12 * s }]);
  return { key, title, primitives: out, width: box.x1 - box.x0, height: box.y1 - box.y0, origin: { x: box.x0, y: box.y0 }, scale: s, group: 'stairs' };
}

/** The bar shape for the schedule: its legs in order, in model millimetres. */
function barFigure(b: StairBar): Primitive[] {
  const pts: P[] = [{ x: 0, y: 0 }];
  for (const l of b.legs) { const a = (l.angleDeg * Math.PI) / 180, p = pts[pts.length - 1]!; pts.push({ x: p.x + l.length * k * Math.cos(a), y: p.y + l.length * k * Math.sin(a) }); }
  return [{ kind: 'polyline', layer: 'RC-BAR', points: pts }];
}

/** The bar schedule of the stairs. */
export function stairSchedule(stairs: ReadonlyArray<{ name: string; bars: readonly StairBar[] }>, tr: Tr, fmt: Fmt): DrawingInput | null {
  const rows: Cell[][] = [];
  let mass = 0;
  for (const st of stairs) for (const b of st.bars) {
    const m = barMass(b.length * b.count, b.diameterMm);
    mass += m;
    rows.push([st.name, b.mark, `Ø${b.diameterMm}`, { figure: barFigure(b), text: b.legs.map((l) => Math.round(l.length * 100)).join(' + ') }, String(b.count), fmt(b.length, 2), fmt(b.length * b.count, 2), fmt(m, 1)]);
  }
  if (!rows.length) return null;
  rows.push([tr('plan.bbs.sum'), '', '', '', '', '', '', fmt(mass, 1)]);
  const t = drawTable({
    columns: [
      { label: tr('plan.stair.name'), width: 30 }, { label: tr('plan.bbs.mark'), width: 14, align: 'center' }, { label: 'Ø', width: 12, align: 'center' },
      { label: tr('plan.bbs.shape'), width: 60, align: 'center' }, { label: tr('plan.bbs.count'), width: 14, align: 'right' },
      { label: tr('plan.bbs.cut'), width: 20, align: 'right' }, { label: tr('plan.bbs.total'), width: 22, align: 'right' }, { label: tr('plan.bbs.mass'), width: 20, align: 'right' },
    ],
    rows, figureHeight: 22,
  });
  return { key: 'stairs-bbs', title: tr('plan.stair.schedule'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true, group: 'stairs' };
}

/** Vertical scale of a tendon profile over the horizontal one. */
export const PROFILE_EXAGGERATION = 5;

/** A tendon's profile along its span, the slab's depth enlarged, the chairs at the tenths. */
export function tendonProfileDrawing(key: string, title: string, h: number, span: number, layout: TendonLayout, tr: Tr, fmt: Fmt, scale = 50): DrawingInput {
  const out: Primitive[] = [], s = scale, e = PROFILE_EXAGGERATION;
  const L = span * k, H = h * k * e;
  out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }] });
  out.push({ kind: 'line', layer: 'FW-AXIS', a: { x: 0, y: H / 2 }, b: { x: L, y: H / 2 }, dash: true });
  const prof = tendonProfile(layout, span);
  const pts: P[] = Array.from({ length: 41 }, (_, i) => ({ x: (L * i) / 40, y: prof.y((span * i) / 40) * k * e }));
  out.push({ kind: 'polyline', layer: 'PT-TENDON', points: pts });
  for (const cp of controlPoints(layout, span)) {
    const x = cp.x * k, y = cp.y * k * e;
    out.push({ kind: 'line', layer: 'PT-CHAIR', a: { x, y: 0 }, b: { x, y } });
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x, y: -5 * s }, text: String(Math.round(cp.y * k)), height: 2.2, align: 'center' });
  }
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: 0, y: 0 }, b: { x: L, y: 0 }, offset: -10, text: fmt(span, 2) });
  out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: 0, y: H + 4 * s }, text: tr('plan.pt.profile', { n: layout.count, e, h: Math.round(h * k), a: Math.round(prof.drape * k) }), height: 2.5 });
  const box = boxOf([{ x: -6 * s, y: -18 * s }, { x: L + 6 * s, y: H + 10 * s }]);
  return { key, title, primitives: out, width: box.x1 - box.x0, height: box.y1 - box.y0, origin: { x: box.x0, y: box.y0 }, scale: s, group: 'tendons' };
}

export interface TendonPanel {
  name: string; box: { x0: number; x1: number; y0: number; y1: number };
  x?: { layout: TendonLayout; order: number[] }; y?: { layout: TendonLayout; order: number[] };
}

/** The tendons in plan: each panel's in x and in y, banded ones half on each edge, numbered in stressing order. */
export function tendonPlan(title: string, panels: readonly TendonPanel[], axes: readonly PlanAxis[], scale: number, tr: Tr): DrawingInput | null {
  if (!panels.length) return null;
  const out: Primitive[] = [], s = scale, pts: P[] = [];
  for (const p of panels) {
    const b = { x0: p.box.x0 * k, x1: p.box.x1 * k, y0: p.box.y0 * k, y1: p.box.y1 * k };
    pts.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 });
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }] });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, text: p.name, height: 3, align: 'center' });
    for (const dir of ['x', 'y'] as const) {
      const t = p[dir];
      if (!t || t.layout.count <= 0) continue;
      const lo = dir === 'x' ? b.y0 : b.x0, hi = dir === 'x' ? b.y1 : b.x1, n = t.layout.count;
      const across = (i: number) => {
        if (!t.layout.banded) return lo + ((i + 0.5) * (hi - lo)) / n;
        // Banded: half the tendons along each edge, 100 mm apart.
        const half = Math.ceil(n / 2);
        return i < half ? lo + 150 + i * 100 : hi - 150 - (i - half) * 100;
      };
      const labelAt = (c: number): P => (dir === 'x' ? { x: b.x0 - 6 * s, y: c - 1 * s } : { x: c - 1 * s, y: b.y0 - 5 * s });
      const bands: number[][] = [[], []];
      for (let i = 0; i < n; i++) {
        const c = across(i), rank = t.order.indexOf(i + 1) + 1;
        const a = dir === 'x' ? { x: b.x0, y: c } : { x: c, y: b.y0 }, z = dir === 'x' ? { x: b.x1, y: c } : { x: c, y: b.y1 };
        out.push({ kind: 'line', layer: 'PT-TENDON', a, b: z });
        if (t.layout.banded) bands[i < Math.ceil(n / 2) ? 0 : 1]!.push(rank);
        else out.push({ kind: 'text', layer: 'RC-TEXT', at: labelAt(c), text: String(rank), height: 1.8 });
      }
      // A band's tendons are too close to number one by one: one label per band, in stressing order.
      if (t.layout.banded) bands.forEach((ranks, side) => {
        if (ranks.length) out.push({ kind: 'text', layer: 'RC-TEXT', at: labelAt(side === 0 ? lo : hi - 3 * s), text: [...ranks].sort((p, q) => p - q).join(', '), height: 1.8 });
      });
    }
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: box.x0, y: box.y0 - 26 * s }, text: tr('plan.pt.order'), height: 2.2 });
  const all = boxOf([...pts, { x: box.x0 - 22 * s, y: box.y0 - 30 * s }, { x: box.x1 + 22 * s, y: box.y1 + 22 * s }]);
  return { key: 'tendons-plan', title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s, group: 'tendons' };
}
