// AutoCAD-compatibility sanity checks for the downloadable Stabileo template.
//
// AutoCAD itself is not available in this environment, so we cannot prove it
// opens there. Instead we assert the structural properties that make an
// AC1009 (R12) ASCII DXF safe, and parse it with the raw third-party
// dxf-parser (independently of our own parseCadDxf wrapper).
import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { buildStabileoTemplateDxf, STB_TEMPLATE_LAYERS } from '../template';

const dxf = buildStabileoTemplateDxf();
const lines = dxf.split(/\r\n/);

/** Collect group-code / value pairs (DXF is line-paired: code, value, …). */
function pairs(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  // last element is '' from the trailing CRLF
  const body = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
  expect(body.length % 2).toBe(0); // even number of lines → strict code/value pairing
  for (let i = 0; i < body.length; i += 2) out.push([body[i].trim(), body[i + 1]]);
  return out;
}

describe('Stabileo template — AutoCAD R12 DXF sanity', () => {
  it('uses strict code/value line pairing and CRLF endings', () => {
    expect(dxf.endsWith('\r\n')).toBe(true);
    expect(() => pairs()).not.toThrow();
  });

  it('declares AC1009 (R12)', () => {
    expect(dxf).toContain('$ACADVER');
    const p = pairs();
    const i = p.findIndex(([, v]) => v === '$ACADVER');
    expect(p[i + 1][1]).toBe('AC1009');
  });

  it('opens and closes every SECTION and ends with EOF', () => {
    const p = pairs();
    const sectionOpens = p.filter(([c, v]) => c === '0' && v === 'SECTION').length;
    const sectionEnds = p.filter(([c, v]) => c === '0' && v === 'ENDSEC').length;
    expect(sectionOpens).toBe(3); // HEADER, TABLES, ENTITIES
    expect(sectionEnds).toBe(3);
    // Section names present and ordered.
    const names = p.filter(([c]) => c === '2').map(([, v]) => v);
    expect(names.slice(0, 1)).toEqual(['HEADER']);
    expect(names).toContain('TABLES');
    expect(names).toContain('ENTITIES');
    // TABLE / ENDTAB balanced.
    expect(p.filter(([c, v]) => c === '0' && v === 'TABLE').length).toBe(1);
    expect(p.filter(([c, v]) => c === '0' && v === 'ENDTAB').length).toBe(1);
    // Last meaningful token is EOF.
    expect(p[p.length - 1]).toEqual(['0', 'EOF']);
  });

  it('declares a LAYER table with every STB layer', () => {
    const p = pairs();
    expect(p.some(([c, v]) => c === '2' && v === 'LAYER')).toBe(true);
    const layerNames = p
      .filter((pair, idx) => pair[0] === '0' && pair[1] === 'LAYER')
      .map((_, n) => n); // count only
    expect(p.filter(([c, v]) => c === '0' && v === 'LAYER').length).toBe(STB_TEMPLATE_LAYERS.length);
    const declared = new Set(
      p.filter(([c], idx) => c === '2').map(([, v]) => v),
    );
    for (const l of STB_TEMPLATE_LAYERS) expect(declared.has(l)).toBe(true);
  });

  it('contains ONLY conservative R12 entity types', () => {
    const p = pairs();
    // Entity type tokens follow code 0 inside ENTITIES; gather all code-0 values.
    const code0 = new Set(p.filter(([c]) => c === '0').map(([, v]) => v));
    // Allowed: section/structural keywords + the 4 entity kinds.
    const allowed = new Set([
      'SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'LAYER', 'EOF',
      'LINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'TEXT',
    ]);
    for (const v of code0) expect(allowed.has(v)).toBe(true);
    // Explicitly forbid the fragile constructs.
    expect(dxf).not.toContain('LWPOLYLINE');
    expect(dxf).not.toContain('MTEXT');
    expect(dxf).not.toContain('INSERT');
    expect(dxf).not.toContain('AcDb'); // no R13+ subclass markers
    expect(dxf).not.toContain('HATCH');
    expect(dxf).not.toContain('SPLINE');
  });

  it('every POLYLINE has the vertices-follow flag and a SEQEND', () => {
    const p = pairs();
    const nPoly = p.filter(([c, v]) => c === '0' && v === 'POLYLINE').length;
    const nSeqend = p.filter(([c, v]) => c === '0' && v === 'SEQEND').length;
    expect(nPoly).toBeGreaterThan(0);
    expect(nSeqend).toBe(nPoly);
    // Each POLYLINE carries code 66 = 1 (vertices follow).
    expect(p.filter(([c, v]) => c === '66' && v === '1').length).toBe(nPoly);
  });

  it('parses with the raw third-party dxf-parser (independent of our wrapper)', () => {
    const parser = new DxfParser();
    const parsed = parser.parseSync(dxf);
    expect(parsed).not.toBeNull();
    expect(parsed!.entities.length).toBeGreaterThan(0);
    // Layer table round-trips.
    const tableLayers = Object.keys(parsed!.tables?.layer?.layers ?? {});
    for (const l of STB_TEMPLATE_LAYERS) expect(tableLayers).toContain(l);
    // Entity types limited to the conservative set.
    const types = new Set(parsed!.entities.map((en) => en.type));
    for (const t of types) expect(['LINE', 'POLYLINE', 'TEXT']).toContain(t);
  });
});
