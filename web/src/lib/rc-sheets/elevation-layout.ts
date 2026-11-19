import type { LineBar, LineLayout } from './beam-line';
import { stirrupsLabel } from './bars';
import { bentLegs, hookBack, hookTurn, lineSupports, setOut } from './line-geometry';
import { zoneStirrups } from './schedule/pieces';
import type { Fmt } from './format';
import type { Tr } from '../sheets/details/def';

export interface Box { x0: number; y0: number; x1: number; y1: number }
export type TextKind = 'bar' | 'setOut' | 'zone' | 'zoneLength' | 'splice' | 'post' | 'cut' | 'zero' | 'leg';
export interface LText { text: string; x: number; y: number; size: number; anchor: 'start' | 'middle' | 'end'; kind: TextKind; leader?: [number, number, number, number] }
export interface LDim { x0: number; x1: number; y: number; from: number; text: LText }
export interface LBubble { mark: string; x: number; y: number; r: number }
export interface LTrack {
  bar: LineBar; y: number; x0: number; x1: number; label: LText; bubble: LBubble | null; dims: LDim[]; legs: LText[];
  hooks: [number, number]; back: [number, number];
  shape?: Array<[number, number]>;
}
export interface LPost { x: number; rect: Box | null; name: LText | null; size: LText | null }
export interface LCut { x: number; label: string; top: LText; bottom: LText }
export interface ElevationLayout {
  top: number; bottom: number; hMax: number;
  posts: LPost[]; tracks: LTrack[]; cuts: LCut[]; splices: LText[];
  zoneDims: LDim[]; zones: LText[]; zeros: LDim[];
}

export interface ElevationInput {
  line: LineLayout;
  X: (x: number) => number;
  depth: (span: number) => number;
  t: number;
  below: number;
  marks: boolean;
  fmt: Fmt; tr: Tr;
  cuts?: ReadonlyArray<{ x: number; label: string }>;
  zeros?: boolean;
}

const CHAR = 0.6;
export const textWidth = (t: Pick<LText, 'text' | 'size'>): number => t.text.length * t.size * CHAR;

export function textBox(t: LText): Box {
  const w = textWidth(t), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { x0, y0: t.y - t.size, x1: x0 + w, y1: t.y };
}

export const bubbleBox = (b: LBubble): Box => ({ x0: b.x - b.r, y0: b.y - b.r, x1: b.x + b.r, y1: b.y + b.r });

export const overlaps = (a: Box, b: Box, pad = 0): boolean => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

const shifted = (t: LText, dx: number, dy: number): LText => ({ ...t, x: t.x + dx, y: t.y + dy });

export function layoutBoxes(l: ElevationLayout): Array<{ box: Box; what: string }> {
  const out: Array<{ box: Box; what: string }> = [];
  const add = (t: LText | null) => { if (t) out.push({ box: textBox(t), what: `${t.kind}:${t.text}` }); };
  for (const p of l.posts) { add(p.name); add(p.size); }
  for (const tr of l.tracks) {
    add(tr.label);
    if (tr.bubble) out.push({ box: bubbleBox(tr.bubble), what: `mark:${tr.bubble.mark}` });
    tr.dims.forEach((d) => add(d.text));
    tr.legs.forEach(add);
  }
  for (const c of l.cuts) { add(c.top); add(c.bottom); }
  [...l.splices, ...l.zones].forEach(add);
  [...l.zoneDims, ...l.zeros].forEach((d) => add(d.text));
  return out;
}

