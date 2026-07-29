/**
 * Slab–column punching, from solved forces to the issued document, through production only.
 *
 * ── What this file exists to prove ─────────────────────────────────
 *
 * The punching ENGINE has been complete since it was written and the footings have driven it
 * for several revisions. What did not exist was the slab–column COLLECTOR, so every
 * column-supported panel reported its governing check as unverified while the engine that
 * could answer it sat one import away. A collector with no consumers would be the same defect
 * one layer up: evidence produced and never issued.
 *
 * So this file follows one flat plate along the whole chain —
 *
 *   solved column forces → collector → design record → family certificate
 *   → DocumentModel → report / XLSX → regeneration
 *
 * — and asserts at each step that the artefact carries the joint's real numbers. Nothing is
 * seeded, `seedDetailing` is not used, and the model is built through `modelStore`'s own API.
 *
 * Each assertion names a VALUE that must appear, not merely that a table renders. A report
 * that prints a punching row and omits the axial force it was derived from passes a smoke test
 * and fails an engineer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import { renderReportHtml, renderSchedule } from '../../engine/detailing/document-render';
import type { DocumentModel } from '../../engine/detailing/document-model';
import type { ElementForces3D, QuadStress } from '../../engine/types-3d';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';

/**
 * A 2 × 2 mesh of 3 m panels at +3,00 on nine columns.
 *
 * Meshed deliberately: the centre node has four panels around it and is therefore an INTERIOR
 * joint, the edge midpoints have two, and the corners have one. One fixture exercises all
 * three tabulated positions, which is the classification the whole check turns on.
 */
function buildFlatPlate() {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();

  const sectionId = modelStore.addSection({
    name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4,
  });
  const material = [...modelStore.model.materials.keys()][0];

  /** Grid node ids at +3,00, indexed [ix][iy]. */
  const top: number[][] = [];
  const columns: number[] = [];
  const columnAtNode = new Map<number, number>();
  for (let ix = 0; ix < 3; ix++) {
    top[ix] = [];
    for (let iy = 0; iy < 3; iy++) {
      const x = ix * 3;
      const y = iy * 3;
      const base = modelStore.addNode(x, y, 0);
      const head = modelStore.addNode(x, y, 3);
      modelStore.addSupport(base, 'fixed3d');
      const col = modelStore.addElement(base, head, 'frame');
      modelStore.updateElementSection(col, sectionId);
      columns.push(col);
      columnAtNode.set(head, col);
      top[ix][iy] = head;
    }
  }

  const quads: number[] = [];
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      quads.push(modelStore.addQuad([
        top[ix][iy], top[ix + 1][iy], top[ix + 1][iy + 1], top[ix][iy + 1],
      ], material, 0.22));
    }
  }
  return { quads, columns, top, columnAtNode, centreNode: top[1][1] };
}

/** Axial with TENSION positive, as `ElementForces3D` reports it. */
function columnForces(elementId: number, axialTension: number): ElementForces3D {
  return {
    elementId, length: 3,
    nStart: axialTension, nEnd: axialTension,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false,
    releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
  } as ElementForces3D;
}

/**
 * Publish per-combination results through the setter the solve path uses.
 *
 * One result per combination the MODEL defines: publishing an arbitrary set would leave the
 * solved results and the model's own combinations disagreeing, and the run refuses to read
 * forces from a set that has diverged.
 */
function publish(quads: readonly number[], columns: readonly number[], compression: number) {
  const stresses: QuadStress[] = quads.map((q) => ({
    elementId: q, sigmaXx: 0, sigmaYy: 0, tauXy: 0,
    mx: 34, my: 28, mxy: 6, vonMises: 0,
  }));
  const res = (scale: number) => ({
    displacements: [], reactions: [], quadStresses: stresses,
    elementForces: columns.map((c) => columnForces(c, -compression * scale)),
  }) as never;
  resultsStore.setCombinationResults3D(
    new Map(modelStore.model.loadCases.map((c) => [c.id, res(1)])),
    new Map(modelStore.model.combinations.map((c, i) => [c.id, res(1 - i * 0.15)])),
    {} as never,
  );
}

function designAndDocument(): DocumentModel {
  detailingStore.generateFloors();
  const doc = detailingStore.buildDocument({
    author: 'Bauti', at: '2026-07-28T12:00:00Z',
  });
  expect(doc, 'the production document builder must produce a document').not.toBeNull();
  return doc!;
}

