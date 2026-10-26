/**
 * A sheet as DXF 2004 (AC1018), the version every CAD program opens: the drawings at a scale go
 * to model space at full size (model millimetres, so the declared unit is the real one), each in
 * its own place, and the sheet is a layout in paper space with its frame, title block, tables and
 * notes, and one viewport per drawing that shows it at its scale. Lines, LWPOLYLINE (filled
 * shapes as HATCH), circles and arcs; texts as TEXT and the tables' and notes' as MTEXT; every
 * dimension as a DIMENSION with its block; the bars cut in section as INSERTs of one block per
 * size. The R12 writer (`to-dxf.ts`) stays for whoever needs that version.
 *
 * The file is written in the code page it declares (ANSI 1252, `dxf2004Bytes`): accents, «Ø», «²»,
 * «·» and «—» go as they are, and a character that page lacks (ℓ, φ, √) as \U+XXXX.
 */
import { dimensionGeometry, type P, type Primitive } from './primitives';
import { layerDef, type LayerStyle } from './layers';
import type { SetSheet } from './sheet-set';

type Out = Array<string | number>;
const n = (v: number) => (Math.round(v * 1e6) / 1e6).toString();
/** The Windows-1252 bytes above 0x7F that are not Latin-1. */
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const inPage = (k: number) => (k >= 32 && k < 127) || (k >= 0xa0 && k <= 0xff) || CP1252[k] !== undefined;
const enc = (s: string) => [...s].map((c) => { const k = c.codePointAt(0)!; return inPage(k) ? c : `\\U+${k.toString(16).toUpperCase().padStart(4, '0')}`; }).join('');

/** The file's text in the code page it declares, as bytes to save. */
export function dxf2004Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) { const k = text.charCodeAt(i); out[i] = k < 0x100 ? k : CP1252[k] ?? 0x3f; }
  return out;
}
/** The standard lineweights (hundredths of a millimetre) a DXF accepts. */
const WEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const lw = (mm: number) => WEIGHTS.reduce((b, w) => (Math.abs(w - mm * 100) < Math.abs(b - mm * 100) ? w : b), 25);
const TABLE_LAYERS = new Set(['TB-TEXT', 'NOTE-TEXT']);

/** Paper primitives of a drawing's body back to its own model units. */
function toModel(ps: readonly Primitive[], v: NonNullable<SetSheet['views']>[number], off: P): Primitive[] {
  const f = (p: P): P => ({ x: v.from.x + (p.x - v.at.x) * v.scale + off.x, y: v.from.y + (p.y - v.at.y) * v.scale + off.y });
  return ps.map((p) => {
    switch (p.kind) {
      case 'line': return { ...p, a: f(p.a), b: f(p.b) };
      case 'polyline': return { ...p, points: p.points.map(f) };
      case 'circle': case 'arc': return { ...p, c: f(p.c), r: p.r * v.scale };
      // A text keeps its paper height on the sheet: in model space it is that height at the scale.
      case 'text': return { ...p, at: f(p.at), height: p.height * v.scale };
      case 'dimension': return { ...p, a: f(p.a), b: f(p.b), offset: p.offset * v.scale, height: (p.height ?? 2.5) * v.scale };
    }
  });
}