class Placer {
  taken: Box[] = [];
  constructor(private pad: number) {}
  free(b: Box): boolean { return !this.taken.some((x) => overlaps(x, b, this.pad)); }
  take(b: Box): void { this.taken.push(b); }
  text(t: LText, dir: 1 | -1, slide: boolean): LText {
    const w = textWidth(t), step = 1.25 * t.size;
    const dxs = slide ? [0, -0.55 * w, 0.55 * w, -1.1 * w, 1.1 * w, -1.65 * w, 1.65 * w] : [0];
    for (let r = 0; r < 60; r++) for (const dx of dxs) {
      const c = shifted(t, dx, dir * r * step);
      if (!this.free(textBox(c))) continue;
      this.take(textBox(c));
      if (r === 0 && dx === 0) return c;
      const b = textBox(c), ay = t.y - t.size / 2;
      return { ...c, leader: [t.x, ay, Math.min(Math.max(t.x, b.x0), b.x1), dir > 0 ? b.y0 : b.y1] };
    }
    return t;
  }
  dim(d: LDim, dir: 1 | -1, rowStep: number): LDim {
    for (let r = 0; r < 60; r++) {
      const c = { ...d, y: d.y + dir * r * rowStep, text: shifted(d.text, 0, dir * r * rowStep) };
      if (!this.free(textBox(c.text))) continue;
      this.take(textBox(c.text));
      return c;
    }
    return d;
  }
}

function dimOf(a: number, b: number, y: number, text: string, size: number, kind: TextKind, outside: 'start' | 'end' = 'end'): LDim {
  const w = text.length * size * CHAR, fits = w + 0.4 * size <= b - a;
  const x = fits ? (a + b) / 2 : outside === 'end' ? b + 0.25 * size : a - 0.25 * size;
  return { x0: a, x1: b, y, from: y, text: { text, x, y: y - 0.6 * size, size, anchor: fits ? 'middle' : outside === 'end' ? 'start' : 'end', kind } };
}

const cmOf = (fmt: Fmt, m: number) => fmt(Math.abs(m) * 100, 0);

export function zeroMoments(line: Pick<LineLayout, 'envelope' | 'spans'>): Array<{ axis: number; x: number; sign: 'pos' | 'neg' }> {
  const out: Array<{ axis: number; x: number; sign: 'pos' | 'neg' }> = [];
  for (const sp of line.spans) {
    const st = line.envelope.filter((e) => e.x >= sp.x0 - 1e-6 && e.x <= sp.x1 + 1e-6);
    if (st.length < 2) continue;
    for (const sign of ['neg', 'pos'] as const) {
      const v = st.map((e) => e[sign]), on = v.map((x) => x > 1e-6);
      for (let i = 1; i < st.length; i++) {
        if (on[i] === on[i - 1]) continue;
        const [a, b] = on[i - 1] ? [i - 1, i] : [i, i - 1];
        const prev = on[i - 1] ? i - 2 : i + 1, va = v[a]!, xa = st[a]!.x, xb = st[b]!.x;
        const vp = prev >= 0 && prev < st.length ? v[prev]! : NaN;
        const slope = Number.isFinite(vp) && vp > va ? (vp - va) / Math.abs(st[prev]!.x - xa) : NaN;
        const reach = Number.isFinite(slope) ? Math.min(Math.abs(xb - xa), va / slope) : Math.abs(xb - xa) / 2;
        const x = xa + Math.sign(xb - xa) * reach;
        const axis = Math.abs(x - sp.x0) <= Math.abs(sp.x1 - x) ? sp.x0 : sp.x1;
        if (Math.abs(x - axis) > 0.02) out.push({ axis, x, sign });
      }
    }
  }
  return out;
}

const trackOrder = (b: LineBar) => (b.kind === 'continuous' ? 0 : b.kind === 'bent' ? 2 : 1);

function packTracks(items: Array<{ x0: number; x1: number; order: number }>, gap: number): number[] {
  const sorted = items.map((it, i) => ({ ...it, i })).sort((p, q) => p.order - q.order || p.x0 - q.x0);
  const rows: Array<Array<[number, number]>> = [];
  const out = new Array<number>(items.length);
  for (const it of sorted) {
    let r = rows.findIndex((row) => row.every(([a, b]) => it.x1 + gap <= a || it.x0 >= b + gap));
    if (r < 0 || (it.order === 2 && rows[r]!.length)) { rows.push([]); r = rows.length - 1; }
    rows[r]!.push([it.x0, it.x1]);
    out[it.i] = r;
  }
  return out;
}

