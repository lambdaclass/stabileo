/**
 * Slab plans and wall drawings, from a solved model to the DXF, through production only.
 *
 * ── What this file exists to prove ─────────────────────────────────
 *
 * A footing has had its own plan and two sections since the family records landed. A slab and
 * a wall reached the DXF only through the GENERIC elevation, which frames any assembly by its
 * longest bar — in a coordinated floor that can be a wall vertical or a footing dowel, so the
 * plan a slab needs and the elevation a wall needs did not exist at all. A reader holding the
 * footing's three sheets could reasonably assume every family had them.
 *
 * So this file drives `renderDrawings` from the production document builder over a model built
 * through `modelStore`'s own API, and asserts the sheets contain real geometry, real bars, the
 * right layers, the schedule's own marks, and the punching perimeters — and that the plan, the
 * report and the spreadsheet agree about all three.
 *
 * A sheet that renders and contains nothing passes a smoke test and fails an engineer, so
 * every assertion here names a value or a count that must be there.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import { LAYERS } from '../../engine/detailing/drawings';
import { controlPerimeter } from '../../engine/detailing/slab-wall-drawings';
import {
  renderDrawings, renderReportHtml, renderSchedule,
} from '../../engine/detailing/document-render';
import type { DocumentModel } from '../../engine/detailing/document-model';
import type { ElementForces3D, QuadStress } from '../../engine/types-3d';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';

/**
 * A floor with a slab AND a wall, so one document exercises both new sheet families.
 *
 * The wall runs along +y rather than +x on purpose: a wall projected onto global x would
 * collapse to zero width, which is the same class of error as framing a footing by its longest
 * bar. Drawing it in its own plane is what the elevation has to get right.
 */
function buildFloor() {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();

  const sectionId = modelStore.addSection({
    name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4,
  });
  const material = [...modelStore.model.materials.keys()][0];

  // Slab corners at +3,00 on four columns.
  const coords = [[0, 0], [5, 0], [5, 5], [0, 5]] as const;
  const top: number[] = [];
  const columns: number[] = [];
  for (const [x, y] of coords) {
    const base = modelStore.addNode(x, y, 0);
    const head = modelStore.addNode(x, y, 3);
    modelStore.addSupport(base, 'fixed3d');
    const col = modelStore.addElement(base, head, 'frame');
    modelStore.updateElementSection(col, sectionId);
    columns.push(col);
    top.push(head);
  }
  const slab = modelStore.addQuad([top[0], top[1], top[2], top[3]], material, 0.22);

  // A wall in the y-z plane at x = 0, from 0,00 to +3,00, running 5 m along y.
  const wallBase = [
    modelStore.addNode(0, 0, 0),
    modelStore.addNode(0, 5, 0),
  ];
  const wall = modelStore.addQuad(
    [wallBase[0], wallBase[1], top[3], top[0]], material, 0.30);

  return { slab, wall, columns, top };
}

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

function publish(slab: number, wall: number, columns: readonly number[]) {
  const stresses: QuadStress[] = [
    { elementId: slab, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 34, my: 28, mxy: 6, vonMises: 0 },
    // A wall carries membrane work: vertical compression and in-plane shear.
    {
      elementId: wall, sigmaXx: -1200, sigmaYy: -3000, tauXy: 420,
      mx: 0, my: 0, mxy: 0, vonMises: 0,
    },
  ];
  const res = (scale: number) => ({
    displacements: [], reactions: [], quadStresses: stresses,
    elementForces: columns.map((c) => columnForces(c, -240 * scale)),
  }) as never;
  resultsStore.setCombinationResults3D(
    new Map(modelStore.model.loadCases.map((c) => [c.id, res(1)])),
    new Map(modelStore.model.combinations.map((c, i) => [c.id, res(1 - i * 0.12)])),
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

function translator(locale: 'en' | 'es') {
  const dict: Record<string, string> = locale === 'es' ? es : en;
  return (key: string, params?: Record<string, unknown>) => {
    const raw = dict[key];
    if (raw === undefined) return key;
    return raw.replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? `{${k}}`));
  };
}

/**
 * The sheet for one family, found by the family id in its NAME.
 *
 * Not by suffix alone: `renderDrawings` also emits a generic `<assembly>-elevation` and
 * `<assembly>-section` per assembly, framed by the floor's longest bar. Matching on the suffix
 * picked those up — which is how a test can assert a wall is 5 m long and be handed the
 * bounding box of the whole floor's steel instead.
 */
