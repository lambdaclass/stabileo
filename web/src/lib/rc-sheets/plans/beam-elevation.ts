/**
 * A beam line's drawings to scale, from its layout (`LineLayout`) and nothing recomputed: the
 * elevation with its supports, axes, every stirrup, the bars with their hooks and marks, the cuts,
 * the stirrup zones dimensioned and the spans dimensioned between axes; under it each bar drawn
 * apart and set out from the axes; its sections; and its bar schedule. An elevation longer than
 * the sheet holds at its scale is cut at support axes into pieces drawn one after another.
 *
 * Model millimetres: x along the line from the first axis, y up from the top of the beam.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { P, Primitive } from '../../sheets/primitives';
import type { LineBar, LineLayout } from '../beam-line';
import type { BeamRow } from '../beam-row';
import { stirrupsLabel } from '../bars';
import { barTrace, hookTurn, lineSections, lineSupports, markPlaces, placeLabels, setOut, spanIndexAt, stirrupPositions } from '../line-geometry';
import { SCALES } from '../../sheets/formats';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { bands, clipToBand } from './clip';
import { EJES, HORM, TEXTO, arm, bubble, cm, dim, framed, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';
import { sectionPrimitives } from './section';
import { scheduleTables } from './schedule-table';

const K = 1000;
/** How far the columns stand above and, at least, below the beam, mm. */
const STUB = 250, STUB_UP = 150;
/** Paper mm: a mark's centre in from the stirrup, a leg's dimension off its bar. */
const MARK_IN = 5.5, LEG_DIM = 3, DIM_TEXT = 2.5;

export interface BeamPlanOptions extends PlanCtx {
  code: SheetCode;
  /** The widest elevation the sheet takes, paper mm. */
  maxWidth: number;
  group: string;
}

const barLayer = (b: Pick<LineBar, 'kind' | 'face'>): ArmLayer => (b.kind === 'bent' ? 'LEV' : b.face === 'top' ? 'SUP' : 'INF');

/** The stirrup diameter of a span, mm. */
const stirrupDiaOf = (line: LineLayout, k: number) => line.zones.find((z) => z.span === k)?.stirrups.dia ?? line.adopted.stirrups?.[k]?.dia ?? 8;

/** A straight bar's centreline in the elevation: its pieces span by span at their faces, joined, with its hooks as its shape turns them. */
export function barPolyline(line: LineLayout, bar: LineBar, offset: number): P[] {
  const hMax = Math.max(...line.spans.map((s) => s.h));
  if (bar.kind === 'bent') return bar.shape.pts.map(([x, y]) => pt(x * K, (y - hMax) * K));
  const pts: P[] = [];
  const yOf = (k: number) => {
    const s = line.spans[k]!, inner = line.cover * K + stirrupDiaOf(line, k) + bar.bars.dia / 2 + offset;
    return bar.face === 'top' ? -inner : -s.h * K + inner;
  };
  for (const g of barTrace(line, bar)) {
    const y = yOf(g.span);
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.y - y) > 1e-6) pts.push(pt(g.from * K, y));
    if (!last) pts.push(pt(g.from * K, y));
    pts.push(pt(g.to * K, y));
  }
  if (!pts.length) return pts;
  if (bar.hooks[0]) pts.unshift(pt(pts[0]!.x, pts[0]!.y + hookTurn(bar, 0) * K));
  if (bar.hooks[1]) { const e = pts[pts.length - 1]!; pts.push(pt(e.x, e.y + hookTurn(bar, 1) * K)); }
  return pts;
}

/** How far the columns stand below the beam, mm: deep enough for every hook turned down into them. */
const stubBelow = (line: LineLayout) => Math.max(STUB, ...line.bars.flatMap((b) => [-hookTurn(b, 0), -hookTurn(b, 1)]).map((d) => d * K + 30));

