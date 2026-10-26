/**
 * The column schedule: one column of the table per column of the building (identical stacks
 * merged under one heading, «C1 = C4»), one row per lift from the top down, and in each cell the
 * section drawn with its bars, its size, its longitudinal steel and its ties. A steel lift reads
 * its profile, so a mixed building has one schedule.
 */
import type { DrawingInput } from '../compose';
import type { Primitive } from '../primitives';
import { drawTable, type Cell } from './table';
import type { Tr } from './details';

export type LiftSection = { kind: 'rect'; b: number; h: number } | { kind: 'circle'; D: number } | { kind: 'steel'; profile: string } | { kind: 'other'; label: string };
export type LiftBars =
  | { kind: 'faces'; corner: number; face: number; nB: number; nT: number; nL: number; nR: number }
  | { kind: 'count'; count: number; diameter: number };
export interface ColumnLift { level: string; zLo: number; zHi: number; section: LiftSection; bars?: LiftBars; ties?: { diameter: number; spacing: number; endSpacing?: number; endLength?: number } }
export interface ScheduleColumn { name: string; lifts: ColumnLift[] }

const cm = (v: number) => String(Math.round(v * 100));
const COLS_PER_TABLE = 7;

/** The section with its bars in model millimetres (cover 40 mm to the bar centre ring). */
export function liftFigure(l: ColumnLift): Primitive[] {
  const s = l.section, out: Primitive[] = [];
  if (s.kind === 'rect') {
    const B = s.b * 1000, H = s.h * 1000, c = 45;
    out.push({ kind: 'polyline', layer: 'RC-OUTLINE', closed: true, points: [{ x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: H }, { x: 0, y: H }] });
    out.push({ kind: 'polyline', layer: 'RC-STIRRUP', closed: true, points: [{ x: c - 8, y: c - 8 }, { x: B - c + 8, y: c - 8 }, { x: B - c + 8, y: H - c + 8 }, { x: c - 8, y: H - c + 8 }] });
    const bars: Array<{ x: number; y: number; d: number }> = [];
    if (l.bars?.kind === 'faces') {
      const { corner, face, nB, nT, nL, nR } = l.bars;
      for (const [x, y] of [[c, c], [B - c, c], [B - c, H - c], [c, H - c]] as const) bars.push({ x, y, d: corner });
      const along = (n: number, f: (t: number) => { x: number; y: number }) => { for (let i = 1; i <= n; i++) bars.push({ ...f(i / (n + 1)), d: face }); };
      along(nB, (t) => ({ x: c + t * (B - 2 * c), y: c })); along(nT, (t) => ({ x: c + t * (B - 2 * c), y: H - c }));
      along(nL, (t) => ({ x: c, y: c + t * (H - 2 * c) })); along(nR, (t) => ({ x: B - c, y: c + t * (H - 2 * c) }));
    } else if (l.bars?.kind === 'count') {
      // Spread round the perimeter, corners first.
      const per = 2 * (B + H - 4 * c), n = Math.max(4, l.bars.count);
      for (let i = 0; i < n; i++) {
        let d = (i / n) * per;
        const segs = [[c, c, 1, 0, B - 2 * c], [B - c, c, 0, 1, H - 2 * c], [B - c, H - c, -1, 0, B - 2 * c], [c, H - c, 0, -1, H - 2 * c]] as const;
        for (const [x0, y0, dx, dy, L] of segs) { if (d <= L) { bars.push({ x: x0 + dx * d, y: y0 + dy * d, d: l.bars.diameter }); break; } d -= L; }
      }
    }
    for (const b of bars) out.push({ kind: 'circle', layer: 'RC-CUT-BAR', c: { x: b.x, y: b.y }, r: Math.max(b.d, 8) / 2, fill: true });
  } else if (s.kind === 'circle') {
    const R = (s.D * 1000) / 2, c = 45;
    out.push({ kind: 'circle', layer: 'RC-OUTLINE', c: { x: R, y: R }, r: R });
    out.push({ kind: 'circle', layer: 'RC-STIRRUP', c: { x: R, y: R }, r: R - c + 8 });
    const n = l.bars?.kind === 'count' ? l.bars.count : 6, d = l.bars?.kind === 'count' ? l.bars.diameter : 12;
    for (let i = 0; i < n; i++) out.push({ kind: 'circle', layer: 'RC-CUT-BAR', c: { x: R + (R - c) * Math.cos((2 * Math.PI * i) / n), y: R + (R - c) * Math.sin((2 * Math.PI * i) / n) }, r: d / 2, fill: true });
  } else if (s.kind === 'steel') {
    // A generic I symbol: the profile name carries the size.
    out.push({ kind: 'polyline', layer: 'ST-MEMBER', closed: true, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 20 }, { x: 108, y: 20 }, { x: 108, y: 280 }, { x: 200, y: 280 }, { x: 200, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 280 }, { x: 92, y: 280 }, { x: 92, y: 20 }, { x: 0, y: 20 }] });
  }
  return out;
}

