/**
 * The project's sheet set: the drawings composed onto sheets of one format, numbered with the
 * project's prefix, each in its frame with the title block, plus an index sheet listing them all
 * with their revisions. What the screen, the DXF (one file per sheet, zipped) and the PDF (one
 * page per sheet) are made from.
 */
import { zipSync, strToU8 } from 'fflate';
import { CAPTION_MM, composeSheets, type DrawingInput } from './compose';
import { blankGeometry, formatGeometry, type SheetFormat } from './formats';
import { displayPrimitives, displayStyle, type SheetDisplay } from './display';
import { fillLine, type TitleBlockTemplate } from './sheet-entries';
import { arrangeDrawings, sizeChanged, textKeys, translate, type LayoutConflict, type SheetLayout } from './sheet-layout';
import type { PlacedDrawing } from './compose';
import { frameAndTitleBlock, type TitleBlockData } from './title-block';
import { sheetToDxf } from './to-dxf';
import { sheetToSvg } from './to-svg';
import { sheetsToPdf } from './to-pdf';
import { dxf2004Bytes, sheetToDxf2004 } from './to-dxf2004';
import type { Primitive } from './primitives';

export interface SheetSetSettings { format: SheetFormat; prefix: string; start: number }
export const DEFAULT_SHEET_SETTINGS: SheetSetSettings = { format: 'A1', prefix: 'E-', start: 1 };

export interface SheetRevision { code: string; date?: string; note?: string }

export interface SetSheet {
  number: string; title: string; format: SheetFormat; width: number; height: number; primitives: Primitive[]; drawings: string[]; revision?: SheetRevision;
  /** Where each drawing sits on the sheet (for the composition editor); its primitives start after the frame's `blockCount`. */
  placed?: PlacedDrawing[];
  blockCount?: number;
  /** On the index: the layout adjustments that did not hold after this generation. */
  layoutConflicts?: LayoutConflict[];
  /**
   * The drawings at a scale, as the DXF 2004 puts them: in model space at full size and seen
   * through a viewport on the sheet. `body` is where each one's primitives are in `primitives`;
   * `at` and `from` invert the placing (paper = at + (model − from) / scale).
   */
  views?: Array<{ key: string; scale: number; body: [number, number]; at: { x: number; y: number }; from: { x: number; y: number }; box: { x: number; y: number; w: number; h: number } }>;
}

export interface SheetSetInput {
  drawings: readonly DrawingInput[];
  settings: SheetSetSettings;
  project: Omit<TitleBlockData, 'sheetNumber' | 'sheetTitle' | 'scale' | 'format' | 'revision'>;
  /** Revisions stated per sheet number; absent, the project's current one. */
  revisions?: Record<string, SheetRevision>;
  projectRevision?: SheetRevision;
  label: (key: string) => string;
  /** The office's title block: its lines and values, or a blank sheet of free size. */
  titleBlock?: TitleBlockTemplate;
  /** The levels a sheet covers, by group, for the {planta} variable. */
  floorOf?: (group: string | undefined) => string | undefined;
  /** The person's adjustments to the composition (`sheet-layout.ts`). */
  layout?: SheetLayout;
}

