/**
 * Where a beam line's elevation puts things along it, in metres: each bar's pieces span by span,
 * its hook legs, every stirrup, how each extra bar is set out from the axes, and the sections cut
 * through it. The workspace's elevation and the exported drawing both read these, so screen and
 * paper agree; each maps the metres to its own scale.
 */
import { barActsAt, type LineBar, type LineLayout } from './beam-line';
import type { BeamRow } from './beam-row';
import { groupsLabel, stirrupsLabel } from './bars';
import { beamSection, type SectionDrawing } from './drawing';
import { stirrupsOver } from './schedule/pieces';
import type { Fmt } from './format';

type Spans = Pick<LineLayout, 'spans'>;

export const lineSupports = (line: Spans): number[] => [0, ...line.spans.map((s) => s.x1)];

export const spanIndexAt = (line: Spans, x: number): number => Math.max(0, line.spans.findIndex((s) => x >= s.x0 - 1e-9 && x <= s.x1 + 1e-9));

/** A bar's pieces span by span (the depth may change between spans); the end spans reach into the end supports. A bent bar by its bottom run. */
export function barTrace(line: Spans, bar: Pick<LineBar, 'kind' | 'from' | 'to' | 'runs'>): Array<{ from: number; to: number; span: number }> {
  if (bar.kind === 'bent') {
    const r = bar.runs.find((x) => x.face === 'bottom') ?? bar.runs[0]!;
    return [{ from: r.from, to: r.to, span: spanIndexAt(line, (r.from + r.to) / 2) }];
  }
  const last = line.spans.length - 1;
  return line.spans.flatMap((s, k) => {
    const lo = k === 0 ? -Infinity : s.x0, hi = k === last ? Infinity : s.x1;
    const a = Math.max(lo, bar.from), b = Math.min(hi, bar.to);
    return b - a > 1e-6 ? [{ from: a, to: b, span: k }] : [];
  });
}

/** A 90° hook's leg as the bar's shape bends it, m. */
export function hookLegOf(bar: Pick<LineBar, 'shape' | 'hooks'>): number {
  return Math.abs(hookTurn(bar, bar.hooks[0] ? 0 : 1));
}

/** How far the hook at an end runs from the bar, m: up positive, down negative, 0 with none there. */
export function hookTurn(bar: Pick<LineBar, 'shape' | 'hooks'>, end: 0 | 1): number {
  if (!bar.hooks[end]) return 0;
  const p = bar.shape.pts, [a, b] = end === 0 ? [p[0]!, p[1]!] : [p[p.length - 1]!, p[p.length - 2]!];
  return a[1] - b[1];
}

/** Every stirrup along the line as the schedule counts them; `every` keeps one in so many of a spacing, for a drawing too small to show them all. */
export function stirrupPositions(line: Pick<LineLayout, 'spans' | 'zones'>, every: (spacing: number) => number = () => 1): Array<{ x: number; span: number; zone: number }> {
  return line.zones.flatMap((z, zi) => {
    const s = z.stirrups.spacing, n = stirrupsOver(z.from, z.to, s), first = Math.min(0.05, s / 2);
    const span = spanIndexAt(line, (z.from + z.to) / 2);
    const out: Array<{ x: number; span: number; zone: number }> = [];
    const k = Math.max(1, Math.floor(every(s)));
    for (let i = 0; i < n; i += k) out.push({ x: z.from + first + i * s, span, zone: zi });
    return out;
  });
}

/** The axes an extra bar's ends are set out from and its distance to each, m; none for a continuous bar, nor a bent one, which is given by its legs. */
export function setOut(line: Spans, bar: Pick<LineBar, 'kind' | 'from' | 'to'>): { axes: [number, number]; d: [number, number] } | null {
  if (bar.kind === 'continuous' || bar.kind === 'bent') return null;
  const mid = (bar.from + bar.to) / 2;
  if (bar.kind === 'support') {
    const xs = lineSupports(line).reduce((p, q) => (Math.abs(q - mid) < Math.abs(p - mid) ? q : p));
    return { axes: [xs, xs], d: [xs - bar.from, bar.to - xs] };
  }
  const s = line.spans[spanIndexAt(line, mid)]!;
  return { axes: [s.x0, s.x1], d: [bar.from - s.x0, s.x1 - bar.to] };
}

/** A bent bar's straight legs but its hooks, each with its length and where its middle stands in the bar's plane, m. */
export function bentLegs(bar: Pick<LineBar, 'shape' | 'hooks'>): Array<{ length: number; at: [number, number] }> {
  const p = bar.shape.pts;
  const legs = p.slice(1).map((q, i) => ({ length: Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]), at: [(q[0] + p[i]![0]) / 2, (q[1] + p[i]![1]) / 2] as [number, number] }));
  return legs.slice(bar.hooks[0] ? 1 : 0, legs.length - (bar.hooks[1] ? 1 : 0));
}

