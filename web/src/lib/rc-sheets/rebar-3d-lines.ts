import { barActsAt, type LineBar, type LineLayout } from './beam-line';
import { faceBars } from './bars';
import { flangeTopAcross } from './flange-bars';
import { spanIndexAt } from './line-geometry';
import { hoop, tieAcross, zoneStirrups } from './schedule/pieces';
import { barOf, laid, type Frame, type Rebar3d } from './rebar-3d-geometry';
import type { BarShape, BendRules } from './shape';

type Base = Pick<Rebar3d, 'element' | 'rows' | 'family' | 'level'>;
type Face = 'top' | 'bottom';
interface Slot { x: number; depth: number; dia: number }
interface Place { s: number; dv: number }

const HANGER_PITCH = 0.05;

function stirrupDiaAt(l: LineLayout, x: number): number {
  const k = spanIndexAt(l, x);
  const z = l.zones.find((q) => q.span === k && x >= q.from - 1e-9 && x <= q.to + 1e-9) ?? l.zones.find((q) => q.span === k);
  return z?.stirrups.dia ?? l.spanAdopted[k]?.stirrups.dia ?? 8;
}

function cutOf(b: LineBar, face: Face): number | null {
  const runs = b.runs.filter((r) => r.face === face);
  if (!runs.length) return null;
  const r = runs.reduce((p, q) => (q.to - q.from > p.to - p.from ? q : p));
  return (r.from + r.to) / 2;
}

function claim(free: Slot[], s: number, dia: number): Slot | undefined {
  const same = free.filter((q) => q.dia === dia);
  const pool = same.length ? same : free;
  if (!pool.length) return undefined;
  const pick = pool.reduce((p, q) => (Math.abs(q.x - s) < Math.abs(p.x - s) ? q : p));
  free.splice(free.indexOf(pick), 1);
  return pick;
}

export function lineSlots(l: LineLayout): Map<LineBar, Place[]> {
  const out = new Map<LineBar, Place[]>();
  for (const face of ['bottom', 'top'] as const) {
    const cont = l.bars.find((b) => b.kind === 'continuous' && b.face === face);
    const widthAt = (x: number) => l.spans[spanIndexAt(l, x)]?.b ?? l.spans[0]!.b;
    const layout = (x: number, extras: LineBar[]): Slot[] => {
      const groups = [...(cont ? [cont.bars] : []), ...extras.map((b) => b.bars)].filter((g) => g.count > 0);
      return faceBars(groups, widthAt(x), l.cover, stirrupDiaAt(l, x)).map((q) => ({ x: q.x, depth: q.depth, dia: q.dia }));
    };
    const placeIn = (slots: Slot[], taken: Slot[], b: number): Place[] => {
      const d0 = Math.min(...slots.map((q) => q.depth));
      return taken.map((q) => ({ s: q.x - b / 2, dv: q.depth - d0 }));
    };
    if (cont && !out.has(cont)) {
      const x = l.length / 2, slots = layout(x, []);
      out.set(cont, placeIn(slots, slots.slice(0, cont.bars.count), widthAt(x)));
    }
    const flangeOf = (bar: LineBar): number[] | null => {
      if (face !== 'top' || bar.kind !== 'support') return null;
      const x = cutOf(bar, face), fl = x === null ? undefined : l.spans[spanIndexAt(l, x)]?.flange;
      return fl && x !== null ? flangeTopAcross(fl, widthAt(x), l.cover, bar.bars.count) : null;
    };
    for (const bar of l.bars) {
      if (out.has(bar)) continue;
      const x = cutOf(bar, face);
      if (x === null) continue;
      const spread = flangeOf(bar);
      if (spread) { out.set(bar, spread.map((s) => ({ s, dv: 0 }))); continue; }
      const here = l.bars.filter((q) => q !== cont && barActsAt(q, face, x, 1e-6) && !flangeOf(q));
      if (!here.includes(bar)) here.push(bar);
      const slots = layout(x, here), free = [...slots], b = widthAt(x);
      for (const other of [cont, ...here]) {
        if (!other || other === bar) continue;
        for (const p of out.get(other) ?? []) claim(free, p.s + b / 2, other.bars.dia);
      }
      const mine = free.filter((q) => q.dia === bar.bars.dia).sort((p, q) => p.depth - q.depth || Math.abs(q.x - b / 2) - Math.abs(p.x - b / 2));
      const rest = free.filter((q) => !mine.includes(q));
      const taken = [...mine, ...rest].slice(0, bar.bars.count);
      while (taken.length < bar.bars.count) taken.push(slots[taken.length % slots.length]!);
      out.set(bar, placeIn(slots, taken, b));
    }
  }
  return out;
}

