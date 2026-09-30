/** A section outline read from a DXF: loops become parts, loops inside loops holes. */
import { describe, it, expect } from 'vitest';
import { dxfSectionParts } from '../drawn-dxf';
import { assembleDrawn, areaOf } from '../drawn';

const line = (x1: number, y1: number, x2: number, y2: number) =>
  ['0', 'LINE', '8', '0', '10', `${x1}`, '20', `${y1}`, '30', '0', '11', `${x2}`, '21', `${y2}`, '31', '0'].join('\n');
const circle = (x: number, y: number, r: number) =>
  ['0', 'CIRCLE', '8', '0', '10', `${x}`, '20', `${y}`, '30', '0', '40', `${r}`].join('\n');
const box = (x0: number, y0: number, x1: number, y1: number) =>
  [line(x0, y0, x1, y0), line(x1, y0, x1, y1), line(x1, y1, x0, y1), line(x0, y1, x0, y0)].join('\n');
const dxf = (...entities: string[]) =>
  ['0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('DXF section outline', () => {
  it('a box with a box inside it and a circular hole: one solid, two holes, centred', () => {
    // Drawn in millimetres somewhere on the sheet.
    const text = dxf(box(1000, 500, 1200, 800), box(1020, 520, 1180, 700), circle(1100, 750, 20));
    const r = dxfSectionParts(text, 'mm');
    expect(r.loops).toBe(2);
    expect(r.circles).toBe(1);
    expect(r.open).toBe(0);
    expect(r.parts.filter((p) => p.void)).toHaveLength(2);
    const asm = assembleDrawn({ version: 1, parts: r.parts }, () => null);
    expect(asm.issues).toEqual([]);
    const want = 0.2 * 0.3 - 0.16 * 0.18 - Math.PI * 0.02 ** 2;
    // The circle is a 64-gon: within its polygon's deficit of the true circle.
    expect(Math.abs(areaOf(asm.pieces) - want) / want).toBeLessThan(2e-3);
    const bb = asm.pieces.flat(2);
    const ys = bb.map((p) => p[0]), zs = bb.map((p) => p[1]);
    expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...zs) + Math.min(...zs)).toBeCloseTo(0, 9);
  });

  it('segments that close nothing are counted, not guessed', () => {
    const r = dxfSectionParts(dxf(line(0, 0, 1, 0), line(1, 0, 1, 1)), 'm');
    expect(r.parts).toEqual([]);
    expect(r.open).toBe(2);
  });

  it('a tube drawn as two concentric circles is a ring: the inner circle is the hole', () => {
    // Circles contain too — before, only loops counted as containers and the tube
    // came in as two solid discs (and a spurious overlap warning).
    const r = dxfSectionParts(dxf(circle(500, 500, 100), circle(500, 500, 80)), 'mm');
    expect(r.parts).toHaveLength(2);
    const solid = r.parts.filter((p) => !p.void), holes = r.parts.filter((p) => p.void);
    expect(solid).toHaveLength(1);
    expect(holes).toHaveLength(1);
    expect(holes[0]!.shape).toMatchObject({ kind: 'circle', d: 0.16 });
    const asm = assembleDrawn({ version: 1, parts: r.parts }, () => null);
    expect(asm.issues).toEqual([]);
    const want = Math.PI * (0.1 ** 2 - 0.08 ** 2);
    expect(Math.abs(areaOf(asm.pieces) - want) / want).toBeLessThan(2e-3);
  });

  it('a loop inside a circle is a hole in it', () => {
    const r = dxfSectionParts(dxf(circle(0, 0, 100), box(-20, -20, 20, 20)), 'mm');
    expect(r.parts.filter((p) => p.void)).toHaveLength(1);
    expect(r.parts.find((p) => p.void)!.shape.kind).toBe('polygon');
  });
});
