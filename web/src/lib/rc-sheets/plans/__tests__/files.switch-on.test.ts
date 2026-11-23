/**
 * The drawings as files: each sheet a DXF 2004 that a CAD reader parses, in millimetres, with the
 * reinforcement layers declared and the dimensions as DIMENSION entities, the drawings at full
 * size in model space; one vector PDF with a page at each sheet's size; one file as it is and
 * several zipped.
 */
import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { unzipSync } from 'fflate';
import { DEFAULT_PLAN_SCALES, planDownload, planDrawings, planFiles, planSheets, type PlanFormat } from '../sheets';
import { columnStack, fmt, level, tr, twoSpanLine, wall } from './fixtures';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const { line, rows } = twoSpanLine();
const pr = { line: [line], beam: rows, column: columnStack(), slab: level().rows, slabPlan: [level().plan], wall: [wall()] };
const project = { name: 'Edificio', author: 'B. P.', licence: '1234', date: '2026-11-15' };

function sheetsOf(format: PlanFormat, families: Array<'beam' | 'column' | 'slab' | 'wall'> = ['beam']) {
  const o = { format, scales: DEFAULT_PLAN_SCALES, code: 'cirsoc201-2025' as const, endZones: false, slabCover: 0.02, fmt, tr };
  const { drawings, levels } = planDrawings(pr, { families, levels: null }, o);
  return planSheets(drawings, levels, format, project, tr);
}

type Dxf = { header: Record<string, unknown>; entities: Array<Record<string, unknown>>; tables: { layer: { layers: Record<string, unknown> } } };

describe('the drawings as DXF', () => {
  const sheets = sheetsOf('A3');
  const files = planFiles(sheets, { dxf: true, pdf: false }, 'V1', 'V1');
  const text = latin1(files[0]!.data);
  const dxf = new DxfParser().parseSync(text) as unknown as Dxf;
  const all = files.map((f) => new DxfParser().parseSync(latin1(f.data)) as unknown as Dxf);
  const entities = all.flatMap((d) => d.entities);

  it('writes one file per sheet, a 2004 DXF in millimetres', () => {
    expect(files.map((f) => f.name)).toEqual(sheets.map((s) => `V1-${s.number}.dxf`));
    expect(dxf.header.$ACADVER).toBe('AC1018');
    expect(dxf.header.$INSUNITS).toBe(4);
  });

  it('declares the reinforcement layers: bars by layer and diameter, dimensions, texts, concrete and axes', () => {
    const layers = [...new Set(all.flatMap((d) => Object.keys(d.tables.layer.layers)))];
    for (const l of ['ST-HORM', 'ST-COTA', 'ST-TEXTO', 'ST-EJES']) expect(layers).toContain(l);
    const bars = line.bars.filter((b) => b.kind !== 'bent').map((b) => `ST-ARM-${b.face === 'top' ? 'SUP' : 'INF'}-Ø${b.bars.dia}`);
    for (const l of bars) expect(layers).toContain(l);
    expect(layers.some((l) => /^ST-ARM-EST-Ø\d+$/.test(l))).toBe(true);
  });

  it('dimensions with DIMENSION entities in model space, measuring real millimetres', () => {
    const d = entities.filter((e) => e.type === 'DIMENSION' && !e.inPaperSpace && e.layer === 'ST-COTA');
    expect(d.length).toBeGreaterThan(5);
    const lengths = d.map((e) => {
      const p = e as { linearOrAngularPoint1: { x: number; y: number }; linearOrAngularPoint2: { x: number; y: number } };
      return Math.round(Math.hypot(p.linearOrAngularPoint2.x - p.linearOrAngularPoint1.x, p.linearOrAngularPoint2.y - p.linearOrAngularPoint1.y));
    });
    for (const sp of line.spans) expect(lengths).toContain(Math.round((sp.x1 - sp.x0) * 1000));
    expect(lengths).toContain(250);
    expect(lengths).toContain(500);
  });

  it('draws the concrete at full size in model space: the section 250 by 500 mm', () => {
    const outlines = entities.filter((e) => e.type === 'LWPOLYLINE' && !e.inPaperSpace && e.layer === 'ST-HORM') as Array<{ vertices: Array<{ x: number; y: number }> }>;
    const sizes = outlines.map((o) => { const xs = o.vertices.map((v) => v.x), ys = o.vertices.map((v) => v.y); return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))].join('x'); });
    expect(sizes).toContain('250x500');
  });

  it('lays out each sheet in paper space at its A size with a viewport per drawing', () => {
    expect(text).toContain('\r\nA3\r\n');
    expect(text.split('\r\n0\r\nVIEWPORT\r\n').length - 1).toBe(1 + (sheets[0]!.views?.length ?? 0));
  });
});

describe('the drawings as PDF', () => {
  const mediaBox = (pdf: string) => [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const pt = (mm: number) => (mm * 72) / 25.4;

  it('is one vector PDF with a page per sheet at its size, A3 by default', () => {
    const sheets = sheetsOf('A3');
    const [pdf] = planFiles(sheets, { dxf: false, pdf: true }, 'V1', 'V1');
    const s = latin1(pdf!.data);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf!.data.length).toBeGreaterThan(5000);
    const boxes = mediaBox(s);
    expect(boxes.length).toBe(sheets.length);
    for (const [w, h] of boxes) { expect(w).toBeCloseTo(pt(420), 2); expect(h).toBeCloseTo(pt(297), 2); }
    expect(s).toMatch(/ re |\bl S\b/);
  });

  it('at A1 and A0 when chosen', () => {
    for (const [f, w, h] of [['A1', 841, 594], ['A0', 1189, 841]] as const) {
      const [pdf] = planFiles(sheetsOf(f, ['beam', 'slab']), { dxf: false, pdf: true }, 'x', 'x');
      for (const [bw, bh] of mediaBox(latin1(pdf!.data))) { expect(bw).toBeCloseTo(pt(w), 2); expect(bh).toBeCloseTo(pt(h), 2); }
    }
  });
});

describe('the download', () => {
  it('is the file itself when there is one, and a zip of them all when there are several', () => {
    const sheets = sheetsOf('A1', ['column']);
    const one = planDownload(planFiles(sheets.slice(0, 1), { dxf: false, pdf: true }, 'C', 'C'), 'C')!;
    expect(one.name).toBe('C.pdf');
    expect(one.mime).toBe('application/pdf');
    const both = planDownload(planFiles(sheets, { dxf: true, pdf: true }, 'C', 'C'), 'C')!;
    expect(both.name).toBe('C.zip');
    const names = Object.keys(unzipSync(both.data));
    expect(names).toContain('C.pdf');
    expect(names.filter((n) => n.endsWith('.dxf')).length).toBe(sheets.length);
    expect(planDownload([], 'C')).toBeNull();
  });
});