export function buildSheetSet(i: SheetSetInput): SetSheet[] {
  const tpl = i.titleBlock, blank = tpl?.layout === 'blank';
  const geometryOf = (f: SheetFormat) => (blank ? blankGeometry(tpl!.size?.width ?? formatGeometry(f).width, tpl!.size?.height ?? formatGeometry(f).height) : formatGeometry(f));
  const lines = (sheet: { number: string; scale: string; group?: string }) => tpl
    ? tpl.lines.map((l) => fillLine(l, { ...tpl.values, plano: sheet.number, escala: sheet.scale, ...(i.floorOf?.(sheet.group) ? { planta: i.floorOf(sheet.group)! } : {}) })).filter(Boolean)
    : undefined;
  const block = (g: ReturnType<typeof formatGeometry>, d: Parameters<typeof frameAndTitleBlock>[1]) => (blank
    ? [{ kind: 'polyline' as const, layer: 'SHEET-FRAME', closed: true, points: [{ x: g.frame.x0, y: g.frame.y0 }, { x: g.frame.x1, y: g.frame.y0 }, { x: g.frame.x1, y: g.frame.y1 }, { x: g.frame.x0, y: g.frame.y1 }] }]
    : frameAndTitleBlock(g, d, i.label));
  const arranged = arrangeDrawings(i.drawings, i.layout);
  const conflicts = [...arranged.conflicts];
  const byKey = new Map(arranged.drawings.map((d) => [d.key, d]));
  const composed = composeSheets(arranged.drawings, i.settings.format, geometryOf);
  // The adjustments that place: a drawing at its point, texts moved inside it, annotations.
  for (const c of composed) {
    for (const p of c.drawings) {
      const a = i.layout?.drawings[p.key], d = byKey.get(p.key);
      if (!a || !d) continue;
      if ((a.at || a.moves) && sizeChanged(a, d)) { conflicts.push({ key: p.key, reason: 'sizeChanged' }); continue; }
      if (a.moves) {
        const keys = textKeys(d.primitives), at = new Map([...keys].map(([idx, k]) => [k, idx]));
        for (const [k, delta] of Object.entries(a.moves)) {
          const idx = at.get(k);
          if (idx === undefined) { conflicts.push({ key: p.key, reason: 'textMissing', detail: k }); continue; }
          c.primitives[p.from + idx] = translate([c.primitives[p.from + idx]!], delta)[0]!;
        }
      }
      if (a.at) {
        const delta = { x: a.at.x - p.x, y: a.at.y - p.y };
        c.primitives.splice(p.from, p.to - p.from, ...translate(c.primitives.slice(p.from, p.to), delta));
        p.x = a.at.x; p.y = a.at.y;
      }
    }
  }
  for (const n of i.layout?.annotations ?? []) {
    const c = composed.find((x) => x.drawings.some((p) => p.key === n.onDrawing));
    if (!c) { conflicts.push({ key: n.id, reason: 'anchorMissing', detail: n.onDrawing }); continue; }
    c.primitives.push({ kind: 'text', layer: 'NOTE-TEXT', at: { ...n.at }, text: n.text, height: n.height });
  }
  const num = (k: number) => `${i.settings.prefix}${String(i.settings.start + k).padStart(2, '0')}`;
  const sheets: SetSheet[] = composed.map((c, k) => {
    const g = geometryOf(c.format), number = num(k + 1);
    const scales = [...new Set(c.drawings.filter((d) => !d.paper).map((d) => `1:${d.scale}`))].join(', ') || '—';
    const title = c.group && c.drawings.length > 1 ? c.group : c.drawings.length === 1 ? c.drawings[0]!.title : c.drawings.map((d) => d.title).slice(0, 3).join(' · ') + (c.drawings.length > 3 ? ' …' : '');
    const revision = i.revisions?.[number] ?? i.projectRevision;
    const tl = lines({ number, scale: scales, ...(c.group ? { group: c.group } : {}) });
    const tb = block(g, { ...i.project, sheetNumber: number, sheetTitle: title, scale: scales, format: c.format, ...(revision ? { revision } : {}), ...(tl ? { lines: tl } : {}) });
    const views = c.drawings.filter((p) => !p.paper).map((p) => ({
      key: p.key, scale: p.scale, body: [tb.length + p.from, tb.length + p.to - 1] as [number, number],
      at: { x: p.x, y: p.y + CAPTION_MM }, from: byKey.get(p.key)?.origin ?? { x: 0, y: 0 }, box: { x: p.x, y: p.y + CAPTION_MM, w: p.w, h: p.h - CAPTION_MM },
    }));
    return { number, title, format: c.format, width: g.width, height: g.height, primitives: [...tb, ...c.primitives], drawings: c.drawings.map((d) => d.key), placed: c.drawings, blockCount: tb.length, ...(views.length ? { views } : {}), ...(revision ? { revision } : {}) };
  });
  // The index, first.
  const g = geometryOf(i.settings.format), number = num(0);
  const rows: Primitive[] = [{ kind: 'text', layer: 'RC-TITLE', at: { x: g.drawable.x0, y: g.drawable.y1 - 10 }, text: i.label('sheet.index.title'), height: 6 }];
  const headY = g.drawable.y1 - 22;
  const cols = [0, 40, 260];
  ['sheet.index.number', 'sheet.index.sheet', 'sheet.index.revision'].forEach((k, j) => rows.push({ kind: 'text', layer: 'RC-TEXT', at: { x: g.drawable.x0 + cols[j]!, y: headY }, text: i.label(k), height: 3.5 }));
  sheets.forEach((s, k) => {
    const y = headY - 8 - k * 7;
    rows.push({ kind: 'text', layer: 'RC-TEXT', at: { x: g.drawable.x0, y }, text: s.number, height: 3 });
    rows.push({ kind: 'text', layer: 'RC-TEXT', at: { x: g.drawable.x0 + cols[1]!, y }, text: s.title, height: 3 });
    rows.push({ kind: 'text', layer: 'RC-TEXT', at: { x: g.drawable.x0 + cols[2]!, y }, text: s.revision ? [s.revision.code, s.revision.date].filter(Boolean).join(' · ') : '—', height: 3 });
  });
  const revision = i.revisions?.[number] ?? i.projectRevision;
  const index: SetSheet = {
    number, title: i.label('sheet.index.title'), format: i.settings.format, width: g.width, height: g.height, drawings: [],
    primitives: [...block(g, { ...i.project, sheetNumber: number, sheetTitle: i.label('sheet.index.title'), scale: '—', format: i.settings.format, ...(revision ? { revision } : {}), ...((tl) => (tl ? { lines: tl } : {}))(lines({ number, scale: '—' })) }), ...rows],
    ...(revision ? { revision } : {}),
    ...(conflicts.length ? { layoutConflicts: conflicts } : {}),
  };
  return [index, ...sheets];
}