function familySheet(
  set: { sheets: Array<{ name: string; sheet: unknown; dxf: string }> },
  ownerId: string, kind: string,
) {
  const hit = set.sheets.find((s) => s.name.includes(`-${ownerId}-`) && s.name.endsWith(kind));
  if (!hit) throw new Error(`no ${kind} sheet for ${ownerId} in ${set.sheets.map((s) => s.name).join(', ')}`);
  return hit as { name: string; sheet: import('../../engine/detailing/drawings').Sheet; dxf: string };
}

/** Count DXF entities on a given layer. */
function onLayer(dxf: string, layer: string): number {
  return dxf.split('\n').filter((l, i, a) => a[i - 1] === '8' && l === layer).length;
}

function draw(doc: DocumentModel) {
  return renderDrawings(doc, { projectName: 'QA', locale: 'en' });
}

describe('the slab gets a plan of its own', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('issues one plan per slab panel, named for the panel', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());

    const plans = set.sheets.filter((s) => s.name.endsWith('-plan') && s.name.includes('P'));
    expect(plans.length).toBeGreaterThan(0);
    // Not an empty sheet: real geometry, real steel.
    for (const p of plans) {
      expect(p.sheet.polylines.length).toBeGreaterThan(2);
      expect(p.sheet.kind).toBe('floorPlan');
    }
  });

  it('draws the panel at its REAL plan dimensions, from the record', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const plan = familySheet(set, `P${slab}`, '-plan');

    // The 5 × 5 m panel, not a bounding box around whatever the longest bar happened to be.
    const outline = plan.sheet.polylines.find((p) => p.layer === LAYERS.outline && p.closed)!;
    const xs = outline.points.map((p) => p.x);
    const ys = outline.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 6);
    // And the dimensions state it in millimetres.
    expect(plan.sheet.dimensions.map((d) => d.label)).toContain('lx = 5000');
    expect(plan.sheet.dimensions.map((d) => d.label)).toContain('ly = 5000');
  });

  it('draws real bars in both faces and both directions, from the BarPaths', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const plan = familySheet(set, `P${slab}`, '-plan');

    const bars = plan.sheet.polylines.filter((p) => p.layer === LAYERS.bar);
    // A 5 m panel with two mats in two directions is many bars, not a token few.
    expect(bars.length).toBeGreaterThan(20);
    // Both directions really run: some bars vary in x, some in y.
    const runsX = bars.filter((b) => Math.abs(b.points[0].x - b.points[b.points.length - 1].x) > 1);
    const runsY = bars.filter((b) => Math.abs(b.points[0].y - b.points[b.points.length - 1].y) > 1);
    expect(runsX.length).toBeGreaterThan(0);
    expect(runsY.length).toBeGreaterThan(0);

    // The marks are the SCHEDULE's marks, and each carries its face — a slab plan shows both
    // mats and a mark with no face is ambiguous on the question a placer asks.
    const markTexts = plan.sheet.texts.filter((t) => t.layer === LAYERS.mark);
    expect(markTexts.length).toBeGreaterThan(0);
    expect(markTexts.some((t) => / sup$/.test(t.text))).toBe(true);
    expect(markTexts.some((t) => / inf$/.test(t.text))).toBe(true);
  });

  it('draws the punching control perimeters on their OWN layer, with the status', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const plan = familySheet(set, `P${slab}`, '-plan');

    const perimeters = plan.sheet.polylines.filter((p) => p.layer === LAYERS.punching);
    // One per column the panel supports.
    expect(perimeters.length).toBe(4);
    // And a verdict beside each: a perimeter with no status is a line a reader must look up.
    const status = plan.sheet.texts.filter((t) => t.layer === LAYERS.punching);
    expect(status.length).toBe(4);
    expect(status.every((t) => /OK|FAIL|UNSUPPORTED/.test(t.text))).toBe(true);

    // The perimeter sits at d/2 from the column face, so it is LARGER than the column and
    // centred on the joint. Drawn on the wrong scale it would look like a check that was run
    // on a different section.
    const columnBoxes = plan.sheet.polylines.filter(
      (p) => p.layer === LAYERS.outline && p.closed && p.points.length === 4
        && Math.abs(p.points[1].x - p.points[0].x) < 1);
    expect(columnBoxes.length).toBeGreaterThan(0);
    const perWidth = Math.max(...perimeters[0].points.map((p) => p.x))
      - Math.min(...perimeters[0].points.map((p) => p.x));
    expect(perWidth).toBeGreaterThan(0.4);
  });

  it('states the reinforcement regions with their spacing on the face of the sheet', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const plan = familySheet(set, `P${slab}`, '-plan');
    const notes = plan.sheet.texts.filter((t) => t.layer === LAYERS.text).map((t) => t.text);
    // Face, direction, diameter, spacing and the governing rule — what a placer needs.
    expect(notes.some((n) => /^(top|bottom) [xy]: Ø\d+ c\/\d+/.test(n))).toBe(true);
    expect(notes.some((n) => /mm²\/m/.test(n))).toBe(true);
  });

  it('carries maturity, certificate and revision in the notes, as KEYS', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const plan = familySheet(set, `P${slab}`, '-plan');
    const notes = plan.sheet.notes;
    expect(notes.some((x) => x.startsWith('maturity:'))).toBe(true);
    expect(notes.some((x) => x.startsWith('certificate:'))).toBe(true);
    expect(notes.some((x) => x.startsWith('revision.analysis:'))).toBe(true);
    // Openings are a deliberately unsupported condition, so their absence is STATED rather
    // than left as a blank a reader might take for "no openings here".
    expect(notes.some((x) => x.startsWith('openings:'))).toBe(true);
  });

  it('emits DXF on the right layers, deterministically, and never an empty sheet', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const doc = designAndDocument();
    const plan = familySheet(draw(doc), `P${slab}`, '-plan');

    expect(plan.dxf).toContain('AC1009');
    expect(onLayer(plan.dxf, LAYERS.outline)).toBeGreaterThan(0);
    expect(onLayer(plan.dxf, LAYERS.bar)).toBeGreaterThan(0);
    expect(onLayer(plan.dxf, LAYERS.punching)).toBeGreaterThan(0);
    expect(onLayer(plan.dxf, LAYERS.mark)).toBeGreaterThan(0);
    expect(onLayer(plan.dxf, LAYERS.dim)).toBeGreaterThan(0);

    // Byte-for-byte identical on a second render of the SAME document. Re-issuing the document
    // would bump its revision, and the revision is part of the sheet number by design — so
    // that would compare two sheets rather than one renderer against itself.
    expect(familySheet(draw(doc), `P${slab}`, '-plan').dxf).toBe(plan.dxf);
  });
});

