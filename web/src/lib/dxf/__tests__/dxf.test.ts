import { describe, it, expect } from 'vitest';
import { parseDxf } from '../parser';
import { mapDxfToModel, parseSectionText, parseMaterialText } from '../mapper';
import type { DxfParseResult } from '../types';

// ─── Minimal DXF strings for testing ───────────────────────────

/** Generate a minimal valid DXF with LINE entities */
function minimalDxf(entities: string): string {
  return [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '1',
    '0', 'LAYER',
    '2', 'BARRAS',
    '70', '0',
    '62', '7',
    '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
    entities,
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    '0', 'LINE',
    '8', layer,
    '10', x1.toString(),
    '20', y1.toString(),
    '30', '0',
    '11', x2.toString(),
    '21', y2.toString(),
    '31', '0',
  ].join('\n');
}

function dxfText(layer: string, x: number, y: number, text: string): string {
  return [
    '0', 'TEXT',
    '8', layer,
    '10', x.toString(),
    '20', y.toString(),
    '30', '0',
    '40', '0.2',
    '1', text,
  ].join('\n');
}

function dxfPoint(layer: string, x: number, y: number): string {
  return [
    '0', 'POINT',
    '8', layer,
    '10', x.toString(),
    '20', y.toString(),
    '30', '0',
  ].join('\n');
}

// ─── Parser tests ──────────────────────────────────────────────

describe('DXF Parser', () => {
  it('should parse LINE entities', () => {
    const dxf = minimalDxf(
      dxfLine('BARRAS', 0, 0, 5, 0) + '\n' +
      dxfLine('BARRAS', 5, 0, 10, 0)
    );
    const result = parseDxf(dxf);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].start).toEqual({ x: 0, y: 0 });
    expect(result.lines[0].end).toEqual({ x: 5, y: 0 });
    expect(result.lines[1].start).toEqual({ x: 5, y: 0 });
    expect(result.lines[1].end).toEqual({ x: 10, y: 0 });
  });

  it('should uppercase layer names', () => {
    const dxf = minimalDxf(dxfLine('barras', 0, 0, 5, 0));
    const result = parseDxf(dxf);
    expect(result.lines[0].layer).toBe('BARRAS');
  });

  it('should parse TEXT entities', () => {
    const dxf = minimalDxf(dxfText('CARGAS', 2.5, 0.5, 'q=-10'));
    const result = parseDxf(dxf);
    expect(result.texts).toHaveLength(1);
    expect(result.texts[0].value).toBe('q=-10');
    expect(result.texts[0].position.x).toBeCloseTo(2.5);
  });

  it('should parse POINT entities', () => {
    const dxf = minimalDxf(dxfPoint('ARTICULACIONES', 5, 0));
    const result = parseDxf(dxf);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].position).toEqual({ x: 5, y: 0 });
  });

  it('should return empty result for invalid DXF', () => {
    const result = parseDxf('not a dxf file');
    expect(result.lines).toHaveLength(0);
    expect(result.texts).toHaveLength(0);
  });

  it('should detect layers from table', () => {
    const dxf = minimalDxf(dxfLine('BARRAS', 0, 0, 5, 0));
    const result = parseDxf(dxf);
    expect(result.layers).toContain('BARRAS');
  });
});

// ─── Mapper tests ──────────────────────────────────────────────