/** A sheet on the screen (the display's screen layers) or on the plan (its plan layers). */
export const sheetSvg = (s: SetSheet, display?: SheetDisplay, target: 'screen' | 'plan' = 'screen') => sheetToSvg(s.width, s.height, displayPrimitives(s.primitives, display, target), displayStyle(display));
export const sheetDxf = (s: SetSheet, display?: SheetDisplay) => sheetToDxf(displayPrimitives(s.primitives, display, 'plan'), displayStyle(display));

/** Every sheet's DXF in one zip, named by number: version 2004 (model space and layouts) by default, R12 when asked. */
export function sheetSetDxfZip(sheets: readonly SetSheet[], display?: SheetDisplay, version: '2004' | 'r12' = '2004'): Uint8Array {
  return zipSync(Object.fromEntries(sheets.map((s) => [`${s.number}.dxf`, version === 'r12'
    ? strToU8(sheetDxf(s, display))
    : dxf2004Bytes(sheetToDxf2004(s, displayStyle(display), (ps) => displayPrimitives(ps, display, 'plan')))])));
}

/** Every sheet's SVG in one zip, as the plan shows it. */
export function sheetSetSvgZip(sheets: readonly SetSheet[], display?: SheetDisplay): Uint8Array {
  return zipSync(Object.fromEntries(sheets.map((s) => [`${s.number}.svg`, strToU8(sheetSvg(s, display, 'plan'))])));
}

export function sheetSetPdf(sheets: readonly SetSheet[], title: string, display?: SheetDisplay): Uint8Array {
  return sheetsToPdf(sheets.map((s) => ({ width: s.width, height: s.height, primitives: displayPrimitives(s.primitives, display, 'plan') })), title, displayStyle(display));
}