/** The elevation itself, whole: concrete, stirrups, bars, cuts, splices, zones and the dimensions between axes, in centimetres. The marks go on by band. */
function elevation(line: LineLayout, cuts: Array<{ x: number; label: string }>, c: PlanCtx, whole: boolean): { ps: Primitive[]; below: number } {
  const s = c.scale, hMax = Math.max(...line.spans.map((x) => x.h)) * K, ps: Primitive[] = [];
  const supports = lineSupports(line).map((x) => x * K);
  const stub = stubBelow(line);
  supports.forEach((xs, j) => {
    const w = (line.supportWidths[j] ?? 0) * K;
    if (w <= 0) return;
    ps.push(rect(HORM, xs - w / 2, 0, xs + w / 2, STUB_UP), rect(HORM, xs - w / 2, -hMax - stub, xs + w / 2, -hMax));
  });
  const names = line.spans.map((sp) => `${sp.name} · ${cm(c.fmt, sp.b)}×${cm(c.fmt, sp.h)}`);
  const nameAt = placeLabels(line.spans.map((sp) => ((sp.x0 + sp.x1) / 2) * K), 0, cuts.map((x) => x.x * K), (Math.max(...names.map((n) => n.length)) * 0.75 + 4) * s);
  line.spans.forEach((sp, k) => {
    ps.push(rect(HORM, sp.x0 * K, -sp.h * K, sp.x1 * K, 0));
    ps.push(label(pt(nameAt[k]!, 2 * s), names[k]!, 2.5, 'center'));
  });
  for (const p of stirrupPositions(line)) {
    const sp = line.spans[p.span]!, z = line.zones[p.zone]!, d = z.stirrups.dia, cov = line.cover * K + d / 2;
    ps.push(seg(arm('EST', d), pt(p.x * K, -cov), pt(p.x * K, -sp.h * K + cov), d));
  }
  for (const bar of line.bars) {
    const pts = barPolyline(line, bar, bar.kind === 'continuous' || bar.kind === 'bent' ? 0 : 0.8 * s);
    if (pts.length >= 2) ps.push({ kind: 'polyline', layer: arm(barLayer(bar), bar.bars.dia), points: pts, dia: bar.bars.dia });
  }
  for (const cut of cuts) {
    const x = cut.x * K;
    for (const [y0, y1, ty] of [[3 * s, 9 * s, 9.5 * s], [-hMax - 3 * s, -hMax - 9 * s, -hMax - 12.5 * s]] as const) {
      ps.push(seg(TEXTO, pt(x, y0), pt(x, y1)), label(pt(x + 1.2 * s, ty), cut.label, 2.5));
    }
  }
  for (const sp of line.splices) {
    const k = line.spans.findIndex((x) => sp.x >= x.x0 - 1e-9 && sp.x <= x.x1 + 1e-9);
    const h = (line.spans[Math.max(0, k)]?.h ?? hMax / K) * K, y = sp.face === 'top' ? -line.cover * K - 2.5 * s : -h + line.cover * K + 1.5 * s;
    ps.push(label(pt(sp.x * K, y), `${c.tr('rcSheets.line.splice')} ${cm(c.fmt, sp.length)}`, 2, 'center'));
  }
  const yZone = -hMax, below0 = Math.max(stub / s, 14) + 3;
  const spanDims = supports.slice(1).map((x, j) => [supports[j]!, x] as const);
  const same = (a: number, b: number) => Math.abs(a - b) < 10;
  for (const z of line.zones) {
    if (z.to - z.from < 1e-6) continue;
    if (!spanDims.some(([a, b]) => same(a, z.from * K) && same(b, z.to * K))) ps.push(dim(pt(z.from * K, yZone), pt(z.to * K, yZone), -below0, cm(c.fmt, z.to - z.from)));
    ps.push(label(pt(((z.from + z.to) / 2) * K, yZone - (below0 + 4.5) * s), stirrupsLabel(z.stirrups), 2.2, 'center'));
  }
  const chain = below0 + 9;
  for (const [a, b] of spanDims) ps.push(dim(pt(a, yZone), pt(b, yZone), -chain, cm(c.fmt, (b - a) / K)));
  const total = whole && supports.length > 2;
  if (total) ps.push(dim(pt(supports[0]!, yZone), pt(supports[supports.length - 1]!, yZone), -(chain + 7), cm(c.fmt, line.length)));
  return { ps, below: hMax + (chain + (total ? 11 : 4)) * s };
}

/** The marks of the bars that show within [x0, x1], mm: each over its longest piece there, inside the beam beside its own bar, kept off the other marks of its face. */
function elevationMarks(line: LineLayout, x0: number, x1: number, s: number): Primitive[] {
  const along = markPlaces(line, (6 * s) / K, { window: [x0 / K, x1 / K] });
  return line.bars.flatMap((bar) => {
    const x = along.get(bar.mark);
    if (x === undefined) return [];
    const k = spanIndexAt(line, x), sp = line.spans[k]!, inner = (line.cover * K + stirrupDiaOf(line, k)) + MARK_IN * s;
    return bubble(pt(x * K, bar.face === 'top' ? -inner : -sp.h * K + inner), bar.mark, s);
  });
}