function trackOf(inp: ElevationInput, bar: LineBar): { track: LTrack; lo: number; hi: number; x0: number; x1: number } {
  const { line, X, t, fmt } = inp, small = 0.9 * t;
  const x0 = X(bar.from), x1 = X(bar.to);
  const text = `${bar.bars.count} Ø${bar.bars.dia} (${cmOf(fmt, bar.length)})`;
  const r = 0.62 * t, tw = text.length * t * CHAR, lead = inp.marks ? 2 * r + 0.35 * t : 0;
  const start = (x0 + x1) / 2 - (lead + tw) / 2;
  const label: LText = { text, x: start + lead, y: -0.4 * t, size: t, anchor: 'start', kind: 'bar' };
  const bubble = inp.marks ? { mark: bar.mark, x: start + r, y: -0.4 * t - t / 2, r } : null;
  const p = new Placer(0.15 * t);
  p.take(textBox(label));
  if (bubble) p.take(bubbleBox(bubble));
  const tick = 0.7 * t;
  const hooks: [number, number] = [0, 1].map((e) => -Math.sign(hookTurn(bar, e as 0 | 1)) * tick) as [number, number];
  const back: [number, number] = [0, 1].map((e) => Math.sign(hookBack(bar, e as 0 | 1)) * 0.5 * t) as [number, number];
  let shape: Array<[number, number]> | undefined;
  const legs: LText[] = [];
  if (bar.kind === 'bent') {
    const ys = bar.shape.pts.map((q) => q[1]), hi = Math.max(...ys), lo = Math.min(...ys.filter((_, i) => i > 0 && i < ys.length - 1));
    const H = 1.4 * t, my = (y: number) => ((hi - y) / Math.max(hi - lo, 1e-6)) * H;
    shape = bar.shape.pts.map((q) => [X(q[0]), Math.min(my(q[1]), H + tick)]);
    for (const g of bentLegs(bar)) legs.push(p.text({ text: cmOf(fmt, g.length), x: X(g.at[0]), y: Math.min(my(g.at[1]), H) + 1.15 * small, size: small, anchor: 'middle', kind: 'leg' }, 1, true));
  }
  const dims: LDim[] = [];
  const so = setOut(line, bar);
  if (so) {
    const pairs: Array<[number, number, 'start' | 'end']> = [[so.axes[0], bar.from, 'start'], [bar.to, so.axes[1], 'end']];
    for (const [a, b, out] of pairs) {
      if (Math.abs(b - a) < 0.005) continue;
      dims.push(p.dim(dimOf(X(Math.min(a, b)), X(Math.max(a, b)), 1.85 * small, cmOf(fmt, b - a), small, 'setOut', out), 1, 1.3 * small));
    }
    dims.forEach((d) => { d.from = 0; });
  }
  const boxes = [textBox(label), ...(bubble ? [bubbleBox(bubble)] : []), ...dims.map((d) => textBox(d.text)), ...legs.map(textBox)];
  const ys = [...boxes.flatMap((b) => [b.y0, b.y1]), ...hooks, ...dims.map((d) => d.y), ...(shape ?? []).map((q) => q[1])];
  const xs = [x0, x1, x0 + back[0], x1 + back[1], ...boxes.flatMap((b) => [b.x0, b.x1])];
  return { track: { bar, y: 0, x0, x1, label, bubble, dims, legs, hooks, back, ...(shape ? { shape } : {}) }, lo: Math.min(...ys, -1.5 * t), hi: Math.max(...ys, 0.5 * t), x0: Math.min(...xs), x1: Math.max(...xs) };
}

function moveTrack(tr: LTrack, dy: number): LTrack {
  const mv = (q: LText): LText => ({ ...q, y: q.y + dy });
  return {
    ...tr, y: tr.y + dy, label: mv(tr.label), bubble: tr.bubble ? { ...tr.bubble, y: tr.bubble.y + dy } : null,
    dims: tr.dims.map((d) => ({ ...d, y: d.y + dy, from: d.from + dy, text: mv(d.text) })), legs: tr.legs.map(mv),
    ...(tr.shape ? { shape: tr.shape.map(([x, y]) => [x, y + dy] as [number, number]) } : {}),
  };
}

