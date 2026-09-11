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
import {
  renderReportHtml, renderDrawings, renderSchedule, readinessBanner, scopeStatement,
} from '../document-render';
import { buildDocumentModel, type CertificateEntry } from '../document-model';
import type { DetailingAssembly } from '../assembly';
import type { BarConflict } from '../collision';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { clause } from '../../../codes/regulation';
import type { LapInterval } from '../lap-materialize';
import type { DesignFamily } from '../../design/design-families';

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

function doc(over: {
  conflicts?: BarConflict[];
  state?: DetailingAssembly['state'];
  /** The scope this document answers for. A frame set under undesigned slabs, by default. */
  convergence?: { scope: DesignFamily[]; outOfScope: DesignFamily[] };
} = {}) {
  return buildDocumentModel({
    seriesId: 'S', revision: {
      number: 5, at: '2026-07-27T09:00:00Z', author: 'Bauti',
      detailingRevision: 7, demandRevision: 4,
    },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: [assembly({ conflicts: over.conflicts ?? [], state: over.state ?? 'ISSUED' })],
    laps: [LAP], certificates: [CERT],
    convergence: over.convergence
      ?? { scope: ['column', 'beam'], outOfScope: ['slab'] },
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

  it('the report carries the banner, the inventory and the conflict table', () => {
    const html = renderReportHtml(d, OPTS, T);
    expect(html).toContain('NOT FOR CONSTRUCTION');
    expect(html).toContain('Constructibility conflicts');
    expect(html).toContain('prohibitedOverlap');
    // Measured against required, both present.
    expect(html).toContain('-6');
    expect(html).toContain('25');
    // The three statements the section makes, in the order it makes them: the geometry
    // exists, the conflict is a constructibility problem, and the result may not be issued.
    expect(html).toContain('WAS GENERATED');
    expect(html).toContain('Inventory by category');
    expect(html).toContain('interpenetration');
    expect(html).toContain('NOT VALID FOR FINAL ISSUE');
    // Both bars stay separately addressable — the traceability requirement.
    expect(html).toContain('Bar A');
    expect(html).toContain('Bar B');
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

// ─── 7 — every export declares exactly the families it covers ────

/**
 * The qualifier that keeps a true claim from being read as a false one.
 *
 * `readiness` is a statement about the assemblies in the set. A reader takes a sheet stamped
 * ISSUED FOR CONSTRUCTION to be a statement about the BUILDING, and those coincide only when the
 * set covers every family the model holds. A run scoped to beams and columns does not, and the
 * person reading the sheet on site was not in the room when the scope was chosen.
 *
 * So this is asserted on all three outputs, not on one. The report prints the banner, the
 * spreadsheet carries it in its title block, and the DXF sheet gets it as a note — each is the
 * output most likely to reach somebody on its own.
 */
describe('every export states the scope it covers, and what it leaves out', () => {
  const OUT_OF_SCOPE = { scope: ['column', 'beam'] as DesignFamily[],
    outOfScope: ['slab', 'footing'] as DesignFamily[] };

  it('the statement names the covered families AND the excluded ones', () => {
    const s = scopeStatement(doc({ convergence: OUT_OF_SCOPE }), 'en');
    expect(s).toContain('SCOPE: COLUMNS, BEAMS');
    expect(s).toContain('NOT IN THIS SET: SLABS, FOUNDATIONS');
  });

  it('a set that covers everything says so without an exclusion clause', () => {
    // Not an empty "NOT IN THIS SET:" trailing the line. The absence of an exclusion is the
    // claim, and printing an empty list would read as a redaction.
    const s = scopeStatement(
      doc({ convergence: { scope: ['column', 'beam'], outOfScope: [] } }), 'en');
    expect(s).toBe('SCOPE: COLUMNS, BEAMS');
  });

  it('a document with no scope information says THAT, rather than claiming all of it', () => {
    /*
     * The failure mode this protects: a caller that omits the convergence gets a set naming no
     * families, which is visibly wrong. A set that silently claimed every family would be a
     * fabricated claim in the one place it cannot be checked.
     */
    const bare = buildDocumentModel({
      seriesId: 'S', revision: {
        number: 1, at: '2026-07-27T09:00:00Z', author: 'B',
        detailingRevision: 1, demandRevision: 1,
      },
      regulations: [], assemblies: [assembly({ conflicts: [], state: 'ISSUED' })],
      laps: [], certificates: [],
    });
    expect(bare.scope).toEqual([]);
    expect(scopeStatement(bare, 'en')).toBe('SCOPE NOT STATED');
  });

  it('the readiness banner carries it, on the state most likely to be misread', () => {
    // ISSUED specifically. A draft already says NOT FOR CONSTRUCTION; this is the stamp a
    // reader acts on, and it is where an unqualified scope does real damage.
    const banner = readinessBanner(doc({ convergence: OUT_OF_SCOPE }), 'en');
    expect(banner).toContain('ISSUED FOR CONSTRUCTION');
    expect(banner).toContain('NOT IN THIS SET: SLABS, FOUNDATIONS');
  });

  it('and on a draft too — a partial scope is still partial before it is issued', () => {
    const banner = readinessBanner(
      doc({ conflicts: [CONFLICT], convergence: OUT_OF_SCOPE }), 'en');
    expect(banner).toContain('REVIEW DRAFT');
    expect(banner).toContain('SCOPE: COLUMNS, BEAMS');
  });

  it('the report prints it', () => {
    const html = renderReportHtml(doc({ convergence: OUT_OF_SCOPE }), OPTS, T);
    expect(html).toContain('NOT IN THIS SET: SLABS, FOUNDATIONS');
  });

  it('the spreadsheet carries it in the sheet the fabricator reads', () => {
    const sheets = renderSchedule(doc({ convergence: OUT_OF_SCOPE }), OPTS);
    const flat = sheets.flatMap((s) => s.aoa.flat()).join(' | ');
    expect(flat).toContain('SCOPE: COLUMNS, BEAMS');
  });

  it('the DXF sheet carries it as a note, because it has no banner of its own', () => {
    const set = renderDrawings(doc({ convergence: OUT_OF_SCOPE }), OPTS);
    const notes = set.sheets.flatMap((s) => s.sheet.notes);
    expect(notes.some((n) => n.includes('SCOPE: COLUMNS, BEAMS')),
      `notes were: ${notes.join(' // ')}`).toBe(true);
  });

  it('and it is translated where the rest of the stamp is', () => {
    const s = scopeStatement(doc({ convergence: OUT_OF_SCOPE }), 'es');
    expect(s).toContain('ALCANCE: COLUMNAS, VIGAS');
    expect(s).toContain('NO INCLUYE: LOSAS, FUNDACIONES');
  });
});