describe('the wall gets an elevation and a section', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('issues both sheets per wall', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    // The wall's OWN sheets, not the generic per-assembly elevation and section.
    expect(familySheet(set, `W${wall}`, '-elevation')).toBeTruthy();
    expect(familySheet(set, `W${wall}`, '-section')).toBeTruthy();
  });

  it('draws the elevation at TRUE LENGTH, in the wall\'s own plane', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const elev = familySheet(set, `W${wall}`, '-elevation');

    const outline = elev.sheet.polylines.find((p) => p.layer === LAYERS.outline && p.closed)!;
    const xs = outline.points.map((p) => p.x);
    const ys = outline.points.map((p) => p.y);
    // This wall runs along +y, so a projection onto global x would give it zero width. The
    // in-plane axis is the wall's own direction, so it comes out 5 m long and 3 m high.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 3);
    expect(elev.sheet.dimensions.map((d) => d.label)).toContain('L = 5000');
    expect(elev.sheet.dimensions.map((d) => d.label)).toContain('H = 3000');
  });

  it('draws both curtains as real bars, each mark naming its direction', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const elev = familySheet(set, `W${wall}`, '-elevation');

    const bars = elev.sheet.polylines.filter((p) => p.layer === LAYERS.bar);
    expect(bars.length).toBeGreaterThan(5);
    const marks = elev.sheet.texts.filter((t) => t.layer === LAYERS.mark);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((t) => /vert|horiz/.test(t.text))).toBe(true);

    // The designed curtains are stated on the sheet: what the placer has to reproduce.
    const notes = elev.sheet.texts.filter((t) => t.layer === LAYERS.text).map((t) => t.text);
    expect(notes.some((n) => /^vert: Ø\d+ c\/\d+/.test(n))).toBe(true);
    expect(notes.some((n) => /^horiz: Ø\d+ c\/\d+/.test(n))).toBe(true);
    expect(notes.some((n) => /cortina/.test(n))).toBe(true);
  });

  it('does not fabricate a boundary element it did not design', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const elev = familySheet(set, `W${wall}`, '-elevation');
    // Exactly one of the four boundary states, stated as a key. A zone drawn with no
    // reinforcement in it would look like a designed boundary element, which is 103-II work.
    const states = elev.sheet.notes.filter((x) => x.startsWith('boundary:'));
    expect(states).toHaveLength(1);
    expect(['boundary:designed', 'boundary:requiredNotImplemented',
      'boundary:notRequired', 'boundary:notAsked'])
      .toContain(states[0].split(':').slice(0, 2).join(':'));
  });

  it('the section shows the thickness, the cover and how many bars cross the cut', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const set = draw(designAndDocument());
    const sec = familySheet(set, `W${wall}`, '-section');

    const outline = sec.sheet.polylines.find((p) => p.layer === LAYERS.outline && p.closed)!;
    const ys = outline.points.map((p) => p.y);
    // The 300 mm thickness, drawn through the wall rather than along it.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.30, 6);
    expect(sec.sheet.dimensions.map((d) => d.label)).toContain('e = 300');
    // How many bars really reach this elevation, measured — so an empty section says so
    // instead of looking like a wall with no steel.
    const crossing = sec.sheet.notes.find((x) => x.startsWith('section.barsCrossing:'))!;
    expect(crossing).toBeTruthy();
    expect(Number(crossing.split(':')[1])).toBeGreaterThan(0);
    expect(sec.sheet.notes).not.toContain('section.noBarsAtCut');
  });

  it('emits wall DXF on the right layers and deterministically', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const doc = designAndDocument();
    for (const kind of ['-elevation', '-section'] as const) {
      const s1 = familySheet(draw(doc), `W${wall}`, kind);
      const s2 = familySheet(draw(doc), `W${wall}`, kind);
      expect(onLayer(s1.dxf, LAYERS.outline)).toBeGreaterThan(0);
      expect(onLayer(s1.dxf, LAYERS.bar)).toBeGreaterThan(0);
      expect(s2.dxf).toBe(s1.dxf);
    }
  });
});

