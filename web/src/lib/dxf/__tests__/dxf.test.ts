import { describe, it, expect } from 'vitest';
import { parseDxf } from '../parser';
import { mapDxfToModel, parseSectionText, parseMaterialText } from '../mapper';
import type { DxfMappingResult, DxfParseResult } from '../types';
import { solve } from '../../engine/wasm-solver';

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

function dxfInsert(layer: string, x: number, y: number, name: string): string {
  return ['0', 'INSERT', '8', layer, '2', name, '10', String(x), '20', String(y), '30', '0'].join('\n');
}

function dxfMtext(layer: string, x: number, y: number, text: string): string {
  return ['0', 'MTEXT', '8', layer, '10', String(x), '20', String(y), '30', '0', '1', text].join('\n');
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
    expect(result.warnings[0]).toContain('lines used as members');
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
    expect(result.nodalLoads[0].fz).toBe(-20);
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

describe('DXF support labels', () => {
  function mapSupports(...entities: string[]) {
    const drawing = minimalDxf([
      dxfLine('BARRAS', 0, 0, 5, 0),
      dxfText('APOYOS', 0, 0, 'EMPOTRADO'),
      dxfText('CARGAS', 5, 0, 'Fx=10'),
      ...entities,
    ].join('\n'));
    return mapDxfToModel(parseDxf(drawing), { unit: 'm', snapTolerance: 0.01 });
  }

  function solveDrawing(mapped: DxfMappingResult) {
    return solve({
      nodes: new Map(mapped.nodes.map(({ id, x, y }) => [id + 1, { id: id + 1, x, z: y }])),
      elements: new Map(mapped.elements.map(({ nodeI, nodeJ, type }, index) => [
        index + 1, { id: index + 1, nodeI: nodeI + 1, nodeJ: nodeJ + 1, type,
          materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      ])),
      materials: new Map([[1, { id: 1, e: 1000, nu: 0 }]]),
      sections: new Map([[1, { id: 1, a: 1, iz: 1 }]]),
      supports: new Map(mapped.supports.map(({ nodeId, type }, index) => [
        index + 1, { id: index + 1, nodeId: nodeId + 1, type },
      ])),
      loads: mapped.nodalLoads.map(load => ({
        type: 'nodal', data: { ...load, nodeId: load.nodeId + 1 },
      })),
    });
  }

  it('#2278 an unknown support label cannot silently create a pinned support', () => {
    expect(() => mapSupports(dxfText('APOYOS', 5, 0, 'ELASTIC_VERTICAL')))
      .toThrow(/ELASTIC_VERTICAL.*APOYOS/);
  });

  it('#2278 refuses unknown MTEXT labels and INSERT names on the support layer', () => {
    expect.soft(() => mapSupports(dxfMtext('apoyos', 5, 0, 'SPRING_VERTICAL')))
      .toThrow(/SPRING_VERTICAL.*APOYOS/);
    expect.soft(() => mapSupports(dxfInsert('APOYOS', 5, 0, 'ELASTIC_BLOCK')))
      .toThrow(/ELASTIC_BLOCK.*APOYOS/);
  });

  it('#2278 refuses ambiguous labels and partial alias matches', () => {
    for (const label of ['R', 'ROLLER', 'MOVIL', 'MOVIL_XZ', 'ROLLER X/Y', 'NOT_FIXED', 'EMPOTRADO/ARTICULADO']) {
      expect.soft(() => mapSupports(dxfText('APOYOS', 5, 0, label)), label)
        .toThrow(new RegExp(label + '.*APOYOS'));
    }
  });

  it('#2278 refuses an empty label and an unknown label beyond the support matching radius', () => {
    expect.soft(() => mapSupports(dxfText('APOYOS', 5, 0, ''))).toThrow(/“” on DXF layer “APOYOS”/);
    expect.soft(() => mapSupports(dxfInsert('APOYOS', 5.125, 0, 'UNKNOWN_BLOCK')))
      .toThrow(/UNKNOWN_BLOCK.*APOYOS/);
  });

  it('#2278 refuses conflicting labels for a single snapped node', () => {
    expect(() => mapSupports(
      dxfText('APOYOS', 5, 0, 'ARTICULADO'),
      dxfInsert('APOYOS', 5.005, 0, 'RX'),
    )).toThrow(/ARTICULADO.*RX.*APOYOS/);
  });

  it('solves equivalent explicit support aliases with the same reactions', () => {
    const pinned = mapSupports(dxfText('APOYOS', 5, 0, 'ARTICULADO'));
    const roller = mapSupports(dxfText('APOYOS', 5, 0, 'RX'));
    expect(pinned.supports).toEqual([{ nodeId: 0, type: 'fixed' }, { nodeId: 1, type: 'pinned' }]);
    expect(roller.supports).toEqual([{ nodeId: 0, type: 'fixed' }, { nodeId: 1, type: 'rollerX' }]);
    const pinnedResult = solveDrawing(pinned);
    const rollerResult = solveDrawing(roller);
    expect(pinnedResult.reactions.find(r => r.nodeId === 2)?.rx).toBe(-10);
    expect(rollerResult.reactions.find(r => r.nodeId === 1)?.rx).toBe(-10);
    expect(solveDrawing(mapSupports(dxfMtext('apoyos', 5, 0, ' pinned ')))).toEqual(pinnedResult);
    expect(solveDrawing(mapSupports(dxfInsert('APOYOS', 5.075, 0, 'ROLLER_X')))).toEqual(rollerResult);
    expect(solveDrawing(mapSupports(
      dxfInsert('APOYOS', 5, 0, 'RX'),
      dxfText('NOTES', 5, 0, 'ELASTIC_VERTICAL'),
    ))).toEqual(rollerResult);
    const beyondSnap = mapSupports(dxfInsert('APOYOS', 5.125, 0, 'RX'));
    expect(beyondSnap.supports).toEqual([{ nodeId: 0, type: 'fixed' }]);
    expect(beyondSnap.warnings).toHaveLength(1);
    expect(beyondSnap.warnings[0]).toContain('RX');
  });

  it('keeps the supported direction aliases and legacy fixed alias', () => {
    for (const [label, type] of [
      ['RZ', 'rollerZ'], ['RY', 'rollerZ'], ['ROLLER_Y', 'rollerZ'],
      ['MOVIL X', 'rollerX'], ['MOVIL Z', 'rollerZ'], ['E', 'fixed'], ['FIXED', 'fixed'],
    ] as const) {
      expect(mapSupports(dxfText('APOYOS', 5, 0, label)).supports[1]).toEqual({ nodeId: 1, type });
    }
  });
});

describe('DXF Mapper — what a drawing writes', () => {
  const parsed = (over: Partial<DxfParseResult>): DxfParseResult => ({
    lines: [], points: [], inserts: [], texts: [], circles: [], layers: ['BARRAS'], ...over,
  });

  it('reads a decimal comma and an exponent in a load text', () => {
    const r = mapDxfToModel(parsed({
      lines: [{ layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }],
      texts: [
        { layer: 'CARGAS', position: { x: 2.5, y: 0.5 }, value: 'q=-12,5' },
        { layer: 'CARGAS', position: { x: 5, y: 0.1 }, value: 'Fx=1.5e1' },
      ],
    }), { unit: 'm', snapTolerance: 0.01 });
    expect(r.distributedLoads[0]!.q).toBe(-12.5);
    expect(r.nodalLoads[0]!.fx).toBe(15);
  });

  it('connects a line drawn to the middle of another one', () => {
    // A beam 0–10 and a column rising from its midspan: a T.
    const r = mapDxfToModel(parsed({
      lines: [
        { layer: 'BARRAS', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { layer: 'BARRAS', start: { x: 5, y: 0 }, end: { x: 5, y: 4 } },
      ],
    }), { unit: 'm', snapTolerance: 0.01 });
    expect(r.nodes).toHaveLength(4);
    expect(r.elements).toHaveLength(3);
    const mid = r.nodes.find((n) => n.x === 5 && n.y === 0)!.id;
    expect(r.elements.filter((e) => e.nodeI === mid || e.nodeJ === mid)).toHaveLength(3);
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

  it('matches a profile by its exact name, not by a substring', () => {
    expect(parseSectionText('HEB200')!.name).toBe('HEB 200');
    expect(parseSectionText('IPE 30')).toBeNull();
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
