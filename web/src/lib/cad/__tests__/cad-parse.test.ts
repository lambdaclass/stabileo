import { describe, it, expect } from 'vitest';
import { parseCadDxf, unsupportedFileKind } from '../parse';
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
    expect(doc.warnings).toContain('malformedEntity:LINE:1');
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
