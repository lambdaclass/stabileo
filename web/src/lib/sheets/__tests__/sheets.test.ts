import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { fittingScale, formatGeometry } from '../formats';
import { composeSheets } from '../compose';
import { buildSheetSet, sheetDxf, sheetSetPdf, sheetSvg } from '../sheet-set';
import { drawingPrimitives } from '../adapter';
import type { Sheet } from '../../engine/detailing/drawings';

/** A beam elevation of 6 × 0,6 m: an outline, a bar, a label and a dimension. */
const beam = (title: string): Sheet => ({
  kind: 'beamElevation',
  title: { sheetNumber: 'R1-1', title, codeEdition: '2025', clauses: [], revision: 1, reviewState: 'REVIEW_DRAFT', superseded: false, maturity: 'IMPLEMENTED_PROVISIONAL', scale: 50 } as Sheet['title'],
  polylines: [{ layer: 'RC-OUTLINE', points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 0.6 }, { x: 0, y: 0.6 }], closed: true }, { layer: 'RC-BAR', points: [{ x: 0.05, y: 0.05 }, { x: 5.95, y: 0.05 }], closed: false }],
  circles: [], texts: [{ layer: 'RC-TEXT', at: { x: 3, y: 0.7 }, height: 0.125, text: 'V1 30×60 — Ø16 inferior' }],
  dimensions: [{ layer: 'RC-DIM', from: { x: 0, y: 0 }, to: { x: 6, y: 0 }, label: '6,00', offset: -0.4 }],
  notes: [], extents: { min: { x: 0, y: 0 }, max: { x: 6, y: 0.6 } },
});

const label = (k: string) => ({ 'sheet.index.title': 'Índice de láminas', 'sheet.tb.sheet': 'Lámina', 'sheet.tb.number': 'N.º' } as Record<string, string>)[k] ?? k;

describe('sheet formats and scales', () => {
  it('A1 is 841 × 594 with a 180 × 56 title block in the frame corner', () => {
    const g = formatGeometry('A1');
    expect([g.width, g.height]).toEqual([841, 594]);
    expect(g.titleBlock).toEqual({ x0: 651, y0: 10, x1: 831, y1: 66 });
  });
  it('takes the largest standard scale that fits', () => {
    // 6000 mm into 400 mm: 1:20 gives 300 mm.
    expect(fittingScale(6000, 600, 400, 300)).toBe(20);
    expect(fittingScale(60000, 600, 400, 300)).toBe(200);
  });
});

describe('composing drawings onto sheets', () => {
  it('lays drawings in rows and opens a new sheet when one is full', () => {
    const d = drawingPrimitives(beam('V1'));
    expect(d.width).toBeCloseTo(6000, 6);
    const many = Array.from({ length: 30 }, (_, k) => ({ key: `b${k}`, title: `V${k + 1}`, ...d, scale: 50 }));
    const s = composeSheets(many, 'A3');
    expect(s.length).toBeGreaterThan(1);
    expect(s.flatMap((x) => x.drawings)).toHaveLength(30);
  });
});

describe('the sheet set', () => {
  const set = buildSheetSet({
    drawings: [{ key: 'v1', title: 'Viga V1', ...drawingPrimitives(beam('Viga V1')) }],
    settings: { format: 'A3', prefix: 'E-', start: 1 },
    project: { office: 'Estudio', project: 'Edificio', client: 'Cliente', designer: 'B. Ch.' },
    projectRevision: { code: 'A', date: '2026-10-11', note: 'Para revisión' }, label,
  });
  it('numbers the sheets after an index', () => {
    expect(set.map((s) => s.number)).toEqual(['E-01', 'E-02']);
    expect(set[0]!.title).toBe('Índice de láminas');
  });
  it('writes a DXF a parser reads back: the layer table and a DIMENSION', () => {
    const dxf = new DxfParser().parseSync(sheetDxf(set[1]!))!;
    const layers = Object.keys(dxf.tables.layer.layers);
    expect(layers).toEqual(expect.arrayContaining(['SHEET-FRAME', 'SHEET-TITLE', 'RC-OUTLINE', 'RC-BAR', 'RC-DIM']));
    expect(dxf.entities.some((e) => e.type === 'DIMENSION')).toBe(true);
    expect(dxf.entities.some((e) => e.type === 'TEXT' && (e as { text?: string }).text === 'E-02')).toBe(true);
  });
  it('writes a PDF with searchable text, accents in WinAnsi', () => {
    const pdf = sheetSetPdf(set, 'Edificio');
    const s = String.fromCharCode(...pdf);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('/Count 2');
    expect(s).toContain('(E-02) Tj');
    // «Índice de láminas»: Í = 0xCD, á = 0xE1.
    expect(s).toContain(`(${String.fromCharCode(0xcd)}ndice de l${String.fromCharCode(0xe1)}minas) Tj`);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('matches the golden of the beam sheet', async () => {
    await expect(sheetSvg(set[1]!)).toMatchFileSnapshot('./__goldens__/beam-sheet-a3.svg');
  });
});
