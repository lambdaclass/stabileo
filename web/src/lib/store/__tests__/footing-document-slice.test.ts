/**
 * The footing vertical slice, end to end, through production callers only.
 *
 * ── What this file exists to prove ─────────────────────────────────
 *
 * PR18 shipped a complete, reachable, persisted footing DESIGN and no footing DELIVERABLE.
 * The report, the DXF and the XLSX were PR17's and had no PR18 consumer: a user could
 * dimension a footing, check it, generate its dowels and get no drawing, schedule or report
 * for any of it. The panel's export buttons were there and covered nothing.
 *
 * So this file follows one footing along the whole lifecycle the brief specifies —
 *
 *   production adapter → family design record → physical assembly → family certificate
 *   → DocumentModel → report / XLSX → supersession
 *
 * — and asserts at each step that the artefact contains the footing's real numbers. Nothing
 * is seeded, `seedDetailing` is not used, and no store is injected: the model is built
 * through `modelStore`'s own API, the results are published through the setters the solve
 * path uses, and the document is built by the single production caller.
 *
 * ── Semantic assertions, not smoke tests ───────────────────────────
 *
 * Each assertion names a VALUE that must appear, not merely that a string is non-empty. A
 * report that renders and omits the bearing pressure passes a smoke test and fails an
 * engineer, and that is the failure mode this whole chain has been removing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
// The store INDEX, for its side effects: it is where the app registers the cross-store hooks,
// including `_setOnFoundationChange`. Importing the stores individually would leave that
// wiring inactive and the supersession assertions below would pass against nothing.
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import {
  renderDrawings, renderReportHtml, renderSchedule,
} from '../../engine/detailing/document-render';
import type { MemberDesignOutcome } from '../../engine/design/outcome';
import type { DocumentModel } from '../../engine/detailing/document-model';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';

/** A single column on a pad footing, solved, with soil and accepted column bars. */
function buildFootingModel() {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();

  const base = modelStore.addNode(0, 0, 0);
  const top = modelStore.addNode(0, 0, 3);
  modelStore.addSupport(base, 'fixed3d');
  const column = modelStore.addElement(base, top, 'frame');
  const sectionId = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4 });
  modelStore.updateElementSection(column, sectionId);

  const profileId = modelStore.addSoilProfile('Arena densa');
  modelStore.updateSoilProfile(profileId, {
    bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 },
    provenance: { source: 'report', reference: 'EG-2026-14' },
    unitWeightKNm3: 18,
  });

  const footingId = modelStore.addFooting(base, 'Z1');
  modelStore.updateFooting(footingId, {
    B: 2.0, L: 2.0, thickness: 0.5, columnElementId: column, foundingElevation: -1.2,
  });

  verificationStore.setDesignOutcomes({
    outcomes: new Map<number, MemberDesignOutcome>([[column, {
      elementId: column, elementType: 'column', codeId: 'cirsoc', codeVersion: '2025',
      outcome: 'VERIFIED',
      accepted: {
        column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
        stirrups: { diameter: 8, legs: 4, spacing: 0.15 },
      },
    } as MemberDesignOutcome]]),
  } as never);

  const res = (fz: number) => ({
    displacements: [], elementForces: [], quadStresses: [],
    reactions: [{ nodeId: base, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 }],
  }) as never;
  resultsStore.setCombinationResults3D(
    new Map([[1, res(-400)], [2, res(-200)]]),
    new Map([[1, res(-900)]]),
    {} as never,
  );
  return { base, column, footingId, profileId };
}

/** Run the production design command, then the production document builder. */
function designAndDocument(): DocumentModel {
  detailingStore.generateFloors();
  const doc = detailingStore.buildDocument({
    author: 'Bauti', at: '2026-07-28T12:00:00Z',
  });
  expect(doc, 'the production document builder must produce a document').not.toBeNull();
  return doc!;
}

/**
 * The i18n boundary, as the app supplies it: key → the locale's own sentence.
 *
 * The SHIPPED dictionaries, not a stub. A test-only translator that echoed its key would let
 * a missing translation pass unnoticed, and an untranslated engine message reaching a report
 * is exactly the failure the structured-message rule exists to prevent.
 */