/** The line's extra bars as its table row writes them: each support's top bars and each span's bottom bars, the bent bars that work there marked `bentWord`. */
export function extraBarsText(line: Pick<LineLayout, 'spans' | 'bars' | 'adopted'>, bentWord: string): { supports: string; spans: string } {
  const bent = line.bars.filter((b) => b.kind === 'bent');
  const add = (own: string, at: (b: LineBar) => boolean) => [own, ...bent.filter(at).map((b) => `${b.bars.count}Ø${b.bars.dia} ${bentWord}`)].filter(Boolean).join(' + ');
  const supports = lineSupports(line).map((xs, j) => {
    const g = line.adopted.supportTop[j];
    const text = add(g?.count ? `${g.count}Ø${g.dia}` : '', (b) => barActsAt(b, 'top', xs, 1e-6));
    return text ? `${j + 1}: ${text}` : '';
  });
  const spans = line.spans.map((s, k) => {
    const g = line.adopted.spanBottom[k];
    const text = add(g?.count ? `${g.count}Ø${g.dia}` : '', (b) => barActsAt(b, 'bottom', (s.x0 + s.x1) / 2, 1e-6));
    return text ? `${k + 1}: ${text}` : '';
  });
  return { supports: supports.filter(Boolean).join(' · ') || '—', spans: spans.filter(Boolean).join(' · ') || '—' };
}

/**
 * Labels along one row kept apart: each as near its wanted place as it can stand at least `gap`
 * from the next and `fixedGap` from every fixed thing on the row (a cut, a mark of another row).
 * Returns the places in the order the labels were given.
 */
export function placeLabels(wanted: readonly number[], gap: number, fixed: readonly number[] = [], fixedGap = gap): number[] {
  const order = wanted.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x || p.i - q.i);
  const out = new Array<number>(wanted.length);
  let prev = -Infinity;
  for (const { x, i } of order) {
    let at = Math.max(x, prev + gap);
    for (let guard = 0; guard < fixed.length + 1; guard++) {
      const hit = fixed.find((f) => Math.abs(f - at) < fixedGap - 1e-9);
      if (hit === undefined) break;
      const left = hit - fixedGap;
      at = left >= prev + gap - 1e-9 && x - left <= hit + fixedGap - x ? left : hit + fixedGap;
    }
    out[i] = at;
    prev = at;
  }
  return out;
}

/** Where each bar's mark stands along the line, m: over the middle of its longest piece, the marks of a face at least `gap` apart. */
export function markPlaces(line: Spans & Pick<LineLayout, 'bars'>, gap: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const face of ['top', 'bottom'] as const) {
    const list = line.bars.filter((b) => b.face === face).flatMap((b) => {
      const t = barTrace(line, b);
      if (!t.length) return [];
      const g = t.reduce((a, c) => (c.to - c.from > a.to - a.from ? c : a));
      return [{ mark: b.mark, x: (g.from + g.to) / 2 }];
    });
    const xs = placeLabels(list.map((m) => m.x), gap);
    list.forEach((m, i) => out.set(m.mark, xs[i]!));
  }
  return out;
}

/** The marks of the bars a face has at x along the line. */
export const marksAt = (line: Pick<LineLayout, 'bars'>, face: 'top' | 'bottom', x: number): string[] =>
  line.bars.filter((b) => barActsAt(b, face, x, 1e-6)).map((b) => b.mark);

export interface LineSection {
  key: string; drawing: SectionDrawing; notes: string[]; tags: string[]; title: string;
  marks: { top: string[]; bottom: string[] };
  /** The cut's number, and where along the line it is cut, m. */
  label: string; at: number[];
}

/** The sections of every span, the identical ones drawn once with every place they stand; with the marks shown, the same bars by other marks are another section. */
export function lineSections(line: LineLayout, spans: readonly BeamRow[], fmt: Fmt, withMarks: boolean): LineSection[] {
  const out: LineSection[] = [];
  line.spanAdopted.forEach((sa, k) => {
    const sp = line.spans[k]!;
    const xStar = spans[k]?.demand.span.x ?? (sp.x1 - sp.x0) / 2;
    const d = spans[k]?.demand;
    const places: Array<['start' | 'span' | 'end', string, number, number]> = [
      ['start', 'i', sp.x0 + 1e-3, sp.x0 + Math.max(d?.start.x ?? 0, (line.supportWidths[k] ?? 0) / 2 || 0.1)],
      ['span', `x* = ${fmt(xStar)} m`, sp.x0 + xStar, sp.x0 + xStar],
      ['end', 'j', sp.x1 - 1e-3, sp.x1 - Math.max(sp.x1 - sp.x0 - (d?.end.x ?? sp.x1 - sp.x0), (line.supportWidths[k + 1] ?? 0) / 2 || 0.1)],
    ];
    for (const [sec, tag, x, cutAt] of places) {
      const g = sa.at?.[sec] ?? { top: sa.top, bottom: sa.bottom };
      const notes = [`↑ ${groupsLabel(g.top)}`, `↓ ${groupsLabel(g.bottom)}`, stirrupsLabel(sa.stirrups)];
      const marks = { top: marksAt(line, 'top', x), bottom: marksAt(line, 'bottom', x) };
      const key = `${sp.b}×${sp.h}|${notes.join('|')}|${sa.stirrups.legs}${withMarks ? `|${marks.top.join()}|${marks.bottom.join()}` : ''}`;
      const same = out.find((q) => q.key === key);
      if (same) { same.tags.push(`${sp.name} · ${tag}`); same.at.push(cutAt); }
      else out.push({ key, drawing: beamSection(sp.b, sp.h, line.cover, g.top, g.bottom, sa.stirrups), notes, tags: [`${sp.name} · ${tag}`], title: '', marks, label: String(out.length + 1), at: [cutAt] });
    }
  });
  for (const x of out) x.title = `${x.label}–${x.label} · ${x.tags.length <= 2 ? x.tags.join(', ') : `${x.tags[0]} … ${x.tags[x.tags.length - 1]} (${x.tags.length})`}`;
  return out;
}