export function liftText(l: ColumnLift): string {
  const s = l.section;
  const size = s.kind === 'rect' ? `${cm(s.b)}×${cm(s.h)}` : s.kind === 'circle' ? `Ø${cm(s.D)}` : s.kind === 'steel' ? s.profile : s.label;
  const lines = [size];
  if (l.bars?.kind === 'faces') {
    const faces = l.bars.nB + l.bars.nT + l.bars.nL + l.bars.nR;
    lines.push(faces > 0 && l.bars.face !== l.bars.corner ? `4Ø${l.bars.corner}+${faces}Ø${l.bars.face}` : `${4 + faces}Ø${l.bars.corner}`);
  } else if (l.bars?.kind === 'count') lines.push(`${l.bars.count}Ø${l.bars.diameter}`);
  if (l.ties) lines.push(`eØ${l.ties.diameter} c/${cm(l.ties.spacing)}${l.ties.endSpacing && l.ties.endSpacing !== l.ties.spacing ? ` (${cm(l.ties.endSpacing)})` : ''}`);
  return lines.join('\n');
}

/** Stacks that are the same column, lift by lift, under one heading. */
export function mergeIdentical(cols: readonly ScheduleColumn[]): ScheduleColumn[] {
  const by = new Map<string, ScheduleColumn>();
  const num = (n: string) => Number(n.replace(/\D+/g, '')) || 0;
  for (const c of [...cols].sort((p, q) => num(p.name) - num(q.name))) {
    const key = JSON.stringify(c.lifts.map((l) => [l.level, l.section, l.bars, l.ties]));
    const g = by.get(key);
    if (g) g.name = `${g.name} = ${c.name}`; else by.set(key, { name: c.name, lifts: c.lifts });
  }
  return [...by.values()];
}

export function columnSchedule(columns: readonly ScheduleColumn[], tr: Tr): DrawingInput[] {
  const merged = mergeIdentical(columns);
  if (merged.length === 0) return [];
  const levels = [...new Map(merged.flatMap((c) => c.lifts.map((l) => [l.level, l.zHi] as const))).entries()].sort((a, b) => b[1] - a[1]);
  const out: DrawingInput[] = [];
  const pages = Math.ceil(merged.length / COLS_PER_TABLE);
  for (let p = 0; p < pages; p++) {
    const cols = merged.slice(p * COLS_PER_TABLE, (p + 1) * COLS_PER_TABLE);
    const rows: Cell[][] = levels.map(([lv]) => [lv, ...cols.map((c): Cell => {
      const l = c.lifts.find((x) => x.level === lv);
      return l ? { figure: liftFigure(l), text: liftText(l) } : '';
    })]);
    const t = drawTable({
      columns: [{ label: tr('plan.cols.level'), width: 26 }, ...cols.map((c) => ({ label: c.name, width: Math.max(40, Math.min(70, c.name.length * 2 + 12)), align: 'center' as const }))],
      rows, figureHeight: 46,
      // One scale for every section, so a 25 × 25 reads smaller than a 35 × 35.
      figureScale: Math.max(...merged.flatMap((c) => c.lifts.map((l) => (l.section.kind === 'rect' ? Math.max(l.section.b, l.section.h) * 1000 : l.section.kind === 'circle' ? l.section.D * 1000 : 300)))) / 30,
    });
    out.push({ key: `columns-${p + 1}`, title: pages > 1 ? `${tr('plan.cols.title')} (${p + 1}/${pages})` : tr('plan.cols.title'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true });
  }
  return out;
}