function translator(locale: 'en' | 'es') {
  const dict: Record<string, string> = locale === 'es' ? es : en;
  return (key: string, params?: Record<string, unknown>) => {
    const raw = dict[key];
    if (raw === undefined) return key;
    return raw.replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? `{${k}}`));
  };
}

describe('the footing slice reaches its record and certificate', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('persists a footing design record on the assembly, not in transient state', () => {
    buildFootingModel();
    detailingStore.generateFloors();
    // Read from the MODEL, not from `lastFootingRun`. The transient run result is what used
    // to be the only home for this evidence, and it died on reload; the assertion that
    // matters is that the record is on the persisted assembly.
    const assemblies = modelStore.model.detailing?.assemblies ?? [];
    const floor = assemblies.find((a) => a.id.startsWith('FLOOR-'))!;
    expect(floor, 'a floor assembly must be persisted').toBeTruthy();
    const rec = floor.families?.find((r) => r.family === 'footing');
    expect(rec, 'the footing design record must be persisted').toBeTruthy();
    if (rec!.family !== 'footing') throw new Error('narrowing');

    // The real inputs, reconstructible with no UI state.
    expect(rec!.geometry.name).toBe('Z1');
    expect(rec!.geometry.B).toBeCloseTo(2.0, 9);
    expect(rec!.geometry.thickness).toBeCloseTo(0.5, 9);
    expect(rec!.geometry.d).toBeGreaterThan(0);
    expect(rec!.ground?.allowableBearingKPa).toBe(250);
    expect(rec!.ground?.source).toBe('report');
    expect(rec!.ground?.reference).toBe('EG-2026-14');
    expect(rec!.support.columnElementId).not.toBeNull();
    // The governing reaction, and the fact that the choice is auditable.
    expect(rec!.demand?.factoredAxial).toBeCloseTo(900, 6);
    expect(rec!.demand?.serviceAxial).toBeCloseTo(600, 6);
    expect(rec!.demand?.serviceCaseTypes.length).toBeGreaterThan(0);
    expect(rec!.demand?.considered.length).toBeGreaterThan(0);
    // The results.
    expect(rec!.bearing?.qMax).toBeGreaterThan(0);
    expect(rec!.flexure?.Mu).toBeGreaterThan(0);
    expect(rec!.oneWayShear).not.toBeNull();
    expect(rec!.punching).not.toBeNull();
  });

  it('measures the punching free-body residual rather than asserting equilibrium', () => {
    buildFootingModel();
    detailingStore.generateFloors();
    const floor = (modelStore.model.detailing?.assemblies ?? [])
      .find((a) => a.id.startsWith('FLOOR-'))!;
    const rec = floor.families!.find((r) => r.family === 'footing')!;
    if (rec.family !== 'footing') throw new Error('narrowing');
    // N_u − (V_u + q_u·A_enclosed) must be zero. Measuring it is what proves the free body
    // the record describes is the one the check solved; asserting it would prove nothing.
    expect(rec.punching!.equilibriumResidual).not.toBeNull();
    expect(Math.abs(rec.punching!.equilibriumResidual!)).toBeLessThan(1e-6);
    // And the perimeter is classified, not assumed: a pad footing extends past its column
    // on all four sides, so the perimeter closes.
    expect(rec.punching!.position).toBe('interior');
    expect(rec.punching!.truncatedSides).toBe(0);
  });

  it('binds the certificate to the dowels and starter ties that exist', () => {
    buildFootingModel();
    detailingStore.generateFloors();
    const floor = (modelStore.model.detailing?.assemblies ?? [])
      .find((a) => a.id.startsWith('FLOOR-'))!;
    const rec = floor.families!.find((r) => r.family === 'footing')!;
    if (rec.family !== 'footing') throw new Error('narrowing');

    expect(rec.dowels, 'the column has accepted bars, so dowels exist').toBeTruthy();
    expect(rec.dowels!.count).toBe(8);
    expect(rec.dowels!.barIds.length).toBe(8);
    expect(rec.starterTies!.pieces).toBeGreaterThan(0);
    // Every bar the record claims is a bar in the assembly, and every one is covered by a
    // mark — so a schedule row traces back to the record that justifies it.
    const ids = new Set(floor.bars.map((b) => b.id));
    for (const id of rec.barIds) expect(ids.has(id), id).toBe(true);
    expect(rec.markIds.length).toBeGreaterThan(0);
    for (const m of rec.markIds) {
      expect(floor.marks.some((x) => x.mark === m), m).toBe(true);
    }
    expect(rec.certificate.reinforcementHash).not.toBe('');
    expect(rec.certificate.finalGeometryHash).not.toBe('');
  });
});

