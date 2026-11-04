/**
 * The DXF 2004: the drawings at a scale in model space at full size, the sheet as a layout with a
 * viewport per drawing, tables as MTEXT, bars cut in section as INSERTs of one block per size, and
 * the file in the code page it declares. Read back with the DXF parser the importer uses.
 */
import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { dxf2004Bytes, sheetToDxf2004 } from '../to-dxf2004';
import type { SetSheet } from '../sheet-set';

// A sheet with one drawing at 1:50 (a 100 mm line drawn 2 mm long, a bar cut in section, a text)
// and a table text on paper.
const sheet: SetSheet = {
  number: 'E-02', title: 'Plan', format: 'A3', width: 420, height: 297, drawings: ['d:plan'],
  primitives: [
    { kind: 'polyline', layer: 'SHEET-FRAME', closed: true, points: [{ x: 1, y: 1 }, { x: 419, y: 1 }, { x: 419, y: 296 }, { x: 1, y: 296 }] },
    { kind: 'line', layer: 'RC-OUTLINE', a: { x: 100, y: 100 }, b: { x: 102, y: 100 } },
    { kind: 'circle', layer: 'RC-CUT-BAR', c: { x: 101, y: 101 }, r: 0.16, fill: true },
    { kind: 'text', layer: 'RC-TEXT', at: { x: 100, y: 104 }, text: '4Ø12 — L² ℓ', height: 2.5 },
    { kind: 'text', layer: 'RC-TITLE', at: { x: 100, y: 92 }, text: 'Plan — 1:50', height: 3 },
    { kind: 'text', layer: 'TB-TEXT', at: { x: 300, y: 50 }, text: 'Cuadro', height: 2.5 },
  ],
  views: [{ key: 'd:plan', scale: 50, body: [1, 4], at: { x: 100, y: 100 }, from: { x: 0, y: 0 }, box: { x: 99, y: 99, w: 10, h: 10 } }],
};

describe('a sheet as DXF 2004', () => {
  const text = sheetToDxf2004(sheet);
  const dxf = new DxfParser().parseSync(text) as unknown as { header: Record<string, unknown>; entities: Array<Record<string, unknown>>; blocks: Record<string, unknown>; tables: { layer: { layers: Record<string, unknown> } } };

  it('is version 2004 in millimetres', () => {
    expect(dxf.header.$ACADVER).toBe('AC1018');
    expect(dxf.header.$INSUNITS).toBe(4);
  });

  it('puts the drawing in model space at full size: 2 mm on paper at 1:50 is 100 mm', () => {
    const line = dxf.entities.find((e) => e.type === 'LINE' && !e.inPaperSpace) as { vertices: Array<{ x: number; y: number }> };
    expect(Math.hypot(line.vertices[1]!.x - line.vertices[0]!.x, line.vertices[1]!.y - line.vertices[0]!.y)).toBeCloseTo(100, 6);
    const text = dxf.entities.find((e) => e.type === 'TEXT' && !e.inPaperSpace) as { textHeight: number };
    expect(text.textHeight).toBeCloseTo(125, 6);
  });

  it('shows it through a viewport at its scale, and keeps the frame, caption and table of the sheet on paper', () => {
    // The parser skips viewports: read them off the group codes.
    const lines = text.split('\r\n'), vps: Array<Record<number, string>> = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      if (lines[i]!.trim() === '0' && lines[i + 1] === 'VIEWPORT') vps.push({});
      else if (lines[i]!.trim() === '0') continue;
      else if (vps.length && !Object.prototype.hasOwnProperty.call(vps.at(-1)!, 0)) vps.at(-1)![Number(lines[i])] ??= lines[i + 1]!;
    }
    expect(vps.map((v) => Number(v[69]))).toEqual([1, 2]);
    expect(Number(vps[1]![45]) / Number(vps[1]![41])).toBeCloseTo(50, 6);
    expect(dxf.entities.some((e) => e.type === 'MTEXT' && e.inPaperSpace)).toBe(true);
    expect(dxf.entities.some((e) => e.type === 'LWPOLYLINE' && e.inPaperSpace)).toBe(true);
  });

  it('draws a bar cut in section as an insert of the block of its size', () => {
    const ins = dxf.entities.find((e) => e.type === 'INSERT') as { name: string };
    expect(ins.name).toBe('BAR_R800');
    expect(dxf.blocks[ins.name]).toBeDefined();
  });

  it('writes its texts in the code page it declares, and what that page lacks as \\U+', () => {
    const bytes = dxf2004Bytes(text);
    const latin = Buffer.from(bytes).toString('latin1');
    expect(latin).toContain('4\xd812 \x97 L\xb2 \\U+2113');
  });
});
