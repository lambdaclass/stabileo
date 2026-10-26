/**
 * A check that was not evaluated prints N.E., never (0.00).
 *
 * The footing, slab and wall checks report UNSUPPORTED with `utilization: 0`: a placeholder the
 * status qualifies. The report printed the number in parentheses and the schedule wrote 0 in the
 * utilization column, which a reader takes for a pass with a large margin.
 */
import { describe, expect, it } from 'vitest';
import { renderReportHtml, renderSchedule } from '../document-render';
import { buildDocumentModel } from '../document-model';
import type { DetailingAssembly } from '../assembly';

const footing = {
  id: 'footing:F1', ownerId: 'F1', family: 'footing', status: 'UNSUPPORTED', maturity: 'IMPLEMENTED_PROVISIONAL', edition: '2025',
  revisions: { analysis: 1, loads: 1, regulation: 1, entity: 1 }, governingCombinations: [],
  checks: [{ key: 'punching', status: 'UNSUPPORTED', utilization: 0, governingCombination: null }],
  unsupported: [], assumptions: [],
  geometry: { name: 'F1', B: 1.5, L: 1.5, thickness: 0.5, d: 0.44, cover: 0.05, foundingElevation: -1.5, eccentricityB: 0, eccentricityL: 0, rotationDeg: 0 },
  support: { nodeId: 1, columnElementId: null, columnB: null, columnH: null },
  ground: null, demand: null,
  bearing: { status: 'UNSUPPORTED', qMax: 180, qMin: 0, eB: 0.4, eL: 0, uplift: true, allowable: 200, utilization: 0.9 },
  flexure: null, bottomMatGeometry: null, bottomMatAnchorage: null,
  oneWayShear: { status: 'OK', Vu: 100, phiVc: 400, utilization: 0.25 },
  punching: { status: 'UNSUPPORTED', position: null, truncatedSides: 0, Vu: 0, phiVc: 0, utilization: 0, equilibriumResidual: null },
  dowels: null, starterTies: null,
  schemaVersion: 1, recordId: 'footing:F1', ownerElementIds: [], regulationIds: ['cirsoc-201'], materialHash: 'm', resultHash: 'x',
  reinforcementHash: 'r', refs: [], markIds: [],
  barIds: [], geometryHash: 'g', inputHash: 'i',
  certificate: {
    family: 'footing', recordId: 'footing:F1', ownerId: 'F1', ownerElementIds: [], inputHash: 'i', geometryHash: 'g',
    revisions: { analysis: 1, loads: 1, regulation: 1, entity: 1 }, edition: '2025', governingChecks: [],
    status: 'UNSUPPORTED', maturity: 'IMPLEMENTED_PROVISIONAL', assumptions: [], reinforcementHash: 'r', finalGeometryHash: 'f',
  },
};

function doc() {
  const assembly = {
    id: 'foundations', labelKey: 'detailing.assembly.level', labelParams: { level: '0' },
    kind: 'foundation', elementIds: [], bars: [], joints: [], conflicts: [], unsupported: [], marks: [],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 1, maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'cirsoc201.v2', trace: [], assumptions: [] },
    families: [footing],
  } as unknown as DetailingAssembly;
  return buildDocumentModel({
    seriesId: 'S', revision: { number: 1, at: '2026-10-11T00:00:00Z', author: 'B', detailingRevision: 1, demandRevision: 1 },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }], assemblies: [assembly], laps: [], certificates: [],
    convergence: { scope: ['footing'], outOfScope: [] },
  } as never);
}

describe('an unevaluated check is N.E. in the report and the schedule', () => {
  it('report', () => {
    const html = renderReportHtml(doc(), { locale: 'en', projectName: 'P' }, (k: string) => k);
    const punching = /Punching Vu \/ φVc<\/th><td>([^<]*)</.exec(html)?.[1];
    const bearing = /Bearing<\/th><td>([^<]*)</.exec(html)?.[1];
    const oneWay = /One-way shear Vu \/ φVc<\/th><td>([^<]*)</.exec(html)?.[1];
    const familyRow = /<td>punching<\/td><td class="bad">UNSUPPORTED<\/td><td>([^<]*)</.exec(html)?.[1];
    console.log('REPORT', JSON.stringify({ punching, bearing, oneWay, familyRow }));
    expect(punching).toBe('0.0 / 0.0 kN (N.E.)');
    expect(bearing).toBe('180.0 / 200.0 kPa (N.E.)');
    expect(oneWay).toBe('100.0 / 400.0 kN (0.25)');
    expect(familyRow).toBe('N.E.');
  });

  it('schedule', () => {
    const sheets = renderSchedule(doc(), { locale: 'en', projectName: 'P' });
    const rows = sheets.flatMap((s) => s.aoa);
    const head = rows.findIndex((r) => r[0] === 'Footing');
    const f = rows[head + 1]!;
    const family = rows.find((r) => r[0] === 'F1' && r[1] === 'punching')!;
    console.log('SCHEDULE', JSON.stringify(rows[head]), JSON.stringify(f), JSON.stringify(family));
    const col = (name: string) => rows[head]!.indexOf(name);
    expect(f[col('Punching util.')]).toBe('N.E.');
    expect(f[col('Shear util.')]).toBe(0.25);
    expect(family[3]).toBe('N.E.');
  });
});