export function elevationLayout(inp: ElevationInput): ElevationLayout {
  const { line, X, t, fmt } = inp, small = 0.9 * t;
  const hMax = Math.max(...line.spans.map((_, k) => inp.depth(k)));
  const placer = new Placer(0.15 * t);
  const cuts: LCut[] = [];
  const cutRow = (inp.cuts ?? []).length ? 1.45 * t : 0;
  for (const c of inp.cuts ?? []) {
    const lab = (y: number): LText => ({ text: c.label, x: X(c.x), y, size: small, anchor: 'middle', kind: 'cut' });
    cuts.push({ x: X(c.x), label: c.label, top: placer.text(lab(-0.35 * t), -1, true), bottom: placer.text(lab(hMax + inp.below + 0.35 * t + small), 1, true) });
  }
  for (const c of inp.cuts ?? []) placer.take({ x0: X(c.x) - 0.5, y0: 0, x1: X(c.x) + 0.5, y1: hMax });

  const built = line.bars.map((b) => trackOf(inp, b));
  const tracks: LTrack[] = [];
  let top = -cutRow - 0.4 * t, bottom = hMax + inp.below + cutRow + 0.4 * t;
  for (const face of ['top', 'bottom'] as const) {
    const mine = built.filter((x) => (x.track.bar.kind === 'bent' ? 'bottom' : x.track.bar.face) === face);
    const rows = packTracks(mine.map((x) => ({ x0: x.x0, x1: x.x1, order: trackOrder(x.track.bar) })), 0.8 * t);
    const n = Math.max(0, ...rows.map((r) => r + 1));
    for (let r = 0; r < n; r++) {
      const here = mine.filter((_, i) => rows[i] === r);
      const lo = Math.min(...here.map((x) => x.lo)), hi = Math.max(...here.map((x) => x.hi));
      const y = face === 'top' ? top - hi : bottom - lo;
      for (const x of here) {
        const m = moveTrack(x.track, y);
        tracks.push(m);
        placer.take(textBox(m.label));
        if (m.bubble) placer.take(bubbleBox(m.bubble));
        m.dims.forEach((d) => placer.take(textBox(d.text)));
        m.legs.forEach((q) => placer.take(textBox(q)));
      }
      if (face === 'top') top = y + lo - 0.35 * t; else bottom = y + hi + 0.35 * t;
    }
  }

  const splices = spliceLabels(inp, placer);
  const posts = postsOf(inp, top, placer);
  top = Math.min(top, ...posts.flatMap((p) => [p.rect?.y0 ?? top, p.name ? textBox(p.name).y0 : top, p.size ? textBox(p.size).y0 : top]));

  const zoneDims: LDim[] = [], zones: LText[] = [];
  const yLen = bottom + 1.6 * small;
  for (const z of line.zones) {
    if (z.to - z.from < 1e-6) continue;
    zoneDims.push(placer.dim(dimOf(X(z.from), X(z.to), yLen, cmOf(fmt, z.to - z.from), small, 'zoneLength'), 1, 1.3 * small));
  }
  zoneDims.forEach((d) => { d.from = d.y - 1.2 * small; });
  const yZone = Math.max(yLen, ...zoneDims.map((d) => d.y)) + 1.35 * small;
  for (const z of line.zones) {
    if (z.to - z.from < 1e-6) continue;
    const n = zoneStirrups(z).length;
    zones.push(placer.text({ text: `${n} ${stirrupsLabel(z.stirrups)}`, x: X((z.from + z.to) / 2), y: yZone, size: small, anchor: 'middle', kind: 'zone' }, 1, true));
  }
  bottom = Math.max(yZone, ...zones.map((z) => z.y)) + 0.3 * t;

  const zeros: LDim[] = [];
  if (inp.zeros) {
    for (const sign of ['neg', 'pos'] as const) {
      const yZero = bottom + 1.8 * small, row: LDim[] = [];
      for (const z of zeroMoments(line).filter((x) => x.sign === sign)) {
        const [a, b] = z.x < z.axis ? [z.x, z.axis] : [z.axis, z.x];
        row.push(placer.dim(dimOf(X(a), X(b), yZero, cmOf(fmt, b - a), small, 'zero', z.x < z.axis ? 'start' : 'end'), 1, 1.3 * small));
      }
      row.forEach((d) => { d.from = d.y - 1.2 * small; });
      zeros.push(...row);
      bottom = Math.max(bottom, ...row.map((d) => d.y)) + 0.3 * t;
    }
  }
  return { top, bottom, hMax, posts, tracks, cuts, splices, zoneDims, zones, zeros };
}

