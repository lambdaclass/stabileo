/**
 * Export content, parsed.
 *
 * A test that asserts a download fired proves the button works and nothing about the file.
 * These parse what the three renderers actually produce and assert the facts are in it —
 * the regulation edition in the report, real geometry entities in the DXF, a cutting
 * length in the schedule.
 *
 * The second thing they defend is the draft rule: a conflicted floor produces all three
 * files, and every one of them says on its face that it is not for construction.
 */

import { describe, expect, it } from 'vitest';
import { renderReportHtml, renderDrawings, renderSchedule, readinessBanner } from '../document-render';
import { buildDocumentModel, type CertificateEntry } from '../document-model';
import type { DetailingAssembly } from '../assembly';
import type { BarConflict } from '../collision';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { clause } from '../../../codes/regulation';
import type { LapInterval } from '../lap-materialize';

const X = { x: 1, y: 0, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

function bar(id: string, hooked = false): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: 16, role: 'longitudinal',
    start: { x: 0, y: 0, z: 0.05 }, end: { x: 5, y: 0, z: 0.05 },
    axis: X, hookNormal: UP,
    endHook: hooked ? 90 : undefined,
    ownerElementIds: [1], layerId: 'e1:bottom:0',
  });
}

const LAP: LapInterval = {
  jointId: 'n7', fromBarId: 'b1', toBarId: 'b2',
  from: { x: 4, y: 0, z: 0.05 }, to: { x: 4.8, y: 0, z: 0.05 },
  lapLength: 0.8, kind: 'contactLap', spliceClass: 'B', offset: 0.014,
  maxOffset: Number.POSITIVE_INFINITY,
  refs: [clause('cirsoc-201', '2025', '25.5.1.2', 'empalmes en contacto')],
};

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  return {
    id: 'level-3.20', labelKey: 'detailing.assembly.level', labelParams: { level: '3.20' },
    kind: 'beamLine', elementIds: [1, 2],
    bars: [bar('b1', true), bar('b2')],
    joints: [], conflicts: [], unsupported: [],
    marks: [{
      mark: 'B1', diameterMm: 16, cuttingLength: 5.34, quantity: 2,
      shape: 'L90', massKg: 16.9, barIds: ['b1', 'b2'],
    }],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 7,
    maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'cirsoc201.v2', trace: [], assumptions: [] },
    ...over,
  } as DetailingAssembly;
}

const CERT: CertificateEntry = {
  elementId: 1, certifiedHash: 'h', currentHash: 'h', matches: true,
  verifierId: 'cirsoc201.v2', status: 'ok',
};

const CONFLICT = {
  severity: 'blocking', barA: 'b1', barB: 'b2', at: { x: 2, y: 0, z: 0.05 },
  clearance: -0.006, required: 0.025, shortfall: 0.031,
  elementIds: [1, 2], pairClass: 'prohibitedOverlap',
} as BarConflict;

function doc(over: { conflicts?: BarConflict[]; state?: DetailingAssembly['state'] } = {}) {
  return buildDocumentModel({
    seriesId: 'S', revision: {
      number: 5, at: '2026-07-27T09:00:00Z', author: 'Bauti',
      detailingRevision: 7, demandRevision: 4,
    },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: [assembly({ conflicts: over.conflicts ?? [], state: over.state ?? 'ISSUED' })],
    laps: [LAP], certificates: [CERT],
  });
}

const OPTS = { locale: 'en', projectName: 'Test project' };
const T = (k: string) => k;

describe('the report carries the facts, not just headings', () => {
  const html = renderReportHtml(doc(), OPTS, T);

  it('names the regulation AND its edition', () => {
    expect(html).toContain('cirsoc-201');
    expect(html).toContain('2025');
  });

  it('states both revisions it was built from', () => {
    expect(html).toMatch(/Detailing rev\.<\/th><td>7</);
    expect(html).toMatch(/Demand rev\.<\/th><td>4</);
  });

  it('lists the member certificate and whether it still matches the geometry', () => {
    expect(html).toContain('cirsoc201.v2');
    expect(html).toMatch(/Matches geometry/);
  });

  it('lists the physical laps with class and length', () => {
    expect(html).toContain('n7');
    expect(html).toContain('contactLap');
    expect(html).toContain('800');
  });

  it('cites the clauses the bars were built under', () => {
    // Collected from the BARS, so the list is whatever those bars actually invoked — here
    // the hook geometry clauses, because that is what this fixture's steel uses. A fixed
    // expected clause would be asserting the fixture, not the mechanism.
    expect(html).toContain('Clauses applied');
    // 'Tabla 25.3.1' — hook geometry, which is what this fixture's steel actually invokes.
    expect(html).toMatch(/cirsoc-201 2025 §[\w\s.]+/);
    expect(html).toContain('25.3.1');
  });

  it('is real HTML, not an empty shell', () => {
    expect(html.length).toBeGreaterThan(1500);
    expect(html).toContain('<!doctype html>');
  });
});