/** A polyline without the points where it runs straight on. */
function straightLegs(pts: readonly P[]): P[] {
  const out: P[] = [];
  for (const q of pts) {
    const a = out[out.length - 2], b = out[out.length - 1];
    if (b && Math.hypot(q.x - b.x, q.y - b.y) < 1e-6) continue;
    if (a && b && Math.abs((b.x - a.x) * (q.y - b.y) - (b.y - a.y) * (q.x - b.x)) < 1e-6 * Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(q.x - b.x, q.y - b.y) + 1e-9) out[out.length - 1] = q;
    else out.push(q);
  }
  return out;
}

/** A dimension of a→b at least `off` paper mm off it towards `out`, its text clear of both the bar and its own line. */
function outerDim(a: P, b: P, out: P, off: number, text: string): Primitive {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  const along = Math.abs(b.y - a.y) < 1e-9 ? 0 : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const readable = ((x: number) => (x > 90 ? x - 180 : x <= -90 ? x + 180 : x))(along) * (Math.PI / 180);
  const up = { x: -Math.sin(readable), y: Math.cos(readable) };
  const textOut = n.x * out.x + n.y * out.y >= 0 ? n.x * up.x + n.y * up.y >= 0 : -(n.x * up.x + n.y * up.y) >= 0;
  const [p, q] = n.x * out.x + n.y * out.y >= 0 ? [a, b] : [b, a];
  return textOut ? dim(p, q, off, text) : dim(q, p, -(off + 1.6 * DIM_TEXT), text);
}

/** Each straight leg of a drawn bar dimensioned in centimetres, on the side away from the rest of the bar (under a straight one). */
function legDims(pts: readonly P[], c: PlanCtx): { ps: Primitive[]; above: boolean; below: boolean } {
  const legs = straightLegs(pts);
  const cx = legs.reduce((a, q) => a + q.x, 0) / legs.length, cy = legs.reduce((a, q) => a + q.y, 0) / legs.length;
  const ps: Primitive[] = [];
  let above = false, below = false;
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!, b = legs[i]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 5) continue;
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }, side = n.x * ((a.x + b.x) / 2 - cx) + n.y * ((a.y + b.y) / 2 - cy);
    const out = Math.abs(side) < 1e-6 ? { x: 0, y: -1 } : { x: n.x * Math.sign(side), y: n.y * Math.sign(side) };
    if (Math.abs(b.y - a.y) < 1e-6) { if (out.y > 0) above = true; else below = true; }
    ps.push(outerDim(a, b, out, LEG_DIM, cm(c.fmt, L / K)));
  }
  return { ps, above, below };
}

/** Each bar drawn apart, top down from `top`, within [x0, x1]: its shape, its mark, count, diameter and cut length, every leg dimensioned, and an extra bar's ends set out from the axes. */
function breakdown(line: LineLayout, top: number, x0: number, x1: number, c: PlanCtx): { ps: Primitive[]; bottom: number } {
  const s = c.scale, ps: Primitive[] = [];
  let y = top;
  for (const bar of line.bars) {
    if (bar.to * K < x0 - 1e-6 || bar.from * K > x1 + 1e-6) continue;
    const raw = barPolyline(line, bar, 0), ys = raw.map((q) => q.y);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const legs0 = legDims(raw, c), so = setOut(line, bar);
    const head = (legs0.above ? LEG_DIM + 4 : 1) + 5, foot = (legs0.below ? LEG_DIM + 4 : 1) + (so ? LEG_DIM + 5 : 0);
    y -= head * s;
    const shift = y - hi;
    const pts = raw.map((q) => pt(q.x, q.y + shift)), crown = y;
    ps.push({ kind: 'polyline', layer: arm(barLayer(bar), bar.bars.dia), points: pts, dia: bar.bars.dia });
    ps.push(...legDims(pts, c).ps);
    const start = Math.max(x0, bar.from * K);
    ps.push(...bubble(pt(start + 3 * s, crown + (head - 2.5) * s), bar.mark, s));
    ps.push(label(pt(start + 7 * s, crown + (head - 3.5) * s), `${bar.bars.count}Ø${bar.bars.dia} L=${c.fmt(bar.length, 2)}`, 2.5));
    const run = (bar.face === 'top' && bar.kind !== 'bent' ? hi : lo) + shift;
    y = lo + shift;
    if (so) {
      const at = run - (legs0.below ? LEG_DIM + 4 : 0) * s;
      for (const [a, b] of [[so.axes[0], bar.from], [bar.to, so.axes[1]]] as const) if (Math.abs(b - a) > 0.005) ps.push(outerDim(pt(Math.min(a, b) * K, at), pt(Math.max(a, b) * K, at), pt(0, -1), LEG_DIM, cm(c.fmt, Math.abs(b - a))));
    }
    y -= foot * s;
  }
  return { ps: clipToBand(ps, x0, x1), bottom: y - 4 * s };
}

