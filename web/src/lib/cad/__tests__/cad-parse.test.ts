import { describe, it, expect } from 'vitest';
import { parseCadDxf, unsupportedFileKind, cadDxfParser } from '../parse';
import {
  buildDxf, dxfLine, dxfLwPolyline, dxfCircle, simplePlanDxf,
} from './dxf-fixture';

describe('parseCadDxf — CadDocument IR', () => {
  it('parses the simple plan fixture preserving layers, regions, and kinds', () => {
    const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');

    expect(doc.sourceName).toBe('plan.dxf');
    expect(doc.suggestedUnit).toBe('m'); // $INSUNITS = 6

    // Layer names preserved exactly as authored (no destructive uppercase).
    const names = doc.layers.map((l) => l.name);
    expect(names).toContain('PILARES HA');
    expect(names).toContain('CAPA_MISTERIOSA');

    // Closed polylines stay closed regions (NOT flattened to line segments).
    const closed = doc.entities.filter((e) => e.kind === 'polyline' && e.closed);
    // 4 column rects + slab outline + opening = 6
    expect(closed.length).toBe(6);

    // Arc preserved as an arc.
    expect(doc.entities.filter((e) => e.kind === 'arc').length).toBe(1);

    // INSERT expanded to a bbox from the 0.4×0.4 block rect.
    const ins = doc.entities.find((e) => e.kind === 'insert');
    expect(ins).toBeDefined();
    if (ins && ins.kind === 'insert') {
      expect(ins.blockName).toBe('COL_B');
      expect(ins.bbox).toBeDefined();
      expect(ins.bbox!.maxX - ins.bbox!.minX).toBeCloseTo(0.4, 6);
      expect(ins.bbox!.maxY - ins.bbox!.minY).toBeCloseTo(0.4, 6);
      // bbox centered at the insertion point (3, 0)
      expect((ins.bbox!.minX + ins.bbox!.maxX) / 2).toBeCloseTo(3, 6);
    }

    // SPLINE counted as unsupported and surfaced as a warning.
    expect(doc.unsupported['SPLINE']).toBe(1);
    expect(doc.warnings.some((w) => w.startsWith('unsupportedEntity:SPLINE'))).toBe(true);

    // bbox covers the plan extents (grid lines reach -1).
    expect(doc.bbox).not.toBeNull();
    expect(doc.bbox!.minX).toBeLessThanOrEqual(-1);
    expect(doc.bbox!.maxX).toBeGreaterThanOrEqual(10);
  });

  it('normalizes a polyline whose last point repeats the first into a closed region', () => {
    const dxf = buildDxf({
      entities: dxfLwPolyline('LOSAS', [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]], false),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const poly = doc.entities[0];
    expect(poly.kind).toBe('polyline');
    if (poly.kind === 'polyline') {
      expect(poly.closed).toBe(true);
      expect(poly.pts.length).toBe(4); // repeated closing point dropped
    }
  });

  it('keeps open polylines open', () => {
    const dxf = buildDxf({
      entities: dxfLwPolyline('VIGAS', [[0, 0], [4, 0], [4, 3]], false),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const poly = doc.entities[0];
    if (poly.kind === 'polyline') expect(poly.closed).toBe(false);
    else throw new Error('expected polyline');
  });

  it('suggests mm for $INSUNITS=4 and null for unknown units (with warning)', () => {
    const mm = parseCadDxf(buildDxf({ insunits: 4, entities: dxfLine('A', 0, 0, 1, 1) }), 'x.dxf');
    expect(mm.suggestedUnit).toBe('mm');

    const inches = parseCadDxf(buildDxf({ insunits: 1, entities: dxfLine('A', 0, 0, 1, 1) }), 'x.dxf');
    expect(inches.suggestedUnit).toBeNull();
    expect(inches.warnings).toContain('insunitsUnknown:1');
  });

  it('counts entities per layer, including layers missing from the table', () => {
    const dxf = buildDxf({
      layers: ['DECLARADA'],
      entities: [dxfLine('FANTASMA', 0, 0, 1, 1), dxfCircle('FANTASMA', 0, 0, 1)].join('\n'),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const ghost = doc.layers.find((l) => l.name === 'FANTASMA');
    expect(ghost).toBeDefined();
    expect(ghost!.total).toBe(2);
    expect(ghost!.entityCounts.line).toBe(1);
    expect(ghost!.entityCounts.circle).toBe(1);
    // Declared-but-empty layer still listed.
    expect(doc.layers.find((l) => l.name === 'DECLARADA')?.total).toBe(0);
  });

  /*
   * dxf-parser drops a type it has no handler for without a trace, so a HATCH was neither drawn
   * nor counted, though this parser promises to report every type it cannot represent.
   */
  it('counts a type the DXF library cannot read at all, such as HATCH', () => {
    const hatch = ['0', 'HATCH', '8', 'LOSAS', '10', '0', '20', '0', '30', '0', '2', 'SOLID', '70', '1'].join('\n');
    const doc = parseCadDxf(buildDxf({ entities: [dxfLine('VIGAS', 0, 0, 4, 0), hatch].join('\n') }), 'x.dxf');
    expect(doc.entities).toHaveLength(1);
    expect(doc.unsupported['HATCH']).toBe(1);
    expect(doc.warnings).toContain('unsupportedEntity:HATCH:1');
  });

  /*
   * MIRROR leaves an entity in a frame whose x runs the other way (extrusion 0, 0, −1). The IR is
   * in the drawing's frame, so no reader has to know: a mirrored arc's centre and sweep, and a
   * mirrored insert's position, come back where they are drawn.
   */
  it('brings mirrored arcs and inserts into the drawing\'s frame', () => {
    const arc = ['0', 'ARC', '8', '0', '10', '5', '20', '1', '30', '0', '40', '2', '210', '0', '220', '0', '230', '-1', '50', '0', '51', '90'].join('\n');
    const ins = ['0', 'INSERT', '8', '0', '2', 'COL', '10', '3', '20', '4', '30', '0', '50', '30', '210', '0', '220', '0', '230', '-1'].join('\n');
    const doc = parseCadDxf(buildDxf({ entities: [arc, ins].join('\n') }), 'x.dxf');
    const a = doc.entities.find((e) => e.kind === 'arc');
    const i = doc.entities.find((e) => e.kind === 'insert');
    if (a?.kind !== 'arc' || i?.kind !== 'insert') throw new Error('expected an arc and an insert');
    expect(a.center).toEqual({ x: -5, y: 1 });
    // 0..90° in the mirrored frame is 90..180° in the drawing.
    expect(a.startAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(a.endAngle).toBeCloseTo(Math.PI, 12);
    expect(i.at).toEqual({ x: -3, y: 4 });
    expect([i.xScale, i.yScale, i.rotationDeg]).toEqual([-1, 1, -30]);
  });

  it('returns a parse error document for garbage input', () => {
    const doc = parseCadDxf('this is not a dxf', 'garbage.dxf');
    expect(doc.entities.length).toBe(0);
    expect(doc.warnings).toContain('parseError');
  });

  it('names unsupported file kinds honestly', () => {
    expect(unsupportedFileKind('plano.dwg')).toBe('dwg');
    expect(unsupportedFileKind('plano.svg')).toBe('svg');
    expect(unsupportedFileKind('plano.pdf')).toBe('pdf');
    expect(unsupportedFileKind('plano.dxf')).toBeNull();
  });
});

/**
 * A corrupt DXF gives dxf-parser a group code whose value is not a number, and
 * it hands back NaN. NaN used to travel into the IR intact, and it hid well:
 * `NaN < minX` and `NaN > maxX` are both false, so the bad point did not widen
 * the bbox — the extent silently ignored it while the entity kept it.
 *
 * Downstream it was worse than a wrong number. In `pairWallLines` the segment
 * length was NaN, so `len <= 0` was false (not rejected as degenerate) and
 * `len > 0` was also false (not collected as unpaired). The member was neither
 * paired, nor kept, nor recorded in `skipped`: it vanished from the model and
 * nothing in the result said it had ever been in the file.
 */
describe('parseCadDxf — entities whose numbers are not numbers', () => {
  const rawLine = (layer: string, x1: string, y1: string, x2: string, y2: string) =>
    ['0', 'LINE', '8', layer, '10', x1, '20', y1, '30', '0',
      '11', x2, '21', y2, '31', '0'].join('\n');

  it('refuses a LINE with a non-finite coordinate and counts it', () => {
    const doc = parseCadDxf(
      buildDxf({ insunits: 6, layers: ['VIGAS'], entities: rawLine('VIGAS', 'abc', '0', '5', '5') }),
      'bad.dxf',
    );
    expect(doc.entities.length).toBe(0);
    expect(doc.malformed['LINE']).toBe(1);
    // Counted in `doc.malformed`, which the wizard shows; not repeated in `warnings`.
    expect(doc.warnings.some((w) => w.startsWith('malformedEntity'))).toBe(false);
  });

  it('does not let a bad radius poison the drawing extent', () => {
    // entityBBox computes `center.x - r`, and mergeBBox folds with Math.min /
    // Math.max — which, unlike the comparisons in bboxOfPoints, propagate NaN.
    // One bad arc used to turn the whole bbox into {null, null, null, null}.
    const badArc = ['0', 'ARC', '8', 'VIGAS', '10', '0', '20', '0', '30', '0',
      '40', 'nope', '50', '0', '51', '90'].join('\n');
    const doc = parseCadDxf(
      buildDxf({
        insunits: 6, layers: ['VIGAS'],
        entities: [dxfLine('VIGAS', 0, 0, 4, 3), badArc].join('\n'),
      }),
      'arc.dxf',
    );
    expect(doc.malformed['ARC']).toBe(1);
    expect(doc.bbox).not.toBeNull();
    for (const v of Object.values(doc.bbox!)) expect(Number.isFinite(v)).toBe(true);
    // The good line survives untouched.
    expect(doc.entities.length).toBe(1);
    expect(doc.bbox!.maxX).toBeCloseTo(4, 9);
  });

  it('refuses a whole polyline when any one vertex is unreadable', () => {
    // A shape with a hole where a corner should be is not a smaller shape.
    const badPoly = ['0', 'LWPOLYLINE', '8', 'LOSAS', '90', '4', '70', '1',
      '10', '0', '20', '0', '10', '6', '20', '0',
      '10', 'x', '20', '5', '10', '0', '20', '5'].join('\n');
    const doc = parseCadDxf(
      buildDxf({ insunits: 6, layers: ['LOSAS'], entities: badPoly }), 'poly.dxf',
    );
    expect(doc.entities.filter((e) => e.kind === 'polyline').length).toBe(0);
    expect(Object.values(doc.malformed).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('leaves a clean drawing with nothing marked malformed', () => {
    const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
    expect(doc.malformed).toEqual({});
    expect(doc.warnings.some((w) => w.startsWith('malformedEntity'))).toBe(false);
  });
});

/*
 * PR 250 review, round 2. What the parser kept of a drawing that the drawing did not put in the
 * model, and what it left out that the drawing did.
 */
describe('parseCadDxf — paper space, mirrored blocks and text, arrays, damaged blocks', () => {
  /** A drawing with block definitions given as raw group lines. */
  const block = (name: string, body: string[], base: [number, number] = [0, 0]) =>
    ['0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', `${base[0]}`, '20', `${base[1]}`, '30', '0', '3', name, ...body, '0', 'ENDBLK'].join('\n');
  const circle = (x: number, y: number, r: string | number, extra: string[] = []) =>
    ['0', 'CIRCLE', '8', '0', '10', `${x}`, '20', `${y}`, '30', '0', '40', `${r}`, ...extra];
  const insert = (name: string, x: number, y: number, extra: string[] = []) =>
    ['0', 'INSERT', '8', 'PILARES', '2', name, '10', `${x}`, '20', `${y}`, '30', '0', ...extra].join('\n');
  const mirroredZ = ['210', '0', '220', '0', '230', '-1'];

  it('leaves paper-space entities out of the drawing, and counts them', () => {
    // A title-block frame and a stamp on the layout sheet (group 67 = 1), next to the model's box.
    const frame = dxfLwPolyline('MARCO', [[-500, -500], [500, -500], [500, 500], [-500, 500]], true)
      .replace('0\nLWPOLYLINE\n8\nMARCO', '0\nLWPOLYLINE\n67\n1\n8\nMARCO');
    const stamp = circle(0, 0, 50, ['67', '1']).join('\n');
    const doc = parseCadDxf(buildDxf({
      insunits: 4, layers: ['LOSAS', 'MARCO'],
      entities: [dxfLwPolyline('LOSAS', [[0, 0], [100, 0], [100, 200], [0, 200]], true), frame, stamp].join('\n'),
    }), 'paper.dxf');
    expect(doc.entities).toHaveLength(1);
    expect(doc.paperSpace).toBe(2);
    expect(doc.bbox).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 200 });
  });

  it('the CIRCLE and TEXT handlers keep every group dxf-parser’s own handlers kept', () => {
    const parser = cadDxfParser();
    const text = buildDxf({
      layers: ['A'],
      entities: [
        ['0', 'CIRCLE', '5', '2F', '8', 'A', '62', '3', '67', '1', '10', '1', '20', '2', '30', '0', '40', '5', ...mirroredZ].join('\n'),
        ['0', 'TEXT', '5', '30', '8', 'A', '62', '4', '67', '1', '10', '1', '20', '2', '30', '0', '11', '3', '21', '4', '31', '0',
          '40', '0.5', '41', '0.8', '50', '30', '1', 'C1', '72', '1', '73', '2', ...mirroredZ].join('\n'),
      ].join('\n'),
    });
    const [c, t] = parser.parseSync(text)!.entities as unknown as Array<Record<string, unknown>>;
    expect(c).toMatchObject({ type: 'CIRCLE', handle: '2F', layer: 'A', colorIndex: 3, inPaperSpace: true, center: { x: 1, y: 2 }, radius: 5, extrusionDirectionZ: -1 });
    expect(c!.color).toBeDefined();
    expect(t).toMatchObject({
      type: 'TEXT', handle: '30', layer: 'A', colorIndex: 4, inPaperSpace: true, startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 },
      textHeight: 0.5, xScale: 0.8, rotation: 30, text: 'C1', halign: 1, valign: 2, extrusionDirectionZ: -1,
    });
  });

  it('a TEXT drawn mirrored is placed where it shows', () => {
    const t = ['0', 'TEXT', '8', 'TEXTOS', '10', '50', '20', '5', '30', '0', '40', '0.2', '1', 'C1', ...mirroredZ].join('\n');
    const doc = parseCadDxf(buildDxf({ layers: ['TEXTOS'], entities: t }), 't.dxf');
    expect(doc.entities[0]).toMatchObject({ kind: 'text', at: { x: -50, y: 5 }, value: 'C1' });
  });

  it('sizes an insert from the block as drawn: a mirrored circle in it, and the base point', () => {
    // The circle at (50, 0) with extrusion −1 is drawn at x = −50: its box runs −60 to −40.
    const doc = parseCadDxf(buildDxf({
      layers: ['PILARES'],
      blocks: [block('MIR', circle(50, 0, 10, mirroredZ)), block('BASE', circle(10, 0, 10), [10, 0])].join('\n'),
      entities: [insert('MIR', 0, 0), insert('BASE', 100, 0)].join('\n'),
    }), 'b.dxf');
    const [mir, base] = doc.entities;
    expect(mir).toMatchObject({ kind: 'insert', bbox: { minX: -60, maxX: -40, minY: -10, maxY: 10 } });
    // The base point lands on the insertion point: the circle about it is centred at x = 100.
    expect(base).toMatchObject({ kind: 'insert', bbox: { minX: 90, maxX: 110 } });
  });

  it('sizes an insert from the blocks nested in its block', () => {
    const doc = parseCadDxf(buildDxf({
      layers: ['PILARES'],
      blocks: [block('INNER', circle(0, 0, 10)), block('OUTER', insert('INNER', 30, 0).split('\n'))].join('\n'),
      entities: insert('OUTER', 0, 0),
    }), 'n.dxf');
    expect(doc.entities[0]).toMatchObject({ kind: 'insert', bbox: { minX: 20, maxX: 40, minY: -10, maxY: 10 } });
  });

  it('an INSERT array is every copy it draws, in the insert’s turned frame', () => {
    // 3 columns 1 apart, 2 rows 0.5 apart, the whole array turned 90°.
    const doc = parseCadDxf(buildDxf({
      layers: ['PILARES'],
      blocks: block('COL', circle(0, 0, 0.1)),
      entities: insert('COL', 10, 10, ['50', '90', '70', '3', '71', '2', '44', '1', '45', '0.5']),
    }), 'a.dxf');
    const at = doc.entities.map((e) => (e.kind === 'insert' ? [e.at.x, e.at.y] : null));
    expect(at).toHaveLength(6);
    const want = [[10, 10], [10, 11], [10, 12], [9.5, 10], [9.5, 11], [9.5, 12]];
    for (const [x, y] of want) expect(at.some((p) => p && Math.abs(p[0]! - x) < 1e-9 && Math.abs(p[1]! - y) < 1e-9)).toBe(true);
    for (const e of doc.entities) expect(e.kind === 'insert' && e.bbox).toBeTruthy();
  });

  it('counts the pieces a block lost, and reports a block that lost them through a nested one', () => {
    const doc = parseCadDxf(buildDxf({
      layers: ['PILARES'],
      blocks: [block('BAD', circle(0, 0, 'nan')), block('HOLDER', [...circle(0, 0, 20), ...insert('BAD', 0, 0).split('\n')])].join('\n'),
      entities: insert('HOLDER', 0, 0),
    }), 'r.dxf');
    expect(doc.blocks?.BAD?.malformed).toEqual({ CIRCLE: 1 });
    expect(doc.blocks?.HOLDER?.malformed).toEqual({});
    expect(doc.incompleteBlocks).toEqual({ HOLDER: { inserts: 1, refused: { CIRCLE: 1 } } });
  });

  it('a block that inserts itself is reported, and its size is not grown by phantom copies', () => {
    const doc = parseCadDxf(buildDxf({
      layers: ['PILARES'],
      blocks: block('LOOP', [...circle(0, 0, 10), ...insert('LOOP', 100, 0).split('\n')]),
      entities: insert('LOOP', 0, 0),
    }), 'c.dxf');
    expect(doc.cyclicBlocks).toEqual(['LOOP']);
    expect(doc.entities[0]).toMatchObject({ kind: 'insert', bbox: { minX: -10, maxX: 10 } });
  });

  it('marks the layers that are off or frozen', () => {
    const layers = ['0', 'LAYER', '2', 'OFF', '70', '0', '62', '-7', '0', 'LAYER', '2', 'FROZEN', '70', '1', '62', '7', '0', 'LAYER', '2', 'ON', '70', '0', '62', '7'];
    const text = buildDxf({ layers: [], entities: dxfLine('ON', 0, 0, 1, 1) })
      .replace(['0', 'TABLE', '2', 'LAYER', '70', '0'].join('\n'), ['0', 'TABLE', '2', 'LAYER', '70', '3', ...layers].join('\n'));
    const doc = parseCadDxf(text, 'l.dxf');
    const by = Object.fromEntries(doc.layers.map((l) => [l.name, l.hidden]));
    expect(by).toEqual({ OFF: 'off', FROZEN: 'frozen', ON: undefined });
  });

  it('refuses a POLYLINE with no SEQEND instead of hanging on it', () => {
    // dxf-parser loops forever on a vertex list that runs into the next entity.
    const poly = ['0', 'POLYLINE', '8', 'LOSAS', '66', '1', '70', '1',
      '0', 'VERTEX', '8', 'LOSAS', '10', '0', '20', '0', '0', 'VERTEX', '8', 'LOSAS', '10', '1', '20', '0'].join('\n');
    const doc = parseCadDxf(buildDxf({ layers: ['LOSAS'], entities: [poly, dxfLine('LOSAS', 0, 0, 1, 1)].join('\n') }), 'p.dxf');
    expect(doc.warnings).toContain('parseError');
    expect(doc.warnings).toContain('polylineWithoutSeqend');
  }, 5000);
});