describe('the plan, the report and the schedule agree', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('plan marks are schedule marks — the same set, not a parallel numbering', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const doc = designAndDocument();
    const set = draw(doc);

    // Every mark the schedule lists, per assembly.
    const scheduled = new Set(
      doc.assemblies.flatMap((a) => a.source.marks.map((m) => m.mark)));
    expect(scheduled.size).toBeGreaterThan(0);

    for (const [owner, kind] of [[`P${slab}`, '-plan'], [`W${wall}`, '-elevation']] as const) {
      const sheet = familySheet(set, owner, kind);
      const drawn = sheet.sheet.texts
        .filter((t) => t.layer === LAYERS.mark)
        // The face / direction suffix the sheet appends is not part of the mark.
        .map((t) => t.text.split(' ')[0]);
      expect(drawn.length).toBeGreaterThan(0);
      for (const m of drawn) {
        expect(scheduled.has(m), `${owner}${kind} drew mark ${m}, not in the schedule`)
          .toBe(true);
      }
    }
  });

  it('the punching perimeter the plan draws is the one the report and XLSX report', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const doc = designAndDocument();
    const set = draw(doc);
    const plan = familySheet(set, `P${slab}`, '-plan');

    const rec = doc.assemblies.flatMap((a) => a.families)
      .find((r) => r.family === 'slab')!;
    if (rec.family !== 'slab') throw new Error('narrowing');
    const joint = rec.punching[0];
    const per = joint.perimeter!;

    // The polyline the plan drew, at the joint's own position, spans 2·halfX.
    const drawn = plan.sheet.polylines.filter((p) => p.layer === LAYERS.punching);
    const widths = drawn.map((p) =>
      Math.max(...p.points.map((q) => q.x)) - Math.min(...p.points.map((q) => q.x)));
    expect(widths.some((w) => Math.abs(w - 2 * per.halfX) < 1e-6)).toBe(true);

    // The report prints the SAME bo, and the spreadsheet carries it as a number.
    const html = renderReportHtml(doc, { projectName: 'QA', locale: 'en' }, translator('en'));
    expect(html).toContain(per.bo.toFixed(3));

    const rows = renderSchedule(doc, { projectName: 'QA', locale: 'en' })
      .flatMap((s) => s.aoa);
    const idx = rows.findIndex((r) => r[0] === 'SLAB-COLUMN PUNCHING');
    const data = rows.slice(idx + 2, idx + 2 + rec.punching.length);
    expect(data.some((r) => r.some(
      (c) => typeof c === 'number' && Math.abs(c - per.bo) < 1e-9))).toBe(true);
  });

  it('the bars the plan draws are the record\'s own, and only those', () => {
    const { slab, wall, columns } = buildFloor();
    modelStore.addSurfaceLoad3D(slab, 10, 1);
    publish(slab, wall, columns);
    const doc = designAndDocument();
    const set = draw(doc);

    const rec = doc.assemblies.flatMap((a) => a.families)
      .find((r) => r.family === 'slab')!;
    const assembly = doc.assemblies.find((a) => a.families.includes(rec))!;
    const own = new Set(rec.barIds);
    expect(own.size).toBeGreaterThan(0);

    // A wall bar drawn inside the slab outline would be this sheet drawing another family's
    // steel — the failure the per-record bar filter exists to prevent.
    const wallRec = doc.assemblies.flatMap((a) => a.families)
      .find((r) => r.family === 'wall');
    if (wallRec) {
      for (const id of wallRec.barIds) expect(own.has(id)).toBe(false);
    }

    // And every id the record claims really exists in the assembly's cage.
    const inCage = new Set(assembly.source.bars.map((b) => b.id));
    for (const id of rec.barIds) expect(inCage.has(id), id).toBe(true);

    // The plan drew exactly as many bar entities as the record owns bars — one polyline for a
    // bar running in plan, one circle for a bar standing vertically. Fewer would mean the sheet
    // dropped steel; more would mean it drew a neighbour's.
    const plan = familySheet(set, `P${slab}`, '-plan');
    const drawnBars = plan.sheet.polylines.filter((p) => p.layer === LAYERS.bar).length
      + plan.sheet.circles.filter((c) => c.layer === LAYERS.bar).length
      + plan.sheet.polylines.filter((p) => p.layer === LAYERS.stirrup).length
      + plan.sheet.circles.filter((c) => c.layer === LAYERS.stirrup).length;
    expect(drawnBars).toBe(rec.barIds.length);
  });
});