/** The SHIPPED dictionaries, so a missing translation cannot pass unnoticed. */
function translator(locale: 'en' | 'es') {
  const dict: Record<string, string> = locale === 'es' ? es : en;
  return (key: string, params?: Record<string, unknown>) => {
    const raw = dict[key];
    if (raw === undefined) return key;
    return raw.replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? `{${k}}`));
  };
}

/** Every slab record on every persisted floor assembly. */
function slabRecords() {
  return (modelStore.model.detailing?.assemblies ?? [])
    .flatMap((a) => a.families ?? [])
    .filter((r) => r.family === 'slab');
}

/** Every punching joint across every persisted slab record. */
function allJoints() {
  return slabRecords().flatMap((r) => (r.family === 'slab' ? r.punching : []));
}

describe('the collector reaches the persisted record', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('verifies punching at every joint of a solved flat plate', () => {
    const { quads, columns } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    detailingStore.generateFloors();

    const joints = allJoints();
    // Four panels × four corners each, so nine distinct nodes appear as sixteen panel joints.
    expect(joints.length).toBe(16);
    for (const p of joints) {
      expect(p.status, `joint ${p.nodeId}`).not.toBe('UNSUPPORTED');
      expect(p.Vu).toBeGreaterThan(0);
      expect(p.phiVc).toBeGreaterThan(0);
      expect(p.perimeter!.bo).toBeGreaterThan(0);
      expect(p.governingCombination).toBeTruthy();
      // The free body closed for the governing combination.
      expect(Math.abs(p.equilibriumResidual!)).toBeLessThan(1e-6);
    }
  });

  it('classifies interior, edge and corner from the mesh, not from the panel', () => {
    const { quads, columns, top, centreNode } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    detailingStore.generateFloors();

    const byNode = new Map(allJoints().map((p) => [p.nodeId, p]));
    // Four panels meet the centre: interior, 360°, nothing truncated.
    expect(byNode.get(centreNode)!.position).toBe('interior');
    expect(byNode.get(centreNode)!.coverageDeg).toBeCloseTo(360, 3);
    expect(byNode.get(centreNode)!.truncatedSides).toBe(0);
    // Two panels meet an edge midpoint: edge, 180°, one side truncated.
    expect(byNode.get(top[1][0])!.position).toBe('edge');
    expect(byNode.get(top[1][0])!.truncatedSides).toBe(1);
    // One panel meets a plan corner: corner, 90°, two sides truncated.
    expect(byNode.get(top[0][0])!.position).toBe('corner');
    expect(byNode.get(top[0][0])!.truncatedSides).toBe(2);

    // And the classification changes the capacity, which is the reason it must be measured:
    // the same demand at an interior and a corner joint are not the same check.
    expect(byNode.get(top[0][0])!.phiVc)
      .toBeLessThan(byNode.get(centreNode)!.phiVc);
  });

  it('certifies the panel on a punching check it actually ran', () => {
    const { quads, columns } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    detailingStore.generateFloors();

    for (const r of slabRecords()) {
      const check = r.checks.find((c) => c.key === 'punching');
      expect(check, `${r.ownerId} must carry a punching check`).toBeTruthy();
      expect(check!.status).not.toBe('UNSUPPORTED');
      expect(check!.utilization).not.toBeNull();
      expect(r.certificate.status).toBe('CERTIFIED');
    }
  });

  it('reads the force at the column end that meets the joint, compression positive', () => {
    const { quads, columns } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    detailingStore.generateFloors();

    for (const p of allJoints()) {
      // 260 kN of compression was published as −260 with tension positive. A collector that
      // forgot the negation would report −260 and a step of 260 in the wrong direction; one
      // that read the far end would be off by the column's own weight.
      expect(p.axialBelow).toBeCloseTo(260, 6);
      // Every column here stops at the slab, so there is nothing above — a real storey
      // boundary, recorded as an open free-body face rather than as a zero force.
      expect(p.elementAbove).toBeNull();
      expect(p.elementBelow).toBe(p.columnElementId);
    }
  });

  it('is deterministic: two runs of the same model give the same joints in the same order', () => {
    const { quads, columns } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    detailingStore.generateFloors();
    const first = allJoints().map((p) => `${p.nodeId}:${p.position}:${p.Vu.toFixed(6)}`);
    detailingStore.generateFloors();
    const second = allJoints().map((p) => `${p.nodeId}:${p.position}:${p.Vu.toFixed(6)}`);
    expect(second).toEqual(first);
  });
});