/** `show` passes primitives through the display (hidden layers, colour by diameter) after paper and model are told apart. */
export function sheetToDxf2004(sheet: SetSheet, layerOf: LayerStyle = layerDef, show: (ps: Primitive[]) => Primitive[] = (ps) => ps): string {
  let seq = 0x30;
  const h = () => (seq++).toString(16).toUpperCase();
  // Fixed handles: tables, the two spaces, the dictionaries and the two layouts.
  const H = { vport: '8', ltype: '2', layer: '1', style: '5', view: '7', ucs: '6', appid: '3', dimstyle: '4', brTable: '9', root: 'A', group: 'C', layoutDict: 'D', msBr: '17', psBr: '1B', msBlock: '18', msEnd: '19', psBlock: '1C', psEnd: '1D', msLayout: '1A', psLayout: '1E' };

  // ── What goes where ──
  const views = sheet.views ?? [];
  const inBody = new Set<number>();
  for (const v of views) for (let i = v.body[0]; i < v.body[1]; i++) inBody.add(i);
  const paper = show(sheet.primitives.filter((_, i) => !inBody.has(i)));
  // Each drawing in model space at full size, side by side with a gap between them.
  let ox = 0;
  const model: Primitive[] = [];
  const vps: Array<{ box: { x: number; y: number; w: number; h: number }; centre: P; height: number }> = [];
  for (const v of views) {
    const body = show(sheet.primitives.slice(v.body[0], v.body[1]));
    const raw = toModel(body, v, { x: 0, y: 0 });
    const xs = raw.flatMap(ptsOf).map((p) => p.x), x0 = xs.length ? Math.min(...xs) : 0;
    const off = { x: ox - x0, y: 0 };
    const placed = toModel(body, v, off);
    model.push(...placed);
    // The viewport looks at the model point under the middle of the paper box.
    const cx = v.from.x + (v.box.x + v.box.w / 2 - v.at.x) * v.scale + off.x, cy = v.from.y + (v.box.y + v.box.h / 2 - v.at.y) * v.scale + off.y;
    vps.push({ box: v.box, centre: { x: cx, y: cy }, height: v.box.h * v.scale });
    const xsP = placed.flatMap(ptsOf).map((p) => p.x);
    ox = (xsP.length ? Math.max(...xsP) : ox) + 2000;
  }

  // ── Blocks: one per bar size for the bars cut in section, one per dimension ──
  const barBlocks = new Map<string, { name: string; r: number; br: string; block: string; end: string }>();
  const barBlockOf = (r: number) => {
    const name = `BAR_R${Math.round(r * 100)}`;
    let b = barBlocks.get(name);
    if (!b) { b = { name, r, br: h(), block: h(), end: h() }; barBlocks.set(name, b); }
    return b;
  };
  const dims: Array<{ name: string; br: string; block: string; end: string; d: Extract<Primitive, { kind: 'dimension' }>; owner: string; ents: Out }> = [];

  const layers = new Set<string>(['0']);
  const ent = (o: Out, kind: string, owner: string, layer: string, paperSpace: boolean) => {
    layers.add(layer);
    o.push(0, kind, 5, h(), 330, owner, 100, 'AcDbEntity');
    if (paperSpace) o.push(67, 1);
    o.push(8, layer, 370, lw(layerOf(layer).weight));
  };
  const write = (o: Out, ps: readonly Primitive[], owner: string, paperSpace: boolean) => {
    for (const p of ps) {
      switch (p.kind) {
        case 'line':
          ent(o, 'LINE', owner, p.layer, paperSpace);
          o.push(100, 'AcDbLine', 10, n(p.a.x), 20, n(p.a.y), 30, 0, 11, n(p.b.x), 21, n(p.b.y), 31, 0);
          break;
        case 'polyline':
          if (p.fill && p.points.length >= 3) {
            ent(o, 'HATCH', owner, p.layer, paperSpace);
            o.push(100, 'AcDbHatch', 10, 0, 20, 0, 30, 0, 210, 0, 220, 0, 230, 1, 2, 'SOLID', 70, 1, 71, 0, 91, 1, 92, 3, 72, 0, 73, 1, 93, p.points.length);
            for (const q of p.points) o.push(10, n(q.x), 20, n(q.y));
            o.push(97, 0, 75, 0, 76, 1, 98, 0);
          } else {
            ent(o, 'LWPOLYLINE', owner, p.layer, paperSpace);
            o.push(100, 'AcDbPolyline', 90, p.points.length, 70, p.closed ? 1 : 0, 43, 0);
            for (const q of p.points) o.push(10, n(q.x), 20, n(q.y));
          }
          break;
        case 'circle':
          if (p.fill) {
            const b = barBlockOf(p.r);
            ent(o, 'INSERT', owner, p.layer, paperSpace);
            o.push(100, 'AcDbBlockReference', 2, b.name, 10, n(p.c.x), 20, n(p.c.y), 30, 0);
          } else {
            ent(o, 'CIRCLE', owner, p.layer, paperSpace);
            o.push(100, 'AcDbCircle', 10, n(p.c.x), 20, n(p.c.y), 30, 0, 40, n(p.r));
          }
          break;
        case 'arc':
          ent(o, 'ARC', owner, p.layer, paperSpace);
          o.push(100, 'AcDbCircle', 10, n(p.c.x), 20, n(p.c.y), 30, 0, 40, n(p.r), 100, 'AcDbArc', 50, n(p.start), 51, n(p.end));
          break;
        case 'text':
          if (TABLE_LAYERS.has(p.layer)) {
            ent(o, 'MTEXT', owner, p.layer, paperSpace);
            const att = p.align === 'center' ? 8 : p.align === 'right' ? 9 : 7;
            o.push(100, 'AcDbMText', 10, n(p.at.x), 20, n(p.at.y), 30, 0, 40, n(p.height), 41, 0, 71, att, 72, 1, 1, enc(p.text), 7, 'Standard', 50, n(((p.rotation ?? 0) * Math.PI) / 180));
          } else {
            ent(o, 'TEXT', owner, p.layer, paperSpace);
            const hj = p.align === 'center' ? 1 : p.align === 'right' ? 2 : 0;
            o.push(100, 'AcDbText', 10, n(p.at.x), 20, n(p.at.y), 30, 0, 40, n(p.height), 1, enc(p.text), 50, n(p.rotation ?? 0), 7, 'Standard');
            if (hj) o.push(72, hj, 11, n(p.at.x), 21, n(p.at.y), 31, 0);
            o.push(100, 'AcDbText', 73, 0);
          }
          break;
        case 'dimension': {
          const g = dimensionGeometry(p), name = `*D${dims.length + 1}`;
          const d = { name, br: h(), block: h(), end: h(), d: p, owner, ents: [] as Out };
          dims.push(d);
          // The block holds what the dimension draws: its extension lines, its line, ticks and text.
          const parts: Primitive[] = [
            ...[...g.ext, g.line].map(([a, b]) => ({ kind: 'line' as const, layer: p.layer, a, b })),
            ...g.line.map((e) => ({ kind: 'line' as const, layer: p.layer, a: { x: e.x - 0.8 * (p.height ?? 2.5) / 2.5, y: e.y - 0.8 * (p.height ?? 2.5) / 2.5 }, b: { x: e.x + 0.8 * (p.height ?? 2.5) / 2.5, y: e.y + 0.8 * (p.height ?? 2.5) / 2.5 } })),
            { kind: 'text' as const, layer: p.layer, at: g.textAt, text: p.text ?? `${Math.round(g.length)}`, height: p.height ?? 2.5, align: 'center' as const, rotation: g.angle },
          ];
          write(d.ents, parts, d.br, false);
          ent(o, 'DIMENSION', owner, p.layer, paperSpace);
          o.push(100, 'AcDbDimension', 2, name, 10, n(g.line[1].x), 20, n(g.line[1].y), 30, 0, 11, n(g.textAt.x), 21, n(g.textAt.y), 31, 0, 70, 33, 1, enc(p.text ?? ''), 3, 'Standard',
            100, 'AcDbAlignedDimension', 13, n(p.a.x), 23, n(p.a.y), 33, 0, 14, n(p.b.x), 24, n(p.b.y), 34, 0);
          break;
        }
      }
    }
  };

  const msEnts: Out = [], psEnts: Out = [];
  write(msEnts, model, H.msBr, false);
  write(psEnts, paper, H.psBr, true);
  // The sheet's own viewport (id 1), then one per drawing.
  const vp = (o: Out, c: P, w: number, ht: number, id: number, view: P, viewH: number) => {
    o.push(0, 'VIEWPORT', 5, h(), 330, H.psBr, 100, 'AcDbEntity', 67, 1, 8, 'VIEWPORTS', 100, 'AcDbViewport',
      10, n(c.x), 20, n(c.y), 30, 0, 40, n(w), 41, n(ht), 68, id === 1 ? 1 : 2, 69, id, 12, n(view.x), 22, n(view.y), 13, 0, 23, 0, 14, 10, 24, 10, 15, 10, 25, 10,
      16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 42, 50, 43, 0, 44, 0, 45, n(viewH), 50, 0, 51, 0, 72, 100, 90, id === 1 ? 557088 : 32864, 1, '', 281, 0, 71, 0, 74, 0,
      110, 0, 120, 0, 130, 0, 111, 1, 121, 0, 131, 0, 112, 0, 122, 1, 132, 0, 79, 0, 146, 0);
  };
  const psVp: Out = [];
  layers.add('VIEWPORTS');
  vp(psVp, { x: sheet.width / 2, y: sheet.height / 2 }, sheet.width * 1.1, sheet.height * 1.1, 1, { x: sheet.width / 2, y: sheet.height / 2 }, sheet.height * 1.1);
  vps.forEach((v, i) => vp(psVp, { x: v.box.x + v.box.w / 2, y: v.box.y + v.box.h / 2 }, v.box.w, v.box.h, i + 2, v.centre, v.height));
  const firstVp = psVp[3] as string;

  // Blocks' contents.
  const blockEnts = new Map<string, Out>();
  for (const b of barBlocks.values()) {
    const o: Out = [];
    // A filled disc: a closed two-vertex polyline of half-circle bulges, as wide as the radius.
    o.push(0, 'LWPOLYLINE', 5, h(), 330, b.br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbPolyline', 90, 2, 70, 1, 43, n(b.r), 10, n(-b.r / 2), 20, 0, 42, 1, 10, n(b.r / 2), 20, 0, 42, 1);
    blockEnts.set(b.name, o);
  }

  const o: Out = [];
  const seed = () => (seq + 16).toString(16).toUpperCase();
  // ── HEADER ──
  o.push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1018', 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1,
    9, '$LUNITS', 70, 2, 9, '$TILEMODE', 70, 0, 9, '$HANDSEED', 5, '__SEED__', 0, 'ENDSEC');
  o.push(0, 'SECTION', 2, 'CLASSES', 0, 'ENDSEC');
  // ── TABLES ──
  o.push(0, 'SECTION', 2, 'TABLES');
  o.push(0, 'TABLE', 2, 'VPORT', 5, H.vport, 330, 0, 100, 'AcDbSymbolTable', 70, 1,
    0, 'VPORT', 5, h(), 330, H.vport, 100, 'AcDbSymbolTableRecord', 100, 'AcDbViewportTableRecord', 2, '*Active', 70, 0, 10, 0, 20, 0, 11, 1, 21, 1, 12, n(ox / 2), 22, 0, 13, 0, 23, 0, 14, 10, 24, 10, 15, 10, 25, 10,
    16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 40, n(Math.max(1000, ox)), 41, 1.4, 42, 50, 43, 0, 44, 0, 50, 0, 51, 0, 71, 0, 72, 100, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0, 0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'LTYPE', 5, H.ltype, 330, 0, 100, 'AcDbSymbolTable', 70, 4);
  for (const name of ['ByBlock', 'ByLayer', 'Continuous']) o.push(0, 'LTYPE', 5, h(), 330, H.ltype, 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, name, 70, 0, 3, '', 72, 65, 73, 0, 40, 0);
  o.push(0, 'LTYPE', 5, h(), 330, H.ltype, 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 5, 49, 3, 74, 0, 49, -2, 74, 0, 0, 'ENDTAB');
  const lay = [...layers];
  o.push(0, 'TABLE', 2, 'LAYER', 5, H.layer, 330, 0, 100, 'AcDbSymbolTable', 70, lay.length);
  for (const name of lay) {
    const d = name === '0' || name === 'VIEWPORTS' ? { color: 7, weight: 0.25, dashed: false } : layerOf(name);
    o.push(0, 'LAYER', 5, h(), 330, H.layer, 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, name, 70, 0, 62, d.color, 6, d.dashed ? 'DASHED' : 'Continuous', ...(name === 'VIEWPORTS' ? [290, 0] : []), 370, lw(d.weight), 390, '0');
  }
  o.push(0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'STYLE', 5, H.style, 330, 0, 100, 'AcDbSymbolTable', 70, 1,
    0, 'STYLE', 5, h(), 330, H.style, 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'Standard', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'arial.ttf', 4, '', 0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'VIEW', 5, H.view, 330, 0, 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'UCS', 5, H.ucs, 330, 0, 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'APPID', 5, H.appid, 330, 0, 100, 'AcDbSymbolTable', 70, 1,
    0, 'APPID', 5, h(), 330, H.appid, 100, 'AcDbSymbolTableRecord', 100, 'AcDbRegAppTableRecord', 2, 'ACAD', 70, 0, 0, 'ENDTAB');
  o.push(0, 'TABLE', 2, 'DIMSTYLE', 5, H.dimstyle, 330, 0, 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable',
    0, 'DIMSTYLE', 105, h(), 330, H.dimstyle, 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 40, 1, 41, 2.5, 42, 0.625, 43, 3.75, 44, 1.25, 140, 2.5, 141, 2.5, 147, 0.625, 0, 'ENDTAB');
  const brs = [...barBlocks.values(), ...dims];
  o.push(0, 'TABLE', 2, 'BLOCK_RECORD', 5, H.brTable, 330, 0, 100, 'AcDbSymbolTable', 70, 2 + brs.length,
    0, 'BLOCK_RECORD', 5, H.msBr, 330, H.brTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Model_Space', 340, H.msLayout,
    0, 'BLOCK_RECORD', 5, H.psBr, 330, H.brTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Paper_Space', 340, H.psLayout);
  for (const b of brs) o.push(0, 'BLOCK_RECORD', 5, b.br, 330, H.brTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, b.name, 340, 0);
  o.push(0, 'ENDTAB', 0, 'ENDSEC');
  // ── BLOCKS ──
  o.push(0, 'SECTION', 2, 'BLOCKS');
  const block = (br: string, bh: string, eh: string, name: string, flags: number, ents: Out, paperSpace = false) => {
    o.push(0, 'BLOCK', 5, bh, 330, br, 100, 'AcDbEntity', ...(paperSpace ? [67, 1] : []), 8, '0', 100, 'AcDbBlockBegin', 2, name, 70, flags, 10, 0, 20, 0, 30, 0, 3, name, 1, '');
    o.push(...ents);
    o.push(0, 'ENDBLK', 5, eh, 330, br, 100, 'AcDbEntity', ...(paperSpace ? [67, 1] : []), 8, '0', 100, 'AcDbBlockEnd');
  };
  block(H.msBr, H.msBlock, H.msEnd, '*Model_Space', 0, []);
  block(H.psBr, H.psBlock, H.psEnd, '*Paper_Space', 0, [], true);
  for (const b of barBlocks.values()) block(b.br, b.block, b.end, b.name, 0, blockEnts.get(b.name)!);
  for (const d of dims) block(d.br, d.block, d.end, d.name, 1, d.ents);
  o.push(0, 'ENDSEC');
  // ── ENTITIES: model space, then the sheet's paper space with its viewports ──
  o.push(0, 'SECTION', 2, 'ENTITIES', ...msEnts, ...psVp, ...psEnts, 0, 'ENDSEC');
  // ── OBJECTS ──
  const plot = (handle: string, name: string, model: boolean) => [
    0, 'LAYOUT', 5, handle, 330, H.layoutDict, 100, 'AcDbPlotSettings', 1, '', 2, 'none_device', 4, model ? '' : `${sheet.format}`, 6, '',
    40, 0, 41, 0, 42, 0, 43, 0, 44, n(sheet.width), 45, n(sheet.height), 46, 0, 47, 0, 48, 0, 49, 0, 140, 0, 141, 0, 142, 1, 143, 1,
    70, model ? 1024 : 672, 72, 1, 73, 0, 74, 5, 7, '', 75, 16, 76, 0, 77, 2, 78, 300, 147, 1, 148, 0, 149, 0,
    100, 'AcDbLayout', 1, name, 70, 1, 71, model ? 0 : 1, 10, 0, 20, 0, 11, n(model ? 420 : sheet.width), 21, n(model ? 297 : sheet.height), 12, 0, 22, 0, 32, 0,
    14, 0, 24, 0, 34, 0, 15, 0, 25, 0, 35, 0, 146, 0, 13, 0, 23, 0, 33, 0, 16, 1, 26, 0, 36, 0, 17, 0, 27, 1, 37, 0, 76, 0,
    330, model ? H.msBr : H.psBr, ...(model ? [] : [331, firstVp]),
  ];
  const layoutName = enc(sheet.number);
  o.push(0, 'SECTION', 2, 'OBJECTS',
    0, 'DICTIONARY', 5, H.root, 330, 0, 100, 'AcDbDictionary', 281, 1, 3, 'ACAD_GROUP', 350, H.group, 3, 'ACAD_LAYOUT', 350, H.layoutDict,
    0, 'DICTIONARY', 5, H.group, 330, H.root, 100, 'AcDbDictionary', 281, 1,
    0, 'DICTIONARY', 5, H.layoutDict, 330, H.root, 100, 'AcDbDictionary', 281, 1, 3, 'Model', 350, H.msLayout, 3, layoutName, 350, H.psLayout,
    ...plot(H.msLayout, 'Model', true), ...plot(H.psLayout, layoutName, false),
    0, 'ENDSEC', 0, 'EOF');
  const text = o.map(String).join('\r\n') + '\r\n';
  // Group codes and values alternate: every handle is in, so the seed is the next free one.
  return text.replace('__SEED__', seed());
}

function ptsOf(p: Primitive): P[] {
  switch (p.kind) {
    case 'line': return [p.a, p.b];
    case 'polyline': return p.points;
    case 'circle': case 'arc': return [{ x: p.c.x - p.r, y: p.c.y }, { x: p.c.x + p.r, y: p.c.y }];
    case 'text': return [p.at];
    case 'dimension': return [p.a, p.b];
  }
}