describe('the footing slice reaches its documents', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('carries the record and its freshness into the DocumentModel', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const a = doc.assemblies.find((x) => x.id.startsWith('FLOOR-'))!;
    expect(a.families.length).toBeGreaterThan(0);
    const entry = a.familyCertificates.find((c) => c.family === 'footing')!;
    expect(entry.ownerId).toBe('F1');
    // Freshness is DECIDED at document time against the model as it stands — not copied off
    // the record, which would make a stale certificate undetectable.
    expect(entry.freshness).toBe('fresh');
    expect(entry.applies).toBe(true);
  });

  it('rolls the record maturity into the document, so a footing cannot outrank itself', () => {
    buildFootingModel();
    const doc = designAndDocument();
    // Every footing calculation is IMPLEMENTED_PROVISIONAL until an external worked example
    // promotes it, and the document must say so rather than reporting the assembly's own.
    expect(doc.maturity).not.toBe('VALIDATED');
  });

  it('prints the footing geometry, ground provenance and every check in the report', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const html = renderReportHtml(doc, { locale: 'es', projectName: 'Obra' }, translator('es'));

    // Geometry and the supported column.
    expect(html).toContain('Z1');
    expect(html).toMatch(/2\.00 × 2\.00 × 0\.50 m/);
    // Ground conditions WITH provenance. Bearing pressure has no regulatory source, so the
    // reference must travel onto every document that relies on it.
    expect(html).toContain('Arena densa');
    expect(html).toContain('250.0 kPa');
    expect(html).toContain('EG-2026-14');
    // The governing reaction and the service sum.
    expect(html).toContain('900.0 kN');
    expect(html).toContain('600.0 kN');
    // Each check by name.
    for (const k of ['bearing', 'flexure', 'oneWayShear', 'punching']) {
      expect(html, k).toContain(k);
    }
    // Contact pressure, eccentricity, partial contact and the equilibrium residual.
    expect(html).toMatch(/Presión de contacto/);
    expect(html).toMatch(/Excentricidad/);
    expect(html).toMatch(/Contacto parcial/);
    expect(html).toMatch(/Residuo de equilibrio/);
    // Dowels and starter ties as real quantities.
    expect(html).toMatch(/8 Ø20 mm/);
    expect(html).toMatch(/Estribos de arranque/);
    // The certificate and its agreement with the model.
    expect(html).toMatch(/Certificados de familia/);
    expect(html).toContain('fresh');
  });

  it('renders the same footing content in English', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const html = renderReportHtml(doc, { locale: 'en', projectName: 'Site' }, translator('en'));
    expect(html).toContain('Ground conditions');
    expect(html).toContain('Design reaction');
    expect(html).toContain('Allowable pressure');
    expect(html).toContain('Provenance');
    expect(html).toContain('EG-2026-14');
    expect(html).toContain('Equilibrium residual');
    expect(html).toContain('Dowels and starter ties');
    expect(html).toContain('Family certificates');
    // The Spanish headings must NOT leak into the English report.
    expect(html).not.toContain('Condiciones del terreno');
    expect(html).not.toContain('Reacción de diseño');
  });

  it('never prints a fabricated zero where a value is absent', () => {
    // A footing on a stratum that states no capacity. The report must show the stratum and
    // say NOT STATED — not 0 kPa, which reads as a number somebody measured.
    const { profileId } = buildFootingModel();
    modelStore.updateSoilProfile(profileId, { bearing: { kind: 'unstated' } });
    const doc = designAndDocument();
    const html = renderReportHtml(doc, { locale: 'en', projectName: 'Site' }, translator('en'));
    expect(html).toContain('Arena densa');
    expect(html).toContain('NOT STATED');
    expect(html).not.toMatch(/Allowable pressure<\/th><td>0\.0 kPa/);
    // And the footing is reported as not verified rather than omitted.
    expect(html).toContain('Not verified');
  });
});