describe('the evidence reaches the document and the exports', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  for (const locale of ['en', 'es'] as const) {
    it(`prints the punching free body in the ${locale} report`, () => {
      const { quads, columns } = buildFlatPlate();
      for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
      publish(quads, columns, 260);
      const doc = designAndDocument();
      const html = renderReportHtml(
        doc, { projectName: 'QA', locale }, translator(locale));

      // The heading exists in the reader's language.
      expect(html).toContain(locale === 'es' ? 'Punzonado losa-columna' : 'Slab-column punching');
      // The axial force the demand was derived from, not only the demand.
      expect(html).toContain('260.0');
      // The three positions the mesh produces, in this locale's own words — not the raw
      // TypeScript union member, which is how a Spanish report came to say "edge".
      expect(html).toContain('interior');
      expect(html).toContain(locale === 'es' ? 'de borde' : 'edge');
      expect(html).toContain(locale === 'es' ? 'de esquina' : 'corner');
      // A governing combination is named, and the combinations that lost are printed too.
      expect(html).toContain(locale === 'es'
        ? 'combinaciones consideradas' : 'combinations considered');
      expect(html).toContain('★');
      // No raw i18n key survives into the report.
      expect(html).not.toMatch(/detailing\.slabPunching\./);
    });

    it(`carries the punching block in the ${locale} spreadsheet`, () => {
      const { quads, columns } = buildFlatPlate();
      for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
      publish(quads, columns, 260);
      const doc = designAndDocument();
      const sheets = renderSchedule(doc, { projectName: 'QA', locale });

      const rows = sheets.flatMap((s) => s.aoa);
      const header = rows.find((r) => r[0] === (locale === 'es'
        ? 'PUNZONADO LOSA-COLUMNA' : 'SLAB-COLUMN PUNCHING'));
      expect(header, 'the punching block must exist').toBeTruthy();

      // A data row carrying real numbers, not a header with nothing under it.
      const dataRows = rows.filter((r) => typeof r[0] === 'string'
        && r[0].startsWith('P') && r.includes('interior'));
      expect(dataRows.length).toBeGreaterThan(0);
      const row = dataRows[0];
      // The axial force, as a NUMBER — a spreadsheet reader sums these.
      expect(row.some((c) => typeof c === 'number' && Math.abs(c - 260) < 1e-6)).toBe(true);
    });
  }

  it('prints an em dash rather than a zero for a joint it could not verify', () => {
    // Shell stresses but no element forces: the joints apply and cannot be checked.
    const { quads } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10);
    resultsStore.setResults3D({
      displacements: [], reactions: [], elementForces: [],
      quadStresses: quads.map((q) => ({
        elementId: q, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 34, my: 28, mxy: 6, vonMises: 0,
      })),
    });
    const doc = designAndDocument();

    for (const p of allJoints()) expect(p.status).toBe('UNSUPPORTED');

    const html = renderReportHtml(doc, { projectName: 'QA', locale: 'en' }, translator('en'));
    expect(html).toContain('Slab-column punching');
    // The reason is on the face of the document, in English, not as a key.
    expect(html).toContain('no solved combination carries a column axial force');
    expect(html).not.toMatch(/detailing\.slabPunching\./);

    // And the spreadsheet leaves the cells BLANK. A 0 would read as a demand somebody
    // measured and found to be nothing.
    const rows = renderSchedule(doc, { projectName: 'QA', locale: 'en' })
      .flatMap((s) => s.aoa);
    const idx = rows.findIndex((r) => r[0] === 'SLAB-COLUMN PUNCHING');
    expect(idx).toBeGreaterThan(-1);
    const data = rows[idx + 2];
    expect(data.includes('UNSUPPORTED')).toBe(true);
    // The Vu column is the 15th; blank, not 0.
    expect(data[14]).toBe('');
  });

  it('a regenerated document carries the punching evidence again', () => {
    const { quads, columns } = buildFlatPlate();
    for (const q of quads) modelStore.addSurfaceLoad3D(q, 10, 1);
    publish(quads, columns, 260);
    const first = designAndDocument();
    expect(first.revision.number).toBeGreaterThan(0);

    // A heavier plate: the same joints, a larger demand, a new revision.
    publish(quads, columns, 400);
    const second = designAndDocument();
    const joints = allJoints();
    expect(joints.length).toBe(16);
    for (const p of joints) expect(p.axialBelow).toBeCloseTo(400, 6);
    expect(second.revision.number).toBeGreaterThanOrEqual(first.revision.number);
  });
});