describe('DXF Mapper', () => {
  function makeParsed(overrides: Partial<DxfParseResult> = {}): DxfParseResult {
    return {
      lines: [],
      points: [],
      inserts: [],
      texts: [],
      circles: [],
      layers: ['BARRAS'],
      ...overrides,
    };
  }

  it('should map lines to nodes and elements', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
        { layer: 'BARRAS', start: { x: 5, y: 0 }, end: { x: 10, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.nodes).toHaveLength(3);
    expect(result.elements).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  it('should merge nodes within snap tolerance', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
        { layer: 'BARRAS', start: { x: 5.005, y: 0.003 }, end: { x: 10, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    // 5.005, 0.003 should merge with 5, 0 (distance = ~0.006 < 0.01)
    expect(result.nodes).toHaveLength(3);
    expect(result.elements).toHaveLength(2);
  });

  it('should NOT merge nodes beyond tolerance', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
        { layer: 'BARRAS', start: { x: 5.02, y: 0 }, end: { x: 10, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.nodes).toHaveLength(4); // No merge: 0.02 > 0.01
  });

  it('should fallback to all lines when no recognized layers', () => {
    const parsed = makeParsed({
      layers: ['Layer1', 'Layer2'],
      lines: [
        { layer: 'LAYER1', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.elements).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('lines used as elements');
  });

  it('should map support texts', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
      texts: [
        { layer: 'APOYOS', position: { x: 0, y: 0 }, value: 'EMPOTRADO' },
        { layer: 'APOYOS', position: { x: 5, y: 0 }, value: 'ARTICULADO' },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.supports).toHaveLength(2);
    expect(result.supports[0].type).toBe('fixed');
    expect(result.supports[1].type).toBe('pinned');
  });

  it('should map distributed load text', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
      texts: [
        { layer: 'CARGAS', position: { x: 2.5, y: 0.5 }, value: 'q=-10' },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.distributedLoads).toHaveLength(1);
    expect(result.distributedLoads[0].q).toBe(-10);
    expect(result.distributedLoads[0].elementIndex).toBe(0);
  });

  it('should map nodal load text with Fy', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
      texts: [
        { layer: 'CARGAS', position: { x: 5, y: 0.1 }, value: 'Fy=-20' },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.nodalLoads).toHaveLength(1);
    expect(result.nodalLoads[0].fy).toBe(-20);
  });

  it('should handle unit conversion (cm to m)', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'cm', snapTolerance: 0.01 });
    expect(result.nodes[0].x).toBeCloseTo(0);
    expect(result.nodes[1].x).toBeCloseTo(5); // 500cm = 5m
  });

  it('should detect section name from SECCIONES layer', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
      texts: [
        { layer: 'SECCIONES', position: { x: 2.5, y: 0.5 }, value: 'IPE 300' },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.sectionName).toBe('IPE 300');
  });

  it('should ignore zero-length lines', () => {
    const parsed = makeParsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ],
    });
    const result = mapDxfToModel(parsed, { unit: 'm', snapTolerance: 0.01 });
    expect(result.elements).toHaveLength(1);
  });
});

// ─── Section/Material text parsing ─────────────────────────────

describe('parseSectionText', () => {
  it('should parse IPE profile', () => {
    const sec = parseSectionText('IPE 300');
    expect(sec).not.toBeNull();
    expect(sec!.name).toBe('IPE 300');
    expect(sec!.a).toBeGreaterThan(0);
    expect(sec!.iz).toBeGreaterThan(0);
  });

  it('should parse HEB profile', () => {
    const sec = parseSectionText('HEB 200');
    expect(sec).not.toBeNull();
    expect(sec!.name).toBe('HEB 200');
  });

  it('should parse rectangular BxH (cm)', () => {
    const sec = parseSectionText('30x50');
    expect(sec).not.toBeNull();
    expect(sec!.a).toBeCloseTo(0.30 * 0.50, 4);
    expect(sec!.iz).toBeCloseTo(0.30 * 0.50 ** 3 / 12, 6);
  });

  it('should parse circular section', () => {
    const sec = parseSectionText('Ø20');
    expect(sec).not.toBeNull();
    const r = 0.10; // 20cm diameter → 10cm radius → 0.10m
    expect(sec!.a).toBeCloseTo(Math.PI * r * r, 4);
  });

  it('should return null for unknown text', () => {
    expect(parseSectionText('unknown section')).toBeNull();
  });
});

describe('parseMaterialText', () => {
  it('should recognize steel', () => {
    const mat = parseMaterialText('Acero');
    expect(mat).not.toBeNull();
    expect(mat!.e).toBe(200000);
    expect(mat!.fy).toBe(250);
  });

  it('should recognize concrete', () => {
    const mat = parseMaterialText('HA');
    expect(mat).not.toBeNull();
    expect(mat!.e).toBe(30000);
  });

  it('should parse explicit E value', () => {
    const mat = parseMaterialText('E=210000');
    expect(mat).not.toBeNull();
    expect(mat!.e).toBe(210000);
  });

  it('should return null for unknown text', () => {
    expect(parseMaterialText('xyz')).toBeNull();
  });
});