describe('the footing slice reaches its exports', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('schedules every dowel and tie path from the marked assembly', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const sheets = renderSchedule(doc, { locale: 'en', projectName: 'Site' });
    const sheet = sheets.find((s) => s.name.startsWith('FLOOR-'))!;
    expect(sheet, 'the floor assembly must produce a schedule sheet').toBeTruthy();
    const flat = sheet.aoa.map((r) => r.map(String).join('|')).join('\n');

    // The bar rows come from `assignMarks` over the assembly's own bars, so a dowel is a
    // scheduled item like any other: mark, diameter, shape, cut length, count, mass.
    const floor = (modelStore.model.detailing?.assemblies ?? [])
      .find((a) => a.id.startsWith('FLOOR-'))!;
    expect(floor.marks.length).toBeGreaterThan(0);
    for (const m of floor.marks) expect(flat, m.mark).toContain(m.mark);
    expect(flat).toContain('Mass (kg)');

    // The family blocks: which record each mark belongs to, and its verification state.
    expect(flat).toContain('FLOOR FAMILIES');
    expect(flat).toContain('FAMILY CHECKS');
    expect(flat).toContain('FOOTINGS');
    expect(flat).toContain('footing|F1');
    // Footing quantities and the ground provenance, in the spreadsheet as in the report.
    expect(flat).toContain('Z1');
    expect(flat).toContain('250');
    expect(flat).toContain('EG-2026-14');
    // Every check appears with its status.
    for (const k of ['bearing', 'flexure', 'oneWayShear', 'punching']) {
      expect(flat, k).toContain(k);
    }
  });

  it('reconciles the schedule against the record: same marks, same bar count', () => {
    // The document exists so a report and a schedule cannot disagree. This is the
    // reconciliation, asserted rather than assumed.
    buildFootingModel();
    const doc = designAndDocument();
    const a = doc.assemblies.find((x) => x.id.startsWith('FLOOR-'))!;
    const rec = a.families.find((r) => r.family === 'footing')!;
    const scheduled = new Set(a.source.marks.flatMap((m) => m.barIds));
    for (const id of rec.barIds) expect(scheduled.has(id), id).toBe(true);
    // And the schedule's quantity for the record's marks covers the record's bars.
    const covered = a.source.marks
      .filter((m) => rec.markIds.includes(m.mark))
      .reduce((n, m) => n + m.quantity, 0);
    expect(covered).toBeGreaterThanOrEqual(rec.barIds.length);
  });

  it('leaves an unstated bearing pressure BLANK in the spreadsheet, never 0', () => {
    const { profileId } = buildFootingModel();
    modelStore.updateSoilProfile(profileId, { bearing: { kind: 'unstated' } });
    const doc = designAndDocument();
    const sheets = renderSchedule(doc, { locale: 'en', projectName: 'Site' });
    const sheet = sheets.find((s) => s.name.startsWith('FLOOR-'))!;
    const footingRow = sheet.aoa.find((r) => r[0] === 'Z1');
    expect(footingRow, 'the footing must still be scheduled').toBeTruthy();
    // Column 7 is the allowable pressure. Blank, not zero.
    expect(footingRow![7]).toBe('');
    expect(sheet.aoa.some((r) => r[0] === 'NOT VERIFIED')).toBe(true);
  });
});