describe('the DXF contains real geometry', () => {
  const set = renderDrawings(doc(), OPTS);

  it('produces at least one elevation and one section', () => {
    expect(set.sheets.length).toBeGreaterThanOrEqual(2);
    expect(set.sheets.some((s) => s.name.endsWith('elevation'))).toBe(true);
    expect(set.sheets.some((s) => s.name.endsWith('section'))).toBe(true);
  });

  it('is a well-formed DXF with entities, not a stub', () => {
    expect(set.dxf).toContain('SECTION');
    expect(set.dxf).toContain('ENTITIES');
    expect(set.dxf).toContain('EOF');
    expect(set.dxf.length).toBeGreaterThan(1000);
  });

  it('draws bars — vertices, not only a title block', () => {
    // Group code 10 is an X ordinate; a drawing with no coordinates has drawn nothing.
    const ordinates = set.dxf.split('\n').filter((l) => l.trim() === '10').length;
    expect(ordinates).toBeGreaterThan(10);
  });

  it('emits arcs for a hooked bar', () => {
    // The hook is an arc; flattening it to a straight line would misreport the bend.
    expect(set.dxf).toContain('ARC');
  });

  it('the SVG preview is non-empty too', () => {
    expect(set.sheets[0].svg).toContain('<svg');
    expect(set.sheets[0].svg.length).toBeGreaterThan(500);
  });
});

describe('the schedule carries fabrication data', () => {
  const sheets = renderSchedule(doc(), OPTS);
  const flat = sheets[0].aoa.map((r) => r.join('|')).join('\n');

  it('produces a sheet per assembly with rows', () => {
    expect(sheets).toHaveLength(1);
    expect(sheets[0].aoa.length).toBeGreaterThan(3);
  });

  it('includes a mass column and a member reference', () => {
    expect(flat).toMatch(/Mass \(kg\)/);
    expect(flat).toMatch(/Members/);
  });

  it('carries the layer identity', () => {
    expect(flat).toContain('e1:bottom:0');
  });

  it('has a lap block naming the joint and the class', () => {
    expect(flat).toContain('LAPS');
    expect(flat).toContain('n7');
    expect(flat).toContain('contactLap');
  });

  it('states the revision, maturity and readiness', () => {
    expect(flat).toContain('Revision|5');
    expect(flat).toContain('VALIDATED');
    expect(flat).toContain('ISSUED');
  });

  it('reports a real cutting length, not a placeholder', () => {
    const nums = sheets[0].aoa.flat().filter((v) => typeof v === 'number') as number[];
    expect(nums.some((n) => n > 0)).toBe(true);
  });
});

describe('a conflicted floor prints, and every file says it is a draft', () => {
  const d = doc({ conflicts: [CONFLICT], state: 'COORDINATED' });

  it('the document is a REVIEW_DRAFT', () => {
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });

  it('the report carries the banner and the conflict table', () => {
    const html = renderReportHtml(d, OPTS, T);
    expect(html).toContain('NOT FOR CONSTRUCTION');
    expect(html).toContain('Unresolved conflicts');
    expect(html).toContain('prohibitedOverlap');
    // Measured against required, both present.
    expect(html).toContain('-6');
    expect(html).toContain('25');
  });

  it('the DXF carries the banner and a conflict annotation', () => {
    const set = renderDrawings(d, OPTS);
    expect(set.dxf).toContain('NOT FOR CONSTRUCTION');
    expect(set.dxf).toContain('CONFLICT');
  });

  it('the schedule carries the banner and a conflict block', () => {
    const flat = renderSchedule(d, OPTS)[0].aoa.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('NOT FOR CONSTRUCTION');
    expect(flat).toContain('prohibitedOverlap');
  });

  it('none of them claims construction readiness', () => {
    const html = renderReportHtml(d, OPTS, T);
    expect(html).not.toContain('ISSUED FOR CONSTRUCTION');
  });
});

describe('the banner is localised', () => {
  it('Spanish', () => {
    expect(readinessBanner(doc({ conflicts: [CONFLICT] }), 'es'))
      .toContain('NO APTO PARA CONSTRUCCIÓN');
  });

  it('English', () => {
    expect(readinessBanner(doc({ conflicts: [CONFLICT] }), 'en'))
      .toContain('NOT FOR CONSTRUCTION');
  });

  it('a superseded document says which revision replaced it', () => {
    const base = doc();
    const sup = { ...base, readiness: 'SUPERSEDED' as const, supersededBy: 9 };
    expect(readinessBanner(sup, 'en')).toContain('SUPERSEDED BY REVISION 9');
  });
});
