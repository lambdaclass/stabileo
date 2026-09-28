/**
 * What the parser does with an entity it cannot use: it refuses it, counts it,
 * and never lets it reach the drawing extent.
 *
 * The first round refused non-numeric coordinates on the entities themselves.
 * Three ways in were left open: a block definition with an unreadable number
 * (the INSERT is finite, the block it expands is not), an entity whose group
 * code is missing rather than non-numeric (a file cut off mid-entity), and a
 * radius that is a number but not a size.
 */
import { describe, it, expect } from 'vitest';
import { parseCadDxf, cadImportProblem } from '../parse';
import { buildDxf, dxfLine, dxfInsert, dxfLwPolyline, dxfSpline } from './dxf-fixture';

const finiteBBox = (doc: ReturnType<typeof parseCadDxf>) => {
  expect(doc.bbox).not.toBeNull();
  for (const v of Object.values(doc.bbox!)) expect(Number.isFinite(v), `bbox ${JSON.stringify(doc.bbox)}`).toBe(true);
};

/** A block whose circle has an unreadable radius, beside a readable rectangle. */
function blockWithBadCircle(name: string): string {
  return [
    '0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name,
    dxfLwPolyline('0', [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]], true),
    '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', 'x',
    '0', 'ENDBLK',
  ].join('\n');
}

describe('a block definition with an unreadable number', () => {
  it('a block with nothing readable does not poison the extent either', () => {
    const onlyBad = [
      '0', 'BLOCK', '8', '0', '2', 'COL_Y', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'COL_Y',
      '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', 'x',
      '0', 'ENDBLK',
    ].join('\n');
    const doc = parseCadDxf(buildDxf({
      insunits: 6, layers: ['PILARES', 'VIGAS'], blocks: onlyBad,
      entities: [dxfLine('VIGAS', 0, 0, 4, 0), dxfInsert('PILARES', 'COL_Y', 2, 0)].join('\n'),
    }), 'block-bad.dxf');
    finiteBBox(doc);
    // The column is not sized from nothing: no bbox (it falls back to its
    // insertion point) rather than an inverted infinite one.
    const ins = doc.entities.find((e) => e.kind === 'insert');
    if (ins && ins.kind === 'insert' && ins.bbox) {
      for (const v of Object.values(ins.bbox)) expect(Number.isFinite(v), `insert bbox ${JSON.stringify(ins.bbox)}`).toBe(true);
    }
    // And the unreadable block geometry is counted, like any other.
    expect(doc.malformed['CIRCLE']).toBe(1);
  });

  it('does not turn the drawing extent into NaN through a finite INSERT', () => {
    const doc = parseCadDxf(buildDxf({
      insunits: 6, layers: ['PILARES', 'VIGAS'],
      blocks: blockWithBadCircle('COL_X'),
      entities: [dxfLine('VIGAS', 0, 0, 4, 0), dxfInsert('PILARES', 'COL_X', 2, 0)].join('\n'),
    }), 'block.dxf');
    finiteBBox(doc);
    expect(doc.malformed['CIRCLE']).toBe(1);
    // The readable rectangle still sizes the column.
    const ins = doc.entities.find((e) => e.kind === 'insert');
    expect(ins && ins.kind === 'insert' && ins.bbox).toBeTruthy();
    if (ins && ins.kind === 'insert') expect(ins.bbox!.maxX - ins.bbox!.minX).toBeCloseTo(0.4, 6);
  });
});

describe('an entity whose group code is missing', () => {
  it('a LINE cut off before its end point is refused, not dropped', () => {
    const cut = ['0', 'LINE', '8', 'VIGAS', '10', '0', '20', '0', '30', '0'].join('\n');
    const doc = parseCadDxf(buildDxf({ insunits: 6, layers: ['VIGAS'], entities: [dxfLine('VIGAS', 0, 0, 4, 0), cut].join('\n') }), 'cut.dxf');
    expect(doc.entities.filter((e) => e.kind === 'line').length).toBe(1);
    expect(doc.malformed['LINE']).toBe(1);
  });

  it('a CIRCLE, an ARC, an INSERT and a TEXT without their point are refused', () => {
    const entities = [
      dxfLine('VIGAS', 0, 0, 4, 0),
      ['0', 'CIRCLE', '8', 'VIGAS', '40', '0.3'].join('\n'),
      ['0', 'ARC', '8', 'VIGAS', '40', '0.3', '50', '0', '51', '90'].join('\n'),
      ['0', 'INSERT', '8', 'VIGAS', '2', 'NOPE'].join('\n'),
      ['0', 'TEXT', '8', 'VIGAS', '40', '0.2', '1', 'hola'].join('\n'),
    ].join('\n');
    const doc = parseCadDxf(buildDxf({ insunits: 6, layers: ['VIGAS'], entities }), 'nopoint.dxf');
    expect(doc.malformed).toMatchObject({ CIRCLE: 1, ARC: 1, INSERT: 1, TEXT: 1 });
    expect(doc.entities.length).toBe(1);
  });
});

describe('a radius that is a number but not a size', () => {
  it('a negative radius is refused, not drawn as an inverted box', () => {
    const neg = ['0', 'CIRCLE', '8', 'PILARES', '10', '2', '20', '0', '30', '0', '40', '-0.3'].join('\n');
    const doc = parseCadDxf(buildDxf({ insunits: 6, layers: ['PILARES', 'VIGAS'], entities: [dxfLine('VIGAS', 0, 0, 4, 0), neg].join('\n') }), 'neg.dxf');
    expect(doc.malformed['CIRCLE']).toBe(1);
    finiteBBox(doc);
    expect(doc.bbox!.minX).toBeLessThanOrEqual(doc.bbox!.maxX);
  });

  it('a missing radius is refused, not read as zero', () => {
    const none = ['0', 'CIRCLE', '8', 'PILARES', '10', '2', '20', '0', '30', '0'].join('\n');
    const doc = parseCadDxf(buildDxf({ insunits: 6, layers: ['PILARES', 'VIGAS'], entities: [dxfLine('VIGAS', 0, 0, 4, 0), none].join('\n') }), 'none.dxf');
    expect(doc.malformed['CIRCLE']).toBe(1);
    expect(doc.entities.filter((e) => e.kind === 'circle').length).toBe(0);
  });
});

describe('a file whose every usable entity was refused', () => {
  it('is reported as refused, with its counts, not as an empty file', () => {
    const bad = ['0', 'LINE', '8', 'VIGAS', '10', 'x', '20', '0', '30', '0', '11', '4', '21', '0', '31', '0'].join('\n');
    const doc = parseCadDxf(buildDxf({ insunits: 6, layers: ['VIGAS'], entities: [bad, bad].join('\n') }), 'all-bad.dxf');
    expect(doc.entities.length).toBe(0);
    expect(cadImportProblem(doc)).toBe('allMalformed');
    expect(doc.malformed['LINE']).toBe(2);
  });

  it('an empty file is still an empty file, and a readable one has no problem', () => {
    expect(cadImportProblem(parseCadDxf(buildDxf({ insunits: 6, layers: ['X'], entities: dxfSpline('X') }), 'empty.dxf'))).toBe('emptyFile');
    expect(cadImportProblem(parseCadDxf(buildDxf({ insunits: 6, layers: ['VIGAS'], entities: dxfLine('VIGAS', 0, 0, 4, 0) }), 'ok.dxf'))).toBeNull();
  });
});