describe('supersession: editing a footing retires the document it justified', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('an edit to B/L/thickness supersedes the current document', () => {
    const { footingId } = buildFootingModel();
    const first = designAndDocument();
    expect(first.readiness).not.toBe('SUPERSEDED');
    const firstRevision = first.revision.number;

    // The user widens the footing. Analysis is preserved — a footing carries a reaction, it
    // does not change stiffness — but the design that was built for a 2,0 m base is no
    // longer a design for a 2,6 m one.
    modelStore.updateFooting(footingId, { B: 2.6, L: 2.6 });

    expect(detailingStore.document, 'the current document must be retired').toBeNull();
    const retired = detailingStore.supersededDocuments
      .find((d) => d.revision.number === firstRevision);
    expect(retired, 'the old revision must be KEPT, not deleted').toBeTruthy();
    expect(retired!.readiness).toBe('SUPERSEDED');
    expect(retired!.supersededBy).toBeGreaterThan(firstRevision);
    // The superseded document still renders, and still carries the geometry it was built
    // from. A project that cannot show what it previously issued cannot answer the only
    // question that matters after something goes wrong.
    const html = renderReportHtml(retired!, { locale: 'en', projectName: 'Site' },
      translator('en'));
    expect(html).toMatch(/SUPERSEDED BY REVISION/);
    expect(html).toMatch(/2\.00 × 2\.00 × 0\.50 m/);
  });

  it('a geotechnical edit supersedes it too', () => {
    const { profileId } = buildFootingModel();
    const first = designAndDocument();
    const firstRevision = first.revision.number;
    modelStore.updateSoilProfile(profileId, {
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 180 },
    });
    expect(detailingStore.document).toBeNull();
    expect(detailingStore.supersededDocuments
      .some((d) => d.revision.number === firstRevision)).toBe(true);
  });

  it('regenerating after the edit produces a NEW current revision with the new geometry', () => {
    const { footingId } = buildFootingModel();
    const first = designAndDocument();
    modelStore.updateFooting(footingId, { B: 2.6, L: 2.6 });

    const next = designAndDocument();
    expect(next.revision.number).toBeGreaterThan(first.revision.number);
    expect(next.readiness).not.toBe('SUPERSEDED');
    const rec = next.assemblies
      .find((a) => a.id.startsWith('FLOOR-'))!.families
      .find((r) => r.family === 'footing')!;
    if (rec.family !== 'footing') throw new Error('narrowing');
    expect(rec.geometry.B).toBeCloseTo(2.6, 9);
    // A new geometry means a new input hash, so the old certificate could not have applied.
    const old = first.assemblies
      .find((a) => a.id.startsWith('FLOOR-'))!.families
      .find((r) => r.family === 'footing')!;
    expect(rec.certificate.inputHash).not.toBe(old.certificate.inputHash);
    expect(rec.certificate.geometryHash).not.toBe(old.certificate.geometryHash);
  });

  it('the record is stale-detectable: its certificate does not describe a resized footing', () => {
    // The sharpest form of the guarantee. Design, then resize WITHOUT regenerating: the
    // persisted record still describes the old footing, and the document built now must
    // report its certificate as not applying rather than as current.
    const { footingId } = buildFootingModel();
    detailingStore.generateFloors();
    modelStore.updateFooting(footingId, { thickness: 0.8 });

    const doc = detailingStore.buildDocument({
      author: 'Bauti', at: '2026-07-28T13:00:00Z',
    })!;
    const a = doc.assemblies.find((x) => x.id.startsWith('FLOOR-'))!;
    const rec = a.families.find((r) => r.family === 'footing')!;
    if (rec.family !== 'footing') throw new Error('narrowing');
    // The record is a historical statement and remains true about the OLD footing.
    expect(rec.geometry.thickness).toBeCloseTo(0.5, 9);
    // The model now holds a different footing, so the document must not read as issued.
    expect(doc.readiness).toBe('REVIEW_DRAFT');
  });
});