function spliceLabels(inp: ElevationInput, placer: Placer): LText[] {
  const { line, X, t, fmt, tr } = inp, small = 0.85 * t;
  const out: LText[] = [];
  for (const face of ['top', 'bottom'] as const) {
    const list = line.splices.filter((s) => s.face === face).sort((p, q) => p.x - q.x);
    const groups: Array<typeof list> = [];
    for (const s of list) {
      const g = groups[groups.length - 1], last = g?.[g.length - 1];
      const word = `${tr('rcSheets.line.splice')} ${cmOf(fmt, s.length)} cm`.length * small * CHAR;
      if (g && last && X(s.x - s.length / 2) - X(last.x + last.length / 2) < word) g.push(s);
      else groups.push([s]);
    }
    for (const g of groups) {
      const x = (g[0]!.x - g[0]!.length / 2 + g[g.length - 1]!.x + g[g.length - 1]!.length / 2) / 2;
      const k = Math.max(0, line.spans.findIndex((s) => x >= s.x0 - 1e-9 && x <= s.x1 + 1e-9));
      const lens = [...new Set(g.map((s) => cmOf(fmt, s.length)))].join('/');
      const text = g.length > 1 ? tr('rcSheets.line.splices', { n: g.length, len: lens }) : `${tr('rcSheets.line.splice')} ${lens} cm`;
      const y = face === 'top' ? 0.3 * inp.depth(k) + small : 0.7 * inp.depth(k);
      out.push(placer.text({ text, x: X(x), y, size: small, anchor: 'middle', kind: 'splice' }, face === 'top' ? 1 : -1, true));
    }
  }
  return out;
}

function postsOf(inp: ElevationInput, above: number, placer: Placer): LPost[] {
  const { line, X, t, fmt } = inp, small = 0.9 * t;
  const per = X(1) - X(0);
  const xs = lineSupports(line);
  const out: LPost[] = [];
  const base = above - 0.6 * t;
  xs.forEach((xm, j) => {
    const post = line.posts?.[j];
    const w = line.supportWidths[j] ?? 0;
    if (!post && w <= 0) { out.push({ x: X(xm), rect: null, name: null, size: null }); return; }
    const along = w > 0 ? w : post ? post.b : 0.2;
    const across = post ? (Math.abs(post.b - along) <= Math.abs(post.h - along) ? post.h : post.b) : along;
    const hw = Math.max(along * per, 0.6 * t) / 2, d = Math.min(Math.max(across * per, 0.6 * t), 4 * t);
    const rect: Box = { x0: X(xm) - hw, y0: base - d, x1: X(xm) + hw, y1: base };
    placer.take(rect);
    const size = post ? placer.text({ text: `${cmOf(fmt, post.b)}×${cmOf(fmt, post.h)}`, x: rect.x1 + 0.3 * t, y: base - d / 2 + small / 2, size: small, anchor: 'start', kind: 'post' }, -1, true) : null;
    const name = post?.name ? placer.text({ text: post.name, x: X(xm), y: rect.y0 - 0.35 * t, size: t, anchor: 'middle', kind: 'post' }, -1, true) : null;
    out.push({ x: X(xm), rect, name, size });
  });
  return out;
}