function spliceCentres(l: LineLayout, b: LineBar, i: number): number[] {
  const laps = b.shape.laps;
  if (!laps) return [];
  const own = l.splices.filter((s) => s.mark === b.mark);
  const pairs = own.length === 2 * laps.count;
  const xs = pairs ? own.filter((_, k) => (k % 2 === 0) === (i < Math.ceil(b.bars.count / 2))).map((s) => s.x) : own.map((s) => s.x);
  return xs.map((x) => arcAt(b.shape, x));
}

function arcAt(s: BarShape, x: number): number {
  const p = s.pts;
  let u = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const [x0, y0] = p[k]!, [x1, y1] = p[k + 1]!, leg = Math.hypot(x1 - x0, y1 - y0);
    if (x1 - x0 > 1e-9 && x >= x0 - 1e-9 && x <= x1 + 1e-9) return u + (leg * (x - x0)) / (x1 - x0);
    u += leg;
  }
  return x <= p[0]![0] ? 0 : u;
}

export function lineBars3d(l: LineLayout, f: Frame, R: BendRules, base: Base): Rebar3d[] {
  const out: Rebar3d[] = [];
  if (!l.spans.length) return out;
  const hMax = Math.max(...l.spans.map((s) => s.h));
  const slots = lineSlots(l);
  for (const b of l.bars) {
    const places = slots.get(b) ?? [];
    places.forEach((p, i) => {
      const dv = b.kind === 'bent' ? 0 : b.face === 'bottom' ? p.dv : -p.dv;
      const pts = laid(b.shape, f, (u, v) => [u, p.s, v - hMax / 2 + dv]);
      out.push(barOf(b.shape, pts, { ...base, kind: b.kind, tone: b.kind, mark: b.mark }, spliceCentres(l, b, i)));
    });
  }
  const section = (spanIdx: number, dia: number) => {
    const sp = l.spans[spanIdx]!, d = dia / 1000, edge = l.cover + d / 2;
    return { sp, w: sp.b - 2 * l.cover - d, h: sp.h - 2 * l.cover - d, y0: edge - sp.b / 2, z0: hMax - sp.h + edge - hMax / 2 };
  };
  for (const [zi, z] of l.zones.entries()) {
    if (!l.spans[z.span]) continue;
    const st = z.stirrups, { sp, w, h, y0, z0 } = section(z.span, st.dia);
    const shape = hoop(w, h, st.dia, R), tie = st.legs > 2 ? tieAcross(h, st.dia, R) : null;
    const leg = l.cover + st.dia / 2000;
    for (const x of zoneStirrups(z)) {
      out.push(barOf(shape, laid(shape, f, (u, v) => [x, y0 + u, z0 + v]), { ...base, kind: 'stirrup', tone: 'stirrup', set: `${base.element}:${l.key}:z${zi}` }));
      if (tie) for (let k = 1; k < st.legs - 1; k++) {
        const across = leg + (k * (sp.b - 2 * leg)) / (st.legs - 1) - sp.b / 2;
        out.push(barOf(tie, laid(tie, f, (u, v) => [x, across + v, z0 + u]), { ...base, kind: 'stirrupTie', tone: 'stirrup' }));
      }
    }
  }
  for (const hg of l.hangers ?? []) {
    const k = hg.end === 'start' ? 0 : l.spans.length - 1, { w, h, y0, z0 } = section(k, hg.stirrups.dia);
    const shape = hoop(w, h, hg.stirrups.dia, R), x0 = hg.end === 'start' ? 0 : l.length;
    for (let i = 0; i < hg.count; i++) {
      const x = x0 + (i - (hg.count - 1) / 2) * HANGER_PITCH;
      out.push(barOf(shape, laid(shape, f, (u, v) => [x, y0 + u, z0 + v]), { ...base, kind: 'hanger', tone: 'stirrup' }));
    }
  }
  return out;
}