describe('the footing slice reaches its drawings', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('produces a plan and TWO orthogonal sections per footing', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const set = renderDrawings(doc, { locale: 'es', projectName: 'Obra' });
    const names = set.sheets.map((s) => s.name);
    expect(names).toContain('FLOOR--1.200-Z1-plan');
    expect(names).toContain('FLOOR--1.200-Z1-sectionB');
    expect(names).toContain('FLOOR--1.200-Z1-sectionL');
  });

  it('draws the plan from the footing outline, not from the bounding box of the steel', () => {
    // The generic elevation frames an assembly by its longest bar. In a pad footing that is a
    // dowel, so the sheet came out looking down the column with the outline round the dowel
    // cage. The plan must be B × L.
    buildFootingModel();
    const doc = designAndDocument();
    const plan = renderDrawings(doc, { locale: 'es', projectName: 'Obra' })
      .sheets.find((s) => s.name.endsWith('-plan'))!.sheet;
    expect(plan.kind).toBe('floorPlan');
    const w = plan.extents.max.x - plan.extents.min.x;
    const h = plan.extents.max.y - plan.extents.min.y;
    // 2,0 m base plus the 0,3 m margin each side. A sheet framed on the 0,4 m dowel cage
    // would be far smaller than this.
    expect(w).toBeGreaterThan(2.0);
    expect(h).toBeGreaterThan(2.0);
    // Both plan dimensions are annotated, in millimetres.
    const labels = plan.dimensions.map((d) => d.label);
    expect(labels).toContain('B = 2000');
    expect(labels).toContain('L = 2000');
  });

  it('sections carry the thickness, the cover and the founding level', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const sheets = renderDrawings(doc, { locale: 'es', projectName: 'Obra' }).sheets;
    for (const kind of ['sectionB', 'sectionL']) {
      const s = sheets.find((x) => x.name.endsWith(kind))!.sheet;
      expect(s.kind, kind).toBe('section');
      const labels = s.dimensions.map((d) => d.label);
      expect(labels, kind).toContain('h = 500');
      expect(labels.some((l) => l.startsWith('rec. ')), kind).toBe(true);
      // Real elevations, not a local zero: the founding level reads as −1,20 m.
      expect(s.texts.some((t) => t.text === 'NF -1.20 m'), kind).toBe(true);
      // The two sections annotate DIFFERENT axes.
      expect(labels.some((l) => l.startsWith(kind === 'sectionB' ? 'B = ' : 'L = ')), kind)
        .toBe(true);
    }
  });

  it('draws the bars that exist, and labels each mark once', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const plan = renderDrawings(doc, { locale: 'es', projectName: 'Obra' })
      .sheets.find((s) => s.name.endsWith('-plan'))!.sheet;
    // Dowels are vertical, so in plan they are circles in true position — eight of them.
    expect(plan.circles.length).toBeGreaterThanOrEqual(8);
    // One label per mark, not per bar: a mat of thirty bars carries one mark.
    const marks = plan.texts.filter((t) => t.layer === 'RC-MARK').map((t) => t.text);
    expect(new Set(marks).size).toBe(marks.length);
    expect(marks.length).toBeGreaterThan(0);
    const floor = (modelStore.model.detailing?.assemblies ?? [])
      .find((a) => a.id.startsWith('FLOOR-'))!;
    for (const m of marks) {
      expect(floor.marks.some((x) => x.mark === m), m).toBe(true);
    }
  });

  it('preview and DXF are two renderings of ONE drawing model', () => {
    buildFootingModel();
    const doc = designAndDocument();
    const plan = renderDrawings(doc, { locale: 'es', projectName: 'Obra' })
      .sheets.find((s) => s.name.endsWith('-plan'))!;
    // Both exist, both non-trivial, and both were produced from the same `Sheet` — which is
    // the property that stops a preview and a DXF disagreeing about the same footing.
    expect(plan.dxf).toContain('SECTION');
    expect(plan.dxf).toContain('RC-OUTLINE');
    expect(plan.svg).toContain('<svg');
    // The whole set concatenates into one DXF, so the footing sheets are exported with the
    // rest of the floor rather than beside it.
    const set = renderDrawings(doc, { locale: 'es', projectName: 'Obra' });
    expect(set.dxf).toContain('RC-OUTLINE');
    expect(set.dxf.length).toBeGreaterThan(plan.dxf.length);
  });

  it('every sheet carries the readiness banner and the unverified conditions', () => {
    // A limitation that lives only in the report is a limitation the person holding the
    // drawing does not know about.
    const { profileId } = buildFootingModel();
    modelStore.updateSoilProfile(profileId, { bearing: { kind: 'unstated' } });
    const doc = designAndDocument();
    const sheets = renderDrawings(doc, { locale: 'en', projectName: 'Site' }).sheets
      .filter((s) => s.name.includes('-Z1-'));
    expect(sheets.length).toBe(3);
    for (const s of sheets) {
      expect(s.sheet.title.title, s.name).toMatch(/REVIEW DRAFT|NOT FOR CONSTRUCTION/);
      // The note block carries the record's own keys, so the renderer can translate them.
      expect(s.sheet.notes.some((nn) => nn.startsWith('certificate:')), s.name).toBe(true);
      expect(s.sheet.notes.some((nn) => nn === 'ground.allowable:notStated'), s.name).toBe(true);
      expect(s.sheet.notes.some((nn) => nn.startsWith('footing.run.')), s.name).toBe(true);
    }
  });
});
