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
/** A closed LWPOLYLINE; a third number on a vertex is the bulge of the segment it starts. */
const lwpoly = (pts: Array<[number, number, number?]>) =>
  ['0', 'LWPOLYLINE', '8', '0', '90', `${pts.length}`, '70', '1',
    ...pts.flatMap(([x, y, b]) => ['10', `${x}`, '20', `${y}`, ...(b ? ['42', `${b}`] : [])])].join('\n');
/** What MIRROR leaves on an entity: extrusion direction (0, 0, −1). */
const mirroredZ = ['210', '0', '220', '0', '230', '-1'];
/** A drawing with one block definition. */
const withBlock = (name: string, block: string[], ...entities: string[]) =>
  ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '30', '0',
    ...block, '0', 'ENDBLK', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n');
const insert = (name: string, x: number, y: number, extra: string[] = []) =>
  ['0', 'INSERT', '8', '0', '2', name, '10', `${x}`, '20', `${y}`, '30', '0', ...extra].join('\n');
const extent = (r: { parts: Parameters<typeof assembleDrawn>[0]['parts'] }) => {
  const pts = assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces.flat(2);
  const ys = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return [Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs)];
};

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

  it('arcs close a loop with the lines they meet', () => {
    const arc = (x: number, y: number, r: number, a0: number, a1: number) =>
      ['0', 'ARC', '8', '0', '10', `${x}`, '20', `${y}`, '30', '0', '40', `${r}`, '50', `${a0}`, '51', `${a1}`].join('\n');
    // A half disc of radius 100 mm: the diameter as a line, the curve as an arc.
    const r = dxfSectionParts(dxf(line(-100, 0, 100, 0), arc(0, 0, 100, 0, 180)), 'mm');
    expect(r.loops).toBe(1);
    expect(r.open).toBe(0);
    const asm = assembleDrawn({ version: 1, parts: r.parts }, () => null);
    const want = (Math.PI * 0.1 ** 2) / 2;
    expect(Math.abs(areaOf(asm.pieces) - want) / want).toBeLessThan(3e-3);
  });

  it('closed polylines that share an edge are both read', () => {
    const lw = (pts: Array<[number, number]>) =>
      ['0', 'LWPOLYLINE', '8', '0', '90', `${pts.length}`, '70', '1', ...pts.flatMap(([x, y]) => ['10', `${x}`, '20', `${y}`])].join('\n');
    const r = dxfSectionParts(dxf(lw([[0, 0], [100, 0], [100, 50], [0, 50]]), lw([[0, 50], [100, 50], [100, 100], [0, 100]])), 'mm');
    expect(r.loops).toBe(2);
    expect(r.parts.filter((p) => p.void)).toHaveLength(0);
  });

  /*
   * Polyline arcs. The parser used to keep a polyline's vertices and drop its bulges, so a circle
   * drawn as a polyline (two vertices, bulge 1 each) was two points and no part at all, and a
   * plate with rounded corners was imported with square ones, short of its fillets' area.
   */
  it('a circle drawn as a closed two-vertex polyline with bulges is a disc', () => {
    const r = dxfSectionParts(dxf(lwpoly([[-50, 0, 1], [50, 0, 1]])), 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.open).toBe(0);
    const want = Math.PI * 0.05 ** 2;
    expect(Math.abs(areaOf(assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces) - want) / want).toBeLessThan(2e-3);
  });

  it('a plate with rounded corners drawn as one polyline keeps its fillets', () => {
    const R = 20, s = 50, k = Math.tan(Math.PI / 8); // the bulge of a quarter turn
    const r = dxfSectionParts(dxf(lwpoly([
      [-s + R, -s], [s - R, -s, k], [s, -s + R], [s, s - R, k], [s - R, s], [-s + R, s, k], [-s, s - R], [-s, -s + R, k],
    ])), 'mm');
    const want = 0.1 * 0.1 - (4 - Math.PI) * 0.02 ** 2;
    const got = areaOf(assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces);
    expect(Math.abs(got - want) / want).toBeLessThan(1e-3);
  });

  /*
   * Mirrored entities. MIRROR leaves an arc in a frame whose x runs the other way (extrusion
   * 0, 0, −1); read as if it were not, the arc of a quarter disc swung to the other quadrant and
   * closed nothing.
   */
  it('a quarter disc whose arc was mirrored closes', () => {
    // In that frame centre 0, 0..90° runs from the drawing's (-100, 0) to (0, 100).
    const arc = ['0', 'ARC', '8', '0', '10', '0', '20', '0', '30', '0', '40', '100', ...mirroredZ, '50', '0', '51', '90'].join('\n');
    const r = dxfSectionParts(dxf(line(0, 0, -100, 0), line(0, 0, 0, 100), arc), 'mm');
    expect(r.loops).toBe(1);
    expect(r.open).toBe(0);
    const want = (Math.PI * 0.1 ** 2) / 4;
    expect(Math.abs(areaOf(assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces) - want) / want).toBeLessThan(3e-3);
  });

  it('a mirrored circle is a hole on the side it was drawn', () => {
    // Centre (50, 0) in the mirrored frame is (-50, 0) in the drawing: inside the plate.
    const hole = ['0', 'CIRCLE', '8', '0', '10', '50', '20', '0', '30', '0', '40', '10', ...mirroredZ].join('\n');
    const r = dxfSectionParts(dxf(box(-100, -20, 0, 20), hole), 'mm');
    expect(r.parts.filter((p) => p.void)).toHaveLength(1);
  });

  it('a mirrored polyline is drawn where it lands, its arcs turning the other way', () => {
    // A half disc in its own frame at x from -60 to -10: the closing arc from (-10, 50) to
    // (-10, -50) turns counter-clockwise (bulge 1), out to -x. In the drawing it spans x from 10
    // to 60, inside the plate; read unmirrored it would sit outside it.
    const d = ['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '1', '10', '-10', '20', '-50', '10', '-10', '20', '50', '42', '1', ...mirroredZ].join('\n');
    const r = dxfSectionParts(dxf(box(0, -60, 120, 60), d), 'mm');
    expect(r.parts.filter((p) => p.void)).toHaveLength(1);
    const want = 0.12 * 0.12 - (Math.PI * 0.05 ** 2) / 2;
    expect(Math.abs(areaOf(assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces) - want) / want).toBeLessThan(2e-3);
  });

  /*
   * Block references. A section from a profile library arrives as an INSERT of a block, and the
   * import drew nothing and said nothing: no part, nothing skipped, no problem.
   */
  it('a block reference is drawn: placed, scaled and turned as the insert says', () => {
    const plate = lwpoly([[0, 0], [100, 0], [100, 50], [0, 50]]).split('\n');
    const r = dxfSectionParts(withBlock('SEC', plate, insert('SEC', 500, 500, ['41', '2', '42', '2', '50', '90'])), 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.skipped).toEqual([]);
    // 200 x 100 once scaled, standing 200 tall once turned.
    const [w, h] = extent(r);
    expect(w).toBeCloseTo(0.1, 9);
    expect(h).toBeCloseTo(0.2, 9);
  });

  it('a block reference with a hole in the block keeps the hole', () => {
    const block = [...box(0, 0, 100, 100).split('\n'), ...circle(50, 50, 20).split('\n')];
    const r = dxfSectionParts(withBlock('PL', block, insert('PL', 0, 0, mirroredZ)), 'mm');
    expect(r.parts.filter((p) => p.void)).toHaveLength(1);
    const want = 0.01 - Math.PI * 0.02 ** 2;
    expect(Math.abs(areaOf(assembleDrawn({ version: 1, parts: r.parts }, () => null).pieces) - want) / want).toBeLessThan(2e-3);
  });

  it('what cannot be drawn is reported: a reference to a missing block, a hatch', () => {
    const hatch = ['0', 'HATCH', '8', '0', '10', '0', '20', '0', '30', '0', '2', 'SOLID', '70', '1'].join('\n');
    const r = dxfSectionParts(dxf(box(0, 0, 100, 100), insert('NOWHERE', 0, 0), hatch), 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.skipped).toEqual(expect.arrayContaining(['INSERT', 'HATCH']));
  });

  it('a file that is not a DXF says so, rather than reporting no outlines', () => {
    const r = dxfSectionParts('this is not a drawing', 'mm');
    expect(r.parts).toEqual([]);
    expect(r.problem).toBe('parseError');
  });
});

