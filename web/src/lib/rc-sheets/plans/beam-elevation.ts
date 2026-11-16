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
import { barTrace, hookTurn, lineSections, lineSupports, markPlaces, setOut, stirrupPositions } from '../line-geometry';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { bands, clipToBand } from './clip';
import { EJES, HORM, TEXTO, arm, bubble, cm, dim, framed, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';
import { sectionPrimitives } from './section';
import { scheduleTables } from './schedule-table';

const K = 1000;
/** How far the columns stand above and, at least, below the beam, mm. */
const STUB = 250;

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
const stubBelow = (line: LineLayout) => Math.max(STUB, ...line.bars.flatMap((b) => [-hookTurn(b, 0), -hookTurn(b, 1)]).map((d) => d * K + 50));

/** The elevation itself, whole: concrete, stirrups, bars, marks, cuts, splices, zones and the dimensions between axes. */
function elevation(line: LineLayout, cuts: Array<{ x: number; label: string }>, c: PlanCtx): { ps: Primitive[]; below: number } {
  const s = c.scale, hMax = Math.max(...line.spans.map((x) => x.h)) * K, ps: Primitive[] = [];
  const supports = lineSupports(line).map((x) => x * K);
  const stub = stubBelow(line);
  supports.forEach((xs, j) => {
    const w = (line.supportWidths[j] ?? 0) * K;
    if (w <= 0) return;
    ps.push(rect(HORM, xs - w / 2, 0, xs + w / 2, STUB), rect(HORM, xs - w / 2, -hMax - stub, xs + w / 2, -hMax));
  });
  line.spans.forEach((sp) => {
    ps.push(rect(HORM, sp.x0 * K, -sp.h * K, sp.x1 * K, 0));
    ps.push(label(pt(((sp.x0 + sp.x1) / 2) * K, 2 * s), `${sp.name} · ${cm(c.fmt, sp.b)}×${cm(c.fmt, sp.h)}`, 2.5, 'center'));
  });
  for (const p of stirrupPositions(line)) {
    const sp = line.spans[p.span]!, z = line.zones[p.zone]!, d = z.stirrups.dia, cov = line.cover * K + d / 2;
    ps.push(seg(arm('EST', d), pt(p.x * K, -cov), pt(p.x * K, -sp.h * K + cov), d));
  }
  const along = markPlaces(line, (6 * s) / K);
  for (const bar of line.bars) {
    const off = bar.kind === 'continuous' || bar.kind === 'bent' ? 0 : 0.8 * s;
    const pts = barPolyline(line, bar, off);
    if (pts.length < 2) continue;
    ps.push({ kind: 'polyline', layer: arm(barLayer(bar), bar.bars.dia), points: pts, dia: bar.bars.dia });
    const g = barTrace(line, bar).reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
    const y = pts.find((q) => q.x >= g.from * K - 1e-6)?.y ?? pts[0]!.y;
    ps.push(...bubble(pt((along.get(bar.mark) ?? (g.from + g.to) / 2) * K, y + (bar.face === 'top' ? -4 : 4) * s), bar.mark, s));
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
  const yZone = -hMax, below0 = stub / s + 6;
  for (const z of line.zones) {
    if (z.to - z.from < 1e-6) continue;
    ps.push(dim(pt(z.from * K, yZone), pt(z.to * K, yZone), -below0, cm(c.fmt, z.to - z.from)));
    ps.push(label(pt(((z.from + z.to) / 2) * K, yZone - (below0 + 6) * s), stirrupsLabel(z.stirrups), 2.2, 'center'));
  }
  const chain = below0 + 14;
  for (let j = 1; j < supports.length; j++) ps.push(dim(pt(supports[j - 1]!, yZone), pt(supports[j]!, yZone), -chain, c.fmt((supports[j]! - supports[j - 1]!) / K, 2)));
  if (supports.length > 2) ps.push(dim(pt(supports[0]!, yZone), pt(supports[supports.length - 1]!, yZone), -(chain + 8), c.fmt(line.length, 2)));
  return { ps, below: hMax + (chain + 14) * s };
}

/** Each bar drawn apart under the elevation, within [x0, x1]: its shape to scale, its mark, count, diameter and cut length, and its ends set out from the axes. */
function breakdown(line: LineLayout, top: number, x0: number, x1: number, c: PlanCtx): { ps: Primitive[]; bottom: number } {
  const s = c.scale, ps: Primitive[] = [];
  let y = top;
  for (const bar of line.bars) {
    if (bar.to * K < x0 - 1e-6 || bar.from * K > x1 + 1e-6) continue;
    const raw = barPolyline(line, bar, 0), ys = raw.map((q) => q.y);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    y -= hi - lo + 12 * s;
    const shift = y + 5 * s - lo, run = (bar.face === 'top' && bar.kind !== 'bent' ? hi : lo) + shift, crown = hi + shift;
    const pts = raw.map((q) => pt(q.x, q.y + shift));
    ps.push(...clipToBand([{ kind: 'polyline', layer: arm(barLayer(bar), bar.bars.dia), points: pts, dia: bar.bars.dia }], x0, x1));
    const start = Math.max(x0, bar.from * K);
    ps.push(...bubble(pt(start + 3 * s, crown + 4.5 * s), bar.mark, s));
    ps.push(label(pt(start + 7 * s, crown + 3.5 * s), `${bar.bars.count}Ø${bar.bars.dia} L=${c.fmt(bar.length, 2)}`, 2.5));
    const base = run;
    const so = setOut(line, bar);
    const ends: Array<[number, number]> = so ? [[so.axes[0], bar.from], [bar.to, so.axes[1]]] : [[bar.from, bar.to]];
    for (const [a, b] of ends) if (Math.abs(b - a) > 0.005) ps.push(dim(pt(Math.min(a, b) * K, base), pt(Math.max(a, b) * K, base), -3, so ? cm(c.fmt, Math.abs(b - a)) : c.fmt(Math.abs(b - a), 2)));
  }
  return { ps: clipToBand(ps, x0, x1), bottom: y - 6 * s };
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
  const { ps, below } = elevation(line, cuts, o);
  const supports = lineSupports(line).map((x) => x * K);
  const half = Math.max(...line.supportWidths.map((w) => w * K / 2), 0);
  const from = Math.min(line.ends.from * K, -half) - 10 * s, to = Math.max(line.ends.to * K, line.length * K + half) + 10 * s;
  const windows = bands(from, to, Math.max(50, o.maxWidth - 20) * s, supports.slice(1, -1));
  const hMax = Math.max(...line.spans.map((x) => x.h)) * K;
  const out: DrawingInput[] = [];
  windows.forEach(([a, b], i) => {
    const body = clipToBand(ps, a, b);
    const bd = breakdown(line, 0, a, b, o);
    const axes = (y0: number, y1: number) => supports.flatMap((xs, j) => (xs < a - 1e-6 || xs > b + 1e-6 ? [] : [seg(EJES, pt(xs, y0), pt(xs, y1)), ...bubble(pt(xs, y0 + 3 * s), String(j + 1), s)]));
    body.push(...axes(STUB + 12 * s, -below + 4 * s));
    if (i > 0) body.push(zigzag(a + 2 * s, 0, -hMax, s));
    if (i < windows.length - 1) body.push(zigzag(b - 2 * s, 0, -hMax, s));
    const part = windows.length > 1 ? ` (${i + 1}/${windows.length})` : '', key = `${line.key}:elev${windows.length > 1 ? `-${i + 1}` : ''}`;
    out.push(framed(key, `${o.tr('rcSheets.plans.beamElevation', { name: line.name })}${part}`, body, s, o.group));
    out.push(framed(`${key}-bars`, `${o.tr('rcSheets.plans.beamBars', { name: line.name })}${part}`, [...bd.ps, ...axes(6 * s, bd.bottom)], s, o.group));
  });
  for (const g of sections) {
    const notes = g.notes.map((n) => n.replace(/^↑ /, `${o.tr('rcSheets.col.top')}: `).replace(/^↓ /, `${o.tr('rcSheets.col.bottom')}: `));
    const ps2 = sectionPrimitives(g.drawing, o, g.marks, [g.tags.length <= 2 ? g.tags.join(', ') : `${g.tags[0]} … (${g.tags.length})`, ...notes]);
    out.push(framed(`${line.key}:sec-${g.label}`, o.tr('rcSheets.plans.section', { n: g.label }), ps2, s, o.group));
  }
  const marks = new Map(line.bars.map((b) => [b.mark, b]));
  const layerOf = (r: ScheduleRow): ArmLayer => (r.kind === 'stirrup' || r.kind === 'stirrupTie' || r.kind === 'hanger' ? 'EST' : marks.get(r.mark) ? barLayer(marks.get(r.mark)!) : 'INF');
  out.push(...scheduleTables(line.key, o.tr('rcSheets.plans.schedule', { name: line.name }), beamScheduleRows(line, o.code), layerOf, o, o.group));
  return out;
}