describe('the control perimeter is truncated on the correct side', () => {
  const at = { x: 0, y: 0 };

  it('closes all four sides for an interior joint', () => {
    const p = controlPerimeter(at, 0.3, 0.3, 'interior', null);
    expect(p).toHaveLength(4);
  });

  it('drops the side facing the free edge for an EDGE joint', () => {
    // Free edge to the north: the perimeter runs along the other three sides, so no point
    // pair spans the north face as a closed run. The retained span is the south side.
    const north = controlPerimeter(at, 0.3, 0.3, 'edge', 90);
    expect(north).toHaveLength(4);
    expect(north[0].y).toBeCloseTo(0.3, 9);
    expect(north[north.length - 1].y).toBeCloseTo(0.3, 9);
    // The two interior points are the far side — the perimeter goes round the slab side.
    expect(north[1].y).toBeCloseTo(-0.3, 9);
    expect(north[2].y).toBeCloseTo(-0.3, 9);

    // And to the east it is a different three sides, not the same polyline rotated wrongly.
    const east = controlPerimeter(at, 0.3, 0.3, 'edge', 0);
    expect(east[0].x).toBeCloseTo(0.3, 9);
    expect(east[1].x).toBeCloseTo(-0.3, 9);
  });

  it('keeps two adjacent sides for a CORNER joint, away from the open quadrant', () => {
    const p = controlPerimeter(at, 0.3, 0.3, 'corner', 45);
    expect(p).toHaveLength(3);
    // The open quadrant faces north-east, so the retained corner is the south-west one.
    expect(p.some((q) => Math.abs(q.x + 0.3) < 1e-9 && Math.abs(q.y + 0.3) < 1e-9)).toBe(true);
  });

  it('falls back to the closed rectangle when no bearing was measured', () => {
    // A truncated position with no free-edge bearing cannot place the opening, so the closed
    // perimeter is drawn rather than a truncation guessed onto an arbitrary side.
    expect(controlPerimeter(at, 0.3, 0.3, 'edge', null)).toHaveLength(4);
  });
});