/*
 * PR 250 review, round 2. Pieces the file holds but the import must not draw (paper space, hidden
 * layers), pieces it lost (unreadable numbers, in the drawing or in a block), and blocks that
 * repeat (arrays) or never end (a block inside itself).
 */
describe('DXF section outline — what is drawn, what is not, and what is said', () => {
  const lwpolyOn = (layer: string, pts: Array<[number, number]>, extra: string[] = []) =>
    ['0', 'LWPOLYLINE', ...extra, '8', layer, '90', `${pts.length}`, '70', '1', ...pts.flatMap(([x, y]) => ['10', `${x}`, '20', `${y}`])].join('\n');
  const withBlocks = (blocks: Array<[string, string[]]>, ...entities: string[]) =>
    ['0', 'SECTION', '2', 'BLOCKS',
      ...blocks.flatMap(([name, body]) => ['0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', ...body, '0', 'ENDBLK']),
      '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n');

  it('a plate whose hole has an unreadable radius is refused, not imported solid', () => {
    const bad = ['0', 'CIRCLE', '8', '0', '10', '100', '20', '100', '30', '0', '40', 'NaN'].join('\n');
    const r = dxfSectionParts(dxf(box(0, 0, 200, 200), bad), 'mm');
    expect(r.malformed).toEqual({ CIRCLE: 1 });
    expect(r.problem).toBe('malformedPieces');
    expect(r.parts).toEqual([]);
  });

  it('a piece lost inside an inserted block is counted and refuses the import too', () => {
    const block = [...box(0, 0, 200, 200).split('\n'), '0', 'CIRCLE', '8', '0', '10', '100', '20', '100', '30', '0', '40', 'x'];
    const r = dxfSectionParts(withBlock('PL', block, insert('PL', 0, 0)), 'mm');
    expect(r.malformed).toEqual({ CIRCLE: 1 });
    expect(r.incompleteBlocks).toEqual(['PL']);
    expect(r.problem).toBe('malformedPieces');
    expect(r.parts).toEqual([]);
  });

  it('a frame drawn in paper space is not a part', () => {
    const frame = lwpolyOn('0', [[-50, -50], [500, -50], [500, 500], [-50, 500]], ['67', '1']);
    const r = dxfSectionParts(dxf(box(0, 0, 100, 200), frame), 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.paperSpace).toBe(1);
  });

  it('entities on a layer turned off or frozen are not parts, and are counted', () => {
    const layers = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
      '0', 'LAYER', '2', 'COTAS', '70', '1', '62', '7', '0', 'LAYER', '2', 'AUX', '70', '0', '62', '-3', '0', 'ENDTAB', '0', 'ENDSEC'];
    const text = [...layers, ...dxf(box(0, 0, 100, 200), lwpolyOn('COTAS', [[-50, -50], [500, -50], [500, 500], [-50, 500]]),
      lwpolyOn('AUX', [[10, 10], [20, 10], [20, 20], [10, 20]])).split('\n')].join('\n');
    const r = dxfSectionParts(text, 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0]!.void).toBeUndefined();
    expect(r.hidden).toBe(2);
  });

  it('a block that inserts itself is drawn once and reported, not copied to the depth limit', () => {
    const block = [...box(0, 0, 10, 10).split('\n'), ...insert('LOOP', 100, 0).split('\n')];
    const r = dxfSectionParts(withBlock('LOOP', block, insert('LOOP', 0, 0)), 'mm');
    expect(r.parts).toHaveLength(1);
    expect(r.cyclicBlocks).toEqual(['LOOP']);
  });

  it('an INSERT array draws every copy, stepping in the insert’s turned frame', () => {
    // Three 10 mm squares, 20 mm apart along the insert's x, which is turned to the drawing's y.
    const sq = box(-5, -5, 5, 5).split('\n');
    const r = dxfSectionParts(withBlock('SQ', sq, insert('SQ', 0, 0, ['50', '90', '70', '3', '44', '20'])), 'mm');
    expect(r.parts).toHaveLength(3);
    const [w, h] = extent(r);
    expect(w).toBeCloseTo(0.01, 9);
    expect(h).toBeCloseTo(0.05, 9);
  });

  it('an array inside a block is drawn too', () => {
    const r = dxfSectionParts(withBlocks([
      ['SQ', box(-5, -5, 5, 5).split('\n')],
      ['ROW', insert('SQ', 0, 0, ['70', '2', '71', '2', '44', '20', '45', '30']).split('\n')],
    ], insert('ROW', 0, 0)), 'mm');
    expect(r.parts).toHaveLength(4);
    const [w, h] = extent(r);
    expect(w).toBeCloseTo(0.03, 9);
    expect(h).toBeCloseTo(0.04, 9);
  });
});
