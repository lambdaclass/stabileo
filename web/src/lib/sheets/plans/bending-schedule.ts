/**
 * The consolidated bending schedule of the works: every mark of every assembly in the issued
 * document, with its shape drawn and dimensioned (legs in centimetres, hooks by angle and tail),
 * its shape code, count, cutting and total length and mass, then the totals by diameter a steel
 * order is placed with. Read off the document's own marks and bars (`assignMarks`,
 * `rcShapeForMark`), so the schedule and the drawings cannot disagree.
 */
import { rcShapeForMark } from '../../engine/detailing/bar-shape-diagram';
import { buildSchedule } from '../../engine/detailing/drawings';
import type { DocumentModel } from '../../engine/detailing/document-model';
import type { DrawingInput } from '../compose';
import type { Primitive } from '../primitives';
import { drawTable, type Cell } from './table';
import type { Tr } from './details';

/** Rows per table: a figure row is 24 mm, so a dozen fit an A2 drawable area with its header. */
export const ROWS_PER_TABLE = 12;
const STOCK = 12;

/** The bent shape of a mark in model units (a 60 × 30 box), its legs labelled in cm. */
export function shapeFigure(points: readonly { x: number; y: number }[], legs: ReadonlyArray<{ lengthM: number; at: { x: number; y: number }; horizontal: boolean }>, extent: { min: { x: number; y: number }; max: { x: number; y: number } }): Primitive[] {
  const w = extent.max.x - extent.min.x || 1e-6, h = extent.max.y - extent.min.y || 1e-6;
  const k = Math.min(60 / w, 30 / h);
  const P = (p: { x: number; y: number }) => ({ x: (p.x - extent.min.x) * k, y: (p.y - extent.min.y) * k });
  const out: Primitive[] = [{ kind: 'polyline', layer: 'RC-BAR', points: points.map(P) }];
  for (const l of legs) {
    const at = P(l.at);
    out.push({ kind: 'text', layer: 'RC-TEXT', at: l.horizontal ? { x: at.x, y: at.y + 1.5 } : { x: at.x + 1.5, y: at.y }, text: String(Math.round(l.lengthM * 100)), height: 2, align: l.horizontal ? 'center' : 'left' });
  }
  return out;
}

export function bendingSchedule(doc: DocumentModel, tr: Tr, fmt: (v: number, d: number) => string): DrawingInput[] {
  const rows: Cell[][] = [];
  const byDia = new Map<number, { length: number; mass: number; stock: number }>();
  for (const a of doc.assemblies) {
    const table = buildSchedule(a.source.marks, STOCK);
    const owner = a.source.marks.length ? (a.id.length > 14 ? a.id.slice(-14) : a.id) : '';
    for (const r of table.rows) {
      const mark = a.source.marks.find((m) => m.mark === r.mark);
      const shape = mark ? rcShapeForMark(mark.barIds, (id) => a.bars.find((b) => b.id === id)) : null;
      const hooks = shape?.ok ? [shape.diagram.hooks.start, shape.diagram.hooks.end].filter((x): x is NonNullable<typeof x> => !!x) : [];
      const figure: Cell = shape?.ok
        ? { figure: shapeFigure(shape.diagram.points, shape.diagram.legs, shape.diagram.extent), ...(hooks.length ? { text: hooks.map((x) => `${x.angleDeg}° + ${Math.round(x.extensionM * 100)}`).join('  ') } : {}) }
        : '—';
      rows.push([owner, r.mark, `Ø${r.diameterMm}`, figure, r.shape, String(r.quantity), fmt(r.cuttingLengthM, 2), fmt(r.totalLengthM, 2), fmt(r.massKg, 1)]);
      const g = byDia.get(r.diameterMm) ?? { length: 0, mass: 0, stock: 0 };
      g.length += r.totalLengthM; g.mass += r.massKg; g.stock += r.stockBars;
      byDia.set(r.diameterMm, g);
    }
  }
  if (rows.length === 0) return [];
  const columns = [
    { label: tr('plan.bbs.assembly'), width: 34 }, { label: tr('plan.bbs.mark'), width: 14, align: 'center' as const },
    { label: 'Ø', width: 12, align: 'center' as const }, { label: tr('plan.bbs.shape'), width: 72, align: 'center' as const },
    { label: tr('plan.bbs.code'), width: 24, align: 'center' as const }, { label: tr('plan.bbs.count'), width: 14, align: 'right' as const },
    { label: tr('plan.bbs.cut'), width: 20, align: 'right' as const }, { label: tr('plan.bbs.total'), width: 22, align: 'right' as const },
    { label: tr('plan.bbs.mass'), width: 20, align: 'right' as const },
  ];
  const out: DrawingInput[] = [];
  for (let i = 0, page = 1; i < rows.length; i += ROWS_PER_TABLE, page++) {
    const t = drawTable({ columns, rows: rows.slice(i, i + ROWS_PER_TABLE), figureHeight: 24 });
    const pages = Math.ceil(rows.length / ROWS_PER_TABLE);
    out.push({ key: `bbs-${page}`, title: pages > 1 ? `${tr('plan.bbs.title')} (${page}/${pages})` : tr('plan.bbs.title'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true });
  }
  const dias = [...byDia.entries()].sort((a, b) => a[0] - b[0]);
  const tot = dias.reduce((s, [, g]) => ({ length: s.length + g.length, mass: s.mass + g.mass, stock: s.stock + g.stock }), { length: 0, mass: 0, stock: 0 });
  const t = drawTable({
    columns: [{ label: 'Ø', width: 16, align: 'center' }, { label: tr('plan.bbs.total'), width: 28, align: 'right' }, { label: tr('plan.bbs.mass'), width: 26, align: 'right' }, { label: tr('plan.bbs.stock', { L: STOCK }), width: 30, align: 'right' }],
    rows: [...dias.map(([d, g]) => [`Ø${d}`, fmt(g.length, 1), fmt(g.mass, 1), String(g.stock)]), [tr('plan.bbs.sum'), fmt(tot.length, 1), fmt(tot.mass, 1), String(tot.stock)]],
  });
  out.push({ key: 'bbs-totals', title: tr('plan.bbs.byDiameter'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true });
  return out;
}