function zigzag(x: number, y0: number, y1: number, s: number): Primitive {
  const m = (y0 + y1) / 2, a = 1.5 * s;
  return { kind: 'polyline', layer: HORM, points: [pt(x, y0 + 3 * s), pt(x, m + a), pt(x - a, m + a / 2), pt(x + a, m - a / 2), pt(x, m - a), pt(x, y1 - 3 * s)] };
}

export function beamScheduleRows(line: LineLayout, code: SheetCode): ScheduleRow[] {
  return scheduleOf(scheduleElements({ line: [line], column: [], slab: [], wall: [] }, { code, slabCover: 0.02 }), { code, scope: 'element' }).rows;
}

export function beamPlans(line: LineLayout, spans: readonly BeamRow[], o: BeamPlanOptions): DrawingInput[] {
  const s = o.scale;
  const sections = lineSections(line, spans, o.fmt, true);
  const cuts = sections.flatMap((g) => g.at.map((x) => ({ x, label: g.label })));
  const supports = lineSupports(line).map((x) => x * K);
  const half = Math.max(...line.supportWidths.map((w) => w * K / 2), 0);
  const from = Math.min(line.ends.from * K, -half) - 10 * s, to = Math.max(line.ends.to * K, line.length * K + half) + 10 * s;
  const room = Math.max(50, o.maxWidth - 20);
  const windows = bands(from, to, room * s, supports.slice(1, -1));
  const { ps, below } = elevation(line, cuts, o, windows.length === 1);
  const hMax = Math.max(...line.spans.map((x) => x.h)) * K;
  const axes = (a: number, b: number, y0: number, y1: number, sc: number) => supports.flatMap((xs, j) => (xs < a - 1e-6 || xs > b + 1e-6 ? [] : [seg(EJES, pt(xs, y0), pt(xs, y1)), ...bubble(pt(xs, y0 + 3 * sc), String(j + 1), sc)]));
  const out: DrawingInput[] = [];
  const whole = windows.length === 1;
  windows.forEach(([a, b], i) => {
    const body = [...clipToBand(ps, a, b), ...elevationMarks(line, a, b, s)];
    if (i > 0) body.push(zigzag(a + 2 * s, 0, -hMax, s));
    if (i < windows.length - 1) body.push(zigzag(b - 2 * s, 0, -hMax, s));
    if (whole) {
      const bd = breakdown(line, -below - 4 * s, a, b, o);
      body.push(...bd.ps, ...axes(a, b, STUB_UP + 5 * s, bd.bottom, s));
      out.push(framed(`${line.key}:elev`, o.tr('rcSheets.plans.beamElevationBars', { name: line.name }), body, s, o.group, 3));
      return;
    }
    body.push(...axes(a, b, STUB_UP + 5 * s, -below + 4 * s, s));
    out.push(framed(`${line.key}:elev-${i + 1}`, `${o.tr('rcSheets.plans.beamElevation', { name: line.name })} (${i + 1}/${windows.length})`, body, s, o.group, 2));
  });
  for (const g of sections) {
    const notes = g.notes.map((n) => n.replace(/^↑ /, `${o.tr('rcSheets.col.top')}: `).replace(/^↓ /, `${o.tr('rcSheets.col.bottom')}: `));
    const ps2 = sectionPrimitives(g.drawing, o, g.marks, [g.tags.length <= 2 ? g.tags.join(', ') : `${g.tags[0]} … (${g.tags.length})`, ...notes]);
    out.push(framed(`${line.key}:sec-${g.label}`, o.tr('rcSheets.plans.section', { n: g.label }), ps2, s, o.group));
  }
  if (!whole) {
    const sb = SCALES.find((x) => x >= s && (to - from) / x <= room) ?? s;
    const bd = breakdown(line, 0, from, to, { ...o, scale: sb });
    out.push(framed(`${line.key}:bars`, o.tr('rcSheets.plans.beamBars', { name: line.name }), [...bd.ps, ...axes(from, to, 6 * sb, bd.bottom, sb)], sb, o.group));
  }
  const marks = new Map(line.bars.map((b) => [b.mark, b]));
  const layerOf = (r: ScheduleRow): ArmLayer => (r.kind === 'stirrup' || r.kind === 'stirrupTie' || r.kind === 'hanger' ? 'EST' : marks.get(r.mark) ? barLayer(marks.get(r.mark)!) : 'INF');
  out.push(...scheduleTables(line.key, o.tr('rcSheets.plans.schedule', { name: line.name }), beamScheduleRows(line, o.code), layerOf, o, o.group));
  return out;
}
